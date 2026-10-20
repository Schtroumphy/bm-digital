import { describe, expect, it } from 'vitest';
import { addTransaction, applyTemplate, deleteLine, deleteTransaction, duplicatePrevious, monthCsv } from './actions';
import { monthSummary } from '../domain/budget';
import { Ledger } from '../domain/ledger';
import { seedData } from '../domain/seed';

const line = (d: ReturnType<typeof seedData>, m: string, key: string) => d.months[m].lines.find(l => l.key === key)!;

describe('actions', () => {
  it('a variable expense raises its line, and deleting it restores it', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: '2026-12', day: 3, label: 'Lidl', amount: 25.5, type: 'var', target: 'v-ali', source: 'vir' });
    expect(line(d, '2026-12', 'v-ali').actual).toBe(337.9);
    deleteTransaction(d, 'x');
    expect(line(d, '2026-12', 'v-ali').actual).toBe(312.4);
  });

  it('envelope spending lowers real savings and the envelope balance', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: '2026-12', day: 3, label: 'Pharmacie', amount: 15, type: 'env', target: 'sante', source: 'esp' });
    const l = new Ledger(d, '2026-10');
    expect(monthSummary(d, l, '2026-12').realSavings).toBe(554);
    expect(l.envMonth('sante', '2026-12')!.balance).toBe(25);
  });

  it('applying the model to a new month keeps expenses already recorded', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: '2027-01', day: 2, label: 'Courses', amount: 40, type: 'var', target: 'v-ali', source: 'vir' });
    applyTemplate(d, '2027-01');
    expect(d.months['2027-01'].initialized).toBe(true);
    expect(line(d, '2027-01', 'v-ali').actual).toBe(40);
    expect(line(d, '2027-01', 'r-sal').actual).toBeNull();
  });

  it('duplicates the previous month without its actuals', () => {
    const d = seedData();
    deleteLine(d, '2026-12', 'f-nf');
    expect(duplicatePrevious(d, '2027-01')).toBe(true);
    expect(d.months['2027-01'].lines.some(l => l.key === 'f-nf')).toBe(false);
    expect(d.months['2027-01'].lines.every(l => l.block === 'var' || l.actual === null)).toBe(true);
    expect(duplicatePrevious(d, '2027-03')).toBe(false);
  });

  it('exports CSV in the French dialect', () => {
    const csv = monthCsv([{ key: 'a', block: 'rev', section: '', name: 'Remboursement', budget: 350, actual: 349.93 }], { rev: 'Revenus' } as never);
    expect(csv.split('\r\n')[1]).toBe('Revenus;;Remboursement;350;349,93');
  });
});
