import { describe, expect, it } from 'vitest';
import { addLine, addTransaction, applyTemplate, createFirstMonth, deleteLine, deleteTransaction, duplicatePrevious, isSetupMonthAllowed, monthCsv, setupMonths, undoValidateMonth, updateLine, validateMonth, willReplaceMonth } from './actions';
import { addSuggested, emptyDraft, exampleDraft, parseDraft, setupSummary, updateRow, type IdFactory } from './setup';
import { linesWithoutActual, monthSummary } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { CASH_ACCOUNT_ID } from '../domain/bank';
import { seedData } from '../domain/seed';

const line = (d: ReturnType<typeof seedData>, m: string, key: string) => d.months[m].lines.find(l => l.key === key)!;

describe('actions', () => {
  it('a variable expense raises its line, and deleting it restores it', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: '2026-12', day: 3, label: 'Lidl', amount: 25.5, type: 'var', target: 'v-ali' });
    expect(line(d, '2026-12', 'v-ali').actual).toBe(337.9);
    deleteTransaction(d, 'x');
    expect(line(d, '2026-12', 'v-ali').actual).toBe(312.4);
  });

  it('envelope spending lowers real savings and the envelope balance', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: '2026-12', day: 3, label: 'Pharmacie', amount: 15, type: 'env', target: 'sante', accountId: CASH_ACCOUNT_ID });
    const l = new Ledger(d, '2026-10');
    expect(monthSummary(d, l, '2026-12').realSavings).toBe(554);
    expect(l.envMonth('sante', '2026-12')!.balance).toBe(25);
  });

  it('applying the model to a new month keeps expenses already recorded', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: '2027-01', day: 2, label: 'Courses', amount: 40, type: 'var', target: 'v-ali' });
    applyTemplate(d, '2027-01');
    expect(d.months['2027-01'].initialized).toBe(true);
    expect(line(d, '2027-01', 'v-ali').actual).toBe(40);
    expect(line(d, '2027-01', 'r-sal').actual).toBeNull();
  });

  it('duplicates the previous month without its actuals', () => {
    const d = seedData();
    deleteLine(d, '2026-12', 'f-nf');
    expect(duplicatePrevious(d, '2027-01')).toBe(true);
    expect(d.months['2027-01'].lines.some(l => l.key === 'f-nf')).toBe(false);
    expect(d.months['2027-01'].lines.every(l => l.block === 'var' || l.actual === null)).toBe(true);
    expect(duplicatePrevious(d, '2027-03')).toBe(false);
  });

  it('exports CSV in the French dialect', () => {
    const csv = monthCsv([{ key: 'a', block: 'rev', section: '', name: 'Remboursement', budget: 350, actual: 349.93 }], { rev: 'Revenus' } as never);
    expect(csv.split('\r\n')[1]).toBe('Revenus;;Remboursement;350;349,93');
  });
});

