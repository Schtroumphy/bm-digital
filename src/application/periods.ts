import { addMonths } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import { budgetStart, validateBudgetStart, validatePeriodEnd, validatePeriodEndCleared } from '../domain/periods';
import type { BudgetData, MonthKey } from '../domain/types';

/*
 * Use cases of the budget periods (spec 0039): the start of the budget (first month) and the end of each month. Each one changes the data it is
 * given and returns why it refuses (changing nothing), or `{ ok: true }`. No entry is touched: only the period an entry belongs to changes (RG7).
 */

export type PeriodResult = { ok: true } | { ok: false; reason: string };

const refuse = (reason: string): PeriodResult => ({ ok: false, reason });

/** Why a locked month keeps its dates (RG8). */
export const LOCKED_START = 'Le premier mois est clos ou verrouillé : le début du budget n’est plus modifiable.';
export const LOCKED_END = 'Mois clos ou verrouillé : sa fin n’est plus modifiable, ni celle du mois qui le précède.';

/** Whether the end of month `m` can still change: neither `m` nor the month after it is closed or locked (RG8). */
export const isPeriodEndEditable = (d: BudgetData, m: MonthKey): boolean => !isMonthLocked(d, m) && !isMonthLocked(d, addMonths(m, 1));

/** Whether the start of the budget can still change: the first month is neither closed nor locked (RG8). */
export const isBudgetStartEditable = (d: BudgetData): boolean => d.firstMonth !== null && !isMonthLocked(d, d.firstMonth);

/**
 * Sets the end of the period of month `m`, or clears it with `null` (back to the default end, RG5). Refused (false reason) for a locked month or the
 * month before a locked one (RG8), a month before the first one, and a date out of the bounds of RG4. Nothing is saved when refused (CA11).
 * The month record is created without being initialized when the month does not exist yet (like the notes of a month, spec 0027).
 */
export function setPeriodEnd(d: BudgetData, m: MonthKey, end: string | null): PeriodResult {
  if (!isPeriodEndEditable(d, m)) return refuse(LOCKED_END);
  if (end !== null) {
    const error = validatePeriodEnd(d, m, end);
    if (error) return refuse(error);
    (d.months[m] ??= { initialized: false, lines: [], alloc: {}, transfersDone: {} }).endDate = end;
    return { ok: true };
  }
  const md = d.months[m];
  if (md?.endDate) {
    const error = validatePeriodEndCleared(d, m);
    if (error) return refuse(error);
  }
  if (md) {
    delete md.endDate;
    // A record kept only for its end date disappears with it.
    if (!md.initialized && md.lines.length === 0 && Object.keys(md.alloc).length === 0 && Object.keys(md.transfersDone).length === 0 && Object.keys(md).length === 4) delete d.months[m];
  }
  return { ok: true };
}

/** Whether changing the start of the budget to `start` (null = the 1st of the first month) would reinterpret opening balances already typed (RG14). */
export function budgetStartNeedsConfirmation(d: BudgetData, start: string | null): boolean {
  if (d.firstMonth === null) return false;
  const next = start ?? `${d.firstMonth}-01`;
  if (next === budgetStart(d)) return false;
  return d.accounts.some(a => a.openingMonth === d.firstMonth && (a.openingBalance !== 0 || a.openingConfirmed === true));
}

/**
 * Sets the start of the budget, or clears it with `null` (the 1st of the first month). Refused when the first month is closed or locked (RG8) or the
 * date is out of the bounds of RG4. The opening balances are not changed: they are now read at the new date (RG14); the caller asks for the user's
 * confirmation first when `budgetStartNeedsConfirmation`.
 */
export function setBudgetStart(d: BudgetData, start: string | null): PeriodResult {
  if (d.firstMonth === null) return refuse('Choisis d’abord le premier mois.');
  if (!isBudgetStartEditable(d)) return refuse(LOCKED_START);
  if (start === null || start === `${d.firstMonth}-01`) {
    delete d.settings.startDate;
    return { ok: true };
  }
  const error = validateBudgetStart(d, start);
  if (error) return refuse(error);
  d.settings.startDate = start;
  return { ok: true };
}
