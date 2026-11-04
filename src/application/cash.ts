import { daysInMonth } from '../domain/checkoff';
import { envelopeCashPart, reconcilableLines } from '../domain/cash';
import { round2 } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData, MonthKey } from '../domain/types';
import { addTransaction, setEnvelopeAllocation } from './actions';
import { closeBlockers, closeMonth, type CloseBlocker } from './monthClosing';

/*
 * Cash of a month (spec 0037): the cash part of an envelope, and the regularisation of the cash lines when the month is closed.
 * Each use case changes the data it is given and returns false (changing nothing) when a rule forbids it.
 */

/** Why a cash part cannot be set (RG11). */
export type CashPartRefusal = 'unknown' | 'locked' | 'invalid' | 'above-allocation';

/** The reason a cash part is refused for an envelope and a month, or null when it can be set. */
export function cashPartRefusal(d: BudgetData, m: MonthKey, envelopeId: string, amount: number): CashPartRefusal | null {
  const md = d.months[m];
  if (!md?.initialized || !d.envelopes.some(e => e.id === envelopeId)) return 'unknown';
  if (isMonthLocked(d, m)) return 'locked';
  if (!Number.isFinite(amount) || amount < 0) return 'invalid';
  if (round2(amount) > (md.alloc[envelopeId] ?? 0)) return 'above-allocation';
  return null;
}

/** Sets the cash part of an envelope for a month (0 clears it), or changes nothing and tells why (see `cashPartRefusal`). */
export function setEnvelopeCashPart(d: BudgetData, m: MonthKey, envelopeId: string, amount: number): CashPartRefusal | 'ok' {
  const refused = cashPartRefusal(d, m, envelopeId, amount);
  if (refused) return refused;
  const md = d.months[m];
  const next = round2(amount);
  if (next === 0) {
    if (md.cashPart) delete md.cashPart[envelopeId];
    if (md.cashPart && Object.keys(md.cashPart).length === 0) delete md.cashPart;
  } else (md.cashPart ??= {})[envelopeId] = next;
  return 'ok';
}

/** Why an allocation and its cash part cannot be set together (spec 0040, RG17). */
export type EnvelopeSplitRefusal = 'unknown' | 'locked' | 'invalid-allocation' | 'invalid-part' | 'part-above-allocation' | 'allocation-below-part';

/**
 * The reason the allocation and/or the cash part of an envelope are refused, or null when both can be set (spec 0040, RG17, RG18).
 * `null` for an amount means « leave as it is ». The pair is judged as a whole, before anything is written.
 */
export function envelopeSplitRefusal(d: BudgetData, m: MonthKey, envelopeId: string, allocation: number | null, part: number | null): EnvelopeSplitRefusal | null {
  const md = d.months[m];
  if (!md?.initialized || !d.envelopes.some(e => e.id === envelopeId)) return 'unknown';
  if (isMonthLocked(d, m)) return 'locked';
  if (allocation !== null && (!Number.isFinite(allocation) || allocation < 0)) return 'invalid-allocation';
  if (part !== null && (!Number.isFinite(part) || part < 0)) return 'invalid-part';
  const nextAllocation = round2(allocation ?? md.alloc[envelopeId] ?? 0);
  const nextPart = round2(part ?? envelopeCashPart(d, m, envelopeId));
  if (nextPart > nextAllocation) return part !== null ? 'part-above-allocation' : 'allocation-below-part';
  return null;
}

/**
 * Sets the allocation and the cash part of an envelope for a month in one go (spec 0040, RG18, RG19): all or nothing. The write order keeps
 * the intermediate state valid: the allocation first when it does not go below the current part, else the part first.
 */
export function setEnvelopeSplit(d: BudgetData, m: MonthKey, envelopeId: string, allocation: number | null, part: number | null): EnvelopeSplitRefusal | 'ok' {
  const refused = envelopeSplitRefusal(d, m, envelopeId, allocation, part);
  if (refused) return refused;
  const raisesFirst = allocation === null || round2(allocation) >= envelopeCashPart(d, m, envelopeId);
  if (raisesFirst) {
    if (allocation !== null) setEnvelopeAllocation(d, m, envelopeId, allocation);
    if (part !== null) setEnvelopeCashPart(d, m, envelopeId, part);
  } else {
    if (part !== null) setEnvelopeCashPart(d, m, envelopeId, part);
    if (allocation !== null) setEnvelopeAllocation(d, m, envelopeId, allocation);
  }
  return 'ok';
}

/** Label of the entry that regularises a cash line (RG19). */
export const RECONCILE_LABEL = 'Reste non saisi';

/**
 * Regularises cash lines: for each key given that the closing would propose (RG19, RG20), adds a cash expense « Reste non saisi » of budget − entered,
 * on the last day of the month, so that the actual of the line becomes its budget. No account is debited (RG7). Returns how many lines were regularised.
 */
export function reconcileCashLines(d: BudgetData, m: MonthKey, keys: string[], newId: () => string): number {
  if (isMonthLocked(d, m)) return 0;
  let done = 0;
  for (const l of reconcilableLines(d, m)) {
    if (!keys.includes(l.key)) continue;
    if (addTransaction(d, { id: newId(), month: m, day: daysInMonth(m), label: RECONCILE_LABEL, amount: l.rest, type: 'var', target: l.key, payMode: 'especes' })) done++;
  }
  return done;
}

/**
 * What would forbid closing `m` once the given cash lines are regularised: the regularisation changes the actuals, so it can change the amount
 * still available. Computed on a copy; the data given is left untouched.
 */
export function closeBlockersAfterReconcile(d: BudgetData, m: MonthKey, keys: string[]): CloseBlocker[] {
  const trial = structuredClone(d);
  reconcileCashLines(trial, m, keys, () => 'trial');
  return closeBlockers(trial, m);
}

/** Regularises the given cash lines then closes the month, all or nothing: refused (false, nothing changed) when the closing would be refused after the regularisation. */
export function closeMonthReconciling(d: BudgetData, m: MonthKey, keys: string[], newId: () => string): boolean {
  if (closeBlockersAfterReconcile(d, m, keys).length) return false;
  reconcileCashLines(d, m, keys, newId);
  return closeMonth(d, m);
}
