import { isSavingsBlock } from './bank';
import { bankDateOf } from './lineExpenses';
import type { AccountMovement, BudgetData, Line, MonthKey, Transaction, TxType } from './types';

/** Longest annotation of an operation (spec 0047, RG2). */
export const ANNOTATION_MAX = 500;

/** Trimmed text of an annotation, `undefined` when empty (= no annotation). Line breaks inside the text are kept. Does not cut: see `isAnnotationTooLong`. */
export function normalizeAnnotation(raw: string | null | undefined): string | undefined {
  const text = (raw ?? '').trim();
  return text === '' ? undefined : text;
}

/** True when the trimmed text is over the limit: the input is refused, never cut (spec 0047, RG2). */
export const isAnnotationTooLong = (raw: string): boolean => raw.trim().length > ANNOTATION_MAX;

/** Sets the normalized annotation on an operation, or removes the property when the text is empty, so it looks like one saved before annotations existed. */
export function applyAnnotation(op: { annotation?: string }, raw: string): void {
  const text = normalizeAnnotation(raw);
  if (text === undefined) delete op.annotation;
  else op.annotation = text;
}

/** The operation with its annotation normalized, or without the property when it is empty, so it looks like one saved before annotations existed. */
export function withAnnotation<T extends { annotation?: string }>(op: T): T {
  const { annotation, ...rest } = op;
  const text = normalizeAnnotation(annotation);
  return (text === undefined ? rest : { ...rest, annotation: text }) as T;
}

/** Search of the Opérations screen (spec 0051, RG9): the text is looked for in the label and in the annotation, ignoring case. An empty search matches everything. */
export function matchesEntrySearch(entry: { label: string; annotation?: string }, search: string): boolean {
  const q = search.trim().toLowerCase();
  return q === '' || entry.label.toLowerCase().includes(q) || (entry.annotation ?? '').toLowerCase().includes(q);
}

/** Which family an operation belongs to: a transaction (`tx`) or a transfer between accounts (`mv`). Ids are unique within a family only. */
export type OperationKind = 'tx' | 'mv';

/** Points at one operation, whatever its family. */
export interface OperationRef {
  kind: OperationKind;
  id: string;
}

/** An operation attached to a line (RG11), as the Budget lists it. */
export interface AttachedOperation extends OperationRef {
  /** `YYYY-MM-DD`, date at the bank. */
  date: string;
  label: string;
  /** Signed for a transaction (expense negative, entry positive); positive for a transfer, which has no sign of its own. */
  amount: number;
  annotation?: string;
}

/** Transaction types whose `target` is a budget line (an envelope or an account for the others). */
const LINE_TYPES = new Set<TxType>(['var', 'fix', 'rev', 'epd', 'epa']);
/** Types that bring money in. */
const ENTRY_TYPES = new Set<TxType>(['rev', 'epa', 'envin', 'accin']);

const signed = (t: Transaction): number => (ENTRY_TYPES.has(t.type) ? t.amount : -t.amount);

/**
 * The operations of a month attached to a line (spec 0047, RG11): imputed to the line (a transaction of a line type, or a transfer one of whose targets
 * is the line), or assigned to the account linked to a savings or investment line (spec 0028). An envelope, an account with no link to the line and an
 * operation « hors budget » (spec 0031) are not attached. Oldest first.
 */
export function attachedOperations(d: BudgetData, month: MonthKey, line: Pick<Line, 'key' | 'block' | 'linkedAccountId'>): AttachedOperation[] {
  const linked = isSavingsBlock(line.block) ? line.linkedAccountId : undefined;
  const fromTx = d.transactions
    .filter(t => t.month === month && !t.offBudget && ((LINE_TYPES.has(t.type) && t.target === line.key) || (linked !== undefined && t.assignedAccountId === linked)))
    .map((t): AttachedOperation => ({ kind: 'tx', id: t.id, date: bankDateOf(t, d), label: t.label, amount: signed(t), ...(t.annotation ? { annotation: t.annotation } : {}) }));
  const fromMv = (d.accountMovements ?? [])
    .filter(m => m.month === month && (m.targets ?? []).some(x => x.kind === 'line' && x.key === line.key))
    .map((m: AccountMovement): AttachedOperation => ({ kind: 'mv', id: m.id, date: bankDateOf(m, d), label: m.label, amount: m.amount, ...(m.annotation ? { annotation: m.annotation } : {}) }));
  return [...fromTx, ...fromMv].sort((a, b) => a.date.localeCompare(b.date));
}

/** The attached operations that carry an annotation: what the Budget shows beside the name of the line (RG10). */
export const annotatedOperations = (d: BudgetData, month: MonthKey, line: Pick<Line, 'key' | 'block' | 'linkedAccountId'>): AttachedOperation[] =>
  attachedOperations(d, month, line).filter(o => o.annotation !== undefined);
