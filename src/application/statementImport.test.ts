import { describe, expect, it } from 'vitest';
import { deleteAccountMovement, updateAccountMovement } from './accountMovements';
import { findImportAccountLink, linkableAccounts, linkedAccountOf, removeImportAccountLink, setImportAccountLink } from './accountLinks';
import { changeMonth, changeNature, choosePairAccount, importMonths, lineProblem, prepareImport, previewCounts, validateImport, type ImportPreview, type PairChoices, type PreviewLine } from './statementImport';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts, newEnvelopeAccount } from '../domain/bank';
import { bankMovements } from '../domain/bankMovements';
import { monthBalance } from '../domain/checkoff';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { accountPairKey, suggestedPattern, type StatementReading, type StatementRow } from '../domain/statement';
import type { BudgetData, Line } from '../domain/types';

const M = '2026-10';
const SWILE = 'acc-swile';
const SAV = 'acc-sav';
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;
const varLine = (key: string, extra: Partial<Line> = {}): Line => ({ key, block: 'var', section: '', name: key, budget: 100, actual: null, ...extra });

const MAIN_PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
const SWILE_PAIR = ['Compte Swile (x9999)', 'Autre Banque'] as const;
const SAV_PAIR = ['Livret A (x1234)', 'Banque Test'] as const;
const keyOf = (p: readonly [string, string]) => accountPairKey(p[0], p[1]);

/** A row as the reader would produce it (the reader itself is tested in linxoStatement.test.ts). */
function row(date: string, label: string, amount: number, extra: { notes?: string; category?: string; pair?: readonly [string, string]; direction?: 'debit' | 'credit' } = {}): StatementRow {
  const pair = extra.pair ?? MAIN_PAIR;
  return { date, label, notes: extra.notes ?? '', category: extra.category ?? '', accountName: pair[0], connectionName: pair[1], amount, direction: extra.direction ?? 'debit' };
}
const reading = (rows: StatementRow[]): StatementReading => ({ rows, errors: [] });
const SAMPLE = [
  row('2026-10-03', 'CARREFOUR MARKET', 54.2, { notes: 'PAIEMENT PAR CARTE X2222 CARREFOUR MARKET 03/10', category: 'Alimentation' }),
  row('2026-10-06', 'VIREMENT EMIS MR DUPONT', 188.58),
  row('2026-10-08', 'RETRAIT DAB', 40, { notes: 'RETRAIT AU DISTRIBUTEUR X2222 08/10' }),
  row('2026-10-09', 'REMBOURSEMENT', 12, { direction: 'credit' }),
  row('2026-10-01', 'SALAIRE', 1234.56, { direction: 'credit' }),
];

/** October 2026 open (firstMonth), September not created, an envelope with its own account, a second and a savings account, both pairs of the file matched. */
function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [
    ...defaultBankAccounts('2026-09'),
    { id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2026-09', inBudget: true, archived: false },
    { id: SAV, name: 'Livret A', hue: 20, isDefault: false, openingBalance: 0, openingMonth: '2026-09', inBudget: true, archived: false, kind: 'epargne' },
    newEnvelopeAccount('acc-env-vac', 'vac', 'Vacances', 200, 0, '2026-09'),
  ];
  d.envelopes = [{ id: 'vac', name: 'Vacances', hue: 200, cash: 0, accountId: 'acc-env-vac' }];
  d.months[M] = { initialized: true, lines: [varLine('courses'), varLine('frais')], alloc: {}, transfersDone: {} };
  d.months['2026-11'] = { initialized: true, lines: [varLine('courses')], alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: MAIN_PAIR[0], connectionName: MAIN_PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l2', accountName: SWILE_PAIR[0], connectionName: SWILE_PAIR[1], accountId: SWILE },
  ];
  return d;
}

const prepare = (d: BudgetData, rows = SAMPLE, choices: PairChoices = {}) => prepareImport(d, reading(rows), choices);
const byLabel = (p: ImportPreview, s: string) => p.lines.find(l => l.row.label.includes(s))!;
const edit = (p: ImportPreview, id: string, fn: (l: PreviewLine) => PreviewLine): ImportPreview => ({ ...p, lines: p.lines.map(l => (l.id === id ? fn(l) : l)) });
const toCourses = (l: PreviewLine): PreviewLine => ({ ...l, target: { kind: 'var', key: 'courses' } });

