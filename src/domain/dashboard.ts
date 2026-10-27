import { blockTotals, budgetLines, envelopeAlerts, lineRemaining, monthSummary, variableRemaining, type MonthSummary } from './budget';
import { monthAssignedSummary, type AssignedSummary } from './assignedOperations';
import { isLineInBudget } from './bank';
import { envelopeConsumption } from './envelopeCash';
import { effectiveDueDay, envelopeCheck, isEnvelopePointable, isLate, lineCheck, lineCounted } from './checkoff';
import { goalView, referenceMonth, type GoalView } from './goals';
import { parseMonth, round2 } from './format';
import { accounts, monthAlloc, monthLines, type Ledger } from './ledger';
import type { BudgetData, MonthKey, MonthNote } from './types';

/*
 * Tableau de bord (spec 0027). Pure assembly of existing calculations (`monthSummary`, `goalView`, `envelopeAlerts`, `lineCounted`, `lineCheck`,
 * `isLate`, `variableRemaining`): nothing is recomputed here, the screen only displays what `dashboardView` returns.
 */

/** KPI band, as budgeted like the Budget screen (RG3). */
export interface DashboardKpis {
  remaining: number;
  /** Money really available to place; null while unknown. */
  availableReal: number | null;
  income: number;
  /** Sum of the actuals of the revenue lines. */
  incomeActual: number;
  expenses: number;
  variableRemaining: number;
  /** Real savings rate, in %. */
  savingsRate: number;
  savingsRateTarget: number;
  grossSavings: number;
  realSavings: number;
  /** Real minus gross savings. */
  savingsVsGross: number;
}

export type DonutId = 'cre' | 'var' | 'epa' | 'remaining' | 'fix' | 'env' | 'inv';

export interface DonutSlice {
  id: DonutId;
  label: string;
  amount: number;
  /** Share of the income in %; null when the income is 0 (« — »). */
  pct: number | null;
  /** False for a negative amount (a negative « Reste à placer » stays in the legend only) or when the income is 0. */
  drawn: boolean;
}

/** « Où va chaque euro de revenu » (RG4): slices in legend order (left column then right column). */
export interface DashboardDonut {
  income: number;
  slices: DonutSlice[];
}

export interface VariableRow {
  key: string;
  name: string;
  budget: number;
  actual: number | null;
  /** Share consumed in %, from 0 to 100. */
  consumed: number;
  /** Budget minus actual; red when it is 0 or below (RG5). */
  remaining: number;
}

export interface DashboardVariables {
  remaining: number;
  budget: number;
  rows: VariableRow[];
}

export interface EnvelopeRow {
  id: string;
  name: string;
  hue: number;
  balance: number;
  /** Spent in the month, shown when hovering the bar. */
  spent: number;
  /** Balance available at the start of the month, the month's allocation included. */
  start: number;
  /** start − spent: what the bar shows, whatever is allocated in the month. */
  remaining: number;
  /** Share consumed in %, from 0 to 100: spent in the month over the starting balance (a provision). */
  consumed: number;
}

export interface DashboardEnvelopes {
  /** Sum of the balances shown on the rows. */
  total: number;
  /** Allocations of the month. */
  allocated: number;
  rows: EnvelopeRow[];
}

export interface YearlyMonth {
  /** 0 = January. */
  month: number;
  amount: number;
  selected: boolean;
}

/** « Dépenses prévues sur l'année » (RG9): planned expenses of the chosen month's year, all envelopes together. */
export interface DashboardYearly {
  year: number;
  months: YearlyMonth[];
  total: number;
  average: number;
}

/** An envelope whose planned expenses exceed what it can spend (same figures and wording as the Budget, RG10). */
export interface DashboardAlert {
  envelopeId: string;
  envelopeName: string;
  /** The planned expense's label when there is only one, else the envelope's name. */
  label: string;
  planned: number;
  missing: number;
}

/** A transfer of the month: a savings or investment line, or an envelope allocation (RG11). */
export interface DashboardTransfer {
  kind: 'line' | 'envelope';
  /** Line key, or envelope id. */
  id: string;
  name: string;
  /** Planned day of the month (brought back to the month's last day); undefined = no planned day. */
  day?: number;
  amount: number;
  done: boolean;
  late: boolean;
}

export interface DashboardTodo {
  alerts: DashboardAlert[];
  /** Transfers not made yet. */
  transfers: DashboardTransfer[];
  /** Sum of the transfers not made yet. */
  transfersTotal: number;
  /** Transfers already checked, and all the transfers of the month. */
  transfersDone: number;
  transfersAll: number;
  /** Names of the savings and investment lines with no balance entered for the month (RG10). */
  balancesToEnter: string[];
}

export interface DashboardNotes {
  items: MonthNote[];
  done: number;
}

