import { describe, expect, it } from 'vitest';
import { applyBulk, emptyFilters, filterCounts, filterLines, lineStates, matchesFilters, pruneFilters, setChecked, type PreviewFilters } from './importFilters';
import { changeNature, isIncome, prepareImport, previewCounts, validateImport, type PreviewLine } from './statementImport';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { emptyData } from '../domain/empty';
import type { StatementRow } from '../domain/statement';
import type { BudgetData, Line } from '../domain/types';

const M = '2026-10';
const SWILE = 'acc-swile';
const MAIN_PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
const SWILE_PAIR = ['Compte Swile (x9999)', 'Autre Banque'] as const;
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;
const varLine = (key: string): Line => ({ key, block: 'var', section: '', name: key, budget: 100, actual: null });

function row(date: string, label: string, amount: number, extra: { notes?: string; category?: string; pair?: readonly [string, string]; direction?: 'debit' | 'credit' } = {}): StatementRow {
  const pair = extra.pair ?? MAIN_PAIR;
  return { date, label, notes: extra.notes ?? '', category: extra.category ?? '', accountName: pair[0], connectionName: pair[1], amount, direction: extra.direction ?? 'debit' };
}

function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [...defaultBankAccounts('2026-09'), { id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2026-09', inBudget: true, archived: false }];
  d.months[M] = { initialized: true, lines: [varLine('courses'), varLine('frais')], alloc: {}, transfersDone: {} };
  d.months['2026-11'] = { initialized: true, lines: [varLine('courses')], alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: MAIN_PAIR[0], connectionName: MAIN_PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l2', accountName: SWILE_PAIR[0], connectionName: SWILE_PAIR[1], accountId: SWILE },
  ];
  return d;
}

const ROWS = [
  row('2026-10-02', 'PRLV EDF', 62, { notes: 'PRELEVEMENT EDF FACTURE', category: 'Energie' }),
  row('2026-10-03', 'CAFÉ DU COIN', 3.4, { category: 'Restaurants' }),
  row('2026-10-04', 'RETRAIT DAB', 40),
  row('2026-10-05', 'VIREMENT EMIS MR DUPONT', 188.58),
  row('2026-10-06', 'RESTO SWILE', 12, { pair: SWILE_PAIR, category: 'Restaurants' }),
  row('2026-09-30', 'COTISATION', 2.5),
  row('2026-10-07', 'VIREMENT EN VOTRE FAVEUR', 1600, { direction: 'credit', notes: 'CAGNOTTE' }),
];

function setup() {
  const d = budget();
  // The 2026-09 line is attached to September (not open): blocked on the month. One duplicate is simulated by importing once.
  const p = prepareImport(d, { rows: ROWS, errors: [] });
  return { d, lines: p.lines, p };
}
const byLabel = (lines: PreviewLine[], s: string) => lines.find(l => l.row.label.includes(s))!;
const f = (patch: Partial<PreviewFilters>): PreviewFilters => ({ ...emptyFilters(), ...patch });
const labels = (lines: PreviewLine[]) => lines.map(l => l.row.label);

describe('états d’une ligne', () => {
  it('donne un état par famille, et plusieurs si besoin', () => {
    const { d, lines } = setup();
    expect(lineStates(d, byLabel(lines, 'EDF'))).toEqual(['a_rattacher']);
    expect(lineStates(d, byLabel(lines, 'VIREMENT EMIS'))).toEqual(['a_qualifier', 'decochee']);
    expect(lineStates(d, byLabel(lines, 'RETRAIT'))).toEqual(['nouveau']);
    expect(lineStates(d, byLabel(lines, 'COTISATION'))).toEqual(['a_rattacher', 'date_hors_soldes']); // 30/09 : avant le premier mois du budget
    expect(lineStates(d, byLabel(lines, 'FAVEUR'))).toEqual(['entree', 'a_rattacher', 'decochee']);
  });

  it('Mois ≠ date quand le mois de rattachement diffère, Doublon pour un déjà importé', () => {
    const { d, lines } = setup();
    const moved = { ...byLabel(lines, 'RETRAIT'), month: '2026-11' };
    expect(lineStates(d, moved)).toEqual(['nouveau', 'mois_different']);
    expect(lineStates(d, { ...moved, duplicate: true, checked: false })).toEqual(['doublon', 'mois_different', 'decochee']);
  });
});

describe('filtrage', () => {
  it('CA51: un filtre d’état n’affiche que ces lignes', () => {
    const { d, lines } = setup();
    expect(labels(filterLines(d, lines, f({ states: ['a_rattacher'] })))).toEqual(['COTISATION', 'PRLV EDF', 'CAFÉ DU COIN', 'RESTO SWILE', 'VIREMENT EN VOTRE FAVEUR']);
  });

  it('CA52: ET entre familles, OU dans une famille', () => {
    const { d, lines } = setup();
    const main = `${MAIN_PAIR[0]}\u0001${MAIN_PAIR[1]}`;
    expect(labels(filterLines(d, lines, f({ accounts: [main], states: ['entree'] })))).toEqual(['VIREMENT EN VOTRE FAVEUR']);
    expect(labels(filterLines(d, lines, f({ states: ['a_qualifier', 'entree'] })))).toEqual(['VIREMENT EMIS MR DUPONT', 'VIREMENT EN VOTRE FAVEUR']);
    expect(filterLines(d, lines, f({ accounts: [main], natures: ['retrait'] })).map(l => l.row.label)).toEqual(['RETRAIT DAB']);
  });

  it('CA53: la recherche ignore casse et accents, cherche dans le libellé et les notes, tous les mots', () => {
    const { d, lines } = setup();
    expect(labels(filterLines(d, lines, f({ text: 'cafe' })))).toEqual(['CAFÉ DU COIN']);
    expect(labels(filterLines(d, lines, f({ text: 'edf prelev' })))).toEqual(['PRLV EDF']);
    expect(labels(filterLines(d, lines, f({ text: 'edf cafe' })))).toEqual([]);
    expect(labels(filterLines(d, lines, f({ text: 'cagnotte' })))).toEqual(['VIREMENT EN VOTRE FAVEUR']);
  });

  it('CA54: filtre de catégorie Linxo, et mois', () => {
    const { d, lines } = setup();
    expect(labels(filterLines(d, lines, f({ categories: ['Restaurants'] })))).toEqual(['CAFÉ DU COIN', 'RESTO SWILE']);
    expect(labels(filterLines(d, lines, f({ months: ['2026-09'] })))).toEqual(['COTISATION']);
  });

  it('CA66 / RG63: un filtre de nature ne renvoie aucune entrée d’argent', () => {
    const { d, lines } = setup();
    expect(filterLines(d, lines, f({ natures: ['depense', 'retrait', 'a_qualifier', 'interne', 'externe'] })).some(isIncome)).toBe(false);
  });

  it('RG55: une ligne modifiée reste affichée jusqu’au prochain changement de filtre', () => {
    const { d, lines } = setup();
    const filters = f({ states: ['a_rattacher'] });
    const edf = byLabel(lines, 'EDF');
    const fixed = { ...edf, target: { kind: 'var', key: 'courses' } as const };
    const after = lines.map(l => (l.id === edf.id ? fixed : l));
    expect(labels(filterLines(d, after, filters))).not.toContain('PRLV EDF');
    expect(labels(filterLines(d, after, filters, new Set([edf.id])))).toContain('PRLV EDF');
  });

  it('CA55: les compteurs portent sur toutes les lignes, quels que soient les filtres', () => {
    const { d, lines } = setup();
    const c = filterCounts(d, lines);
    expect(c.total).toBe(7);
    expect(c.states.a_rattacher).toBe(5);
    expect(c.states.entree).toBe(1);
    expect(c.states.decochee).toBe(2); // le virement émis et l'entrée « Revenu » non rattachée (RG18)
    expect(c.categories).toEqual({ Energie: 1, Restaurants: 2 });
    expect(c.months).toEqual({ '2026-10': 6, '2026-09': 1 });
    expect(Object.values(c.accounts).reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('CA59 / RG54: une valeur de filtre qui n’existe plus est retirée', () => {
    const { lines } = setup();
    const pruned = pruneFilters(f({ accounts: ['inconnu', `${SWILE_PAIR[0]}\u0001${SWILE_PAIR[1]}`], months: ['2025-01', '2026-10'], categories: ['Loisirs'] }), lines);
    expect(pruned.accounts).toEqual([`${SWILE_PAIR[0]}\u0001${SWILE_PAIR[1]}`]);
    expect(pruned.months).toEqual(['2026-10']);
    expect(pruned.categories).toEqual([]);
  });

  it('matchesFilters sans filtre accepte tout', () => {
    const { d, lines } = setup();
    expect(lines.every(l => matchesFilters(d, l, emptyFilters()))).toBe(true);
  });
});

describe('cochage et import avec filtres', () => {
  it('CA60 / CA65: tout cocher / décocher n’agit que sur les lignes données, jamais sur un virement reçu', () => {
    const { d, lines } = setup();
    const ids = new Set(lines.map(l => l.id));
    const all = setChecked(lines, ids, true);
    // Une entrée « Revenu » se coche comme les autres (RG18) ; seul un « Virement reçu » n'est jamais touché (RG19).
    expect(byLabel(all, 'FAVEUR').checked).toBe(true);
    const recu = changeNature(d, byLabel(lines, 'FAVEUR'), 'recu');
    expect(setChecked([recu], new Set([recu.id]), true)[0].checked).toBe(false);
    expect(byLabel(all, 'EDF').checked).toBe(true);
    // Cochée mais incomplète : pas importable pour autant.
    expect(previewCounts(d, { ...setup().p, lines: all }).toImport).toBe(1);
    const some = setChecked(lines, new Set([byLabel(lines, 'RETRAIT').id]), false);
    expect(some.filter(l => !l.checked).map(l => l.row.label)).toEqual(expect.arrayContaining(['RETRAIT DAB']));
    expect(byLabel(some, 'EDF').checked).toBe(byLabel(lines, 'EDF').checked);
  });

  it('CA56: les lignes cochées masquées par un filtre sont importées avec les autres', () => {
    const { d, p } = setup();
    const lines = p.lines.map(l => ({ ...l, target: l.nature === 'depense' ? ({ kind: 'var', key: 'courses' } as const) : l.target, month: l.month === '2026-09' ? '2026-10' : l.month }));
    const filters = f({ states: ['entree'] });
    const shown = filterLines(d, lines, filters);
    expect(shown).toHaveLength(1);
    const counts = previewCounts(d, { ...p, lines });
    expect(counts.toImport).toBe(5);
    const summary = validateImport(d, { ...p, lines }, newId);
    expect(summary.expenses + summary.withdrawals).toBe(5);
    expect(d.accountMovements).toHaveLength(1);
  });
});

describe('traitement en masse', () => {
  it('CA61: applique une nature, laisse telles quelles les lignes invalides, et l’original reste pour annuler', () => {
    const { d, lines } = setup();
    const ids = new Set(lines.filter(l => !isIncome(l)).map(l => l.id));
    const r = applyBulk(d, lines, ids, { nature: 'retrait' });
    expect(r.changed).toBe(r.lines.filter(l => l.nature === 'retrait' && !isIncome(l)).length - 1); // « RETRAIT » l'était déjà
    expect(byLabel(r.lines, 'EDF')).toMatchObject({ nature: 'retrait', target: { kind: 'account', id: CASH_ACCOUNT_ID } });
    expect(byLabel(r.lines, 'FAVEUR')).toBe(byLabel(lines, 'FAVEUR'));
    // L'annulation consiste à reprendre le tableau d'origine, inchangé.
    expect(byLabel(lines, 'EDF').nature).toBe('depense');
  });

  it('applique une cible, refusée aux lignes pour lesquelles elle est invalide', () => {
    const { d, lines } = setup();
    const ids = new Set([byLabel(lines, 'EDF').id, byLabel(lines, 'RETRAIT').id]);
    const r = applyBulk(d, lines, ids, { target: { kind: 'var', key: 'courses' } });
    expect(byLabel(r.lines, 'EDF').target).toEqual({ kind: 'var', key: 'courses' });
    expect(byLabel(r.lines, 'RETRAIT')).toBe(byLabel(lines, 'RETRAIT'));
    expect(r).toMatchObject({ changed: 1, unchanged: 1 });
  });

  it('applique un mois ouvert, refuse un mois non ouvert, et garde la cible si elle existe dans ce mois', () => {
    const { d, lines } = setup();
    const edf = changeNature(d, { ...byLabel(lines, 'EDF'), target: { kind: 'var', key: 'courses' } }, 'depense');
    const withTarget = lines.map(l => (l.id === edf.id ? edf : l));
    const ids = new Set([edf.id]);
    const ok = applyBulk(d, withTarget, ids, { month: '2026-11' });
    expect(byLabel(ok.lines, 'EDF')).toMatchObject({ month: '2026-11', target: { kind: 'var', key: 'courses' } });
    expect(applyBulk(d, withTarget, ids, { month: '2026-12' })).toMatchObject({ changed: 0, unchanged: 1 });
  });

  it('CA65: ne modifie jamais une entrée d’argent ni une ligne sans compte', () => {
    const { d, lines } = setup();
    d.importAccountLinks = [];
    const p = prepareImport(d, { rows: ROWS, errors: [] });
    const r = applyBulk(d, p.lines, new Set(p.lines.map(l => l.id)), { nature: 'externe' });
    expect(r.changed).toBe(0);
    expect(r.unchanged).toBe(p.lines.length);
    expect(r.lines).toEqual(p.lines);
    expect(lines.length).toBe(7);
  });
});