describe('aperçu de l’import', () => {
  it('CA6: les crédits sont comptés ignorés et jamais proposés', () => {
    const p = prepare(budget());
    expect(p.ignoredCredits).toBe(2);
    expect(p.lines).toHaveLength(3);
    expect(p.lines.every(l => l.row.direction === 'debit')).toBe(true);
  });

  it('CA32: sans mot-clé reconnu, un débit est une dépense à rattacher ; « retrait » donne Retrait vers Espèces ; « virement emis » À qualifier', () => {
    const d = budget();
    const p = prepare(d);
    expect(byLabel(p, 'CARREFOUR')).toMatchObject({ nature: 'depense', target: null, checked: true });
    expect(lineProblem(d, byLabel(p, 'CARREFOUR'))).toBe('À rattacher');
    expect(byLabel(p, 'RETRAIT')).toMatchObject({ nature: 'retrait', target: { kind: 'account', id: CASH_ACCOUNT_ID }, checked: true });
    expect(lineProblem(d, byLabel(p, 'RETRAIT'))).toBeNull();
    expect(byLabel(p, 'VIREMENT')).toMatchObject({ nature: 'a_qualifier', checked: false, transferHint: true });
    // Mots entiers seulement.
    const other = prepare(d, [row('2026-10-02', 'RETRAITE COMPLEMENTAIRE', 10)]);
    expect(other.lines[0].nature).toBe('depense');
  });

  it('CA7: un virement émis n’est importable qu’une fois interne (avec destination) ou externe (avec cible)', () => {
    const d = budget();
    const l = byLabel(prepare(d), 'VIREMENT');
    expect(lineProblem(d, l)).toBe('À qualifier');
    const interne = changeNature(d, l, 'interne');
    expect(lineProblem(d, interne)).toBe('Choisir une destination');
    expect(lineProblem(d, { ...interne, target: { kind: 'account', id: SWILE } })).toBeNull();
    const externe = changeNature(d, l, 'externe');
    expect(lineProblem(d, externe)).toBe('À rattacher');
    expect(lineProblem(d, toCourses(externe))).toBeNull();
  });

  it('un retrait est modifiable vers une enveloppe, un autre compte (interne) ou une dépense', () => {
    const d = budget();
    const l = byLabel(prepare(d), 'RETRAIT');
    expect(lineProblem(d, { ...l, target: { kind: 'account', id: 'acc-env-vac' } })).toBeNull();
    expect(lineProblem(d, { ...l, target: { kind: 'account', id: SWILE } })).toBe('Choisir une destination');
    expect(changeNature(d, { ...l, target: { kind: 'account', id: SWILE } }, 'interne').target).toEqual({ kind: 'account', id: SWILE });
    expect(changeNature(d, l, 'depense').target).toBeNull();
  });

  it('CA13: un mois clos, antérieur au premier mois ou non créé est signalé et non importable', () => {
    const d = budget();
    const l = toCourses(byLabel(prepare(d), 'CARREFOUR'));
    expect(importMonths(d)).toEqual(['2026-10', '2026-11']);
    for (const month of ['2026-09', '2026-12']) expect(lineProblem(d, { ...l, month })).toBe('Choisir un mois ouvert');
    d.months[M].closed = true;
    expect(lineProblem(d, l)).toBe('Choisir un mois ouvert');
    expect(importMonths(d)).toEqual(['2026-11']);
  });

  it('CA12: la ligne du dernier jour du mois précédent garde son mois, rattachable au mois courant avec le jour de la date', () => {
    const d = budget();
    let p = prepare(d, [row('2026-09-30', 'CINEMA', 9)]);
    const l = p.lines[0];
    expect(l.month).toBe('2026-09');
    expect(lineProblem(d, toCourses(l))).toBe('Choisir un mois ouvert');
    p = edit(p, l.id, x => changeMonth(d, toCourses(x), '2026-10'));
    validateImport(d, p, newId);
    expect(d.transactions[0]).toMatchObject({ month: '2026-10', day: 30, target: 'courses' });
  });
});

