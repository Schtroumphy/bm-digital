import { describe, expect, it } from 'vitest';
import { addBankAccount } from '../application/bankAccounts';
import { defaultBankAccounts } from './bank';
import { emptyData } from './empty';
import { migrateLineStatements } from './migrate';
import type { BudgetData, Line } from './types';

const M = '2027-01';
const TODAY = '2027-03-10';
const line = (key: string, extra: Partial<Line> = {}): Line => ({ key, block: 'epa', section: '', name: key, budget: 0, actual: null, ...extra });

/** January 2027 with two savings accounts and lines « livret » (linked to « liv »), « pel » (no account), « a » and « b » (both linked to « shared »). */
function legacy(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  addBankAccount(d, 'liv', 'Livret A', 'epargne');
  addBankAccount(d, 'shared', 'PEL', 'epargne');
  d.months[M] = { initialized: true, lines: [line('livret', { linkedAccountId: 'liv' }), line('pel'), line('a', { linkedAccountId: 'shared' }), line('b', { linkedAccountId: 'shared' })], alloc: {}, transfersDone: {} };
  return d;
}

describe('conversion des relevés de ligne en relevés de compte (spec 0041, RG24)', () => {
  it('CA20: le relevé d’une ligne à compte dédié devient un relevé du compte, de même montant, daté de la fin de période', () => {
    const d = legacy();
    d.statements[M] = { livret: 1234.5 };
    const { data, unconverted } = migrateLineStatements(d, TODAY);
    expect(unconverted).toBe(0);
    expect(data.months[M].accountBalances).toEqual({ liv: { amount: 1234.5, on: '2027-01-31' } });
    expect(data.statements[M]).toBeUndefined();
    expect(d.statements[M]).toEqual({ livret: 1234.5 }); // the data given is never mutated
  });

  it('CA20: un mois dont la fin est dans le futur est daté du jour', () => {
    const d = legacy();
    d.statements[M] = { livret: 10 };
    expect(migrateLineStatements(d, '2027-01-12').data.months[M].accountBalances!.liv.on).toBe('2027-01-12');
  });

  it('CA21: un relevé de compte déjà présent est gardé, celui de la ligne abandonné et compté', () => {
    const d = legacy();
    d.months[M].accountBalances = { liv: { amount: 99, on: '2027-01-20' } };
    d.statements[M] = { livret: 1234.5 };
    const { data, unconverted } = migrateLineStatements(d, TODAY);
    expect(data.months[M].accountBalances).toEqual({ liv: { amount: 99, on: '2027-01-20' } });
    expect(unconverted).toBe(1);
  });

  it('CA21: une ligne sans compte dédié, ou deux lignes sur le même compte (ambigu), ne sont pas converties et sont comptées', () => {
    const d = legacy();
    d.statements[M] = { pel: 3000, a: 1, b: 2 };
    const { data, unconverted } = migrateLineStatements(d, TODAY);
    expect(data.months[M].accountBalances).toBeUndefined();
    expect(unconverted).toBe(3);
    expect(data.statements[M]).toBeUndefined();
  });

  it('CA22: idempotente — la seconde exécution ne trouve rien et rend les mêmes données', () => {
    const d = legacy();
    d.statements[M] = { livret: 5, pel: 6 };
    const once = migrateLineStatements(d, TODAY);
    const twice = migrateLineStatements(once.data, TODAY);
    expect(twice.unconverted).toBe(0);
    expect(twice.data).toBe(once.data);
  });

  it('les mois antérieurs au premier mois gardent leurs relevés (historique, chaîne de départ du Ledger)', () => {
    const d = legacy();
    d.statements['2026-12'] = { livret: 1000 };
    const { data } = migrateLineStatements(d, TODAY);
    expect(data).toBe(d);
    expect(data.statements['2026-12']).toEqual({ livret: 1000 });
  });

  it('sans relevé à convertir, les données sont rendues telles quelles', () => {
    const d = legacy();
    expect(migrateLineStatements(d, TODAY)).toEqual({ data: d, unconverted: 0 });
    expect(migrateLineStatements(d, TODAY).data).toBe(d);
  });
});
