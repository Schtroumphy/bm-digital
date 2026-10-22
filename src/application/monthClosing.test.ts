import { describe, expect, it } from 'vitest';
import { addLine, addTransaction, applyTemplate, deleteLine, deleteTransaction, duplicatePrevious, setEnvelopeAllocation, setStatement, undoValidateMonth, updateLine, validateMonth } from './actions';
import { addEnvelope } from './envelopes';
import { setLineAccount, setTransactionAccount } from './bankAccounts';
import { closeBlockers, closeMonth, reopenBlocker, reopenMonth } from './monthClosing';
import { availableReal } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { isMonthLocked, previousInitializedMonth } from '../domain/ledger';
import type { BudgetData, Line } from '../domain/types';

const ln = (key: string, budget: number, actual: number | null): Line => ({ key, block: 'rev', section: '', name: key, budget, actual });

/** A started budget with the given initialized months, each with a revenue line « sal » that is fully placed (available = 0). */
function budgetWith(...months: string[]): BudgetData {
  const d = emptyData();
  d.firstMonth = months[0];
  addEnvelope(d, 'sante', 'Santé', months[0]);
  for (const m of months) d.months[m] = { initialized: true, lines: [ln('sal', 1000, 1000), { ...ln('livret', 1000, null), block: 'epa' }], alloc: {}, transfersDone: {} };
  return d;
}

