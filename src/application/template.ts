import { round2 } from '../domain/format';
import type { BlockKey, BudgetData, TemplateLine } from '../domain/types';

/*
 * Edition of the budget model (`BudgetData.template`) from the « Modèle » screen.
 * Only the model changes: months already created keep their own lines until the model is applied to them.
 */

/** Adds an empty line at the end of a block (or of one of its sections). */
export function addTemplateLine(d: BudgetData, block: BlockKey, key: string, section = ''): void {
  const lines = d.template.lines;
  let idx = -1;
  lines.forEach((l, i) => {
    if (l.block === block && (section === '' || l.section === section)) idx = i;
  });
  const sec = section || (idx >= 0 ? lines[idx].section : '');
  lines.splice(idx >= 0 ? idx + 1 : lines.length, 0, { key, block, section: sec, name: 'Nouvelle ligne', budget: 0 });
}

/** Edits a model line. Returns false for an unknown line or an invalid budget. */
export function updateTemplateLine(d: BudgetData, key: string, patch: Partial<Pick<TemplateLine, 'name' | 'budget' | 'actual'>>): boolean {
  const l = d.template.lines.find(x => x.key === key);
  if (!l || (patch.budget !== undefined && !(patch.budget >= 0))) return false;
  Object.assign(l, patch);
  if (patch.budget !== undefined) l.budget = round2(patch.budget);
  if (typeof patch.actual === 'number') l.actual = round2(patch.actual);
  return true;
}

export function deleteTemplateLine(d: BudgetData, key: string): boolean {
  const before = d.template.lines.length;
  d.template.lines = d.template.lines.filter(l => l.key !== key);
  return d.template.lines.length < before;
}

/** Default monthly allocation of an envelope in the model. Returns false for an unknown envelope or a negative amount. */
export function setTemplateAllocation(d: BudgetData, envelopeId: string, amount: number): boolean {
  if (!d.envelopes.some(e => e.id === envelopeId) || !(amount >= 0)) return false;
  d.template.envAlloc[envelopeId] = round2(amount);
  return true;
}
