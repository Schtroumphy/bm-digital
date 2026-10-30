import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, updateTransaction } from './actions';
import { addBankAccount } from './bankAccounts';
import { lineProblem, prepareImport, rememberRule, targetIsValid, validateImport, type PreviewLine } from './statementImport';
import { MAIN_ACCOUNT_ID, savingsExpenseLines } from '../domain/bank';
import { estimatedMovements, realMovements } from '../domain/bankMovements';
import { availableReal, monthSummary, variableRemaining } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import type { StatementRow } from '../domain/statement';
import type { BudgetData, Line, Transaction } from '../domain/types';

/*
 * Spec 0035: an expense paid from a savings account and categorised by a savings (`epa`) line of the month (type `epd`).
 * Lydia « Vacances » is a savings account; « Lydia Holidays » is the `epa` line tied to it.
 */

const M = '2026-10';
const LYDIA = 'acc-lydia';
const VM = 'acc-vm';
const PAIR_LYDIA = ['Lydia Vacances (x0001)', 'Lydia'] as const;
const PAIR_MAIN = ['Compte Courant (x1111)', 'Banque Test'] as const;
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;
const ln = (key: string, block: Line['block'], budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });
const row = (label: string, amount: number, pair: readonly [string, string] = PAIR_LYDIA, date = '2026-10-12'): StatementRow => ({ date, label, notes: '', category: '', accountName: pair[0], connectionName: pair[1], amount, direction: 'debit' });

function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts[0].openingBalance = 1000;
  d.accounts[0].openingMonth = M;
  addBankAccount(d, LYDIA, 'Lydia Vacances', 'epargne');
  addBankAccount(d, VM, 'Vacances Mada', 'epargne');
  d.accounts.find(a => a.id === LYDIA)!.openingBalance = 300;
  d.months[M] = {
    initialized: true,
    lines: [
      ln('sal', 'rev', 2000, { actual: 2000 }),
      ln('loisirs', 'var', 100),
      ln('ly', 'epa', 100, { name: 'Lydia Holidays', linkedAccountId: LYDIA }),
      ln('ly2', 'epa', 50, { name: 'Lydia Cadeaux', linkedAccountId: LYDIA }),
      ln('vm', 'epa', 80, { name: 'Vacances Mada', linkedAccountId: VM }),
      ln('livret', 'epa', 40, { name: 'Livret sans compte dédié' }),
    ],
    alloc: {},
    transfersDone: {},
  };
  d.importAccountLinks = [
    { id: 'l1', accountName: PAIR_LYDIA[0], connectionName: PAIR_LYDIA[1], accountId: LYDIA },
    { id: 'l2', accountName: PAIR_MAIN[0], connectionName: PAIR_MAIN[1], accountId: MAIN_ACCOUNT_ID },
  ];
  return d;
}

const toSavings = (key: string) => (l: PreviewLine): PreviewLine => ({ ...l, target: { kind: 'savings', key } });
const prep = (d: BudgetData, rows: StatementRow[]) => prepareImport(d, { rows, errors: [] });
const bank = (d: BudgetData, id: string) => new Ledger(d, M).bankMonth(id, M)!;
const importOne = (d: BudgetData, amount = 30, key = 'ly'): Transaction => {
  const p = prep(d, [row('BILLETS AVION', amount)]);
  const batch = validateImport(d, { ...p, lines: p.lines.map(toSavings(key)) }, newId);
  expect(batch.expenses).toBe(1);
  return d.transactions.at(-1)!;
};