describe('clôturer le mois', () => {
  it('CA21: refusée tant que le disponible n’est pas 0 (positif ou négatif), sans rien modifier', () => {
    const d = budgetWith('2027-01');
    d.months['2027-01'].lines[0].actual = 1300; // +300
    const before = structuredClone(d);
    expect(availableReal(d, '2027-01')).toBe(300);
    expect(closeBlockers(d, '2027-01')).toEqual([{ kind: 'available', amount: 300 }]);
    expect(closeMonth(d, '2027-01')).toBe(false);
    d.months['2027-01'].lines[0].actual = 950; // -50
    expect(closeBlockers(d, '2027-01')).toEqual([{ kind: 'available', amount: -50 }]);
    expect(closeMonth(d, '2027-01')).toBe(false);
    d.months['2027-01'].lines[0].actual = 1000;
    expect(d.months['2027-01'].closed).toBeUndefined();
    expect(before.months['2027-01'].closed).toBeUndefined();
  });

  it('CA21: acceptée à 0 et à 0,004 (arrondi à 2 décimales)', () => {
    const a = budgetWith('2027-01');
    expect(closeMonth(a, '2027-01')).toBe(true);
    expect(a.months['2027-01'].closed).toBe(true);
    const b = budgetWith('2027-01');
    b.months['2027-01'].lines[0].actual = 1000.004;
    expect(closeMonth(b, '2027-01')).toBe(true);
  });

  it('CA22: un mois clôturé refuse toutes les modifications', () => {
    const d = budgetWith('2027-01');
    d.accounts.push({ id: 'ded', name: 'Dédié', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2027-01', inBudget: true, archived: false });
    d.transfers.push({ id: 't1', name: 'v', amount: 10, fromAccountId: d.accounts[0].id });
    d.transactions.push({ id: 'tx', month: '2027-01', day: 2, label: 'c', amount: 1, type: 'env', target: 'sante', accountId: d.accounts[0].id });
    d.statements['2027-01'] = { livret: 1000 };
    closeMonth(d, '2027-01');
    const before = structuredClone(d);
    expect(updateLine(d, '2027-01', 'sal', { budget: 5 })).toBe(false);
    expect(deleteLine(d, '2027-01', 'sal')).toBe(false);
    expect(deleteTransaction(d, 'tx')).toBe(false);
    expect(setTransactionAccount(d, 'tx', 'ded')).toBe(false);
    expect(setStatement(d, '2027-01', 'livret', 5)).toBe(false);
    expect(undoValidateMonth(d, '2027-01', [{ key: 'sal', value: 1000 }])).toBeUndefined();
    expect(updateLine(d, '2027-01', 'sal', { actual: 5 })).toBe(false);
    expect(addLine(d, '2027-01', 'rev', 'new')).toBe(false);
    expect(setLineAccount(d, '2027-01', 'sal', 'ded')).toBe(false);
    expect(setEnvelopeAllocation(d, '2027-01', 'sante', 50)).toBe(false);
    expect(addTransaction(d, { id: 'x', month: '2027-01', day: 1, label: 'a', amount: 5, type: 'env', target: 'sante' })).toBe(false);
    expect(validateMonth(d, '2027-01')).toEqual([]);
    expect(applyTemplate(d, '2027-01')).toBe(false);
    expect(d).toEqual(before);
  });

  it('CA22: « dupliquer le mois précédent » est refusé sur un mois clôturé', () => {
    const d = budgetWith('2026-12', '2027-01');
    closeMonth(d, '2026-12');
    closeMonth(d, '2027-01');
    const before = structuredClone(d);
    expect(duplicatePrevious(d, '2027-01')).toBe(false);
    expect(d).toEqual(before);
  });

  it('CA23: un mois clôturé reste calculé ; les autres mois et l’année ne sont pas verrouillés', () => {
    const d = budgetWith('2027-01', '2027-02');
    const before = availableReal(d, '2027-01');
    closeMonth(d, '2027-01');
    expect(availableReal(d, '2027-01')).toBe(before);
    expect(isMonthLocked(d, '2027-01')).toBe(true);
    expect(isMonthLocked(d, '2027-02')).toBe(false);
    expect(d.closes[2027]).toBeUndefined();
  });

  it('CA24: refusée sur un mois non initialisé ou dans une année clôturée', () => {
    const d = budgetWith('2027-01');
    expect(closeMonth(d, '2027-05')).toBe(false);
    d.closes[2027] = { closed: true, overrides: {} };
    expect(closeMonth(d, '2027-01')).toBe(false);
    expect(d.months['2027-01'].closed).toBeUndefined();
  });

  it('CA29: le mois précédent initialisé doit être clôturé', () => {
    const d = budgetWith('2027-01', '2027-02');
    expect(closeBlockers(d, '2027-02')).toEqual([{ kind: 'previous', month: '2027-01' }]);
    expect(closeMonth(d, '2027-02')).toBe(false);
    closeMonth(d, '2027-01');
    expect(closeMonth(d, '2027-02')).toBe(true);
  });

  it('CA29: les deux raisons sont données, l’ordre d’abord', () => {
    const d = budgetWith('2027-01', '2027-02');
    d.months['2027-02'].lines[0].actual = 1100;
    expect(closeBlockers(d, '2027-02')).toEqual([{ kind: 'previous', month: '2027-01' }, { kind: 'available', amount: 100 }]);
  });

  it('CA30: le tout premier mois n’a pas de précédent', () => {
    const d = budgetWith('2027-01');
    expect(previousInitializedMonth(d, '2027-01')).toBeNull();
    expect(closeMonth(d, '2027-01')).toBe(true);
  });

  it('CA31: les mois non initialisés sont ignorés pour trouver le précédent', () => {
    const d = budgetWith('2027-01', '2027-03');
    expect(previousInitializedMonth(d, '2027-03')).toBe('2027-01');
    expect(closeMonth(d, '2027-03')).toBe(false);
    closeMonth(d, '2027-01');
    expect(closeMonth(d, '2027-03')).toBe(true);
  });

  it('CA32: un précédent dans une année clôturée compte comme clôturé', () => {
    const d = budgetWith('2026-12', '2027-01');
    d.closes[2026] = { closed: true, overrides: {} };
    expect(closeMonth(d, '2027-01')).toBe(true);
  });
});

describe('rouvrir le mois', () => {
  it('CA33: seul le dernier mois clôturé peut être rouvert, sans toucher aux données', () => {
    const d = budgetWith('2027-01', '2027-02');
    closeMonth(d, '2027-01');
    closeMonth(d, '2027-02');
    expect(reopenBlocker(d, '2027-01')).toEqual({ kind: 'later', month: '2027-02', byYear: false });
    expect(reopenMonth(d, '2027-01')).toBe(false);
    const lines = structuredClone(d.months['2027-01'].lines);
    expect(reopenMonth(d, '2027-02')).toBe(true);
    expect(reopenMonth(d, '2027-01')).toBe(true);
    expect(d.months['2027-01'].lines).toEqual(lines);
    expect(isMonthLocked(d, '2027-01')).toBe(false);
  });

  it('CA34: un mois rouvert est de nouveau modifiable, le disponible est recalculé', () => {
    const d = budgetWith('2027-01');
    closeMonth(d, '2027-01');
    reopenMonth(d, '2027-01');
    expect(updateLine(d, '2027-01', 'sal', { actual: 1200 })).toBe(true);
    expect(availableReal(d, '2027-01')).toBe(200);
  });

  it('CA34: un mois verrouillé seulement par l’année ne peut pas être rouvert', () => {
    const d = budgetWith('2027-01');
    d.closes[2027] = { closed: true, overrides: {} };
    expect(reopenBlocker(d, '2027-01')).toEqual({ kind: 'not-closed' });
    expect(reopenMonth(d, '2027-01')).toBe(false);
  });

  it('un mois ouvert ne peut pas être « rouvert »', () => {
    const d = budgetWith('2027-01');
    expect(reopenMonth(d, '2027-01')).toBe(false);
  });

  it('un mois suivant verrouillé par l’année seulement bloque aussi la réouverture', () => {
    const d = budgetWith('2026-12', '2027-01');
    closeMonth(d, '2026-12');
    d.closes[2027] = { closed: true, overrides: {} };
    expect(reopenBlocker(d, '2026-12')).toEqual({ kind: 'later', month: '2027-01', byYear: true });
  });
});

describe('clôture de l’année et clôture du mois', () => {
  it('clôturer puis rouvrir une année laisse `closed` des mois intact', () => {
    const d = budgetWith('2027-01', '2027-02');
    closeMonth(d, '2027-01');
    d.closes[2027] = { closed: true, overrides: {} };
    d.closes[2027].closed = false;
    expect(d.months['2027-01'].closed).toBe(true);
    expect(d.months['2027-02'].closed).toBeUndefined();
    expect(isMonthLocked(d, '2027-01')).toBe(true);
    expect(isMonthLocked(d, '2027-02')).toBe(false);
  });
});
