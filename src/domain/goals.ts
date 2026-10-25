import { goalAccountKeys, monthSummary } from './budget';
import { compareMonths, currentMonthKey, monthKey, parseMonth, round2 } from './format';
import { accounts, type Ledger } from './ledger';
import type { BudgetData, MonthKey } from './types';

/** The three annual goals of the Objectifs screen (spec 0025). */
export type GoalId = 'emergency' | 'invest' | 'savings';
export type GoalStatus = 'Atteint' | 'En bonne voie' | 'En progression' | 'À rattraper' | 'À définir';

export interface GoalAccount {
  key: string;
  name: string;
  /** Balance at the end of the reference month. */
  balance: number;
  checked: boolean;
}

export interface GoalView {
  id: GoalId;
  name: string;
  /** « amount » goals sum account balances; the savings rate goal is a percentage. */
  kind: 'amount' | 'rate';
  target: number;
  /** `YYYY-MM-DD`; only for amount goals. */
  due?: string;
  /** False while the target is 0 or no account is ticked: the card shows « À définir » (RG14). */
  defined: boolean;
  status: GoalStatus;
  year: number;
  referenceMonth: MonthKey;
  current: number;
  /** min(100, current / target × 100); 0 when not defined. */
  pct: number;
  /** What is left to reach the target (never negative). */
  left: number;
  /** One value per month of the year (January to December); null = no data, the curve is interrupted. */
  series: (number | null)[];
  /** Linear plan, same shape as `series`; null everywhere when there is no plan. */
  plan: (number | null)[];
  accounts: GoalAccount[];
  /** Ticked accounts that exist. */
  checkedCount: number;
  /** Amount goals with a plan: planned to date, gap to the plan, amount to put aside per month. Null = « — ». */
  planned: number | null;
  gap: number | null;
  perMonth: number | null;
  /** Savings rate goal: average over the months with data, months at or above the target, months with data, gap in points. */
  average: number | null;
  monthsAbove: number;
  monthsKnown: number;
  rateGap: number | null;
}

/** Latest initialized month that is not in the future; otherwise the first managed month; null before the first month exists (RG2). */
export function referenceMonth(d: BudgetData, today: MonthKey = currentMonthKey()): MonthKey | null {
  if (d.firstMonth === null) return null;
  const ready = Object.keys(d.months)
    .filter(m => d.months[m].initialized && compareMonths(m, today) <= 0)
    .sort();
  return ready.at(-1) ?? d.firstMonth;
}

/** Months between two month keys (`b` − `a`), negative when `b` is earlier. */
export const monthsBetween = (a: MonthKey, b: MonthKey): number => {
  const pa = parseMonth(a);
  const pb = parseMonth(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
};

/**
 * Linear plan of an amount goal over the 12 months of the year (RG9): from the start value at the first month with data
 * to the target at the due month, then flat at the target. No plan (all null) without a due date or with a due month before the start.
 */
export function linearPlan(series: (number | null)[], year: number, target: number, due: string | undefined): (number | null)[] {
  const none = series.map(() => null);
  const first = series.findIndex(v => v !== null);
  if (!due || first < 0) return none;
  const dueMonth = due.slice(0, 7);
  const n = monthsBetween(monthKey(year, first), dueMonth);
  if (n < 0) return none;
  const start = series[first] as number;
  return series.map((_, i) => {
    if (i < first) return null;
    if (n === 0) return target;
    return round2(start + ((target - start) * Math.min(i - first, n)) / n);
  });
}

/** Status of an amount goal (RG11). `planned` is null without a plan. */
export function amountStatus(current: number, target: number, planned: number | null): GoalStatus {
  if (current >= target) return 'Atteint';
  if (planned === null) return 'En progression';
  const ratio = planned > 0 ? current / planned : Infinity;
  return ratio >= 1 ? 'En bonne voie' : ratio >= 0.85 ? 'En progression' : 'À rattraper';
}

export const rateStatus = (current: number, target: number): GoalStatus => (current >= target ? 'Atteint' : 'À rattraper');

const NAMES: Record<GoalId, (target: number) => string> = {
  emergency: () => 'Fonds de secours',
  invest: target => `Investir ${String(target / 1000).replace('.', ',')}K`,
  savings: () => 'Taux d’épargne',
};

/** Everything the card of a goal shows, computed from the data (spec 0025). */
export function goalView(d: BudgetData, ledger: Ledger, id: GoalId, today: MonthKey = currentMonthKey()): GoalView | null {
  const ref = referenceMonth(d, today);
  if (ref === null || d.firstMonth === null) return null;
  const first = d.firstMonth;
  const year = parseMonth(ref).year;
  const st = d.settings;
  const kind = id === 'savings' ? 'rate' : 'amount';
  const target = id === 'emergency' ? st.emergencyTarget : id === 'invest' ? st.investTarget : st.savingsRateTarget;
  const due = id === 'emergency' ? st.emergencyDue : id === 'invest' ? st.investDue : undefined;

  const all = accounts(d);
  const keys = kind === 'amount' ? goalAccountKeys(d, id as 'emergency' | 'invest') : [];
  const checkedKeys = new Set(keys.filter(k => all.some(a => a.key === k)));
  const bal = (key: string, m: MonthKey) => ledger.accMonth(key, m)?.balance ?? 0;
  const goalAccounts: GoalAccount[] = kind === 'amount' ? all.map(a => ({ key: a.key, name: a.name, balance: bal(a.key, ref), checked: checkedKeys.has(a.key) })) : [];

  const hasData = (m: MonthKey) => !!d.months[m]?.initialized && compareMonths(m, first) >= 0 && compareMonths(m, ref) <= 0;
  const valueAt = (m: MonthKey) => (kind === 'rate' ? monthSummary(d, ledger, m).savingsRate : round2([...checkedKeys].reduce((s, k) => s + bal(k, m), 0)));
  // January to December of the reference year; the reference month itself always has a value.
  const series = Array.from({ length: 12 }, (_, i) => {
    const m = monthKey(year, i);
    return hasData(m) || m === ref ? valueAt(m) : null;
  });
  const current = valueAt(ref);

  const defined = target > 0 && (kind === 'rate' || checkedKeys.size > 0);
  const base = { id, name: NAMES[id](target), kind, target, ...(due ? { due } : {}), year, referenceMonth: ref, current, series, accounts: goalAccounts, checkedCount: checkedKeys.size } as const;
  const empty = { planned: null, gap: null, perMonth: null, average: null, monthsAbove: 0, monthsKnown: 0, rateGap: null };
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
      average: known.reduce((s, v) => s + v, 0) / known.length,
      monthsAbove: known.filter(v => v >= target).length,
      monthsKnown: known.length,
      rateGap: current - target,
    };
  }
  const plan = linearPlan(series, year, target, due);
  const refIndex = parseMonth(ref).month;
  const planAtRef = plan[refIndex];
  const planned = planAtRef === null ? null : Math.min(planAtRef, target);
  const remainingMonths = due ? Math.max(1, monthsBetween(ref, due.slice(0, 7))) : 1;
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
