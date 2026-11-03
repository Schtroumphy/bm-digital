import { lineRemaining } from './budget';
import { round2 } from './format';
import { isCashWithdrawal } from './internalTransfers';
import { isMonthLocked } from './ledger';
import type { BudgetData, MonthKey } from './types';

/*
 * Cash of a month (spec 0037). The main account is debited ONCE a month by a withdrawal (an `AccountMovement` to `CASH_ID`), equal to the
 * sum of the cash parts of the month: the budget of every variable line managed in cash, plus the cash part of each envelope. Everything here
 * is derived on reading and never stored; none of it enters a budget total (RG18).
 */

/** Cash part of an envelope for a month (RG11): 0 when none was entered. */
export const envelopeCashPart = (d: BudgetData, m: MonthKey, envelopeId: string): number => d.months[m]?.cashPart?.[envelopeId] ?? 0;

/** The cash part that forbids lowering the allocation of an envelope to `amount` (RG11), or null when the allocation can be set. */
export function cashPartAbove(d: BudgetData, m: MonthKey, envelopeId: string, amount: number): number | null {
  const part = envelopeCashPart(d, m, envelopeId);
  return round2(amount) < part ? part : null;
}

/** The variable lines of an initialized month that are managed in cash: their whole budget is their cash part (RG6). */
export const cashLines = (d: BudgetData, m: MonthKey) =>
  d.months[m]?.initialized ? d.months[m].lines.filter(l => l.block === 'var' && l.payMode === 'especes') : [];

/** Figures of the « Espèces du mois » block (RG16, RG17). */
export interface CashWithdrawalSummary {
  /** « À retirer »: the cash parts of the lines and of the envelopes. */
  toWithdraw: number;
  /** « Retiré »: the withdrawals attached to the month. */
  withdrawn: number;
  /** Still to withdraw, never negative. */
  missing: number;
  /** Withdrawn beyond what is needed, never negative. */
  excess: number;
}

/** « À retirer » / « retiré » of a month. Only the existing envelopes count: a deleted envelope's part leaves the sum. */
export function cashWithdrawalSummary(d: BudgetData, m: MonthKey): CashWithdrawalSummary {
  const lines = cashLines(d, m).reduce((s, l) => s + l.budget, 0);
  const envelopes = d.envelopes.reduce((s, e) => s + envelopeCashPart(d, m, e.id), 0);
  const toWithdraw = round2(lines + envelopes);
  const withdrawn = round2((d.accountMovements ?? []).filter(mv => mv.month === m && isCashWithdrawal(mv)).reduce((s, mv) => s + mv.amount, 0));
  return { toWithdraw, withdrawn, missing: Math.max(0, round2(toWithdraw - withdrawn)), excess: Math.max(0, round2(withdrawn - toWithdraw)) };
}

/** A cash line whose entries do not use up its budget: what the closing proposes to regularise (RG19). */
export interface ReconcilableLine {
  key: string;
  name: string;
  budget: number;
  /** What was entered (0 when nothing). */
  spent: number;
  /** budget − spent, above 0. */
  rest: number;
}

/**
 * Lines managed in cash with a rest above 0 (RG19, RG20). Never an envelope (RG13), a line not managed in cash, or a line whose rest is nil or negative.
 * Empty for a locked month (closed, or its year closed), which can no longer be regularised.
 */
export function reconcilableLines(d: BudgetData, m: MonthKey): ReconcilableLine[] {
  if (isMonthLocked(d, m)) return [];
  return cashLines(d, m)
    .map(l => ({ key: l.key, name: l.name, budget: l.budget, spent: l.actual ?? 0, rest: lineRemaining(l) }))
    .filter(l => l.rest > 0);
}