describe('correspondance des comptes du fichier (RG32)', () => {
  const noLinks = () => {
    const d = budget();
    d.importAccountLinks = [];
    return d;
  };
  const twoPairs = [row('2026-10-03', 'ACHAT A', 5), row('2026-10-03', 'ACHAT B', 6, { pair: SWILE_PAIR })];

  it('CA29: deux couples inconnus : lignes décochées, « Compte à rattacher », non importables ; après choix, les correspondances sont enregistrées et un second fichier ne les redemande plus', () => {
    const d = noLinks();
    let p = prepare(d, twoPairs);
    expect(previewCounts(d, p)).toMatchObject({ pairsToLink: 2, toImport: 0 });
    expect(p.pairs.every(x => !x.known)).toBe(true);
    for (const l of p.lines) {
      expect(l).toMatchObject({ accountId: null, checked: false });
      expect(lineProblem(d, l)).toBe('Compte à rattacher');
    }
    p = choosePairAccount(d, reading(twoPairs), p, keyOf(MAIN_PAIR), MAIN_ACCOUNT_ID);
    p = choosePairAccount(d, reading(twoPairs), p, keyOf(SWILE_PAIR), SWILE);
    expect(previewCounts(d, p).pairsToLink).toBe(0);
    // Rien n'est écrit avant la validation (RG25).
    expect(d.importAccountLinks).toEqual([]);
    p = { ...p, lines: p.lines.map(l => ({ ...toCourses(l), checked: true })) };
    validateImport(d, p, newId);
    expect(d.importAccountLinks).toHaveLength(2);
    const second = prepare(d, twoPairs);
    expect(second.pairs.every(x => x.known)).toBe(true);
    expect(second.lines.map(l => l.accountId)).toEqual([MAIN_ACCOUNT_ID, SWILE]);
  });

  it('CA29d: un couple sans correspondance n’est pas écrit, ni compté, et aucun compte par défaut n’est appliqué', () => {
    const d = noLinks();
    let p = prepare(d, twoPairs);
    p = { ...p, lines: p.lines.map(l => ({ ...toCourses(l), checked: true })) };
    expect(previewCounts(d, p).toImport).toBe(0);
    const s = validateImport(d, p, newId);
    expect(s.expenses).toBe(0);
    expect(d.transactions).toEqual([]);
    expect(s.leftOut).toBe(2);
  });

  it('CA29a: même nom de compte, connexions différentes : deux correspondances distinctes', () => {
    const d = budget();
    d.importAccountLinks = [];
    const newId2 = (p: string) => `${p}${++seq}`;
    setImportAccountLink(d, 'Compte (x1)', 'Banque A', MAIN_ACCOUNT_ID, newId2);
    setImportAccountLink(d, 'Compte (x1)', 'Banque B', SWILE, newId2);
    expect(d.importAccountLinks).toHaveLength(2);
    expect(linkedAccountOf(d, 'Compte (x1)', 'Banque A')).toBe(MAIN_ACCOUNT_ID);
    expect(linkedAccountOf(d, ' Compte (x1) ', 'Banque B')).toBe(SWILE);
  });

  it('CA29b: modifier, supprimer ou passer à « Ne pas importer » ne change pas les transactions déjà importées ; le couple est redemandé après suppression', () => {
    const d = budget();
    let p = prepare(d);
    p = edit(p, byLabel(p, 'CARREFOUR').id, toCourses);
    validateImport(d, p, newId);
    const before = structuredClone(d.transactions);
    setImportAccountLink(d, MAIN_PAIR[0], MAIN_PAIR[1], SWILE, newId);
    setImportAccountLink(d, MAIN_PAIR[0], MAIN_PAIR[1], null, newId);
    expect(d.transactions).toEqual(before);
    removeImportAccountLink(d, findImportAccountLink(d, MAIN_PAIR[0], MAIN_PAIR[1])!.id);
    expect(d.transactions).toEqual(before);
    const again = prepare(d);
    expect(again.pairs.find(x => x.key === keyOf(MAIN_PAIR))!.known).toBe(false);
  });

  it('un compte archivé ou inconnu rend la correspondance « à rattacher »', () => {
    const d = budget();
    d.accounts.find(a => a.id === SWILE)!.archived = true;
    expect(linkedAccountOf(d, SWILE_PAIR[0], SWILE_PAIR[1])).toBeUndefined();
    expect(setImportAccountLink(d, 'X', 'Y', 'acc-fantome', newId)).toBe(false);
    expect(setImportAccountLink(d, 'X', 'Y', 'acc-env-vac', newId)).toBe(true);
    d.accounts.find(a => a.id === 'acc-env-vac')!.archived = true;
    expect(setImportAccountLink(d, 'X2', 'Y', 'acc-env-vac', newId)).toBe(false);
    expect(linkableAccounts(d).map(a => a.id)).not.toContain('acc-env-vac');
  });

  it('CA30: un couple « Ne pas importer » n’apparaît pas dans l’aperçu et est compté à part', () => {
    const d = budget();
    d.importAccountLinks![1].accountId = null;
    const p = prepare(d, twoPairs);
    expect(p.lines.map(l => l.row.label)).toEqual(['ACHAT A']);
    expect(p.skipped).toBe(1);
    const s = validateImport(d, edit(p, '0', toCourses), newId);
    expect(s.accountsSkipped).toBe(1);
  });

  it('CA29c: chaque transaction porte le compte résolu de sa ligne ; une dépense var prend le compte de sa box, sinon ce compte', () => {
    const d = budget();
    d.months[M].lines[1] = varLine('frais', { accountId: SAV });
    let p = prepare(d, [row('2026-10-03', 'ACHAT A', 5), row('2026-10-03', 'ACHAT B', 6, { pair: SWILE_PAIR }), row('2026-10-04', 'ACHAT C', 7, { pair: SWILE_PAIR })]);
    p = { ...p, lines: p.lines.map(l => (l.row.label === 'ACHAT C' ? { ...l, target: { kind: 'var', key: 'frais' } as const } : toCourses(l))) };
    validateImport(d, p, newId);
    expect(d.transactions.map(t => [t.importAccountId, t.accountId])).toEqual([[MAIN_ACCOUNT_ID, MAIN_ACCOUNT_ID], [SWILE, SWILE], [SWILE, SAV]]);
  });

  it('CA31: deux achats identiques le même jour sur chacun de deux comptes : quatre transactions, puis quatre doublons', () => {
    const d = budget();
    const rows = [
      row('2026-10-03', 'BOULANGERIE', 3.4), row('2026-10-03', 'BOULANGERIE', 3.4),
      row('2026-10-03', 'BOULANGERIE', 3.4, { pair: SWILE_PAIR }), row('2026-10-03', 'BOULANGERIE', 3.4, { pair: SWILE_PAIR }),
    ];
    let p = prepare(d, rows);
    expect(p.lines.map(l => l.rank)).toEqual([1, 2, 1, 2]);
    p = { ...p, lines: p.lines.map(toCourses) };
    validateImport(d, p, newId);
    expect(d.transactions).toHaveLength(4);
    expect(prepare(d, rows).lines.map(l => l.duplicate)).toEqual([true, true, true, true]);
  });

  it('deux pairs rattachés au même compte partagent leurs rangs', () => {
    const d = budget();
    d.importAccountLinks![1].accountId = MAIN_ACCOUNT_ID;
    const p = prepare(d, [row('2026-10-03', 'X', 1), row('2026-10-03', 'X', 1, { pair: SWILE_PAIR })]);
    expect(p.lines.map(l => l.rank)).toEqual([1, 2]);
  });

  it('CA33b: un compte d’épargne rattaché propose ses débits avec une nature à choisir ; « Ne pas importer » les écarte', () => {
    const d = budget();
    d.importAccountLinks!.push({ id: 'l3', accountName: SAV_PAIR[0], connectionName: SAV_PAIR[1], accountId: SAV });
    const rows = [row('2026-10-05', 'RETRAIT EPARGNE', 100, { pair: SAV_PAIR }), row('2026-10-05', 'FRAIS', 2, { pair: SAV_PAIR })];
    const p = prepare(d, rows);
    expect(p.lines.map(l => l.accountId)).toEqual([SAV, SAV]);
    expect(lineProblem(d, p.lines[1])).toBe('À rattacher');
    expect(changeNature(d, p.lines[1], 'interne').nature).toBe('interne');
    d.importAccountLinks![2].accountId = null;
    expect(prepare(d, rows)).toMatchObject({ lines: [], skipped: 2 });
  });
});