describe('initialisation du budget', () => {
  let n = 0;
  const mkId: IdFactory = p => `${p}${++n}`;
  const TODAY = '2027-01';

  it('CA3: un budget vide ne contient ni mois ni donnée de démonstration', () => {
    const d = emptyData();
    expect(d.firstMonth).toBeNull();
    expect(Object.keys(d.months)).toHaveLength(0);
    expect(d.template.lines).toHaveLength(0);
    expect(d.envelopes).toHaveLength(0);
    expect(d.transactions).toHaveLength(0);
    expect(new Ledger(d, TODAY).months).toEqual([]);
  });

  it('CA6: reste à placer = revenus − crédits − dépenses − (épargnes + investissements) − enveloppes', () => {
    const s = setupSummary(exampleDraft('2027-01', mkId));
    // 7650 − 1155 − 917,99 − (600 + 250) − 600
    expect(s.income).toBe(7650);
    expect(s.credits).toBe(1155);
    expect(s.expenses).toBe(917.99);
    expect(s.saved).toBe(850);
    expect(s.allocated).toBe(600);
    expect(s.remaining).toBe(4127.01);
    expect(s.emptyLists).toEqual([]);
    expect(setupSummary(emptyDraft('2027-01')).emptyLists).toHaveLength(6);
  });

  it('CA7: crée le mois choisi, firstMonth et les soldes au 1er jour du mois', () => {
    const d = emptyData();
    const draft = exampleDraft('2027-01', mkId);
    expect(createFirstMonth(d, draft, TODAY)).toBe(true);

    expect(d.firstMonth).toBe('2027-01');
    expect(d.months['2027-01'].initialized).toBe(true);
    const lines = d.months['2027-01'].lines;
    expect(lines).toHaveLength(3 + 3 + 4 + 3 + 2);
    expect(lines.filter(l => l.block === 'fix').map(l => l.name)).toEqual(['Compte joint', 'Netflix']);
    expect(lines.filter(l => l.block === 'var').map(l => l.name)).toEqual(['Alimentation', 'Loisirs']);
    expect(lines.find(l => l.name === 'Lydia Holidays')!.section).toBe('Épargne moyen terme');
    expect(lines.find(l => l.name === 'Livret A')!.section).toBe('Épargne long terme');
    expect(lines.every(l => l.actual === null)).toBe(true);

    const ledger = new Ledger(d, TODAY);
    const livretA = draft.rows.epa[0].id;
    const perso = draft.rows.env[0].id;
    expect(ledger.accMonth(livretA, '2027-01')!.start).toBe(9800);
    expect(ledger.envMonth(perso, '2027-01')!.start).toBe(342);
    expect(ledger.envMonth(perso, '2027-01')!.balance).toBe(442);
    expect(d.envelopes.find(e => e.id === perso)!.cash).toBe(120);
    // Les chiffres du budget mensuel sont ceux du récapitulatif.
    expect(monthSummary(d, ledger, '2027-01').remaining).toBe(setupSummary(draft).remaining);
  });

  it('CA7: la part en espèces est ramenée au solde', () => {
    const d = emptyData();
    let draft = exampleDraft('2027-01', mkId);
    draft = updateRow(draft, 'env', draft.rows.env[0].id, { balance: 50, cash: 80 });
    createFirstMonth(d, draft, TODAY);
    expect(d.envelopes[0].cash).toBe(50);
  });

  it('CA8: un mois déjà initialisé demande confirmation, sans confirmation rien ne change', () => {
    const d = emptyData();
    const draft = exampleDraft('2027-01', mkId);
    expect(willReplaceMonth(d, '2027-01')).toBe(false);
    createFirstMonth(d, draft, TODAY);
    expect(willReplaceMonth(d, '2027-01')).toBe(true);
    expect(willReplaceMonth(d, '2027-02')).toBe(false);
    // Après confirmation, le remplacement efface les montants réels.
    d.months['2027-01'].lines[0].actual = 123;
    createFirstMonth(d, draft, TODAY);
    expect(d.months['2027-01'].lines[0].actual).toBeNull();
    // Refus de l'utilisateur : l'écran n'appelle pas l'action, donc rien ne change.
    d.months['2027-01'].lines[0].actual = 456;
    expect(willReplaceMonth(d, '2027-01')).toBe(true);
    expect(d.months['2027-01'].lines[0].actual).toBe(456);
  });

  it('CA9: sans budget, la liste va de −1 an à +1 an et un mois passé est accepté', () => {
    const d = emptyData();
    const months = setupMonths(d, '2027-06');
    expect(months[0]).toBe('2026-06');
    expect(months[months.length - 1]).toBe('2028-06');
    expect(months).toHaveLength(25);
    expect(isSetupMonthAllowed(d, '2026-09', '2027-06')).toBe(true);
    expect(isSetupMonthAllowed(d, '2025-12', '2027-06')).toBe(false);
  });

  it('CA9: avec un premier mois, un mois antérieur est refusé et un mois futur accepté', () => {
    const d = emptyData();
    createFirstMonth(d, exampleDraft('2027-01', mkId), TODAY);
    expect(isSetupMonthAllowed(d, '2026-12', TODAY)).toBe(false);
    expect(isSetupMonthAllowed(d, '2027-03', TODAY)).toBe(true);

    const before = structuredClone(d);
    expect(createFirstMonth(d, exampleDraft('2026-12', mkId), TODAY)).toBe(false);
    expect(d).toEqual(before);

    expect(createFirstMonth(d, exampleDraft('2027-03', mkId), TODAY)).toBe(true);
    expect(d.firstMonth).toBe('2027-01');
    expect(d.months['2027-03'].initialized).toBe(true);
  });

  it('CA12: appliquer le modèle au mois suivant reprend les lignes et allocations saisies', () => {
    const d = emptyData();
    const draft = exampleDraft('2027-01', mkId);
    createFirstMonth(d, draft, TODAY);
    applyTemplate(d, '2027-02');
    expect(d.months['2027-02'].lines.map(l => [l.key, l.block, l.name, l.budget])).toEqual(
      d.months['2027-01'].lines.map(l => [l.key, l.block, l.name, l.budget]),
    );
    expect(d.months['2027-02'].alloc).toEqual(d.months['2027-01'].alloc);
    expect(d.months['2027-02'].alloc[draft.rows.env[0].id]).toBe(100);
  });

  it('les lignes suggérées sont ajoutées à l’étape, avec leur type', () => {
    const draft = addSuggested(emptyDraft('2027-01'), 'dep', mkId);
    expect(draft.rows.dep).toHaveLength(12);
    expect(draft.rows.dep.filter(r => r.kind === 'var')).toHaveLength(6);
  });

  it('un brouillon dont l’étape est invalide est ignoré', () => {
    const ok = exampleDraft('2027-01', mkId);
    expect(parseDraft(JSON.parse(JSON.stringify(ok)))).not.toBeNull();
    for (const step of [-1, 9, 1.5, Number.NaN]) expect(parseDraft({ ...ok, step })).toBeNull();
  });

  it('création sur un mois postérieur à firstMonth: le solde d’enveloppe saisi remplace le calculé', () => {
    const d = emptyData();
    createFirstMonth(d, exampleDraft('2027-01', mkId), TODAY);

    let later = exampleDraft('2027-03', mkId);
    later = updateRow(later, 'env', later.rows.env[0].id, { balance: 500 });
    expect(createFirstMonth(d, later, TODAY)).toBe(true);

    const id = later.rows.env[0].id;
    const ledger = new Ledger(d, TODAY);
    expect(ledger.envMonth(id, '2027-02')!.balance).toBe(500); // fin février = solde saisi
    expect(ledger.envMonth(id, '2027-03')!.start).toBe(500);
    expect(ledger.envMonth(id, '2027-03')!.balance).toBe(600);
    expect(d.firstMonth).toBe('2027-01');
  });
});

