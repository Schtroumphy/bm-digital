import { round2 } from './format';
import { isTransactionInBudget } from './bank';
import type { BudgetData, Category, MonthKey, Transaction, TxType } from './types';

/*
 * Categories of expenses (spec 0046). Pure functions: the rules of the names, the default list, the usage count and the breakdown of a month.
 * Not to be mixed up with `Transaction.category`, the free text of the bank file (spec 0013, RG37), which these functions never read.
 */

export const CATEGORY_NAME_MAX = 40;

/** The expense types that can carry a category (RG7). `epa`, `rev`, `envin`, `accin` cannot. */
export const CATEGORIZABLE_TYPES: readonly TxType[] = ['var', 'env', 'fix', 'epd'];
export const isCategorizableType = (type: TxType): boolean => CATEGORIZABLE_TYPES.includes(type);

/** Default list, created once when the data have no list yet (RG2). */
export const DEFAULT_CATEGORY_NAMES = ['Alimentation', 'Logement', 'Transport', 'Loisirs', 'Santé', 'Abonnements', 'Autres'] as const;

/** Name compared without case, accents and outer spaces (RG1). */
export const normalizeCategoryName = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Golden angle: two categories created one after the other are far apart on the colour wheel (RG3). */
const HUE_STEP = 137;
const HUE_START = 28;

/** Hue given to the category that follows the last one of the list; never edited afterwards (RG3). */
export const nextCategoryHue = (categories: Category[]): number =>
  categories.length === 0 ? HUE_START : (categories[categories.length - 1].hue + HUE_STEP) % 360;

/** Trimmed name, or a message in French when it is empty, too long or already used by another category (RG1). `exceptId` = the category being renamed. */
export function parseCategoryName(text: string, categories: Category[], exceptId?: string): { value: string } | { error: string } {
  const name = text.trim();
  if (!name) return { error: 'Saisissez un nom' };
  if (name.length > CATEGORY_NAME_MAX) return { error: `${CATEGORY_NAME_MAX} caractères maximum` };
  const key = normalizeCategoryName(name);
  if (categories.some(c => c.id !== exceptId && normalizeCategoryName(c.name) === key)) return { error: 'Cette catégorie existe déjà' };
  return { value: name };
}

/** The default list, with fixed ids (so a second run produces the same categories) and spread hues. */
export function defaultCategories(): Category[] {
  const list: Category[] = [];
  DEFAULT_CATEGORY_NAMES.forEach(name => {
    list.push({ id: `cat-${normalizeCategoryName(name)}`, name, hue: nextCategoryHue(list) });
  });
  return list;
}

/**
 * Gives the data their default list when they have none yet (RG2). A list the user emptied is `[]`, not absent: it is left alone.
 * Pure: the data given are returned untouched when there is nothing to do.
 */
export function withDefaultCategories(d: BudgetData): BudgetData {
  return d.categories === undefined ? { ...d, categories: defaultCategories() } : d;
}

/**
 * Filter « Sans catégorie » (RG26): an entry that COULD carry a category (RG7) and has none, or whose category no longer exists.
 * Entries that cannot carry one (revenues, `envin`, `accin`, `epa`) are never « sans catégorie ».
 */
export const isUncategorized = (d: BudgetData, t: Pick<Transaction, 'type' | 'categoryId'>): boolean =>
  isCategorizableType(t.type) && (t.categoryId === undefined || !(d.categories ?? []).some(c => c.id === t.categoryId));

/** Number of entries carrying the category, all months together, closed ones included (RG5, RG21). */
export const categoryUsage = (d: BudgetData, id: string): number => d.transactions.filter(t => t.categoryId === id).length;

export interface CategoryShare {
  /** Null = the « Sans catégorie » row. */
  category: Category | null;
  amount: number;
  /** Percent of the month's total, unrounded. */
  share: number;
  count: number;
}

export interface CategoryBreakdown {
  /** Total of the month's counted expenses, categorised or not. */
  total: number;
  /** Counted expenses with no category (RG19). */
  uncategorizedCount: number;
  /** Categories with at least one expense, by decreasing amount then alphabetical order (RG18). */
  rows: CategoryShare[];
  /** « Sans catégorie », shown last; null when it holds nothing. */
  none: CategoryShare | null;
}

