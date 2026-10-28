import { describe, expect, it } from 'vitest';
import { amountStatus, capStatus, expenseLines, firstGoalOfKind, goalsOfYear, summaryGoals, goalView, goalYears, isGoalYearEditable, linearPlan, referenceMonth, referenceMonthOf, scopeInfo } from './goals';
import { monthSummary } from './budget';
import { defaultBankAccounts } from './bank';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import { syncLineActuals } from './lineActuals';
import type { BlockKey, BudgetData, Goal, Line, Transaction } from './types';

const TODAY = '2027-08';

const ln = (key: string, block: BlockKey, budget: number, actual: number | null = null, section = ''): Line => ({ key, block, section, name: key, budget, actual });
const goal = (g: Partial<Goal> & Pick<Goal, 'kind'>): Goal => ({ id: 'g1', year: 2027, name: 'Objectif', target: 10000, position: 0, ...g });

/** Budget started in 2027-01 with 8 initialized months (Jan. to Aug.), two savings lines and two investment lines, one variable line. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2027-01';
  d.accounts = defaultBankAccounts('2027-01');
  const lines = [ln('sal', 'rev', 1000), ln('livret', 'epa', 100), ln('secours', 'epa', 50), ln('pea', 'inv', 200), ln('btc', 'inv', 20), ln('resto', 'var', 150, null, 'Sorties')];
  for (let i = 1; i <= 8; i++) {
    const m = `2027-${String(i).padStart(2, '0')}`;
    d.months[m] = { initialized: true, lines: lines.map(l => ({ ...l, actual: l.block === 'var' ? 105 : l.budget })), alloc: {}, transfersDone: {} };
  }
  d.template.lines = lines.map(({ actual: _a, ...l }) => l);
  return d;
}
const view = (d: BudgetData, g: Goal, today = TODAY) => goalView(d, new Ledger(d, today), g, today);

describe('mois de référence (spec 0025 RG2, spec 0032 RG7)', () => {
  it('prend le dernier mois initialisé qui n’est pas dans le futur', () => {
    const d = started();
    expect(referenceMonth(d, TODAY)).toBe('2027-08');
    expect(referenceMonth(d, '2027-05')).toBe('2027-05');
    d.months['2027-12'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    expect(referenceMonth(d, TODAY)).toBe('2027-08');
  });

  it('à défaut, le premier mois géré ; null avant le premier mois', () => {
    expect(referenceMonth(started(), '2026-01')).toBe('2027-01');
    expect(referenceMonth(emptyData(), TODAY)).toBeNull();
  });

  it('année passée : le dernier mois géré de cette année ; année future : aucun', () => {
    const d = started();
    d.months['2026-11'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    d.months['2026-12'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    expect(referenceMonthOf(d, 2026, TODAY)).toBe('2026-12');
    expect(referenceMonthOf(d, 2027, TODAY)).toBe('2027-08');
    expect(referenceMonthOf(d, 2028, TODAY)).toBeNull();
    expect(referenceMonthOf(d, 2025, TODAY)).toBeNull();
  });
});

describe('année : plage et édition (RG9)', () => {
  it('de l’année du premier mois géré à l’année en cours + 1', () => {
    const d = started();
    d.firstMonth = '2025-03';
    expect(goalYears(d, TODAY)).toEqual([2025, 2026, 2027, 2028]);
    expect(goalYears(started(), TODAY)).toEqual([2027, 2028]);
  });

  it('année passée en lecture seule, année en cours et future modifiables', () => {
    expect([2026, 2027, 2028].map(y => isGoalYearEditable(y, TODAY))).toEqual([false, true, true]);
  });

  it('les objectifs d’une année sont rendus par ordre de création', () => {
    const d = started();
    d.goals = [goal({ id: 'b', kind: 'rate', position: 2 }), goal({ id: 'a', kind: 'rate', position: 1 }), goal({ id: 'c', kind: 'rate', year: 2026, position: 0 })];
    expect(goalsOfYear(d, 2027).map(g => g.id)).toEqual(['a', 'b']);
    expect(firstGoalOfKind(d, 'rate', TODAY)?.id).toBe('a');
    expect(firstGoalOfKind(d, 'cap', TODAY)).toBeNull();
  });
});

describe('type A, montant sur comptes (RG2)', () => {
  const amount = (over: Partial<Goal> = {}) => goal({ kind: 'amount', target: 21000, accounts: ['livret', 'secours'], ...over });

  it('somme des soldes de fin de mois des comptes cochés', () => {
    const d = started();
    const l = new Ledger(d, TODAY);
    const sum = (m: string) => (l.accMonth('livret', m)?.balance ?? 0) + (l.accMonth('secours', m)?.balance ?? 0);
    const g = view(d, amount());
    expect(g.current).toBe(sum('2027-08'));
    expect(g.series[2]).toBe(sum('2027-03'));
    expect(g.series.slice(8).every(v => v === null)).toBe(true);
  });

  it('CA2 : le plan part du solde réel au 1er janvier (9 000), « Prévu à ce jour » = plan au mois de référence', () => {
    const d = started();
    d.statements['2026-12'] = { livret: 9000 };
    const g = view(d, amount({ accounts: ['livret'], due: '2028-12-31' }));
    // 24 mois entre fin décembre 2026 et décembre 2028 : +500 / mois.
    expect(g.plan[0]).toBe(9500);
    expect(g.plan[7]).toBe(13000);
    expect(g.planned).toBe(g.plan[7]);
    expect(g.planned).toBe(13000);
  });

  it('sans mois géré en janvier, le plan part de la première valeur de l’année (comportement 0025)', () => {
    const d = started();
    d.firstMonth = '2027-03';
    delete d.months['2027-01'];
    delete d.months['2027-02'];
    const g = view(d, amount({ due: '2027-12-31' }));
    expect(g.plan[0]).toBeNull();
    expect(g.plan[2]).toBe(g.series[2]);
    expect(g.plan[11]).toBe(21000);
  });

  it('sans échéance, prévu, écart et mensualité valent null ; échéance dépassée : le reste sur 1 mois', () => {
    const d = started();
    const noDue = view(d, amount());
    expect([noDue.planned, noDue.gap, noDue.perMonth]).toEqual([null, null, null]);
    const late = view(d, amount({ due: '2027-02-28' }));
    expect(late.perMonth).toBe(late.left);
  });

  it('aucun compte coché : à définir, les comptes restent listés', () => {
    const g = view(started(), amount({ accounts: [] }));
    expect([g.status, g.defined, g.pct]).toEqual(['À définir', false, 0]);
    expect(g.accounts.length).toBe(4);
  });

  it('un compte supprimé ne compte plus', () => {
    const d = started();
    const a = view(d, amount({ accounts: ['livret', 'disparu'] }));
    const b = view(d, amount({ accounts: ['livret'] }));
    expect(a.current).toBe(b.current);
    expect(a.checkedCount).toBe(1);
  });

  it('CA4 : inclut les opérations hors budget par le solde des comptes', () => {
    const d = started();
    d.accounts.push({ id: 'acc-sav', name: 'Livret', hue: 10, isDefault: false, openingBalance: 1000, openingMonth: '2027-01', inBudget: true, archived: false, kind: 'epargne' });
    for (const md of Object.values(d.months)) md.lines.find(l => l.key === 'livret')!.linkedAccountId = 'acc-sav';
    const op = (extra: Partial<Transaction>): Transaction => ({ id: 't', month: '2027-03', day: 5, label: 'Achat', amount: 30, type: 'var', target: 'resto', accountId: 'acc-sav', ...extra });
    const value = (t?: Transaction) => {
      const x = structuredClone(d);
      if (t) x.transactions = [t];
      return view(x, amount({ accounts: ['livret'] })).current;
    };
    expect(value(op({ offBudget: true }))).toBe(value(op({})));
    expect(value(op({ offBudget: true }))).toBe(value() - 30);
  });
});

describe('statuts d’un montant', () => {
  it('atteint, en bonne voie, en progression, à rattraper', () => {
    expect(amountStatus(21000, 21000, 14000)).toBe('Atteint');
    expect(amountStatus(14000, 21000, 14000)).toBe('En bonne voie');
    expect(amountStatus(11900, 21000, 14000)).toBe('En progression');
    expect(amountStatus(11800, 21000, 14000)).toBe('À rattraper');
    expect(amountStatus(100, 21000, null)).toBe('En progression');
  });

  it('plan linéaire : plat à la cible après l’échéance, pas de plan sans échéance', () => {
    const flat = Array(12).fill(1000) as number[];
    expect(linearPlan(flat, 2027, 2000, '2027-06-30').slice(5)).toEqual(Array(7).fill(2000));
    expect(linearPlan(flat, 2027, 2000, undefined).every(v => v === null)).toBe(true);
    expect(linearPlan(flat, 2027, 2000, '2026-06-30', 0).every(v => v === null)).toBe(true);
  });
});

describe('type B, taux d’épargne (RG3)', () => {
  it('moyenne, mois au-dessus de la cible et écart en points', () => {
    const d = started();
    for (let i = 1; i <= 8; i++) d.months[`2027-${String(i).padStart(2, '0')}`].lines[0].budget = i <= 4 ? 1000 : 3000;
    const l = new Ledger(d, TODAY);
    const rates = Array.from({ length: 8 }, (_, i) => monthSummary(d, l, `2027-${String(i + 1).padStart(2, '0')}`).savingsRate);
    const g = view(d, goal({ kind: 'rate', target: 20 }));
    expect(g.series.slice(0, 8)).toEqual(rates);
    expect(g.monthsKnown).toBe(8);
    expect(g.monthsAbove).toBe(rates.filter(r => r >= 20).length);
    expect(g.average).toBeCloseTo(rates.reduce((a, b) => a + b, 0) / 8, 6);
    expect(g.rateGap).toBeCloseTo(rates[7] - 20, 6);
    expect(g.status).toBe(rates[7] >= 20 ? 'Atteint' : 'À rattraper');
    expect(g.plan.every(v => v === null)).toBe(true);
  });

  it('CA4 : une opération hors budget ne change pas le taux', () => {
    const d = started();
    const before = view(d, goal({ kind: 'rate', target: 20 })).current;
    d.transactions.push({ id: 't', month: '2027-08', day: 3, label: 'Cadeau', amount: 80, type: 'var', target: 'resto', offBudget: true });
    expect(view(d, goal({ kind: 'rate', target: 20 })).current).toBe(before);
  });
});

describe('type C, plafond de dépenses (RG4, RG5)', () => {
  const cap = (over: Partial<Goal> = {}) => goal({ kind: 'cap', target: 1200, scope: { kind: 'line', key: 'resto' }, ...over });
  const setActuals = (d: BudgetData, values: number[]) => values.forEach((v, i) => (d.months[`2027-${String(i + 1).padStart(2, '0')}`].lines.find(l => l.key === 'resto')!.actual = v));

  it('CA3 : 840 € de cumul pour un plafond de 1 200 : valeur 840, reste 360', () => {
    const g = view(started(), cap());
    expect([g.current, g.left, g.over, g.pct]).toEqual([840, 360, 0, 70]);
  });

  it('CA3 : à 1 300 le statut est « Dépassé » de 100, la barre est pleine', () => {
    const d = started();
    setActuals(d, [105, 105, 105, 105, 105, 105, 105, 565]);
    const g = view(d, cap());
    expect([g.current, g.status, g.over, g.left, g.pct]).toEqual([1300, 'Dépassé', 100, 0, 100]);
  });

  it('CA6 : en juin (part écoulée 600), 700 « À surveiller », 500 « Sous contrôle »', () => {
    const d = started();
    setActuals(d, [100, 100, 100, 100, 100, 200]);
    const watch = view(d, cap(), '2027-06');
    expect([watch.current, watch.elapsedShare, watch.status]).toEqual([700, 600, 'À surveiller']);
    setActuals(d, [100, 100, 100, 100, 50, 50]);
    expect(view(d, cap(), '2027-06').status).toBe('Sous contrôle');
    expect(capStatus(1201, 1200, 1200)).toBe('Dépassé');
  });

  it('la courbe de rythme répartit le plafond sur 12 mois', () => {
    const g = view(started(), cap());
    expect(g.plan[0]).toBe(100);
    expect(g.plan[11]).toBe(1200);
  });

  it('un bloc, une section ou une ligne : le périmètre filtre les lignes', () => {
    const d = started();
    d.months['2027-01'].lines.push(ln('autre', 'var', 50, 40, 'Maison'));
    expect(view(d, cap({ scope: { kind: 'block', block: 'var' } })).current).toBe(840 + 40);
    expect(view(d, cap({ scope: { kind: 'section', block: 'var', section: 'Sorties' } })).current).toBe(840);
    expect(view(d, cap({ scope: { kind: 'section', block: 'fix', section: 'Sorties' } })).current).toBe(0);
  });

  it('CA4 : les opérations hors budget et affectées ne comptent pas dans le réel de la ligne', () => {
    const d = started();
    d.transactions = [
      { id: 'a', month: '2027-03', day: 1, label: 'Resto', amount: 40, type: 'var', target: 'resto' },
      { id: 'b', month: '2027-03', day: 2, label: 'Cadeau', amount: 25, type: 'var', target: 'resto', offBudget: true },
      { id: 'c', month: '2027-03', day: 3, label: 'Affecté', amount: 30, type: 'var', target: 'resto', assignedAccountId: 'acc-x' },
    ];
    syncLineActuals(d);
    const g = view(d, cap());
    // Mars ne compte que 40 ; les autres mois n'ont plus d'écriture, donc plus de réel.
    expect(g.current).toBe(40);
  });

  it('périmètre introuvable : valeur 0 et avertissement', () => {
    const g = view(started(), cap({ scope: { kind: 'line', key: 'disparue' } }));
    expect([g.current, g.scopeMissing, g.scopeLabel]).toEqual([0, true, 'Ligne supprimée']);
    expect(scopeInfo(started(), { kind: 'line', key: 'resto' })).toEqual({ label: 'resto', missing: false });
    expect(scopeInfo(started(), { kind: 'section', block: 'var', section: 'Vide' }).missing).toBe(true);
  });

  it('les lignes de dépenses proposées sont uniques et sans revenus ni épargne', () => {
    expect(expenseLines(started()).map(l => l.key)).toEqual(['resto']);
  });
});

describe('type D, épargné dans l’année (RG6)', () => {
  const D = '2027-06';
  const saved = (d: BudgetData) => {
    // 500 € versés par mois sur la ligne « livret », de janvier à juin.
    for (let i = 1; i <= 8; i++) d.months[`2027-${String(i).padStart(2, '0')}`].lines.find(l => l.key === 'livret')!.actual = 500;
    return goal({ kind: 'saved', target: 8000, accounts: ['livret'] });
  };

  it('CA5 : 500 € par mois pendant 6 mois, cible 8 000 : valeur 3 000, statut selon le rythme linéaire', () => {
    const d = started();
    const g = view(d, saved(d), D);
    expect(g.current).toBe(3000);
    expect(g.series.slice(0, 6)).toEqual([500, 1000, 1500, 2000, 2500, 3000]);
    expect(g.plan[5]).toBe(4000);
    expect(g.planned).toBe(4000);
    expect(g.gap).toBe(-1000);
    expect(g.status).toBe('À rattraper');
    expect(g.due).toBe('2027-12-31');
    expect(g.perMonth).toBe(round(5000 / 6));
  });

  it('en avance sur le rythme : « En bonne voie »', () => {
    const d = started();
    const g = saved(d);
    g.target = 5000;
    expect(view(d, g, D).status).toBe('En bonne voie');
  });

  it('versements bruts : seul le flux compte, pas le solde', () => {
    const d = started();
    d.statements['2026-12'] = { livret: 9000 };
    expect(view(d, saved(d), D).current).toBe(3000);
  });

  it('plusieurs lignes : on additionne les lignes cochées', () => {
    const d = started();
    const g = saved(d);
    g.accounts = ['livret', 'pea'];
    expect(view(d, g, D).current).toBe(3000 + 6 * 200);
  });
});

describe('années passée et future (RG7)', () => {
  it('année future : valeur 0, aucune courbe réelle, aucun plantage', () => {
    const d = started();
    for (const g of [goal({ kind: 'amount', year: 2028, accounts: ['livret'] }), goal({ kind: 'rate', year: 2028 }), goal({ kind: 'cap', year: 2028, scope: { kind: 'block', block: 'var' } }), goal({ kind: 'saved', year: 2028, accounts: ['livret'] })]) {
      const v = view(d, g);
      expect([v.referenceMonth, v.current]).toEqual([null, 0]);
      expect(v.series.every(x => x === null)).toBe(true);
    }
  });

  it('année passée : la valeur est celle du dernier mois géré de l’année', () => {
    const d = started();
    d.firstMonth = '2026-11';
    d.months['2026-11'] = { initialized: true, lines: [ln('livret', 'epa', 100, 100)], alloc: {}, transfersDone: {} };
    d.months['2026-12'] = { initialized: true, lines: [ln('livret', 'epa', 100, 100)], alloc: {}, transfersDone: {} };
    const v = view(d, goal({ kind: 'saved', year: 2026, accounts: ['livret'], target: 1000 }));
    expect([v.referenceMonth, v.current]).toEqual(['2026-12', 200]);
  });
});

describe('année en cours sans mois géré (spec 0025, RG2)', () => {
  /** Budget géré jusqu'en décembre 2026 seulement ; on est en janvier 2027. */
  function endOfYear(): BudgetData {
    const d = started();
    d.firstMonth = '2026-11';
    d.months = {};
    for (const m of ['2026-11', '2026-12']) d.months[m] = { initialized: true, lines: [ln('livret', 'epa', 100, 100), ln('sal', 'rev', 1000, 1000)], alloc: {}, transfersDone: {} };
    return d;
  }
  const T = '2027-01';

  it('le mois de référence retombe sur celui de la 0025, pour l’année en cours seulement', () => {
    const d = endOfYear();
    expect(referenceMonthOf(d, 2027, T)).toBe('2026-12');
    expect(referenceMonthOf(d, 2028, T)).toBeNull();
    expect(referenceMonthOf(d, 2025, T)).toBeNull();
  });

  it('montant : la valeur est le solde du mois de référence, séries et plan vides, sans plantage', () => {
    const d = endOfYear();
    const l = new Ledger(d, T);
    const g = goalView(d, l, goal({ kind: 'amount', accounts: ['livret'], due: '2027-12-31', target: 5000 }), T);
    expect(g.referenceMonth).toBe('2026-12');
    expect(g.current).toBe(l.accMonth('livret', '2026-12')!.balance);
    expect(g.series.every(v => v === null)).toBe(true);
    expect(g.planned).toBeNull();
    expect(g.accounts.find(a => a.key === 'livret')!.balance).toBe(g.current);
  });

  it('taux : la valeur est le taux du mois de référence, sans moyenne', () => {
    const d = endOfYear();
    const g = goalView(d, new Ledger(d, T), goal({ kind: 'rate', target: 20 }), T);
    expect(g.current).toBe(monthSummary(d, new Ledger(d, T), '2026-12').savingsRate);
    expect([g.average, g.monthsKnown]).toEqual([null, 0]);
  });

  it('plafond et épargné : cumul à 0, part écoulée à 0', () => {
    const d = endOfYear();
    const cap = goalView(d, new Ledger(d, T), goal({ kind: 'cap', scope: { kind: 'block', block: 'var' }, target: 1200 }), T);
    expect([cap.current, cap.elapsedShare, cap.status]).toEqual([0, 0, 'Sous contrôle']);
    const sv = goalView(d, new Ledger(d, T), goal({ kind: 'saved', accounts: ['livret'], target: 8000 }), T);
    expect([sv.current, sv.planned]).toEqual([0, null]);
    expect(sv.series.every(v => v === null)).toBe(true);
  });
});