describe('cible « ligne d’épargne du compte » (RG1 à RG3)', () => {
  it('CA1: la ligne liée au compte d’épargne est proposée, pas à un compte courant', () => {
    const d = budget();
    expect(savingsExpenseLines(d, M, LYDIA).map(l => l.key)).toEqual(['ly', 'ly2']);
    expect(savingsExpenseLines(d, M, MAIN_ACCOUNT_ID)).toEqual([]);
    expect(targetIsValid(d, LYDIA, 'depense', { kind: 'savings', key: 'ly' }, M)).toBe(true);
    expect(targetIsValid(d, LYDIA, 'externe', { kind: 'savings', key: 'ly' }, M)).toBe(true);
    expect(targetIsValid(d, MAIN_ACCOUNT_ID, 'depense', { kind: 'savings', key: 'ly' }, M)).toBe(false);
  });

  it('CA2: un mois sans ligne liée ne propose rien et la ligne reste « À rattacher »', () => {
    const d = budget();
    d.months[M].lines = d.months[M].lines.filter(l => l.key !== 'ly' && l.key !== 'ly2');
    expect(savingsExpenseLines(d, M, LYDIA)).toEqual([]);
    const l = toSavings('ly')(prep(d, [row('BILLETS', 30)]).lines[0]);
    expect(lineProblem(d, l)).toBe('À rattacher');
    expect(savingsExpenseLines(d, '2026-11', LYDIA)).toEqual([]);
  });

  it('CA3: deux lignes liées sont toutes proposées ; une ligne liée à un autre compte est refusée', () => {
    const d = budget();
    const l = prep(d, [row('BILLETS', 30)]).lines[0];
    expect(lineProblem(d, toSavings('ly')(l))).toBeNull();
    expect(lineProblem(d, toSavings('ly2')(l))).toBeNull();
    expect(lineProblem(d, toSavings('vm')(l))).toBe('À rattacher');
    expect(lineProblem(d, toSavings('livret')(l))).toBe('À rattacher');
  });

  it('une ligne `inv` n’est jamais une cible', () => {
    const d = budget();
    d.months[M].lines.push(ln('pea', 'inv', 10, { linkedAccountId: LYDIA }));
    expect(targetIsValid(d, LYDIA, 'depense', { kind: 'savings', key: 'pea' }, M)).toBe(false);
  });
});

