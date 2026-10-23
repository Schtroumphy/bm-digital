import { envelopeCheckKey } from '../domain/bankMovements';
import { envelopeCheck, isEnvelopePointable, isoDate, isIsoDate, isPointable, isValidDueDay, lineCheck, validateBalanceDate, type BalanceDateError } from '../domain/checkoff';
import { round2 } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData, ExecMode, Line, LineCheck, MonthKey } from '../domain/types';

/*
 * Use cases of the pointage (spec 0009). Each one changes the data it is given and returns
 * false (changing nothing) when a rule forbids it: month not initialized or locked (RG7),
 * line without checkbox (RG3, RG4), invalid value (RG8). None of them touches an actual (RG2) or a real balance (spec 0019, RG6).
 */

function editableLine(d: BudgetData, m: MonthKey, key: string): Line | undefined {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return undefined;
  return md.lines.find(l => l.key === key);
}

export interface CheckPatch {
  /** `YYYY-MM-DD`. */
  doneOn?: string;
}

const isValidPatch = (p: CheckPatch) => p.doneOn === undefined || isIsoDate(p.doneOn);

/**
 * Checks a line: date = `today` unless given (RG1, RG77). No amount is stored: the amount counted is computed on reading (RG76).
 * Refused when the line is already checked or has no checkbox.
 */
export function checkLine(d: BudgetData, m: MonthKey, key: string, today = isoDate(), patch: CheckPatch = {}): boolean {
  const l = editableLine(d, m, key);
  if (!l || !isPointable(d, l) || lineCheck(d, m, key) || !isValidPatch(patch)) return false;
  const md = d.months[m];
  (md.checks ??= {})[key] = { doneOn: patch.doneOn ?? today };
  return true;
}

/**
 * Checks the allocation of an envelope: « the allocation was sent to its account » (spec 0011, RG6). Writes the date
 * only; the amount is the month's allocation, read each time (spec 0009, RG91).
 * Refused on a locked or not initialized month, an unknown envelope and an allocation at 0.
 */
export function checkEnvelope(d: BudgetData, m: MonthKey, envelopeId: string, today = isoDate(), patch: CheckPatch = {}): boolean {
  const e = d.envelopes.find(x => x.id === envelopeId);
  const md = d.months[m];
  if (!e || !md?.initialized || isMonthLocked(d, m) || !isEnvelopePointable(d, m, e) || envelopeCheck(d, m, envelopeId) || !isValidPatch(patch)) return false;
  (md.checks ??= {})[envelopeCheckKey(envelopeId)] = { doneOn: patch.doneOn ?? today };
  return true;
}

/** Unchecks the allocation of an envelope: the movement is cancelled. */
export function uncheckEnvelope(d: BudgetData, m: MonthKey, envelopeId: string): boolean {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m) || !envelopeCheck(d, m, envelopeId)) return false;
  delete md.checks![envelopeCheckKey(envelopeId)];
  return true;
}

/** Unchecks a line: its date is erased (RG1). */
export function uncheckLine(d: BudgetData, m: MonthKey, key: string): boolean {
  if (!editableLine(d, m, key) || !lineCheck(d, m, key)) return false;
  delete d.months[m].checks![key];
  return true;
}

/** Changes the date of a checked line. */
export function updateCheck(d: BudgetData, m: MonthKey, key: string, patch: CheckPatch): boolean {
  if (!editableLine(d, m, key) || !isValidPatch(patch)) return false;
  const c: LineCheck | undefined = lineCheck(d, m, key);
  if (!c) return false;
  if (patch.doneOn !== undefined) c.doneOn = patch.doneOn;
  return true;
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
  const error = validateBalanceDate(m, on, today);
  if (error) return error;
  if (!Number.isFinite(amount)) return 'invalid';
  (md.accountBalances ??= {})[accountId] = { amount: round2(amount), on };
  return 'ok';
}

export const ADJUSTMENT_LABEL = 'écart constaté';

export type AdjustmentResult = 'ok' | 'locked' | 'none' | 'zero' | BalanceDateError;

/**
 * Records an « écart constaté » on a bank account, dated in month `m` and not in the future (RG65). Signed,
 * never 0. Refused on a locked or not initialized month, on an unknown account (savings accounts have no
 * adjustment, RG68) and on an invalid date. It counts in the REAL balance only (spec 0019, RG3).
 */
export function createAdjustment(d: BudgetData, m: MonthKey, id: string, accountId: string, date: string, amount: number, today = isoDate()): AdjustmentResult {
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return 'locked';
  if (!d.accounts.some(a => a.id === accountId) || d.adjustments?.some(a => a.id === id)) return 'none';
  const error = validateBalanceDate(m, date, today);
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
  const m = a.date.slice(0, 7);
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return false;
  a.cancelledOn = today;
  return true;
}
