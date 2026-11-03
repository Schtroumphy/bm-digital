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
  /** The opening row, a movement of the account / a funding, or an expense. */
  kind: 'opening' | 'movement' | 'expense';
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
 * « Espèces » list: the opening cash, then the cash part of each month from the opening month (in, dated the 1st) and the expenses paid in cash (out)
 * up to the end of `m`. `opening` replaces the envelope's opening cash (to test a new one). Empty before the account opens.
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
  ];
  return withBalances(periodOf(d, start).start, opening ?? e.openingCash, moves);
}

/** Lowest balance the cash list reaches in the whole history (to refuse an opening that would make it negative, D11). */
export const lowestCashBalance = (d: BudgetData, envelopeId: string, opening: number): number =>
  Math.min(...cashHistory(d, envelopeId, '9999-12', opening).map(r => r.balance));