describe('RG8 : opérations affectées et hors budget (CA4)', () => {
  const ops = (): Transaction[] => [
    { id: 'a', month: '2027-08', day: 1, label: 'Affecté', amount: 70, type: 'var', target: 'resto', assignedAccountId: 'acc-x' },
    { id: 'b', month: '2027-08', day: 2, label: 'Hors budget', amount: 55, type: 'var', target: 'resto', offBudget: true },
    { id: 'c', month: '2027-08', day: 3, label: 'Normale', amount: 10, type: 'var', target: 'resto' },
  ];
  const withOps = (kinds: ('assigned' | 'off' | 'normal')[]) => {
    const d = started();
    d.transactions = ops().filter(t => kinds.includes(t.id === 'a' ? 'assigned' : t.id === 'b' ? 'off' : 'normal'));
    syncLineActuals(d);
    // Les versements d’épargne sont des mouvements entre comptes : on pose leur réel à la main, après la synchro des lignes de dépenses.
    for (const md of Object.values(d.months)) for (const l of md.lines) if (l.block === 'epa' || l.block === 'inv') l.actual = l.budget;
    return d;
  };

  it('B : ni l’affectée ni la hors budget ne changent le taux d’épargne', () => {
    const base = view(withOps([]), goal({ kind: 'rate', target: 20 })).current;
    expect(view(withOps(['assigned']), goal({ kind: 'rate', target: 20 })).current).toBe(base);
    expect(view(withOps(['off']), goal({ kind: 'rate', target: 20 })).current).toBe(base);
  });

  it('D : ni l’affectée ni la hors budget ne changent l’épargné de l’année', () => {
    const g = goal({ kind: 'saved', accounts: ['livret', 'pea'], target: 8000 });
    const base = view(withOps([]), g).current;
    expect(base).toBeGreaterThan(0);
    expect(view(withOps(['assigned']), g).current).toBe(base);
    expect(view(withOps(['off']), g).current).toBe(base);
  });

  it('C : seule l’opération comptée au budget entre dans le plafond', () => {
    expect(view(withOps(['assigned', 'off', 'normal']), goal({ kind: 'cap', target: 1200, scope: { kind: 'line', key: 'resto' } })).current).toBe(10);
  });
});

describe('cartes du Budget et de l’Accueil (RG16, CA14)', () => {
  it('les 3 premiers objectifs de l’année en cours, par ordre de création, avec le calcul de l’écran', () => {
    const d = started();
    d.goals = [
      goal({ id: 'e', kind: 'rate', position: 4 }),
      goal({ id: 'a', kind: 'rate', position: 1 }),
      goal({ id: 'old', kind: 'rate', year: 2026, position: 0 }),
      goal({ id: 'c', kind: 'rate', position: 3 }),
      goal({ id: 'b', kind: 'rate', position: 2 }),
    ];
    const l = new Ledger(d, TODAY);
    const cards = summaryGoals(d, l, TODAY);
    expect(cards.map(v => v.id)).toEqual(['a', 'b', 'c']);
    expect(cards[0]).toEqual(goalView(d, l, d.goals[1], TODAY));
  });

  it('aucun objectif dans l’année en cours : liste vide', () => {
    const d = started();
    d.goals = [goal({ kind: 'rate', year: 2028 })];
    expect(summaryGoals(d, new Ledger(d, TODAY), TODAY)).toEqual([]);
  });
});

function round(n: number) {
  return Math.round(n * 100) / 100;
}
