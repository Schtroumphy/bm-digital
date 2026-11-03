import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, updateTransaction } from './actions';
import { addManualTransaction } from './manualEntry';
import { checkLine } from './checkoff';
import { changeNature, chooseEnvelope, lineProblem, natureOptions, prepareImport, previewCounts, sessionSummary, validateImport, type PreviewLine } from './statementImport';
import { accountPointage } from '../domain/checkoff';
import { availableReal, blockTotals, monthSummary } from '../domain/budget';
import { estimatedMovements, realMovements } from '../domain/bankMovements';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { MAIN_ACCOUNT_ID, defaultBankAccounts, newEnvelopeAccount, offBudgetEntryAccounts } from '../domain/bank';
import { seedData } from '../domain/seed';
import type { StatementRow } from '../domain/statement';
import type { BankAccount, BudgetData, Line, Transaction } from '../domain/types';

/* Entrée d'argent sur un compte courant hors budget, ex. Swile (spec 0042). */

const M = '2026-12';
const SWILE = 'acc-swile';
const swileAccount = (extra: Partial<BankAccount> = {}): BankAccount => ({ id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 20, openingMonth: '2026-10', inBudget: false, archived: false, ...extra });
const accin = (extra: Partial<Transaction> = {}): Transaction => ({ id: 'a1', month: M, day: 10, label: 'Titres-restaurant', amount: 150, type: 'accin', target: SWILE, ...extra });
const seedWithSwile = (extra: Partial<BankAccount> = {}): BudgetData => {
  const d = seedData();
  d.accounts.push(swileAccount(extra));
  return d;
};
const bank = (d: BudgetData, id: string) => new Ledger(d, M).bankMonth(id, M)!;

