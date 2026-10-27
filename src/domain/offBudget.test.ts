import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, setTransactionDetail, transactionsCsv, updateTransaction } from '../application/actions';
import { checkLine } from '../application/checkoff';
import { prepareImport, validateImport, withValidAssignment, lineProblem, type PreviewLine } from '../application/statementImport';
import { MAIN_ACCOUNT_ID, defaultBankAccounts, isTransactionInBudget, newEnvelopeAccount } from './bank';
import { assignedOperations } from './assignedOperations';
import { availableReal, blockTotals, budgetLines, monthSummary, variableRemaining } from './budget';
import { estimatedMovements, realMovements } from './bankMovements';
import { dashboardView } from './dashboard';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import { monthBalance } from './checkoff';
import { fingerprintOf, type StatementRow } from './statement';
import type { BudgetData, Line, Transaction } from './types';

// Spec 0031 : opérations marquées « hors budget » (sans compte d'affectation).
const M = '2026-10';
const LDDS = 'acc-ldds';
const ln = (key: string, block: Line['block'], budget: number): Line => ({ key, block, section: '', name: key, budget, actual: null });

function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [
    ...defaultBankAccounts(M),
    { id: LDDS, name: 'LDDS Travaux', hue: 40, isDefault: false, openingBalance: 63.95, openingMonth: M, inBudget: true, archived: false, kind: 'epargne', openingConfirmed: true },
    newEnvelopeAccount('acc-env-v', 'v', 'Vacances', 200, 0, M),
  ];
  d.accounts[0].openingBalance = 5000;
  d.envelopes = [{ id: 'v', name: 'Vacances', hue: 200, openingCash: 0, accountId: 'acc-env-v' }];
  d.months[M] = { initialized: true, lines: [ln('div', 'rev', 0), ln('rcj', 'fix', 300), ln('imp', 'var', 2000)], alloc: {}, transfersDone: {} };
  return d;
}
const tx = (id: string, type: Transaction['type'], target: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, month: M, day: 12, label: id, amount, type, target, ...extra });
const line = (d: BudgetData, key: string) => d.months[M].lines.find(l => l.key === key)!;
const led = (d: BudgetData) => new Ledger(d, M);
const bal = (d: BudgetData, id = MAIN_ACCOUNT_ID) => led(d).bankMonth(id, M)!;
const patch = (t: Transaction, extra: Record<string, unknown>) => ({ label: t.label, amount: t.amount, date: '2026-10-12', type: t.type, target: t.target, ...extra });

