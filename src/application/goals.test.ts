import { describe, expect, it } from 'vitest';
import { createGoal, deleteGoal, parseGoalName, parseGoalTarget, renameGoal, setGoalDue, setGoalTarget, toggleGoalAccount, validateGoalDraft, type GoalDraft } from './goals';
import { emptyData } from '../domain/empty';
import type { BudgetData } from '../domain/types';

const TODAY = '2027-08';
const draft = (over: Partial<GoalDraft> = {}): GoalDraft => ({ kind: 'amount', name: 'Fonds de secours', target: '10 000', accounts: ['livret'], scope: null, due: '', ...over });

function base(): BudgetData {
  const d = emptyData();
  d.goals = [
    { id: 'old', year: 2026, kind: 'rate', name: 'Ancien', target: 20, position: 0 },
    { id: 'cur', year: 2027, kind: 'amount', name: 'Secours', target: 100, accounts: ['x'], position: 1 },
    { id: 'rate', year: 2027, kind: 'rate', name: 'Taux', target: 20, position: 2 },
  ];
  return d;
}

describe('saisie de la cible (spec 0025 RG6, spec 0032 RG10)', () => {
  it.each(['', '   ', 'abc', '0', '-5', '12abc'])('refuse « %s »', text => {
    expect('error' in parseGoalTarget(text, 'amount')).toBe(true);
  });

  it('refuse un taux supérieur à 100 mais accepte 100 ; pas de plafond pour un montant', () => {
    expect('error' in parseGoalTarget('100,5', 'rate')).toBe(true);
    expect(parseGoalTarget('100', 'rate')).toEqual({ value: 100 });
    expect(parseGoalTarget('250 000', 'cap')).toEqual({ value: 250000 });
  });

  it('accepte « 25 000,5 » (virgule, espaces)', () => {
    expect(parseGoalTarget('25 000,5', 'amount')).toEqual({ value: 25000.5 });
  });

  it('le nom est non vide et de 60 caractères au plus', () => {
    expect('error' in parseGoalName('   ')).toBe(true);
    expect('error' in parseGoalName('x'.repeat(61))).toBe(true);
    expect(parseGoalName('  Restos  ')).toEqual({ value: 'Restos' });
    expect(parseGoalName('x'.repeat(60))).toEqual({ value: 'x'.repeat(60) });
  });
});

describe('création (RG10, CA7)', () => {
  it('crée un objectif de l’année affichée, à la suite des autres', () => {
    const d = base();
    expect(createGoal(d, 2027, draft({ due: '2027-12-31' }), 'new', TODAY)).toBeNull();
    expect(d.goals!.at(-1)).toEqual({ id: 'new', year: 2027, kind: 'amount', name: 'Fonds de secours', target: 10000, due: '2027-12-31', accounts: ['livret'], position: 3 });
  });

  it('crée chacun des 4 types avec ses paramètres', () => {
    const d = emptyData();
    expect(createGoal(d, 2027, draft({ kind: 'rate', target: '60', accounts: [] }), 'b', TODAY)).toBeNull();
    expect(createGoal(d, 2027, draft({ kind: 'cap', target: '1 200', accounts: [], scope: { kind: 'line', key: 'resto' } }), 'c', TODAY)).toBeNull();
    expect(createGoal(d, 2027, draft({ kind: 'saved', target: '8000' }), 'e', TODAY)).toBeNull();
    expect(d.goals!.map(g => [g.kind, g.accounts, g.scope])).toEqual([
      ['rate', undefined, undefined],
      ['cap', undefined, { kind: 'line', key: 'resto' }],
      ['saved', ['livret'], undefined],
    ]);
  });

  it.each<[string, Partial<GoalDraft>, string]>([
    ['nom vide', { name: '  ' }, 'name'],
    ['cible nulle', { target: '0' }, 'target'],
    ['cible négative', { target: '-3' }, 'target'],
    ['taux supérieur à 100', { kind: 'rate', target: '101' }, 'target'],
    ['aucun compte (A)', { accounts: [] }, 'params'],
    ['aucune ligne (D)', { kind: 'saved', accounts: [] }, 'params'],
    ['aucun périmètre (C)', { kind: 'cap', scope: null }, 'params'],
    ['échéance invalide', { due: '2027-02-31' }, 'due'],
  ])('CA7 : refuse %s, sans rien enregistrer', (_label, over, field) => {
    const d = base();
    const before = structuredClone(d);
    const errors = createGoal(d, 2027, draft(over), 'new', TODAY);
    expect(errors).not.toBeNull();
    expect(Object.keys(errors!)).toContain(field);
    expect(d).toEqual(before);
  });

  it('plusieurs erreurs à la fois, champ par champ', () => {
    expect(Object.keys(validateGoalDraft(draft({ name: '', target: 'x', accounts: [] }))).sort()).toEqual(['name', 'params', 'target']);
  });

  it('CA9 : une année passée est refusée', () => {
    const d = base();
    expect(createGoal(d, 2026, draft(), 'new', TODAY)).not.toBeNull();
    expect(d.goals!.length).toBe(3);
  });

  it('une année future est acceptée', () => {
    const d = base();
    expect(createGoal(d, 2028, draft(), 'new', TODAY)).toBeNull();
  });
});

