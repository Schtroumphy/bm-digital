import { applyDetail, normalizeDetail } from '../domain/detail';
import { round2 } from '../domain/format';
import { daysInMonth } from '../domain/checkoff';
import { isMonthLocked } from '../domain/ledger';
import { syncLineActual } from '../domain/lineActuals';
import { isValidTransferTarget } from '../domain/transfers';
import type { AccountMovement, BudgetData, MonthKey, MovementTarget } from '../domain/types';

/*
 * Transfers (« Transfert », spec 0019): money moving from one of the user's accounts to another (withdrawal, internal transfer, savings payment,
 * envelope funding). Created by the CSV import (spec 0013) or typed in the Saisie screen (RG14); edited (label, amount, target) or deleted afterwards.
 * A locked month refuses all of it, like a transaction (RG17). A transfer attached to a savings/investment line feeds that line's actual (RG16).
 */

/** The savings/investment line a transfer is attached to has its actual recomputed from its transfers. */
function syncTarget(d: BudgetData, month: MonthKey, target?: MovementTarget) {
  if (target?.kind === 'line') syncLineActual(d, month, target.key);
}

export interface NewTransfer {
  id: string;
  month: MonthKey;
  day: number;
  label: string;
  amount: number;
  fromAccountId: string;
  toAccountId: string;
  /** Optional: the budget item the transfer stands for. Must have the destination account as its own. */
  target?: MovementTarget;
  detail?: string;
}

/**
 * Records a transfer typed by hand (RG14). Refused (false) on a locked or not created month, an empty label, an amount that is not positive,
 * a day outside the month, two identical or unknown or archived accounts, and a target that does not exist in the month or does not
 * receive the money on the destination account.
 */
export function addTransfer(d: BudgetData, input: NewTransfer): boolean {
  const label = input.label.trim();
  const active = (id: string) => d.accounts.some(a => a.id === id && !a.archived);
  if (!d.months[input.month]?.initialized || isMonthLocked(d, input.month) || !label || !(input.amount > 0)) return false;
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > daysInMonth(input.month)) return false;
  if (input.fromAccountId === input.toAccountId || !active(input.fromAccountId) || !active(input.toAccountId)) return false;
  if (input.target && !isValidTransferTarget(d, input.month, input.toAccountId, input.target)) return false;
  const detail = normalizeDetail(input.detail);
  const mv: AccountMovement = {
    id: input.id, month: input.month, day: input.day, label, amount: round2(input.amount),
    fromAccountId: input.fromAccountId, toAccountId: input.toAccountId,
    ...(input.target ? { target: input.target } : {}),
    ...(detail === undefined ? {} : { detail }),
  };
  (d.accountMovements ??= []).push(mv);
  syncTarget(d, mv.month, mv.target);
  return true;
}

/**
 * Changes the label and the amount of a transfer, and its detail when `patch.detail` is given (spec 0020, RG6; empty clears it).
 * Refused (false) on a locked month, an empty label or an amount that is not positive.
 */
export function updateAccountMovement(d: BudgetData, id: string, patch: { label: string; amount: number; detail?: string }): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  const label = patch.label.trim();
  if (!mv || isMonthLocked(d, mv.month) || !label || !(patch.amount > 0)) return false;
  mv.label = label;
  mv.amount = round2(patch.amount);
  if (patch.detail !== undefined) applyDetail(mv, patch.detail);
  syncTarget(d, mv.month, mv.target);
  return true;
}

/**
 * Attaches a transfer to a budget item, or detaches it with `null` (RG10, RG11: « Rattacher »). Refused (false) on a locked month, an unknown
 * transfer, or an item that does not exist in the month or whose account is not the transfer's destination.
 */
export function setTransferTarget(d: BudgetData, id: string, target: MovementTarget | null): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  if (!mv || isMonthLocked(d, mv.month)) return false;
  if (target && !isValidTransferTarget(d, mv.month, mv.toAccountId, target)) return false;
  const before = mv.target;
  if (target) mv.target = target;
  else delete mv.target;
  syncTarget(d, mv.month, before);
  syncTarget(d, mv.month, target ?? undefined);
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
  syncTarget(d, mv.month, mv.target);
  return true;
}
