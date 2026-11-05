import { describe, expect, it } from 'vitest';
import { defaultBankAccounts, newEnvelopeAccount } from './bank';
import { blockTotals, budgetLines, monthSummary } from './budget';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import type { BlockKey, BudgetData, Line } from './types';
import { rowTotal, yearLineDetails, yearView, type YearBlockId, type YearMode, type YearRow } from './yearView';

const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: 'Général', name: key, budget, actual: null, ...extra });

/** Budget started in 2027-01; January to March (March = current month) initialized; April initialized but in the future; 2027-05 not created. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2027-01';
  d.accounts = defaultBankAccounts('2027-01');
  d.envelopes = [{ id: 'vac', name: 'Vacances', hue: 40, openingCash: 0, accountId: 'acc-vac' }];
  d.accounts.push(newEnvelopeAccount('acc-vac', 'vac', 'Vacances', 40, 0, '2027-01'));
  const lines = [
    ln('sal', 'rev', 3000, { actual: 3000 }),
    ln('cre', 'cre', 200, { actual: 200 }),
    ln('loyer', 'fix', 900, { actual: 900 }),
    ln('cou', 'var', 300, { name: 'Courses', section: 'Quotidien', actual: 120 }),
    ln('lt', 'epa', 300, { name: 'Épargne LT', actual: 300 }),
    ln('etf', 'inv', 140, { name: 'ETF', actual: 140 }),
  ];
  for (const m of ['2027-01', '2027-02', '2027-03', '2027-04']) d.months[m] = { initialized: true, lines: lines.map(l => ({ ...l })), alloc: { vac: 200 }, transfersDone: {} };
  return d;
}

const TODAY = '2027-03';
const run = (d: BudgetData, mode: YearMode, today = TODAY) => yearView(d, new Ledger(d, today), 2027, mode, today);
const block = (v: ReturnType<typeof run>, id: YearBlockId) => v.blocks.find(b => b.id === id)!;
const row = (values: (number | null)[], total: YearRow['total'] = 'sum'): YearRow => ({ values, total, dashZero: false });

describe('vue annuelle : budgété (CA3, CA5)', () => {
  it('les blocs sont dans l’ordre, fixes et variables séparés (RG8, CA10)', () => {
    expect(run(started(), 'budget').blocks.map(b => b.id)).toEqual(['rev', 'cre', 'fix', 'var', 'pln', 'epa', 'env', 'inv']);
  });

  it('CA3 : le total d’un bloc égale le budget du mois', () => {
    const d = started();
    const v = run(d, 'budget');
    const lines = budgetLines(d, '2027-02');
    for (const id of ['rev', 'cre', 'fix', 'var', 'epa', 'inv'] as const) expect(block(v, id).values[1]).toBe(blockTotals(lines, id).budget);
    expect(block(v, 'env').values[1]).toBe(200);
  });

  it('CA5 / CA26 : un mois non initialisé est vide en budgété ; un mois futur initialisé affiche son budget', () => {
    const v = run(started(), 'budget');
    for (const i of [4, 11]) {
      expect(v.months[i].shown).toBe(false);
      for (const b of v.blocks) expect(b.values[i]).toBeNull();
      for (const r of Object.values(v.summary)) expect(r.values[i]).toBeNull();
    }
    expect(v.months[3].shown).toBe(true);
    expect(block(v, 'rev').values[3]).toBe(3000);
    expect(rowTotal(block(v, 'rev'), false)).toBe(12000);
    expect(v.months[4].caption).toBe('non init.');
    expect(v.months[2].caption).toBe('en cours');
  });

  it('un mois non initialisé non futur est vide en budgété, avec sa légende', () => {
    const d = started();
    delete d.months['2027-02'];
    const v = run(d, 'budget');
    expect(v.months[1]).toMatchObject({ shown: false, caption: 'non init.' });
    expect(block(v, 'rev').values.slice(0, 3)).toEqual([3000, null, 3000]);
  });

  it('récapitulatif : reste à placer, taux brut, épargne réelle absente (RG12)', () => {
    const d = started();
    const s = monthSummary(d, new Ledger(d, TODAY), '2027-01');
    const v = run(d, 'budget');
    expect(v.summary.remaining.values[0]).toBe(s.remaining);
    expect(v.summary.rate.values[0]).toBe(s.grossSavingsRate);
    expect(v.summary.grossSavings.values[0]).toBe(s.grossSavings);
    expect(v.summary.realSavings.values[0]).toBeNull();
    expect(v.summary.income.values[0]).toBe(s.income);
    expect(v.summary.expenses.values[0]).toBe(s.expenses);
  });

  it('revenus nuls : taux à 0 %', () => {
    const d = started();
    for (const l of d.months['2027-01'].lines) if (l.block === 'rev') l.budget = 0;
    expect(run(d, 'budget').summary.rate.values[0]).toBe(0);
  });
});

describe('vue annuelle : réel (CA4, CA6)', () => {
  it('CA4 : revenus, dépenses, épargne réelle, taux et total investi égalent monthSummary', () => {
    const d = started();
    const s = monthSummary(d, new Ledger(d, TODAY), '2027-02');
    const v = run(d, 'real');
    expect(v.summary.income.values[1]).toBe(blockTotals(budgetLines(d, '2027-02'), 'rev').actual);
    expect(v.summary.expenses.values[1]).toBe(s.expensesReal);
    expect(v.summary.realSavings.values[1]).toBe(s.realSavings);
    expect(v.summary.rate.values[1]).toBe(s.savingsRate);
    expect(v.summary.investTotal.values[1]).toBe(s.investTotal);
    expect(v.summary.remaining.values[1]).toBe(s.availableReal);
    expect(block(v, 'var').values[1]).toBe(120);
  });

  it('les dépenses réelles incluent les dépenses financées par l’épargne (RG11)', () => {
    const d = started();
    d.transactions.push({ id: 't1', month: '2027-02', day: 3, label: 'Dentiste', amount: 80, type: 'epd', target: 'lt' });
    const s = monthSummary(d, new Ledger(d, TODAY), '2027-02');
    expect(run(d, 'real').summary.expenses.values[1]).toBe(s.expensesReal);
    expect(s.fundedBySavings).toBe(80);
  });

  it('CA6 / CA26 : un mois futur, même initialisé, est nul en réel', () => {
    const v = run(started(), 'real');
    for (const b of v.blocks) expect(b.values[3]).toBeNull();
    expect(v.summary.rate.values[3]).toBeNull();
  });

  it('CA25 : un mois avant le premier mois du budget est nul, exclu des totaux, avec sa légende', () => {
    const d = started();
    d.firstMonth = '2027-02';
    const v = run(d, 'real');
    expect(v.months[0]).toMatchObject({ shown: false, caption: 'avant le début' });
    for (const b of v.blocks) expect(b.values[0]).toBeNull();
    for (const r of Object.values(v.summary)) expect(r.values[0]).toBeNull();
    expect(v.series.every(s => s.values[0] === null)).toBe(true);
    expect(rowTotal(block(v, 'rev'), true)).toBe(block(v, 'rev').values.filter(x => x !== null).reduce((a, b) => a! + b!, 0)! / 2);
  });

  it('CA28 : un reste à placer réel à 0 s’affiche 0 et compte ; non calculable, il est exclu', () => {
    const d = started();
    const v = run(d, 'real');
    const s = monthSummary(d, new Ledger(d, TODAY), '2027-01');
    expect(v.summary.remaining.dashZero).toBe(false);
    expect(v.summary.remaining.values[0]).toBe(s.availableReal);
    const r = { values: [0, 100, null, null, null, null, null, null, null, null, null, null], total: 'mean' as const, dashZero: false };
    expect(rowTotal(r, false)).toBe(50);
    const nul = { ...r, values: [null, 100, ...Array(10).fill(null)] };
    expect(rowTotal(nul, false)).toBe(100);
  });

  it('un mois non initialisé non futur affiche son réel (RG5)', () => {
    const d = started();
    delete d.months['2027-02'];
    const v = run(d, 'real');
    expect(v.months[1].shown).toBe(true);
    expect(block(v, 'rev').values[1]).toBe(0);
  });

  it('CA11 : une ligne par enveloppe, allocation en budgété, dépenses nettes en réel', () => {
    const d = started();
    d.transactions.push({ id: 'e1', month: '2027-02', day: 3, label: 'Hôtel', amount: 150, type: 'env', target: 'vac' });
    d.transactions.push({ id: 'e2', month: '2027-02', day: 4, label: 'Remboursement', amount: 40, type: 'envin', target: 'vac' });
    const env = (mode: YearMode) => block(run(d, mode), 'env');
    expect(env('budget').sections[0].lines).toHaveLength(1);
    expect(env('budget').sections[0].lines[0].values[1]).toBe(200);
    expect(env('real').sections[0].lines[0].values[1]).toBe(110);
    expect(env('real').values[1]).toBe(110);
    expect(monthSummary(d, new Ledger(d, TODAY), '2027-02').envelopeSpent).toBe(110);
  });
});

describe('vue annuelle : lignes (RG9, RG7, CA12)', () => {
  it('regroupe par section et nom, une ligne absente d’un mois est nulle (RG9)', () => {
    const d = started();
    d.months['2027-02'].lines.push(ln('ext', 'var', 50, { name: 'Sorties', section: 'Quotidien' }));
    const sections = block(run(d, 'budget'), 'var').sections;
    expect(sections.map(s => s.title)).toEqual(['Quotidien']);
    expect(sections[0].lines.map(l => l.name)).toEqual(['Courses', 'Sorties']);
    expect(sections[0].lines[1].values.slice(0, 4)).toEqual([null, 50, null, null]);
    expect(sections[0].lines[1].dashZero).toBe(true);
  });

  it('CA27 : ligne présente en mars et avril seulement : moyenne sur 2 mois, bloc moyenné sur les mois renseignés', () => {
    const d = started();
    for (const m of ['2027-03', '2027-04']) d.months[m].lines.push(ln('ext', 'var', 50, { name: 'Sorties', section: 'Quotidien' }));
    const v = run(d, 'budget');
    const l = block(v, 'var').sections[0].lines.find(x => x.name === 'Sorties')!;
    expect(l.values).toEqual([null, null, 50, 50, null, null, null, null, null, null, null, null]);
    expect(rowTotal(l, false)).toBe(100);
    expect(rowTotal(l, true)).toBe(50);
    expect(rowTotal(block(v, 'var'), true)).toBe(325);
  });

  it('CA12 : une valeur nulle d’une ligne se marque « — » (dashZero), pas celle d’un bloc', () => {
    const v = run(started(), 'budget');
    expect(block(v, 'var').sections[0].lines.every(l => l.dashZero)).toBe(true);
    expect(block(v, 'var').dashZero).toBe(false);
  });

  it('une ligne hors budget est exclue', () => {
    const d = started();
    d.accounts.push({ id: 'ext', name: 'Externe', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2027-01', inBudget: false, archived: false, kind: 'courant', openingConfirmed: true });
    d.months['2027-01'].lines.push(ln('x', 'var', 77, { name: 'Hors', accountId: 'ext' }));
    const names = block(run(d, 'budget'), 'var').sections.flatMap(s => s.lines.map(l => l.name));
    expect(names).not.toContain('Hors');
  });
});

describe('colonne Total / Moyenne (CA7, CA8)', () => {
  it('CA7 : total = somme des mois renseignés, moyenne = total / nombre de mois renseignés', () => {
    const r = row([100, null, 200, null, 300, null, null, null, null, null, null, null]);
    expect(rowTotal(r, false)).toBe(600);
    expect(rowTotal(r, true)).toBe(200);
  });

  it('CA7 : sur une vraie année à 3 mois', () => {
    const v = run(started(), 'real');
    const r = block(v, 'rev');
    expect(rowTotal(r, false)).toBe(9000);
    expect(rowTotal(r, true)).toBe(3000);
  });

  it('CA8 : aucun mois renseigné : nul', () => {
    const r = row(Array(12).fill(null));
    expect(rowTotal(r, false)).toBeNull();
    expect(rowTotal(r, true)).toBeNull();
  });

  it('reste à placer et taux : moyenne ; total investi : dernier mois renseigné (RG12)', () => {
    const r = row([10, 20, 30, null], 'mean');
    expect(rowTotal(r, false)).toBe(20);
    expect(rowTotal(row([10, 20, 30, null], 'last'), false)).toBe(30);
    expect(rowTotal(row([10, 20, 30, null], 'last'), true)).toBe(20);
  });

  it('année sans mois géré ou future : tout est nul, sans erreur', () => {
    const d = started();
    const v = yearView(d, new Ledger(d, TODAY), 2030, 'real', TODAY);
    expect(v.months.every(m => !m.shown)).toBe(true);
    expect(rowTotal(v.summary.income, false)).toBeNull();
    const empty = emptyData();
    expect(() => yearView(empty, new Ledger(empty, TODAY), 2027, 'budget', TODAY)).not.toThrow();
  });
});

describe('objectif de taux d’épargne (CA13, RG13)', () => {
  it('le premier objectif de taux créé de l’année donne l’objectif', () => {
    const d = started();
    d.goals = [
      { id: 'a', year: 2027, kind: 'amount', name: 'A', target: 5000, position: 0 },
      { id: 'b', year: 2027, kind: 'rate', name: 'B', target: 60, position: 2 },
      { id: 'c', year: 2027, kind: 'rate', name: 'C', target: 30, position: 1 },
      { id: 'd', year: 2026, kind: 'rate', name: 'D', target: 10, position: 0 },
    ];
    expect(run(d, 'budget').rateTarget).toBe(30);
  });

  it('sans objectif de taux : nul', () => {
    expect(run(started(), 'budget').rateTarget).toBeNull();
  });
});

describe('séries, cartes et camembert (RG19 à RG22, CA17, CA18, CA20, CA23)', () => {
  const withPlanned = () => {
    const d = started();
    d.planned.push(
      { id: 'p1', year: 2027, month: 0, label: 'Voyage', amount: 100, envelopeId: 'vac' },
      { id: 'p2', year: 2027, month: 1, label: 'Voyage', amount: 50, envelopeId: 'vac' },
      { id: 'p3', year: 2026, month: 0, label: 'Ancien', amount: 999, envelopeId: 'vac' },
    );
    return d;
  };

  it('CA18 : les dépenses prévues forment un bloc dépliable, entre variables et épargnes', () => {
    const v = run(withPlanned(), 'budget');
    expect(v.blocks.map(b => b.id)).toEqual(['rev', 'cre', 'fix', 'var', 'pln', 'epa', 'env', 'inv']);
    const pln = block(v, 'pln');
    expect(pln.values.slice(0, 5)).toEqual([100, 50, 0, 0, null]);
    expect(pln.sections[0].lines.map(l => l.name)).toEqual(['Voyage']);
    expect(pln.sections[0].lines[0].values.slice(0, 3)).toEqual([100, 50, null]);
  });

  it('les dépenses prévues sont les mêmes en réel, mois futurs exclus', () => {
    const v = run(withPlanned(), 'real');
    expect(block(v, 'pln').values.slice(0, 4)).toEqual([100, 50, 0, null]);
  });

  it('CA17 / CA18 : cartes budgétées, dépenses prévues comprises', () => {
    const k = run(withPlanned(), 'budget').kpis;
    // 4 mois initialisés : revenus 3000, dépenses 200 + 900 + 300 par mois, prévues 150, épargne brute = épargnes + investissements + enveloppes.
    expect(k.income).toBe(12000);
    expect(k.incomeMean).toBe(3000);
    expect(k.planned).toBe(150);
    expect(k.expenses).toBe(4 * 1400 + 150);
    const gross = monthSummary(started(), new Ledger(started(), TODAY), '2027-01').grossSavings;
    expect(k.savings).toBe(4 * gross);
    expect(k.savingsPct).toBe(Math.round(((4 * gross) / 12000) * 10000) / 100);
    expect(k.left).toBe(12000 - k.expenses! - k.savings!);
  });

  it('CA17 : en réel, l’épargne est l’épargne réelle', () => {
    const d = started();
    const v = run(d, 'real');
    const s = monthSummary(d, new Ledger(d, TODAY), '2027-01');
    expect(v.series.find(x => x.id === 'sav')!.values[0]).toBe(s.realSavings);
    expect(v.kpis.income).toBe(9000);
  });

  it('CA20 : six parts, dans l’ordre, dont la somme vaut les revenus tant que le reste est positif', () => {
    const v = run(withPlanned(), 'budget');
    expect(v.pie.map(p => p.id)).toEqual(['cre', 'fix', 'var', 'pln', 'sav', 'left']);
    expect(v.kpis.left!).toBeGreaterThanOrEqual(0);
    expect(Math.round(v.pie.reduce((a, p) => a + p.amount, 0) * 100) / 100).toBe(v.kpis.income);
    expect(v.pie.find(p => p.id === 'cre')!.pct).toBe(Math.round(((4 * 200) / 12000) * 10000) / 100);
  });

  it('une part négative est listée à 0', () => {
    const d = started();
    for (const l of d.months['2027-01'].lines) if (l.block === 'rev') l.budget = 0;
    for (const m of ['2027-02', '2027-03', '2027-04']) for (const l of d.months[m].lines) if (l.block === 'rev') l.budget = 0;
    const v = run(d, 'budget');
    expect(v.kpis.left!).toBeLessThan(0);
    expect(v.pie.find(p => p.id === 'left')).toMatchObject({ amount: 0, pct: 0 });
  });

  it('CA23 : sans mois renseigné, cartes nulles et camembert vide, sans erreur', () => {
    const d = started();
    const v = yearView(d, new Ledger(d, TODAY), 2030, 'budget', TODAY);
    expect(v.hasData).toBe(false);
    expect(Object.values(v.kpis).every(x => x === null)).toBe(true);
    expect(v.pie).toEqual([]);
    expect(v.series).toHaveLength(6);
    expect(v.series.every(s => s.values.every(x => x === null))).toBe(true);
  });
});

describe('vue annuelle : Détails d’une ligne (clic droit)', () => {
  const tx = (id: string, month: string, day: number, target: string, detail?: string) =>
    ({ id, month, day, label: `Op ${id}`, amount: 45, type: 'fix', target, detail }) as BudgetData['transactions'][number];

  it('liste les champs détails des écritures de la ligne sur l’année, par date', () => {
    const d = started();
    d.transactions = [tx('b', '2027-02', 10, 'loyer', 'Régul. charges'), tx('a', '2027-01', 5, 'loyer', 'Janvier'), tx('c', '2027-01', 6, 'loyer'), tx('x', '2027-01', 7, 'cre', 'Autre ligne')];
    const text = yearLineDetails(d, 2027, 'fix', 'Général', 'loyer');
    expect(text.indexOf('Janvier')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Janvier')).toBeLessThan(text.indexOf('Régul. charges'));
    expect(text).not.toContain('Autre ligne');
    expect(text).toContain('Op c');
  });

  it('texte vide quand la ligne n’a aucune écriture', () => {
    expect(yearLineDetails(started(), 2027, 'fix', 'Général', 'loyer')).toBe('');
  });
});
