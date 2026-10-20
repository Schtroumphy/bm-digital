import { addMonths, compareMonths, currentMonthKey, round2 } from '../domain/format';
import { lineNeedsActual } from '../domain/budget';
import { isMonthLocked } from '../domain/ledger';
import type { BlockKey, BudgetData, Envelope, EnvHistory, Line, MonthKey, Transaction } from '../domain/types';
import type { SetupDraft, SetupRow } from './setup';

/** Recomputes a variable line's actual from the month's transactions, when it has any. */
function varActualFromTx(d: BudgetData, m: MonthKey, key: string): number | null {
  const txs = d.transactions.filter(t => t.month === m && t.type === 'var' && t.target === key);
  return txs.length ? round2(txs.reduce((s, t) => s + t.amount, 0)) : null;
}

function initMonth(d: BudgetData, m: MonthKey, lines: Line[], alloc: Record<string, number>) {
  d.months[m] = {
    initialized: true,
    lines: lines.map(l => ({ ...l, actual: l.block === 'var' ? varActualFromTx(d, m, l.key) : null })),
    alloc: { ...alloc },
    transfersDone: d.months[m]?.transfersDone ?? {},
  };
}

/** Creates the month's lines and allocations from the budget model. */
export function applyTemplate(d: BudgetData, m: MonthKey) {
  initMonth(d, m, d.template.lines.map(l => ({ ...l, actual: null })), d.template.envAlloc);
}

/** Creates the month from the previous month's budgets (actuals start empty). */
export function duplicatePrevious(d: BudgetData, m: MonthKey): boolean {
  const prev = d.months[addMonths(m, -1)];
  if (!prev?.initialized) return false;
  initMonth(d, m, prev.lines, prev.alloc);
  return true;
}

export function saveAsTemplate(d: BudgetData, m: MonthKey) {
  const md = d.months[m];
  if (!md?.initialized) return;
  d.template = { lines: md.lines.map(({ actual: _actual, ...l }) => l), envAlloc: { ...md.alloc } };
}

/** Months the assistant can start from: one year before to one year after today, never before an existing first month. */
export function setupMonths(d: BudgetData, today = currentMonthKey()): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = addMonths(today, -12); compareMonths(k, addMonths(today, 12)) <= 0; k = addMonths(k, 1)) {
    if (d.firstMonth === null || compareMonths(k, d.firstMonth) >= 0) out.push(k);
  }
  return out;
}

export const isSetupMonthAllowed = (d: BudgetData, m: MonthKey, today = currentMonthKey()) => setupMonths(d, today).includes(m);

/** True when creating the month would overwrite lines already there (the UI asks for confirmation first). */
export const willReplaceMonth = (d: BudgetData, m: MonthKey) => !!d.months[m]?.initialized;

/** OKLCH hues given to envelopes, in order. */
const ENVELOPE_HUES = [300, 170, 350, 240, 75, 130, 190, 25];

/**
 * Creates the first month from the assistant's draft: the month's lines, the
 * budget model (`template`), the envelopes and the starting balances.
 *
 * Starting balances are the balances on the 1st day of the month, i.e. the
 * ones at the end of the previous month. We therefore store them as a
 * statement (accounts) and an imported-history entry (envelopes) of the
 * previous month, which the Ledger already reads as opening balances
 * (see docs/adr/0001-soldes-de-depart-via-le-mois-precedent.md).
 *
 * Returns false, and changes nothing, when the month is not allowed.
 */