describe('compte d’une enveloppe rattaché à un compte du fichier', () => {
  const ENV_PAIR = ['Compte Vacances (x0001)', 'Banque Test'] as const;
  function withEnvelopeLink() {
    const d = budget();
    d.importAccountLinks!.push({ id: 'l9', accountName: ENV_PAIR[0], connectionName: ENV_PAIR[1], accountId: 'acc-env-vac' });
    return d;
  }

  it('les comptes actifs de tous types sont proposés, les archivés non', () => {
    const d = budget();
    expect(linkableAccounts(d).map(a => a.id)).toEqual(expect.arrayContaining([MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID, SWILE, SAV, 'acc-env-vac']));
    d.accounts.find(a => a.id === SAV)!.archived = true;
    expect(linkableAccounts(d).map(a => a.id)).not.toContain(SAV);
  });

  it('une dépense du compte d’une enveloppe est proposée sur cette enveloppe et suit son compte ; la déduplication se fait sur ce compte', () => {
    const d = withEnvelopeLink();
    const rows = [row('2026-10-12', 'RESTO VACANCES', 30, { pair: ENV_PAIR })];
    let p = prepare(d, rows);
    expect(p.lines[0]).toMatchObject({ accountId: 'acc-env-vac', nature: 'depense', target: { kind: 'env', id: 'vac' }, checked: true });
    expect(lineProblem(d, p.lines[0])).toBeNull();
    validateImport(d, p, newId);
    expect(d.transactions[0]).toMatchObject({ type: 'env', target: 'vac', accountId: 'acc-env-vac', importAccountId: 'acc-env-vac' });
    expect(new Ledger(d, M).envMonth('vac', M)).toMatchObject({ spent: 30, balance: -30 });
    p = prepare(d, rows);
    expect(p.lines[0].duplicate).toBe(true);
    // Les autres comptes ne voient pas ce doublon.
    expect(prepare(d, [row('2026-10-12', 'RESTO VACANCES', 30)]).lines[0].duplicate).toBe(false);
  });

  it('une ligne variable ou une autre enveloppe n’est pas une cible valide sur le compte d’une enveloppe', () => {
    const d = withEnvelopeLink();
    d.envelopes.push({ id: 'aut', name: 'Autre', hue: 1, cash: 0, accountId: 'acc-env-aut' });
    d.accounts.push(newEnvelopeAccount('acc-env-aut', 'aut', 'Autre', 1, 0, '2026-09'));
    const l = prepare(d, [row('2026-10-12', 'X', 5, { pair: ENV_PAIR })]).lines[0];
    expect(lineProblem(d, toCourses(l))).toBe('À rattacher');
    expect(lineProblem(d, { ...l, target: { kind: 'env', id: 'aut' } })).toBe('À rattacher');
    expect(changeNature(d, { ...l, nature: 'externe', target: null }, 'depense').target).toEqual({ kind: 'env', id: 'vac' });
  });

  it('un retrait ou un transfert interne depuis le compte d’une enveloppe : jamais source = destination', () => {
    const d = withEnvelopeLink();
    const l = prepare(d, [row('2026-10-12', 'RETRAIT DAB', 20, { pair: ENV_PAIR })]).lines[0];
    expect(l).toMatchObject({ nature: 'retrait', target: { kind: 'account', id: CASH_ACCOUNT_ID } });
    expect(lineProblem(d, { ...l, target: { kind: 'account', id: 'acc-env-vac' } })).toBe('Choisir une destination');
    const interne = changeNature(d, l, 'interne');
    expect(lineProblem(d, { ...interne, target: { kind: 'account', id: 'acc-env-vac' } })).toBe('Choisir une destination');
    validateImport(d, prepare(d, [row('2026-10-12', 'RETRAIT DAB', 20, { pair: ENV_PAIR })]), newId);
    const ledger = new Ledger(d, M);
    expect(ledger.bankMonth('acc-env-vac', M)!.balance).toBe(-20);
    expect(ledger.bankMonth(CASH_ACCOUNT_ID, M)!.balance).toBe(20);
  });
});

