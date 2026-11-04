import { describe, expect, it } from 'vitest';
import { addTransaction } from '../application/actions';
import { addEnvelope } from '../application/envelopes';
import { setEnvelopeCashPart } from '../application/cash';
import { defaultBankAccounts } from './bank';
import { emptyData } from './empty';
import { envelopeAllocationFigures } from './envelopeAllocation';
import { Ledger } from './ledger';
import type { BudgetData, MonthKey } from './types';

const M = '2026-10';
const PREV = '2026-09';

/** « Shopping » with 100 € allocated in October, of which 40 € in cash. */
function setup(allocation = 100, cashPart = 40): BudgetData {
  const d = emptyData();
  d.firstMonth = PREV;
  d.accounts = defaultBankAccounts(PREV);
  d.months[PREV] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  d.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  addEnvelope(d, 'shop', 'Shopping', PREV);
  // 100 € of cash carried over from September, so that cash expenses are accepted whatever the cash part of October.
  d.months[PREV].alloc = { shop: 100 };
  setEnvelopeCashPart(d, PREV, 'shop', 100);
  d.months[M].alloc = { shop: allocation };
  if (cashPart) setEnvelopeCashPart(d, M, 'shop', cashPart);
  return d;
}
const spend = (d: BudgetData, amount: number, id: string, payMode?: 'especes', month: MonthKey = M) =>
  addTransaction(d, { id, month, day: 5, label: id, amount, type: 'env', target: 'shop', payMode });
const figures = (d: BudgetData) => envelopeAllocationFigures(d, new Ledger(d, M), 'shop', M);

describe('allocations et dépensé du mois d’une enveloppe (spec 0040)', () => {
  it('CA1: 100 alloués dont 40 en espèces : virtuelle 60, espèces 40', () => {
    const f = figures(setup())!;
    expect([f.allocation, f.cashAllocation, f.virtualAllocation]).toEqual([100, 40, 60]);
  });

  it('CA2: 30 virtuel et 20 espèces dans le mois : les dépenses d’un autre mois n’y entrent pas', () => {
    const d = setup();
    spend(d, 30, 'a');
    spend(d, 20, 'b', 'especes');
    spend(d, 15, 'c', undefined, PREV);
    const f = figures(d)!;
    expect([f.virtualSpent, f.cashSpent, f.spent]).toEqual([30, 20, 50]);
  });

  it('CA4: barre à 50 % en deux segments de 30 % et 20 % ; un seul segment sans espèces', () => {
    const d = setup();
    spend(d, 30, 'a');
    spend(d, 20, 'b', 'especes');
    const f = figures(d)!;
    expect([f.virtualPct, f.cashPct]).toEqual([30, 20]);
    const plain = setup(100, 0);
    spend(plain, 30, 'a');
    expect([figures(plain)!.virtualPct, figures(plain)!.cashPct]).toEqual([30, 0]);
  });

  it('RG6: une dépense en espèces sans part du mois apparaît quand même en segment espèces', () => {
    const d = setup(100, 0);
    spend(d, 10, 'a', 'especes');
    expect([figures(d)!.cashPct, figures(d)!.overrun]).toEqual([10, 0]);
  });

  it('CA5: un solde reporté ne change ni le dépensé ni la barre', () => {
    const d = setup();
    const before = figures(d)!;
    spend(d, 30, 'a');
    d.months[PREV].alloc = { shop: 300 };
    const f = figures(d)!;
    expect([f.virtualPct, f.cashPct, f.allocation]).toEqual([30, 0, 100]);
    expect(before.allocation).toBe(f.allocation);
  });

  it('CA6: 120 dépensés sur 100 : barre pleine, segments proportionnels, dépassé de 20', () => {
    const d = setup();
    spend(d, 72, 'a');
    spend(d, 48, 'b', 'especes');
    const f = figures(d)!;
    expect(f.overrun).toBe(20);
    expect(f.virtualPct + f.cashPct).toBeCloseTo(100);
    expect([f.virtualPct, f.cashPct]).toEqual([60, 40]);
  });

  it('RG7: de l’espèces au-delà de la part, tant que le total reste dans l’allocation, n’est pas un dépassement', () => {
    const d = setup(100, 10);
    spend(d, 30, 'a', 'especes');
    expect(figures(d)!.overrun).toBe(0);
  });

  it('CA7: allocation à 0 sans dépense : pas de barre ; avec dépense : barre pleine en dépassement', () => {
    const d = setup(0, 0);
    expect(figures(d)!.showBar).toBe(false);
    spend(d, 25, 'a');
    const f = figures(d)!;
    expect([f.showBar, f.virtualPct, f.overrun]).toEqual([true, 100, 25]);
  });

  it('RG9: mois avant l’ouverture ou enveloppe inconnue : null', () => {
    const d = setup();
    expect(envelopeAllocationFigures(d, new Ledger(d, M), 'shop', '2026-01')).toBeNull();
    expect(envelopeAllocationFigures(d, new Ledger(d, M), 'zzz', M)).toBeNull();
  });
});
