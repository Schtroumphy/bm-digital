import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, setTransactionDetail, updateTransaction } from '../application/actions';
import { archiveBankAccount } from '../application/bankAccounts';
import { checkLine } from '../application/checkoff';
import { changeNature, lineProblem, prepareImport, validateImport, withValidAssignment, type PreviewLine } from '../application/statementImport';
import { MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID, assignableAccounts, canAssignTo, defaultBankAccounts, newEnvelopeAccount } from './bank';
import { assignedOperations, assignedTotals } from './assignedOperations';
import { availableReal, blockTotals, budgetLines, monthSummary, variableRemaining } from './budget';
import { attachedMovements, countedAmount, estimatedMovements, flowOf, realMovements } from './bankMovements';
import { dashboardView, hasMovement } from './dashboard';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import { lineEntriesNote, derivedActual } from './lineActuals';
import { isLineCarried } from './lineExpenses';
import { monthBalance } from './checkoff';
import { fingerprintOf, type StatementRow } from './statement';
import type { BudgetData, Line, Transaction } from './types';

const M = '2026-10';
const LDDS = 'acc-ldds';
const INV = 'acc-pea';
const ln = (key: string, block: Line['block'], budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [
    ...defaultBankAccounts(M),
    { id: LDDS, name: 'LDDS Travaux', hue: 40, isDefault: false, openingBalance: 63.95, openingMonth: M, inBudget: true, archived: false, kind: 'epargne', openingConfirmed: true },
    { id: INV, name: 'PEA', hue: 10, isDefault: false, openingBalance: 0, openingMonth: M, inBudget: true, archived: false, kind: 'invest', openingConfirmed: true },
    newEnvelopeAccount('acc-env-v', 'v', 'Vacances', 200, 0, M),
  ];
  d.accounts[0].openingBalance = 5000;
  d.envelopes = [{ id: 'v', name: 'Vacances', hue: 200, openingCash: 0, accountId: 'acc-env-v' }];
  const lines = [ln('sal', 'rev', 3000), ln('rbt', 'rev', 0), ln('rcj', 'fix', 300), ln('imp', 'var', 2000), ln('cou', 'var', 400)];
  d.months[M] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  return d;
}
const tx = (id: string, type: Transaction['type'], target: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, month: M, day: 12, label: id, amount, type, target, ...extra });
const line = (d: BudgetData, key: string) => d.months[M].lines.find(l => l.key === key)!;
const led = (d: BudgetData) => new Ledger(d, M);
const bal = (d: BudgetData, id = MAIN_ACCOUNT_ID) => led(d).bankMonth(id, M)!;

