import { currentMonthKey } from './format';
import type { AccountKind, BankAccount, BudgetData, Line, MonthKey, PaymentSetting, Transaction } from './types';

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

export const activeBankAccounts = (d: BudgetData) => d.accounts.filter(a => !a.archived);

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
  return assigned && !assigned.archived ? assigned.id : fallbackId;
}

/**
 * Account that receives the envelopes without an account of their own (spec 0009, RG98): the one set in
 * `settings.envelopeAccountId` when it exists, is active and is not « Espèces »; otherwise the main account.
 */
export function envelopeDefaultAccountId(d: BudgetData): string {
  const set = d.settings.envelopeAccountId ? d.accounts.find(a => a.id === d.settings.envelopeAccountId) : undefined;
  return set && !set.archived && set.id !== CASH_ACCOUNT_ID ? set.id : mainAccount(d).id;
}

/** Account of an envelope (RG98): « Espèces » mode → cash; its own active account wins; else the default account of the envelopes. */
export const resolveEnvelopeAccountId = (d: BudgetData, env: PaymentSetting): string => resolveBoxAccountId(d, env, envelopeDefaultAccountId(d));

/** The box a transaction was made on: its variable line (or the model's, for a month not created yet) or its envelope. */
export function transactionBox(d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'target'>): PaymentSetting | undefined {
  if (t.type === 'env') return d.envelopes.find(e => e.id === t.target);
  if (t.type !== 'var') return undefined;
  const md = d.months[t.month];
  return (md?.initialized ? md.lines : d.template.lines).find(l => l.block === 'var' && l.key === t.target);
}

/**
 * Account proposed for a new transaction: the one resolved from its box for a
 * variable expense or an envelope, the main account otherwise (savings withdrawal).
 */
export function defaultTransactionAccountId(d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'target'>): string {
  const box = transactionBox(d, t);
  if (!box) return mainAccount(d).id;
  return t.type === 'env' ? resolveEnvelopeAccountId(d, box) : resolveBoxAccountId(d, box);
}

/** Savings and investment lines are the ones that can be tied to a dedicated bank account (spec 0007, RG1). */
export const isSavingsBlock = (block: string): boolean => block === 'epa' || block === 'inv';

/** Kind of an account; absent = `courant` (spec 0010, RG1). */
export const kindOf = (a: Pick<BankAccount, 'kind'>): AccountKind => a.kind ?? 'courant';

/** Kind an account must have to be tied to a line of this block: `epargne` for `epa`, `invest` for `inv` (spec 0010, RG7). */
export const kindForBlock = (block: string): AccountKind | undefined => (block === 'epa' ? 'epargne' : block === 'inv' ? 'invest' : undefined);

/** The main account and « Espèces » are always `courant` and their kind cannot change (spec 0010, RG2). */
export const isKindFixed = (a: Pick<BankAccount, 'id' | 'isDefault'>): boolean => a.isDefault || a.id === CASH_ACCOUNT_ID;

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
