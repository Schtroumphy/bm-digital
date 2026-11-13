import { round2 } from './format';
import { isSavingsBlock, isTransactionOffBudget } from './bank';
import { ENVELOPES_ID } from './internalTransfers';
import { lineKeysOf, targetsOf } from './movementTargets';
import type { AccountMovement, BudgetData, Line, MonthKey, Transaction } from './types';

/*
 * The actual of a line is the sum of its entries, never a typed amount (spec 0019, RG19, RG20):
 * - `var`: the `var` expenses on the line;
 * - `fix`, `cre`: the `fix` expenses on the line (spec 0014);
 * - `rev`: the `rev` entries of money on the line (spec 0015);
 * - `epa`, `inv`: the transfers whose target is the line (a line with no dedicated account can have none: its actual stays empty).
 * An entry assigned to a savings account (spec 0028) or marked « hors budget » (spec 0031) is not counted.
 * A line with no entry has no actual (null). `Line.actual` is only a cache of this sum, rewritten by `syncLineActuals`.
 */

/** Operations of a month assigned to an account (spec 0028, RG26), signed as a payment into it: an expense in positive, an entry of money in negative. */
const assignedAmounts = (d: BudgetData, m: MonthKey, accountId: string): number[] =>
  d.transactions.filter(t => t.month === m && t.assignedAccountId === accountId && (t.type === 'var' || t.type === 'fix' || t.type === 'rev')).map(t => (t.type === 'rev' ? -t.amount : t.amount));

/** Net of the operations assigned to the dedicated account of a savings/investment line of the month: what other accounts paid on behalf of the savings (RG26). */
export function assignedToSavingsNet(d: BudgetData, m: MonthKey): number {
  const accounts = new Set((d.months[m]?.lines ?? []).filter(l => isSavingsBlock(l.block) && l.linkedAccountId).map(l => l.linkedAccountId as string));
  return round2([...accounts].reduce((n, id) => n + assignedAmounts(d, m, id).reduce((s, a) => s + a, 0), 0));
}

/** Operations of a month assigned to an account (spec 0028, RG26). */
const assignedTransactions = (d: BudgetData, m: MonthKey, accountId: string) =>
  d.transactions.filter(t => t.month === m && t.assignedAccountId === accountId && (t.type === 'var' || t.type === 'fix' || t.type === 'rev'));

/**
 * What makes the actual of a savings/investment line: the transfers aimed at it, the transfers its account passes on, and the operations assigned to its account.
 * Money the line's account passes on leaves this line: to another savings line (it is in that line's actual), or to a plain transfer with no budget item
 * (main account, another account, cash). A transfer to an envelope is excluded: envelopes are counted by their allocations.
 * Operations paid by another account but assigned to this line's account (spec 0028, RG26) count as a payment into it
 * (an expense in positive, an entry of money such as a refund in negative). They stay out of the expenses and of the other budget figures.
 */
export function savingsLineEntries(d: BudgetData, m: MonthKey, l: Pick<Line, 'key'> & { linkedAccountId?: string }): { toLine: AccountMovement[]; passedOn: AccountMovement[]; assigned: Transaction[] } {
  const movements = d.accountMovements ?? [];
  const lines = d.months[m]?.lines ?? [];
  const toLine = movements.filter(mv => mv.month === m && lineKeysOf(mv).includes(l.key));
  const isOtherSavingsLine = (mv: AccountMovement) => lines.some(o => lineKeysOf(mv).includes(o.key) && isSavingsBlock(o.block));
  const passedOn = l.linkedAccountId
    ? movements.filter(mv => mv.month === m && mv.fromAccountId === l.linkedAccountId && mv.toAccountId !== ENVELOPES_ID && (targetsOf(mv).length > 0 ? targetsOf(mv)[0].kind === 'line' && !lineKeysOf(mv).includes(l.key) && isOtherSavingsLine(mv) : true))
    : [];
  const assigned = l.linkedAccountId ? assignedTransactions(d, m, l.linkedAccountId) : [];
  return { toLine, passedOn, assigned };
}

