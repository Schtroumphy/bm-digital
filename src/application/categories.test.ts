import { describe, expect, it } from 'vitest';
import { addTransaction, updateTransaction } from './actions';
import { addBankAccount } from './bankAccounts';
import { addCategory, deleteCategory, groupedMessage, renameCategory, setCategoryOnSelection, setTransactionCategory, usedMessage } from './categories';
import { addEnvelope } from './envelopes';
import { loadBudget } from './loadBudget';
import { prepareImport, rememberRule, validateImport, type PreviewLine } from './statementImport';
import { CATEGORY_NAME_MAX, categoryBreakdown, categoryEntries, isUncategorized, pieSlices, defaultCategories, withDefaultCategories } from '../domain/categories';
import { MAIN_ACCOUNT_ID } from '../domain/bank';
import { emptyData } from '../domain/empty';
import type { StatementRow } from '../domain/statement';
import type { BudgetData, Line, Transaction } from '../domain/types';

/* Spec 0046 : catégories de dépenses. */

const M = '2026-10';
const ln = (key: string, block: Line['block'], budget: number): Line => ({ key, block, section: '', name: key, budget, actual: null });
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;

function budget(): BudgetData {
  const d = withDefaultCategories(emptyData());
  d.firstMonth = M;
  addEnvelope(d, 'sante', 'Santé', M);
  d.months[M] = { initialized: true, lines: [ln('sal', 'rev', 2000), ln('courses', 'var', 300), ln('edf', 'fix', 80)], alloc: {}, transfersDone: {} };
  return d;
}
const tx = (id: string, amount: number, extra: Partial<Transaction> = {}): Transaction => ({ id, month: M, day: 5, label: id, amount, type: 'var', target: 'courses', ...extra });
const ALI = 'cat-alimentation';
const LOG = 'cat-logement';
const TRA = 'cat-transport';

describe('liste par défaut (RG2, CA1)', () => {
  it('7 catégories avec une teinte chacune, créées une seule fois', () => {
    const d = withDefaultCategories(emptyData());
    expect(d.categories!.map(c => c.name)).toEqual(['Alimentation', 'Logement', 'Transport', 'Loisirs', 'Santé', 'Abonnements', 'Autres']);
    expect(d.categories!.every(c => Number.isFinite(c.hue))).toBe(true);
    expect(new Set(d.categories!.map(c => c.hue)).size).toBe(7);
    expect(withDefaultCategories(d)).toBe(d);
  });

  it('une liste vidée n’est pas recréée au chargement', async () => {
    const d = emptyData();
    d.categories = [];
    const loaded = await loadBudget({ load: async () => d, save: async () => undefined }, () => emptyData());
    expect(loaded.data.categories).toEqual([]);
  });

  it('des données sans liste reçoivent la liste par défaut au chargement, enregistrée aussitôt', async () => {
    const saved: BudgetData[] = [];
    const loaded = await loadBudget({ load: async () => emptyData(), save: async x => void saved.push(x) }, () => emptyData());
    expect(loaded.data.categories).toEqual(defaultCategories());
    expect(saved).toHaveLength(1);
    expect(saved[0].categories).toHaveLength(7);
  });
});

