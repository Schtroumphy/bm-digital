import { isLineInBudget } from './bank';
import { monthSummary } from './budget';
import { compareMonths, currentMonthKey, monthKey, parseMonth, round2 } from './format';
import { accounts, type Ledger } from './ledger';
import type { BudgetData, Goal, GoalKind, GoalScope, Line, MonthKey } from './types';

/*
 * Annual goals (spec 0032, which generalizes the three fixed goals of spec 0025). A goal is a piece of data (`Goal`): `goalView`
 * computes everything its card shows, for any of the four kinds. Pure functions, no UI.
 */

export type GoalStatus =
  | 'Atteint'
  | 'En bonne voie'
  | 'En progression'
  | 'À rattraper'
  | 'À définir'
  | 'Dépassé'
  | 'Sous contrôle'
  | 'À surveiller';

export interface GoalAccount {
  key: string;
  name: string;
  /** `amount`: balance at the end of the reference month. `saved`: amount paid in since 1 January. */
  balance: number;
  checked: boolean;
}

export interface GoalView {
  id: string;
  goal: Goal;
  name: string;
  kind: GoalKind;
  target: number;
  /** `YYYY-MM-DD`: chosen for an `amount` goal, 31 December for a `saved` goal. */
  due?: string;
  /** False while no account is ticked (`amount`, `saved`): the card shows « À définir » (RG2). */
  defined: boolean;
  status: GoalStatus;
  year: number;
  /** Null when the year has no managed month yet (future year): the value is then 0 and the real curve is empty (RG7). */
  referenceMonth: MonthKey | null;
  current: number;
  /** min(100, current / target × 100); 0 when not defined. */
  pct: number;
  /** What is left to reach the target, or to spend under the ceiling (never negative). */
  left: number;
  /** `cap` goals: how much the ceiling is exceeded by (never negative). */
  over: number;
  /** One value per month of the year (January to December); null = no data, the curve is interrupted. */
  series: (number | null)[];
  /** Linear plan (`amount`, `saved`) or pace (`cap`), same shape as `series`; null everywhere when there is none. */
  plan: (number | null)[];
  accounts: GoalAccount[];
  /** Ticked accounts that exist. */
  checkedCount: number;
  /** `amount` and `saved` goals: planned to date, gap to the plan, amount to put aside per month. Null = « — ». */
  planned: number | null;
  gap: number | null;
  perMonth: number | null;
  /** `rate` goal: average over the months with data, months at or above the target, months with data, gap in points. */
  average: number | null;
  monthsAbove: number;
  monthsKnown: number;
  rateGap: number | null;
  /** `cap` goals: the part of the ceiling already elapsed (target × months elapsed / 12), and the label of the watched scope. */
  elapsedShare: number | null;
  scopeLabel: string | null;
  /** `cap` goals: the line or section watched does not exist any more (RG: « Périmètre introuvable »). */
  scopeMissing: boolean;
}

/** Latest initialized month that is not in the future; otherwise the first managed month; null before the first month exists (spec 0025, RG2). */
export function referenceMonth(d: BudgetData, today: MonthKey = currentMonthKey()): MonthKey | null {
  if (d.firstMonth === null) return null;
  const ready = Object.keys(d.months)
    .filter(m => d.months[m].initialized && compareMonths(m, today) <= 0)
    .sort();
  return ready.at(-1) ?? d.firstMonth;
}

/**
 * Reference month of a goal year (RG7): the last managed month of that year. For the current year with no managed month yet, the reference month of
 * spec 0025 (it can then belong to the previous year). None for a past year without data and for a future year.
 */
export function referenceMonthOf(d: BudgetData, year: number, today: MonthKey = currentMonthKey()): MonthKey | null {
  const base = referenceMonth(d, today);
  if (base === null) return null;
  const inYear = Object.keys(d.months)
    .filter(m => d.months[m].initialized && parseMonth(m).year === year && compareMonths(m, today) <= 0)
    .sort();
  if (inYear.length) return inYear.at(-1) as MonthKey;
  return year === currentYear(today) ? base : null;
}

/** Months between two month keys (`b` − `a`), negative when `b` is earlier. */
export const monthsBetween = (a: MonthKey, b: MonthKey): number => {
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
};