describe('opération hors budget (spec 0031)', () => {
  it('CA1 : une entrée rev de 1 630 € hors budget ne compte ni dans les revenus, ni dans le disponible, mais dans les soldes', () => {
    const d = budget();
    const available = availableReal(d, M);
    const summary = monthSummary(d, led(d), M);
    expect(addTransaction(d, tx('c', 'rev', 'div', 1630, { offBudget: true }))).toBe(true);
    expect(line(d, 'div').actual).toBeNull();
    expect(blockTotals(budgetLines(d, M), 'rev').actual).toBe(0);
    expect(availableReal(d, M)).toBe(available);
    expect(monthSummary(d, led(d), M)).toEqual(summary);
    expect(bal(d).balance).toBe(6630);
    checkLine(d, M, 'div', '2026-10-20');
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)?.end).toBe(6630);
  });

  it('CA2 : 12 dépenses var de 135,83 € hors budget : réel, restant et dépenses inchangés, solde du compte débité ; solde revenu au départ avec la cagnotte', () => {
    const d = budget();
    const rest = variableRemaining(d, M);
    addTransaction(d, tx('c', 'rev', 'div', 1630, { offBudget: true }));
    for (let i = 0; i < 12; i++) addTransaction(d, tx(`s${i}`, 'var', 'imp', 135.83, { offBudget: true }));
    expect(line(d, 'imp').actual).toBeNull();
    expect(variableRemaining(d, M)).toBe(rest);
    expect(bal(d).balance).toBeCloseTo(5000 + 1630 - 12 * 135.83, 2);
    expect(realMovements(d, MAIN_ACCOUNT_ID, M)).toHaveLength(13);
  });

  it('une dépense fix hors budget sort du réel de sa ligne et de la ligne pointée (solde estimé inchangé)', () => {
    const d = budget();
    addTransaction(d, tx('f', 'fix', 'rcj', 100));
    checkLine(d, M, 'rcj', '2026-10-20');
    const est = monthBalance(d, M, MAIN_ACCOUNT_ID);
    expect(updateTransaction(d, 'f', patch(d.transactions[0], { offBudget: true }))).toBe(true);
    expect(line(d, 'rcj').actual).toBeNull();
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)).toEqual(est);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M).some(m => m.label.includes('hors budget'))).toBe(true);
  });

  it('CA3 : retirer le marquage remet l’opération dans tous les chiffres, aux montants exacts', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 708.03));
    const summary = monthSummary(d, led(d), M);
    const avail = availableReal(d, M);
    updateTransaction(d, 'v', patch(d.transactions[0], { offBudget: true }));
    expect(d.transactions[0].offBudget).toBe(true);
    expect(line(d, 'imp').actual).toBeNull();
    expect(updateTransaction(d, 'v', patch(d.transactions[0], { offBudget: false }))).toBe(true);
    expect(d.transactions[0]).not.toHaveProperty('offBudget');
    expect(line(d, 'imp').actual).toBe(708.03);
    expect(monthSummary(d, led(d), M)).toEqual(summary);
    expect(availableReal(d, M)).toBe(avail);
  });

  it('une modification sans toucher au marquage le conserve', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 50, { offBudget: true }));
    expect(updateTransaction(d, 'v', { ...patch(d.transactions[0], {}), label: 'autre' })).toBe(true);
    expect(d.transactions[0]).toMatchObject({ label: 'autre', offBudget: true });
  });

  it('CA4 : mois clos = poser ou retirer refusé, opération inchangée, détail modifiable', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 50));
    addTransaction(d, tx('w', 'var', 'imp', 20, { offBudget: true }));
    d.months[M].closed = true;
    const before = structuredClone(d.transactions);
    expect(updateTransaction(d, 'v', patch(before[0], { offBudget: true }))).toBe(false);
    expect(updateTransaction(d, 'w', patch(before[1], { offBudget: false }))).toBe(false);
    expect(addTransaction(d, tx('x', 'var', 'imp', 5, { offBudget: true }))).toBe(false);
    expect(d.transactions).toEqual(before);
    expect(setTransactionDetail(d, 'w', 'précision')).toBe(true);
  });

  it('CA5 : une opération env ou epa ne peut pas être hors budget', () => {
    const d = budget();
    expect(addTransaction(d, tx('e', 'env', 'v', 10, { offBudget: true }))).toBe(false);
    expect(addTransaction(d, tx('p', 'epa', 'rcj', 10, { offBudget: true }))).toBe(false);
    addTransaction(d, tx('e2', 'env', 'v', 10));
    expect(updateTransaction(d, 'e2', patch(d.transactions[0], { offBudget: true }))).toBe(false);
    expect(d.transactions[0]).not.toHaveProperty('offBudget');
  });

  it('CA6 / RG3 : exclusif avec l’affectation ; choisir un compte remplace le marquage, et inversement ; sans double comptage', () => {
    const d = budget();
    expect(addTransaction(d, tx('a', 'var', 'imp', 10, { offBudget: true, assignedAccountId: LDDS }))).toBe(false);
    addTransaction(d, tx('v', 'var', 'imp', 40, { offBudget: true }));
    expect(updateTransaction(d, 'v', patch(d.transactions[0], { assignedAccountId: LDDS }))).toBe(true);
    expect(d.transactions[0]).toMatchObject({ assignedAccountId: LDDS });
    expect(d.transactions[0]).not.toHaveProperty('offBudget');
    expect(line(d, 'imp').actual).toBeNull();
    expect(updateTransaction(d, 'v', patch(d.transactions[0], { assignedAccountId: null, offBudget: true }))).toBe(true);
    expect(d.transactions[0]).toMatchObject({ offBudget: true });
    expect(d.transactions[0]).not.toHaveProperty('assignedAccountId');
    expect(isTransactionInBudget(d, d.transactions[0])).toBe(false);
    // Hors budget n'apparaît pas dans le détail d'un compte d'épargne.
    expect(assignedOperations(d, LDDS, M)).toEqual([]);
    expect(bal(d, LDDS).balance).toBe(63.95);
  });

  it('RG2 : supprimer une opération hors budget la supprime partout', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 40, { offBudget: true }));
    expect(deleteTransaction(d, 'v')).toBe(true);
    expect(d.transactions).toEqual([]);
    expect(bal(d).balance).toBe(5000);
  });

  it('CA8 : la mention cumule affectées et hors budget, avec le détail ; absente sans aucune', () => {
    const d = budget();
    expect(dashboardView(d, led(d), M, '2026-10-20').assigned).toBeNull();
    addTransaction(d, tx('c', 'rev', 'div', 1630, { offBudget: true }));
    addTransaction(d, tx('s', 'var', 'imp', 135.83, { offBudget: true }));
    addTransaction(d, tx('a', 'var', 'imp', 100, { assignedAccountId: LDDS }));
    addTransaction(d, tx('n', 'var', 'imp', 5));
    const view = dashboardView(d, led(d), M, '2026-10-20');
    expect(view.assigned).toMatchObject({ count: 3, expenses: 235.83, entries: 1630 });
    expect(view.assigned!.offBudget).toMatchObject({ count: 2, expenses: 135.83, entries: 1630 });
    expect(view.assigned!.byAccount).toEqual([{ accountId: LDDS, accountName: 'LDDS Travaux', count: 1, expenses: 100, entries: 0, net: -100 }]);
    expect(view.kpis!.incomeActual).toBe(0);
    expect(view.variables!.rows.find(r => r.key === 'imp')!.actual).toBe(5);
  });

  it('RG6 : l’export CSV a une colonne « Hors budget » (oui / non)', () => {
    const row = { date: '2026-10-12', label: 'a', detail: '', type: 'Dépense', imputation: 'Imprévus', account: 'Compte principal', assignedTo: '', offBudget: true, amount: -10 };
    const [head, a, b] = transactionsCsv([row, { ...row, offBudget: false }]).replace('﻿', '').split('\r\n');
    expect(head).toBe('Date;Libellé;Détail;Nature;Imputation;Compte;Affectée à;Hors budget;Montant');
    expect(a.split(';')[7]).toBe('oui');
    expect(b.split(';')[7]).toBe('non');
  });

  it('CA11 : sans marquage, rien ne change (opération ordinaire)', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 40));
    expect(d.transactions[0]).not.toHaveProperty('offBudget');
    expect(line(d, 'imp').actual).toBe(40);
  });
});

