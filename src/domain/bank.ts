import { compareMonths, currentMonthKey } from './format';
import type { AccountKind, BankAccount, BudgetData, Envelope, Line, MonthKey, PaymentSetting, Transaction } from './types';

/*
 * Bank accounts: helpers shared by the Ledger, the budget figures and the use cases.
 * (« Savings accounts » are the epa/inv lines, see ledger.ts. They are another notion.)
 */

/** Ids of the two accounts that always exist. */
export const MAIN_ACCOUNT_ID = 'acc-main';
export const CASH_ACCOUNT_ID = 'acc-cash';

/** Palette handed out to new accounts, in order. */
export const BANK_HUES = [250, 150, 30, 330, 200, 100, 60, 290] as const;

/** Blocks whose lines belong to a bank account and leave the budget with it when the account is out of budget. */
const ACCOUNT_BLOCKS = ['rev', 'fix', 'cre'];

/** The account every new budget starts with: the main account and « Espèces ». */
export function defaultBankAccounts(openingMonth: MonthKey = currentMonthKey()): BankAccount[] {
  const base = { openingBalance: 0, openingMonth, inBudget: true, archived: false };
  return [
    { id: MAIN_ACCOUNT_ID, name: 'Compte principal', hue: BANK_HUES[0], isDefault: true, ...base },
    { id: CASH_ACCOUNT_ID, name: 'Espèces', hue: BANK_HUES[1], isDefault: false, ...base },
  ];
}

/** First palette hue not used yet, else the palette cycles. */
export function nextBankHue(accounts: BankAccount[]): number {
  return BANK_HUES.find(h => !accounts.some(a => a.hue === h)) ?? BANK_HUES[accounts.length % BANK_HUES.length];
}

export const mainAccount = (d: BudgetData): BankAccount => d.accounts.find(a => a.isDefault) ?? d.accounts[0];

/** The account of an operation: its own, or the main account when it has none. */
export const accountIdOf = (d: BudgetData, accountId?: string): string => accountId ?? mainAccount(d).id;

export const bankAccount = (d: BudgetData, id?: string): BankAccount | undefined => d.accounts.find(a => a.id === accountIdOf(d, id));

/** True when the operation goes through the main account (no account of its own, or the main one). */
export const isOnMainAccount = (d: BudgetData, accountId?: string): boolean => accountIdOf(d, accountId) === mainAccount(d).id;

/** True for the account of an envelope (spec 0011): it belongs to one envelope and is never a choice for anything else (RG2). */
export const isEnvelopeAccount = (a?: Pick<BankAccount, 'kind'>): boolean => a?.kind === 'enveloppe';

/** Accounts offered in the lists of choice (« Payé avec », account of a line…): active, and not an envelope's account (spec 0011, RG2, RG23). */
export const activeBankAccounts = (d: BudgetData) => d.accounts.filter(a => !a.archived && !isEnvelopeAccount(a));

