import { blockTotals, budgetLines, estimatedBalance, estimatedBalanceTotal, monthSummary } from './budget';
import { envelopeAccountTotal } from './envelopeCash';
import { bankDateOf } from './lineExpenses';
import { goalsOfYear } from './goals';
import { compareMonths, monthKey, round2 } from './format';
import { monthAlloc, type Ledger } from './ledger';
import type { BlockKey, BudgetData, MonthKey } from './types';

/*
 * Vue annuelle (spec 0044). Read-only assembly of existing calculations (`monthSummary`, `blockTotals`, `budgetLines`, the envelope months of the
 * Ledger): nothing is stored, the screen only displays what `yearView` returns. A month is either « shown » (it has figures) or not (null cells).
 */

export type YearMode = 'budget' | 'real';

/** How the « Total » column reads a row (RG12): a sum, a mean of the filled months, or the last filled month. */
export type YearTotalKind = 'sum' | 'mean' | 'last';

export interface YearRow {
  /** One value per month, January first; null for a month without figures (RG5). */
  values: (number | null)[];
  total: YearTotalKind;
  /** A zero value is shown « — » (RG7). */
  dashZero: boolean;
  /**
   * Estimated balance of the associated bank account (spec 0007) at the last shown month of the year; null when the row has no account
   * or no balance is known. Only `epa` / `inv` rows carry it.
   */
  balance?: number | null;
}

export interface YearLine extends YearRow {
  name: string;
}

export interface YearSection {
  /** Empty for a block without sections (Enveloppes). */
  title: string;
  lines: YearLine[];
}

export type YearBlockId = BlockKey | 'env' | 'pln';

export interface YearBlock extends YearRow {
  id: YearBlockId;
  label: string;
  sections: YearSection[];
}

export interface YearMonthHead {
  month: MonthKey;
  /** Whether the month has figures in the chosen mode. */
  shown: boolean;
  caption: '' | 'en cours' | 'non init.' | 'avant le début';
}

export interface YearSummary {
  remaining: YearRow;
  /** Savings rate in % (gross when budgeted, real otherwise). */
  rate: YearRow;
  grossSavings: YearRow;
  realSavings: YearRow;
  investTotal: YearRow;
  income: YearRow;
  expenses: YearRow;
}

export type YearSeriesId = 'rev' | 'cre' | 'fix' | 'var' | 'pln' | 'sav';

/** One curve of the chart (RG21): a value per month, null for a month without figures. */
export interface YearSeries {
  id: YearSeriesId;
  label: string;
  values: (number | null)[];
}

/** The four cards at the top (RG19); every amount is null when no month has figures (RG25). */
export interface YearKpis {
  income: number | null;
  incomeMean: number | null;
  expenses: number | null;
  planned: number | null;
  savings: number | null;
  /** Savings over income, in %. */
  savingsPct: number | null;
  /** Income − expenses − savings. */
  left: number | null;
}

export type YearSliceId = YearSeriesId | 'left';

/** A part of the pie (RG22): never negative; pct = share of the year's income. */
export interface YearSlice {
  id: YearSliceId;
  label: string;
  amount: number;
  pct: number;
}

export interface YearViewData {
  year: number;
  mode: YearMode;
  /** At least one month has figures (RG25). */
  hasData: boolean;
  months: YearMonthHead[];
  blocks: YearBlock[];
  summary: YearSummary;
  series: YearSeries[];
  kpis: YearKpis;
  /** Parts of the pie in display order; empty when there is no data. */
  pie: YearSlice[];
  /** Target of the first « savings rate » goal of the year (spec 0032); null when there is none (RG13). */
  rateTarget: number | null;
  /** Sum of the account balances of the savings, envelope and investment blocks (last line of the table); null when none is known. */
  balanceTotal: number | null;
}

const BLOCKS: { id: YearBlockId; label: string }[] = [
  { id: 'rev', label: 'Revenus' },
  { id: 'cre', label: 'Crédits et dettes' },
  { id: 'fix', label: 'Dépenses fixes' },
  { id: 'var', label: 'Dépenses variables' },
  { id: 'pln', label: 'Dépenses prévues' },
  { id: 'epa', label: 'Épargnes' },
  { id: 'env', label: 'Enveloppes' },
  { id: 'inv', label: 'Investissements' },
];

