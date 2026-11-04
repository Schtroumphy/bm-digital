import { isoDate } from '../domain/checkoff';
import { compareMonths, round2 } from '../domain/format';
import { cashBalanceAt, lowestCashBalance } from '../domain/envelopeHistory';
import { isMonthLocked } from '../domain/ledger';
import { monthOfDate } from '../domain/periods';
import type { BudgetData, CashAdjustment } from '../domain/types';

/*
 * Use cases on the cash balance of an envelope (spec 0026, RG27 to RG34, amendment of 2026-11-04). The cash is informative and not traced: the
 * user types the balance he really has and the application records the difference as an adjustment dated TODAY. Each use case changes the
 * data it is given, or changes nothing and tells why.
 */

export type CashAdjustmentRefusal =
  /** The envelope (or its account) does not exist. */
  | 'unknown'
  /** The wanted balance is not a number ≥ 0 (RG30). */
  | 'invalid'
  /** The month of the day is locked or closed (RG33). */
  | 'locked'
  /** The day is before the opening month of the envelope's account (RG33). */
  | 'before_opening'
  /** The cash balance would be negative on some day from the adjustment on (RG30, D52). */
  | 'negative';

export type CashAdjustmentResult = 'ok' | CashAdjustmentRefusal;

/** The month holding a day: the one whose period contains it, or the calendar month when the day is before the budget. */
const monthOfDay = (d: BudgetData, date: string) => monthOfDate(d, date) ?? date.slice(0, 7);

/**
 * Why the cash balance of an envelope cannot be set to `target` today, or null when it can (RG30, RG33). The check is done with the adjustment
 * applied: the lowest balance from `today` on, later moves included (a cash expense dated later), must stay ≥ 0.
 */
export function cashAdjustmentRefusal(d: BudgetData, envelopeId: string, target: number, today = isoDate()): CashAdjustmentRefusal | null {
  const e = d.envelopes.find(x => x.id === envelopeId);
  const account = e && d.accounts.find(a => a.id === e.accountId);
  if (!e || !account) return 'unknown';
  if (!Number.isFinite(target) || target < 0) return 'invalid';
  const month = monthOfDay(d, today);
  if (isMonthLocked(d, month)) return 'locked';
  if (compareMonths(month, account.openingMonth) < 0) return 'before_opening';
  const amount = round2(round2(target) - cashBalanceAt(d, envelopeId, today));
  if (amount === 0) return null;
  const candidate: BudgetData = { ...d, cashAdjustments: [...(d.cashAdjustments ?? []), { id: '', envelopeId, date: today, amount }] };
  return lowestCashBalance(candidate, envelopeId, e.openingCash, today) < 0 ? 'negative' : null;
}

/**
 * Sets the cash balance of an envelope to `target` as of today (RG28): records an adjustment of `target − current balance`, or nothing when the
 * difference is nil. The opening cash, the virtual balance and the accounts are untouched (RG29).
 */
export function adjustEnvelopeCash(d: BudgetData, envelopeId: string, target: number, id: string, today = isoDate()): CashAdjustmentResult {
  const refusal = cashAdjustmentRefusal(d, envelopeId, target, today);
  if (refusal) return refusal;
  const amount = round2(round2(target) - cashBalanceAt(d, envelopeId, today));
  if (amount !== 0) (d.cashAdjustments ??= []).push({ id, envelopeId, date: today, amount });
  return 'ok';
}

/**
 * Why an adjustment cannot be deleted, or null when it can (RG33): unknown, in a locked or closed month, or its removal would make the cash
 * balance negative on some day from its date on (RG31).
 */
export function deleteCashAdjustmentRefusal(d: BudgetData, id: string): Extract<CashAdjustmentRefusal, 'unknown' | 'locked' | 'negative'> | null {
  const a: CashAdjustment | undefined = d.cashAdjustments?.find(x => x.id === id);
  const e = a && d.envelopes.find(x => x.id === a.envelopeId);
  if (!a || !e) return 'unknown';
  if (isMonthLocked(d, monthOfDay(d, a.date))) return 'locked';
  const without: BudgetData = { ...d, cashAdjustments: d.cashAdjustments!.filter(x => x.id !== id) };
  return lowestCashBalance(without, e.id, e.openingCash, a.date) < 0 ? 'negative' : null;
}

/** Deletes an adjustment (RG33): the cash balance is recomputed on reading. */
export function deleteCashAdjustment(d: BudgetData, id: string): 'ok' | Exclude<ReturnType<typeof deleteCashAdjustmentRefusal>, null> {
  const refusal = deleteCashAdjustmentRefusal(d, id);
  if (refusal) return refusal;
  d.cashAdjustments = d.cashAdjustments!.filter(x => x.id !== id);
  if (d.cashAdjustments.length === 0) delete d.cashAdjustments;
  return 'ok';
}