/** Id given to the account of an envelope: stable and readable, with a number if it is already taken (here or in `taken`). */
export function freeEnvelopeAccountId(d: BudgetData, envelopeId: string, taken: Iterable<string> = []): string {
  const used = new Set([...d.accounts.map(a => a.id), ...taken]);
  const base = `acc-env-${envelopeId}`;
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** The account of an envelope (spec 0011, RG3): same name and hue, always in the budget, balance confirmed. */
export const newEnvelopeAccount = (id: string, envelopeId: string, name: string, hue: number, openingBalance: number, openingMonth: MonthKey): BankAccount => ({
  id, name, hue, isDefault: false, openingBalance, openingMonth, inBudget: true, archived: false, kind: 'enveloppe', envelopeId, openingConfirmed: true,
});

/**
 * The account of an envelope in month `m`, once it exists: the envelope's account when it is of kind `enveloppe`
 * and opened on or before `m`. Before that month the envelope is still the old calculation (spec 0011, RG16).
 */
export function envelopeAccountAt(d: BudgetData, e: Pick<Envelope, 'accountId'>, m: MonthKey): BankAccount | undefined {
  const a = d.accounts.find(x => x.id === e.accountId);
  return a && isEnvelopeAccount(a) && compareMonths(m, a.openingMonth) >= 0 ? a : undefined;
}

/** Operations of an unknown account count in the budget (nothing to exclude them with). */
export const isAccountInBudget = (d: BudgetData, accountId?: string): boolean => bankAccount(d, accountId)?.inBudget ?? true;

/** A transaction counts in the budget figures unless its account is out of the budget (RG17). */
export const isTransactionInBudget = (d: BudgetData, t: Transaction): boolean => isAccountInBudget(d, t.accountId);

/**
 * A rev/fix/cre line leaves the budget with its account; a variable line leaves it with the account it is paid from
 * (its resolved account, spec 0009 RG110: it is then informative, in no budget total). Other lines always count.
 */
export const isLineInBudget = (d: BudgetData, l: Line): boolean =>
  l.block === 'var' ? isAccountInBudget(d, resolveBoxAccountId(d, l)) : !ACCOUNT_BLOCKS.includes(l.block) || isAccountInBudget(d, l.accountId);

/**
 * The account an expense on a box is paid from (spec 0006, RG3, RG4):
 * « Espèces » mode → the cash account; « Virtuel » → the account assigned to the box,
 * or the main account when there is none, or when it is archived or unknown.
 */
export function resolveBoxAccountId(d: BudgetData, box: PaymentSetting, fallbackId: string = mainAccount(d).id): string {
  if (box.payMode === 'especes') return CASH_ACCOUNT_ID;
  const assigned = box.accountId ? d.accounts.find(a => a.id === box.accountId) : undefined;
  return assigned && !assigned.archived && !isEnvelopeAccount(assigned) ? assigned.id : fallbackId;
}

/**
 * The account an expense cannot leave (« Payé avec » frozen): the account of its envelope once that account exists
 * (spec 0011, RG10), or the account assigned to its variable line (spec 0006), when it is an active one.
 * Undefined when the user is free to choose (no assigned account, « Espèces » mode, savings withdrawal).
 */
export function fixedTransactionAccountId(d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'target'>): string | undefined {
  // An expense on a fixed/credit line is always on the account of the line (spec 0014, RG2).
  if (t.type === 'fix' || t.type === 'rev') {
    const l = d.months[t.month]?.lines.find(x => x.key === t.target);
    return l ? accountIdOf(d, l.accountId) : undefined;
  }
  if (t.type === 'env') {
    const e = d.envelopes.find(x => x.id === t.target);
    return e ? envelopeAccountAt(d, e, t.month)?.id : undefined;
  }
  const box = transactionBox(d, t);
  if (!box?.accountId || box.payMode === 'especes') return undefined;
  const resolved = resolveBoxAccountId(d, box);
  return resolved === box.accountId ? resolved : undefined;
}

/** The variable line a transaction was made on (or the model's, for a month not created yet). */
export function transactionBox(d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'target'>): PaymentSetting | undefined {
  if (t.type !== 'var') return undefined;
  const md = d.months[t.month];
  return (md?.initialized ? md.lines : d.template.lines).find(l => l.block === 'var' && l.key === t.target);
}

/**
 * Account proposed for a new transaction: the account of the envelope for an envelope expense (spec 0011, RG10),
 * the one resolved from its box for a variable expense, the main account otherwise (savings withdrawal).
 */
export function defaultTransactionAccountId(d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'target'>): string {
  if (t.type === 'fix' || t.type === 'rev') return fixedTransactionAccountId(d, t) ?? mainAccount(d).id;
  if (t.type === 'env') return d.envelopes.find(e => e.id === t.target)?.accountId ?? mainAccount(d).id;
  const box = transactionBox(d, t);
  return box ? resolveBoxAccountId(d, box) : mainAccount(d).id;
}

/** Savings and investment lines are the ones that can be tied to a dedicated bank account (spec 0007, RG1). */
export const isSavingsBlock = (block: string): boolean => block === 'epa' || block === 'inv';

/** Kind of an account; absent = `courant` (spec 0010, RG1). */
export const kindOf = (a: Pick<BankAccount, 'kind'>): AccountKind => a.kind ?? 'courant';

/** Kind an account must have to be tied to a line of this block: `epargne` for `epa`, `invest` for `inv` (spec 0010, RG7). */
export const kindForBlock = (block: string): AccountKind | undefined => (block === 'epa' ? 'epargne' : block === 'inv' ? 'invest' : undefined);

/** The main account and « Espèces » are always `courant` (spec 0010, RG2); an envelope's account always `enveloppe` (spec 0011, RG3): their kind cannot change. */
export const isKindFixed = (a: Pick<BankAccount, 'id' | 'isDefault' | 'kind'>): boolean => a.isDefault || a.id === CASH_ACCOUNT_ID || isEnvelopeAccount(a);

/**
 * Whether a savings/investment line can be tied to the given bank account (spec 0007, RG2, RG5; spec 0010, RG7):
 * the account exists, is active, is of the kind of the line's block, and differs from the account the line is paid from.
 */
export function canLinkAccount(d: BudgetData, line: Pick<Line, 'block' | 'accountId'>, accountId: string): boolean {
  const target = d.accounts.find(a => a.id === accountId);
  return isSavingsBlock(line.block) && !!target && !target.archived && kindOf(target) === kindForBlock(line.block) && accountIdOf(d, line.accountId) !== accountId;
}

/** Dedicated account of the savings/investment line `key` in month `m`, if any. */
export function linkedAccountOfLine(d: BudgetData, m: MonthKey, key: string): string | undefined {
  const md = d.months[m];
  return md?.initialized ? md.lines.find(l => l.key === key && isSavingsBlock(l.block))?.linkedAccountId : undefined;
}

/** A withdrawal from a linked line cannot be credited to the line's own dedicated account (spec 0007, RG7). */
export const isSavingsWithdrawalAllowed = (d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'target' | 'accountId'>): boolean =>
  t.type !== 'epa' || linkedAccountOfLine(d, t.month, t.target) !== accountIdOf(d, t.accountId);
