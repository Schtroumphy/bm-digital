import { describe, expect, it } from 'vitest';
import { categoryIndicators, referenceMonths, variation } from './categoryIndicators';
import { withDefaultCategories } from './categories';
import { emptyData } from './empty';
import type { BudgetData, Transaction } from './types';

/* Spec 0052 : indicateurs des catégories. */

const TODAY = '2026-11';
/** Date du jour postérieure au mois affiché (2026-11) : un mois terminé, donc avec écart à la moyenne (RG20 : le mois en cours n'en a pas). */
const AFTER = '2026-12';
const ALI = 'cat-alimentation';
const LOG = 'cat-logement';
const LOI = 'cat-loisirs';

let seq = 0;
function data(...txs: Partial<Transaction>[]): BudgetData {
  const d = withDefaultCategories(emptyData());
  for (const t of txs) d.transactions.push({ id: `t${++seq}`, month: '2026-10', day: 5, label: 'x', amount: 0, type: 'var', target: 'courses', ...t });
  return d;
}

describe('mois de référence (RG1, CA1 à CA3)', () => {
  it('CA1 : mois affiché 2026-11, date du jour en 2026-11 → janvier à octobre', () => {
    expect(referenceMonths('2026-11', TODAY)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  });
  it('CA2 : mars affiché → janvier et février seulement', () => {
    expect(referenceMonths('2026-03', TODAY)).toEqual(['2026-01', '2026-02']);
  });
  it('CA3 : mois futur → mois passés de son année ; année future → vide', () => {
    expect(referenceMonths('2026-12', TODAY)).toHaveLength(10);
    expect(referenceMonths('2027-03', TODAY)).toEqual([]);
  });
  it('janvier de l’année en cours → aucune référence', () => {
    expect(referenceMonths('2026-01', '2026-01')).toEqual([]);
  });
});

describe('écart (RG5, CA6, CA7)', () => {
  it('au-dessus : +85 € et +21,3 %', () => {
    const v = variation(485, 400);
    expect(v.delta).toBe(85);
    expect(v.percent).toBeCloseTo(21.25, 2);
  });
  it('en dessous : −60 € et −60 %', () => {
    expect(variation(40, 100)).toEqual({ delta: -60, percent: -60, isNew: false });
  });
  it('moyenne 0 et montant > 0 : « nouveau », pas de %', () => {
    expect(variation(50, 0)).toEqual({ delta: 50, percent: null, isNew: true });
  });
  it('les deux à 0 : écart 0, pas de %, pas « nouveau »', () => {
    expect(variation(0, 0)).toEqual({ delta: 0, percent: null, isNew: false });
  });
});

describe('moyenne (RG2, CA4)', () => {
  it('300 € en janvier, 0 en février et mars → 100 € sur 3 mois de référence', () => {
    const d = data({ month: '2026-01', amount: 300, categoryId: ALI });
    const r = categoryIndicators(d, '2026-04', '2026-04');
    expect(r.reference).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(r.rows.find(x => x.category?.id === ALI)!.average).toBe(100);
  });
});

describe('sans référence (RG4, CA5)', () => {
  it('ni moyenne ni écart, mais montants et tendance présents ; tri par montant', () => {
    const d = data({ month: '2026-01', amount: 10, categoryId: LOG }, { month: '2026-01', amount: 30, categoryId: ALI });
    const r = categoryIndicators(d, '2026-01', '2026-01');
    expect(r.reference).toEqual([]);
    expect(r.rows.map(x => [x.category!.id, x.average, x.variation])).toEqual([[ALI, null, null], [LOG, null, null]]);
    expect(r.rows[0].trend).toHaveLength(6);
    expect(r.summary).toMatchObject({ total: 40, average: null, variation: null, topRise: null, topFall: null });
  });
});

describe('lignes et tri (RG7, RG8, CA8, CA9)', () => {
  const d = data(
    { month: '2026-09', amount: 300, categoryId: ALI },
    { month: '2026-10', amount: 100, categoryId: ALI },
    { month: '2026-09', amount: 100, categoryId: LOI }, // moyenne 50, 0 ce mois-ci
    { month: '2026-10', amount: 700, categoryId: LOG },
    { month: '2026-11', amount: 485, categoryId: ALI },
    { month: '2026-11', amount: 120 }, // sans catégorie
    { month: '2026-11', amount: 700, categoryId: LOG },
  );
  const r = categoryIndicators(d, '2026-11', AFTER);

  it('une catégorie habituelle à 0 ce mois-ci est listée avec un écart négatif ; une catégorie à 0 partout est absente', () => {
    const loisirs = r.rows.find(x => x.category?.id === LOI)!;
    expect(loisirs.amount).toBe(0);
    expect(loisirs.variation!.delta).toBeLessThan(0);
    expect(r.rows.find(x => x.category?.id === 'cat-transport')).toBeUndefined();
  });
  it('tri par écart décroissant, « Sans catégorie » en dernier', () => {
    const deltas = r.rows.filter(x => x.category).map(x => x.variation!.delta);
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
    expect(r.rows[r.rows.length - 1].category).toBeNull();
  });
  it('à écart égal, ordre alphabétique', () => {
    const e = data({ month: '2026-11', amount: 50, categoryId: LOG }, { month: '2026-11', amount: 50, categoryId: ALI });
    expect(categoryIndicators(e, '2026-11', AFTER).rows.map(x => x.category!.name)).toEqual(['Alimentation', 'Logement']);
  });
});

describe('mêmes règles que « Répartition » (RG3, CA10)', () => {
  it('hors budget, type non catégorisable (envin) et autre mois sont ignorés', () => {
    const d = data(
      { month: '2026-10', amount: 100, categoryId: ALI },
      { month: '2026-10', amount: 70, categoryId: ALI, offBudget: true },
      { month: '2026-10', amount: 40, type: 'envin' },
      { month: '2026-09', amount: 500, categoryId: ALI },
    );
    const r = categoryIndicators(d, '2026-10', TODAY);
    const row = r.rows.find(x => x.category?.id === ALI)!;
    expect(row.amount).toBe(100);
    expect(r.summary.total).toBe(100);
  });
});

describe('bandeau (RG10, CA11)', () => {
  const d = data(
    { month: '2026-10', amount: 100, categoryId: ALI },
    { month: '2026-10', amount: 200, categoryId: LOI },
    { month: '2026-11', amount: 300, categoryId: ALI },
    { month: '2026-11', amount: 5, categoryId: LOI },
    { month: '2026-11', amount: 120 },
    { month: '2026-11', amount: 30 },
  );
  const r = categoryIndicators(d, '2026-11', AFTER);

  it('total contre moyenne, plus forte hausse, plus forte baisse, sans catégorie', () => {
    expect(r.summary.total).toBe(455);
    expect(r.summary.average).toBe(30); // (100 + 200) / 10 mois de référence
    expect(r.summary.variation!.delta).toBe(425);
    expect(r.summary.topRise!.category!.id).toBe(ALI);
    expect(r.summary.topFall!.category!.id).toBe(LOI);
    expect(r.summary.uncategorizedAmount).toBe(150);
    expect(r.summary.uncategorizedCount).toBe(2);
  });
  it('« Sans catégorie » ne participe ni à la hausse ni à la baisse', () => {
    const e = data({ month: '2026-11', amount: 900 });
    const s = categoryIndicators(e, '2026-11', AFTER).summary;
    expect(s.topRise).toBeNull();
    expect(s.topFall).toBeNull();
  });
});

describe('égalité d’écart et mois vide avec référence (RG10, RG12)', () => {
  it('à écart égal, plus forte hausse et plus forte baisse suivent l’ordre alphabétique', () => {
    const up = data({ month: '2026-11', amount: 50, categoryId: LOG }, { month: '2026-11', amount: 50, categoryId: ALI });
    expect(categoryIndicators(up, '2026-11', AFTER).summary.topRise!.category!.name).toBe('Alimentation');
    const down = data({ month: '2026-10', amount: 100, categoryId: LOG }, { month: '2026-10', amount: 100, categoryId: ALI });
    expect(categoryIndicators(down, '2026-11', AFTER).summary.topFall!.category!.name).toBe('Alimentation');
  });
  it('une référence existe mais tout vaut 0 : vide', () => {
    const r = categoryIndicators(data(), '2026-11', TODAY);
    expect(r.reference).toHaveLength(10);
    expect(r.empty).toBe(true);
  });
});

describe('tendance (RG9, CA12)', () => {
  it('6 mois se terminant au mois affiché, à cheval sur l’année précédente, zéros inclus', () => {
    const d = data({ month: '2025-12', amount: 20, categoryId: ALI }, { month: '2026-02', amount: 60, categoryId: ALI });
    const r = categoryIndicators(d, '2026-02', TODAY);
    expect(r.trendMonths).toEqual(['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
    expect(r.rows.find(x => x.category?.id === ALI)!.trend).toEqual([0, 0, 0, 20, 0, 60]);
  });
  it('pas de point pour un mois futur', () => {
    const d = data({ month: '2026-10', amount: 20, categoryId: ALI });
    const r = categoryIndicators(d, '2026-12', TODAY);
    expect(r.rows.find(x => x.category?.id === ALI)!.trend).toEqual([0, 0, 0, 20, 0, null]);
    expect(r.trendMonths).toEqual(['2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']);
  });
});

describe('mois vide (RG12)', () => {
  it('aucune dépense et aucune référence → vide', () => {
    expect(categoryIndicators(data(), '2027-03', TODAY).empty).toBe(true);
  });
});

describe('budgets (spec 0054)', () => {
  const withBudget = (...txs: Partial<Transaction>[]) => {
    const d = data(...txs);
    d.categoryBudgets = [{ categoryId: ALI, month: '2026-10', amount: 400 }];
    return d;
  };
  const rowOf = (r: ReturnType<typeof categoryIndicators>, id: string | null) => r.rows.find(x => (x.category?.id ?? null) === id)!;

  it('CA1 : sans budget pour le mois, budget et écart sont absents (pas 0)', () => {
    const r = categoryIndicators(data({ amount: 50, categoryId: ALI }), '2026-10', TODAY, true);
    expect(rowOf(r, ALI).budget).toBeNull();
    expect(rowOf(r, ALI).budgetGap).toBeNull();
  });
  it('CA2 : budget 400, réel 420 → +20', () => {
    const r = categoryIndicators(withBudget({ amount: 420, categoryId: ALI }), '2026-10', TODAY, true);
    expect(rowOf(r, ALI).budget).toBe(400);
    expect(rowOf(r, ALI).budgetGap?.delta).toBe(20);
  });
  it('CA3 : budget 0, réel 50 → +50 sans pourcentage', () => {
    const d = data({ amount: 50, categoryId: ALI });
    d.categoryBudgets = [{ categoryId: ALI, month: '2026-10', amount: 0 }];
    expect(rowOf(categoryIndicators(d, '2026-10', TODAY, true), ALI).budgetGap).toEqual({ delta: 50, percent: null });
  });
  it('CA9 : catégorie avec budget sans dépense : listée avec réel 0 si demandé, absente sinon', () => {
    const d = withBudget({ amount: 50, categoryId: LOG });
    const on = categoryIndicators(d, '2026-10', TODAY, true);
    expect(rowOf(on, ALI).amount).toBe(0);
    expect(rowOf(on, ALI).budgetGap?.delta).toBe(-400);
    const off = categoryIndicators(d, '2026-10', TODAY);
    expect(off.rows.some(x => x.category?.id === ALI)).toBe(false);
    expect(off.rows.every(x => x.budget === null && x.budgetGap === null)).toBe(true);
  });
  it('« Sans catégorie » n’a jamais de budget (RG2)', () => {
    expect(rowOf(categoryIndicators(withBudget({ amount: 50 }), '2026-10', TODAY, true), null).budget).toBeNull();
  });
  it('mois sans dépense : vide sans budget demandé, tableau avec budget demandé (RG11)', () => {
    expect(categoryIndicators(withBudget(), '2026-10', TODAY).empty).toBe(true);
    expect(categoryIndicators(withBudget(), '2026-10', TODAY, true).empty).toBe(false);
  });
});

describe('mois en cours (spec 0054, RG20 à RG22)', () => {
  const d = data(
    { month: '2026-10', amount: 100, categoryId: ALI },
    { month: '2026-10', amount: 200, categoryId: LOI },
    { month: '2026-11', amount: 300, categoryId: ALI },
    { month: '2026-11', amount: 5, categoryId: LOI },
  );
  d.categoryBudgets = [{ categoryId: ALI, month: '2026-11', amount: 250 }];

  it('CA27 : today = mois affiché → aucun écart à la moyenne (lignes et total), montant et moyenne fournis', () => {
    const r = categoryIndicators(d, '2026-11', '2026-11');
    expect(r.isCurrent).toBe(true);
    for (const row of r.rows) {
      expect(row.variation).toBeNull();
      expect(row.average).not.toBeNull();
    }
    expect(r.rows.find(x => x.category?.id === ALI)!.amount).toBe(300);
    expect(r.summary.variation).toBeNull();
    expect(r.summary.average).toBe(30);
    expect(r.summary.total).toBe(305);
  });
  it('CA28 : plus forte hausse et plus forte baisse vides', () => {
    const s = categoryIndicators(d, '2026-11', '2026-11').summary;
    expect(s.topRise).toBeNull();
    expect(s.topFall).toBeNull();
  });
  it('CA29 : mois passé ou futur inchangés (écarts, hausse, baisse)', () => {
    const past = categoryIndicators(d, '2026-11', AFTER);
    expect(past.isCurrent).toBe(false);
    expect(past.summary.variation).not.toBeNull();
    expect(past.summary.topRise!.category!.id).toBe(ALI);
    expect(past.summary.topFall!.category!.id).toBe(LOI);
    const future = categoryIndicators(d, '2026-11', '2026-10');
    expect(future.isCurrent).toBe(false);
    expect(future.rows.every(x => x.variation !== null || x.average === null)).toBe(true);
  });
  it('CA30 : l’écart budget reste fourni pour le mois en cours', () => {
    const r = categoryIndicators(d, '2026-11', '2026-11', true);
    expect(r.rows.find(x => x.category?.id === ALI)!.budgetGap?.delta).toBe(50);
  });
});
