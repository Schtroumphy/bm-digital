import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, updateTransaction } from './actions';
import { addManualTransaction } from './manualEntry';
import { deleteEnvelope } from './envelopes';
import { changeNature, chooseEnvelope, lineProblem, natureOptions, prepareImport, previewCounts, sessionSummary, validateImport, type PreviewLine } from './statementImport';
import { lineStates } from './importFilters';
import { blockTotals, monthSummary } from '../domain/budget';
import { envelopeConsumption } from '../domain/envelopeCash';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts, envelopeEntryAccount, newEnvelopeAccount } from '../domain/bank';
import { seedData } from '../domain/seed';
import type { StatementRow } from '../domain/statement';
import type { BudgetData, Line, Transaction } from '../domain/types';

/* Entrée d'argent sur une enveloppe (spec 0036). */

const M = '2026-12';
const envin = (extra: Partial<Transaction> = {}): Transaction => ({ id: 'e1', month: M, day: 10, label: 'Remboursement pneu', amount: 40, type: 'envin', target: 'voiture', ...extra });
const ledger = (d: BudgetData) => new Ledger(d, M);
const env = (d: BudgetData, id = 'voiture') => ledger(d).envMonth(id, M)!;

describe('saisie (RG1 à RG3)', () => {
  it('CA2 : 40 € sur une enveloppe à 520 € avec 62 € dépensés → solde 560 €, dépensé 22 €', () => {
    const d = seedData();
    expect(env(d)).toMatchObject({ spent: 62, balance: 520 });
    expect(addTransaction(d, envin())).toBe(true);
    expect(env(d)).toMatchObject({ spent: 22, balance: 560 });
    // L'écriture est sur le compte de l'enveloppe, sans espèces ni mode de paiement.
    expect(d.transactions.at(-1)).toMatchObject({ type: 'envin', accountId: 'acc-env-voiture' });
  });

  it('RG2 : le compte donné est ignoré, c’est toujours celui de l’enveloppe ; source et détail sont gardés', () => {
    const d = seedData();
    addTransaction(d, envin({ accountId: MAIN_ACCOUNT_ID, source: 'Garage', detail: ' Pneu avant ', payMode: 'especes' }));
    const t = d.transactions.at(-1)!;
    expect(t).toMatchObject({ accountId: 'acc-env-voiture', source: 'Garage', detail: 'Pneu avant' });
    expect(t.payMode).toBeUndefined();
  });

  it('RG6 : les totaux de dépensé et l’épargne réelle lisent le dépensé net', () => {
    const d = seedData();
    const before = monthSummary(d, ledger(d), M);
    addTransaction(d, envin());
    const after = monthSummary(d, ledger(d), M);
    expect(after.envelopeSpent).toBe(Math.round((before.envelopeSpent - 40) * 100) / 100);
    expect(after.realSavings).toBe(Math.round((before.realSavings + 40) * 100) / 100);
  });

  it('CA5 / RG3 : refus et rien d’écrit', () => {
    const refused = (d: BudgetData, t: Transaction) => {
      const n = d.transactions.length;
      expect(addTransaction(d, t)).toBe(false);
      expect(d.transactions).toHaveLength(n);
    };
    const d = seedData();
    refused(d, envin({ amount: 0 }));
    refused(d, envin({ amount: -5 }));
    refused(d, envin({ day: 0 }));
    refused(d, envin({ day: 32 }));
    refused(d, envin({ target: 'inconnue' }));
    refused(d, envin({ assignedAccountId: 'acc-cash' }));
    refused(d, envin({ offBudget: true }));
    refused(d, envin({ month: '2027-06' })); // non initialisé
    const closed = seedData();
    closed.months[M].closed = true;
    refused(closed, envin());
    const noAccount = seedData();
    noAccount.accounts.find(a => a.id === 'acc-env-voiture')!.archived = true;
    refused(noAccount, envin());
    const orphan = seedData();
    orphan.envelopes.find(e => e.id === 'voiture')!.accountId = 'absent';
    refused(orphan, envin());
    expect(envelopeEntryAccount(orphan, 'voiture')).toBeUndefined();
  });

  it('saisie manuelle : la date réelle est l’écriture, et addManualTransaction refuse sans date', () => {
    const d = seedData();
    expect(addManualTransaction(d, { id: 'm', month: M, label: 'x', amount: 5, type: 'envin', target: 'voiture' }, undefined)).toBe(false);
    expect(addManualTransaction(d, { id: 'm', month: M, label: 'x', amount: 5, type: 'envin', target: 'voiture' }, '2026-12-12')).toBe(true);
    expect(d.transactions.at(-1)).toMatchObject({ day: 12, bankDate: '2026-12-12' });
  });

  it('CA6 : dépensé 30 € puis entrée de 50 € → dépensé −20 €, sans plancher', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: M, day: 3, label: 'Pharmacie', amount: 30, type: 'env', target: 'sante' });
    expect(env(d, 'sante').spent).toBe(30);
    addTransaction(d, envin({ target: 'sante', amount: 50 }));
    expect(env(d, 'sante')).toMatchObject({ spent: -20, balance: 80 });
    // La barre de consommation ne descend pas sous 0 ; l'entrée n'est comptée qu'une fois (dans le dépensé net) : départ 80 inchangé, restant 80 + 20.
    const c = envelopeConsumption(d, ledger(d), 'sante', M)!;
    expect(c).toMatchObject({ start: 80, spent: -20, remaining: 100, consumed: 0 });
  });

  it('RG11 : non modifiable (sauf détail), supprimable, dépensé recalculé', () => {
    const d = seedData();
    addTransaction(d, envin());
    expect(updateTransaction(d, 'e1', { label: 'x', amount: 10, date: '2026-12-10', type: 'envin', target: 'voiture' })).toBe(false);
    expect(updateTransaction(d, 'e1', { label: 'x', amount: 10, date: '2026-12-10', type: 'env', target: 'voiture' })).toBe(false);
    expect(d.transactions.find(t => t.id === 'e1')).toMatchObject({ amount: 40, label: 'Remboursement pneu' });
    expect(deleteTransaction(d, 'e1')).toBe(true);
    expect(env(d)).toMatchObject({ spent: 62, balance: 520 });
    d.months[M].closed = true;
    addTransaction(d, envin({ id: 'e2' }));
    expect(d.transactions.some(t => t.id === 'e2')).toBe(false);
  });

  it('CA12 / RG13 : même garde-fou que les dépenses pour supprimer une enveloppe', () => {
    const d = seedData();
    expect(deleteEnvelope(d, 'voiture', M)).toBe('not_empty');
    // Une enveloppe vide à 40 € près : ses entrées comptent dans le solde du compte.
    const e = emptyData();
    e.firstMonth = M;
    e.accounts = [...defaultBankAccounts(M), newEnvelopeAccount('acc-env-x', 'x', 'X', 100, 0, M)];
    e.envelopes = [{ id: 'x', name: 'X', hue: 100, openingCash: 0, accountId: 'acc-env-x' }];
    e.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    expect(deleteEnvelope(structuredClone(e), 'x', M)).toBe('ok');
    addTransaction(e, envin({ target: 'x' }));
    expect(deleteEnvelope(e, 'x', M)).toBe('not_empty');
  });

  it('RG14 : les données sans entrée sur enveloppe se calculent comme avant', () => {
    const d = seedData();
    const e = structuredClone(d);
    expect(new Ledger(e, M).envMonth('voiture', M)).toEqual(new Ledger(d, M).envMonth('voiture', M));
    expect(d.transactions.some(t => t.type === 'envin')).toBe(false);
  });
});