describe('gérer la liste (RG1, RG3 à RG5)', () => {
  it('CA2 : doublon (casse, accents), nom vide ou trop long refusés', () => {
    const d = budget();
    expect(addCategory(d, 'Santé', 'x1')).toMatch(/existe déjà/);
    expect(addCategory(d, 'sante', 'x2')).toMatch(/existe déjà/);
    expect(addCategory(d, 'SANTÉ', 'x3')).toMatch(/existe déjà/);
    expect(addCategory(d, '   ', 'x4')).toBe('Saisissez un nom');
    expect(addCategory(d, 'a'.repeat(CATEGORY_NAME_MAX + 1), 'x5')).toMatch(/caractères maximum/);
    expect(d.categories).toHaveLength(7);
    expect(addCategory(d, '  Cadeaux ', 'cad')).toBeNull();
    expect(d.categories!.at(-1)).toMatchObject({ id: 'cad', name: 'Cadeaux' });
  });

  it('RG3 : deux catégories voisines ont des teintes éloignées', () => {
    const d = budget();
    const hues = d.categories!.map(c => c.hue);
    for (let i = 1; i < hues.length; i++) expect(Math.abs(hues[i] - hues[i - 1])).toBeGreaterThan(40);
  });

  it('CA3 : une catégorie utilisée reste, une inutilisée disparaît', () => {
    const d = budget();
    addTransaction(d, tx('a', 10, { categoryId: ALI }));
    expect(deleteCategory(d, ALI)).toBe(usedMessage(1));
    expect(d.categories!.some(c => c.id === ALI)).toBe(true);
    expect(deleteCategory(d, LOG)).toBeNull();
    expect(d.categories!.some(c => c.id === LOG)).toBe(false);
  });

  it('RG5 : l’usage compte aussi les mois clôturés', () => {
    const d = budget();
    addTransaction(d, tx('a', 10, { categoryId: ALI }));
    d.months[M].closed = true;
    expect(deleteCategory(d, ALI)).toBe('Utilisée par 1 dépense');
  });

  it('CA4 : renommer garde l’association et la teinte ; un nom déjà pris est refusé', () => {
    const d = budget();
    addTransaction(d, tx('a', 10, { categoryId: ALI }));
    const hue = d.categories![0].hue;
    expect(renameCategory(d, ALI, 'Courses')).toBeNull();
    expect(d.categories![0]).toEqual({ id: ALI, name: 'Courses', hue });
    expect(d.transactions[0].categoryId).toBe(ALI);
    expect(renameCategory(d, ALI, 'logement')).toMatch(/existe déjà/);
    expect(renameCategory(d, ALI, 'COURSES')).toBeNull();
  });

  it('supprimer une catégorie vide la catégorie des règles d’import qui la portaient (RG14)', () => {
    const d = budget();
    d.importRules = [{ id: 'r1', pattern: 'carrefour', nature: 'depense', target: { kind: 'var', key: 'courses' }, categoryId: TRA }, { id: 'r2', pattern: 'edf', nature: 'depense', categoryId: ALI }];
    expect(deleteCategory(d, TRA)).toBeNull();
    expect(d.importRules[0]).not.toHaveProperty('categoryId');
    expect(d.importRules[1].categoryId).toBe(ALI);
  });
});