export function createFirstMonth(d: BudgetData, draft: SetupDraft, today = currentMonthKey()): boolean {
  const m = draft.month;
  if (!isSetupMonthAllowed(d, m, today)) return false;
  const rows = draft.rows;

  const line = (block: BlockKey, r: SetupRow, section = ''): Line => ({ key: r.id, block, section, name: r.name.trim() || 'Sans nom', budget: r.amount, actual: null });
  const lines: Line[] = [
    ...rows.rev.map(r => line('rev', r)),
    ...rows.cre.map(r => line('cre', r)),
    ...rows.dep.filter(r => r.kind === 'fix').map(r => line('fix', r)),
    ...rows.dep.filter(r => r.kind !== 'fix').map(r => line('var', r)),
    ...rows.epa.map(r => line('epa', r, r.kind === 'MT' ? 'Épargne moyen terme' : 'Épargne long terme')),
    ...rows.inv.map(r => line('inv', r)),
  ];
  const envelopes: Envelope[] = rows.env.map((r, i) => ({
    id: r.id,
    name: r.name.trim() || 'Sans nom',
    hue: ENVELOPE_HUES[i % ENVELOPE_HUES.length],
    cash: Math.min(r.cash, r.balance),
  }));
  const envAlloc = Object.fromEntries(rows.env.map(r => [r.id, r.amount]));

  d.template = { lines: lines.map(({ actual: _actual, ...l }) => l), envAlloc };
  d.envelopes = envelopes;
  initMonth(d, m, lines, envAlloc);

  const before = addMonths(m, -1);
  d.statements[before] = Object.fromEntries([...rows.epa, ...rows.inv].map(r => [r.id, r.balance]));
  d.envHistory[before] = Object.fromEntries(rows.env.map((r): [string, EnvHistory] => [r.id, { alloc: 0, spent: 0, balance: r.balance }]));
  if (d.firstMonth === null) d.firstMonth = m;
  return true;
}

export function addLine(d: BudgetData, m: MonthKey, block: BlockKey, key: string) {
  const lines = d.months[m].lines;
  let idx = -1;
  lines.forEach((l, i) => l.block === block && (idx = i));
  const section = idx >= 0 ? lines[idx].section : '';
  const line: Line = { key, block, section, name: 'Nouvelle ligne', budget: 0, actual: null };
  lines.splice(idx >= 0 ? idx + 1 : lines.length, 0, line);
}

export function updateLine(d: BudgetData, m: MonthKey, key: string, patch: Partial<Pick<Line, 'name' | 'budget' | 'actual'>>) {
  const l = d.months[m].lines.find(x => x.key === key);
  if (l) Object.assign(l, patch);
}

export function deleteLine(d: BudgetData, m: MonthKey, key: string) {
  d.months[m].lines = d.months[m].lines.filter(l => l.key !== key);
}

/** An actual copied from the budget by `validateMonth`, kept to be able to undo it. */
export interface ValidatedLine {
  key: string;
  value: number;
}

/**
 * Considers the actual equal to the budget for every line without an actual
 * (see `lineNeedsActual`). Never overwrites an entered actual. Does nothing
 * for a month that is not initialized or is locked. Returns the lines filled.
 */
export function validateMonth(d: BudgetData, m: MonthKey): ValidatedLine[] {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return [];
  const filled: ValidatedLine[] = [];
  for (const l of md.lines) {
    if (!lineNeedsActual(l)) continue;
    l.actual = l.budget;
    filled.push({ key: l.key, value: l.budget });
  }
  return filled;
}

/** Undoes `validateMonth`: only the lines whose actual is still the copied value go back to empty. */
export function undoValidateMonth(d: BudgetData, m: MonthKey, filled: ValidatedLine[]) {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return;
  for (const { key, value } of filled) {
    const l = md.lines.find(x => x.key === key);
    if (l && l.actual === value) l.actual = null;
  }
}

/** Records a transaction; a variable expense also raises its line's actual. */
export function addTransaction(d: BudgetData, t: Transaction) {
  d.transactions.push(t);
  if (t.type !== 'var') return;
  const l = d.months[t.month]?.lines.find(x => x.key === t.target);
  if (l) l.actual = round2((l.actual ?? 0) + t.amount);
}

export function deleteTransaction(d: BudgetData, id: string) {
  const t = d.transactions.find(x => x.id === id);
  if (!t) return;
  d.transactions = d.transactions.filter(x => x.id !== id);
  if (t.type !== 'var') return;
  const l = d.months[t.month]?.lines.find(x => x.key === t.target);
  if (l) l.actual = round2((l.actual ?? 0) - t.amount);
}

export function setStatement(d: BudgetData, m: MonthKey, key: string, v: number | null) {
  const rec = (d.statements[m] ??= {});
  if (v === null) delete rec[key];
  else rec[key] = v;
}

/** CSV of the month's lines, in the French spreadsheet dialect (semicolons, decimal commas). */
export function monthCsv(lines: Line[], blockTitles: Record<BlockKey, string>): string {
  const n = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = lines.map(l => [q(blockTitles[l.block]), q(l.section), q(l.name), n(l.budget), n(l.actual)].join(';'));
  return '﻿' + ['Bloc;Section;Nom;Budget;Réel', ...rows].join('\r\n');
}
