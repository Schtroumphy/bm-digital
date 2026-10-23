import { describe, expect, it } from 'vitest';
import { filterCounts, filterLines, emptyFilters, lineStates, setChecked } from './importFilters';
import { accountProgress, changeNature, hasPendingCorrections, importableIds, prepareImport, previewCounts, refreshPreview, saveSkipChoices, sessionSummary, validateImport, type ImportPreview, type PreviewLine } from './statementImport';
import { MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { emptyData } from '../domain/empty';
import { accountPairKey, type StatementReading, type StatementRow } from '../domain/statement';
import type { BudgetData, Line } from '../domain/types';

const M = '2026-10';
const SWILE = 'acc-swile';
const MAIN_PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
const SWILE_PAIR = ['Compte Swile (x9999)', 'Autre Banque'] as const;
const NEW_PAIR = ['Compte Neuf (x5555)', 'Banque Test'] as const;
const keyOf = (p: readonly [string, string]) => accountPairKey(p[0], p[1]);
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;
const varLine = (key: string): Line => ({ key, block: 'var', section: '', name: key, budget: 100, actual: null });

function row(date: string, label: string, amount: number, extra: { pair?: readonly [string, string]; direction?: 'debit' | 'credit' } = {}): StatementRow {
  const pair = extra.pair ?? MAIN_PAIR;
  return { date, label, notes: '', category: '', accountName: pair[0], connectionName: pair[1], amount, direction: extra.direction ?? 'debit' };
}
const reading = (rows: StatementRow[]): StatementReading => ({ rows, errors: [] });

function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [...defaultBankAccounts('2026-09'), { id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2026-09', inBudget: true, archived: false }];
  d.months[M] = { initialized: true, lines: [varLine('courses')], alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: MAIN_PAIR[0], connectionName: MAIN_PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l2', accountName: SWILE_PAIR[0], connectionName: SWILE_PAIR[1], accountId: SWILE },
  ];
  return d;
}

const ROWS = [
  row('2026-10-02', 'ACHAT A', 5),
  row('2026-10-03', 'ACHAT B', 6),
  row('2026-10-04', 'RESTO SWILE', 12, { pair: SWILE_PAIR }),
  row('2026-10-05', 'CANTINE', 8, { pair: SWILE_PAIR }),
  row('2026-10-06', 'VIREMENT RECU SALAIRE', 900, { pair: SWILE_PAIR, direction: 'credit' }),
];
const toCourses = (l: PreviewLine): PreviewLine => ({ ...l, target: { kind: 'var', key: 'courses' } });
/** Every debit attached to « courses », ready to import. */
function ready(d: BudgetData, rows = ROWS): ImportPreview {
  const p = prepareImport(d, reading(rows));
  return { ...p, lines: p.lines.map(l => (l.row.direction === 'debit' ? toCourses(l) : l)) };
}
const byLabel = (p: ImportPreview, s: string) => p.lines.find(l => l.row.label === s)!;
const ids = (p: ImportPreview, ...labels: string[]) => new Set(labels.map(l => byLabel(p, l).id));

describe('import par lots (RG68, RG77)', () => {
  it('CA72: seules les lignes données sont écrites ; les autres restent cochées et intactes', () => {
    const d = budget();
    const p = ready(d);
    const batch = validateImport(d, p, newId, { ids: ids(p, 'RESTO SWILE', 'CANTINE') });
    expect(batch.expenses).toBe(2);
    expect(d.transactions.map(t => t.label)).toEqual(['RESTO SWILE', 'CANTINE']);
    expect(batch.importedIds).toEqual([byLabel(p, 'RESTO SWILE').id, byLabel(p, 'CANTINE').id].sort());
    expect(byLabel(p, 'ACHAT A').checked).toBe(true);
    expect(importableIds(d, p, { done: new Set(batch.importedIds) }).size).toBe(2);
  });

  it('CA74: sans sélection, toutes les lignes cochées et complètes sont écrites, les entrées jamais', () => {
    const d = budget();
    const p = ready(d);
    expect(validateImport(d, p, newId).expenses).toBe(4);
    expect(d.transactions).toHaveLength(4);
  });

  it('CA82: un lot rejoué n’écrit rien de plus (déjà importé dans la session, ou clé déjà présente)', () => {
    const d = budget();
    const p = ready(d);
    const first = validateImport(d, p, newId, { ids: ids(p, 'ACHAT A') });
    const done = new Set(first.importedIds);
    expect(validateImport(d, p, newId, { ids: ids(p, 'ACHAT A'), done }).expenses).toBe(0);
    // Même sans connaître la session : la clé (compte, empreinte, rang) existe déjà.
    expect(validateImport(d, p, newId, { ids: ids(p, 'ACHAT A') }).expenses).toBe(0);
    expect(d.transactions).toHaveLength(1);
  });

  it('CA90: une ligne déjà importée transmise cochée n’est jamais écrite (plus de doublon forcé)', () => {
    const d = budget();
    const first = ready(d, [row('2026-10-02', 'ACHAT A', 5)]);
    validateImport(d, first, newId);
    const again = ready(d, [row('2026-10-02', 'ACHAT A', 5)]);
    const forced = { ...again, lines: again.lines.map(l => ({ ...l, checked: true })) };
    expect(forced.lines.every(l => l.duplicate && l.checked)).toBe(true);
    const b1 = validateImport(d, forced, newId);
    expect(b1).toMatchObject({ expenses: 0, importedIds: [], failedIds: [] });
    expect(d.transactions).toHaveLength(1);
  });

  it('CA83: une ligne dont le mois est clos n’est pas écrite ni marquée importée', () => {
    const d = budget();
    const p = ready(d);
    d.months[M].closed = true;
    const batch = validateImport(d, p, newId);
    expect(batch.importedIds).toEqual([]);
    expect(d.transactions).toEqual([]);
    expect(sessionSummary(p, batch, new Set(), new Set(batch.failedIds)).leftOut).toBe(5); // les 4 dépenses et l'entrée « Revenu » non importée
  });

  it('un compte marqué « traité » n’est pas importé ni compté « à compléter »', () => {
    const d = budget();
    const p = prepareImport(d, reading(ROWS));
    const marked = new Set([keyOf(SWILE_PAIR)]);
    const before = previewCounts(d, p);
    const after = previewCounts(d, p, { marked });
    expect(after.incomplete).toBe(before.incomplete - 3); // 2 dépenses + l'entrée « Revenu » non rattachée du compte
    const ready2 = { ...p, lines: p.lines.map(toCourses) };
    expect(validateImport(d, ready2, newId, { marked }).expenses).toBe(2);
    expect([...importableIds(d, ready2, { marked })].every(id => byLabel(ready2, 'ACHAT A').id === id || byLabel(ready2, 'ACHAT B').id === id)).toBe(true);
  });
});

describe('correspondances et règles du lot (RG74)', () => {
  const rows = [row('2026-10-02', 'ACHAT A', 5), row('2026-10-03', 'NEUF 1', 7, { pair: NEW_PAIR })];
  function withChoice() {
    const d = budget();
    let p = prepareImport(d, reading(rows), { [keyOf(NEW_PAIR)]: SWILE });
    p = { ...p, lines: p.lines.map(toCourses) };
    return { d, p };
  }

  it('CA80: la correspondance d’un couple sans ligne importée n’est pas enregistrée', () => {
    const { d, p } = withChoice();
    validateImport(d, p, newId, { ids: ids(p, 'ACHAT A') });
    expect(d.importAccountLinks!.some(l => l.accountName === NEW_PAIR[0])).toBe(false);
  });

  it('CA80: avec une ligne de ce couple importée, la correspondance l’est', () => {
    const { d, p } = withChoice();
    validateImport(d, p, newId, { ids: ids(p, 'NEUF 1') });
    expect(d.importAccountLinks!.find(l => l.accountName === NEW_PAIR[0])).toMatchObject({ accountId: SWILE });
  });

  it('CA80a: un choix « Ne pas importer » n’est mémorisé qu’avec un premier lot, et ne compte plus comme correction en attente', () => {
    const d = budget();
    const r = reading(rows);
    let p = prepareImport(d, r, { [keyOf(NEW_PAIR)]: null });
    p = { ...p, lines: p.lines.map(toCourses) };
    expect(p.lines.map(l => l.row.label)).toEqual(['ACHAT A']);
    // Aucun lot : rien n'est enregistré, et fermer perdrait ce choix.
    validateImport(d, p, newId, { ids: new Set() });
    expect(d.importAccountLinks!.some(l => l.accountName === NEW_PAIR[0])).toBe(false);
    expect(hasPendingCorrections(d, r, p)).toBe(true);
    // Premier lot : la correspondance sans compte est écrite, même si aucune de ses lignes n'est importée.
    const batch = validateImport(d, p, newId);
    expect(d.importAccountLinks!.find(l => l.accountName === NEW_PAIR[0])).toMatchObject({ accountId: null });
    const next = refreshPreview(d, r, p);
    expect(next.choices).toEqual({});
    expect(hasPendingCorrections(d, r, next, new Set(batch.importedIds))).toBe(false);
  });

  it('CA80a: « Terminer l’import » mémorise aussi les choix « Ne pas importer » faits depuis le dernier lot', () => {
    const d = budget();
    const p = prepareImport(d, reading(rows), { [keyOf(NEW_PAIR)]: null });
    saveSkipChoices(d, p, newId);
    expect(d.importAccountLinks!.find(l => l.accountName === NEW_PAIR[0])).toMatchObject({ accountId: null });
    // Un choix avec un compte n'est pas écrit par cette fonction.
    const q = prepareImport(budget(), reading(rows), { [keyOf(NEW_PAIR)]: SWILE });
    const d2 = budget();
    saveSkipChoices(d2, q, newId);
    expect(d2.importAccountLinks!.some(l => l.accountName === NEW_PAIR[0])).toBe(false);
  });

  it('CA81: seules les règles « Mémoriser » des lignes importées sont écrites', () => {
    const d = budget();
    const p0 = ready(d);
    const p = { ...p0, lines: p0.lines.map(l => (l.row.direction === 'debit' ? { ...l, remember: l.row.label.toLowerCase() } : l)) };
    validateImport(d, p, newId, { ids: ids(p, 'ACHAT A') });
    expect(d.importRules?.map(r => r.pattern)).toEqual(['achat a']);
  });
});

describe('état « Importée » et filtres (RG70)', () => {
  it('CA76: une ligne importée n’a que l’état « Importée », est masquée par défaut et filtrable', () => {
    const d = budget();
    const p = ready(d);
    const batch = validateImport(d, p, newId, { ids: ids(p, 'ACHAT A', 'ACHAT B') });
    const done = new Set(batch.importedIds);
    expect(lineStates(d, byLabel(p, 'ACHAT A'), done)).toEqual(['importee']);
    expect(filterLines(d, p.lines, emptyFilters(), new Set(), done).map(l => l.row.label)).toEqual(['RESTO SWILE', 'CANTINE', 'VIREMENT RECU SALAIRE']);
    expect(filterLines(d, p.lines, { ...emptyFilters(), states: ['importee'] }, new Set(), done).map(l => l.row.label)).toEqual(['ACHAT A', 'ACHAT B']);
    expect(filterCounts(d, p.lines, done).states.importee).toBe(2);
  });

  it('une ligne importée n’est ni cochable ni modifiée par « Tout cocher »', () => {
    const d = budget();
    const p = ready(d);
    const done = new Set([byLabel(p, 'ACHAT A').id]);
    const unchecked = setChecked(p.lines, new Set(p.lines.map(l => l.id)), false, done);
    expect(byLabel({ ...p, lines: unchecked }, 'ACHAT A').checked).toBe(true);
    expect(byLabel({ ...p, lines: unchecked }, 'ACHAT B').checked).toBe(false);
  });
});

describe('compte traité (RG71, RG73)', () => {
  it('CA77 / RG19a(4): traité quand ses dépenses et ses entrées « Revenu » sont importées ou déjà importées ; un « Virement reçu » n’y compte pas', () => {
    const d = budget();
    const p = ready(d);
    const swile = keyOf(SWILE_PAIR);
    expect(accountProgress(p, swile)).toMatchObject({ remaining: 3, treated: false });
    const batch = validateImport(d, p, newId, { ids: ids(p, 'RESTO SWILE', 'CANTINE') });
    const done = new Set(batch.importedIds);
    // L'entrée « Revenu » non importée reste une ligne restante.
    expect(accountProgress(p, swile, done)).toMatchObject({ imported: 2, remaining: 1, treated: false });
    // Requalifiée « Virement reçu » à la main, elle n'en fait plus partie.
    const recu = { ...p, lines: p.lines.map(l => (l.row.direction === 'credit' ? changeNature(d, l, 'recu') : l)) };
    expect(accountProgress(recu, swile, done)).toMatchObject({ imported: 2, remaining: 0, treated: true });
  });

  it('CA78: une ligne décochée volontairement laisse le compte à traiter avec « 1 ligne restante »', () => {
    const d = budget();
    const p = ready(d);
    const unchecked = { ...p, lines: p.lines.map(l => (l.row.label === 'CANTINE' ? { ...l, checked: false } : l)) };
    const batch = validateImport(d, unchecked, newId, { ids: ids(unchecked, 'RESTO SWILE') });
    expect(accountProgress(unchecked, keyOf(SWILE_PAIR), new Set(batch.importedIds))).toMatchObject({ remaining: 2, treated: false }); // CANTINE décochée + l'entrée « Revenu »
  });

  it('CA79: rouvert avec le même fichier, un compte entièrement importé est traité (doublons)', () => {
    const d = budget();
    validateImport(d, ready(d), newId);
    const again = prepareImport(d, reading(ROWS));
    expect(again.lines.filter(l => l.row.direction === 'debit').every(l => l.duplicate && !l.checked)).toBe(true);
    expect(accountProgress(again, keyOf(MAIN_PAIR))).toMatchObject({ alreadyImported: 2, remaining: 0, treated: true });
    // L'entrée « Revenu » de Swile n'est pas importée : le compte reste à traiter (RG19a(4)).
    expect(accountProgress(again, keyOf(SWILE_PAIR))).toMatchObject({ alreadyImported: 2, remaining: 1, treated: false });
  });

  it('un couple sans ligne de dépense n’est pas « traité »', () => {
    const d = budget();
    const p = prepareImport(d, reading([row('2026-10-06', 'SALAIRE', 900, { direction: 'credit' })]));
    expect(accountProgress(p, keyOf(MAIN_PAIR)).treated).toBe(false);
  });
});

describe('cumul de la session et rafraîchissement (RG75, RG80)', () => {
  it('CA84: deux lots se cumulent et chaque ligne n’est comptée qu’une fois', () => {
    const d = budget();
    let p = ready(d);
    const b1 = validateImport(d, p, newId, { ids: ids(p, 'ACHAT A', 'ACHAT B') });
    let done = new Set(b1.importedIds);
    const totals1 = { expenses: b1.expenses, revenues: 0, withdrawals: b1.withdrawals, internalTransfers: b1.internalTransfers };
    p = refreshPreview(d, reading(ROWS), p);
    p = { ...p, lines: p.lines.map(l => (l.row.direction === 'debit' && !done.has(l.id) ? toCourses(l) : l)) };
    const b2 = validateImport(d, p, newId, { ids: ids(p, 'RESTO SWILE'), done });
    done = new Set([...done, ...b2.importedIds]);
    const totals = { expenses: totals1.expenses + b2.expenses, revenues: 0, withdrawals: 0, internalTransfers: 0 };
    expect(totals.expenses).toBe(3);
    const sum = sessionSummary(p, totals, done);
    expect(sum).toMatchObject({ expenses: 3, incomes: 0, leftOut: 2, outsideBalances: 0, duplicatesSkipped: 0, errors: 0 }) // CANTINE et l'entrée « Revenu » restent à part;
    expect(d.transactions).toHaveLength(3);
  });

  it('CA75: après l’import, l’aperçu refait garde les corrections des lignes non importées', () => {
    const d = budget();
    let p = ready(d);
    p = { ...p, lines: p.lines.map(l => (l.row.label === 'CANTINE' ? { ...l, checked: false, remember: 'cantine' } : l)) };
    validateImport(d, p, newId, { ids: ids(p, 'ACHAT A') });
    const next = refreshPreview(d, reading(ROWS), p);
    expect(byLabel(next, 'CANTINE')).toMatchObject({ checked: false, remember: 'cantine', target: { kind: 'var', key: 'courses' } });
    expect(byLabel(next, 'ACHAT A').duplicate).toBe(true);
  });

  it('les couples enregistrés ne reviennent pas dans la bannière après l’import', () => {
    const d = budget();
    const rows = [row('2026-10-03', 'NEUF 1', 7, { pair: NEW_PAIR })];
    let p = prepareImport(d, reading(rows), { [keyOf(NEW_PAIR)]: SWILE });
    p = { ...p, lines: p.lines.map(toCourses) };
    validateImport(d, p, newId);
    const next = refreshPreview(d, reading(rows), p);
    expect(next.pairs[0].known).toBe(true);
    expect(next.choices).toEqual({});
  });
});

describe('corrections en attente (RG79)', () => {
  it('aucune correction : rien à perdre ; une correction non importée est détectée', () => {
    const d = budget();
    const r = reading(ROWS);
    const p = prepareImport(d, r);
    expect(hasPendingCorrections(d, r, p)).toBe(false);
    const edited = { ...p, lines: p.lines.map(l => (l.row.label === 'ACHAT A' ? toCourses(l) : l)) };
    expect(hasPendingCorrections(d, r, edited)).toBe(true);
    // Une fois la ligne importée, plus rien n'est en attente.
    const batch = validateImport(d, edited, newId, { ids: ids(edited, 'ACHAT A') });
    const next = refreshPreview(d, r, edited);
    expect(hasPendingCorrections(d, r, next, new Set(batch.importedIds))).toBe(false);
  });

  it('un choix de bannière non enregistré compte comme correction', () => {
    const d = budget();
    const rows = [row('2026-10-03', 'NEUF 1', 7, { pair: NEW_PAIR })];
    const r = reading(rows);
    const p = prepareImport(d, r, { [keyOf(NEW_PAIR)]: SWILE });
    expect(hasPendingCorrections(d, r, p)).toBe(true);
  });
});

