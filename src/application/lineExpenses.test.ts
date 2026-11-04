import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, updateLine, updateTransaction } from './actions';
import { addBankAccount, archiveBankAccount, setLineAccount } from './bankAccounts';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { lineTooltip } from '../domain/comingUp';
import { blockTotals } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { CARRIED_ACCOUNT_REFUSAL, expenseLineBlocker } from '../domain/lineExpenses';
import type { BlockKey, BudgetData, Line, Transaction } from '../domain/types';

const M = '2027-01';
const SWILE = 'acc-swile';
const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

function started(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, SWILE, 'Swile');
  d.months[M] = { initialized: true, lines: structuredClone(lines), alloc: {}, transfersDone: {} };
  return d;
}
const fx = (id: string, day: number, amount: number, target: string, accountId?: string): Transaction => ({ id, month: M, day, label: id, amount, type: 'fix', target, ...(accountId ? { accountId } : {}) });
const main = (d: BudgetData) => new Ledger(d, M).bankMonth(MAIN_ACCOUNT_ID, M)!.balance;
const actual = (d: BudgetData, key: string) => d.months[M].lines.find(l => l.key === key)!.actual;

describe('dépense sur ligne fixe ou crédit (spec 0014, 0019)', () => {
  it('CA1/CA2: le réel est la somme des dépenses, au compte de la ligne', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(addTransaction(d, fx('a', 5, 62, 'edf'))).toBe(true);
    expect(actual(d, 'edf')).toBe(62);
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    addTransaction(d, fx('b', 6, 10, 'edf'));
    expect(actual(d, 'edf')).toBe(72);
  });

  it('CA3: une ligne crédit est acceptée', () => {
    const d = started([ln('pret', 'cre', 300)]);
    expect(addTransaction(d, fx('a', 5, 300, 'pret'))).toBe(true);
  });

  it('CA4: refusée sur rev, epa, inv, var, ligne inconnue ou mois non créé', () => {
    const d = started([ln('sal', 'rev', 1), ln('liv', 'epa', 1), ln('pea', 'inv', 1), ln('co', 'var', 1)]);
    for (const k of ['sal', 'liv', 'pea', 'co', 'inconnue']) expect(addTransaction(d, fx(k, 5, 10, k))).toBe(false);
    expect(addTransaction(d, { ...fx('x', 5, 10, 'sal'), month: '2027-03' })).toBe(false);
    expect(d.transactions).toEqual([]);
  });

  it('CA5 / RG2: refusée sur un autre compte que celui de la ligne ; sans compte, elle prend celui de la ligne', () => {
    const d = started([ln('edf', 'fix', 62), ln('cant', 'fix', 20, { accountId: SWILE })]);
    expect(addTransaction(d, fx('a', 5, 62, 'edf', SWILE))).toBe(false);
    expect(addTransaction(d, fx('b', 5, 20, 'cant', MAIN_ACCOUNT_ID))).toBe(false);
    expect(addTransaction(d, fx('c', 5, 20, 'cant'))).toBe(true);
    expect(d.transactions[0].accountId).toBe(SWILE);
  });

  it('CA7 (0019, RG19): le réel ne se saisit plus, il se recalcule des écritures ; le reste de la ligne se modifie', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    expect(updateLine(d, M, 'edf', { budget: 70 })).toBe(true);
    expect(actual(d, 'edf')).toBe(62);
  });

  it('CA12: avec deux dépenses, en supprimer une fait baisser le réel', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    addTransaction(d, fx('b', 6, 10, 'edf'));
    deleteTransaction(d, 'b');
    expect(actual(d, 'edf')).toBe(60);
    expect(main(d)).toBe(940);
  });

  it('CA15: mois clos, ajout et suppression refusés ; la dépense existante garde son effet', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    d.months[M].closed = true;
    expect(addTransaction(d, fx('b', 6, 5, 'edf'))).toBe(false);
    expect(deleteTransaction(d, 'a')).toBe(false);
    expect(main(d)).toBe(938);
  });

  it('CA17: les totaux du Budget lisent le réel alimenté par les dépenses', () => {
    const d = started([ln('edf', 'fix', 62), ln('gaz', 'fix', 40)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    expect(blockTotals(d.months[M].lines, 'fix')).toMatchObject({ budget: 102, actual: 60, gap: 42 });
  });

  it('une dépense sur la ligne d’un autre compte n’affecte que ce compte', () => {
    const d = started([ln('cant', 'fix', 20, { accountId: SWILE })]);
    addTransaction(d, fx('a', 5, 20, 'cant'));
    expect(main(d)).toBe(1000);
    expect(new Ledger(d, M).bankMonth(SWILE, M)!.balance).toBe(-20);
    expect(new Ledger(d, M).bankMonth(CASH_ACCOUNT_ID, M)!.balance).toBe(0);
  });

  it('RG2: le compte d’une ligne qui porte des dépenses ne peut pas changer ; sans dépense il peut', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(setLineAccount(d, M, 'edf', SWILE)).toBe(true);
    expect(setLineAccount(d, M, 'edf', MAIN_ACCOUNT_ID)).toBe(true);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    expect(setLineAccount(d, M, 'edf', SWILE)).toBe(false);
    expect(d.months[M].lines[0].accountId).toBe(MAIN_ACCOUNT_ID);
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    expect(CARRIED_ACCOUNT_REFUSAL).toMatch(/supprimez-les ou déplacez-les/);
    deleteTransaction(d, 'a');
    expect(setLineAccount(d, M, 'edf', SWILE)).toBe(true);
  });

  it('une dépense sur une ligne dont le compte est archivé est refusée, avec un message', () => {
    const d = started([ln('cant', 'fix', 20, { accountId: SWILE })]);
    archiveBankAccount(d, SWILE);
    expect(d.accounts.find(a => a.id === SWILE)!.archived).toBe(true);
    expect(addTransaction(d, fx('a', 5, 20, 'cant'))).toBe(false);
    expect(expenseLineBlocker(d, M, 'cant')).toMatch(/Swile.*archivé/);
    expect(expenseLineBlocker(d, M, 'inconnue')).toBeNull();
  });

  it('l’information d’une ligne qui porte des dépenses est dans l’infobulle de la ligne (nombre d’écritures, réel = somme)', () => {
    const d = started([ln('edf', 'fix', 62), ln('gaz', 'fix', 40)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    addTransaction(d, fx('b', 6, 2, 'edf'));
    expect(lineTooltip(d, M, d.months[M].lines[0], '2027-01-10')).toMatch(/2 écritures, réel = somme des écritures/);
    expect(lineTooltip(d, M, d.months[M].lines[1], '2027-01-10')).not.toMatch(/écriture/);
  });
});

describe('modification d’une dépense', () => {
  const patch = { label: 'EDF', amount: 70, date: `${M}-09`, type: 'fix' as const, target: 'edf' };

  it('change libellé, montant et date, garde la place et resynchronise le réel', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    addTransaction(d, fx('b', 6, 10, 'edf'));
    expect(updateTransaction(d, 'a', patch)).toBe(true);
    expect(d.transactions.map(t => t.id)).toEqual(['a', 'b']);
    expect(d.transactions[0]).toMatchObject({ label: 'EDF', amount: 70, day: 9 });
    expect(d.transactions[0].bankDate).toBeUndefined();
    expect(actual(d, 'edf')).toBe(80);
  });

  it('une date hors du mois de rattachement devient la date bancaire', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    updateTransaction(d, 'a', { ...patch, amount: 62, date: '2026-12-30' });
    expect(d.transactions[0]).toMatchObject({ month: M, bankDate: '2026-12-30' });
  });

  it('refusée (rien ne change) sur une imputation refusée, une date invalide ou un montant nul', () => {
    const d = started([ln('edf', 'fix', 62), ln('liv', 'epa', 1)]);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    const snapshot = structuredClone(d);
    expect(updateTransaction(d, 'a', { ...patch, target: 'liv' })).toBe(false);
    expect(updateTransaction(d, 'a', { ...patch, date: '2026-02-31' })).toBe(false);
    expect(updateTransaction(d, 'a', { ...patch, amount: 0 })).toBe(false);
    expect(d).toEqual(snapshot);
  });
});