export interface DashboardWealth {
  total: number;
  savings: number;
  invest: number;
  /** Savings share of the total, from 0 to 1; 0 when the total is 0 (grey bar). */
  savingsShare: number;
}

export interface DashboardView {
  month: MonthKey;
  /** False while the month is not initialized: the blocks of the month show « — » or their empty state (RG2). */
  initialized: boolean;
  kpis: DashboardKpis | null;
  donut: DashboardDonut | null;
  variables: DashboardVariables | null;
  envelopes: DashboardEnvelopes | null;
  yearly: DashboardYearly | null;
  todo: DashboardTodo | null;
  /** Notes are always available, whatever the month. */
  notes: DashboardNotes;
  /** Wealth, emergency fund and goals are those of the reference month of the Objectifs screen, whatever the chosen month (RG13 to RG15). Null before the first month exists. */
  wealth: DashboardWealth | null;
  emergency: GoalView | null;
  invest: GoalView | null;
  savings: GoalView | null;
  /** Mention under the KPI band (spec 0028, RG25): operations assigned to a savings account, outside the figures above; null when the month is not initialized or has none. */
  assigned: AssignedSummary | null;
}

/** Every transfer of a month (done or not), sorted by planned day, no day last (RG11). */
export function monthTransfers(d: BudgetData, month: MonthKey, today: string): DashboardTransfer[] {
  if (!d.months[month]?.initialized) return [];
  const out: DashboardTransfer[] = [];
  for (const l of monthLines(d, month)) {
    if ((l.block !== 'epa' && l.block !== 'inv') || l.execMode === 'informatif' || !isLineInBudget(d, l)) continue;
    const { amount } = lineCounted(d, l);
    if (amount === 0) continue;
    out.push({ kind: 'line', id: l.key, name: l.name, ...(l.dueDay !== undefined ? { day: effectiveDueDay(l.dueDay, month) } : {}), amount, done: !!lineCheck(d, month, l.key), late: isLate(d, month, l, today) });
  }
  const alloc = monthAlloc(d, month);
  for (const e of d.envelopes) {
    const done = !!envelopeCheck(d, month, e.id);
    if (!done && !isEnvelopePointable(d, month, e)) continue;
    if ((alloc[e.id] ?? 0) <= 0) continue;
    out.push({ kind: 'envelope', id: e.id, name: `Alloc. ${e.name}`, amount: alloc[e.id], done, late: false });
  }
  // Array.sort is stable: transfers with the same day keep their order.
  return out.sort((a, b) => (a.day ?? Infinity) - (b.day ?? Infinity));
}

/** Transfers still to make in a month (RG10). */
export const transfersToMake = (d: BudgetData, month: MonthKey, today: string): DashboardTransfer[] => monthTransfers(d, month, today).filter(t => !t.done);

const pctOf = (amount: number, income: number) => (income > 0 ? (amount / income) * 100 : null);

function donutOf(d: BudgetData, month: MonthKey, s: MonthSummary): DashboardDonut {
  const lines = budgetLines(d, month);
  const b = (k: 'cre' | 'var' | 'fix' | 'epa' | 'inv') => blockTotals(lines, k).budget;
  const envelopes = round2(Object.values(monthAlloc(d, month)).reduce((a, v) => a + v, 0));
  const slice = (id: DonutId, label: string, amount: number): DonutSlice => ({ id, label, amount, pct: pctOf(amount, s.income), drawn: s.income > 0 && amount > 0 });
  return {
    income: s.income,
    slices: [
      slice('cre', 'Crédits', b('cre')),
      slice('var', 'Variables', b('var')),
      slice('epa', 'Épargnes', b('epa')),
      slice('remaining', 'Reste à placer', s.remaining),
      slice('fix', 'Dépenses fixes', b('fix')),
      slice('env', 'Enveloppes', envelopes),
      slice('inv', 'Investissements', b('inv')),
    ],
  };
}