/** Whether an entry enters the breakdown: a categorisable type, attached to the month, inside the budget (RG16, RG17). */
const counted = (d: BudgetData, t: Transaction, month: MonthKey): boolean => t.month === month && isCategorizableType(t.type) && isTransactionInBudget(d, t);

/**
 * Breakdown of a month by category (RG16 to RG19). The month is the budget month of the entry (`month`, not the bank date). An entry of a
 * month with no expenses (future, not initialised) gives an empty breakdown. An `envin` entry is never counted and carries no category.
 * An entry whose category no longer exists counts as « Sans catégorie ».
 */
export function categoryBreakdown(d: BudgetData, month: MonthKey): CategoryBreakdown {
  const categories = d.categories ?? [];
  const known = new Set(categories.map(c => c.id));
  const sums = new Map<string, { amount: number; count: number }>();
  let noneAmount = 0;
  let noneCount = 0;
  let total = 0;
  for (const t of d.transactions) {
    if (!counted(d, t, month)) continue;
    total += t.amount;
    if (t.categoryId !== undefined && known.has(t.categoryId)) {
      const s = sums.get(t.categoryId) ?? { amount: 0, count: 0 };
      sums.set(t.categoryId, { amount: s.amount + t.amount, count: s.count + 1 });
    } else {
      noneAmount += t.amount;
      noneCount += 1;
    }
  }
  total = round2(total);
  const share = (amount: number) => (total > 0 ? (amount / total) * 100 : 0);
  const rows: CategoryShare[] = categories
    .filter(c => sums.has(c.id))
    .map(c => {
      const s = sums.get(c.id)!;
      const amount = round2(s.amount);
      return { category: c, amount, share: share(amount), count: s.count };
    })
    .sort((a, b) => b.amount - a.amount || a.category!.name.localeCompare(b.category!.name, 'fr'));
  const amount = round2(noneAmount);
  return { total, uncategorizedCount: noneCount, rows, none: noneCount > 0 ? { category: null, amount, share: share(amount), count: noneCount } : null };
}

export interface PieSlice {
  /** Category id, or `none` for « Sans catégorie ». */
  id: string;
  name: string;
  amount: number;
  /** Percent of the month's total. */
  share: number;
  /** Hue of the category; null = the grey « Sans catégorie » slice. */
  hue: number | null;
  /** Start and end of the slice as a fraction of the circle, from 0 (top) to 1, clockwise. */
  from: number;
  to: number;
}

/**
 * Slices of the pie of a month's breakdown (spec 0046, RG25): the same rows as the list (categories by decreasing amount, « Sans catégorie » last,
 * categories at 0 left out). Empty when the month has no expenses.
 */
export function pieSlices(b: CategoryBreakdown): PieSlice[] {
  if (b.total <= 0) return [];
  let cursor = 0;
  return [...b.rows, ...(b.none ? [b.none] : [])]
    .filter(r => r.amount > 0)
    .map(r => {
      const from = cursor;
      cursor += r.amount / b.total;
      return { id: r.category?.id ?? 'none', name: r.category?.name ?? 'Sans catégorie', amount: r.amount, share: r.share, hue: r.category?.hue ?? null, from, to: Math.min(cursor, 1) };
    });
}

/** An entry of the detail of a category (RG28): what the unfolded row lists. */
export interface CategoryEntry {
  id: string;
  /** Real date `YYYY-MM-DD`: the bank date when there is one, else the day in the budget month. */
  date: string;
  label: string;
  amount: number;
}

/**
 * Entries behind one row of the breakdown (RG28): those `categoryBreakdown` counted for that category in that month, newest first.
 * `categoryId` null = the « Sans catégorie » row (no category, or one that no longer exists). Same selection as the breakdown, so the
 * amounts always add up to the row: `envin` never, nothing out of the budget or assigned, budget month.
 */
export function categoryEntries(d: BudgetData, month: MonthKey, categoryId: string | null): CategoryEntry[] {
  const known = new Set((d.categories ?? []).map(c => c.id));
  return d.transactions
    .filter(t => counted(d, t, month))
    .filter(t => (categoryId === null ? t.categoryId === undefined || !known.has(t.categoryId) : t.categoryId === categoryId))
    .map(t => ({ id: t.id, date: t.bankDate ?? `${t.month}-${String(t.day).padStart(2, '0')}`, label: t.label, amount: t.amount }))
    .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label, 'fr'));
}