/** The current calendar year. */
export const currentYear = (today: MonthKey = currentMonthKey()): number => parseMonth(today).year;

/** Years the selector offers: from the year of the first managed month to next year (RG9). */
export function goalYears(d: BudgetData, today: MonthKey = currentMonthKey()): number[] {
  const last = currentYear(today) + 1;
  const first = d.firstMonth === null ? currentYear(today) : Math.min(parseMonth(d.firstMonth).year, last);
  return Array.from({ length: last - first + 1 }, (_, i) => first + i);
}

/** Past years are read-only (RG9). */
export const isGoalYearEditable = (year: number, today: MonthKey = currentMonthKey()): boolean => year >= currentYear(today);

/** Goals of a year, in creation order (RG13). */
export const goalsOfYear = (d: BudgetData, year: number): Goal[] => (d.goals ?? []).filter(g => g.year === year).sort((a, b) => a.position - b.position);

/** First goal of a kind in the current year, by creation order; null when there is none (spec 0032, Q2). */
export const firstGoalOfKind = (d: BudgetData, kind: GoalKind, today: MonthKey = currentMonthKey()): Goal | null =>
  goalsOfYear(d, currentYear(today)).find(g => g.kind === kind) ?? null;

/** The goals the small cards of the Budget and the Accueil show (RG16): the first 3 of the current year, by creation order, computed like the Objectifs screen. */
export const SUMMARY_GOALS = 3;
export function summaryGoals(d: BudgetData, ledger: Ledger, today: MonthKey = currentMonthKey()): GoalView[] {
  return goalsOfYear(d, currentYear(today)).slice(0, SUMMARY_GOALS).map(g => goalView(d, ledger, g, today));
}

/**
 * Linear plan of an amount goal over the 12 months of the year (spec 0025, RG9; spec 0032, RG2). With `startBalance` (the real balance on 1 January,
 * i.e. at the end of the previous December) the plan leaves it and reaches the target at the due month. Without it, it starts from the first month
 * with data. Flat at the target afterwards. No plan (all null) without a due date or with a due month before the start.
 */
export function linearPlan(series: (number | null)[], year: number, target: number, due: string | undefined, startBalance: number | null = null): (number | null)[] {
  const none = series.map(() => null);
  if (!due) return none;
  const dueMonth = due.slice(0, 7);
  if (startBalance !== null) {
    const n = monthsBetween(monthKey(year - 1, 11), dueMonth);
    if (n <= 0) return none;
    return series.map((_, i) => round2(startBalance + ((target - startBalance) * Math.min(i + 1, n)) / n));
  }
  const first = series.findIndex(v => v !== null);
  if (first < 0) return none;
  const n = monthsBetween(monthKey(year, first), dueMonth);
  if (n < 0) return none;
  const start = series[first] as number;
  return series.map((_, i) => {
    if (i < first) return null;
    if (n === 0) return target;
    return round2(start + ((target - start) * Math.min(i - first, n)) / n);
  });
}

/** Status of an amount goal (spec 0025, RG11). `planned` is null without a plan. */
export function amountStatus(current: number, target: number, planned: number | null): GoalStatus {
  if (current >= target) return 'Atteint';
  if (planned === null) return 'En progression';
  const ratio = planned > 0 ? current / planned : Infinity;
  return ratio >= 1 ? 'En bonne voie' : ratio >= 0.85 ? 'En progression' : 'À rattraper';
}

export const rateStatus = (current: number, target: number): GoalStatus => (current >= target ? 'Atteint' : 'À rattraper');

/** Status of a spending ceiling (RG5): `elapsedShare` is the part of the ceiling already elapsed. */
export function capStatus(current: number, target: number, elapsedShare: number): GoalStatus {
  if (current > target) return 'Dépassé';
  return current <= elapsedShare ? 'Sous contrôle' : 'À surveiller';
}

const lineMatches = (l: Pick<Line, 'key' | 'block' | 'section'>, scope: GoalScope): boolean =>
  scope.kind === 'line' ? l.key === scope.key : l.block === scope.block && (scope.kind === 'block' || l.section === scope.section);