/** Everything the dashboard shows, assembled from the existing calculations. `today` is `YYYY-MM-DD`. */
export function dashboardView(d: BudgetData, ledger: Ledger, month: MonthKey, today: string): DashboardView {
  const initialized = !!d.months[month]?.initialized;
  const { year, month: m0 } = parseMonth(month);
  const todayMonth = today.slice(0, 7);
  const notes = d.months[month]?.notes ?? [];
  const notesView: DashboardNotes = { items: notes, done: notes.filter(n => n.done).length };

  // Goals and wealth: reference month of the Objectifs screen (spec 0025), not the chosen month.
  const ref = referenceMonth(d, todayMonth);
  const wealth = ref === null ? null : wealthAt(d, ledger, ref);
  const goals = { emergency: goalView(d, ledger, 'emergency', todayMonth), invest: goalView(d, ledger, 'invest', todayMonth), savings: goalView(d, ledger, 'savings', todayMonth) };
  if (!initialized) return { month, initialized, kpis: null, donut: null, variables: null, envelopes: null, yearly: null, todo: null, notes: notesView, wealth, ...goals, assigned: null };

  const s = monthSummary(d, ledger, month);
  const lines = budgetLines(d, month);
  const kpis: DashboardKpis = {
    remaining: s.remaining,
    availableReal: s.availableReal,
    income: s.income,
    incomeActual: blockTotals(lines, 'rev').actual,
    expenses: s.expenses,
    variableRemaining: variableRemaining(d, month),
    savingsRate: s.savingsRate,
    savingsRateTarget: d.settings.savingsRateTarget,
    grossSavings: s.grossSavings,
    realSavings: s.realSavings,
    savingsVsGross: round2(s.realSavings - s.grossSavings),
  };

  const vars = lines.filter(l => l.block === 'var');
  const variables: DashboardVariables = {
    remaining: kpis.variableRemaining,
    budget: round2(vars.reduce((a, l) => a + l.budget, 0)),
    rows: vars.map(l => ({
      key: l.key,
      name: l.name,
      budget: l.budget,
      actual: l.actual,
      consumed: l.budget > 0 ? Math.min(100, ((l.actual ?? 0) / l.budget) * 100) : (l.actual ?? 0) > 0 ? 100 : 0,
      remaining: lineRemaining(l),
    })),
  };

  const balances = d.envelopes.map(e => {
    const c = envelopeConsumption(d, ledger, e.id, month);
    return { e, balance: ledger.envMonth(e.id, month)?.balance ?? 0, start: c?.start ?? 0, spent: c?.spent ?? 0, remaining: c?.remaining ?? 0, consumed: c?.consumed ?? 0 };
  });
  const envelopes: DashboardEnvelopes = {
    total: round2(balances.reduce((a, x) => a + x.balance, 0)),
    allocated: round2(Object.values(monthAlloc(d, month)).reduce((a, v) => a + v, 0)),
    rows: balances.map(({ e, balance, start, spent, remaining, consumed }) => ({ id: e.id, name: e.name, hue: e.hue, balance, start, spent, remaining, consumed })),
  };

  const perMonth = Array.from({ length: 12 }, (_, i) => round2(d.planned.filter(p => p.year === year && p.month === i).reduce((a, p) => a + p.amount, 0)));
  const total = round2(perMonth.reduce((a, v) => a + v, 0));
  const yearly: DashboardYearly = { year, months: perMonth.map((amount, i) => ({ month: i, amount, selected: i === m0 })), total, average: round2(total / 12) };

  const alerts: DashboardAlert[] = envelopeAlerts(d, ledger, year, m0).flatMap(a => {
    const env = d.envelopes.find(e => e.id === a.envelopeId);
    return env ? [{ envelopeId: env.id, envelopeName: env.name, label: a.labels.length === 1 ? a.labels[0] : env.name, planned: a.planned, missing: a.missing }] : [];
  });
  const all = monthTransfers(d, month, today);
  const transfers = all.filter(t => !t.done);
  const todo: DashboardTodo = {
    alerts,
    transfers,
    transfersTotal: round2(transfers.reduce((a, t) => a + t.amount, 0)),
    transfersDone: all.length - transfers.length,
    transfersAll: all.length,
    balancesToEnter: lines.filter(l => (l.block === 'epa' || l.block === 'inv') && d.statements[month]?.[l.key] === undefined).map(l => l.name),
  };

  return { month, initialized, kpis, donut: donutOf(d, month, s), variables, envelopes, yearly, todo, notes: notesView, wealth, ...goals, assigned: assignedOf(d, month) };
}

const assignedOf = (d: BudgetData, month: MonthKey): AssignedSummary | null => {
  const s = monthAssignedSummary(d, month);
  return s.count > 0 ? s : null;
};

/** Savings + investments at the end of `ref` (sum of the line balances of the Ledger), over the lines of that month that count in the budget (RG13). */
function wealthAt(d: BudgetData, ledger: Ledger, ref: MonthKey): DashboardWealth {
  const inMonth = new Map(monthLines(d, ref).filter(l => isLineInBudget(d, l)).map(l => [l.key, l]));
  const sum = (block: 'epa' | 'inv') => round2(accounts(d).filter(a => a.block === block && inMonth.has(a.key)).reduce((t, a) => t + (ledger.accMonth(a.key, ref)?.balance ?? 0), 0));
  const savings = sum('epa');
  const invest = sum('inv');
  const total = round2(savings + invest);
  return { total, savings, invest, savingsShare: total > 0 ? savings / total : 0 };
}
