import { applyAnnotation, isAnnotationTooLong, type OperationRef } from '../domain/annotation';
import type { AccountMovement, BudgetData, Transaction } from '../domain/types';

const find = (d: BudgetData, ref: OperationRef): Transaction | AccountMovement | undefined =>
  ref.kind === 'tx' ? d.transactions.find(t => t.id === ref.id) : d.accountMovements?.find(m => m.id === ref.id);

/**
 * Sets, replaces or removes the annotation of one or several operations (spec 0047, RG1, RG2, RG9): the same text goes on each of them. An empty text
 * (after trimming) removes it. All or nothing: refused (false) for an unknown operation or a text over 500 characters (refused, not cut).
 * No lock check: an annotation changes no figure, so it stays editable on a closed or locked month (RG5, RG6).
 */
export function annotateOperations(d: BudgetData, refs: OperationRef[], raw: string): boolean {
  if (isAnnotationTooLong(raw)) return false;
  const found = refs.map(r => find(d, r));
  if (found.some(op => op === undefined)) return false;
  for (const op of found) applyAnnotation(op!, raw);
  return true;
}

/** Annotation of one operation: same rule, for the edit from the Budget list or from the Opérations screen (RG10, RG12). Empty text removes it. */
export const setOperationAnnotation = (d: BudgetData, ref: OperationRef, raw: string): boolean => annotateOperations(d, [ref], raw);

/** Among the operations about to receive a text, those that already carry an annotation: the ones the user must confirm to overwrite (RG9). */
export const alreadyAnnotated = (d: BudgetData, refs: OperationRef[]): OperationRef[] => refs.filter(r => find(d, r)?.annotation !== undefined);