/** Every line known to the budget (model and months), to name a scope and tell whether it still exists. */
function knownLines(d: BudgetData): Pick<Line, 'key' | 'block' | 'section' | 'name'>[] {
  return [...d.template.lines, ...Object.values(d.months).flatMap(md => md.lines)];
}

const BLOCK_LABEL = { cre: 'Crédits', fix: 'Dépenses fixes', var: 'Dépenses variables' } as const;

/** Readable name of what a ceiling watches, and whether it still exists (a block always does). */
export function scopeInfo(d: BudgetData, scope: GoalScope): { label: string; missing: boolean } {
  if (scope.kind === 'block') return { label: BLOCK_LABEL[scope.block], missing: false };
  const lines = knownLines(d);
  if (scope.kind === 'section') return { label: `${BLOCK_LABEL[scope.block]} · ${scope.section}`, missing: !lines.some(l => lineMatches(l, scope)) };
  const found = lines.find(l => l.key === scope.key);
  return { label: found?.name ?? 'Ligne supprimée', missing: !found };
}

/** Everything the card of a goal shows, computed from the data (spec 0032). */
export function goalView(d: BudgetData, ledger: Ledger, goal: Goal, today: MonthKey = currentMonthKey()): GoalView {
  const { year, kind, target } = goal;
  const ref = referenceMonthOf(d, year, today);
  const first = d.firstMonth;
  // The reference month can belong to the previous year (current year with no managed month yet): the year's curves are then empty.
  const refInYear = ref !== null && parseMonth(ref).year === year;
  const refIdx = ref !== null && refInYear ? parseMonth(ref).month : -1;
  const isAccountKind = kind === 'amount' || kind === 'saved';

  const all = accounts(d);
  const checkedKeys = new Set((goal.accounts ?? []).filter(k => all.some(a => a.key === k)));
  const bal = (key: string, m: MonthKey) => ledger.accMonth(key, m)?.balance ?? 0;
  // Amount paid in a line during a month (flow, not balance): the actual of the line, itself without off-budget operations.
  const paidIn = (key: string, m: MonthKey) => d.months[m]?.lines.find(l => l.key === key)?.actual ?? 0;
  const monthsOfYear = Array.from({ length: 12 }, (_, i) => monthKey(year, i));

  const hasData = (m: MonthKey) => first !== null && !!d.months[m]?.initialized && compareMonths(m, first) >= 0 && ref !== null && compareMonths(m, ref) <= 0;
  /** Amount paid in the given lines from 1 January up to month index `upTo` (months with data only). */
  const cumulative = (keys: string[], upTo: number) =>
    round2(monthsOfYear.slice(0, upTo + 1).reduce((s, m) => (hasData(m) ? s + keys.reduce((t, k) => t + paidIn(k, m), 0) : s), 0));
  const scope = goal.scope;
  const capMonth = (m: MonthKey) =>
    scope === undefined || !hasData(m)
      ? 0
      : round2((d.months[m].lines.filter(l => lineMatches(l, scope) && isLineInBudget(d, l)) as Line[]).reduce((s, l) => s + (l.actual ?? 0), 0));
  const capCumul = (upTo: number) => round2(monthsOfYear.slice(0, upTo + 1).reduce((s, m) => s + capMonth(m), 0));

  const valueAt = (i: number): number => {
    const m = monthsOfYear[i];
    if (kind === 'rate') return monthSummary(d, ledger, m).savingsRate;
    if (kind === 'amount') return round2([...checkedKeys].reduce((s, k) => s + bal(k, m), 0));
    if (kind === 'saved') return cumulative([...checkedKeys], i);
    return capCumul(i);
  };
  const series: (number | null)[] = monthsOfYear.map((m, i) => (ref !== null && (hasData(m) || m === ref) ? valueAt(i) : null));
  // Outside the year only the balance of the amount goals and the rate of the reference month mean something; ceilings and savings start at 0.
  const outside = ref === null ? 0 : kind === 'rate' ? monthSummary(d, ledger, ref).savingsRate : kind === 'amount' ? round2([...checkedKeys].reduce((s, k) => s + bal(k, ref), 0)) : 0;
  const current = ref === null ? 0 : refInYear ? valueAt(refIdx) : outside;

  const goalAccounts: GoalAccount[] = isAccountKind
    ? all.map(a => ({
        key: a.key,
        name: a.name,
        balance: ref === null ? 0 : kind === 'amount' ? bal(a.key, ref) : refInYear ? cumulative([a.key], refIdx) : 0,
        checked: checkedKeys.has(a.key),
      }))
    : [];

  const defined = isAccountKind ? checkedKeys.size > 0 : true;
  const due = kind === 'saved' ? `${year}-12-31` : kind === 'amount' ? goal.due : undefined;
  const info = scope ? scopeInfo(d, scope) : null;
  const base = {
    id: goal.id,
    goal,
    name: goal.name,
    kind,
    target,
    ...(due ? { due } : {}),
    year,
    referenceMonth: ref,
    current,
    series,
    accounts: goalAccounts,
    checkedCount: checkedKeys.size,
    scopeLabel: info?.label ?? null,
    scopeMissing: info?.missing ?? false,
  } as const;
  const empty = { planned: null, gap: null, perMonth: null, average: null, monthsAbove: 0, monthsKnown: 0, rateGap: null, over: 0, elapsedShare: null };
  const none = series.map(() => null);
  if (!defined) return { ...base, defined, status: 'À définir', pct: 0, left: 0, plan: none, ...empty };

  const pct = Math.min(100, (current / target) * 100);
  const left = Math.max(0, round2(target - current));

  if (kind === 'rate') {
    const known = series.filter((v): v is number => v !== null);
    return {
      ...base,
      defined,
      status: rateStatus(current, target),
      pct,
      left,
      plan: none,
      ...empty,
      average: known.length ? known.reduce((s, v) => s + v, 0) / known.length : null,
      monthsAbove: known.filter(v => v >= target).length,
      monthsKnown: known.length,
      rateGap: ref === null ? null : current - target,
    };
  }

  if (kind === 'cap') {
    // The pace line spreads the ceiling over 12 months: it is the reference of the curve (RG5).
    const pace = monthsOfYear.map((_, i) => round2((target * (i + 1)) / 12));
    const elapsedShare = refIdx < 0 ? 0 : round2((target * (refIdx + 1)) / 12);
    return {
      ...base,
      defined,
      status: capStatus(current, target, elapsedShare),
      pct,
      left,
      plan: pace,
      ...empty,
      over: Math.max(0, round2(current - target)),
      elapsedShare,
    };
  }

  // `amount` and `saved`: a plan, a status and the same statistics.
  let plan: (number | null)[];
  if (kind === 'saved') plan = monthsOfYear.map((_, i) => round2((target * (i + 1)) / 12));
  else {
    // Real balance on 1 January when January is managed (end of the previous December, 0 when it does not exist); otherwise the plan leaves the first value of the year (spec 0025, RG9).
    const janStart = hasData(monthKey(year, 0)) ? round2([...checkedKeys].reduce((s, k) => s + bal(k, monthKey(year - 1, 11)), 0)) : null;
    plan = linearPlan(series, year, target, goal.due, janStart);
  }
  const planAtRef = refIdx < 0 ? null : plan[refIdx];
  const planned = planAtRef === null ? null : Math.min(planAtRef, target);
  const dueMonth = due ? due.slice(0, 7) : null;
  const remainingMonths = ref === null ? 1 : dueMonth ? Math.max(1, monthsBetween(ref, dueMonth)) : 1;
  return {
    ...base,
    defined,
    status: amountStatus(current, target, planned),
    pct,
    left,
    plan,
    ...empty,
    planned,
    gap: planned === null ? null : round2(current - planned),
    perMonth: planned === null ? null : round2(left / remainingMonths),
  };
}

/** The expense lines a ceiling can watch (credits, fixed, variable), once per key, in the order they appear in the model then the months. */
export function expenseLines(d: BudgetData): { key: string; name: string; block: 'cre' | 'fix' | 'var'; section: string }[] {
  const seen = new Map<string, { key: string; name: string; block: 'cre' | 'fix' | 'var'; section: string }>();
  for (const l of knownLines(d)) {
    if ((l.block === 'cre' || l.block === 'fix' || l.block === 'var') && !seen.has(l.key)) seen.set(l.key, { key: l.key, name: l.name, block: l.block, section: l.section });
  }
  return [...seen.values()];
}
