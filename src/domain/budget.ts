import { isLineInBudget, isOnMainAccount, isTransactionInBudget } from './bank';
import { addMonths, compareMonths, parseMonth, round2 } from './format';
import { accounts, Ledger, monthAlloc, monthLines } from './ledger';
import type { BlockKey, BudgetData, Line, MonthKey } from './types';

/** Blocks where getting more than budgeted is favourable. */
export const isIncomeLike = (b: BlockKey) => b === 'rev' || b === 'epa' || b === 'inv';

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/** Écart: positive when favourable. Null while the actual is not entered. */
export function lineGap(l: Line): number | null {
  if (l.actual === null) return null;
  return round2(isIncomeLike(l.block) ? l.actual - l.budget : l.budget - l.actual);
}

/**
 * Restant of a variable line: what is left to spend (budget − actual), an empty actual counting for 0.
 * Same value as the écart of a variable line, but defined even before any expense (spec 0008, RG9, RG11).
 */
export const lineRemaining = (l: Line): number => round2(l.budget - (l.actual ?? 0));

/**
 * Actual of a variable line computed from the month's `var` transactions on it, whatever the account
 * paying them, in budget or not (spec 0008, RG1). Null when there is none.
 */
export function varActualFromTx(d: BudgetData, m: MonthKey, key: string): number | null {
  const txs = d.transactions.filter(t => t.month === m && t.type === 'var' && t.target === key);
  return txs.length ? round2(txs.reduce((s, t) => s + t.amount, 0)) : null;
}

/** Lines whose actual can be taken as equal to the budget: no actual yet, not a variable line (its actual comes from transactions), non-zero budget. */
export const lineNeedsActual = (l: Line) => l.actual === null && l.block !== 'var' && l.budget !== 0;

/** The month's lines without an entered actual (out-of-budget account lines included, they stay listed). */
export const linesWithoutActual = (d: BudgetData, m: MonthKey): Line[] => (d.months[m]?.initialized ? d.months[m].lines.filter(lineNeedsActual) : []);

export function blockTotals(lines: Line[], block: BlockKey) {
  const ls = lines.filter(l => l.block === block);
  const budget = sum(ls.map(l => l.budget));
  const actual = sum(ls.map(l => l.actual ?? 0));
  return { budget, actual, gap: round2(isIncomeLike(block) ? actual - budget : budget - actual) };
}

/** The month's lines that count in the budget figures: those of an out-of-budget account are left out (RG17). */
export const budgetLines = (d: BudgetData, m: MonthKey): Line[] => monthLines(d, m).filter(l => isLineInBudget(d, l));

/** « Restant des variables »: budget − actual of the variable lines that count in the budget (a line out of the budget is informative, spec 0009, RG106). */
export function variableRemaining(d: BudgetData, m: MonthKey): number {
  const t = blockTotals(budgetLines(d, m), 'var');
  return round2(t.budget - t.actual);
}

/** The plan of the month: budgeted income − budgeted expenses (envelope allocations included) − budgeted savings. */
function remainingToPlace(d: BudgetData, m: MonthKey): number {
  const lines = budgetLines(d, m);
  const b = (k: BlockKey) => blockTotals(lines, k).budget;
  const allocSum = sum(Object.values(monthAlloc(d, m)));
  return round2(b('rev') - (b('cre') + b('fix') + b('var') + allocSum) - (b('epa') + b('inv')));
}

/**
 * Money the user can place now (RG1): the planned « Reste à placer », minus the
 * budgets of income that does not land on the main account, plus the income
 * gaps of the main account, minus what is paid into savings and investments
 * beyond (or short of) their budget. Null for a month that is not initialized (RG9).
 */
export function availableReal(d: BudgetData, m: MonthKey): number | null {
  if (!d.months[m]?.initialized) return null;
  const lines = budgetLines(d, m);
  const income = lines.filter(l => l.block === 'rev');
  const elsewhere = sum(income.filter(l => !isOnMainAccount(d, l.accountId)).map(l => l.budget));
  const mainGaps = sum(income.filter(l => isOnMainAccount(d, l.accountId)).map(l => lineGap(l) ?? 0));
  const paidIn = sum(lines.filter(l => l.block === 'epa' || l.block === 'inv').map(l => lineGap(l) ?? 0));
  return round2(remainingToPlace(d, m) - elsewhere + mainGaps - paidIn);
}

/**
 * « Surplus »: the margin of the account, from the real figures. Real income minus everything that leaves
 * (credits, expenses, savings, investments, envelope allocations). A line without an actual yet counts at its budget,
 * as when the month is validated. Meant to stay at 0 or above.
 */
export function surplus(d: BudgetData, m: MonthKey): number {
  const lines = budgetLines(d, m);
  const real = (k: BlockKey) => sum(lines.filter(l => l.block === k).map(l => l.actual ?? l.budget));
  const allocSum = sum(Object.values(monthAlloc(d, m)));
  return round2(real('rev') - (real('cre') + real('fix') + real('var') + real('epa') + real('inv') + allocSum));
}