describe('opérations affectées à un compte d’épargne (spec 0028)', () => {
  it('CA1 : une dépense var affectée sort du réel de la ligne et du restant des variables, sans changer compte, date ni montant', () => {
    const d = budget();
    addTransaction(d, tx('a', 'var', 'imp', 708.03));
    addTransaction(d, tx('b', 'var', 'imp', 100));
    const restBefore = variableRemaining(d, M);
    expect(line(d, 'imp').actual).toBe(808.03);
    const before = { ...d.transactions[0] };
    expect(updateTransaction(d, 'a', { label: 'a', amount: 708.03, date: '2026-10-12', type: 'var', target: 'imp', assignedAccountId: LDDS })).toBe(true);
    expect(line(d, 'imp').actual).toBe(100);
    expect(variableRemaining(d, M)).toBe(restBefore + 708.03);
    expect(d.transactions[0]).toEqual({ ...before, assignedAccountId: LDDS });
  });

  it('CA2 : une entrée rev affectée n’entre plus dans les revenus réels, ni dans le disponible, ni dans le réel de sa ligne (vide si seule)', () => {
    const d = budget();
    addTransaction(d, tx('r', 'rev', 'rbt', 192.6));
    const withIt = availableReal(d, M)!;
    expect(blockTotals(budgetLines(d, M), 'rev').actual).toBe(192.6);
    expect(updateTransaction(d, 'r', { label: 'r', amount: 192.6, date: '2026-10-12', type: 'rev', target: 'rbt', assignedAccountId: LDDS })).toBe(true);
    expect(line(d, 'rbt').actual).toBeNull();
    expect(blockTotals(budgetLines(d, M), 'rev').actual).toBe(0);
    expect(availableReal(d, M)).toBe(withIt - 192.6);
  });

  it('CA3 : une dépense fix affectée sort du réel de la ligne et des dépenses fixes réelles', () => {
    const d = budget();
    addTransaction(d, tx('f', 'fix', 'rcj', 142.5, { assignedAccountId: LDDS }));
    addTransaction(d, tx('g', 'fix', 'rcj', 50));
    expect(line(d, 'rcj').actual).toBe(50);
    expect(blockTotals(budgetLines(d, M), 'fix').actual).toBe(50);
    deleteTransaction(d, 'g');
    expect(line(d, 'rcj').actual).toBeNull();
  });

  it('CA4 : une dépense payée avec Espèces affectée laisse le solde d’Espèces intact', () => {
    const d = budget();
    addTransaction(d, tx('c', 'var', 'imp', 200, { accountId: CASH_ACCOUNT_ID }));
    const before = bal(d, CASH_ACCOUNT_ID).balance;
    updateTransaction(d, 'c', { label: 'c', amount: 200, date: '2026-10-12', type: 'var', target: 'imp', assignedAccountId: LDDS });
    expect(d.transactions[0].assignedAccountId).toBe(LDDS);
    expect(bal(d, CASH_ACCOUNT_ID).balance).toBe(before);
    expect(line(d, 'imp').actual).toBeNull();
  });

  it('CA5 : soldes réel et estimé du compte propre identiques avant et après, y compris fix et rev sur une ligne pointée', () => {
    const d = budget();
    addTransaction(d, tx('f', 'fix', 'rcj', 142.5));
    addTransaction(d, tx('r', 'rev', 'rbt', 192.6));
    addTransaction(d, tx('v', 'var', 'imp', 80));
    // Chaque ligne pointée garde une autre écriture, non affectée : son montant compté reste son réel.
    addTransaction(d, tx('f2', 'fix', 'rcj', 30));
    addTransaction(d, tx('r2', 'rev', 'rbt', 10));
    for (const k of ['rcj', 'rbt']) checkLine(d, M, k, '2026-10-20');
    const estimated = () => monthBalance(d, M, MAIN_ACCOUNT_ID);
    const real = bal(d).balance;
    const est = estimated();
    expect(est).not.toBeNull();
    for (const id of ['f', 'r', 'v']) {
      const t = d.transactions.find(x => x.id === id)!;
      expect(updateTransaction(d, id, { label: id, amount: t.amount, date: '2026-10-12', type: t.type, target: t.target, assignedAccountId: LDDS })).toBe(true);
    }
    expect(bal(d).balance).toBe(real);
    expect(estimated()).toEqual(est);
  });

  it('CA5 (cas limite) : ligne pointée à 300 € dont la seule écriture est affectée (142,50 €) : solde estimé inchangé, la case garde le budget', () => {
    const d = budget();
    addTransaction(d, tx('f', 'fix', 'rcj', 142.5));
    checkLine(d, M, 'rcj', '2026-10-20');
    const est = monthBalance(d, M, MAIN_ACCOUNT_ID);
    expect(updateTransaction(d, 'f', { label: 'f', amount: 142.5, date: '2026-10-12', type: 'fix', target: 'rcj', assignedAccountId: LDDS })).toBe(true);
    expect(line(d, 'rcj').actual).toBeNull();
    expect(countedAmount(line(d, 'rcj'))).toEqual({ amount: 300, source: 'budget' });
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)).toEqual(est);
  });

  it('CA6 : solde, entrées/sorties et mouvements du compte d’affectation sont inchangés', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 708.03, { assignedAccountId: LDDS }));
    addTransaction(d, tx('r', 'rev', 'rbt', 20, { assignedAccountId: LDDS }));
    const b = bal(d, LDDS);
    expect(b.balance).toBe(63.95);
    expect(b.in).toBe(0);
    expect(b.out).toBeCloseTo(0, 5);
    expect(realMovements(d, LDDS, M)).toEqual([]);
    expect(estimatedMovements(d, LDDS, M)).toEqual([]);
    expect(flowOf(realMovements(d, LDDS, M)).in).toBe(0);
    // Le compte propre garde l'opération.
    expect(bal(d).balance).toBe(5000 - 708.03 + 20);
  });

  it('CA7 : le détail du compte liste les opérations affectées avec leurs totaux', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 708.03, { assignedAccountId: LDDS, detail: 'Carrelage', label: 'Leroy Merlin' }));
    addTransaction(d, tx('w', 'fix', 'rcj', 142.5, { assignedAccountId: LDDS }));
    addTransaction(d, tx('r', 'rev', 'rbt', 212.5, { assignedAccountId: LDDS }));
    addTransaction(d, tx('n', 'var', 'imp', 5));
    const ops = assignedOperations(d, LDDS, M);
    expect(ops).toHaveLength(3);
    expect(ops.find(o => o.id === 'v')).toMatchObject({ amount: -708.03, imputation: 'imp', detail: 'Carrelage', ownAccountName: 'Compte principal' });
    expect(assignedTotals(ops)).toEqual({ count: 3, expenses: 850.53, entries: 212.5, net: -638.03 });
    expect(assignedOperations(d, LDDS, '2026-11')).toEqual([]);
  });

  it('CA8 : retirer l’affectation remet l’opération dans tous les chiffres, aux montants exacts', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 708.03));
    const summary = monthSummary(d, led(d), M);
    const avail = availableReal(d, M);
    updateTransaction(d, 'v', { label: 'v', amount: 708.03, date: '2026-10-12', type: 'var', target: 'imp', assignedAccountId: LDDS });
    expect(line(d, 'imp').actual).toBeNull();
    expect(updateTransaction(d, 'v', { label: 'v', amount: 708.03, date: '2026-10-12', type: 'var', target: 'imp', assignedAccountId: null })).toBe(true);
    expect(d.transactions[0]).not.toHaveProperty('assignedAccountId');
    expect(line(d, 'imp').actual).toBe(708.03);
    expect(monthSummary(d, led(d), M)).toEqual(summary);
    expect(availableReal(d, M)).toBe(avail);
  });

  it('CA9 : refusé sur un mois clos (opération inchangée), mais le détail reste modifiable', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 50));
    d.months[M].closed = true;
    const before = structuredClone(d.transactions);
    expect(updateTransaction(d, 'v', { label: 'v', amount: 50, date: '2026-10-12', type: 'var', target: 'imp', assignedAccountId: LDDS })).toBe(false);
    expect(d.transactions).toEqual(before);
    expect(addTransaction(d, tx('w', 'var', 'imp', 5, { assignedAccountId: LDDS }))).toBe(false);
    expect(setTransactionDetail(d, 'v', 'précision')).toBe(true);
  });

  it('CA10 : compte propre, courant, invest, enveloppe, archivé, ou type env/epa refusés', () => {
    const d = budget();
    const tries = (assignedAccountId: string, extra: Partial<Transaction> = {}) => addTransaction(d, tx(`t${assignedAccountId}${extra.type ?? ''}`, 'var', 'imp', 10, { assignedAccountId, ...extra }));
    expect(tries(MAIN_ACCOUNT_ID)).toBe(false);
    expect(tries(CASH_ACCOUNT_ID)).toBe(false);
    expect(tries(INV)).toBe(false);
    expect(tries('acc-env-v')).toBe(false);
    expect(tries('inconnu')).toBe(false);
    // Le compte d'épargne ne peut être son propre compte d'affectation.
    expect(tries(LDDS, { accountId: LDDS })).toBe(false);
    expect(addTransaction(d, tx('e', 'env', 'v', 10, { assignedAccountId: LDDS }))).toBe(false);
    expect(addTransaction(d, tx('p', 'epa', 'x', 10, { assignedAccountId: LDDS }))).toBe(false);
    expect(d.transactions).toEqual([]);
    expect(tries(LDDS)).toBe(true);
    expect(canAssignTo(d, 'env', MAIN_ACCOUNT_ID, LDDS)).toBe(false);
    expect(assignableAccounts(d, MAIN_ACCOUNT_ID).map(a => a.id)).toEqual([LDDS]);
    // Archivé : refusé pour une nouvelle opération (RG4, voir CA12 pour l'existante).
    d.transactions = [];
    d.accounts.find(a => a.id === LDDS)!.archived = true;
    expect(tries(LDDS)).toBe(false);
    expect(assignableAccounts(d, MAIN_ACCOUNT_ID)).toEqual([]);
  });

  it('CA12 : un compte archivé après coup garde ses opérations affectées, hors budget, y compris à la modification du libellé', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 50, { assignedAccountId: LDDS }));
    expect(archiveBankAccount(d, LDDS)).toBe(true);
    expect(assignedOperations(d, LDDS, M)).toHaveLength(1);
    expect(line(d, 'imp').actual).toBeNull();
    expect(updateTransaction(d, 'v', { label: 'renommée', amount: 50, date: '2026-10-12', type: 'var', target: 'imp' })).toBe(true);
    expect(d.transactions[0]).toMatchObject({ label: 'renommée', assignedAccountId: LDDS });
    // Mais on ne peut pas en changer pour un autre compte archivé.
    expect(updateTransaction(d, 'v', { label: 'x', amount: 50, date: '2026-10-12', type: 'var', target: 'imp', assignedAccountId: 'inconnu' })).toBe(false);
    expect(d.transactions[0].label).toBe('renommée');
  });

  it('CA13 : une ligne qui ne porte que des affectées a un réel vide, retombe sur son budget au pointage, et reste portée', () => {
    const d = budget();
    addTransaction(d, tx('f', 'fix', 'rcj', 142.5, { assignedAccountId: LDDS }));
    const l = line(d, 'rcj');
    expect(l.actual).toBeNull();
    expect(countedAmount(l)).toEqual({ amount: 300, source: 'budget' });
    expect(isLineCarried(d, M, 'rcj')).toBe(true);
    expect(lineEntriesNote(d, M, l)).toBe('');
    addTransaction(d, tx('g', 'fix', 'rcj', 10));
    expect(lineEntriesNote(d, M, l)).toBe('1 écriture, réel = somme des écritures');
    expect(derivedActual(d, M, l)).toBe(10);
  });

  it('RG21 : changer de ligne conserve l’affectation ; changer de type vers env la refuse', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 50, { assignedAccountId: LDDS }));
    expect(updateTransaction(d, 'v', { label: 'v', amount: 50, date: '2026-10-12', type: 'var', target: 'cou' })).toBe(true);
    expect(d.transactions[0].assignedAccountId).toBe(LDDS);
    expect(line(d, 'cou').actual).toBeNull();
    expect(line(d, 'imp').actual).toBeNull();
    expect(updateTransaction(d, 'v', { label: 'v', amount: 50, date: '2026-10-12', type: 'env', target: 'v' })).toBe(false);
    expect(d.transactions[0]).toMatchObject({ type: 'var', target: 'cou', assignedAccountId: LDDS });
  });

  it('RG22 : supprimer une opération affectée la supprime partout', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 50, { assignedAccountId: LDDS }));
    deleteTransaction(d, 'v');
    expect(assignedOperations(d, LDDS, M)).toEqual([]);
    expect(d.transactions).toEqual([]);
  });

  it('CA18 (RG25) : la mention donne nombre et totaux, par compte ; absente sans affectée ou sur mois non initialisé ; KPI sans les affectées', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 100, { assignedAccountId: LDDS }));
    addTransaction(d, tx('r', 'rev', 'rbt', 30, { assignedAccountId: LDDS }));
    addTransaction(d, tx('n', 'var', 'imp', 5));
    const view = dashboardView(d, led(d), M, '2026-10-20');
    expect(view.assigned).toMatchObject({ count: 2, expenses: 100, entries: 30, net: -70 });
    expect(view.assigned!.byAccount).toEqual([{ accountId: LDDS, accountName: 'LDDS Travaux', count: 2, expenses: 100, entries: 30, net: -70 }]);
    expect(view.kpis!.incomeActual).toBe(0);
    expect(view.variables!.rows.find(r => r.key === 'imp')!.actual).toBe(5);
    expect(dashboardView(budget(), led(budget()), M, '2026-10-20').assigned).toBeNull();
    expect(dashboardView(d, led(d), '2026-12', '2026-10-20').assigned).toBeNull();
  });

  it('carte Épargne (0029) : l’affecté est une ligne à part, hors flux et solde du compte', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 100, { assignedAccountId: LDDS }));
    addTransaction(d, tx('r', 'rev', 'rbt', 30, { assignedAccountId: LDDS }));
    const view = dashboardView(d, led(d), M, '2026-10-20');
    const ldds = view.savingsAccounts!.rows.find(r => r.id === LDDS)!;
    expect(ldds.assigned).toEqual({ received: 30, spent: 100 });
    expect(ldds).toMatchObject({ received: 0, spent: 0, change: 0 });
    expect(view.savingsAccounts!.rows.find(r => r.id === INV)!.assigned).toBeUndefined();
    expect(view.savingsAccounts!.total.assigned).toEqual({ received: 30, spent: 100 });
    expect(dashboardView(budget(), led(budget()), M, '2026-10-20').savingsAccounts!.rows.find(r => r.id === LDDS)!.assigned).toBeUndefined();
    expect(dashboardView(d, led(d), '2026-12', '2026-10-20').savingsAccounts).toBeNull();
  });

  it('carte Épargne (0029, RG4) : reçu, dépensé et évolution viennent des flux réels du compte (bankMonth)', () => {
    const d = budget();
    d.adjustments = [
      { id: 'a1', accountId: LDDS, date: '2026-10-05', amount: 50, label: 'relevé', createdOn: '2026-10-05' },
      { id: 'a2', accountId: LDDS, date: '2026-10-06', amount: -20, label: 'relevé', createdOn: '2026-10-06' },
    ];
    const row = dashboardView(d, led(d), M, '2026-10-20').savingsAccounts!.rows.find(r => r.id === LDDS)!;
    const b = led(d).bankMonth(LDDS, M)!;
    expect([row.received, row.spent, row.change]).toEqual([b.in, b.out || 0, Math.round((b.balance - b.start) * 100) / 100]);
    expect(row.change).toBe(row.received - row.spent);
    expect(row.change).toBe(30);
  });

  it('carte Épargne (0029, RG3) : un compte archivé n’apparaît que s’il a un mouvement ou une affectée', () => {
    const d = budget();
    d.accounts.find(a => a.id === LDDS)!.archived = true;
    const ids = () => dashboardView(d, led(d), M, '2026-10-20').savingsAccounts?.rows.map(r => r.id) ?? [];
    expect(ids()).toEqual([INV]);
    d.adjustments = [{ id: 'a1', accountId: LDDS, date: '2026-10-05', amount: 50, label: 'relevé', createdOn: '2026-10-05' }];
    expect(ids()).toContain(LDDS);
    d.adjustments = [];
    d.transactions.push(tx('v', 'var', 'imp', 10, { assignedAccountId: LDDS })); // assigned before the archiving (addTransaction would now refuse)
    expect(ids()).toContain(LDDS);
  });

  it('carte Épargne (0029) : le filtre « Avec évolution » garde les comptes qui ont bougé ou une affectée', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 10, { assignedAccountId: LDDS }));
    const rows = dashboardView(d, led(d), M, '2026-10-20').savingsAccounts!.rows;
    expect(rows.filter(hasMovement).map(r => r.id)).toEqual([LDDS]);
    expect(rows.find(r => r.id === INV)).toBeDefined();
    expect(hasMovement(rows.find(r => r.id === INV)!)).toBe(false);
  });

  it('CA16 : sans affectation rien ne change (opération non affectée = comportement d’avant)', () => {
    const d = budget();
    addTransaction(d, tx('v', 'var', 'imp', 50));
    expect(line(d, 'imp').actual).toBe(50);
    expect(d.transactions[0]).not.toHaveProperty('assignedAccountId');
    expect(attachedMovements(d, LDDS, M)).toEqual([]);
  });
});