describe('modification en place (RG11)', () => {
  it('cible : refusée sans rien écrire, ou appliquée', () => {
    const d = base();
    expect(setGoalTarget(d, 'cur', 'abc', TODAY)).not.toBeNull();
    expect(d.goals![1].target).toBe(100);
    expect(setGoalTarget(d, 'rate', '120', TODAY)).not.toBeNull();
    expect(setGoalTarget(d, 'cur', '25000', TODAY)).toBeNull();
    expect(d.goals![1].target).toBe(25000);
  });

  it('nom : renommé, ou refusé s’il est vide', () => {
    const d = base();
    expect(renameGoal(d, 'cur', '  ', TODAY)).not.toBeNull();
    expect(renameGoal(d, 'cur', ' Matelas ', TODAY)).toBeNull();
    expect(d.goals![1].name).toBe('Matelas');
  });

  it('échéance : date valide écrite, vide effacée, invalide refusée ; seulement le type A', () => {
    const d = base();
    expect(setGoalDue(d, 'cur', '2027-12-31', TODAY)).toBe(true);
    expect(d.goals![1].due).toBe('2027-12-31');
    expect(setGoalDue(d, 'cur', '2027-02-30', TODAY)).toBe(false);
    expect(d.goals![1].due).toBe('2027-12-31');
    expect(setGoalDue(d, 'cur', '', TODAY)).toBe(true);
    expect(d.goals![1]).not.toHaveProperty('due');
    expect(setGoalDue(d, 'rate', '2027-12-31', TODAY)).toBe(false);
  });

  it('coche et décoche une ligne (A et D), pas pour un taux', () => {
    const d = base();
    expect(toggleGoalAccount(d, 'cur', 'y', TODAY)).toBe(true);
    expect(d.goals![1].accounts).toEqual(['x', 'y']);
    toggleGoalAccount(d, 'cur', 'x', TODAY);
    expect(d.goals![1].accounts).toEqual(['y']);
    expect(toggleGoalAccount(d, 'rate', 'x', TODAY)).toBe(false);
  });

  it('CA9 : modification et suppression refusées sur une année passée', () => {
    const d = base();
    const before = structuredClone(d);
    expect(setGoalTarget(d, 'old', '30', TODAY)).not.toBeNull();
    expect(renameGoal(d, 'old', 'Autre', TODAY)).not.toBeNull();
    expect(setGoalDue(d, 'old', '2026-12-31', TODAY)).toBe(false);
    expect(toggleGoalAccount(d, 'old', 'x', TODAY)).toBe(false);
    expect(deleteGoal(d, 'old', TODAY)).toBe(false);
    expect(d).toEqual(before);
  });
});

describe('suppression (RG12)', () => {
  it('supprime définitivement l’objectif demandé et laisse les autres', () => {
    const d = base();
    expect(deleteGoal(d, 'cur', TODAY)).toBe(true);
    expect(d.goals!.map(g => g.id)).toEqual(['old', 'rate']);
    expect(deleteGoal(d, 'cur', TODAY)).toBe(false);
  });
});
