import { describe, expect, it } from 'vitest';
import { defaultBankAccounts } from './bank';
import { emptyData } from './empty';
import { MIGRATED_GOAL_IDS, migrateGoals } from './migrate';
import type { BudgetData } from './types';

const TODAY = '2027-08';

function legacy(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2027-01';
  d.accounts = defaultBankAccounts('2027-01');
  d.template.lines = [
    { key: 'pea', block: 'inv', section: '', name: 'PEA', budget: 0 },
    { key: 'btc', block: 'inv', section: '', name: 'BTC', budget: 0 },
    { key: 'livret', block: 'epa', section: '', name: 'Livret', budget: 0 },
  ];
  d.settings = { emergencyAccounts: ['livret'], emergencyTarget: 20000, emergencyDue: '2028-06-30', investTarget: 12500, investAccounts: ['pea'], investDue: '2027-12-31', savingsRateTarget: 60 };
  return d;
}

describe('migration des 3 objectifs des réglages (spec 0032, RG15, CA1)', () => {
  it('crée 3 objectifs de l’année en cours, dans l’ordre, avec cibles, comptes, échéances et noms d’aujourd’hui', () => {
    const m = migrateGoals(legacy(), TODAY);
    expect(m.goals).toEqual([
      { id: 'goal-emergency', year: 2027, kind: 'amount', name: 'Fonds de secours', target: 20000, accounts: ['livret'], due: '2028-06-30', position: 0 },
      { id: 'goal-invest', year: 2027, kind: 'amount', name: 'Investir 12,5K', target: 12500, accounts: ['pea'], due: '2027-12-31', position: 1 },
      { id: 'goal-savings', year: 2027, kind: 'rate', name: 'Taux d’épargne', target: 60, position: 2 },
    ]);
    expect(m.settings.goalsMigrated).toBe(true);
    expect(MIGRATED_GOAL_IDS.emergency).toBe('goal-emergency');
  });

  it('« Investir » sans choix de lignes reprend toutes les lignes d’investissement', () => {
    const d = legacy();
    delete d.settings.investAccounts;
    expect(migrateGoals(d, TODAY).goals![1].accounts).toEqual(['pea', 'btc']);
  });

  it('une cible à 0 ne crée aucun objectif', () => {
    const d = legacy();
    d.settings.emergencyTarget = 0;
    d.settings.savingsRateTarget = 0;
    const m = migrateGoals(d, TODAY);
    expect(m.goals!.map(g => g.id)).toEqual(['goal-invest']);
    expect(m.goals![0].position).toBe(0);
  });

  it('idempotente : une seconde migration ne change rien, même après suppression de tous les objectifs', () => {
    const once = migrateGoals(legacy(), TODAY);
    expect(migrateGoals(once, TODAY)).toBe(once);
    const emptied = { ...once, goals: [] };
    expect(migrateGoals(emptied, TODAY).goals).toEqual([]);
  });

  it('ne modifie pas les données reçues ; les anciens réglages sont conservés', () => {
    const d = legacy();
    const before = structuredClone(d);
    const m = migrateGoals(d, TODAY);
    expect(d).toEqual(before);
    expect(m.settings.emergencyTarget).toBe(20000);
  });

  it('un budget neuf n’a rien à migrer', () => {
    const d = emptyData();
    expect(migrateGoals(d, TODAY)).toBe(d);
  });
});
