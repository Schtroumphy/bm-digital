import { CASH_ACCOUNT_ID } from '../domain/bank';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData, MonthKey, PayMode, PaymentSetting } from '../domain/types';

/*
 * Use cases on the payment mode of a box (a variable line or an envelope), spec 0006.
 * Each one returns false, changing nothing, when a rule forbids it.
 * They only change the box: transactions already recorded keep their account (RG6).
 */

/** `accountId: null` clears the assigned account (= the main account). */
export interface PaymentPatch {
  payMode?: PayMode;
  accountId?: string | null;
}

/** « Espèces » can only be used through the cash mode (RG13); the account must exist. */
function isAssignable(d: BudgetData, accountId: string | null | undefined): boolean {
  if (accountId == null) return true;
  return accountId !== CASH_ACCOUNT_ID && d.accounts.some(a => a.id === accountId);
}

function apply(box: PaymentSetting, patch: PaymentPatch) {
  if (patch.payMode !== undefined) box.payMode = patch.payMode;
  if (patch.accountId === null) delete box.accountId;
  else if (patch.accountId !== undefined) box.accountId = patch.accountId;
}

/**
 * Changes the payment mode and/or the assigned account of a variable line, in
 * month `m` and in the budget model (RG10), so the months created afterwards
 * start from it. Other existing months are not touched. Refused on a locked month (RG11).
 */
export function setLinePayment(d: BudgetData, m: MonthKey, key: string, patch: PaymentPatch): boolean {
  if (isMonthLocked(d, m) || !isAssignable(d, patch.accountId)) return false;
  const line = d.months[m]?.lines.find(l => l.block === 'var' && l.key === key);
  if (!line) return false;
  apply(line, patch);
  const model = d.template.lines.find(l => l.block === 'var' && l.key === key);
  if (model) apply(model, patch);
  return true;
}

/** Same for an envelope. It is not tied to a month: `m` is the month being viewed, whose lock protects the change (RG11). */
export function setEnvelopePayment(d: BudgetData, m: MonthKey, id: string, patch: PaymentPatch): boolean {
  if (isMonthLocked(d, m) || !isAssignable(d, patch.accountId)) return false;
  const env = d.envelopes.find(e => e.id === id);
  if (!env) return false;
  apply(env, patch);
  return true;
}
