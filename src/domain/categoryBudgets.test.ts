import { describe, expect, it } from 'vitest';
import { budgetGap, budgetOf, parseBudgetInput } from './categoryBudgets';
import { categoryYear, withDefaultCategories } from './categories';
import { emptyData } from './empty';
import type { BudgetData } from './types';

/* Spec 0054 : budgets par catégorie. */

describe('lecture d’un budget (RG1, RG3, CA1, CA4, CA8)', () => {
  it('données sans le champ : aucun budget (null, pas 0)', () => {
    expect(budgetOf(emptyData(), 'cat-a', '2026-11')).toBeNull();
  });
  it('un budget d’un mois n’apparaît pas le mois suivant (CA4)', () => {
    const d = emptyData();
    d.categoryBudgets = [{ categoryId: 'cat-a', month: '2026-11', amount: 400 }];
    expect(budgetOf(d, 'cat-a', '2026-11')).toBe(400);
    expect(budgetOf(d, 'cat-a', '2026-12')).toBeNull();
  });
  it('un budget à 0 est un vrai budget', () => {
    const d = emptyData();
    d.categoryBudgets = [{ categoryId: 'cat-a', month: '2026-11', amount: 0 }];
    expect(budgetOf(d, 'cat-a', '2026-11')).toBe(0);
  });
});

describe('saisie d’un budget (RG5, RG6, CA6)', () => {
  it('virgule et point donnent 12,50', () => {
    expect(parseBudgetInput('12,5')).toEqual({ value: 12.5 });
    expect(parseBudgetInput('12.5')).toEqual({ value: 12.5 });
  });
  it('arrondi au centime, espaces et € ignorés', () => {
    expect(parseBudgetInput('1 234,567 €')).toEqual({ value: 1234.57 });
  });
  it('vide = supprimer ; 0 = budget de 0', () => {
    expect(parseBudgetInput('  ')).toEqual({ value: null });
    expect(parseBudgetInput('0')).toEqual({ value: 0 });
  });
  it('« -0 » devient 0 (pas −0)', () => {
    const r = parseBudgetInput('-0') as { value: number };
    expect(Object.is(r.value, 0)).toBe(true);
  });
  it('au-delà de 9 999 999 999,99 : refusé ; le maximum passe', () => {
    expect(parseBudgetInput('9999999999,99')).toEqual({ value: 9999999999.99 });
    expect(parseBudgetInput('10000000000')).toHaveProperty('error');
  });
  it('texte et négatif refusés', () => {
    expect(parseBudgetInput('abc')).toHaveProperty('error');
    expect(parseBudgetInput('12abc')).toHaveProperty('error');
    expect(parseBudgetInput('-5')).toHaveProperty('error');
  });
});

describe('écart au budget (RG10, CA2, CA3)', () => {
  it('CA2 : budget 400, réel 420 → +20 et +5,0 %', () => {
    const g = budgetGap(420, 400);
    expect(g.delta).toBe(20);
    expect(g.percent).toBeCloseTo(5, 5);
  });
  it('CA3 : budget 0, réel 50 → +50 sans pourcentage', () => {
    expect(budgetGap(50, 0)).toEqual({ delta: 50, percent: null });
  });
  it('sous le budget : écart négatif ; réel 0 = −budget', () => {
    expect(budgetGap(0, 100).delta).toBe(-100);
  });
});

describe('vue annuelle (RG13, CA10)', () => {
  it('categoryYear ne contient aucun budget', () => {
    const d = withDefaultCategories(emptyData());
    d.months['2026-01'] = { initialized: true } as BudgetData['months'][string];
    d.categoryBudgets = [{ categoryId: 'cat-alimentation', month: '2026-01', amount: 100 }];
    const y = categoryYear(d, 2026);
    expect(JSON.stringify(y)).not.toMatch(/budget/i);
    expect(y.rows).toEqual([]);
  });
});
