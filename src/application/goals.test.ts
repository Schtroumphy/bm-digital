import { describe, expect, it } from 'vitest';
import { parseGoalTarget, setGoalDue, setGoalTarget, toggleGoalAccount } from './goals';
import { emptyData } from '../domain/empty';
import type { BudgetData } from '../domain/types';

const base = (): BudgetData => {
  const d = emptyData();
  d.template.lines = [
    { key: 'pea', block: 'inv', section: '', name: 'PEA', budget: 0 },
    { key: 'btc', block: 'inv', section: '', name: 'BTC', budget: 0 },
  ];
  d.settings = { emergencyAccounts: ['x'], emergencyTarget: 100, investTarget: 200, savingsRateTarget: 20 };
  return d;
};

describe('saisie de la cible (RG6, CA9)', () => {
  it.each(['', '   ', 'abc', '0', '-5', '12abc'])('refuse « %s » sans rien écrire', text => {
    const d = base();
    expect(setGoalTarget(d, 'emergency', text)).not.toBeNull();
    expect(d.settings.emergencyTarget).toBe(100);
  });

  it('refuse un taux supérieur à 100 mais accepte 100', () => {
    const d = base();
    expect(setGoalTarget(d, 'savings', '100,5')).not.toBeNull();
    expect(d.settings.savingsRateTarget).toBe(20);
    expect(setGoalTarget(d, 'savings', '100')).toBeNull();
    expect(d.settings.savingsRateTarget).toBe(100);
  });

  it('accepte « 25 000,5 » (virgule, espaces)', () => {
    expect(parseGoalTarget('25 000,5', 'invest')).toEqual({ value: 25000.5 });
    const d = base();
    expect(setGoalTarget(d, 'invest', '25000')).toBeNull();
    expect(d.settings.investTarget).toBe(25000);
  });
});

describe('échéance (RG7)', () => {
  it('écrit une date valide et l’efface si elle est vide', () => {
    const d = base();
    expect(setGoalDue(d, 'invest', '2027-12-31')).toBe(true);
    expect(d.settings.investDue).toBe('2027-12-31');
    expect(setGoalDue(d, 'invest', '')).toBe(true);
    expect(d.settings).not.toHaveProperty('investDue');
  });

  it('refuse une date invalide', () => {
    const d = base();
    expect(setGoalDue(d, 'emergency', '2027-02-30')).toBe(false);
    expect(setGoalDue(d, 'emergency', 'demain')).toBe(false);
    expect(d.settings.emergencyDue).toBeUndefined();
  });
});

describe('puces de comptes (RG5)', () => {
  it('coche et décoche un compte du fonds de secours', () => {
    const d = base();
    toggleGoalAccount(d, 'emergency', 'y');
    expect(d.settings.emergencyAccounts).toEqual(['x', 'y']);
    toggleGoalAccount(d, 'emergency', 'x');
    expect(d.settings.emergencyAccounts).toEqual(['y']);
  });

  it('« Investir » sans choix : décocher une ligne écrit d’abord le défaut (toutes les lignes inv)', () => {
    const d = base();
    toggleGoalAccount(d, 'invest', 'pea');
    expect(d.settings.investAccounts).toEqual(['btc']);
    toggleGoalAccount(d, 'invest', 'pea');
    expect(d.settings.investAccounts).toEqual(['btc', 'pea']);
  });
});
