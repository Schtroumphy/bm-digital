import { describe, expect, it } from 'vitest';
import { deleteCategory, renameCategory, setCategoryBudget } from './categories';
import { budgetOf } from '../domain/categoryBudgets';
import { withDefaultCategories } from '../domain/categories';
import { emptyData } from '../domain/empty';
import type { BudgetData } from '../domain/types';

/* Spec 0054 : saisie des budgets par catégorie. */

const ALI = 'cat-alimentation';
const LOG = 'cat-logement';
const M = '2026-11';
const fresh = (): BudgetData => withDefaultCategories(emptyData());

describe('définir un budget (RG4 à RG6)', () => {
  it('enregistre pour le mois seulement, sans toucher aux autres mois (RG4, CA4)', () => {
    const d = fresh();
    expect(setCategoryBudget(d, ALI, M, '400')).toBeNull();
    setCategoryBudget(d, ALI, '2026-12', '350');
    expect(budgetOf(d, ALI, M)).toBe(400);
    expect(budgetOf(d, ALI, '2026-12')).toBe(350);
    expect(budgetOf(d, ALI, '2027-01')).toBeNull();
  });
  it('remplace le budget existant au lieu d’en ajouter un second (RG1)', () => {
    const d = fresh();
    setCategoryBudget(d, ALI, M, '400');
    setCategoryBudget(d, ALI, M, '450');
    expect(d.categoryBudgets).toEqual([{ categoryId: ALI, month: M, amount: 450 }]);
  });
  it('CA5 : vider le champ supprime le budget', () => {
    const d = fresh();
    setCategoryBudget(d, ALI, M, '400');
    expect(setCategoryBudget(d, ALI, M, '')).toBeNull();
    expect(budgetOf(d, ALI, M)).toBeNull();
    expect(d.categoryBudgets).toBeUndefined();
  });
  it('CA6 : « abc » et « -5 » refusés, valeur précédente conservée', () => {
    const d = fresh();
    setCategoryBudget(d, ALI, M, '400');
    expect(setCategoryBudget(d, ALI, M, 'abc')).toBeTruthy();
    expect(setCategoryBudget(d, ALI, M, '-5')).toBeTruthy();
    expect(budgetOf(d, ALI, M)).toBe(400);
  });
  it('CA6 : « 12,5 » et « 12.5 » donnent 12,50 ; « 0 » est un budget de 0', () => {
    const d = fresh();
    setCategoryBudget(d, ALI, M, '12,5');
    setCategoryBudget(d, LOG, M, '12.5');
    expect(budgetOf(d, ALI, M)).toBe(12.5);
    expect(budgetOf(d, LOG, M)).toBe(12.5);
    setCategoryBudget(d, LOG, M, '0');
    expect(budgetOf(d, LOG, M)).toBe(0);
  });
  it('catégorie inconnue refusée (RG2 : « Sans catégorie » n’a pas d’id)', () => {
    const d = fresh();
    expect(setCategoryBudget(d, 'none', M, '10')).toBe('Catégorie introuvable');
    expect(d.categoryBudgets).toBeUndefined();
  });
});

describe('liens avec le reste', () => {
  it('CA7 : supprimer une catégorie supprime ses budgets, pas ceux des autres (RG10)', () => {
    const d = fresh();
    setCategoryBudget(d, LOG, M, '800');
    setCategoryBudget(d, LOG, '2026-12', '800');
    setCategoryBudget(d, ALI, M, '400');
    expect(deleteCategory(d, LOG)).toBeNull();
    expect(d.categoryBudgets).toEqual([{ categoryId: ALI, month: M, amount: 400 }]);
  });
  it('CA13 : renommer garde les budgets', () => {
    const d = fresh();
    setCategoryBudget(d, ALI, M, '400');
    renameCategory(d, ALI, 'Courses');
    expect(budgetOf(d, ALI, M)).toBe(400);
  });
  it('CA14 : un budget ne touche ni les écritures ni les mois', () => {
    const d = fresh();
    d.transactions.push({ id: 't1', month: M, day: 3, label: 'x', amount: 20, type: 'var', target: 'courses', categoryId: ALI });
    const before = JSON.stringify({ t: d.transactions, m: d.months, a: d.accounts });
    setCategoryBudget(d, ALI, M, '400');
    expect(JSON.stringify({ t: d.transactions, m: d.months, a: d.accounts })).toBe(before);
  });
});
