import { CASH_ACCOUNT_ID, isEnvelopeAccount } from '../domain/bank';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData, MonthKey, PayMode, PaymentSetting } from '../domain/types';

/*
 * Use cases on the payment mode of a variable line, spec 0006 (an envelope has its own account since spec 0011).
 * Each one returns false, changing nothing, when a rule forbids it.
 * They only change the box: transactions already recorded keep their account (RG6).
 */

/** `accountId: null` clears the assigned account (= the main account). */
export interface PaymentPatch {
  payMode?: PayMode;
  accountId?: string | null;
}

/** « Espèces » can only be used through the cash mode (RG13); the account must exist and not be an envelope's (spec 0011, RG2). */
function isAssignable(d: BudgetData, accountId: string | null | undefined): boolean {
  if (accountId == null) return true;
  return accountId !== CASH_ACCOUNT_ID && d.accounts.some(a => a.id === accountId && !isEnvelopeAccount(a));
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
