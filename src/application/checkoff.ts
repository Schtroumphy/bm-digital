import { isoDate, isValidDueDay, validateBalanceDate, type BalanceDateError } from '../domain/checkoff';
import { round2 } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import { monthOfDate } from '../domain/periods';
import type { BudgetData, ExecMode, Line, MonthKey } from '../domain/types';

/*
 * Use cases of the schedule (planned day, execution mode), the statements and the adjustments (spec 0009, 0041). Each one changes the data it is given
 * and returns false (changing nothing) when a rule forbids it: month not initialized or locked, invalid value.
 * The pointage of lines and allocations was removed by spec 0043.
 */

function editableLine(d: BudgetData, m: MonthKey, key: string): Line | undefined {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return undefined;
  return md.lines.find(l => l.key === key);
}

/** `null` clears the value. */
export interface SchedulePatch {
  dueDay?: number | null;
  execMode?: ExecMode | null;
}

function applySchedule(l: { dueDay?: number; execMode?: ExecMode }, p: SchedulePatch) {
  if (p.dueDay === null) delete l.dueDay;
  else if (p.dueDay !== undefined) l.dueDay = p.dueDay;
  if (p.execMode === null) delete l.execMode;
  else if (p.execMode !== undefined) l.execMode = p.execMode;
}

/**
 * Sets the planned day and/or the execution mode of an outgoing line, in the month and in the
 * budget model (RG17): months created afterwards start from it, other existing months keep theirs.
 */
export function setLineSchedule(d: BudgetData, m: MonthKey, key: string, patch: SchedulePatch): boolean {
  const l = editableLine(d, m, key);
  if (!l) return false;
  if (patch.dueDay != null && !isValidDueDay(patch.dueDay)) return false;
  applySchedule(l, patch);
  const model = d.template.lines.find(x => x.key === key);
  if (model) applySchedule(model, patch);
  return true;
}

export type BalanceDateResult = 'ok' | 'locked' | 'none' | BalanceDateError;

/**
 * Enters the bank statement of an account for a month: the balance its bank shows, at a date in the month
 * and not in the future (RG62). One per account and month, the new one replaces the old. `null` removes it.
 * It never changes a balance: it is compared with the REAL balance (spec 0019, RG4). Returns why it was refused, or 'ok'.
 */
export function setAccountStatement(d: BudgetData, m: MonthKey, accountId: string, amount: number | null, on: string, today = isoDate()): BalanceDateResult {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return 'locked';
  if (!d.accounts.some(a => a.id === accountId)) return 'none';
  if (amount === null) {
    if (md.accountBalances) delete md.accountBalances[accountId];
    return 'ok';
  }
  const error = validateBalanceDate(d, m, on, today);
  if (error) return error;
  if (!Number.isFinite(amount)) return 'invalid';
  (md.accountBalances ??= {})[accountId] = { amount: round2(amount), on };
  return 'ok';
}

export const ADJUSTMENT_LABEL = 'écart constaté';

export type AdjustmentResult = 'ok' | 'locked' | 'none' | 'zero' | BalanceDateError;

/**
 * Records an « écart constaté » on a bank account, dated in month `m` and not in the future (RG65). Signed,
 * never 0. Refused on a locked or not initialized month, on an unknown account and on an invalid date. Every kind of account accepts one,
 * savings and accounts out of the budget included (spec 0009 RG68 is lifted by spec 0041, its RG9 exception for off-budget accounts by a later amendment). It counts in the REAL balance only (spec 0019, RG3).
 */
export function createAdjustment(d: BudgetData, m: MonthKey, id: string, accountId: string, date: string, amount: number, today = isoDate()): AdjustmentResult {
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return 'locked';
  if (!d.accounts.some(a => a.id === accountId) || d.adjustments?.some(a => a.id === id)) return 'none';
  const error = validateBalanceDate(d, m, date, today);
  if (error) return error;
  if (!Number.isFinite(amount) || round2(amount) === 0) return 'zero';
  (d.adjustments ??= []).push({ id, accountId, date, amount: round2(amount), label: ADJUSTMENT_LABEL, createdOn: today });
  return 'ok';
}

/**
 * Cancels an adjustment: it stays listed but no longer counts (RG66). It cannot be deleted, nor reactivated, nor
 * cancelled twice, and not in a locked month (RG67). Returns true when applied.
 */
export function cancelAdjustment(d: BudgetData, id: string, today = isoDate()): boolean {
  const a = d.adjustments?.find(x => x.id === id);
  if (!a || a.cancelledOn) return false;
  // The month of an adjustment is the one whose period contains its date (spec 0039, RG9).
  const m = monthOfDate(d, a.date) ?? a.date.slice(0, 7);
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return false;
  a.cancelledOn = today;
  return true;
}