describe('validation de l’import', () => {
  function importAll(d: BudgetData, rows = SAMPLE) {
    let p = prepare(d, rows);
    p = edit(p, byLabel(p, 'CARREFOUR').id, toCourses);
    const summary = validateImport(d, p, newId);
    return { p, summary };
  }

  it('crée une dépense var et un retrait, ignore le virement à qualifier', () => {
    const d = budget();
    const { summary } = importAll(d);
    expect(summary).toEqual({ expenses: 1, withdrawals: 1, internalTransfers: 0, duplicatesSkipped: 0, creditsIgnored: 2, accountsSkipped: 0, leftOut: 1, errors: 0 });
    expect(d.transactions[0]).toMatchObject({ month: M, day: 3, label: 'CARREFOUR MARKET', amount: 54.2, type: 'var', target: 'courses', accountId: MAIN_ACCOUNT_ID, importAccountId: MAIN_ACCOUNT_ID, rank: 1, category: 'Alimentation' });
    expect(d.transactions[0].fingerprint).toContain('2026-10-03|54.20|carrefour market paiement par carte');
    expect(d.accountMovements).toHaveLength(1);
    expect(d.accountMovements![0]).not.toHaveProperty('category');
    expect(d.months[M].lines[0].actual).toBe(54.2);
  });

  it('CA20: l’aperçu et l’annulation ne modifient aucune donnée', () => {
    const d = budget();
    const before = structuredClone(d);
    prepare(d);
    expect(d).toEqual(before);
  });

  it('CA7b: un retrait baisse le principal et monte Espèces au jour de la ligne, dans les deux modes, sans toucher au réel des lignes', () => {
    for (const pointage of [false, true]) {
      const d = budget();
      if (pointage) d.settings.pointageStart = M;
      importAll(d);
      const main = bankMovements(d, MAIN_ACCOUNT_ID, M, pointage ? 'checks' : 'actual').filter(x => x.counterpart);
      const cash = bankMovements(d, CASH_ACCOUNT_ID, M, pointage ? 'checks' : 'actual');
      expect(main).toEqual([expect.objectContaining({ amount: -40, date: '2026-10-08' })]);
      expect(cash).toEqual([expect.objectContaining({ amount: 40, date: '2026-10-08' })]);
      expect(monthBalance(d, M, CASH_ACCOUNT_ID)!.end).toBe(40);
      if (!pointage) {
        const ledger = new Ledger(d, M);
        expect(ledger.bankMonth(CASH_ACCOUNT_ID, M)!.balance).toBe(40);
        expect(ledger.bankMonth(MAIN_ACCOUNT_ID, M)!.balance).toBe(-94.2);
      }
      expect(d.months[M].lines.map(l => l.actual)).toEqual([54.2, null]);
    }
  });

  it('retrait vers une enveloppe : seul le solde de son compte change (P7)', () => {
    const d = budget();
    let p = prepare(d);
    p = edit(p, byLabel(p, 'RETRAIT').id, l => ({ ...l, target: { kind: 'account', id: 'acc-env-vac' } }));
    validateImport(d, p, newId);
    const ledger = new Ledger(d, M);
    expect(ledger.bankMonth('acc-env-vac', M)!.balance).toBe(40);
    expect(ledger.envMonth('vac', M)).toMatchObject({ alloc: 0, balance: 40 });
    expect(d.months[M].alloc).toEqual({});
  });

  it('CA7c: un transfert interne vers un compte hors budget ne touche pas le principal', () => {
    const d = budget();
    d.accounts.find(a => a.id === SWILE)!.inBudget = false;
    let p = prepare(d);
    p = edit(p, byLabel(p, 'VIREMENT').id, l => ({ ...changeNature(d, l, 'interne'), target: { kind: 'account', id: SWILE }, checked: true }));
    validateImport(d, p, newId);
    expect(d.accountMovements!.filter(m => m.toAccountId === SWILE)).toHaveLength(1);
    expect(bankMovements(d, MAIN_ACCOUNT_ID, M, 'actual').filter(x => x.counterpart).map(x => x.amount)).toEqual([-40]);
    expect(bankMovements(d, SWILE, M, 'actual')).toEqual([expect.objectContaining({ amount: 188.58 })]);
  });

  it('CA7d: un transfert externe crée une dépense, pas de mouvement entre comptes', () => {
    const d = budget();
    let p = prepare(d);
    p = edit(p, byLabel(p, 'VIREMENT').id, l => ({ ...changeNature(d, l, 'externe'), target: { kind: 'var', key: 'frais' }, checked: true }));
    const s = validateImport(d, p, newId);
    expect(s.expenses).toBe(1);
    expect((d.accountMovements ?? []).every(m => m.amount !== 188.58)).toBe(true);
    expect(d.transactions[0]).toMatchObject({ amount: 188.58, target: 'frais', type: 'var' });
  });

  it('CA7f / RG36: les crédits restent ignorés, rien n’est crédité deux fois', () => {
    const d = budget();
    importAll(d);
    expect(prepare(d).ignoredCredits).toBe(2);
    expect(d.accountMovements!.every(m => m.toAccountId !== MAIN_ACCOUNT_ID)).toBe(true);
  });

  it('CA7e / CA8: le même fichier réimporté donne des doublons décochés, forçables au prochain rang libre', () => {
    const d = budget();
    importAll(d);
    let p = prepare(d);
    expect(p.lines.filter(l => l.duplicate).map(l => l.row.label)).toEqual(['CARREFOUR MARKET', 'RETRAIT DAB']);
    expect(p.lines.filter(l => l.duplicate).every(l => !l.checked)).toBe(true);
    expect(previewCounts(d, p).duplicates).toBe(2);
    p = edit(p, byLabel(p, 'CARREFOUR').id, toCourses);
    expect(validateImport(d, p, newId)).toMatchObject({ expenses: 0, duplicatesSkipped: 2 });
    expect(d.transactions).toHaveLength(1);
    p = edit(p, byLabel(p, 'CARREFOUR').id, l => ({ ...l, checked: true }));
    validateImport(d, p, newId);
    expect(d.transactions.map(t => t.rank)).toEqual([1, 2]);
  });

  it('CA9: deux achats identiques le même jour donnent deux transactions, et deux doublons au réimport', () => {
    const d = budget();
    const twice = [row('2026-10-03', 'BOULANGERIE', 3.4), row('2026-10-03', 'BOULANGERIE', 3.4)];
    let p = prepare(d, twice);
    expect(p.lines.map(l => l.rank)).toEqual([1, 2]);
    p = { ...p, lines: p.lines.map(toCourses) };
    validateImport(d, p, newId);
    expect(d.transactions).toHaveLength(2);
    expect(prepare(d, twice).lines.map(l => l.duplicate)).toEqual([true, true]);
  });

  it('CA10: un fichier qui chevauche le précédent ne crée que les nouvelles lignes', () => {
    const d = budget();
    const a = [row('2026-10-01', 'A', 1), row('2026-10-02', 'B', 2)];
    const b = [row('2026-10-02', 'B', 2), row('2026-10-03', 'C', 3)];
    const first = prepare(d, a);
    validateImport(d, { ...first, lines: first.lines.map(toCourses) }, newId);
    const second = prepare(d, b);
    expect(second.lines.map(l => l.duplicate)).toEqual([true, false]);
    validateImport(d, { ...second, lines: second.lines.map(toCourses) }, newId);
    expect(d.transactions.map(t => t.amount)).toEqual([1, 2, 3]);
  });

  it('CA33a: la catégorie n’est pas dans l’empreinte : une opération recatégorisée est un doublon', () => {
    const d = budget();
    const first = [row('2026-10-03', 'ACHAT', 5, { category: 'Restaurants' })];
    const p = prepare(d, first);
    validateImport(d, { ...p, lines: p.lines.map(toCourses) }, newId);
    const again = prepare(d, [row('2026-10-03', 'ACHAT', 5, { category: 'Remb. prêt conso' })]);
    expect(again.lines[0]).toMatchObject({ duplicate: true, similarImported: null });
  });

  it('CA33: même compte, jour et montant qu’une ligne déjà importée d’une autre empreinte : « semblable », « probable » si la catégorie est la même, sans décocher', () => {
    const d = budget();
    const p = prepare(d, [row('2026-10-03', 'ACHAT A', 5, { category: 'Restaurants' })]);
    validateImport(d, { ...p, lines: p.lines.map(toCourses) }, newId);
    const other = prepare(d, [row('2026-10-03', 'ACHAT AUTREMENT ECRIT', 5, { category: 'Loisirs' }), row('2026-10-03', 'ACHAT B', 5, { category: 'Restaurants' }), row('2026-10-03', 'ACHAT C', 5, { pair: SWILE_PAIR })]);
    expect(other.lines.map(l => l.similarImported)).toEqual(['semblable', 'probable', null]);
    expect(other.lines.map(l => l.checked)).toEqual([true, true, true]);
    expect(other.lines.map(l => l.duplicate)).toEqual([false, false, false]);
  });

  it('CA11: une saisie manuelle semblable est signalée sans être décochée', () => {
    const d = budget();
    d.transactions.push({ id: 'x', month: M, day: 3, label: 'à la main', amount: 54.2, type: 'var', target: 'courses', accountId: MAIN_ACCOUNT_ID });
    const l = byLabel(prepare(d), 'CARREFOUR');
    expect(l).toMatchObject({ similarManual: true, checked: true, duplicate: false });
  });

  it('CA19: vers une enveloppe, la transaction suit le compte de l’enveloppe ; vers une box à compte attribué, le compte de la box', () => {
    const d = budget();
    d.months[M].lines[1] = varLine('frais', { accountId: SWILE });
    let p = prepare(d);
    p = edit(p, byLabel(p, 'CARREFOUR').id, l => ({ ...l, target: { kind: 'env', id: 'vac' } }));
    p = edit(p, byLabel(p, 'RETRAIT').id, l => ({ ...changeNature(d, l, 'depense'), target: { kind: 'var', key: 'frais' } }));
    validateImport(d, p, newId);
    expect(d.transactions.find(t => t.type === 'env')).toMatchObject({ accountId: 'acc-env-vac', importAccountId: MAIN_ACCOUNT_ID });
    expect(d.transactions.find(t => t.type === 'var')).toMatchObject({ accountId: SWILE, importAccountId: MAIN_ACCOUNT_ID });
  });

  it('les corrections déjà faites sont gardées quand on rattache un autre compte', () => {
    const d = budget();
    d.importAccountLinks = [d.importAccountLinks![0]];
    const rows = [row('2026-10-03', 'ACHAT A', 5), row('2026-10-03', 'ACHAT B', 6, { pair: SWILE_PAIR })];
    let p = prepare(d, rows);
    p = edit(p, '0', l => ({ ...toCourses(l), checked: false }));
    p = choosePairAccount(d, reading(rows), p, keyOf(SWILE_PAIR), SWILE);
    expect(p.lines[0]).toMatchObject({ target: { kind: 'var', key: 'courses' }, checked: false });
    expect(p.lines[1].accountId).toBe(SWILE);
  });
});