describe('catégoriser une dépense (RG6, RG7, RG10, RG11)', () => {
  it('CA5 : var, env, fix et epd acceptent une catégorie', () => {
    const d = budget();
    expect(addTransaction(d, tx('v', 10, { categoryId: ALI }))).toBe(true);
    expect(addTransaction(d, tx('e', 10, { type: 'env', target: 'sante', categoryId: ALI }))).toBe(true);
    expect(addTransaction(d, tx('f', 10, { type: 'fix', target: 'edf', categoryId: LOG }))).toBe(true);
    expect(d.transactions.map(t => t.categoryId)).toEqual([ALI, ALI, LOG]);
  });

  it('CA5 : une entrée, un retrait d’épargne ou une catégorie inconnue sont refusés', () => {
    const d = budget();
    expect(addTransaction(d, tx('r', 10, { type: 'rev', target: 'sal', categoryId: ALI }))).toBe(false);
    expect(addTransaction(d, tx('i', 10, { type: 'envin', target: 'sante', categoryId: ALI }))).toBe(false);
    expect(addTransaction(d, tx('v', 10, { categoryId: 'fantome' }))).toBe(false);
    expect(d.transactions).toHaveLength(0);
    addTransaction(d, tx('r', 10, { type: 'rev', target: 'sal' }));
    expect(setTransactionCategory(d, 'r', ALI)).toBe('type');
    expect(d.transactions[0]).not.toHaveProperty('categoryId');
  });

  it('modifier une dépense (updateTransaction) garde ou change sa catégorie ; changer vers un type non catégorisable la retire', () => {
    const d = budget();
    addTransaction(d, tx('a', 10, { categoryId: ALI }));
    const patch = { label: 'a', amount: 10, date: '2026-10-05', type: 'var' as const, target: 'courses' };
    expect(updateTransaction(d, 'a', patch)).toBe(true);
    expect(d.transactions[0].categoryId).toBe(ALI);
    expect(updateTransaction(d, 'a', { ...patch, categoryId: LOG })).toBe(true);
    expect(d.transactions[0].categoryId).toBe(LOG);
    expect(updateTransaction(d, 'a', { ...patch, categoryId: null })).toBe(true);
    expect(d.transactions[0]).not.toHaveProperty('categoryId');
  });

  it('CA6 : refusé sur un mois clôturé, accepté après réouverture', () => {
    const d = budget();
    addTransaction(d, tx('a', 10));
    d.months[M].closed = true;
    expect(setTransactionCategory(d, 'a', ALI)).toBe('locked');
    expect(d.transactions[0]).not.toHaveProperty('categoryId');
    delete d.months[M].closed;
    expect(setTransactionCategory(d, 'a', ALI)).toBeNull();
    expect(d.transactions[0].categoryId).toBe(ALI);
    expect(setTransactionCategory(d, 'a', undefined)).toBeNull();
    expect(d.transactions[0]).not.toHaveProperty('categoryId');
  });

  it('CA16 : changer la catégorie depuis le tableau ne modifie que la catégorie', () => {
    const d = budget();
    addTransaction(d, tx('a', 12.5, { detail: 'note' }));
    const before = structuredClone(d.transactions[0]);
    expect(setTransactionCategory(d, 'a', TRA)).toBeNull();
    expect(d.transactions[0]).toEqual({ ...before, categoryId: TRA });
  });

  it('CA7 : 5 écritures dont 1 d’un mois clôturé et 1 non catégorisable : 3 modifiées, 2 ignorées', () => {
    const d = budget();
    d.months['2026-09'] = { initialized: true, lines: [ln('courses', 'var', 100)], alloc: {}, transfersDone: {}, closed: true };
    d.transactions.push(tx('a', 10), tx('b', 10), tx('c', 10), tx('old', 10, { month: '2026-09' }), tx('rev', 10, { type: 'rev', target: 'sal' }));
    const r = setCategoryOnSelection(d, ['a', 'b', 'c', 'old', 'rev'], TRA);
    expect(r).toEqual({ changed: 3, ignored: 2 });
    expect(groupedMessage(r)).toContain('2 ignorées');
    expect(d.transactions.filter(t => t.categoryId === TRA).map(t => t.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('détail d’une catégorie (RG28, CA20)', () => {
  it('liste les écritures comptées de la catégorie, plus récentes d’abord, et leur somme égale la ligne de la répartition', () => {
    const d = budget();
    addTransaction(d, tx('a1', 30, { categoryId: ALI, day: 3, label: 'B' }));
    addTransaction(d, tx('a2', 20, { categoryId: ALI, day: 9, label: 'A' }));
    addTransaction(d, tx('a3', 5, { categoryId: ALI, day: 9, label: 'Z', bankDate: '2026-10-20' }));
    addTransaction(d, tx('hb', 99, { categoryId: ALI, offBudget: true }));
    addTransaction(d, tx('l1', 80, { type: 'fix', target: 'edf', categoryId: LOG }));
    addTransaction(d, tx('n1', 7));
    addTransaction(d, tx('back', 20, { type: 'envin', target: 'sante' }));
    const ali = categoryEntries(d, M, ALI);
    expect(ali.map(e => e.id)).toEqual(['a3', 'a2', 'a1']);
    expect(ali[0].date).toBe('2026-10-20');
    expect(ali[2].date).toBe('2026-10-03');
    const row = categoryBreakdown(d, M).rows.find(r => r.category!.id === ALI)!;
    expect(ali.reduce((a, e) => a + e.amount, 0)).toBe(row.amount);
    expect(categoryEntries(d, M, null).map(e => e.id)).toEqual(['n1']);
    expect(categoryEntries(d, '2030-01', ALI)).toEqual([]);
  });

  it('une catégorie supprimée par ailleurs range ses écritures dans « Sans catégorie »', () => {
    const d = budget();
    addTransaction(d, tx('a', 10, { categoryId: ALI }));
    d.categories = d.categories!.filter(c => c.id !== ALI);
    expect(categoryEntries(d, M, null).map(e => e.id)).toEqual(['a']);
  });
});

describe('filtre « Sans catégorie » (RG26, CA18)', () => {
  it('ne garde que les écritures catégorisables sans catégorie, jamais les entrées d’argent', () => {
    const d = budget();
    addTransaction(d, tx('v-sans', 10));
    addTransaction(d, tx('v-avec', 10, { categoryId: ALI }));
    addTransaction(d, tx('f-sans', 10, { type: 'fix', target: 'edf' }));
    addTransaction(d, tx('e-sans', 10, { type: 'env', target: 'sante' }));
    addTransaction(d, tx('rev', 10, { type: 'rev', target: 'sal' }));
    addTransaction(d, tx('envin', 10, { type: 'envin', target: 'sante' }));
    expect(d.transactions.filter(t => isUncategorized(d, t)).map(t => t.id)).toEqual(['v-sans', 'f-sans', 'e-sans']);
  });

  it('une catégorie supprimée par ailleurs compte comme « sans catégorie »', () => {
    const d = budget();
    const t = tx('a', 10, { categoryId: 'fantome' });
    expect(isUncategorized(d, t)).toBe(true);
  });
});

describe('répartition du mois (RG15 à RG20)', () => {
  function month(): BudgetData {
    const d = budget();
    addTransaction(d, tx('a1', 300, { categoryId: ALI }));
    addTransaction(d, tx('a2', 100, { categoryId: ALI }));
    addTransaction(d, tx('l1', 80, { type: 'fix', target: 'edf', categoryId: LOG }));
    addTransaction(d, tx('t1', 120, { type: 'env', target: 'sante', categoryId: TRA }));
    addTransaction(d, tx('n1', 100));
    return d;
  }

  it('CA8 : totaux par catégorie, tri décroissant, parts de 100 %, « Sans catégorie » en dernier', () => {
    const b = categoryBreakdown(month(), M);
    expect(b.total).toBe(700);
    expect(b.rows.map(r => [r.category!.name, r.amount, r.count])).toEqual([['Alimentation', 400, 2], ['Transport', 120, 1], ['Logement', 80, 1]]);
    expect(b.none).toMatchObject({ category: null, amount: 100, count: 1 });
    expect(b.uncategorizedCount).toBe(1);
    const parts = [...b.rows, b.none!].reduce((a, r) => a + r.share, 0);
    expect(parts).toBeCloseTo(100, 6);
  });

  it('RG18 : à montant égal, ordre alphabétique ; une catégorie à 0 est masquée', () => {
    const d = budget();
    addTransaction(d, tx('a', 50, { categoryId: TRA }));
    addTransaction(d, tx('b', 50, { categoryId: ALI }));
    expect(categoryBreakdown(d, M).rows.map(r => r.category!.name)).toEqual(['Alimentation', 'Transport']);
  });

  it('CA9 : une dépense affectée à l’épargne ou hors budget n’est pas comptée', () => {
    const d = budget();
    addBankAccount(d, 'liv', 'Livret', 'epargne');
    addTransaction(d, tx('hb', 70, { categoryId: ALI, offBudget: true }));
    addTransaction(d, tx('as', 40, { categoryId: ALI, assignedAccountId: 'liv' }));
    addTransaction(d, tx('ok', 10, { categoryId: ALI }));
    const b = categoryBreakdown(d, M);
    expect(b.total).toBe(10);
    expect(b.rows[0]).toMatchObject({ amount: 10, count: 1 });
  });

  it('CA10 (lecture stricte) : une entrée sur enveloppe ne compte jamais et ne réduit aucune catégorie', () => {
    const d = budget();
    addTransaction(d, tx('dep', 50, { type: 'env', target: 'sante', categoryId: ALI }));
    expect(addTransaction(d, tx('back', 20, { type: 'envin', target: 'sante' }))).toBe(true);
    const b = categoryBreakdown(d, M);
    expect(b.total).toBe(50);
    expect(b.rows[0]).toMatchObject({ amount: 50, count: 1 });
    expect(b.none).toBeNull();
  });

  it('le mois est le mois budgétaire de l’écriture, pas la date bancaire', () => {
    const d = budget();
    addTransaction(d, tx('a', 40, { categoryId: ALI, bankDate: '2026-11-02' }));
    expect(categoryBreakdown(d, M).total).toBe(40);
    expect(categoryBreakdown(d, '2026-11').total).toBe(0);
  });

  it('CA11 : un mois futur ou non initialisé donne une répartition vide, sans erreur', () => {
    const b = categoryBreakdown(month(), '2030-01');
    expect(b).toEqual({ total: 0, uncategorizedCount: 0, rows: [], none: null });
  });

  it('CA17 : les parts du camembert suivent la liste, couvrent le cercle, « Sans catégorie » grise en dernier', () => {
    const slices = pieSlices(categoryBreakdown(month(), M));
    expect(slices.map(s => s.name)).toEqual(['Alimentation', 'Transport', 'Logement', 'Sans catégorie']);
    expect(slices[0].from).toBe(0);
    expect(slices.at(-1)!.to).toBeCloseTo(1, 9);
    for (let i = 1; i < slices.length; i++) expect(slices[i].from).toBeCloseTo(slices[i - 1].to, 9);
    expect(slices.at(-1)!.hue).toBeNull();
    expect(slices[0].hue).not.toBeNull();
    expect(slices.map(s => s.amount)).toEqual([400, 120, 80, 100]);
  });

  it('CA17 : une seule catégorie couvre tout le cercle (une seule part de 0 à 1)', () => {
    const d = budget();
    addTransaction(d, tx('a', 40, { categoryId: ALI }));
    const slices = pieSlices(categoryBreakdown(d, M));
    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ from: 0, to: 1, share: 100 });
  });

  it('CA17 : un mois sans dépense n’a aucune part', () => {
    expect(pieSlices(categoryBreakdown(month(), '2030-01'))).toEqual([]);
  });

  it('une dépense dont la catégorie a disparu compte comme « Sans catégorie »', () => {
    const d = month();
    d.categories = d.categories!.filter(c => c.id !== ALI);
    expect(categoryBreakdown(d, M).none).toMatchObject({ amount: 500, count: 3 });
  });
});

describe('import CSV (RG13, RG14, CA12, CA13)', () => {
  const PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
  const row = (label: string, amount: number): StatementRow => ({ date: '2026-10-12', label, notes: '', category: 'Texte Linxo', accountName: PAIR[0], connectionName: PAIR[1], amount, direction: 'debit' });
  function importable(): BudgetData {
    const d = budget();
    d.importAccountLinks = [{ id: 'l1', accountName: PAIR[0], connectionName: PAIR[1], accountId: MAIN_ACCOUNT_ID }];
    return d;
  }
  const prep = (d: BudgetData, label = 'CARREFOUR MARKET') => prepareImport(d, { rows: [row(label, 25)], errors: [] });
  const toCourses = (l: PreviewLine): PreviewLine => ({ ...l, target: { kind: 'var', key: 'courses' } });

  it('la catégorie choisie est portée par l’écriture et retenue par la règle ; l’empreinte ne change pas', () => {
    const d = importable();
    const p = prep(d);
    const before = p.lines[0].fingerprint;
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...toCourses(l), categoryId: ALI, remember: 'carrefour' })) }, newId);
    expect(d.transactions[0]).toMatchObject({ categoryId: ALI, category: 'Texte Linxo', fingerprint: before });
    expect(d.importRules).toEqual([expect.objectContaining({ pattern: 'carrefour', categoryId: ALI })]);
    const next = prep(d, 'CARREFOUR CITY').lines[0];
    expect(next).toMatchObject({ nature: 'depense', categoryId: ALI });
    expect(next.fingerprint).not.toBe('');
  });

  it('une règle sans catégorie présélectionne « Sans catégorie »', () => {
    const d = importable();
    rememberRule(d, 'carrefour', 'depense', { kind: 'var', key: 'courses' }, newId);
    expect(prep(d).lines[0]).not.toHaveProperty('categoryId');
  });

  it('CA13 : si la catégorie de la règle est supprimée, la ligne est présélectionnée « Sans catégorie »', () => {
    const d = importable();
    rememberRule(d, 'carrefour', 'depense', { kind: 'var', key: 'courses' }, newId, LOG);
    expect(prep(d).lines[0].categoryId).toBe(LOG);
    expect(deleteCategory(d, LOG)).toBeNull();
    expect(prep(d).lines[0]).not.toHaveProperty('categoryId');
  });

  it('ré-enregistrer une règle avec « Sans catégorie » lui retire sa catégorie', () => {
    const d = importable();
    rememberRule(d, 'carrefour', 'depense', undefined, newId, ALI);
    rememberRule(d, 'carrefour', 'depense', undefined, newId, undefined);
    expect(d.importRules![0]).not.toHaveProperty('categoryId');
  });
});