const sum = (xs: number[]) => round2(xs.reduce((a, b) => a + b, 0));

/**
 * « Total » (or « Moyenne ») of a row (RG6, RG12). Only the months with a value count; the mean divides by that count, never by 12.
 * Null when no month has a value.
 */
export function rowTotal(row: YearRow, average: boolean): number | null {
  const vs = row.values.filter((v): v is number => v !== null);
  if (vs.length === 0) return null;
  const mean = round2(sum(vs) / vs.length);
  if (average) return mean;
  if (row.total === 'mean') return mean;
  if (row.total === 'last') return vs[vs.length - 1];
  return sum(vs);
}

/** The savings rate goal of the year, by creation order (RG13). */
export const yearRateTarget = (d: BudgetData, year: number): number | null => goalsOfYear(d, year).find(g => g.kind === 'rate')?.target ?? null;

export function yearView(d: BudgetData, ledger: Ledger, year: number, mode: YearMode, today: MonthKey): YearViewData {
  const keys = Array.from({ length: 12 }, (_, i) => monthKey(year, i));
  const initialized = keys.map(k => !!d.months[k]?.initialized);
  const beforeStart = keys.map(k => d.firstMonth === null || compareMonths(k, d.firstMonth) < 0);
  // RG5: budgeted = every initialized month, even a future one; real = every month from the first one to the current one, initialized or not.
  const shown = keys.map((k, i) => (mode === 'budget' ? initialized[i] : !beforeStart[i] && compareMonths(k, today) <= 0));
  const caption = (k: MonthKey, i: number): YearMonthHead['caption'] =>
    beforeStart[i] ? 'avant le début' : k === today ? 'en cours' : !initialized[i] ? 'non init.' : '';
  const months: YearMonthHead[] = keys.map((k, i) => ({ month: k, shown: shown[i], caption: caption(k, i) }));

  const perMonth = <T>(f: (m: MonthKey) => T): (T | null)[] => keys.map((k, i) => (shown[i] ? f(k) : null));
  const summaries = perMonth(k => monthSummary(d, ledger, k));
  const lines = perMonth(k => budgetLines(d, k));
  const fromSummary = (f: (s: ReturnType<typeof monthSummary>) => number | null): (number | null)[] => summaries.map(s => (s ? f(s) : null));
  const planned = plannedBlock(d, keys, shown, year);

  const blocks: YearBlock[] = BLOCKS.map(({ id, label }) => {
    if (id === 'env') return envelopesBlock(d, ledger, keys, shown, mode, label);
    if (id === 'pln') return planned;
    const values = lines.map(ls => {
      if (!ls) return null;
      const t = blockTotals(ls, id);
      return mode === 'budget' ? t.budget : t.actual;
    });
    return { id, label, values, total: 'sum', dashZero: false, sections: sectionsOf(d, ledger, keys, shown, id, mode), balance: lastBalance(d, ledger, keys, shown, id) };
  });

  const row = (values: (number | null)[], total: YearTotalKind, dashZero = false): YearRow => ({ values, total, dashZero });
  const summary: YearSummary =
    mode === 'budget'
      ? {
          remaining: row(fromSummary(s => s.remaining), 'mean'),
          rate: row(fromSummary(s => s.grossSavingsRate), 'mean'),
          grossSavings: row(fromSummary(s => s.grossSavings), 'sum'),
          // The real savings are not known for a budget (RG12).
          realSavings: row(keys.map(() => null), 'sum'),
          investTotal: row(fromSummary(s => s.investTotal), 'last'),
          income: row(fromSummary(s => s.income), 'sum'),
          expenses: row(fromSummary(s => s.expenses), 'sum'),
        }
      : {
          remaining: row(fromSummary(s => s.availableReal), 'mean'),
          rate: row(fromSummary(s => s.savingsRate), 'mean'),
          grossSavings: row(fromSummary(s => s.grossSavings), 'sum'),
          realSavings: row(fromSummary(s => s.realSavings), 'sum'),
          investTotal: row(fromSummary(s => s.investTotal), 'last'),
          income: row(lines.map(ls => (ls ? blockTotals(ls, 'rev').actual : null)), 'sum'),
          expenses: row(fromSummary(s => s.expensesReal), 'sum'),
        };

  const blockValues = (id: BlockKey | 'pln') => blocks.find(b => b.id === id)!.values;
  const series: YearSeries[] = [
    { id: 'rev', label: 'Revenus', values: blockValues('rev') },
    { id: 'cre', label: 'Crédits', values: blockValues('cre') },
    { id: 'fix', label: 'Charges fixes', values: blockValues('fix') },
    { id: 'var', label: 'Dépenses variables', values: blockValues('var') },
    { id: 'pln', label: 'Dépenses prévues', values: blockValues('pln') },
    // Gross savings for a budget, real savings for the real figures (Q3).
    { id: 'sav', label: 'Épargne et placements', values: fromSummary(s => (mode === 'budget' ? s.grossSavings : s.realSavings)) },
  ];
  const hasData = shown.some(Boolean);
  const { kpis, pie } = yearTotals(series, hasData);

  return { year, mode, hasData, months, blocks, summary, series, kpis, pie, rateTarget: yearRateTarget(d, year), balanceTotal: balanceTotal(blocks) };
}

