import { CASH_ACCOUNT_ID } from './bank';
import type { AccountMovement, BudgetData, MonthKey, MovementTarget } from './types';

/*
 * Which transfers stand for a budget item (spec 0019, RG10). Kept apart from `transfers.ts` so that `bankMovements.ts`
 * (which needs it to drop a replaced counterpart) and `transfers.ts` (which needs `countedAmount`) do not import each other.
 */

export const sameTarget = (a?: MovementTarget, b?: MovementTarget): boolean =>
  !!a && !!b && (a.kind === 'line' ? b.kind === 'line' && a.key === b.key : b.kind === 'env' && a.id === b.id);

/**
 * A transfer from the « Espèces » account to an envelope's account (spec 0026, RG4): it feeds the envelope's cash balance, not its account.
 * The account is debited (« Espèces ») but the envelope's account is never credited, and it does not stand for the envelope's allocation.
 */
export const isCashFunding = (d: BudgetData, mv: AccountMovement): boolean =>
  mv.fromAccountId === CASH_ACCOUNT_ID && d.envelopes.some(e => e.accountId === mv.toAccountId);

/** The transfers of a month attached to a budget item (a cash funding of an envelope stands for no allocation, spec 0026). */
export const transfersTargeting = (d: BudgetData, m: MonthKey, target: MovementTarget): AccountMovement[] =>
  (d.accountMovements ?? []).filter(mv => mv.month === m && sameTarget(mv.target, target) && !isCashFunding(d, mv));

/** True when at least one transfer of the month stands for the item: its pointed counterpart is then replaced by the transfers (RG10). */
export const isItemTransferred = (d: BudgetData, m: MonthKey, target: MovementTarget): boolean => transfersTargeting(d, m, target).length > 0;
