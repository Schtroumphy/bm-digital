import { categoryUsage, isCategorizableType, nextCategoryHue, parseCategoryName } from '../domain/categories';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData } from '../domain/types';

/*
 * Categories of expenses (spec 0046): manage the list and give a category to entries. Every function works on a copy of the data (the store
 * clones it), checks first and changes nothing when it refuses.
 */

/** Adds a category at the end of the list, with the next hue (RG1, RG3). Returns an error message in French, or null when added. */
export function addCategory(d: BudgetData, name: string, id: string): string | null {
  const list = d.categories ?? [];
  const parsed = parseCategoryName(name, list);
  if ('error' in parsed) return parsed.error;
  d.categories = [...list, { id, name: parsed.value, hue: nextCategoryHue(list) }];
  return null;
}

/** Renames a category: id, hue and associations are kept (RG4). Returns an error message, or null when renamed. */
export function renameCategory(d: BudgetData, id: string, name: string): string | null {
  const list = d.categories ?? [];
  if (!list.some(c => c.id === id)) return 'Catégorie introuvable';
  const parsed = parseCategoryName(name, list, id);
  if ('error' in parsed) return parsed.error;
  d.categories = list.map(c => (c.id === id ? { ...c, name: parsed.value } : c));
  return null;
}

/** Sets the emoji of a category ('' = back to the one suggested by its name). Returns an error message, or null when applied. */
export function setCategoryEmoji(d: BudgetData, id: string, emoji: string): string | null {
  const list = d.categories ?? [];
  if (!list.some(c => c.id === id)) return 'Catégorie introuvable';
  d.categories = list.map(c => {
    if (c.id !== id) return c;
    const { emoji: _old, ...rest } = c;
    return emoji ? { ...rest, emoji } : rest;
  });
  return null;
}

/** Message shown on the disabled « Supprimer » button of a used category (RG5). */
export const usedMessage = (count: number): string => `Utilisée par ${count} dépense${count > 1 ? 's' : ''}`;

/**
 * Deletes a category that no entry carries, all months together (RG5). Remembered import rules lose their category (RG14).
 * Returns an error message, or null when deleted.
 */
export function deleteCategory(d: BudgetData, id: string): string | null {
  const list = d.categories ?? [];
  if (!list.some(c => c.id === id)) return 'Catégorie introuvable';
  const used = categoryUsage(d, id);
  if (used > 0) return usedMessage(used);
  d.categories = list.filter(c => c.id !== id);
  if (d.importRules) d.importRules = d.importRules.map(r => {
    if (r.categoryId !== id) return r;
    const { categoryId: _removed, ...rest } = r;
    return rest;
  });
  return null;
}

/** Why a category change was refused: unknown entry or category, type that cannot carry one (RG7), locked month (RG10). */
export type CategoryRefusal = 'unknown' | 'type' | 'locked';

/**
 * Gives an entry a category, or removes it (`categoryId` undefined = « Sans catégorie »). Only `var`, `env`, `fix` and `epd` entries can carry
 * one (RG7), and not those of a closed month (RG10). Returns null when applied, the reason otherwise.
 */
export function setTransactionCategory(d: BudgetData, transactionId: string, categoryId: string | undefined): CategoryRefusal | null {
  const t = d.transactions.find(x => x.id === transactionId);
  if (!t) return 'unknown';
  if (categoryId !== undefined && !(d.categories ?? []).some(c => c.id === categoryId)) return 'unknown';
  if (!isCategorizableType(t.type)) return 'type';
  if (isMonthLocked(d, t.month)) return 'locked';
  if (categoryId === undefined) delete t.categoryId;
  else t.categoryId = categoryId;
  return null;
}

/** Result of a grouped classification: how many entries changed, how many were left aside (RG12). */
export interface GroupedCategoryResult {
  changed: number;
  ignored: number;
}

/** Applies a category to a selection of entries in one go; entries that cannot take it (type, closed month) are counted as ignored (RG12). */
export function setCategoryOnSelection(d: BudgetData, ids: string[], categoryId: string | undefined): GroupedCategoryResult {
  let changed = 0;
  for (const id of ids) if (setTransactionCategory(d, id, categoryId) === null) changed += 1;
  return { changed, ignored: ids.length - changed };
}

/** Message of a grouped classification (RG12). */
export function groupedMessage(r: GroupedCategoryResult): string {
  const done = `${r.changed} écriture${r.changed > 1 ? 's' : ''} classée${r.changed > 1 ? 's' : ''}`;
  return r.ignored > 0 ? `${done}, ${r.ignored} ignorée${r.ignored > 1 ? 's' : ''} (type non catégorisable ou mois clôturé)` : done;
}