describe('motif proposé pour une règle', () => {
  it('est le libellé, coupé avant la première date ou le premier numéro de carte, et reste modifiable', () => {
    expect(suggestedPattern({ label: 'CARREFOUR MARKET 28/03 CARTE', notes: '' })).toBe('CARREFOUR MARKET');
    expect(suggestedPattern({ label: 'BOULANGERIE DUPONT X2222', notes: '' })).toBe('BOULANGERIE DUPONT');
    expect(suggestedPattern({ label: 'CARREFOUR MARKET', notes: 'PAIEMENT X2222' })).toBe('CARREFOUR MARKET');
    expect(suggestedPattern({ label: '08/10 CARTE', notes: '' })).toBe('08/10 CARTE');
    expect(suggestedPattern({ label: '', notes: 'RETRAIT DAB 08/10' })).toBe('RETRAIT DAB');
  });
});

describe('règles mémorisées', () => {
  it('CA17: la règle est enregistrée à la validation, mise à jour si le motif existe, et s’applique à l’import suivant', () => {
    const d = budget();
    let p = prepare(d);
    const pay = byLabel(p, 'CARREFOUR');
    expect(pay.suggestedPattern).toBe('CARREFOUR MARKET');
    p = edit(p, pay.id, l => ({ ...toCourses(l), remember: 'Carrefour' }));
    validateImport(d, p, newId);
    expect(d.importRules).toEqual([expect.objectContaining({ pattern: 'carrefour', nature: 'depense', target: { kind: 'var', key: 'courses' } })]);
    expect(byLabel(prepare(d), 'CARREFOUR')).toMatchObject({ nature: 'depense', target: { kind: 'var', key: 'courses' } });
    const again = prepare(d, [row('2026-10-05', 'CARREFOUR CITY', 5)]);
    validateImport(d, { ...again, lines: again.lines.map(l => ({ ...l, target: { kind: 'var', key: 'frais' } as const, remember: 'carrefour' })) }, newId);
    expect(d.importRules).toHaveLength(1);
    expect(d.importRules![0].target).toEqual({ kind: 'var', key: 'frais' });
  });

  it('CA15: le motif le plus long l’emporte, et la règle l’emporte sur les mots-clés', () => {
    const d = budget();
    d.importRules = [
      { id: 'a', pattern: 'carrefour', nature: 'depense', target: { kind: 'var', key: 'courses' } },
      { id: 'b', pattern: 'carrefour market', nature: 'depense', target: { kind: 'var', key: 'frais' } },
      { id: 'c', pattern: 'retrait dab', nature: 'depense', target: { kind: 'var', key: 'frais' } },
    ];
    const p = prepare(d);
    expect(byLabel(p, 'CARREFOUR').target).toEqual({ kind: 'var', key: 'frais' });
    expect(byLabel(p, 'RETRAIT')).toMatchObject({ nature: 'depense', target: { kind: 'var', key: 'frais' } });
  });

  it('une règle peut proposer une autre nature (retrait vers une enveloppe, transfert interne)', () => {
    const d = budget();
    d.importRules = [
      { id: 'a', pattern: 'mr dupont', nature: 'interne', target: { kind: 'account', id: SWILE } },
      { id: 'b', pattern: 'retrait au distributeur', nature: 'retrait', target: { kind: 'account', id: 'acc-env-vac' } },
    ];
    const p = prepare(d);
    expect(byLabel(p, 'VIREMENT')).toMatchObject({ nature: 'interne', target: { kind: 'account', id: SWILE }, checked: true });
    expect(byLabel(p, 'RETRAIT').target).toEqual({ kind: 'account', id: 'acc-env-vac' });
  });

  it('CA18: une règle dont la cible a disparu n’est pas appliquée et ne provoque pas d’erreur', () => {
    const d = budget();
    d.importRules = [
      { id: 'a', pattern: 'carrefour', nature: 'depense', target: { kind: 'var', key: 'supprimee' } },
      { id: 'b', pattern: 'mr dupont', nature: 'interne', target: { kind: 'account', id: 'acc-fantome' } },
      { id: 'c', pattern: 'retrait', nature: 'retrait', target: { kind: 'account', id: SAV } },
    ];
    d.accounts.find(a => a.id === SAV)!.archived = true;
    const p = prepare(d);
    expect(byLabel(p, 'CARREFOUR')).toMatchObject({ nature: 'depense', target: null });
    expect(byLabel(p, 'VIREMENT').nature).toBe('a_qualifier');
    expect(byLabel(p, 'RETRAIT').target).toEqual({ kind: 'account', id: CASH_ACCOUNT_ID });
  });
});

