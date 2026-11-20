import { isAccountTransfer, isLineInBudget } from '../domain/bank';
import { isMonthLocked } from '../domain/ledger';
import { followOrder, moveInZone } from '../domain/ordering';
import type { BudgetData, Line, MonthKey } from '../domain/types';

/*
 * Reordering of the lines of a month (spec 0055).
 * Only the order changes: no key, amount, actual or section is touched.
 */

/**
 * The lines a line can be swapped with, in display order: same block, same section, and for variable lines the same side of the
 * « Hors budget » group. Account transfers are not shown in the blocks, so they are not part of any zone (RG4).
 * Empty for an unknown line or a month not initialized.
 */
export function lineZone(d: BudgetData, m: MonthKey, key: string): Line[] {
  const md = d.months[m];
  const line = md?.initialized ? md.lines.find(l => l.key === key) : undefined;
  if (!line || isAccountTransfer(d, line)) return [];
  const off = !isLineInBudget(d, line);
  return md.lines.filter(l => l.block === line.block && l.section === line.section && !isAccountTransfer(d, l) && (line.block !== 'var' || !isLineInBudget(d, l) === off));
}

/**
 * Moves a line to `toIndex` (0 = first) among the lines of its zone, in the month and in the budget model (RG7, RG8).
 * In the model, the lines of the same block and section that the month also holds follow the same relative order; the others stay in place,
 * and a line missing from the model is not added to it. Other months are untouched (RG9).
 * Refused (false) on a locked month, a month not initialized, an unknown line, a position outside the zone, or when nothing moves.
 */
export function moveLine(d: BudgetData, m: MonthKey, key: string, toIndex: number): boolean {
  if (isMonthLocked(d, m)) return false;
  const zone = lineZone(d, m, key);
  if (zone.length === 0) return false;
  const inZone = new Set(zone.map(l => l.key));
  const lines = moveInZone(d.months[m].lines, l => inZone.has(l.key), l => l.key === key, toIndex);
  if (!lines) return false;
  d.months[m].lines = lines;
  const { block, section } = zone[0];
  const order = lines.filter(l => inZone.has(l.key)).map(l => l.key);
  d.template.lines = followOrder(d.template.lines, l => (l.block === block && l.section === section ? l.key : ''), order);
  return true;
}
