import { availableReal } from '../domain/budget';
import { compareMonths, parseMonth } from '../domain/format';
import { isMonthClosed, isMonthLocked, isYearClosed, previousInitializedMonth } from '../domain/ledger';
import type { BudgetData, MonthKey } from '../domain/types';

/*
 * « Clôturer le mois » / « Rouvrir le mois » (spec 0005). Closing sets
 * `MonthData.closed`, which makes the month read-only through `isMonthLocked`.
 * Each use case changes the data it is given and returns false (changing
 * nothing) when a rule forbids it; the `*Blockers` functions give the reasons,
 * for the screen to explain them.
 */

/** Why a month cannot be closed. */
export type CloseBlocker =
  /** Not initialized, or already locked (closed month or closed year): nothing to close. */
  | { kind: 'unavailable' }
  /** The previous initialized month must be closed first (RG35). */
  | { kind: 'previous'; month: MonthKey }
  /** Some money is still to be placed (positive) or over-placed (negative) (RG27). */
  | { kind: 'available'; amount: number };

/** All the reasons that forbid closing `m`, the order rule first (RG35 then RG27). Empty = can be closed. */
export function closeBlockers(d: BudgetData, m: MonthKey): CloseBlocker[] {
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return [{ kind: 'unavailable' }];
  const out: CloseBlocker[] = [];
  const prev = previousInitializedMonth(d, m);
  if (prev !== null && !isMonthLocked(d, prev)) out.push({ kind: 'previous', month: prev });
  const amount = availableReal(d, m) ?? 0;
  if (amount !== 0) out.push({ kind: 'available', amount });
  return out;
}

/** Closes the month (read-only from now on). Returns true when applied. */
export function closeMonth(d: BudgetData, m: MonthKey): boolean {
  if (closeBlockers(d, m).length) return false;
  d.months[m].closed = true;
  return true;
}

/** Why a month cannot be reopened. */
export type ReopenBlocker =
  /** The month is not closed by itself (open, or locked only through its closed year). */
  | { kind: 'not-closed' }
  /** A later month is closed: it must be reopened first (RG34). `byYear`: that month is only locked by its closed year. */
  | { kind: 'later'; month: MonthKey; byYear: boolean };

/** The reason that forbids reopening `m`, or null when it can be. */
export function reopenBlocker(d: BudgetData, m: MonthKey): ReopenBlocker | null {
  if (!isMonthClosed(d, m) || isYearClosed(d, parseMonth(m).year)) return { kind: 'not-closed' };
  const later = Object.keys(d.months)
    .filter(k => d.months[k].initialized && compareMonths(k, m) > 0 && isMonthLocked(d, k))
    .sort();
  if (!later.length) return null;
  // The month to reopen first: the last one closed by the user, else the last one locked by its year.
  const closed = later.filter(k => isMonthClosed(d, k));
  const target = (closed.length ? closed : later).at(-1)!;
  return { kind: 'later', month: target, byYear: !isMonthClosed(d, target) };
}

/** Reopens a closed month without touching any data. Returns true when applied. */
export function reopenMonth(d: BudgetData, m: MonthKey): boolean {
  if (reopenBlocker(d, m)) return false;
  delete d.months[m].closed;
  return true;
}