/** The entries recorded on a line in a month: amounts and nothing else. */
export function lineEntryAmounts(d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block'> & { linkedAccountId?: string }): number[] {
  if (isSavingsBlock(l.block)) {
    const e = savingsLineEntries(d, m, l);
    return [...e.toLine.map(mv => mv.amount), ...e.passedOn.map(mv => -mv.amount), ...e.assigned.map(t => (t.type === 'rev' ? -t.amount : t.amount))];
  }
  const type = l.block === 'var' ? 'var' : l.block === 'rev' ? 'rev' : 'fix';
  // An operation assigned to a savings account is not counted: the actual is the sum of the entries that stay in the budget (spec 0028, RG5).
  return d.transactions.filter(t => t.month === m && t.type === type && t.target === l.key && !isTransactionOffBudget(t)).map(t => t.amount);
}

/**
 * « Détails » of a line (white bubble of the Budget screen): the detail field of each real entry of the line in the month, one block per entry
 * (day, label, amount, then the detail). An entry without detail is listed too (date, label, amount only); empty text when the line has no entry.
 */
export function lineEntryDetails(d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block'>): string {
  const entries: { day: number; label: string; amount: number; detail?: string }[] = isSavingsBlock(l.block)
    ? (d.accountMovements ?? []).filter(mv => mv.month === m && lineKeysOf(mv).includes(l.key))
    : d.transactions.filter(t => t.month === m && t.type === (l.block === 'var' ? 'var' : l.block === 'rev' ? 'rev' : 'fix') && t.target === l.key && !isTransactionOffBudget(t));
  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return entries
    .sort((a, b) => a.day - b.day)
    .map(e => `${String(e.day).padStart(2, '0')} · ${e.label} · ${fmt(e.amount)} €${e.detail ? `\n${e.detail}` : ''}`)
    .join('\n\n');
}

/** Number of entries on a line (for its tooltip). */
export const lineEntryCount = (d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block'>): number => lineEntryAmounts(d, m, l).length;

/** The actual a line must have: the sum of its entries, null when it has none. */
export function derivedActual(d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block'> & { linkedAccountId?: string }): number | null {
  const amounts = lineEntryAmounts(d, m, l);
  return amounts.length ? round2(amounts.reduce((s, a) => s + a, 0)) : null;
}

/** True when a line's cached actual differs from its entries. */
const isStale = (d: BudgetData, m: MonthKey, l: Line): boolean => l.actual !== derivedActual(d, m, l);

/** Rewrites the actual of one line from its entries: what a use case calls after adding, changing or removing an entry of that line. */
export function syncLineActual(d: BudgetData, m: MonthKey, key: string): void {
  const l = d.months[m]?.lines.find(x => x.key === key);
  if (l) l.actual = derivedActual(d, m, l);
}

/** Rewrites the actual of every line of every month from its entries (idempotent). Called after every change of an entry. */
export function syncLineActuals(d: BudgetData): void {
  for (const [m, md] of Object.entries(d.months)) {
    if (!md.initialized) continue;
    for (const l of md.lines) l.actual = derivedActual(d, m, l);
  }
}

/** True when some line holds an actual that is not the sum of its entries. */
export const hasStaleActuals = (d: BudgetData): boolean => Object.entries(d.months).some(([m, md]) => md.initialized && md.lines.some(l => isStale(d, m, l)));

/**
 * Number of actuals typed by hand that will no longer count (RG22): a line whose actual is not zero and is not the sum of its entries.
 * An empty or a zero actual loses nothing, so it is not counted.
 */
export const manualActualCount = (d: BudgetData): number =>
  Object.entries(d.months).reduce((n, [m, md]) => n + (md.initialized ? md.lines.filter(l => !!l.actual && isStale(d, m, l)).length : 0), 0);

/**
 * Tooltip fact about the entries of a line (spec 0019, RG16, RG24): how many there are and that the actual is their sum. For a savings/investment line
 * with no dedicated account, no transfer is possible: the actual stays empty and the tooltip says how to follow it. Empty when there is nothing to say.
 */
export function lineEntriesNote(d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block' | 'linkedAccountId'>): string {
  const n = lineEntryCount(d, m, l);
  if (n > 0) return `${n} écriture${n > 1 ? 's' : ''}, réel = somme des écritures`;
  return isSavingsBlock(l.block) && !l.linkedAccountId ? 'Rattachez un compte dédié pour suivre le réel' : '';
}
