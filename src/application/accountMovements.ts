import { round2 } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData } from '../domain/types';

/*
 * Movements between accounts created by the CSV import (spec 0013, RG10d). There is no free entry: they are
 * edited (label, amount) or deleted after the import. A locked month refuses both, like a transaction.
 */

/** Changes the label and the amount of a movement. Refused (false) on a locked month, an empty label or an amount that is not positive. */
export function updateAccountMovement(d: BudgetData, id: string, patch: { label: string; amount: number }): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  const label = patch.label.trim();
  if (!mv || isMonthLocked(d, mv.month) || !label || !(patch.amount > 0)) return false;
  mv.label = label;
  mv.amount = round2(patch.amount);
  return true;
}

export function deleteAccountMovement(d: BudgetData, id: string): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  if (!mv || isMonthLocked(d, mv.month)) return false;
  d.accountMovements = d.accountMovements!.filter(x => x.id !== id);
  return true;
}
