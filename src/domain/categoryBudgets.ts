import { round2 } from './format';
import type { BudgetData, MonthKey } from './types';

/*
 * Budgets of the categories (spec 0054). Pure functions. A budget is indicative: it never changes the real amounts, the balances or the lines
 * of the Budget (RG12). No entry for a (category, month) = no budget, which is not the same as a budget of 0 (RG3).
 */

/** Budget of a category for a month; null = no budget (RG3). */
export function budgetOf(d: BudgetData, categoryId: string, month: MonthKey): number | null {
  return d.categoryBudgets?.find(b => b.categoryId === categoryId && b.month === month)?.amount ?? null;
}

/** Gap between the real amount and the budget (RG10). `percent` is null when the budget is 0. */
export interface BudgetGap {
  delta: number;
  percent: number | null;
}

/** Real − budget: positive = over the budget. */
export function budgetGap(actual: number, budget: number): BudgetGap {
  const delta = round2(actual - budget);
  return { delta, percent: budget > 0 ? (delta / budget) * 100 : null };
}

/** Largest budget the database holds (`numeric(12,2)`). */
export const BUDGET_MAX = 9_999_999_999.99;

/**
 * Reads what the user typed for a budget (RG5, RG6): empty = remove the budget (`value: null`); a number >= 0 with a comma or a point, rounded
 * to the cent; anything else is refused with a message in French.
 */
export function parseBudgetInput(text: string): { value: number | null } | { error: string } {
  const t = text.trim().replace(/[\s  €]/g, '');
  if (t === '') return { value: null };
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(t)) return { error: 'Saisissez un montant en euros' };
  const n = round2(parseFloat(t.replace(',', '.')));
  if (n < 0) return { error: 'Le budget ne peut pas être négatif' };
  if (n > BUDGET_MAX) return { error: 'Le budget ne peut pas dépasser 9 999 999 999,99 €' };
  return { value: n === 0 ? 0 : n }; // « -0 » becomes 0
}
