import { addMonths, round2 } from './format';
import type { BlockKey, BudgetData, Line, MonthKey, Transaction } from './types';

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
