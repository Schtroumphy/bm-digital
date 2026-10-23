import { accountIdOf } from './bank';
import { round2 } from './format';
import type { BlockKey, BudgetData, Line, MonthKey, Transaction } from './types';

/*
 * Expenses on a fixed or credit line (spec 0014). The expense is a `Transaction` of type `fix` whose target is the line's key.
 * A line that carries at least one expense is « portée par ses dépenses »: its actual is their sum and its own money movement
 * (actual on the 1st, checked amount) is no longer counted in the balances, the expenses are (RG5, RG9).
 */

/** Blocks whose lines accept an expense: fixed lines and credits (RG1). Income and savings lines do not. */
export const isExpenseLineBlock = (block: BlockKey): boolean => block === 'fix' || block === 'cre';

/**
 * Blocks whose lines can be « portée par ses écritures »: fixed lines and credits (expenses, type `fix`) and revenue lines
 * (entries, type `rev`, spec 0015). The same model applies to both.
 */
export const isCarryingBlock = (block: BlockKey): boolean => block === 'fix' || block === 'cre' || block === 'rev';

/** The two types of entry written on a budget line. */
const isLineEntry = (t: Transaction): boolean => t.type === 'fix' || t.type === 'rev';

/** Date of an entry at the bank: its `bankDate`, else the day of its month of attachment (spec 0015, RG2). */
export const bankDateOf = (t: { month: MonthKey; day: number; bankDate?: string }): string => t.bankDate ?? `${t.month}-${String(t.day).padStart(2, '0')}`;

/** The entries (expenses or revenue entries) recorded on a fixed, credit or revenue line of a month. */
export const lineExpenses = (d: BudgetData, m: MonthKey, key: string): Transaction[] => d.transactions.filter(t => isLineEntry(t) && t.month === m && t.target === key);

/** True when the line carries at least one entry. */
export const isLineCarried = (d: BudgetData, m: MonthKey, key: string): boolean => d.transactions.some(t => isLineEntry(t) && t.month === m && t.target === key);

/** Sum of the expenses of a line; null when there is none. */
export function lineExpensesTotal(d: BudgetData, m: MonthKey, key: string): number | null {
  const txs = lineExpenses(d, m, key);
  return txs.length ? round2(txs.reduce((s, t) => s + t.amount, 0)) : null;
}

/** The month's fixed/credit line an expense can target, or undefined (unknown line, other block, month not created). */
export const expenseLine = (d: BudgetData, m: MonthKey, key: string): Line | undefined =>
  d.months[m]?.initialized ? d.months[m].lines.find(l => l.key === key && isExpenseLineBlock(l.block)) : undefined;

/** The month's revenue line an entry can target (spec 0015, RG8), or undefined. */
export const revenueLine = (d: BudgetData, m: MonthKey, key: string): Line | undefined =>
  d.months[m]?.initialized ? d.months[m].lines.find(l => l.key === key && l.block === 'rev') : undefined;

/** Account of an expense on this line: the line's own, the main account when it has none (RG2). */
export const expenseLineAccountId = (d: BudgetData, l: Pick<Line, 'accountId'>): string => accountIdOf(d, l.accountId);

/** Tooltip text of a line that carries expenses (empty otherwise): how many, where its actual comes from, what its pointage does (RG7, RG10). */
export function carriedLineNote(d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block' | 'accountId'>): string {
  if (!isCarryingBlock(l.block)) return '';
  const n = lineExpenses(d, m, l.key).length;
  if (n === 0) return '';
  const account = d.accounts.find(a => a.id === expenseLineAccountId(d, l))?.name ?? '';
  if (l.block === 'rev') return `${n} entrée${n > 1 ? 's' : ''} : le réel est leur somme (non modifiable), sur le compte ${account}.\nPointage sans effet : la ligne est portée par ses écritures.`;
  return `${n} dépense${n > 1 ? 's' : ''} : le réel est leur somme (non modifiable), sur le compte ${account}.\nPointage sans effet : la ligne est portée par ses dépenses.`;
}

/** Why the account of a line cannot change while it carries expenses (spec 0014, RG2). */
export const CARRIED_ACCOUNT_REFUSAL = 'Cette ligne porte des dépenses : supprimez-les ou déplacez-les avant de changer son compte.';

/** Why the account of a revenue line cannot change while it carries entries (spec 0015, RG13). */
export const CARRIED_REVENUE_ACCOUNT_REFUSAL = 'Cette ligne porte des écritures : supprimez-les ou déplacez-les avant de changer son compte.';

/** The refusal message that fits the block of the line. */
export const carriedAccountRefusal = (block: BlockKey): string => (block === 'rev' ? CARRIED_REVENUE_ACCOUNT_REFUSAL : CARRIED_ACCOUNT_REFUSAL);

/** Why an entry cannot be recorded on this fixed, credit or revenue line, or null (the line's account is archived). */
export function expenseLineBlocker(d: BudgetData, m: MonthKey, key: string): string | null {
  const l = expenseLine(d, m, key) ?? revenueLine(d, m, key);
  if (!l) return null;
  const account = d.accounts.find(a => a.id === expenseLineAccountId(d, l));
  return account?.archived ? `Le compte de cette ligne (${account.name}) est archivé : désarchivez-le pour y enregistrer une dépense.` : null;
}

/**
 * The actual that a first expense on the line would replace (RG6): the typed actual (0 included) of a line with no expense yet,
 * or null when nothing is replaced.
 */
export function actualReplacedBy(d: BudgetData, m: MonthKey, key: string): number | null {
  const l = expenseLine(d, m, key) ?? revenueLine(d, m, key);
  return l && l.actual !== null && !isLineCarried(d, m, key) ? l.actual : null;
}
