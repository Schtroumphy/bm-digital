import { accountIdOf, mainAccount } from './bank';
import { isMonthInBalanceRange } from './balanceRange';
import { flowOf, realMovements, type BankMovement } from './bankMovements';
import { addMonths, compareMonths, parseMonth, round2 } from './format';
import { inPeriod, periodOf } from './periods';
import { closeKey, isYearClosed } from './ledger';
import type { AccountBalanceEntry, BudgetData, ExecMode, Line, MonthKey } from './types';


/*
 * Dates, execution modes, bank statements and the real detail of an account. Pure functions only.
 * (The pointage of lines was removed by spec 0043: see `comingUp.ts` for what is left to pay.)
 */

/** Modes shown in the picker, in order (RG18); `short` is the text of the chip on the line. */
export const EXEC_MODES: { value: ExecMode; label: string; short: string }[] = [
  { value: 'prelevement', label: 'Prélèvement automatique', short: 'prél.' },
  { value: 'virement_auto', label: 'Virement automatique', short: 'vir. auto' },
  { value: 'virement_manuel', label: 'Virement manuel', short: 'vir.' },
  { value: 'retrait', label: 'Retrait d’espèces', short: 'espèces' },
  { value: 'informatif', label: 'Informatif', short: 'info' },
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local date as `YYYY-MM-DD`. The clock is a parameter everywhere else, so tests can fix it. */
export const isoDate = (date: Date = new Date()): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, day] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && day >= 1 && day <= new Date(y, mo, 0).getDate();
}

/** `dd/mm` for a short display. */
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const daysInMonth = (m: MonthKey): number => {
  const { year, month } = parseMonth(m);
  return new Date(year, month + 1, 0).getDate();
};

/** Planned day brought back to the last day of a shorter month (RG16): 31 in a 30-day month gives 30. */
export const effectiveDueDay = (dueDay: number, m: MonthKey): number => Math.min(dueDay, daysInMonth(m));

/** Whole numbers 1 to 31 only. */
export const isValidDueDay = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31;

/** The account that has to pay for a line: its own, or the main account for a variable line (RG12). */
export function payerAccountId(d: BudgetData, l: Line): string {
  return l.block === 'var' ? mainAccount(d).id : accountIdOf(d, l.accountId);
}

/** Why a date of statement or adjustment is refused (RG32, RG62, RG65). */
export type BalanceDateError = 'invalid' | 'outside' | 'future';

/** Checks a date for month `m`: a real date, in the period of the month (spec 0039, RG22), not after `today`. Null = valid. */
export function validateBalanceDate(d: BudgetData, m: MonthKey, on: string, today: string): BalanceDateError | null {
  if (!isIsoDate(on)) return 'invalid';
  if (!inPeriod(d, m, on)) return 'outside';
  return on > today ? 'future' : null;
}

/** Range of a statement or adjustment date (RG32; spec 0039, RG22): the first to the last day of the period of the month, never after today. A month in the future gives min > max (nothing possible). */
export function balanceDateBounds(d: BudgetData, m: MonthKey, today: string): { min: string; max: string } {
  const p = periodOf(d, m);
  return { min: p.start, max: p.end < today ? p.end : today };
}

/** Start and end of a month for an account, from the single starting balance (RG57, RG58). */
export interface MonthBalance {
  start: number;
  end: number;
}

/**
 * Balance of a bank account at the end of a month: the opening balance of the Comptes tab, then month after month start of month =
 * end of the previous one, plus the month's movements (RG58). The year-close carry-over `bank:<id>` is the same for both chains.
 * Null before the account's opening month (RG57).
 */
function chainedBalance(d: BudgetData, m: MonthKey, accountId: string, movementsOf: (k: MonthKey) => BankMovement[]): MonthBalance | null {
  const account = d.accounts.find(a => a.id === accountId);
  if (!account || d.firstMonth === null || !isMonthInBalanceRange(d, account, m)) return null;
  let balance: number | undefined;
  let result: MonthBalance | null = null;
  for (let k = d.firstMonth; compareMonths(k, m) <= 0; k = addMonths(k, 1)) {
    if (!isMonthInBalanceRange(d, account, k)) continue;
    const { year, month } = parseMonth(k);
    const prevClose = month === 0 && isYearClosed(d, year - 1) ? d.closes[year - 1] : null;
    const start = prevClose?.overrides[closeKey('bank', accountId)] ?? (compareMonths(k, account.openingMonth) === 0 ? undefined : balance) ?? account.openingBalance;
    const flow = flowOf(movementsOf(k));
    balance = round2(start + flow.in - flow.out);
    result = { start, end: balance };
  }
  return result;
}

/** Real balance: real entries only (spec 0019, RG1). The same figure as the Ledger's `bankMonth`, computed without it. */
export const realMonthBalance = (d: BudgetData, m: MonthKey, accountId: string): MonthBalance | null => chainedBalance(d, m, accountId, k => realMovements(d, accountId, k));

/** One line of the detail of an account: a signed movement, counted or not in the real balance (a cancelled adjustment). */
export interface Movement {
  /** `YYYY-MM-DD` */
  date: string;
  label: string;
  /** Positive = money in, negative = money out. */
  amount: number;
  kind: BankMovement['kind'];
  /** False for a cancelled adjustment. */
  counted: boolean;
  /** Explanation shown next to a movement that is not counted. */
  note?: string;
  /** Month of the budget the entry is attached to when it differs from its bank date's month (tooltip, spec 0015, RG4). */
  attachedMonth?: MonthKey;
  lineKey?: string;
  adjustmentId?: string;
  cancelledOn?: string;
  createdOn?: string;
}

/** The movements of a view as detail lines, with the adjustments' dates of creation (RG27). */
function detailOf(d: BudgetData, list: BankMovement[]): Movement[] {
  const adjustments = new Map((d.adjustments ?? []).map(a => [a.id, a]));
  return list.map((x): Movement => ({ ...x, counted: true, ...(x.adjustmentId ? { createdOn: adjustments.get(x.adjustmentId)?.createdOn } : {}) }));
}

/** Real balance at the end of `date` (that day included): the start of the month plus the real movements dated up to it (spec 0009, RG63). */
export function realBalanceOn(real: MonthBalance, counted: { date: string; amount: number }[], date: string): number {
  const upTo = flowOf(counted.filter(x => x.date <= date));
  return round2(real.start + upTo.in - upTo.out);
}

/** Gap of a statement: the statement minus the REAL balance at its date (RG4, RG63); null without a statement or before the account opens. `counted` = the active real movements of the month. */
export function statementGap(real: MonthBalance | null, statement: AccountBalanceEntry | null, counted: { date: string; amount: number }[]): number | null {
  if (!statement || !real) return null;
  return round2(statement.amount - realBalanceOn(real, counted, statement.on));
}

/** Real movements of an account in a month sorted by date, cancelled adjustments included (struck through, not counted): where an error is looked for (spec 0041, RG6). */
export function accountRealDetail(d: BudgetData, m: MonthKey, accountId: string): Movement[] {
  const list = detailOf(d, realMovements(d, accountId, m));
  for (const a of d.adjustments ?? []) {
    if (a.accountId === accountId && a.cancelledOn && inPeriod(d, m, a.date)) {
      list.push({ date: a.date, label: a.label, amount: a.amount, kind: 'adjustment', counted: false, adjustmentId: a.id, cancelledOn: a.cancelledOn, createdOn: a.createdOn });
    }
  }
  return list.sort((a, b) => a.date.localeCompare(b.date));
}