const seriesSum = (s: YearSeries) => sum(s.values.filter((v): v is number => v !== null));

/** Cards (RG19) and pie parts (RG22) from the year's series. Everything is summed over the months that have figures. */
function yearTotals(series: YearSeries[], hasData: boolean): { kpis: YearKpis; pie: YearSlice[] } {
  if (!hasData) return { kpis: { income: null, incomeMean: null, expenses: null, planned: null, savings: null, savingsPct: null, left: null }, pie: [] };
  const total = (id: YearSeriesId) => seriesSum(series.find(s => s.id === id)!);
  const count = series[0].values.filter(v => v !== null).length;
  const income = total('rev');
  const planned = total('pln');
  const expenses = round2(total('cre') + total('fix') + total('var') + planned);
  const savings = total('sav');
  const left = round2(income - expenses - savings);
  const kpis: YearKpis = { income, incomeMean: round2(income / count), expenses, planned, savings, savingsPct: income ? round2((savings / income) * 100) : 0, left };
  const slice = (id: YearSliceId, label: string, value: number): YearSlice => {
    const amount = Math.max(0, value);
    return { id, label, amount, pct: income > 0 ? round2((amount / income) * 100) : 0 };
  };
  const pie = [
    slice('cre', 'Crédits', total('cre')),
    slice('fix', 'Charges fixes', total('fix')),
    slice('var', 'Dépenses variables', total('var')),
    slice('pln', 'Dépenses prévues', planned),
    slice('sav', 'Épargne et placements', savings),
    slice('left', 'Reste à vivre', left),
  ];
  return { kpis, pie };
}

/** « Dépenses prévues » (RG20): the planned expenses of « Prévisionnel », by month, one line per label; the same in both modes. */
function plannedBlock(d: BudgetData, keys: MonthKey[], shown: boolean[], year: number): YearBlock {
  const items = d.planned.filter(p => p.year === year);
  const names = [...new Set(items.map(p => p.label))];
  const lines: YearLine[] = names.map(name => ({
    name,
    values: keys.map((_, i) => {
      if (!shown[i]) return null;
      const its = items.filter(p => p.month === i && p.label === name);
      return its.length ? sum(its.map(p => p.amount)) : null;
    }),
    total: 'sum',
    dashZero: true,
  }));
  const values = keys.map((_, i) => (shown[i] ? sum(items.filter(p => p.month === i).map(p => p.amount)) : null));
  return { id: 'pln', label: 'Dépenses prévues', values, total: 'sum', dashZero: false, sections: lines.length ? [{ title: '', lines }] : [] };
}