describe('saisie (RG1 à RG3, RG5, RG6)', () => {
  it('CA2 : Swile à 20 €, +150 € → 170 € en réel et en estimé, crédité une seule fois', () => {
    const d = seedWithSwile();
    expect(bank(d, SWILE).balance).toBe(20);
    expect(addTransaction(d, accin({ bankDate: '2026-12-10' }))).toBe(true);
    expect(d.transactions.at(-1)).toMatchObject({ type: 'accin', accountId: SWILE, target: SWILE });
    expect(bank(d, SWILE).balance).toBe(170);
    const real = realMovements(d, SWILE, M).filter(m => m.amount === 150);
    expect(real).toHaveLength(1);
    expect(real[0]).toMatchObject({ date: '2026-12-10', label: expect.stringContaining('(entrée sur compte hors budget)'), imputation: { name: 'Swile', type: 'accin' } });
    expect(estimatedMovements(d, SWILE, M).filter(m => m.amount === 150)).toHaveLength(1);
    // Aucun autre compte n'est touché.
    expect(realMovements(d, MAIN_ACCOUNT_ID, M).some(m => m.amount === 150)).toBe(false);
  });

  it('le compte donné est ignoré (celui du compte cible) ; source et détail gardés, mode de paiement retiré', () => {
    const d = seedWithSwile();
    addTransaction(d, accin({ accountId: MAIN_ACCOUNT_ID, source: 'Employeur', detail: ' Novembre ', payMode: 'especes' }));
    const t = d.transactions.at(-1)!;
    expect(t).toMatchObject({ accountId: SWILE, source: 'Employeur', detail: 'Novembre' });
    expect(t.payMode).toBeUndefined();
  });

  it('CA3 : revenus, disponible, pointage, enveloppes et lignes inchangés ; aucune ligne rev créée', () => {
    const d = seedWithSwile();
    const revLine = d.months[M].lines.find(l => l.block === 'rev')!;
    checkLine(d, M, revLine.key, '2026-12-05');
    const ledger = () => new Ledger(d, M);
    const before = {
      summary: monthSummary(d, ledger(), M),
      available: availableReal(d, M),
      pointage: accountPointage(d, M, MAIN_ACCOUNT_ID, '2026-12-20'),
      rev: blockTotals(d.months[M].lines, 'rev'),
      lines: structuredClone(d.months[M].lines),
      env: d.envelopes.map(e => ledger().envMonth(e.id, M)),
    };
    addTransaction(d, accin());
    expect(monthSummary(d, ledger(), M)).toEqual(before.summary);
    expect(availableReal(d, M)).toBe(before.available);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2026-12-20')).toEqual(before.pointage);
    expect(blockTotals(d.months[M].lines, 'rev')).toEqual(before.rev);
    expect(d.months[M].lines).toEqual(before.lines);
    expect(d.envelopes.map(e => ledger().envMonth(e.id, M))).toEqual(before.env);
    expect(d.transactions.some(t => t.type === 'rev')).toBe(false);
  });

  it('précision du développeur : aucune ligne de revenu n’existe dans le budget, l’entrée sur Swile est possible', () => {
    const d = emptyData();
    d.firstMonth = M;
    d.accounts = [...defaultBankAccounts(M), swileAccount({ openingMonth: M, openingBalance: 0 })];
    d.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    expect(addTransaction(d, accin())).toBe(true);
    expect(new Ledger(d, M).bankMonth(SWILE, M)!.balance).toBe(150);
    expect(d.months[M].lines).toEqual([]);
    expect(d.transactions.map(t => t.type)).toEqual(['accin']);
  });

  it('la liste des comptes proposés : seuls les courants actifs hors budget (le groupe est absent sinon)', () => {
    const d = seedWithSwile();
    expect(offBudgetEntryAccounts(d).map(a => a.id)).toEqual([SWILE]);
    expect(offBudgetEntryAccounts(seedData())).toEqual([]);
  });

  it('CA4 : refus et rien d’écrit', () => {
    const refused = (d: BudgetData, t: Transaction) => {
      const n = d.transactions.length;
      expect(addTransaction(d, t)).toBe(false);
      expect(d.transactions).toHaveLength(n);
    };
    const d = seedWithSwile();
    refused(d, accin({ amount: 0 }));
    refused(d, accin({ amount: -5 }));
    refused(d, accin({ day: 0 }));
    refused(d, accin({ day: 32 }));
    refused(d, accin({ target: 'inconnu' }));
    refused(d, accin({ assignedAccountId: 'acc-cash' }));
    refused(d, accin({ offBudget: true }));
    refused(d, accin({ month: '2027-06' })); // non initialisé
    // Comptes non éligibles : principal, enveloppe, en budget, épargne, investissement, espèces.
    d.accounts.push({ ...swileAccount({ id: 'acc-bud', name: 'Joint', inBudget: true }) });
    d.accounts.push({ ...swileAccount({ id: 'acc-sav', name: 'Livret', kind: 'epargne' }) });
    d.accounts.push({ ...swileAccount({ id: 'acc-inv', name: 'PEA', kind: 'invest' }) });
    for (const target of [MAIN_ACCOUNT_ID, 'acc-env-voiture', 'acc-bud', 'acc-sav', 'acc-inv', 'acc-cash']) refused(d, accin({ target }));
    const closed = seedWithSwile();
    closed.months[M].closed = true;
    refused(closed, accin());
    refused(seedWithSwile({ archived: true }), accin());
  });

  it('saisie manuelle : la date réelle est l’écriture', () => {
    const d = seedWithSwile();
    expect(addManualTransaction(d, { id: 'm', month: M, label: 'x', amount: 5, type: 'accin', target: SWILE }, undefined)).toBe(false);
    expect(addManualTransaction(d, { id: 'm', month: M, label: 'x', amount: 5, type: 'accin', target: SWILE }, '2026-12-12')).toBe(true);
    expect(d.transactions.at(-1)).toMatchObject({ day: 12, bankDate: '2026-12-12' });
  });

  it('RG9 : non modifiable, supprimable (solde recalculé) ; refusé sur un mois clos', () => {
    const d = seedWithSwile();
    addTransaction(d, accin());
    expect(updateTransaction(d, 'a1', { label: 'x', amount: 10, date: '2026-12-10', type: 'accin', target: SWILE })).toBe(false);
    expect(updateTransaction(d, 'a1', { label: 'x', amount: 10, date: '2026-12-10', type: 'var', target: 'x' })).toBe(false);
    expect(d.transactions.find(t => t.id === 'a1')).toMatchObject({ amount: 150 });
    expect(deleteTransaction(d, 'a1')).toBe(true);
    expect(bank(d, SWILE).balance).toBe(20);
  });

  it('CA11 : compte archivé ou repassé dans le budget → l’écriture reste comptée, nouvel ajout refusé', () => {
    for (const change of [{ archived: true }, { inBudget: true }]) {
      const d = seedWithSwile();
      addTransaction(d, accin());
      Object.assign(d.accounts.find(a => a.id === SWILE)!, change);
      expect(bank(d, SWILE).balance).toBe(170);
      expect(realMovements(d, SWILE, M).some(m => m.amount === 150)).toBe(true);
      expect(addTransaction(d, accin({ id: 'a2' }))).toBe(false);
    }
  });

  it('CA12 : les données sans entrée de ce type se calculent comme avant', () => {
    const d = seedWithSwile();
    expect(new Ledger(structuredClone(d), M).bankMonth(MAIN_ACCOUNT_ID, M)).toEqual(new Ledger(d, M).bankMonth(MAIN_ACCOUNT_ID, M));
  });
});

