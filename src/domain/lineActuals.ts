import { round2 } from './format';
import { isSavingsBlock } from './bank';
import type { BudgetData, Line, MonthKey } from './types';

/*
 * The actual of a line is the sum of its entries, never a typed amount (spec 0019, RG19, RG20):
 * - `var`: the `var` expenses on the line;
 * - `fix`, `cre`: the `fix` expenses on the line (spec 0014);
 * - `rev`: the `rev` entries of money on the line (spec 0015);
 * - `epa`, `inv`: the transfers whose target is the line (a line with no dedicated account can have none: its actual stays empty).
 * A line with no entry has no actual (null). `Line.actual` is only a cache of this sum, rewritten by `syncLineActuals`.
 */

/** The entries recorded on a line in a month: amounts and nothing else. */
export function lineEntryAmounts(d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block'>): number[] {
  if (isSavingsBlock(l.block)) return (d.accountMovements ?? []).filter(mv => mv.month === m && mv.target?.kind === 'line' && mv.target.key === l.key).map(mv => mv.amount);
  const type = l.block === 'var' ? 'var' : l.block === 'rev' ? 'rev' : 'fix';
  return d.transactions.filter(t => t.month === m && t.type === type && t.target === l.key).map(t => t.amount);
}

/** Number of entries on a line (for its tooltip). */
export const lineEntryCount = (d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block'>): number => lineEntryAmounts(d, m, l).length;

/** The actual a line must have: the sum of its entries, null when it has none. */
export function derivedActual(d: BudgetData, m: MonthKey, l: Pick<Line, 'key' | 'block'>): number | null {
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
