import { describe, expect, it } from 'vitest';
import { addTransaction } from './actions';
import { adjustEnvelopeCash, cashAdjustmentRefusal, deleteCashAdjustment } from './cashAdjustments';
import { addEnvelope, deleteEnvelope, openingCashRefusal } from './envelopes';
import { monthSummary } from '../domain/budget';
import { defaultBankAccounts } from '../domain/bank';
import { emptyData } from '../domain/empty';
import { envelopeCash, exceedsEnvelopeCash } from '../domain/envelopeCash';
import { cashBalanceAt, cashHistory, lowestCashBalance, virtualHistory } from '../domain/envelopeHistory';
import { Ledger } from '../domain/ledger';
import type { BudgetData, Transaction } from '../domain/types';

const M = '2026-12';
const TODAY = '2026-12-05';
const cashOf = (d: BudgetData, m = M) => envelopeCash(d, 'loisirs', m);
const spend = (d: BudgetData, amount: number, day: number, payMode: 'especes' | 'virtuel' = 'especes'): boolean => {
  const t: Transaction = { id: `t${d.transactions.length + 1}`, month: M, day, label: 'Sortie', amount, type: 'env', target: 'loisirs', payMode };
  return addTransaction(d, t);
};

/** « Loisirs » opens on December at 100 € virtual and 60 € cash. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  addEnvelope(d, 'loisirs', 'Loisirs', M);
  d.accounts.find(a => a.id === d.envelopes[0].accountId)!.openingBalance = 100;
  d.envelopes[0].openingCash = 60;
  return d;
}

describe('ajustement du solde espèces d’une enveloppe (spec 0026, amendement du 2026-11-04)', () => {
  it('enveloppe inconnue : l’ajustement est refusé et ne crée rien', () => {
    const d = started();
    expect(cashAdjustmentRefusal(d, 'zzz', 10, TODAY)).toBe('unknown');
    expect(adjustEnvelopeCash(d, 'zzz', 10, 'ca1', TODAY)).toBe('unknown');
    expect(d.cashAdjustments).toBeUndefined();
  });

  it('ajustement inconnu : la suppression est refusée et ne change rien', () => {
    const d = started();
    adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY);
    expect(deleteCashAdjustment(d, 'zzz')).toBe('unknown');
    expect(d.cashAdjustments).toHaveLength(1);
  });

  it('CA25: 60 € de solde et 45 € voulus : un ajustement de −15 € daté du jour ; départ, virtuel et totaux inchangés', () => {
    const d = started();
    const before = { virtual: new Ledger(d, M).envMonth('loisirs', M)!.balance, summary: monthSummary(d, new Ledger(d, M), M) };
    expect(adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY)).toBe('ok');
    expect(d.cashAdjustments).toEqual([{ id: 'ca1', envelopeId: 'loisirs', date: TODAY, amount: -15 }]);
    expect(cashOf(d)).toBe(45);
    expect(d.envelopes[0].openingCash).toBe(60);
    expect(new Ledger(d, M).envMonth('loisirs', M)!.balance).toBe(before.virtual);
    expect(monthSummary(d, new Ledger(d, M), M)).toEqual(before.summary);
  });

  it('CA26: un solde voulu égal au solde actuel ne crée rien', () => {
    const d = started();
    expect(adjustEnvelopeCash(d, 'loisirs', 60, 'ca1', TODAY)).toBe('ok');
    expect(d.cashAdjustments).toBeUndefined();
  });

  it('RG28: l’écart se calcule sur le solde du jour, ajustements du même jour compris (vers le haut comme vers le bas)', () => {
    const d = started();
    adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY);
    expect(adjustEnvelopeCash(d, 'loisirs', 80, 'ca2', TODAY)).toBe('ok');
    expect(d.cashAdjustments!.map(a => a.amount)).toEqual([-15, 35]);
    expect(cashBalanceAt(d, 'loisirs', TODAY)).toBe(80);
  });

  it('CA27: un solde voulu négatif ou non numérique est refusé, rien ne change', () => {
    const d = started();
    expect(adjustEnvelopeCash(d, 'loisirs', -1, 'ca1', TODAY)).toBe('invalid');
    expect(adjustEnvelopeCash(d, 'loisirs', Number.NaN, 'ca2', TODAY)).toBe('invalid');
    expect(d.cashAdjustments).toBeUndefined();
  });

  it('CA27: une dépense en espèces future qui consomme tout le solde : l’ajustement à la baisse est refusé, rien ne change', () => {
    const d = started();
    expect(spend(d, 60, 20)).toBe(true);
    expect(cashAdjustmentRefusal(d, 'loisirs', 45, TODAY)).toBe('negative');
    expect(adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY)).toBe('negative');
    expect(d.cashAdjustments).toBeUndefined();
    // Upwards it is fine; a smaller drop that keeps the later balance ≥ 0 too.
    expect(adjustEnvelopeCash(d, 'loisirs', 70, 'ca2', TODAY)).toBe('ok');
    expect(cashOf(d)).toBe(10);
  });

  it('CA28: une dépense en espèces dans la limite du solde est acceptée, au-delà elle est refusée (RG7 inchangée)', () => {
    const d = started();
    expect(spend(d, 20, 3)).toBe(true);
    expect(cashOf(d)).toBe(40);
    expect(spend(d, 41, 4)).toBe(false);
    expect(exceedsEnvelopeCash(d, 'loisirs', M, 41)).toBe(true);
    // To spend more than the balance, the balance is first adjusted upwards.
    adjustEnvelopeCash(d, 'loisirs', 100, 'ca1', TODAY);
    expect(spend(d, 41, 6)).toBe(true);
  });

  it('CA29: refusé quand le mois du jour est clos ou verrouillé, ou avant le mois de départ ; accepté sur un mois ouvert', () => {
    const d = started();
    d.months[M].closed = true;
    expect(adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY)).toBe('locked');
    expect(cashAdjustmentRefusal(d, 'loisirs', 60, TODAY)).toBe('locked');
    delete d.months[M].closed;
    d.closes['2026'] = { closed: true, overrides: {} };
    expect(adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY)).toBe('locked');
    d.closes = {};
    d.accounts.find(a => a.id === d.envelopes[0].accountId)!.openingMonth = '2027-02';
    expect(adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY)).toBe('before_opening');
    expect(d.cashAdjustments).toBeUndefined();
    expect(adjustEnvelopeCash(started(), 'zzz', 45, 'ca1', TODAY)).toBe('unknown');
  });

  it('CA29: toujours daté du jour, quel que soit le mois affiché (le mois du jour peut être un autre mois que le mois de départ)', () => {
    const d = started();
    d.months['2027-01'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    expect(adjustEnvelopeCash(d, 'loisirs', 50, 'ca1', '2027-01-08')).toBe('ok');
    expect(d.cashAdjustments![0].date).toBe('2027-01-08');
    expect(cashOf(d, M)).toBe(60);
    expect(cashOf(d, '2027-01')).toBe(50);
  });

  it('CA29b: le départ espèces garde ses refus, et compte désormais les ajustements', () => {
    const d = started();
    expect(openingCashRefusal(d, 'loisirs', -1)).toBe('invalid');
    spend(d, 30, 10);
    expect(openingCashRefusal(d, 'loisirs', 29)).toBe('negative');
    expect(openingCashRefusal(d, 'loisirs', 30)).toBeNull();
    adjustEnvelopeCash(d, 'loisirs', 40, 'ca1', TODAY); // −20 on the 5th: 60 → 40, then −30 on the 10th → 10
    expect(lowestCashBalance(d, 'loisirs', 60)).toBe(10);
    expect(openingCashRefusal(d, 'loisirs', 49)).toBe('negative');
    expect(openingCashRefusal(d, 'loisirs', 50)).toBeNull();
  });

  it('RG30: lowestCashBalance à partir d’une date ignore le passé', () => {
    const d = started();
    spend(d, 50, 2); // 60 → 10 on the 2nd
    adjustEnvelopeCash(d, 'loisirs', 30, 'ca1', TODAY); // 10 → 30 on the 5th
    expect(lowestCashBalance(d, 'loisirs', 60)).toBe(10);
    expect(lowestCashBalance(d, 'loisirs', 60, TODAY)).toBe(30);
  });

  it('CA30: l’ajustement figure dans la liste Espèces avec le solde après, pas dans la liste Virtuel', () => {
    const d = started();
    spend(d, 10, 3);
    adjustEnvelopeCash(d, 'loisirs', 45, 'ca1', TODAY);
    const rows = cashHistory(d, 'loisirs', M);
    expect(rows.map(r => [r.label, r.amount, r.balance, r.kind])).toEqual([
      ['Ouverture', 60, 60, 'opening'],
      ['Sortie', -10, 50, 'expense'],
      ['Ajustement', -5, 45, 'adjustment'],
    ]);
    expect(rows[2]).toMatchObject({ id: 'ca1', date: TODAY });
    expect(virtualHistory(d, 'loisirs', M).some(r => r.label === 'Ajustement')).toBe(false);
  });

  it('CA30: supprimer l’ajustement (mois ouvert) le retire et le solde se recalcule ; refusé sur mois clos ou si le solde deviendrait négatif', () => {
    const d = started();
    adjustEnvelopeCash(d, 'loisirs', 90, 'ca1', TODAY); // +30
    spend(d, 80, 20); // 90 → 10
    expect(deleteCashAdjustment(d, 'ca1')).toBe('negative');
    expect(cashOf(d)).toBe(10);
    d.transactions = [];
    d.months[M].closed = true;
    expect(deleteCashAdjustment(d, 'ca1')).toBe('locked');
    delete d.months[M].closed;
    expect(deleteCashAdjustment(d, 'zzz')).toBe('unknown');
    expect(deleteCashAdjustment(d, 'ca1')).toBe('ok');
    expect(d.cashAdjustments).toBeUndefined();
    expect(cashOf(d)).toBe(60);
  });

  it('RG27: supprimer une enveloppe supprime ses ajustements', () => {
    const d = started();
    d.accounts.find(a => a.id === d.envelopes[0].accountId)!.openingBalance = 0;
    d.envelopes[0].openingCash = 0;
    d.cashAdjustments = [{ id: 'ca1', envelopeId: 'loisirs', date: TODAY, amount: 10 }, { id: 'ca2', envelopeId: 'autre', date: TODAY, amount: 5 }];
    expect(deleteEnvelope(d, 'loisirs', M)).toBe('ok');
    expect(d.cashAdjustments).toEqual([{ id: 'ca2', envelopeId: 'autre', date: TODAY, amount: 5 }]);
  });
});
