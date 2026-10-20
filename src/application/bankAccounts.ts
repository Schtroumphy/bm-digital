import { canLinkAccount, CASH_ACCOUNT_ID, isSavingsWithdrawalAllowed, mainAccount, nextBankHue } from '../domain/bank';
import { currentMonthKey } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData, MonthKey, TransferTarget } from '../domain/types';

/*
 * Use cases on bank accounts. Each one changes the data it is given and
 * returns false (changing nothing) when a rule forbids it.
 */

const find = (d: BudgetData, id: string) => d.accounts.find(a => a.id === id);

/** Adds an account: next palette colour, opening month = first month of the budget (RG6, RG7, RG16bis). */
export function addBankAccount(d: BudgetData, id: string, name = 'Nouveau compte') {
  d.accounts.push({
    id,
    name,
    hue: nextBankHue(d.accounts),
    isDefault: false,
    openingBalance: 0,
    openingMonth: d.firstMonth ?? currentMonthKey(),
    inBudget: true,
    archived: false,
  });
}

/** An empty name is refused. */
export function renameBankAccount(d: BudgetData, id: string, name: string): boolean {
  const a = find(d, id);
  if (!a || !name.trim()) return false;
  a.name = name.trim();
  return true;
}

export function setBankAccountHue(d: BudgetData, id: string, hue: number) {
  const a = find(d, id);
  if (a) a.hue = hue;
}

/**
 * Makes an account the main one (RG2). Operations that had no account were
 * on the old main account: they are pinned to it first, so they stay there.
 */
export function setMainBankAccount(d: BudgetData, id: string): boolean {
  const next = find(d, id);
  if (!next || next.archived) return false;
  const old = mainAccount(d);
  if (old.id === id) return true;
  for (const l of d.template.lines) l.accountId ??= old.id;
  for (const md of Object.values(d.months)) for (const l of md.lines) l.accountId ??= old.id;
  for (const t of d.transactions) t.accountId ??= old.id;
  for (const a of d.accounts) a.isDefault = a.id === id;
  return true;
}

/**
 * Changes « Compte dans le budget du mois ». The budget figures follow it on the fly; the actual of the
 * variable lines does not depend on it (spec 0008, RG3).
 */
export function setBankAccountInBudget(d: BudgetData, id: string, inBudget: boolean) {
  const a = find(d, id);
  if (!a) return;
  a.inBudget = inBudget;
}

/** Sets the opening balance and/or month. Entering a balance, even 0, confirms it (RG29). */
export function setBankAccountOpening(d: BudgetData, id: string, patch: { balance?: number; month?: MonthKey }) {
  const a = find(d, id);
  if (!a) return;
  if (patch.balance !== undefined) a.openingBalance = patch.balance;
  if (patch.month !== undefined) a.openingMonth = patch.month;
  a.openingConfirmed = true;
}

/** Why an account cannot be archived, or null when it can (RG3, RG4). */
export function archiveBlocker(d: BudgetData, id: string): 'main' | 'cash' | null {
  if (id === CASH_ACCOUNT_ID) return 'cash';
  return find(d, id)?.isDefault ? 'main' : null;
}

/** Archives an account: hidden from the input lists, history kept (RG5). The UI warns first when its balance is not 0. */
export function archiveBankAccount(d: BudgetData, id: string): boolean {
  const a = find(d, id);
  if (!a || archiveBlocker(d, id)) return false;
  a.archived = true;
  return true;
}

export function unarchiveBankAccount(d: BudgetData, id: string) {
  const a = find(d, id);
  if (a) a.archived = false;
}

/** Marks the opening balances of the main account and « Espèces » as seen, which hides the reminder banner. */
export function confirmOpeningBalances(d: BudgetData) {
  for (const a of d.accounts) if (a.isDefault || a.id === CASH_ACCOUNT_ID) a.openingConfirmed = true;
}

/** True while the reminder banner is due: main account or Espèces at 0 and never confirmed (RG29). */
export const needsOpeningBalances = (d: BudgetData): boolean =>
  d.accounts.some(a => (a.isDefault || a.id === CASH_ACCOUNT_ID) && a.openingBalance === 0 && !a.openingConfirmed);

/**
 * Moves a budget line to another account. The line keeps it in the months created from it later.
 * A savings/investment line cannot be paid from its own dedicated account (spec 0007, RG2).
 */
export function setLineAccount(d: BudgetData, m: MonthKey, key: string, accountId: string): boolean {
  if (isMonthLocked(d, m)) return false;
  const l = d.months[m]?.lines.find(x => x.key === key);
  if (!l || (l.linkedAccountId && l.linkedAccountId === accountId)) return false;
  l.accountId = accountId;
  return true;
}

/**
 * Ties a savings/investment line to the bank account that receives its payments, or removes the tie with
 * `undefined` (spec 0007, RG1 to RG5). Applies to the month and to the budget model. Refused (false) on a
 * locked month, an unknown line, a line that is not epa/inv, or an account that is unknown, archived or the line's source.
 */
export function setLineLinkedAccount(d: BudgetData, m: MonthKey, key: string, accountId: string | undefined): boolean {
  if (isMonthLocked(d, m)) return false;
  const l = d.months[m]?.lines.find(x => x.key === key);
  if (!l || (l.block !== 'epa' && l.block !== 'inv')) return false;
  if (accountId !== undefined && !canLinkAccount(d, l, accountId)) return false;
  const apply = (line: { linkedAccountId?: string }) => {
    if (accountId === undefined) delete line.linkedAccountId;
    else line.linkedAccountId = accountId;
  };
  apply(l);
  const model = d.template.lines.find(x => x.key === key);
  if (model) apply(model);
  return true;
}

/** Changes the account of a transaction; the actual of a variable line does not change (spec 0008, RG2). */
export function setTransactionAccount(d: BudgetData, id: string, accountId: string): boolean {
  const t = d.transactions.find(x => x.id === id);
  if (!t || isMonthLocked(d, t.month) || !isSavingsWithdrawalAllowed(d, { ...t, accountId })) return false;
  t.accountId = accountId;
  return true;
}

/** Transfers are not tied to a month: `m` is the month being viewed, whose lock protects the change. */
export function setTransferSource(d: BudgetData, m: MonthKey, id: string, fromAccountId: string): boolean {
  const t = d.transfers.find(x => x.id === id);
  if (!t || isMonthLocked(d, m)) return false;
  t.fromAccountId = fromAccountId;
  return true;
}

/** Sets where a transfer goes, or `undefined` to make it informative only (RG12). */
export function setTransferTarget(d: BudgetData, m: MonthKey, id: string, to: TransferTarget | undefined): boolean {
  const t = d.transfers.find(x => x.id === id);
  if (!t || isMonthLocked(d, m)) return false;
  if (to) t.to = to;
  else delete t.to;
  return true;
}

/** Ticks or unticks a transfer as « fait » for a month. Refused (false) on a locked or non-initialized month. */
export function setTransferDone(d: BudgetData, m: MonthKey, id: string, done: boolean): boolean {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m) || !d.transfers.some(t => t.id === id)) return false;
  md.transfersDone[id] = done;
  return true;
}
