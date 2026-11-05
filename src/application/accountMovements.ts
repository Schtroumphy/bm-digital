import { applyDetail, normalizeDetail } from '../domain/detail';
import { round2 } from '../domain/format';
import { daysInMonth } from '../domain/checkoff';
import { isMonthLocked } from '../domain/ledger';
import { deducedDate, isRealDate } from '../domain/periods';
import { syncLineActual } from '../domain/lineActuals';
import { CASH_ID, isEnvelopesPool, linkStateOf } from '../domain/internalTransfers';
import { isEnvelopeAccount } from '../domain/bank';
import { amountForLines, isManualMovement, isValidTransferTargets, proposableLines } from '../domain/movementLines';
import { lineKeysOf, targetsOf } from '../domain/movementTargets';
import type { AccountMovement, BudgetData, MonthKey, MovementTarget } from '../domain/types';

/*
 * Transfers (« Transfert », spec 0019): money moving from one of the user's accounts to another (withdrawal, internal transfer, savings payment,
 * envelope funding). Created by the CSV import (spec 0013) or typed in the Saisie screen (RG14); edited (label, amount, targets) or deleted afterwards.
 * A locked month refuses all of it, like a transaction (RG17). A transfer attached to a savings/investment line feeds that line's actual (RG16).
 */

/** The savings/investment line a transfer is attached to has its actual recomputed from its transfers. */
function syncTargets(d: BudgetData, month: MonthKey, targets: MovementTarget[] = []) {
  for (const key of lineKeysOf({ targets })) syncLineActual(d, month, key);
}

/** The keys of the variable lines among the targets of a transfer to `to` (spec 0045): empty for an envelope / savings target or no target. */
function varLineKeys(d: BudgetData, month: MonthKey, to: string, targets: MovementTarget[]): string[] {
  const proposable = proposableLines(d, month, to);
  return lineKeysOf({ targets }).filter(k => proposable.some(l => l.key === k));
}

/** The targets that still fit a new destination (spec 0045, RG13): the variable lines of the new account, or the single envelope / savings target if it still fits. */
function fittingTargets(d: BudgetData, month: MonthKey, to: string, targets: MovementTarget[]): MovementTarget[] {
  if (to === CASH_ID) return [];
  const kept = varLineKeys(d, month, to, targets);
  if (kept.length > 0) return kept.map(key => ({ kind: 'line' as const, key }));
  return targets.length === 1 && isValidTransferTargets(d, month, to, targets) ? targets : [];
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
  /**
   * Optional: the budget items the transfer stands for (spec 0045, RG1, RG2): one envelope / savings item, or several variable lines of the destination
   * account. A transfer typed by hand with variable lines takes the sum of their budgets as its amount (RG4).
   */
  targets?: MovementTarget[];
  detail?: string;
}

/**
 * Records a transfer typed by hand (RG14). Refused (false) on a locked or not created month, an empty label, an amount that is not positive,
 * a day outside the month (or an unreal bank date), two identical or unknown or archived accounts, and targets that do not exist in the month, do not
 * receive the money on the destination account, or mix an envelope / savings item with variable lines. The destination can be `CASH_ID` (a cash withdrawal, spec 0037, RG1): the source is then any active
 * account that is not an envelope's, and the withdrawal stands for no budget item (RG2).
 */
export function addTransfer(d: BudgetData, input: NewTransfer): boolean {
  const label = input.label.trim();
  const active = (id: string) => d.accounts.some(a => a.id === id && !a.archived);
  if (!d.months[input.month]?.initialized || isMonthLocked(d, input.month) || !label || !(input.amount > 0)) return false;
  if (input.bankDate !== undefined ? !isRealDate(input.bankDate) || Number(input.bankDate.slice(8, 10)) !== input.day : !Number.isInteger(input.day) || input.day < 1 || input.day > daysInMonth(input.month)) return false;
  const withdrawal = input.toAccountId === CASH_ID;
  if (withdrawal ? !active(input.fromAccountId) || targetsOf(input).length > 0 || isEnvelopeAccount(d.accounts.find(a => a.id === input.fromAccountId)) : input.fromAccountId === input.toAccountId || !active(input.fromAccountId) || !active(input.toAccountId)) return false;
  const targets = targetsOf(input);
  if (!isValidTransferTargets(d, input.month, input.toAccountId, targets)) return false;
  const lines = varLineKeys(d, input.month, input.toAccountId, targets);
  const fromLines = lines.length > 0 ? amountForLines(d, input.month, input.toAccountId, lines) : 0;
  const detail = normalizeDetail(input.detail);
  const mv: AccountMovement = {
    id: input.id, month: input.month, day: input.day, ...(input.bankDate ? { bankDate: input.bankDate } : {}), label, amount: fromLines > 0 ? fromLines : round2(input.amount),
    fromAccountId: input.fromAccountId, toAccountId: input.toAccountId,
    ...(targets.length > 0 ? { targets } : {}),
    ...(detail === undefined ? {} : { detail }),
  };
  (d.accountMovements ??= []).push(mv);
  syncTargets(d, mv.month, mv.targets);
  return true;
}

