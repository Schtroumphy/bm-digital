import { applyDetail } from '../domain/detail';
import { round2 } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData } from '../domain/types';

/*
 * Movements between accounts created by the CSV import (spec 0013, RG10d). There is no free entry: they are
 * edited (label, amount) or deleted after the import. A locked month refuses both, like a transaction.
 */

/**
 * Changes the label and the amount of a movement, and its detail when `patch.detail` is given (spec 0020, RG6; empty clears it).
 * Refused (false) on a locked month, an empty label or an amount that is not positive.
 */
export function updateAccountMovement(d: BudgetData, id: string, patch: { label: string; amount: number; detail?: string }): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  const label = patch.label.trim();
  if (!mv || isMonthLocked(d, mv.month) || !label || !(patch.amount > 0)) return false;
  mv.label = label;
  mv.amount = round2(patch.amount);
  if (patch.detail !== undefined) applyDetail(mv, patch.detail);
  return true;
}

/** Sets, changes or clears (empty text) the detail of a movement. Allowed on a locked month: it changes no figure (spec 0020, RG11). */
export function setAccountMovementDetail(d: BudgetData, id: string, detail: string): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  if (!mv) return false;
  applyDetail(mv, detail);
  return true;
}

export function deleteAccountMovement(d: BudgetData, id: string): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  if (!mv || isMonthLocked(d, mv.month)) return false;
  d.accountMovements = d.accountMovements!.filter(x => x.id !== id);
  return true;
}