describe('mouvements entre comptes après import', () => {
  function withMovement() {
    const d = budget();
    d.accountMovements = [{ id: 'm1', month: M, day: 8, label: 'Retrait', amount: 40, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID }];
    return d;
  }

  it('modifie le libellé et le montant, refuse un montant nul ou un libellé vide', () => {
    const d = withMovement();
    expect(updateAccountMovement(d, 'm1', { label: ' Retrait DAB ', amount: 45 })).toBe(true);
    expect(d.accountMovements![0]).toMatchObject({ label: 'Retrait DAB', amount: 45 });
    expect(updateAccountMovement(d, 'm1', { label: 'x', amount: 0 })).toBe(false);
    expect(updateAccountMovement(d, 'm1', { label: ' ', amount: 5 })).toBe(false);
  });

  it('supprime un mouvement, et refuse sur un mois verrouillé', () => {
    const d = withMovement();
    d.months[M].closed = true;
    expect(deleteAccountMovement(d, 'm1')).toBe(false);
    expect(updateAccountMovement(d, 'm1', { label: 'x', amount: 1 })).toBe(false);
    delete d.months[M].closed;
    expect(deleteAccountMovement(d, 'm1')).toBe(true);
    expect(d.accountMovements).toEqual([]);
    expect(deleteAccountMovement(d, 'm1')).toBe(false);
  });
});