describe('import avec affectation (spec 0028, RG17, CA11)', () => {
  const PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
  const row = (label: string, amount: number, direction: 'debit' | 'credit' = 'debit'): StatementRow => ({ date: '2026-10-05', label, notes: '', category: '', accountName: PAIR[0], connectionName: PAIR[1], amount, direction });
  const setup = () => {
    const d = budget();
    d.importAccountLinks = [{ id: 'l1', accountName: PAIR[0], connectionName: PAIR[1], accountId: MAIN_ACCOUNT_ID }];
    return d;
  };
  let seq = 0;
  const newId = (p: string) => `${p}${++seq}`;

  it('crée l’opération avec son affectation, sans toucher l’empreinte, et un réimport la signale « Doublon »', () => {
    const d = setup();
    const reading = { rows: [row('LEROY MERLIN', 708.03)], errors: [] };
    const preview = prepareImport(d, reading);
    const l = preview.lines[0];
    const tuned: PreviewLine = { ...l, month: M, target: { kind: 'var', key: 'imp' }, checked: true, assignedAccountId: LDDS };
    const batch = validateImport(d, { ...preview, lines: [tuned] }, newId);
    expect(batch.expenses).toBe(1);
    const t = d.transactions[0];
    expect(t).toMatchObject({ type: 'var', assignedAccountId: LDDS, fingerprint: fingerprintOf(l.row), accountId: MAIN_ACCOUNT_ID });
    expect(line(d, 'imp').actual).toBeNull();
    expect(prepareImport(d, reading).lines[0].duplicate).toBe(true);
  });

  it('une entrée importée peut être affectée ; un compte d’affectation invalide empêche la ligne', () => {
    const d = setup();
    const preview = prepareImport(d, { rows: [row('REMBOURSEMENT', 192.6, 'credit')], errors: [] });
    const tuned: PreviewLine = { ...preview.lines[0], month: M, nature: 'revenu', target: { kind: 'line', key: 'rbt' }, checked: true, assignedAccountId: LDDS };
    validateImport(d, { ...preview, lines: [tuned] }, newId);
    expect(d.transactions[0]).toMatchObject({ type: 'rev', assignedAccountId: LDDS });
    expect(line(d, 'rbt').actual).toBeNull();
    // Invalide (compte courant).
    const bad = { ...tuned, assignedAccountId: CASH_ACCOUNT_ID };
    expect(lineProblem(d, bad)).toBe('Compte d’affectation invalide');
  });

  it('Suggestion B : le compte imposé par la ligne variable est le vrai compte propre, l’affectation à ce compte est refusée dès l’aperçu', () => {
    const d = setup();
    // La ligne « imp » est payée depuis le LDDS (compte imposé) : s'y affecter est invalide, même si l'import vient du compte principal.
    line(d, 'imp').accountId = LDDS;
    const preview = prepareImport(d, { rows: [row('LEROY MERLIN', 10)], errors: [] });
    const l: PreviewLine = { ...preview.lines[0], month: M, target: { kind: 'var', key: 'imp' }, checked: true };
    expect(lineProblem(d, l)).toBeNull();
    expect(lineProblem(d, { ...l, assignedAccountId: LDDS })).toBe('Compte d’affectation invalide');
    line(d, 'imp').accountId = undefined;
    expect(lineProblem(d, { ...l, assignedAccountId: LDDS })).toBeNull();
  });

  it('Suggestion C : l’affectation est retirée quand la ligne devient une enveloppe ou un transfert', () => {
    const d = setup();
    const preview = prepareImport(d, { rows: [row('LEROY MERLIN', 10)], errors: [] });
    const l: PreviewLine = { ...preview.lines[0], month: M, nature: 'depense', target: { kind: 'var', key: 'imp' }, assignedAccountId: LDDS };
    expect(withValidAssignment(l).assignedAccountId).toBe(LDDS);
    expect(withValidAssignment({ ...l, target: { kind: 'env', id: 'v' } })).not.toHaveProperty('assignedAccountId');
    expect(withValidAssignment(changeNature(d, l, 'retrait'))).not.toHaveProperty('assignedAccountId');
    expect(withValidAssignment({ ...l, target: { kind: 'line', key: 'rcj' } }).assignedAccountId).toBe(LDDS);
  });
});