/* Import (RG4 à RG8) */

const MAIN_PAIR = ['Compte Courant', 'Banque'] as const;
const SWILE_PAIR = ['Swile', 'Swile'] as const;
const ln = (key: string, block: Line['block'], budget: number): Line => ({ key, block, section: '', name: key, budget, actual: null });
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;

function importBudget(withRevenue = true): BudgetData {
  const d = emptyData();
  d.firstMonth = '2026-10';
  d.accounts = [...defaultBankAccounts('2026-10'), swileAccount({ openingBalance: 20 }), newEnvelopeAccount('acc-env-vac', 'vac', 'Vacances', 200, 0, '2026-10')];
  d.accounts[0].openingBalance = 1000;
  d.envelopes = [{ id: 'vac', name: 'Vacances', hue: 200, openingCash: 0, accountId: 'acc-env-vac' }];
  d.months['2026-10'] = { initialized: true, lines: withRevenue ? [ln('salaire', 'rev', 2400), ln('courses', 'var', 300)] : [ln('courses', 'var', 300)], alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: MAIN_PAIR[0], connectionName: MAIN_PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l3', accountName: SWILE_PAIR[0], connectionName: SWILE_PAIR[1], accountId: SWILE },
  ];
  return d;
}
const credit = (label: string, amount: number, pair: readonly [string, string] = SWILE_PAIR, date = '2026-10-12'): StatementRow => ({ date, label, notes: '', category: '', accountName: pair[0], connectionName: pair[1], amount, direction: 'credit' });
const preview = (d: BudgetData, rows: StatementRow[]) => prepareImport(d, { rows, errors: [] });
const asAccountEntry = (d: BudgetData, l: PreviewLine, id = SWILE): PreviewLine => chooseEnvelope(d, changeNature(d, l, 'accin'), { kind: 'account', id });
const bal = (d: BudgetData, id: string) => new Ledger(d, '2026-10').bankMonth(id, '2026-10')!.balance;

