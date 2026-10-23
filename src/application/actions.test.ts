import { describe, expect, it } from 'vitest';
import { addLine, addTransaction, applyTemplate, createFirstMonth, deleteLine, deleteTransaction, deleteTransactions, duplicatePrevious, isSetupMonthAllowed, monthCsv, SAVINGS_SECTIONS, setEnvelopeAllocation, setupMonths, undoValidateMonth, updateLine, validateMonth, willReplaceMonth } from './actions';
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

  it('deleting several expenses restores the line and ignores unknown ids', () => {
    const d = seedData();
    addTransaction(d, { id: 'a', month: '2026-12', day: 3, label: 'Lidl', amount: 25.5, type: 'var', target: 'v-ali' });
    addTransaction(d, { id: 'b', month: '2026-12', day: 4, label: 'Lidl', amount: 10, type: 'var', target: 'v-ali' });
    expect(deleteTransactions(d, ['a', 'b', 'nope'])).toBe(2);
    expect(line(d, '2026-12', 'v-ali').actual).toBe(312.4);
    expect(d.transactions.some(t => t.id === 'a' || t.id === 'b')).toBe(false);
  });

  it('envelope spending lowers real savings and the envelope balance', () => {
    const d = seedData();
    addTransaction(d, { id: 'x', month: '2026-12', day: 3, label: 'Pharmacie', amount: 15, type: 'env', target: 'sante', accountId: CASH_ACCOUNT_ID });
    const l = new Ledger(d, '2026-10');
    expect(monthSummary(d, l, '2026-12').realSavings).toBe(1600);
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
    expect(csv.split('\r\n')[1]).toBe('Revenus;;Remboursement;350;349,93;non');
    expect(csv.split('\r\n')[0]).toBe('\uFEFFBloc;Section;Nom;Budget;Réel;Hors budget');
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

describe('ajout d’une épargne avec horizon', () => {
  const M = '2026-12';
  const epa = (d: ReturnType<typeof seedData>) => d.months[M].lines.filter(l => l.block === 'epa');

  it('CA2: « Long terme » crée la ligne dans « Épargne long terme »', () => {
    const d = seedData();
    addLine(d, M, 'epa', 'new', SAVINGS_SECTIONS.LT);
    const l = line(d, M, 'new');
    expect(l).toMatchObject({ section: 'Épargne long terme', name: 'Nouvelle ligne', budget: 0, actual: null, block: 'epa' });
  });

  it('CA3: « Moyen terme » crée la ligne dans « Épargne moyen terme »', () => {
    const d = seedData();
    addLine(d, M, 'epa', 'new', SAVINGS_SECTIONS.MT);
    expect(line(d, M, 'new').section).toBe('Épargne moyen terme');
  });

  it('CA4: la ligne suit la dernière ligne de sa section', () => {
    const d = seedData();
    const keysBefore = epa(d).filter(l => l.section === SAVINGS_SECTIONS.LT).map(l => l.key);
    const lastLt = keysBefore[keysBefore.length - 1];
    addLine(d, M, 'epa', 'new', SAVINGS_SECTIONS.LT);
    const keys = epa(d).map(l => l.key);
    expect(keys.indexOf('new')).toBe(keys.indexOf(lastLt) + 1);
    // La section reste d'un seul tenant : aucune ligne d'une autre section n'est intercalée.
    const sections = epa(d).map(l => l.section);
    expect(sections.filter((x, i) => x !== sections[i - 1])).toHaveLength(new Set(sections).size);
  });

  it('CA5: sans la section choisie, elle est créée à la fin du bloc', () => {
    const d = seedData();
    d.months[M].lines = d.months[M].lines.filter(l => !(l.block === 'epa' && l.section === SAVINGS_SECTIONS.MT));
    addLine(d, M, 'epa', 'new', SAVINGS_SECTIONS.MT);
    const e = epa(d);
    expect(e[e.length - 1].key).toBe('new');
    expect(e[e.length - 1].section).toBe('Épargne moyen terme');
    // Bloc entièrement vide.
    const empty = seedData();
    empty.months[M].lines = empty.months[M].lines.filter(l => l.block !== 'epa');
    addLine(empty, M, 'epa', 'n2', SAVINGS_SECTIONS.LT);
    expect(epa(empty)).toHaveLength(1);
    expect(epa(empty)[0].section).toBe('Épargne long terme');
  });

  it('CA8/CA9: sans section cible le comportement est inchangé et le modèle intact', () => {
    const d = seedData();
    const tpl = structuredClone(d.template);
    addLine(d, M, 'rev', 'r', undefined);
    expect(line(d, M, 'r').section).toBe(d.months[M].lines.filter(l => l.block === 'rev' && l.key !== 'r').at(-1)!.section);
    addLine(d, M, 'epa', 'new', SAVINGS_SECTIONS.LT);
    expect(d.template).toEqual(tpl);
  });
});

describe('allocation depuis l’écran Budget', () => {
  const M = '2026-12';
  const ENV = seedData().envelopes[0].id;
  const alloc = (d: ReturnType<typeof seedData>, m = M) => d.months[m].alloc[ENV];
  const balance = (d: ReturnType<typeof seedData>) => new Ledger(d).envMonth(ENV, M)!.balance;
  const remaining = (d: ReturnType<typeof seedData>) => monthSummary(d, new Ledger(d), M).remaining;

  it('CA1: la valeur remplace l’allocation (150 → 200, pas 350) et le solde suit', () => {
    const d = seedData();
    d.months[M].alloc[ENV] = 150;
    const b0 = balance(d);
    expect(setEnvelopeAllocation(d, M, ENV, 200)).toBe(true);
    expect(alloc(d)).toBe(200);
    expect(balance(d)).toBe(b0 + 50);
  });

  it('CA2: le reste à placer diminue de 50 quand l’allocation passe de 150 à 200', () => {
    const d = seedData();
    d.months[M].alloc[ENV] = 150;
    const r0 = remaining(d);
    setEnvelopeAllocation(d, M, ENV, 200);
    expect(remaining(d)).toBe(r0 - 50);
  });

  it('CA3: une baisse (150 → 100) baisse le solde et relève le reste à placer', () => {
    const d = seedData();
    d.months[M].alloc[ENV] = 150;
    const b0 = balance(d);
    const r0 = remaining(d);
    setEnvelopeAllocation(d, M, ENV, 100);
    expect(alloc(d)).toBe(100);
    expect(balance(d)).toBe(b0 - 50);
    expect(remaining(d)).toBe(r0 + 50);
  });

  it('CA5: 0 est valide et met le mois et le modèle à 0', () => {
    const d = seedData();
    expect(setEnvelopeAllocation(d, M, ENV, 0)).toBe(true);
    expect(alloc(d)).toBe(0);
    expect(d.template.envAlloc[ENV]).toBe(0);
  });

  it('CA6: un montant négatif ou invalide est refusé, rien ne change', () => {
    const d = seedData();
    const before = structuredClone(d);
    expect(setEnvelopeAllocation(d, M, ENV, -20)).toBe(false);
    expect(setEnvelopeAllocation(d, M, ENV, NaN)).toBe(false);
    expect(d).toEqual(before);
  });

  it('CA7: le dépassement est enregistré (reste à placer négatif)', () => {
    const d = seedData();
    d.months[M].alloc[ENV] = 0;
    const r0 = remaining(d);
    expect(setEnvelopeAllocation(d, M, ENV, r0 + 30)).toBe(true);
    expect(remaining(d)).toBe(-30);
  });

  it('CA9: le modèle prend la valeur saisie, et « Appliquer le modèle » la reprend', () => {
    const d = seedData();
    setEnvelopeAllocation(d, M, ENV, 233);
    expect(d.template.envAlloc[ENV]).toBe(233);
    delete d.months['2027-01'];
    applyTemplate(d, '2027-01');
    expect(alloc(d, '2027-01')).toBe(233);
  });

  it('CA10: les autres mois initialisés ne changent pas', () => {
    const d = seedData();
    const other = Object.keys(d.months).find(k => k !== M && d.months[k].initialized)!;
    const before = alloc(d, other);
    setEnvelopeAllocation(d, M, ENV, before + 77);
    expect(alloc(d, other)).toBe(before);
  });

  it('CA11/CA12: mois verrouillé ou non initialisé : rien ne change', () => {
    const d = seedData();
    d.closes[2026] = { closed: true, overrides: {} };
    const locked = structuredClone(d);
    expect(setEnvelopeAllocation(d, M, ENV, 50)).toBe(false);
    expect(d).toEqual(locked);
    const e = seedData();
    e.months['2027-05'] = { initialized: false, lines: [], alloc: {}, transfersDone: {} };
    const before = structuredClone(e);
    expect(setEnvelopeAllocation(e, '2027-05', ENV, 50)).toBe(false);
    expect(setEnvelopeAllocation(seedData(), M, 'inconnue', 50)).toBe(false);
    expect(e).toEqual(before);
  });

  it('CA16: une valeur identique à l’allocation aligne quand même le modèle', () => {
    const d = seedData();
    d.months[M].alloc[ENV] = 150;
    d.template.envAlloc[ENV] = 120;
    expect(setEnvelopeAllocation(d, M, ENV, 150)).toBe(true);
    expect(alloc(d)).toBe(150);
    expect(d.template.envAlloc[ENV]).toBe(150);
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