/**
 * Changes the label and the amount of a transfer, and its detail when `patch.detail` is given (spec 0020, RG6; empty clears it).
 * Refused (false) on a locked month, an empty label or an amount that is not positive, and for a changed amount on a transfer linked to
 * two lines of the bank file (« Lié »): both lines have that amount, the transfer has to be unlinked or deleted first (spec 0016, RG15).
 * `date` (`YYYY-MM-DD`, a real date) changes its bank date, as for an expense: the month of attachment stays; the date is kept only when the day alone does not give it.
 * `fromAccountId` / `toAccountId` change its accounts, under the rules of `addTransfer` (active, different, cash withdrawal only from a non-envelope
 * account); refused for a transfer from or to the envelopes pool. The import traces are kept (they carry their own account). A new destination drops the targets
 * that no longer fit it (spec 0045, RG13).
 * `targets` replaces the budget items of the transfer (RG1, RG2; refused when they do not fit the destination). The amount of a transfer typed by hand
 * that has variable lines is the sum of their budgets, fixed when a line is added (RG5) and when the destination drops lines (RG13); `patch.amount` is then
 * ignored. Removing a line, or all of them, leaves the amount as it is (RG5, RG6). An imported transfer keeps its amount whatever its lines (RG7).
 */
export function updateAccountMovement(d: BudgetData, id: string, patch: { label: string; amount: number; detail?: string; date?: string; fromAccountId?: string; toAccountId?: string; targets?: MovementTarget[] }): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  const label = patch.label.trim();
  if (!mv || isMonthLocked(d, mv.month) || !label || !(patch.amount > 0)) return false;
  if (linkStateOf(mv) === 'lie' && round2(patch.amount) !== mv.amount) return false;
  if (patch.date !== undefined && !isRealDate(patch.date)) return false;
  const from = patch.fromAccountId ?? mv.fromAccountId;
  const to = patch.toAccountId ?? mv.toAccountId;
  const moved = from !== mv.fromAccountId || to !== mv.toAccountId;
  if (moved) {
    const active = (a: string) => d.accounts.some(x => x.id === a && !x.archived);
    if (isEnvelopesPool(mv.fromAccountId) || isEnvelopesPool(mv.toAccountId) || isEnvelopesPool(from) || isEnvelopesPool(to)) return false;
    if (to === CASH_ID ? !active(from) || isEnvelopeAccount(d.accounts.find(a => a.id === from)) : from === to || !active(from) || !active(to)) return false;
  }
  const before = targetsOf(mv);
  if (patch.targets !== undefined && !isValidTransferTargets(d, mv.month, to, patch.targets)) return false;
  const asked = patch.targets ?? before;
  const next = moved ? fittingTargets(d, mv.month, to, asked) : asked;
  const nextLines = varLineKeys(d, mv.month, to, next);
  const previousLines = varLineKeys(d, mv.month, mv.toAccountId, before);
  const added = nextLines.some(k => !previousLines.includes(k));
  const dropped = moved && next.length < asked.length;
  const fixedByLines = isManualMovement(mv) && nextLines.length > 0;
  mv.fromAccountId = from;
  mv.toAccountId = to;
  if (next.length > 0) mv.targets = next;
  else delete mv.targets;
  mv.label = label;
  if (!fixedByLines) mv.amount = round2(patch.amount);
  else if (added || (moved && dropped)) mv.amount = amountForLines(d, mv.month, to, nextLines);
  if (patch.date !== undefined) {
    mv.day = Number(patch.date.slice(8, 10));
    if (patch.date === deducedDate(d, mv.month, mv.day)) delete mv.bankDate;
    else mv.bankDate = patch.date;
  }
  if (patch.detail !== undefined) applyDetail(mv, patch.detail);
  syncTargets(d, mv.month, before);
  syncTargets(d, mv.month, mv.targets);
  return true;
}

/**
 * Replaces the budget items of a transfer, or detaches them all with `[]` (RG10, RG11: « Rattacher »; spec 0045). Refused (false) on a locked month, an
 * unknown transfer, or targets that do not fit the destination of the transfer (RG1, RG2). The amount follows the rules of `updateAccountMovement` (RG4 to RG7).
 */
export function setTransferTargets(d: BudgetData, id: string, targets: MovementTarget[]): boolean {
  const mv = d.accountMovements?.find(x => x.id === id);
  if (!mv) return false;
  return updateAccountMovement(d, id, { label: mv.label, amount: mv.amount, targets });
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
  syncTargets(d, mv.month, mv.targets);
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