describe('import (spec 0042)', () => {
  it('CA5 : la nature est proposée pour un crédit de tout fichier, jamais pour un débit', () => {
    const d = importBudget();
    for (const pair of [MAIN_PAIR, SWILE_PAIR]) expect(natureOptions(preview(d, [credit('X', 5, pair)]).lines[0])).toContain('accin');
    const debit = { ...preview(d, [credit('X', 5)]).lines[0], row: { ...credit('X', 5), direction: 'debit' as const } };
    expect(natureOptions(debit)).not.toContain('accin');
    expect(changeNature(d, debit, 'accin')).toBe(debit);
  });

  it('CA5 : fichier Swile → Swile prérempli et ligne cochée d’office, sans aucune ligne de revenu', () => {
    const d = importBudget(false);
    const l = changeNature(d, preview(d, [credit('CREDIT EMPLOYEUR', 150)]).lines[0], 'accin');
    expect(l.target).toEqual({ kind: 'account', id: SWILE });
    expect(l.checked).toBe(true);
    expect(lineProblem(d, l)).toBeNull();
  });

  it('CA5 : fichier du principal → « À rattacher » tant qu’aucun compte n’est choisi, puis coché', () => {
    const d = importBudget();
    const l = changeNature(d, preview(d, [credit('CREDIT', 150, MAIN_PAIR)]).lines[0], 'accin');
    expect(l.target).toBeNull();
    expect(l.checked).toBe(false);
    expect(lineProblem(d, l)).toBe('À rattacher');
    const chosen = chooseEnvelope(d, l, { kind: 'account', id: SWILE });
    expect(lineProblem(d, chosen)).toBeNull();
    expect(chosen.checked).toBe(true);
  });

  it('RG4 : un compte non éligible (principal, en budget, enveloppe) rend la ligne non importable', () => {
    const d = importBudget();
    const l = changeNature(d, preview(d, [credit('X', 5)]).lines[0], 'accin');
    for (const id of [MAIN_ACCOUNT_ID, 'acc-env-vac', 'inconnu']) expect(lineProblem(d, { ...l, target: { kind: 'account', id }, checked: true })).toBe('À rattacher');
    d.accounts.find(a => a.id === SWILE)!.archived = true;
    expect(lineProblem(d, { ...l, target: { kind: 'account', id: SWILE }, checked: true })).toBe('À rattacher');
  });

  it('CA7 : l’import écrit une entrée dans le monde sans ligne de revenu, avec date bancaire et source', () => {
    const d = importBudget(false);
    const p = preview(d, [credit('CREDIT EMPLOYEUR', 150)]);
    const p2 = { ...p, lines: p.lines.map(l => ({ ...asAccountEntry(d, l), month: '2026-10' })) };
    expect(previewCounts(d, p2).toImport).toBe(1);
    const batch = validateImport(d, p2, newId);
    expect(batch).toMatchObject({ accountEntries: 1, accountEntriesTotal: 150, revenues: 0, envelopeEntries: 0, failedIds: [] });
    expect(d.transactions[0]).toMatchObject({ type: 'accin', target: SWILE, accountId: SWILE, amount: 150, month: '2026-10', day: 12, bankDate: '2026-10-12', importAccountId: SWILE, source: 'CREDIT EMPLOYEUR' });
    expect(bal(d, SWILE)).toBe(170);
    expect(d.months['2026-10'].lines.some(l => l.block === 'rev')).toBe(false);
    expect(monthSummary(d, new Ledger(d, '2026-10'), '2026-10').income).toBe(0);
    expect(sessionSummary(p2, batch, new Set(batch.importedIds))).toMatchObject({ accountEntries: 1, accountEntriesTotal: 150, revenues: 0 });
  });

  it('CA6 : un crédit du fichier du principal importé vers Swile → principal inchangé, Swile +montant', () => {
    const d = importBudget();
    const mainBefore = bal(d, MAIN_ACCOUNT_ID);
    const p = preview(d, [credit('VIREMENT EXTERNE', 80, MAIN_PAIR)]);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...asAccountEntry(d, l), month: '2026-10' })) }, newId);
    expect(d.transactions[0]).toMatchObject({ type: 'accin', accountId: SWILE, importAccountId: MAIN_ACCOUNT_ID });
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(mainBefore);
    expect(bal(d, SWILE)).toBe(100);
  });

  it('CA8 : au réimport, la ligne est « Doublon » quelle que soit la nature proposée', () => {
    const d = importBudget();
    const rows = [credit('CREDIT EMPLOYEUR', 150)];
    const p = preview(d, rows);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...asAccountEntry(d, l), month: '2026-10' })) }, newId);
    const again = preview(d, rows).lines[0];
    expect(again.duplicate).toBe(true);
    for (const nature of ['revenu', 'envin', 'accin', 'recu'] as const) expect(changeNature(d, again, nature).duplicate).toBe(true);
    const batch = validateImport(d, { ...preview(d, rows), lines: preview(d, rows).lines.map(l => asAccountEntry(d, l)) }, newId);
    expect(batch.importedIds).toEqual([]);
    expect(d.transactions).toHaveLength(1);
  });

  it('l’entrée n’est jamais mémorisée en règle', () => {
    const d = importBudget();
    const p = preview(d, [credit('CREDIT EMPLOYEUR', 150)]);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...asAccountEntry(d, l), month: '2026-10', remember: 'credit employeur' })) }, newId);
    expect(d.importRules ?? []).toEqual([]);
  });

  it('suppression : le solde est recalculé et la clé de déduplication libérée', () => {
    const d = importBudget();
    const rows = [credit('CREDIT EMPLOYEUR', 150)];
    const p = preview(d, rows);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...asAccountEntry(d, l), month: '2026-10' })) }, newId);
    expect(deleteTransaction(d, d.transactions[0].id)).toBe(true);
    expect(bal(d, SWILE)).toBe(20);
    expect(preview(d, rows).lines[0].duplicate).toBe(false);
  });
});