/* Import (RG4, RG5, RG9, RG10) */

const MAIN_PAIR = ['Compte Courant', 'Banque'] as const;
const ENV_PAIR = ['Compte Vacances', 'Banque'] as const;
const SWILE = 'acc-swile';
const SWILE_PAIR = ['Swile', 'Swile'] as const;
const ln = (key: string, block: Line['block'], budget: number): Line => ({ key, block, section: '', name: key, budget, actual: null });
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;

function importBudget(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2026-10';
  d.accounts = [...defaultBankAccounts('2026-10'), { id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2026-10', inBudget: false, archived: false }, newEnvelopeAccount('acc-env-vac', 'vac', 'Vacances', 200, 0, '2026-10')];
  d.accounts[0].openingBalance = 1000;
  d.envelopes = [{ id: 'vac', name: 'Vacances', hue: 200, openingCash: 0, accountId: 'acc-env-vac' }];
  d.months['2026-10'] = { initialized: true, lines: [ln('salaire', 'rev', 2400), ln('courses', 'var', 300)], alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: MAIN_PAIR[0], connectionName: MAIN_PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l2', accountName: ENV_PAIR[0], connectionName: ENV_PAIR[1], accountId: 'acc-env-vac' },
    { id: 'l3', accountName: SWILE_PAIR[0], connectionName: SWILE_PAIR[1], accountId: SWILE },
  ];
  return d;
}
const credit = (label: string, amount: number, pair: readonly [string, string] = MAIN_PAIR, date = '2026-10-12'): StatementRow => ({ date, label, notes: '', category: '', accountName: pair[0], connectionName: pair[1], amount, direction: 'credit' });
const preview = (d: BudgetData, rows: StatementRow[]) => prepareImport(d, { rows, errors: [] });
const asEntry = (d: BudgetData, l: PreviewLine, id = 'vac'): PreviewLine => chooseEnvelope(d, changeNature(d, l, 'envin'), { kind: 'env', id });
const bal = (d: BudgetData, id: string) => new Ledger(d, '2026-10').bankMonth(id, '2026-10')!.balance;

describe('import (spec 0036, RG4)', () => {
  it('CA7 : la nature est proposée pour le fichier du principal, d’un autre compte et d’un compte d’enveloppe', () => {
    const d = importBudget();
    for (const pair of [MAIN_PAIR, SWILE_PAIR, ENV_PAIR]) {
      const l = preview(d, [credit('REMB', 40, pair)]).lines[0];
      expect(natureOptions(l)).toEqual(['revenu', 'envin', 'accin', 'recu']);
    }
    // Un débit ne la propose pas, et ne peut pas la prendre.
    const debit = { ...preview(d, [credit('X', 5)]).lines[0], row: { ...credit('X', 5), direction: 'debit' as const } };
    expect(natureOptions(debit)).not.toContain('envin');
    expect(changeNature(d, debit, 'envin')).toBe(debit);
  });

  it('CA7 : sans enveloppe choisie, la ligne reste « À rattacher » ; avec une enveloppe, elle est cochée d’office', () => {
    const d = importBudget();
    const l = changeNature(d, preview(d, [credit('REMB PNEU', 40)]).lines[0], 'envin');
    expect(l.target).toBeNull();
    expect(l.checked).toBe(false);
    expect(lineProblem(d, l)).toBe('À rattacher');
    expect(lineStates(d, l)).toContain('a_rattacher');
    const chosen = chooseEnvelope(d, l, { kind: 'env', id: 'vac' });
    expect(lineProblem(d, chosen)).toBeNull();
    expect(chosen.checked).toBe(true);
  });

  it('CA7 : fichier d’un compte d’enveloppe → enveloppe préremplie et ligne cochée d’office', () => {
    const d = importBudget();
    const l = changeNature(d, preview(d, [credit('REMB', 40, ENV_PAIR)]).lines[0], 'envin');
    expect(l.target).toEqual({ kind: 'env', id: 'vac' });
    expect(l.checked).toBe(true);
    expect(lineProblem(d, l)).toBeNull();
  });

  it('RG5 : enveloppe sans compte actif → non importable, même message que pour une dépense d’enveloppe', () => {
    const d = importBudget();
    const l = changeNature(d, preview(d, [credit('REMB', 40)]).lines[0], 'envin');
    d.accounts.find(a => a.id === 'acc-env-vac')!.archived = true;
    const forced = { ...l, target: { kind: 'env' as const, id: 'vac' }, checked: true };
    expect(lineProblem(d, forced)).toBe('À rattacher');
    expect(validateImport(d, preview(d, [credit('REMB', 40)]), newId).importedIds).toEqual([]);
  });

  it('CA7b / CA8 : 40 € du fichier du principal → solde du principal inchangé, enveloppe +40 €, mêmes effets que la saisie', () => {
    const d = importBudget();
    const p = preview(d, [credit('REMB PNEU', 40)]);
    const p2 = { ...p, lines: p.lines.map(l => ({ ...asEntry(d, l), source: 'Garage', month: '2026-10' })) };
    expect(previewCounts(d, p2).toImport).toBe(1);
    const mainBefore = bal(d, MAIN_ACCOUNT_ID);
    const batch = validateImport(d, p2, newId);
    expect(batch).toMatchObject({ envelopeEntries: 1, envelopeEntriesTotal: 40, revenues: 0, failedIds: [] });
    expect(d.transactions[0]).toMatchObject({ type: 'envin', target: 'vac', accountId: 'acc-env-vac', amount: 40, month: '2026-10', day: 12, bankDate: '2026-10-12', importAccountId: MAIN_ACCOUNT_ID, source: 'Garage' });
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(mainBefore);
    expect(bal(d, 'acc-env-vac')).toBe(40);
    const ledger = new Ledger(d, '2026-10');
    expect(ledger.envMonth('vac', '2026-10')).toMatchObject({ spent: -40, balance: 40 });
    expect(blockTotals(d.months['2026-10'].lines, 'rev').actual).toBe(0);
    const summary = sessionSummary(p2, batch, new Set(batch.importedIds));
    expect(summary).toMatchObject({ envelopeEntries: 1, envelopeEntriesTotal: 40, revenues: 0 });
  });

  it('fichier d’un compte hors budget (Swile) : source = libellé par défaut, enveloppe créditée, Swile et budget intacts (décision B1)', () => {
    const d = importBudget();
    const p = preview(d, [credit('REMB TEMU', 40.58, SWILE_PAIR)]);
    const p2 = { ...p, lines: p.lines.map(l => asEntry(d, l)) };
    validateImport(d, p2, newId);
    expect(d.transactions[0].source).toBe('REMB TEMU');
    expect(bal(d, SWILE)).toBe(0);
    expect(bal(d, 'acc-env-vac')).toBe(40.58);
    expect(monthSummary(d, new Ledger(d, '2026-10'), '2026-10').income).toBe(2400);
  });

  it('CA9 / RG9 : au réimport, la ligne est « Doublon » quelle que soit la nature proposée', () => {
    const d = importBudget();
    const rows = [credit('REMB PNEU', 40)];
    const p = preview(d, rows);
    validateImport(d, { ...p, lines: p.lines.map(l => asEntry(d, l)) }, newId);
    const again = preview(d, rows).lines[0];
    expect(again.duplicate).toBe(true);
    for (const nature of ['revenu', 'envin', 'recu'] as const) expect(changeNature(d, again, nature).duplicate).toBe(true);
    const batch = validateImport(d, { ...preview(d, rows), lines: preview(d, rows).lines.map(l => asEntry(d, l)) }, newId);
    expect(batch.importedIds).toEqual([]);
    expect(d.transactions).toHaveLength(1);
  });

  it('RG9 : une entrée à la main du même jour et du même montant est signalée « semblable »', () => {
    const d = importBudget();
    addTransaction(d, { id: 'h', month: '2026-10', day: 12, label: 'Rembours.', amount: 40, type: 'envin', target: 'vac', bankDate: '2026-10-12' });
    expect(preview(d, [credit('REMB PNEU', 40, ENV_PAIR)]).lines[0].similarManual).toBe(true);
  });

  it('l’entrée n’est jamais mémorisée en règle', () => {
    const d = importBudget();
    const p = preview(d, [credit('REMB PNEU', 40)]);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...asEntry(d, l), remember: 'remb pneu' })) }, newId);
    expect(d.importRules ?? []).toEqual([]);
  });

  it('une dépense d’un compte hors budget sur une enveloppe ne change pas le budget ; le CSV en revenu garde son comportement', () => {
    const d = importBudget();
    const p = preview(d, [credit('SALAIRE', 2400)]);
    const rev = { ...changeNature(d, p.lines[0], 'revenu'), target: { kind: 'line' as const, key: 'salaire' }, checked: true, month: '2026-10' };
    const batch = validateImport(d, { ...p, lines: [rev] }, newId);
    expect(batch).toMatchObject({ revenues: 1, envelopeEntries: 0 });
    expect(d.transactions[0].type).toBe('rev');
  });

  it('le compte Espèces ne peut pas être une enveloppe cible', () => {
    const d = importBudget();
    const l = changeNature(d, preview(d, [credit('X', 5)]).lines[0], 'envin');
    expect(lineProblem(d, { ...l, target: { kind: 'env', id: CASH_ACCOUNT_ID } })).toBe('À rattacher');
  });
});
