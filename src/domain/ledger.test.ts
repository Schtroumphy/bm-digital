import { describe, expect, it } from 'vitest';
import { addBankAccount } from '../application/bankAccounts';
import { defaultBankAccounts, MAIN_ACCOUNT_ID } from './bank';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import type { BlockKey, BudgetData, Line } from './types';

const DEC = '2026-12';
const line = (key: string, block: BlockKey, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget: 0, actual: null, ...extra });

/** December 2026 with a savings account « ep » opened at 1000, a 250 transfer into it and a 100 withdrawal from the line. */
function base(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = DEC;
  d.accounts = defaultBankAccounts(DEC);
  addBankAccount(d, 'ep', 'Livret A', 'epargne');
  Object.assign(d.accounts.find(a => a.id === 'ep')!, { openingBalance: 1000, openingMonth: DEC });
  d.months[DEC] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  d.template.lines = lines.map(({ actual: _a, ...l }) => l);
  d.accountMovements = [{ id: 'mv1', month: DEC, day: 5, label: 'Virement', amount: 250, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'ep' }];
  d.transactions = [{ id: 't1', month: DEC, day: 10, label: 'Retrait', amount: 100, type: 'epa', target: 'livret' }];
  return d;
}

describe('soldes épargnes d’une ligne à compte dédié', () => {
  it('lit le compte bancaire : départ, entrées et sorties réelles, solde', () => {
    const d = base([line('livret', 'epa', { linkedAccountId: 'ep', actual: 9999 })]);
    const l = new Ledger(d, DEC);
    const bank = l.bankMonth('ep', DEC)!;
    expect(l.accMonth('livret', DEC)).toMatchObject({ start: 1000, paid: 250, out: 100, expected: 1150, balance: 1150 });
    expect(l.accMonth('livret', DEC)).toMatchObject({ start: bank.start, paid: bank.in, out: bank.out, expected: bank.balance });
  });

  it('garde le solde relevé comme comparaison, sans changer l’attendu', () => {
    const d = base([line('livret', 'epa', { linkedAccountId: 'ep' })]);
    d.statements[DEC] = { livret: 1100 };
    expect(new Ledger(d, DEC).accMonth('livret', DEC)).toMatchObject({ expected: 1150, statement: 1100, balance: 1100 });
  });

  it('reste sur l’ancien calcul sans compte dédié', () => {
    const d = base([line('livret', 'epa', { actual: 40 })]);
    expect(new Ledger(d, DEC).accMonth('livret', DEC)).toMatchObject({ start: 0, paid: 40, out: 100, expected: -60 });
  });

  it('reste sur l’ancien calcul quand deux lignes partagent le compte', () => {
    const d = base([line('livret', 'epa', { linkedAccountId: 'ep', actual: 40 }), line('autre', 'epa', { linkedAccountId: 'ep' })]);
    expect(new Ledger(d, DEC).accMonth('livret', DEC)).toMatchObject({ start: 0, paid: 40, out: 100 });
  });
});
