import { applyDetail, normalizeDetail } from '../domain/detail';
import { round2 } from '../domain/format';
import { daysInMonth } from '../domain/checkoff';
import { isMonthLocked } from '../domain/ledger';
import { deducedDate, isRealDate } from '../domain/periods';
import { syncLineActual } from '../domain/lineActuals';
import { CASH_ID, isEnvelopesPool, linkStateOf } from '../domain/internalTransfers';
import { isEnvelopeAccount } from '../domain/bank';
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
  /** Real date of a transfer typed by hand (`YYYY-MM-DD`, spec 0039, RG11): written as its bank date; `day` is then its day number. */
  bankDate?: string;
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
 * a day outside the month (or an unreal bank date), two identical or unknown or archived accounts, and a target that does not exist in the month or does not
 * receive the money on the destination account. The destination can be `CASH_ID` (a cash withdrawal, spec 0037, RG1): the source is then any active
 * account that is not an envelope's, and the withdrawal stands for no budget item (RG2).
 */
export function addTransfer(d: BudgetData, input: NewTransfer): boolean {
  const label = input.label.trim();
  const active = (id: string) => d.accounts.some(a => a.id === id && !a.archived);
  if (!d.months[input.month]?.initialized || isMonthLocked(d, input.month) || !label || !(input.amount > 0)) return false;
  if (input.bankDate !== undefined ? !isRealDate(input.bankDate) || Number(input.bankDate.slice(8, 10)) !== input.day : !Number.isInteger(input.day) || input.day < 1 || input.day > daysInMonth(input.month)) return false;
  const withdrawal = input.toAccountId === CASH_ID;
  if (withdrawal ? !active(input.fromAccountId) || input.target !== undefined || isEnvelopeAccount(d.accounts.find(a => a.id === input.fromAccountId)) : input.fromAccountId === input.toAccountId || !active(input.fromAccountId) || !active(input.toAccountId)) return false;
  if (input.target && !isValidTransferTarget(d, input.month, input.toAccountId, input.target)) return false;
  const detail = normalizeDetail(input.detail);
  const mv: AccountMovement = {
    id: input.id, month: input.month, day: input.day, ...(input.bankDate ? { bankDate: input.bankDate } : {}), label, amount: round2(input.amount),
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
 * Refused (false) on a locked month, an empty label or an amount that is not positive, and for a changed amount on a transfer linked to
 * two lines of the bank file (« Lié »): both lines have that amount, the transfer has to be unlinked or deleted first (spec 0016, RG15).
 * `date` (`YYYY-MM-DD`, a real date) changes its bank date, as for an expense: the month of attachment stays; the date is kept only when the day alone does not give it.
 * `fromAccountId` / `toAccountId` change its accounts, under the rules of `addTransfer` (active, different, cash withdrawal only from a non-envelope
 * account); refused for a transfer from or to the envelopes pool. The import traces are kept (they carry their own account). A new destination drops a target that
 * no longer fits it.
 */
export function updateAccountMovement(d: BudgetData, id: string, patch: { label: string; amount: number; detail?: string; date?: string; fromAccountId?: string; toAccountId?: string }): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  const label = patch.label.trim();
  if (!mv || isMonthLocked(d, mv.month) || !label || !(patch.amount > 0)) return false;
  if (linkStateOf(mv) === 'lie' && round2(patch.amount) !== mv.amount) return false;
  if (patch.date !== undefined && !isRealDate(patch.date)) return false;
  const from = patch.fromAccountId ?? mv.fromAccountId;
  const to = patch.toAccountId ?? mv.toAccountId;
  const before = mv.target;
  if (from !== mv.fromAccountId || to !== mv.toAccountId) {
    const active = (a: string) => d.accounts.some(x => x.id === a && !x.archived);
    if (isEnvelopesPool(mv.fromAccountId) || isEnvelopesPool(mv.toAccountId) || isEnvelopesPool(from) || isEnvelopesPool(to)) return false;
    if (to === CASH_ID ? !active(from) || isEnvelopeAccount(d.accounts.find(a => a.id === from)) : from === to || !active(from) || !active(to)) return false;
    mv.fromAccountId = from;
    mv.toAccountId = to;
    if (mv.target && (to === CASH_ID || !isValidTransferTarget(d, mv.month, to, mv.target))) delete mv.target;
  }
  mv.label = label;
  mv.amount = round2(patch.amount);
  if (patch.date !== undefined) {
    mv.day = Number(patch.date.slice(8, 10));
    if (patch.date === deducedDate(d, mv.month, mv.day)) delete mv.bankDate;
    else mv.bankDate = patch.date;
  }
  if (patch.detail !== undefined) applyDetail(mv, patch.detail);
  syncTarget(d, mv.month, before);
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

/**
 * Cuts one face of a linked transfer (spec 0016, RG19): the trace of that face is removed, the transfer stays with its other face, and the freed line of
 * the file can be imported again on its own. Refused (false) on a locked month, an unknown transfer, or a transfer that is not linked (a single face has
 * nothing to cut: delete it instead).
 */
export function unlinkMovementFace(d: BudgetData, id: string, face: 'debit' | 'credit'): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  if (!mv || isMonthLocked(d, mv.month) || linkStateOf(mv) !== 'lie') return false;
  if (face === 'credit') delete mv.creditTrace;
  else {
    // The credit face stays: the transfer is then dated by it.
    mv.bankDate = mv.creditTrace!.bankDate;
    delete mv.importAccountId;
    delete mv.fingerprint;
    delete mv.rank;
  }
  return true;
}
