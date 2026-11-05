import { realMovements } from './bankMovements';
import { addMonths, compareMonths, round2 } from './format';
import { bankDateOf } from './lineExpenses';
import { periodOf } from './periods';
import type { BudgetData, Envelope, MonthKey } from './types';

/*
 * History of an envelope's two balances (spec 0026, RG16 to RG19): derived, read-only lists, from the opening to the end of a month.
 * « Virtuel » reads the REAL movements of the envelope's account (so a pointed allocation, which is fictive, is not in it, D16);
 * « Espèces » reads the cash parts of the months (spec 0037, RG11, RG13) and the expenses paid in cash. Each row carries the balance after it.
 */

export interface HistoryRow {
  /** `YYYY-MM-DD`. */
  date: string;
  label: string;
  /** Signed: positive = in. */
  amount: number;
  /** Balance of the list after this row. */
  balance: number;
  /** The opening row, a movement of the account / a funding, an expense, or a correction of the cash balance (spec 0026, RG34). */
  kind: 'opening' | 'movement' | 'expense' | 'adjustment';
  /** Id of the `CashAdjustment` for an `adjustment` row (so the screen can delete it). */
  id?: string;
}

/** The date is at or before the end of the period of `m` (spec 0039, RG9). */
const upTo = (d: BudgetData, date: string, m: MonthKey) => date <= periodOf(d, m).end;

/** Rows in chronological order (stable: same-day entries keep their order), the running balance filled in from the opening row. */
function withBalances(date: string, opening: number, moves: Omit<HistoryRow, 'balance'>[]): HistoryRow[] {
  const sorted = moves.map((x, i) => ({ x, i })).sort((a, b) => a.x.date.localeCompare(b.x.date) || a.i - b.i).map(e => e.x);
  let balance = round2(opening);
  const rows: HistoryRow[] = [{ date, label: 'Ouverture', amount: balance, balance, kind: 'opening' }];
  for (const x of sorted) {
    balance = round2(balance + x.amount);
    rows.push({ ...x, balance });
  }
  return rows;
}

const openingMonthOf = (d: BudgetData, e: Envelope): MonthKey | undefined => d.accounts.find(a => a.id === e.accountId)?.openingMonth;

/** « Virtuel » list: the opening of the account, then each real movement of the account up to the end of `m`. Empty for an unknown envelope or a month before the opening. */
export function virtualHistory(d: BudgetData, envelopeId: string, m: MonthKey): HistoryRow[] {
  const e = d.envelopes.find(x => x.id === envelopeId);
  const account = e && d.accounts.find(a => a.id === e.accountId);
  if (!e || !account || compareMonths(m, account.openingMonth) < 0) return [];
  const moves: Omit<HistoryRow, 'balance'>[] = [];
  for (let k = account.openingMonth; compareMonths(k, m) <= 0; k = addMonths(k, 1)) {
    for (const mv of realMovements(d, account.id, k)) moves.push({ date: mv.date, label: mv.label, amount: mv.amount, kind: mv.kind === 'expense' ? 'expense' : 'movement' });
  }
  return withBalances(periodOf(d, account.openingMonth).start, account.openingBalance, moves);
}

/** The cash part of each recorded month from `start` to `m` as « Part du mois » rows (in), dated the first day of its period. */
function cashParts(d: BudgetData, envelopeId: string, start: MonthKey, m: MonthKey): Omit<HistoryRow, 'balance'>[] {
  return Object.keys(d.months)
    .filter(k => compareMonths(k, start) >= 0 && compareMonths(k, m) <= 0 && (d.months[k].cashPart?.[envelopeId] ?? 0) > 0)
    .sort(compareMonths)
    .map((k): Omit<HistoryRow, 'balance'> => ({ date: periodOf(d, k).start, label: 'Part du mois', amount: d.months[k].cashPart![envelopeId], kind: 'movement' }));
}

/**
 * « Espèces » list: the opening cash, then the cash part of each month from the opening month (in, dated the 1st), the expenses paid in cash (out)
 * and the adjustments of the cash balance (signed, spec 0026 RG34) up to the end of `m`. `opening` replaces the envelope's opening cash (to test a new one). Empty before the account opens.
 */
export function cashHistory(d: BudgetData, envelopeId: string, m: MonthKey, opening?: number): HistoryRow[] {
  const e = d.envelopes.find(x => x.id === envelopeId);
  const start = e && openingMonthOf(d, e);
  if (!e || !start || compareMonths(m, start) < 0) return [];
  const moves: Omit<HistoryRow, 'balance'>[] = [
    ...cashParts(d, e.id, start, m),
    ...d.transactions
      .filter(t => t.type === 'env' && t.target === e.id && t.payMode === 'especes' && upTo(d, bankDateOf(t, d), m))
      .map((t): Omit<HistoryRow, 'balance'> => ({ date: bankDateOf(t, d), label: t.label, amount: -t.amount, kind: 'expense' })),
    // Last, so that on a given day an adjustment comes after all the other moves of that day, expenses included (the sort is stable).
    ...(d.cashAdjustments ?? [])
      .filter(a => a.envelopeId === e.id && upTo(d, a.date, m))
      .map((a): Omit<HistoryRow, 'balance'> => ({ date: a.date, label: 'Ajustement', amount: a.amount, kind: 'adjustment', id: a.id })),
  ];
  return withBalances(periodOf(d, start).start, opening ?? e.openingCash, moves);
}

/** Cash balance of an envelope at the end of a day (every row dated that day or before it, adjustments included); 0 before its opening. Not clamped. */
export const cashBalanceAt = (d: BudgetData, envelopeId: string, date: string): number =>
  cashHistory(d, envelopeId, '9999-12').filter(r => r.date <= date).at(-1)?.balance ?? 0;

/**
 * Lowest balance the cash list reaches (to refuse an opening or an adjustment that would make it negative, D11, RG30). From the first row without
 * `from`; with `from` (`YYYY-MM-DD`), from that day on: the balance at the end of that day and every row dated that day or after it.
 */
export function lowestCashBalance(d: BudgetData, envelopeId: string, opening: number, from?: string): number {
  const rows = cashHistory(d, envelopeId, '9999-12', opening);
  if (from === undefined) return Math.min(...rows.map(r => r.balance));
  const atFrom = rows.filter(r => r.date <= from).at(-1)?.balance;
  return Math.min(...rows.filter(r => r.date >= from).map(r => r.balance), ...(atFrom === undefined ? [] : [atFrom]));
}