describe('création et effets (RG4 à RG9)', () => {
  it('RG4/CA4: crée une dépense epd payée par le compte d’épargne, sans rien créditer', () => {
    const d = budget();
    const t = importOne(d);
    expect(t).toMatchObject({ type: 'epd', target: 'ly', accountId: LYDIA, importAccountId: LYDIA, amount: 30, rank: 1 });
    expect(d.accountMovements ?? []).toEqual([]);
  });

  it('CA4: le solde réel et estimé de Lydia baisse de 30 € à la date bancaire, aucun autre compte ne change', () => {
    const d = budget();
    const before = { main: bank(d, MAIN_ACCOUNT_ID).balance, lydia: bank(d, LYDIA).balance, vm: bank(d, VM).balance };
    importOne(d);
    expect(bank(d, LYDIA).balance).toBe(before.lydia - 30);
    expect(bank(d, MAIN_ACCOUNT_ID).balance).toBe(before.main);
    expect(bank(d, VM).balance).toBe(before.vm);
    const real = realMovements(d, LYDIA, M).filter(m => m.kind === 'expense');
    expect(real).toHaveLength(1);
    expect(real[0]).toMatchObject({ date: '2026-10-12', amount: -30, label: 'BILLETS AVION (dépense depuis l’épargne · Lydia Holidays)' });
    expect(estimatedMovements(d, LYDIA, M).filter(m => m.kind === 'expense')).toEqual([expect.objectContaining({ date: '2026-10-12', amount: -30 })]);
    expect(realMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
  });

  it('CA5/RG6: les dépenses réelles montent de 30 €, aucune ligne ni « Restant des variables » ne bouge, les budgets non plus', () => {
    const d = budget();
    const before = monthSummary(d, new Ledger(d, M), M);
    const restant = variableRemaining(d, M);
    importOne(d);
    const after = monthSummary(d, new Ledger(d, M), M);
    expect(after.expensesReal).toBe(before.expensesReal + 30);
    expect(after.fundedBySavings).toBe(30);
    expect(after.expenses).toBe(before.expenses);
    expect(variableRemaining(d, M)).toBe(restant);
    expect(d.months[M].lines.map(l => l.actual)).toEqual([2000, null, null, null, null, null]);
  });

  it('CA6/RG7: l’épargne réelle et le taux d’épargne baissent de 30 €', () => {
    const d = budget();
    const before = monthSummary(d, new Ledger(d, M), M);
    importOne(d);
    const after = monthSummary(d, new Ledger(d, M), M);
    expect(after.realSavings).toBe(before.realSavings - 30);
    expect(after.savingsRate).toBeCloseTo(before.savingsRate - (30 / before.income) * 100, 6);
    expect(after.savingsOut).toBe(before.savingsOut);
  });

  it('CA7/RG8: disponible, reste à placer et surplus ne changent pas', () => {
    const d = budget();
    const before = monthSummary(d, new Ledger(d, M), M);
    importOne(d);
    const after = monthSummary(d, new Ledger(d, M), M);
    expect(after.availableReal).toBe(before.availableReal);
    expect(availableReal(d, M)).toBe(before.availableReal);
    expect(after.remaining).toBe(before.remaining);
    expect(after.surplus).toBe(before.surplus);
  });

  it('RG9: pas d’affectation ni de « hors budget » sur cette dépense', () => {
    const d = budget();
    const base = { id: 'x', month: M, day: 5, label: 'X', amount: 10, type: 'epd' as const, target: 'ly', accountId: LYDIA };
    expect(addTransaction(d, { ...base, assignedAccountId: VM })).toBe(false);
    expect(addTransaction(d, { ...base, offBudget: true })).toBe(false);
    const p = prep(d, [row('BILLETS', 30)]);
    const withAssign = { ...toSavings('ly')(p.lines[0]), assignedAccountId: VM };
    expect(lineProblem(d, withAssign)).toBe('Compte d’affectation invalide');
  });

  it('CA8: une sortie epa à récepteur garde ses effets', () => {
    const d = budget();
    const before = monthSummary(d, new Ledger(d, M), M);
    expect(addTransaction(d, { id: 'w', month: M, day: 5, label: 'Retrait', amount: 25, type: 'epa', target: 'vm', accountId: MAIN_ACCOUNT_ID })).toBe(true);
    const after = monthSummary(d, new Ledger(d, M), M);
    expect(after.savingsOut).toBe(before.savingsOut + 25);
    expect(after.realSavings).toBe(before.realSavings - 25);
    expect(after.fundedBySavings).toBe(0);
    expect(after.expensesReal).toBe(before.expensesReal);
  });

  it('CA13: une dépense var payée depuis un compte d’épargne garde son comportement', () => {
    const d = budget();
    const before = monthSummary(d, new Ledger(d, M), M);
    expect(addTransaction(d, { id: 'v', month: M, day: 5, label: 'Cinéma', amount: 20, type: 'var', target: 'loisirs', accountId: LYDIA })).toBe(true);
    const after = monthSummary(d, new Ledger(d, M), M);
    expect(d.months[M].lines.find(l => l.key === 'loisirs')!.actual).toBe(20);
    expect(after.realSavings).toBe(before.realSavings);
    expect(after.fundedBySavings).toBe(0);
  });
});

describe('modification, suppression, mois clos (RG11, RG12)', () => {
  const patch = (t: Transaction, extra: Partial<Parameters<typeof updateTransaction>[2]> = {}) => ({ label: t.label, amount: t.amount, date: '2026-10-12', type: t.type, target: t.target, ...extra });

  it('CA10: libellé, montant, date et ligne epa cible (liée au compte) sont modifiables ; les chiffres sont recalculés', () => {
    const d = budget();
    const t = importOne(d);
    expect(updateTransaction(d, t.id, patch(t, { label: 'Billets A/R', amount: 45, date: '2026-10-14', target: 'ly2' }))).toBe(true);
    const next = d.transactions[0];
    expect(next).toMatchObject({ type: 'epd', label: 'Billets A/R', amount: 45, target: 'ly2', accountId: LYDIA, day: 14, fingerprint: t.fingerprint, rank: t.rank });
    expect(next.bankDate).toBeUndefined();
    expect(monthSummary(d, new Ledger(d, M), M).fundedBySavings).toBe(45);
    expect(bank(d, LYDIA).balance).toBe(300 - 45);
  });

  it('CA10: un changement vers une ligne var, ou une ligne epa non liée au compte, est refusé et l’écriture reste inchangée', () => {
    const d = budget();
    const t = importOne(d);
    const snapshot = structuredClone(d.transactions);
    expect(updateTransaction(d, t.id, patch(t, { type: 'var', target: 'loisirs' }))).toBe(false);
    expect(updateTransaction(d, t.id, patch(t, { type: 'epa', target: 'ly' }))).toBe(false);
    expect(updateTransaction(d, t.id, patch(t, { target: 'vm' }))).toBe(false);
    expect(updateTransaction(d, t.id, patch(t, { target: 'livret' }))).toBe(false);
    expect(d.transactions).toEqual(snapshot);
  });

  it('une dépense d’un autre type ne devient pas une dépense d’épargne par modification', () => {
    const d = budget();
    addTransaction(d, { id: 'v', month: M, day: 5, label: 'Cinéma', amount: 20, type: 'var', target: 'loisirs', accountId: LYDIA });
    expect(updateTransaction(d, 'v', { label: 'Cinéma', amount: 20, date: '2026-10-05', type: 'epd', target: 'ly' })).toBe(false);
    expect(d.transactions[0].type).toBe('var');
  });

  it('la suppression retire la dépense comme toute écriture', () => {
    const d = budget();
    const t = importOne(d);
    expect(deleteTransaction(d, t.id)).toBe(true);
    expect(bank(d, LYDIA).balance).toBe(300);
  });

  it('CA11: un mois clos refuse l’import et la modification', () => {
    const d = budget();
    const t = importOne(d);
    d.months[M].closed = true;
    expect(updateTransaction(d, t.id, patch(t, { amount: 99 }))).toBe(false);
    expect(lineProblem(d, toSavings('ly')(prep(d, [row('AUTRE', 5)]).lines[0]))).toBe('Choisir un mois ouvert');
  });

  it('addTransaction refuse une epd sur une autre ligne que celle d’un compte d’épargne ou sur un autre payeur', () => {
    const d = budget();
    const base = { id: 'x', month: M, day: 5, label: 'X', amount: 10, type: 'epd' as const };
    expect(addTransaction(d, { ...base, target: 'livret' })).toBe(false);
    expect(addTransaction(d, { ...base, target: 'loisirs' })).toBe(false);
    expect(addTransaction(d, { ...base, target: 'ly', accountId: MAIN_ACCOUNT_ID })).toBe(false);
    expect(addTransaction(d, { ...base, target: 'ly' })).toBe(true);
    expect(d.transactions[0].accountId).toBe(LYDIA);
  });
});

describe('import : déduplication et règle mémorisée (RG11, RG13)', () => {
  it('CA12: un réimport du même fichier marque la ligne « déjà importée »', () => {
    const d = budget();
    importOne(d);
    const again = prep(d, [row('BILLETS AVION', 30)]);
    expect(again.lines[0].duplicate).toBe(true);
  });

  it('CA9: la règle mémorisée préremplit la cible ; mémorisée à la validation', () => {
    const d = budget();
    const p = prep(d, [row('BILLETS AVION', 30)]);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...toSavings('ly')(l), remember: 'billets' })) }, newId);
    expect(d.importRules).toEqual([expect.objectContaining({ pattern: 'billets', nature: 'depense', target: { kind: 'savings', key: 'ly' } })]);
    const next = prep(d, [row('BILLETS TRAIN', 20, PAIR_LYDIA, '2026-10-20')]).lines[0];
    expect(next).toMatchObject({ nature: 'depense', target: { kind: 'savings', key: 'ly' } });
  });

  it('CA9: une règle dont la ligne n’est plus liée au compte, absente du mois, ou d’un compte courant, n’est pas appliquée', () => {
    const d = budget();
    rememberRule(d, 'billets', 'depense', { kind: 'savings', key: 'ly' }, newId);
    const pair = (p: readonly [string, string]) => prep(d, [row('BILLETS TRAIN', 20, p)]).lines[0];
    expect(pair(PAIR_LYDIA).target).toEqual({ kind: 'savings', key: 'ly' });
    expect(pair(PAIR_MAIN).target).toBeNull();
    d.months[M].lines.find(l => l.key === 'ly')!.linkedAccountId = VM;
    expect(pair(PAIR_LYDIA).target).toBeNull();
    d.months[M].lines = d.months[M].lines.filter(l => l.key !== 'ly');
    expect(pair(PAIR_LYDIA).target).toBeNull();
  });
});
