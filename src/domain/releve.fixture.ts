import { releveRows } from './releve';
import type { BudgetData, MonthKey } from './types';

/** Test helper: types, for every account concerned by month `m`, a statement equal to its real balance at the end of the period (gap 0), as a user who reconciled would. */
export function settleStatements(d: BudgetData, m: MonthKey, today = '2099-12-31'): void {
  for (const r of releveRows(d, m, today)) {
    if (!r.concerned || r.date === null || r.expected === null) continue;
    (d.months[m].accountBalances ??= {})[r.account.id] = { amount: r.expected, on: r.date };
  }
}
