import { describe, expect, it } from 'vitest';
import { defaultBankAccounts, newEnvelopeAccount } from './bank';
import { envelopeAlerts, lineRemaining, monthSummary, variableRemaining } from './budget';
import { dashboardView, monthTransfers } from './dashboard';
import { emptyData } from './empty';
import { goalView } from './goals';
import { seedData } from './seed';
import { Ledger } from './ledger';
import type { BlockKey, BudgetData, Line } from './types';

const TODAY = '2027-03-15';
const M = '2027-03';

const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

/** Started in 2027-01, March initialized with income, an expense, savings and investment lines, and two envelopes. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2027-01';
  d.accounts = defaultBankAccounts('2027-01');
  d.envelopes = [
    { id: 'vac', name: 'Vacances', hue: 40, openingCash: 0, accountId: 'acc-vac' },
    { id: 'san', name: 'Santé', hue: 90, openingCash: 0, accountId: 'acc-san' },
  ];
  d.accounts.push(newEnvelopeAccount('acc-vac', 'vac', 'Vacances', 40, 0, '2027-01'), newEnvelopeAccount('acc-san', 'san', 'Santé', 90, 0, '2027-01'));
  const lines = [
    ln('sal', 'rev', 3000),
    ln('loyer', 'fix', 900),
    ln('cou', 'var', 300, { name: 'Courses', actual: 120 }),
    ln('loi', 'var', 100, { name: 'Loisirs', actual: 130 }),
    ln('lt', 'epa', 300, { name: 'Épargne LT', dueDay: 5 }),
    ln('mt', 'epa', 100, { name: 'Épargne MT' }),
    ln('etf', 'inv', 140, { name: 'Placement ETF', dueDay: 28 }),
  ];
  for (const m of ['2027-01', '2027-02', M]) {
    d.months[m] = { initialized: true, lines: lines.map(l => ({ ...l })), alloc: { vac: 200, san: 0 }, transfersDone: {} };
  }
  d.statements[M] = { lt: 5000 };
  d.settings = { emergencyAccounts: ['lt'], emergencyTarget: 10000, investTarget: 21000, savingsRateTarget: 20 };
  return d;
}
const view = (d: BudgetData) => dashboardView(d, new Ledger(d, '2027-03'), M, TODAY);


const todo = (d: BudgetData) => view(d).todo!;

describe('bandeau KPI (CA1, CA2)', () => {
  it('reprend les calculs existants du même mois', () => {
    const d = started();
    const ledger = new Ledger(d, '2027-03');
    const s = monthSummary(d, ledger, M);
    const k = view(d).kpis!;
    expect(k).toMatchObject({ remaining: s.remaining, income: s.income, expenses: s.expenses, grossSavings: s.grossSavings, realSavings: s.realSavings, savingsRate: s.savingsRate, savingsRateTarget: 20 });
    expect(k.variableRemaining).toBe(variableRemaining(d, M));
    expect(k.savingsVsGross).toBe(Math.round((s.realSavings - s.grossSavings) * 100) / 100);
  });

  it('le réel des revenus est la somme des réels des lignes rev', () => {
    const d = started();
    d.months[M].lines.find(l => l.key === 'sal')!.actual = 2950;
    expect(view(d).kpis!.incomeActual).toBe(2950);
  });

  it('revenus à 0 : taux à 0 % et donut vide', () => {
    const d = started();
    for (const l of d.months[M].lines) if (l.block === 'rev') l.budget = 0;
    const v = view(d);
    expect(v.kpis!.savingsRate).toBe(0);
    expect(v.donut!.slices.every(x => !x.drawn && x.pct === null)).toBe(true);
  });
});

describe('donut (CA3)', () => {
  it('sept parts dans l’ordre de la légende, % rapportés aux revenus', () => {
    const d = started();
    const v = view(d);
    expect(v.donut!.slices.map(x => x.id)).toEqual(['cre', 'var', 'epa', 'remaining', 'fix', 'env', 'inv']);
    const by = Object.fromEntries(v.donut!.slices.map(x => [x.id, x]));
    expect(v.donut!.income).toBe(3000);
    expect(by.var.amount).toBe(400);
    expect(by.fix.amount).toBe(900);
    expect(by.epa.amount).toBe(400);
    expect(by.inv.amount).toBe(140);
    expect(by.env.amount).toBe(200);
    expect(by.remaining.amount).toBe(v.kpis!.remaining);
    expect(by.fix.pct).toBe(30);
    expect(v.donut!.slices.reduce((a, x) => a + x.amount, 0)).toBe(3000);
  });

  it('un reste à placer négatif n’est pas dessiné mais reste dans la légende', () => {
    const d = started();
    d.months[M].lines.find(l => l.key === 'loyer')!.budget = 5000;
    const r = view(d).donut!.slices.find(x => x.id === 'remaining')!;
    expect(r.amount).toBeLessThan(0);
    expect(r.drawn).toBe(false);
    expect(r.pct).not.toBeNull();
  });
});

describe('dépenses variables (CA4)', () => {
  it('une rangée par ligne var avec part consommée plafonnée et restant signé', () => {
    const d = started();
    const v = view(d).variables!;
    expect(v.budget).toBe(400);
    expect(v.remaining).toBe(variableRemaining(d, M));
    expect(v.rows.map(r => [r.key, r.consumed, r.remaining])).toEqual([
      ['cou', 40, 180],
      ['loi', 100, -30],
    ]);
    expect(v.rows[1].remaining).toBe(lineRemaining(d.months[M].lines.find(l => l.key === 'loi')!));
  });

  it('une ligne hors budget n’y figure pas', () => {
    const d = started();
    d.accounts.push({ id: 'off', name: 'Hors', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2027-01', inBudget: false, archived: false });
    d.months[M].lines.find(l => l.key === 'loi')!.accountId = 'off';
    const v = view(d).variables!;
    expect(v.rows.map(r => r.key)).toEqual(['cou']);
    expect(v.budget).toBe(300);
  });
});

describe('enveloppes (CA5)', () => {
  it('solde cumulé, alloué du mois et part consommée', () => {
    const d = started();
    d.months['2027-02'].alloc = { vac: 600, san: 0 };
    const ledger = new Ledger(d, '2027-03');
    const e = view(d).envelopes!;
    expect(e.allocated).toBe(200);
    const vac = ledger.envMonth('vac', M)!.balance;
    const san = ledger.envMonth('san', M)!.balance;
    expect(e.total).toBe(vac + san);
    for (const r of e.rows) {
      const em = ledger.envMonth(r.id, M)!;
      // Provision: spent against the starting balance (previous balance + money really in on the account), cash included.
      expect(r.remaining).toBe(Math.round((r.start - em.spent) * 100) / 100);
      expect(r.consumed).toBe(r.start > 0 ? Math.min(100, (em.spent / r.start) * 100) : em.spent > 0 ? 100 : 0);
    }
  });

  it('aucune enveloppe : liste vide', () => {
    const d = started();
    d.envelopes = [];
    expect(view(d).envelopes).toMatchObject({ rows: [], total: 0 });
  });
});

describe('dépenses prévues sur l’année (CA6)', () => {
  it('12 mois, total, moyenne sur 12 et mois choisi repéré', () => {
    const d = started();
    d.planned.push(
      { id: 'a', year: 2027, month: 0, label: 'A', amount: 120, envelopeId: 'vac' },
      { id: 'b', year: 2027, month: 0, label: 'B', amount: 30, envelopeId: 'san' },
      { id: 'c', year: 2027, month: 2, label: 'C', amount: 210, envelopeId: 'vac' },
      { id: 'd', year: 2026, month: 5, label: 'Autre année', amount: 999, envelopeId: 'vac' },
    );
    const y = view(d).yearly!;
    expect(y.year).toBe(2027);
    expect(y.months).toHaveLength(12);
    expect(y.months[0].amount).toBe(150);
    expect(y.months[2]).toEqual({ month: 2, amount: 210, selected: true });
    expect(y.months.filter(m => m.selected)).toHaveLength(1);
    expect(y.total).toBe(360);
    expect(y.average).toBe(30);
  });
});

describe('à faire : alertes (CA7)', () => {
  it('une dépense prévue supérieure au disponible donne une alerte avec le prévu et le manque', () => {
    const d = started();
    d.planned.push({ id: 'p1', year: 2027, month: 2, label: 'Voyage', amount: 5000, envelopeId: 'vac' });
    const ledger = new Ledger(d, '2027-03');
    const expected = envelopeAlerts(d, ledger, 2027, 2);
    expect(expected).toHaveLength(1);
    expect(todo(d).alerts).toEqual([{ envelopeId: 'vac', envelopeName: 'Vacances', label: 'Voyage', planned: 5000, missing: expected[0].missing }]);
  });

  it('plusieurs dépenses prévues : le nom de l’enveloppe', () => {
    const d = started();
    d.planned.push({ id: 'p1', year: 2027, month: 2, label: 'A', amount: 4000, envelopeId: 'vac' }, { id: 'p2', year: 2027, month: 2, label: 'B', amount: 4000, envelopeId: 'vac' });
    expect(todo(d).alerts[0].label).toBe('Vacances');
  });

  it('sans alerte (ou dépense prévue couverte) : liste vide', () => {
    const d = started();
    expect(todo(d).alerts).toEqual([]);
    d.planned.push({ id: 'p1', year: 2027, month: 2, label: 'Voyage', amount: 50, envelopeId: 'vac' });
    expect(todo(d).alerts).toEqual([]);
  });
});

describe('à faire : virements (CA8)', () => {
  it('à effectuer = non pointés, triés par jour (sans jour en dernier), total et faits / total', () => {
    const d = started();
    d.months[M].checks = { lt: { doneOn: '2027-03-05' } };
    const t = todo(d);
    expect(t.transfers.map(x => [x.id, x.day, x.amount])).toEqual([
      ['etf', 28, 140],
      ['mt', undefined, 100],
      ['vac', undefined, 200],
    ]);
    expect(t.transfers.map(x => x.kind)).toEqual(['line', 'line', 'envelope']);
    expect(t.transfersTotal).toBe(440);
    expect([t.transfersDone, t.transfersAll]).toEqual([1, 4]);
  });

  it('une allocation pointée n’est plus à faire mais compte dans les faits', () => {
    const d = started();
    d.months[M].checks = { 'env:vac': { doneOn: '2027-03-01' } };
    const t = todo(d);
    expect(t.transfers.map(x => x.id)).toEqual(['lt', 'etf', 'mt']);
    expect([t.transfersDone, t.transfersAll]).toEqual([1, 4]);
  });

  it('seuls épargne, investissement et allocations : jamais les autres lignes', () => {
    const ids = todo(started()).transfers.map(x => x.id);
    expect(ids).not.toContain('sal');
    expect(ids).not.toContain('loyer');
    expect(ids).not.toContain('cou');
  });

  it('le montant compté est le réel s’il existe', () => {
    const d = started();
    d.months[M].lines.find(l => l.key === 'lt')!.actual = 250;
    expect(todo(d).transfers.find(x => x.id === 'lt')!.amount).toBe(250);
  });

  it('mode informatif, montant ou allocation à 0 : absents des virements et du total', () => {
    const d = started();
    const lines = d.months[M].lines;
    lines.find(l => l.key === 'mt')!.execMode = 'informatif';
    lines.find(l => l.key === 'etf')!.execMode = 'informatif';
    lines.find(l => l.key === 'lt')!.budget = 0;
    d.months[M].alloc.vac = 0;
    const t = todo(d);
    expect(t.transfers).toEqual([]);
    expect(t.transfersTotal).toBe(0);
    expect(t.transfersAll).toBe(0);
  });
});

// Une ligne d'épargne ou de placement est toujours dans le budget (isLineInBudget ne regarde le compte que pour revenus, fixes et crédits).

describe('retard', () => {
  it('jour prévu passé dans un mois non clôturé : en retard comme isLate', () => {
    const all = monthTransfers(started(), M, TODAY);
    expect(all.find(x => x.id === 'lt')!.late).toBe(true);
    expect(all.find(x => x.id === 'etf')!.late).toBe(false);
    expect(all.find(x => x.id === 'mt')!.late).toBe(false);
  });

  it('un mois clôturé : aucun retard', () => {
    const d = started();
    d.months['2027-02'].closed = true;
    expect(monthTransfers(d, '2027-02', TODAY).some(t => t.late)).toBe(false);
  });
});

describe('à faire : soldes à saisir', () => {
  it('lignes d’épargne et de placement sans solde saisi pour le mois', () => {
    const d = started();
    expect(todo(d).balancesToEnter).toEqual(['Épargne MT', 'Placement ETF']);
    d.statements[M].etf = 140;
    expect(todo(d).balancesToEnter).toEqual(['Épargne MT']);
  });
});

describe('Patrimoine et fonds de secours (CA11, CA12)', () => {
  it('patrimoine = épargnes + investissements, barre proportionnelle', () => {
    const d = started();
    const ledger = new Ledger(d, '2027-03');
    const w = view(d).wealth!;
    const bal = (k: string) => ledger.accMonth(k, M)?.balance ?? 0;
    expect(w.savings).toBe(Math.round((bal('lt') + bal('mt')) * 100) / 100);
    expect(w.invest).toBe(bal('etf'));
    expect(w.total).toBe(Math.round((w.savings + w.invest) * 100) / 100);
    expect(w.savingsShare).toBeCloseTo(w.savings / w.total, 10);
  });

  it('le fonds de secours reprend goalView (valeur, cible, reste)', () => {
    const d = started();
    const g = goalView(d, new Ledger(d, '2027-03'), 'emergency', '2027-03')!;
    const v = view(d).emergency!;
    expect([v.current, v.target, v.left, v.pct, v.status]).toEqual([g.current, g.target, g.left, g.pct, g.status]);
  });

  it('cible à 0 ou aucun compte coché : « À définir », sans barre', () => {
    const d = started();
    d.settings.emergencyAccounts = [];
    d.settings.savingsRateTarget = 0;
    const v = view(d);
    expect(v.emergency!.status).toBe('À définir');
    expect(v.emergency!.defined).toBe(false);
    expect(v.savings!.status).toBe('À définir');
  });

  it('les objectifs ne changent pas avec le mois choisi', () => {
    const d = started();
    const ledger = new Ledger(d, '2027-03');
    const a = dashboardView(d, ledger, '2027-01', TODAY);
    const b = dashboardView(d, ledger, M, TODAY);
    expect([a.emergency, a.invest, a.savings, a.wealth]).toEqual([b.emergency, b.invest, b.savings, b.wealth]);
  });
});

describe('mois non initialisé (RG2)', () => {
  it('pas de chiffres du mois, mais patrimoine, fonds de secours, objectifs et notes', () => {
    const d = started();
    d.months['2027-04'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, notes: [{ id: 'n', text: 'Note', done: true }] };
    const v = dashboardView(d, new Ledger(d, '2027-03'), '2027-04', TODAY);
    expect(v.initialized).toBe(false);
    expect([v.kpis, v.donut, v.variables, v.envelopes, v.yearly, v.todo]).toEqual([null, null, null, null, null, null]);
    expect(v.wealth).not.toBeNull();
    expect(v.emergency).not.toBeNull();
    expect(v.notes).toEqual({ items: [{ id: 'n', text: 'Note', done: true }], done: 1 });
  });

  it('avant le premier mois : ni patrimoine ni objectifs', () => {
    const d = emptyData();
    const v = dashboardView(d, new Ledger(d, '2027-03'), M, TODAY);
    expect([v.wealth, v.emergency]).toEqual([null, null]);
  });
});

describe('maquette : décembre 2026 des données d’exemple', () => {
  it('reprend les chiffres de la maquette qui sont des calculs du Budget', () => {
    const d = seedData();
    const v = dashboardView(d, new Ledger(d, '2026-12'), '2026-12', '2026-12-20');
    expect(v.kpis).toMatchObject({ remaining: 2950, income: 8000, grossSavings: 2060 });
    expect(v.donut!.slices.find(x => x.id === 'remaining')!.amount).toBe(2950);
    expect(v.donut!.slices.reduce((a, x) => a + x.amount, 0)).toBe(8000);
    expect(v.wealth!.invest).toBe(15219);
  });
});

describe('Évolution du patrimoine (spec 0030)', () => {
  const evo = (d: BudgetData) => view(d).wealthEvolution!;

  it('CA3, CA4 : variation signée et pourcentage, calculés sur deux fins de mois', () => {
    const d = started();
    d.statements['2027-02'] = { lt: 4000, mt: 1000, etf: 25000 };
    d.statements[M] = { lt: 4500, mt: 1000, etf: 25740 }; // 30 000 -> 31 240
    const e = evo(d);
    expect(e.previous).toBe('2027-02');
    expect(e.total).toBe(31240);
    expect(e.change!.total).toBe(1240);
    expect(e.pct).toBeCloseTo(4.133, 2);
    d.statements[M] = { lt: 4000, mt: 1000, etf: 24000 };
    expect(evo(d).change!.total).toBe(-1000);
    expect(evo(d).pct!).toBeLessThan(0);
  });

  it('CA5 : détail épargnes / investissements, la somme des variations égale la variation totale', () => {
    const d = started();
    d.statements['2027-02'] = { lt: 4000, mt: 1000, etf: 25000 };
    d.statements[M] = { lt: 4900, mt: 1000, etf: 25340 };
    const e = evo(d);
    expect(e.change).toEqual({ total: 1240, savings: 900, invest: 340 });
    expect(e.change!.savings + e.change!.invest).toBe(e.change!.total);
    expect([e.savings, e.invest]).toEqual([5900, 25340]);
  });

  it('CA6 : le total de fin de mois est celui du bloc « Patrimoine »', () => {
    const d = started();
    expect(evo(d).total).toBe(view(d).wealth!.total);
    expect(evo(d).month).toBe(M);
  });

  it('CA7 : premier mois du budget, pas de variation ni de pourcentage, sans erreur', () => {
    const d = started();
    d.firstMonth = M;
    const e = view(d).wealthEvolution!;
    expect([e.previous, e.change, e.pct]).toEqual([null, null, null]);
    expect(e.series.map(p => p.month)).toEqual([M]);
  });

  it('CA8 : patrimoine nul aux deux mois, variation 0 et pourcentage « — »', () => {
    const d = emptyData();
    d.firstMonth = '2027-02';
    d.accounts = defaultBankAccounts('2027-02');
    for (const m of ['2027-02', M]) d.months[m] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    const e = view(d).wealthEvolution!;
    expect(e.change).toEqual({ total: 0, savings: 0, invest: 0 });
    expect(e.pct).toBeNull();
  });

  it('CA9 : la courbe donne les 6 derniers mois (ou moins), le mois de référence en dernier', () => {
    const d = started();
    expect(evo(d).series.map(p => p.month)).toEqual(['2027-01', '2027-02', M]);
    expect(evo(d).series.at(-1)!.total).toBe(evo(d).total);
    d.firstMonth = '2026-06';
    expect(evo(d).series.map(p => p.month)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', M]);
  });

  it('RG7 : suit le mois de référence, pas le mois du sélecteur, même non initialisé', () => {
    const d = started();
    d.months['2027-04'] = { initialized: false, lines: [], alloc: {}, transfersDone: {} };
    const v = dashboardView(d, new Ledger(d, '2027-03'), '2027-04', TODAY);
    expect(v.wealthEvolution).toEqual(view(d).wealthEvolution);
  });

  it('avant le premier mois : aucune évolution', () => {
    const d = emptyData();
    expect(dashboardView(d, new Ledger(d, '2027-03'), M, TODAY).wealthEvolution).toBeNull();
  });
});
