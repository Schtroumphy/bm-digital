import { round2 } from './format';
import { bankDateOf } from './lineExpenses';
import type { AccountMovement, BudgetData, ImportTrace, MonthKey } from './types';

/*
 * Internal transfers and the link between their two faces (spec 0016). A « face » is a line of the bank file: the debit of the sending
 * account or the credit of the receiving one. Pure helpers on `AccountMovement`; the import use cases and the balances read them.
 */

/** « Enveloppes (global) » (spec 0016, RG24): not an account, only a stand-in in `fromAccountId` / `toAccountId`. Never stored as a `BankAccount`. */
export const ENVELOPES_ID = 'enveloppes';
export const ENVELOPES_LABEL = 'Enveloppes (global)';
export const isEnvelopesPool = (accountId: string): boolean => accountId === ENVELOPES_ID;

/** Days allowed between the two faces of the same transfer (spec 0016, R1). */
export const FACE_TOLERANCE_DAYS = 3;

/** Name of an account of a movement, « Enveloppes (global) » included. */
export const movementAccountName = (d: BudgetData, accountId: string): string =>
  isEnvelopesPool(accountId) ? ENVELOPES_LABEL : d.accounts.find(a => a.id === accountId)?.name ?? 'Supprimé';

/** Date at which the sending account is debited: the debit face's date (or the only face's date, RG14). */
export const debitDateOf = (mv: AccountMovement): string => bankDateOf(mv);
/** Date at which the receiving account is credited: the credit face's date, else the debit's (RG14). */
export const creditDateOf = (mv: AccountMovement): string => mv.creditTrace?.bankDate ?? bankDateOf(mv);

/** The trace of the debit face (the flat import fields), if the movement has one. */
export function debitTraceOf(mv: AccountMovement): ImportTrace | undefined {
  return mv.importAccountId && mv.fingerprint && mv.rank ? { importAccountId: mv.importAccountId, fingerprint: mv.fingerprint, rank: mv.rank, bankDate: bankDateOf(mv) } : undefined;
}

/** « Lié » when both faces are traced, « debit » / « credit » for a movement with a single face, `null` when it has no trace (typed by hand). */
export type TransferLinkState = 'lie' | 'debit' | 'credit';
export function linkStateOf(mv: AccountMovement): TransferLinkState | null {
  const debit = debitTraceOf(mv) !== undefined;
  const credit = mv.creditTrace !== undefined;
  return debit && credit ? 'lie' : debit ? 'debit' : credit ? 'credit' : null;
}

/** All the import traces of a movement (one or two): each is a deduplication key, a key serving once whatever the face (RG16). */
export const tracesOf = (mv: AccountMovement): ImportTrace[] => [debitTraceOf(mv), mv.creditTrace].filter((t): t is ImportTrace => t !== undefined);

/** Whole days between two `YYYY-MM-DD` dates (absolute). */
export function daysBetween(a: string, b: string): number {
  const t = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  return Math.round(Math.abs(t(a) - t(b)) / 86_400_000);
}

/** A line of the file seen as the face of a transfer. */
export interface Face {
  id: string;
  /** Account of the app the line goes through. */
  accountId: string;
  /** Positive. */
  amount: number;
  /** `YYYY-MM-DD`. */
  date: string;
  credit: boolean;
}

const compatible = (debit: Face, credit: Face, tolerance: number): boolean =>
  !debit.credit && credit.credit && debit.accountId !== credit.accountId && round2(debit.amount) === round2(credit.amount) && daysBetween(debit.date, credit.date) <= tolerance;

/**
 * Pairs the debits and the credits of a list of faces (spec 0016, RG6, RG10): same amount, different accounts, dates within `tolerance` days,
 * and ONE possible match on each side. A face with several candidates, or whose only candidate has several, is `ambiguous`: nothing is paired
 * for it, the user links by hand. `accept` narrows the candidates further (the import asks that one of the two looks like a transfer).
 */
export function pairFaces(faces: Face[], tolerance = FACE_TOLERANCE_DAYS, accept: (debit: Face, credit: Face) => boolean = () => true): { pairs: [debitId: string, creditId: string][]; ambiguous: Set<string> } {
  const debits = faces.filter(f => !f.credit);
  const credits = faces.filter(f => f.credit);
  const fits = (debit: Face, credit: Face) => compatible(debit, credit, tolerance) && accept(debit, credit);
  const candidatesOf = (f: Face) => (f.credit ? debits.filter(x => fits(x, f)) : credits.filter(x => fits(f, x)));
  const pairs: [string, string][] = [];
  const ambiguous = new Set<string>();
  for (const f of faces) {
    const mine = candidatesOf(f);
    if (mine.length === 0) continue;
    const other = mine[0];
    if (mine.length === 1 && candidatesOf(other).length === 1) {
      if (!f.credit) pairs.push([f.id, other.id]);
    } else ambiguous.add(f.id);
  }
  return { pairs, ambiguous };
}

/** Whether two faces can be linked by hand (RG9, RG10): same rule as the automatic pairing, one debit and one credit. */
export const canLinkFaces = (debit: Face, credit: Face, tolerance = FACE_TOLERANCE_DAYS): boolean => compatible(debit, credit, tolerance);

/**
 * The movement with a single face that a new face completes (spec 0016, RG13): same two accounts, same amount, dates within the tolerance, and
 * the opposite face still missing. A movement through « Enveloppes (global) » has no other account to complete (RG26). `otherAccountId` narrows
 * the search to a known other end; the closest date wins.
 */
export function findCompletable(d: BudgetData, face: { accountId: string; credit: boolean; amount: number; date: string }, otherAccountId?: string, tolerance = FACE_TOLERANCE_DAYS): AccountMovement | null {
  let best: { mv: AccountMovement; gap: number } | null = null;
  for (const mv of d.accountMovements ?? []) {
    if (isEnvelopesPool(mv.fromAccountId) || isEnvelopesPool(mv.toAccountId) || round2(mv.amount) !== round2(face.amount)) continue;
    const state = linkStateOf(mv);
    // A credit completes a movement that has only its debit face, and the other way round.
    if (state !== (face.credit ? 'debit' : 'credit')) continue;
    if ((face.credit ? mv.toAccountId : mv.fromAccountId) !== face.accountId) continue;
    if (otherAccountId !== undefined && (face.credit ? mv.fromAccountId : mv.toAccountId) !== otherAccountId) continue;
    const gap = daysBetween(face.credit ? debitDateOf(mv) : creditDateOf(mv), face.date);
    if (gap <= tolerance && (!best || gap < best.gap)) best = { mv, gap };
  }
  return best?.mv ?? null;
}

/** True when at least one transfer of the month goes « vers enveloppes »: the allocations of that month are then no longer counted (RG28). */
export const hasEnvelopesDebit = (d: BudgetData, m: MonthKey): boolean => (d.accountMovements ?? []).some(mv => mv.month === m && isEnvelopesPool(mv.toAccountId));

/** « Réparti dans les enveloppes » (RG29): what the global debits of the month sent, and what the individual credits of the same month received. Information only. */
export function envelopeSplit(d: BudgetData, m: MonthKey): { sent: number; distributed: number } {
  const mvs = (d.accountMovements ?? []).filter(mv => mv.month === m);
  return {
    sent: round2(mvs.filter(mv => isEnvelopesPool(mv.toAccountId)).reduce((s, mv) => s + mv.amount, 0)),
    distributed: round2(mvs.filter(mv => isEnvelopesPool(mv.fromAccountId)).reduce((s, mv) => s + mv.amount, 0)),
  };
}
