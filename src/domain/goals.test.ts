import { describe, expect, it } from 'vitest';
import { goalView, linearPlan, amountStatus, referenceMonth } from './goals';
import { monthSummary } from './budget';
import { emptyData } from './empty';
import { defaultBankAccounts } from './bank';
import { Ledger } from './ledger';
import type { BlockKey, BudgetData, Line } from './types';

const TODAY = '2027-08';

const ln = (key: string, block: BlockKey, budget: number, actual: number | null = null): Line => ({ key, block, section: '', name: key, budget, actual });

/** Budget started in 2027-01 with 8 initialized months (Jan. to Aug.), two savings lines and two investment lines, statements for each month. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2027-01';
  d.accounts = defaultBankAccounts('2027-01');
  const lines = [ln('sal', 'rev', 1000), ln('livret', 'epa', 100), ln('secours', 'epa', 50), ln('pea', 'inv', 200), ln('btc', 'inv', 20)];
  for (let i = 1; i <= 8; i++) {
    const m = `2027-${String(i).padStart(2, '0')}`;
    d.months[m] = { initialized: true, lines: lines.map(l => ({ ...l, actual: l.budget })), alloc: {}, transfersDone: {} };
  }
  d.template.lines = lines.map(({ actual: _a, ...l }) => l);
  d.settings = { emergencyAccounts: ['livret', 'secours'], emergencyTarget: 10000, investTarget: 20000, savingsRateTarget: 20 };
  return d;
}
const view = (d: BudgetData, id: 'emergency' | 'invest' | 'savings') => goalView(d, new Ledger(d, TODAY), id, TODAY)!;

describe('mois de référence (RG2)', () => {
  it('prend le dernier mois initialisé qui n’est pas dans le futur', () => {
    const d = started();
    expect(referenceMonth(d, TODAY)).toBe('2027-08');
    expect(referenceMonth(d, '2027-05')).toBe('2027-05');
    d.months['2027-12'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    expect(referenceMonth(d, TODAY)).toBe('2027-08');
  });

  it('à défaut, le premier mois géré ; null avant le premier mois', () => {
    const d = started();
    expect(referenceMonth(d, '2026-01')).toBe('2027-01');
    expect(referenceMonth(emptyData(), TODAY)).toBeNull();
  });
});

describe('valeur d’« Investir » (RG3, CA1, CA2)', () => {
  const invest = (d: BudgetData) => monthSummary(d, new Ledger(d, TODAY), '2027-08').investTotal;
  const all = (d: BudgetData) => {
    const l = new Ledger(d, TODAY);
    return (l.accMonth('pea', '2027-08')?.balance ?? 0) + (l.accMonth('btc', '2027-08')?.balance ?? 0);
  };

  it('CA1 : investAccounts absent = toutes les lignes inv', () => {
    const d = started();
    expect(all(d)).toBeGreaterThan(0);
    expect(invest(d)).toBe(all(d));
    expect(view(d, 'invest').current).toBe(all(d));
  });

  it('CA2 : une seule ligne cochée, la carte du Budget (monthSummary) et l’écran donnent la même valeur', () => {
    const d = started();
    d.settings.investAccounts = ['btc'];
    const btc = new Ledger(d, TODAY).accMonth('btc', '2027-08')!.balance;
    expect(invest(d)).toBe(btc);
    expect(view(d, 'invest').current).toBe(btc);
    expect(btc).toBeLessThan(all(d));
  });
});

describe('série réelle (RG8, CA3)', () => {
  it('pas de valeur avant le premier mois géré ni après le mois de référence', () => {
    const d = started();
    d.firstMonth = '2027-03';
    delete d.months['2027-01'];
    delete d.months['2027-02'];
    const g = view(d, 'emergency');
    expect(g.series.map(v => v !== null)).toEqual([false, false, true, true, true, true, true, true, false, false, false, false]);
  });

  it('un mois non initialisé interrompt la courbe', () => {
    const d = started();
    d.months['2027-04'].initialized = false;
    expect(view(d, 'emergency').series[3]).toBeNull();
    expect(view(d, 'emergency').series[4]).not.toBeNull();
  });

  it('somme des soldes de fin de mois des comptes cochés', () => {
    const d = started();
    const l = new Ledger(d, TODAY);
    const sum = (m: string) => (l.accMonth('livret', m)?.balance ?? 0) + (l.accMonth('secours', m)?.balance ?? 0);
    expect(view(d, 'emergency').series[2]).toBe(sum('2027-03'));
  });
});

describe('plan linéaire (RG9, RG10, CA4, CA6, CA7)', () => {
  const series = [9000, 9500, null, null, null, null, null, null, null, null, null, null];

  it('CA4 : linéaire du premier mois de l’année à l’échéance, plat ensuite', () => {
    const plan = linearPlan([9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000, 9000], 2027, 21000, '2028-01-31');
    expect(plan[0]).toBe(9000);
    expect(plan[6]).toBe(15000);
    expect(plan[11]).toBe(20000);
  });

  it('sans échéance ou échéance avant le premier mois : pas de plan', () => {
    expect(linearPlan(series, 2027, 21000, undefined).every(v => v === null)).toBe(true);
    expect(linearPlan(series, 2027, 21000, '2026-12-31').every(v => v === null)).toBe(true);
  });

  it('le plan commence au premier mois avec une donnée', () => {
    const plan = linearPlan([null, null, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], 2027, 200, '2027-12-01');
    expect(plan[1]).toBeNull();
    expect(plan[2]).toBe(100);
    expect(plan[11]).toBe(200);
  });

  it('CA4 : « Prévu à ce jour » = plan au mois de référence, limité à la cible', () => {
    const d = started();
    d.settings.emergencyDue = '2027-09-30';
    const g = view(d, 'emergency');
    expect(g.planned).toBe(g.plan[7]);
    expect(g.planned).toBeLessThanOrEqual(g.target);
    d.settings.emergencyTarget = 1;
    expect(view(d, 'emergency').planned).toBe(1);
  });

  it('CA6 : sans échéance, prévu, écart et mensualité valent null (« — »)', () => {
    const g = view(started(), 'emergency');
    expect(g.planned).toBeNull();
    expect(g.gap).toBeNull();
    expect(g.perMonth).toBeNull();
  });

  it('CA7 : échéance dépassée, le reste se divise sur 1 mois', () => {
    const d = started();
    d.settings.emergencyDue = '2027-02-28';
    const g = view(d, 'emergency');
    expect(g.perMonth).toBe(g.left);
  });

  it('mensualité = reste / mois restants jusqu’à l’échéance', () => {
    const d = started();
    d.settings.emergencyDue = '2027-12-31';
    const g = view(d, 'emergency');
    expect(g.perMonth).toBe(Math.round((g.left / 4) * 100) / 100);
  });
});

describe('statut (RG11, CA5)', () => {
  it('atteint, en bonne voie, en progression, à rattraper', () => {
    expect(amountStatus(21000, 21000, 14000)).toBe('Atteint');
    expect(amountStatus(14000, 21000, 14000)).toBe('En bonne voie');
    expect(amountStatus(13950, 21000, 14000)).toBe('En progression');
    expect(amountStatus(11900, 21000, 14000)).toBe('En progression');
    expect(amountStatus(11800, 21000, 14000)).toBe('À rattraper');
  });

  it('sans plan : en progression', () => {
    expect(amountStatus(100, 21000, null)).toBe('En progression');
  });

  it('la valeur 13 950 sur un prévu de 14 000 est « En progression » (ratio 0,996)', () => {
    expect(amountStatus(13950, 21000, 14000)).toBe('En progression');
  });
});

describe('taux d’épargne (RG4, RG13, CA8)', () => {
  it('moyenne, mois au-dessus de la cible et écart en points', () => {
    const d = started();
    d.settings.savingsRateTarget = 20;
    // Revenus 1000 : épargne budgétée 370 (37 %) chaque mois ; on fait varier les revenus pour avoir des taux différents.
    for (let i = 1; i <= 8; i++) d.months[`2027-${String(i).padStart(2, '0')}`].lines[0].budget = i <= 4 ? 1000 : 3000;
    const l = new Ledger(d, TODAY);
    const rates = Array.from({ length: 8 }, (_, i) => monthSummary(d, l, `2027-${String(i + 1).padStart(2, '0')}`).savingsRate);
    const g = view(d, 'savings');
    expect(g.series.slice(0, 8)).toEqual(rates);
    expect(g.series.slice(8).every(v => v === null)).toBe(true);
    expect(g.monthsKnown).toBe(8);
    expect(g.monthsAbove).toBe(rates.filter(r => r >= 20).length);
    expect(g.monthsAbove).toBeLessThan(8);
    expect(g.average).toBeCloseTo(rates.reduce((a, b) => a + b, 0) / 8, 6);
    expect(g.current).toBe(rates[7]);
    expect(g.rateGap).toBeCloseTo(rates[7] - 20, 6);
    expect(g.status).toBe(rates[7] >= 20 ? 'Atteint' : 'À rattraper');
    expect(g.plan.every(v => v === null)).toBe(true);
  });
});

describe('état « À définir » (RG14)', () => {
  it('cible à 0 : pas de pourcentage ni de stats', () => {
    const d = started();
    d.settings.emergencyTarget = 0;
    const g = view(d, 'emergency');
    expect(g.status).toBe('À définir');
    expect(g.defined).toBe(false);
    expect(g.pct).toBe(0);
    expect(g.planned).toBeNull();
  });

  it('aucune puce cochée : à définir, les comptes restent listés', () => {
    const d = started();
    d.settings.emergencyAccounts = [];
    const g = view(d, 'emergency');
    expect(g.status).toBe('À définir');
    expect(g.accounts.length).toBe(4);
    expect(g.accounts.every(a => !a.checked)).toBe(true);
  });

  it('le taux d’épargne à 0 est à définir', () => {
    const d = started();
    d.settings.savingsRateTarget = 0;
    expect(view(d, 'savings').status).toBe('À définir');
  });
});

describe('pourcentage et reste (RG12)', () => {
  it('plafonné à 100 %, reste jamais négatif', () => {
    const d = started();
    d.settings.emergencyTarget = 1;
    const g = view(d, 'emergency');
    expect(g.pct).toBe(100);
    expect(g.left).toBe(0);
    expect(g.status).toBe('Atteint');
  });
});

describe('nom de la carte (RG1)', () => {
  it('virgule décimale française : « Investir 12,5K »', () => {
    const d = started();
    d.settings.investTarget = 12500;
    expect(view(d, 'invest').name).toBe('Investir 12,5K');
  });

  it('« Investir <cible/1000>K »', () => {
    expect(view(started(), 'invest').name).toBe('Investir 20K');
  });
});
