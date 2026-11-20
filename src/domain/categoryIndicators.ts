import { categoryBreakdown } from './categories';
import { budgetGap, budgetOf, type BudgetGap } from './categoryBudgets';
import { addMonths, compareMonths, round2 } from './format';
import type { BudgetData, Category, MonthKey } from './types';

/*
 * Category indicators (spec 0052). Pure functions: the month shown is compared with the monthly average of its calendar year, computed on the
 * past months only. Every monthly amount comes from `categoryBreakdown`, so the figures are the ones of the « Répartition » tab.
 */

/** Number of months of the trend, the month shown included (RG9). */
export const TREND_MONTHS = 6;

/**
 * Reference months (RG1, CA2): January of the year of `month` up to the month before `month` or the month before `today` (a month key),
 * whichever comes first. So March shown = January and February; a future month keeps the past months of its year. The current month and the
 * future never belong to it. Empty when there is none (RG4).
 */
export function referenceMonths(month: MonthKey, today: MonthKey): MonthKey[] {
  const year = month.slice(0, 4);
  const list: MonthKey[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    if (compareMonths(key, today) < 0 && compareMonths(key, month) < 0) list.push(key);
  }
  return list;
}

/** Gap to the average (RG5). `percent` is null when it cannot be computed; `isNew` = average 0 and amount > 0 (« nouveau »). */
export interface Variation {
  delta: number;
  percent: number | null;
  isNew: boolean;
}

export function variation(amount: number, average: number): Variation {
  const delta = round2(amount - average);
  if (average > 0) return { delta, percent: (delta / average) * 100, isNew: false };
  return { delta, percent: null, isNew: amount > 0 };
}

export interface IndicatorRow {
  /** Null = the « Sans catégorie » row. */
  category: Category | null;
  /** Amount of the month shown. */
  amount: number;
  /** Monthly average over the reference months; null without reference (RG4). */
  average: number | null;
  /** Gap to the average; null without reference. */
  variation: Variation | null;
  /** Budget of the month (spec 0054); null = no budget, or budgets not asked for (RG3). Always null for « Sans catégorie » (RG2). */
  budget: number | null;
  /** Real − budget; null without budget. */
  budgetGap: BudgetGap | null;
  /** Amounts of the last `TREND_MONTHS` months, the month shown last; null = future month, no point (RG9). */
  trend: (number | null)[];
}

export interface IndicatorSummary {
  total: number;
  /** Monthly average of the total; null without reference. */
  average: number | null;
  variation: Variation | null;
  /** Category with the biggest rise in € (gap > 0), « Sans catégorie » excluded; null when none (RG10b). */
  topRise: IndicatorRow | null;
  /** Category with the biggest fall in € (gap < 0), « Sans catégorie » excluded; null when none (RG10c). */
  topFall: IndicatorRow | null;
  uncategorizedAmount: number;
  uncategorizedCount: number;
}

export interface CategoryIndicators {
  /** The month shown is the current one (spec 0054, RG20): no gap to the average is computed, the amount and the average stay. */
  isCurrent: boolean;
  /** Months the average is computed on; empty = « pas de référence ». */
  reference: MonthKey[];
  /** The `TREND_MONTHS` months of the trend, the month shown last. */
  trendMonths: MonthKey[];
  rows: IndicatorRow[];
  summary: IndicatorSummary;
  /** Nothing to show: no expense in the month and no row (RG12). */
  empty: boolean;
}

const nameOf = (r: IndicatorRow) => r.category?.name ?? 'Sans catégorie';
const byName = (a: IndicatorRow, b: IndicatorRow) => nameOf(a).localeCompare(nameOf(b), 'fr');

/**
 * Indicators of `month` (RG1 to RG10). `today` = the month key of the current date, injected so the result does not depend on the clock.
 * `withBudgets` (spec 0054, switch « Montants budgétés ») fills the budget and its gap, and keeps a category that has a budget but no expense (RG11).
 */
export function categoryIndicators(d: BudgetData, month: MonthKey, today: MonthKey, withBudgets = false): CategoryIndicators {
  const reference = referenceMonths(month, today);
  // RG20: a part month compared with an average of full months gives a false gap, so there is none for the current month.
  const isCurrent = month === today;
  const trendMonths = Array.from({ length: TREND_MONTHS }, (_, i) => addMonths(month, i - (TREND_MONTHS - 1)));

  const cache = new Map<MonthKey, ReturnType<typeof categoryBreakdown>>();
  const breakdownOf = (m: MonthKey) => {
    let b = cache.get(m);
    if (!b) cache.set(m, (b = categoryBreakdown(d, m)));
    return b;
  };
  /** Amount of one category (null id = « Sans catégorie ») in a month. */
  const amountIn = (m: MonthKey, id: string | null): number => {
    const b = breakdownOf(m);
    return (id === null ? b.none?.amount : b.rows.find(r => r.category!.id === id)?.amount) ?? 0;
  };
  const averageOf = (get: (m: MonthKey) => number): number | null =>
    reference.length === 0 ? null : round2(reference.reduce((sum, m) => sum + get(m), 0) / reference.length);

  const build = (category: Category | null): IndicatorRow => {
    const id = category?.id ?? null;
    const amount = amountIn(month, id);
    const average = averageOf(m => amountIn(m, id));
    const budget = withBudgets && id !== null ? budgetOf(d, id, month) : null;
    return {
      category,
      amount,
      budget,
      budgetGap: budget === null ? null : budgetGap(amount, budget),
      average,
      variation: average === null || isCurrent ? null : variation(amount, average),
      trend: trendMonths.map(m => (compareMonths(m, today) > 0 ? null : amountIn(m, id))),
    };
  };

  const categories = d.categories ?? [];
  const all = [...categories.map(build), build(null)];
  // RG7: an expense this month or a non-zero average; the « Sans catégorie » row comes last whatever the order.
  const spending = (r: IndicatorRow) => r.amount > 0 || (r.average ?? 0) > 0;
  const kept = all.filter(r => spending(r) || r.budget !== null);
  const real = kept.filter(r => r.category !== null);
  const none = kept.filter(r => r.category === null);
  const sorted = [...real].sort((a, b) =>
    a.variation && b.variation ? b.variation.delta - a.variation.delta || byName(a, b) : b.amount - a.amount || byName(a, b),
  );
  const rows = [...sorted, ...none];

  // RG10b/c: ties on the gap go to alphabetical order (the list is already sorted by name for equal gaps).
  const topRise = sorted.find(r => (r.variation?.delta ?? 0) > 0) ?? null;
  const topFall =
    [...sorted].filter(r => (r.variation?.delta ?? 0) < 0).sort((a, b) => a.variation!.delta - b.variation!.delta || byName(a, b))[0] ?? null;

  const b = breakdownOf(month);
  const average = averageOf(m => breakdownOf(m).total);
  return {
    isCurrent,
    reference,
    trendMonths,
    rows,
    summary: {
      total: b.total,
      average,
      variation: average === null || isCurrent ? null : variation(b.total, average),
      topRise,
      topFall,
      uncategorizedAmount: b.none?.amount ?? 0,
      uncategorizedCount: b.uncategorizedCount,
    },
    // With the budgets asked for, a category that has one is a row, so the month is not empty (spec 0054, RG11).
    empty: b.total === 0 && rows.length === 0,
  };
}