/** Sections and lines of a budget block (RG9): grouped by section and line name over the year's initialized shown months, in order of appearance. */
function sectionsOf(d: BudgetData, ledger: Ledger, keys: MonthKey[], shown: boolean[], block: BlockKey, mode: YearMode): YearSection[] {
  const sections = new Map<string, Map<string, (number | null)[]>>();
  // Balance of the account of each line (section + name), read at the last shown month where the line exists.
  const balances = new Map<string, number | null>();
  keys.forEach((k, i) => {
    if (!shown[i] || !d.months[k]?.initialized) return;
    for (const l of budgetLines(d, k)) {
      if (l.block !== block) continue;
      const lines = sections.get(l.section) ?? new Map<string, (number | null)[]>();
      sections.set(l.section, lines);
      // A line absent from a month stays null there (RG9): its total and mean only cover the months where it exists.
      const values = lines.get(l.name) ?? keys.map(() => null);
      lines.set(l.name, values);
      values[i] = round2((values[i] ?? 0) + (mode === 'budget' ? l.budget : (l.actual ?? 0)));
      if (l.linkedAccountId) balances.set(`${l.section}\u0000${l.name}`, estimatedBalance(d, ledger, k, l)?.value ?? null);
    }
  });
  return [...sections].map(([title, lines]) => ({
    title,
    lines: [...lines].map(([name, values]) => ({ name, values, total: 'sum' as const, dashZero: true, balance: balances.get(`${title}\u0000${name}`) ?? null })),
  }));
}

/** Estimated balance of the accounts of a savings/investment block at its last shown month (shared accounts count once); null for other blocks. */
function lastBalance(d: BudgetData, ledger: Ledger, keys: MonthKey[], shown: boolean[], block: BlockKey): number | null {
  if (block !== 'epa' && block !== 'inv') return null;
  const i = shown.lastIndexOf(true);
  if (i < 0 || !d.months[keys[i]]?.initialized) return null;
  return estimatedBalanceTotal(d, ledger, keys[i], block);
}

/** « Enveloppes » (RG10): budgeted = monthly allocation, real = net spending of the envelope (spent minus the money that came back). */
function envelopesBlock(d: BudgetData, ledger: Ledger, keys: MonthKey[], shown: boolean[], mode: YearMode, label: string): YearBlock {
  const last = shown.lastIndexOf(true);
  const lines: YearLine[] = d.envelopes.map(e => ({
    name: e.name,
    values: keys.map((k, i) => (!shown[i] ? null : mode === 'budget' ? (monthAlloc(d, k)[e.id] ?? 0) : (ledger.envMonth(e.id, k)?.spent ?? 0))),
    total: 'sum',
    dashZero: true,
    // Balance of the envelope's account (virtual + cash) at the last shown month.
    balance: last < 0 ? null : (envelopeAccountTotal(d, ledger, e.id, keys[last])?.total ?? null),
  }));
  const values = keys.map((_, i) => (shown[i] ? sum(lines.map(l => l.values[i] ?? 0)) : null));
  const known = lines.map(l => l.balance).filter((b): b is number => b !== null && b !== undefined);
  return { id: 'env', label, values, total: 'sum', dashZero: false, balance: known.length ? sum(known) : null, sections: lines.length ? [{ title: '', lines }] : [] };
}

function balanceTotal(blocks: YearBlock[]): number | null {
  const known = blocks.map(b => b.balance).filter((b): b is number => b !== null && b !== undefined);
  return known.length ? sum(known) : null;
}

/**
 * « Détails » of a line (right click): the detail field of the real entries of the line over the year, oldest first, one block per entry
 * (date, label, amount, then the detail). An entry without detail is listed too; empty text when the line has no entry.
 * A budget line is found by its section and name in every month of the year; an envelope (block `env`) by its name.
 */
export function yearLineDetails(d: BudgetData, year: number, block: YearBlockId, section: string, name: string): string {
  if (block === 'pln') return '';
  const targets = new Set<string>();
  if (block === 'env') {
    for (const e of d.envelopes) if (e.name === name) targets.add(e.id);
  } else {
    for (let i = 0; i < 12; i++) {
      const k = monthKey(year, i);
      if (!d.months[k]?.initialized) continue;
      for (const l of budgetLines(d, k)) if (l.block === block && l.section === section && l.name === name) targets.add(l.key);
    }
  }
  const prefix = `${year}-`;
  const txs = d.transactions
    .filter(t => t.month.startsWith(prefix) && targets.has(t.target))
    .sort((a, b) => (bankDateOf(a, d) < bankDateOf(b, d) ? -1 : bankDateOf(a, d) > bankDateOf(b, d) ? 1 : 0));
  return txs
    .map(t => {
      const [, mm, dd] = bankDateOf(t, d).split('-');
      return `${dd}/${mm} · ${t.label} · ${t.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${t.detail ? `\n${t.detail}` : ''}`;
    })
    .join('\n\n');
}