export interface MonthSummary {
  /** Margin of the account from the real figures (see `surplus`). */
  surplus: number;
  income: number;
  expenses: number;
  savings: number;
  remaining: number;
  /** Money that can really be placed now; null while the month is not initialized. */
  availableReal: number | null;
  /** Savings + investments + monthly envelope allocations, as budgeted. */
  grossSavings: number;
  /** Real savings over income, in %. */
  savingsRate: number;
  /** Gross savings over income, in %. */
  grossSavingsRate: number;
  paidIn: number;
  envelopeSpent: number;
  savingsOut: number;
  realSavings: number;
  emergency: number;
  investTotal: number;
}

export function monthSummary(d: BudgetData, ledger: Ledger, m: MonthKey): MonthSummary {
  const lines = budgetLines(d, m);
  const b = (k: BlockKey) => blockTotals(lines, k).budget;
  const allocSum = sum(Object.values(monthAlloc(d, m)));
  const income = b('rev');
  const expenses = round2(b('cre') + b('fix') + b('var') + allocSum);
  const savings = round2(b('epa') + b('inv'));
  const paidIn = round2(blockTotals(lines, 'epa').actual + blockTotals(lines, 'inv').actual);
  const txs = d.transactions.filter(t => t.month === m && isTransactionInBudget(d, t));
  const envelopeSpent = sum(txs.filter(t => t.type === 'env').map(t => t.amount));
  const savingsOut = sum(txs.filter(t => t.type === 'epa').map(t => t.amount));
  const rate = (v: number) => (income ? (v / income) * 100 : 0);
  const grossSavings = round2(savings + allocSum);
  const realSavings = round2(grossSavings - envelopeSpent - savingsOut);
  const bal = (key: string) => ledger.accMonth(key, m)?.balance ?? 0;
  return {
    surplus: surplus(d, m),
    income,
    expenses,
    savings,
    remaining: remainingToPlace(d, m),
    availableReal: availableReal(d, m),
    grossSavings,
    savingsRate: rate(realSavings),
    grossSavingsRate: rate(grossSavings),
    paidIn,
    envelopeSpent,
    savingsOut,
    realSavings,
    emergency: sum(d.settings.emergencyAccounts.map(bal)),
    investTotal: sum(accounts(d).filter(a => a.block === 'inv').map(a => bal(a.key))),
  };
}

export interface TemplateSummary {
  /** Same plan as the month's « Reste à placer », computed on the budget model. */
  remaining: number;
  /** (épargnes + investissements + allocations) / revenus, as the month's gross savings rate. */
  savingsRate: number;
}

/** Indications of the budget model: what a month created from it would show. */
export function templateSummary(d: BudgetData): TemplateSummary {
  const lines = d.template.lines.map((l): Line => ({ ...l, actual: null })).filter(l => isLineInBudget(d, l));
  const b = (k: BlockKey) => blockTotals(lines, k).budget;
  const allocSum = sum(Object.values(d.template.envAlloc));
  const income = b('rev');
  const saved = round2(b('epa') + b('inv') + allocSum);
  return {
    remaining: round2(income - (b('cre') + b('fix') + b('var') + allocSum) - (b('epa') + b('inv'))),
    savingsRate: income ? (saved / income) * 100 : 0,
  };
}

export interface EnvelopeAlert {
  envelopeId: string;
  planned: number;
  available: number;
  missing: number;
  labels: string[];
}

/** Envelopes whose planned expenses for the month exceed what they can spend. */
export function envelopeAlerts(d: BudgetData, ledger: Ledger, year: number, month: number): EnvelopeAlert[] {
  const out: EnvelopeAlert[] = [];
  for (const e of d.envelopes) {
    const items = d.planned.filter(p => p.envelopeId === e.id && p.year === year && p.month === month);
    if (!items.length) continue;
    const planned = sum(items.map(p => p.amount));
    const available = ledger.envAvailable(e.id, year, month);
    if (available !== null && planned > available)
      out.push({ envelopeId: e.id, planned, available, missing: round2(planned - available), labels: items.map(p => p.label) });
  }
  return out;
}

/** Popover figures for a line: year-to-date actual, and the previous month's écart (restant for a variable line). */
export function lineHistory(d: BudgetData, m: MonthKey, key: string) {
  const { year } = parseMonth(m);
  let cumul = 0;
  for (const [k, md] of Object.entries(d.months)) {
    if (!md.initialized || parseMonth(k).year !== year || compareMonths(k, m) > 0) continue;
    cumul += md.lines.find(l => l.key === key)?.actual ?? 0;
  }
  const prev = d.months[addMonths(m, -1)];
  const pl = prev?.initialized ? prev.lines.find(l => l.key === key) : undefined;
  return { cumul: round2(cumul), prevGap: pl ? (pl.block === 'var' ? lineRemaining(pl) : lineGap(pl)) : null };
}