describe('validateMonth', () => {
  const M = '2027-02';
  /** A fresh month with hand-picked lines. */
  const month = (lines: Array<[string, 'fix' | 'var' | 'rev', number, number | null]>) => {
    const d = seedData();
    d.months[M] = { initialized: true, alloc: {}, transfersDone: {}, lines: lines.map(([key, block, budget, actual]) => ({ key, block, section: '', name: key, budget, actual })) };
    return d;
  };
  const actual = (d: ReturnType<typeof seedData>, key: string) => line(d, M, key).actual;

  it('counts only eligible lines (CA1, CA4, CA5, CA6)', () => {
    const d = month([['a', 'fix', 100, null], ['b', 'rev', 50, null], ['c', 'fix', 10, null], ['z', 'fix', 100, 0], ['v', 'var', 100, null], ['n', 'fix', 0, null]]);
    expect(linesWithoutActual(d, M).map(l => l.key)).toEqual(['a', 'b', 'c']);
  });

  it('copies the budget into the actual of eligible lines only (CA2-CA6)', () => {
    const d = month([['a', 'fix', 100, null], ['p', 'fix', 100, 80], ['z', 'fix', 100, 0], ['v', 'var', 100, null], ['n', 'fix', 0, null]]);
    expect(validateMonth(d, M)).toEqual([{ key: 'a', value: 100 }]);
    expect([actual(d, 'a'), actual(d, 'p'), actual(d, 'z'), actual(d, 'v'), actual(d, 'n')]).toEqual([100, 80, 0, null, null]);
  });

  it('does nothing when the year is closed (CA7)', () => {
    const d = month([['a', 'fix', 100, null]]);
    d.closes[2027] = { closed: true, overrides: {} };
    expect(validateMonth(d, M)).toEqual([]);
    expect(actual(d, 'a')).toBeNull();
  });

  it('does nothing on a month that is not initialized', () => {
    const d = seedData();
    expect(validateMonth(d, '2031-01')).toEqual([]);
  });

  it('undo empties the filled lines and leaves the others (CA8)', () => {
    const d = month([['a', 'fix', 100, null], ['p', 'fix', 100, 80]]);
    const filled = validateMonth(d, M);
    undoValidateMonth(d, M, filled);
    expect([actual(d, 'a'), actual(d, 'p')]).toEqual([null, 80]);
  });

  it('undo keeps a line edited after the validation (CA9)', () => {
    const d = month([['a', 'fix', 100, null], ['b', 'fix', 40, null]]);
    const filled = validateMonth(d, M);
    updateLine(d, M, 'a', { actual: 90 });
    undoValidateMonth(d, M, filled);
    expect([actual(d, 'a'), actual(d, 'b')]).toEqual([90, null]);
  });

  it('a line added after the validation stays empty and is counted (CA14)', () => {
    const d = month([['a', 'fix', 100, null]]);
    validateMonth(d, M);
    addLine(d, M, 'fix', 'new');
    updateLine(d, M, 'new', { budget: 20 });
    expect(actual(d, 'new')).toBeNull();
    expect(linesWithoutActual(d, M)).toHaveLength(1);
  });
});