describe('import avec « hors budget » (spec 0031, CA7)', () => {
  const PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
  const row = (label: string, amount: number, direction: 'debit' | 'credit' = 'debit'): StatementRow => ({ date: '2026-10-05', label, notes: '', category: '', accountName: PAIR[0], connectionName: PAIR[1], amount, direction });
  const setup = () => {
    const d = budget();
    d.importAccountLinks = [{ id: 'l1', accountName: PAIR[0], connectionName: PAIR[1], accountId: MAIN_ACCOUNT_ID }];
    return d;
  };
  let seq = 0;
  const newId = (p: string) => `${p}${++seq}`;

  it('crée l’opération marquée, empreinte inchangée, et un réimport la signale « Doublon »', () => {
    const d = setup();
    const reading = { rows: [row('VIREMENT ANNIV', 135.83)], errors: [] };
    const preview = prepareImport(d, reading);
    const l = preview.lines[0];
    const tuned: PreviewLine = { ...l, month: M, target: { kind: 'var', key: 'imp' }, checked: true, offBudget: true };
    expect(validateImport(d, { ...preview, lines: [tuned] }, newId).expenses).toBe(1);
    expect(d.transactions[0]).toMatchObject({ type: 'var', offBudget: true, fingerprint: fingerprintOf(l.row), accountId: MAIN_ACCOUNT_ID });
    expect(line(d, 'imp').actual).toBeNull();
    expect(prepareImport(d, reading).lines[0].duplicate).toBe(true);
  });

  it('une entrée importée peut être hors budget ; le marquage est retiré si la ligne devient une enveloppe', () => {
    const d = setup();
    const preview = prepareImport(d, { rows: [row('CAGNOTTE', 1630, 'credit')], errors: [] });
    const tuned: PreviewLine = { ...preview.lines[0], month: M, nature: 'revenu', target: { kind: 'line', key: 'div' }, checked: true, offBudget: true };
    expect(lineProblem(d, tuned)).toBeNull();
    validateImport(d, { ...preview, lines: [tuned] }, newId);
    expect(d.transactions[0]).toMatchObject({ type: 'rev', offBudget: true });
    expect(withValidAssignment({ ...tuned, nature: 'interne', target: { kind: 'account', id: LDDS } })).not.toHaveProperty('offBudget');
  });
});
