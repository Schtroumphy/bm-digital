import { CASH_ACCOUNT_ID, isAccountInBudget, kindOf } from './bank';
import { flowOf, realMovements } from './bankMovements';
import { balanceDateBounds, realBalanceOn, realMonthBalance, statementGap, type MonthBalance } from './checkoff';
import { inPeriod } from './periods';
import type { AccountBalanceEntry, AccountKind, BankAccount, BudgetData, MonthKey } from './types';

/*
 * Page « Relevé » (spec 0041): for each account concerned by a month, the statement typed from the bank, its gap with the REAL balance
 * and its status. A statement is « en règle » when it exists and the gap is exactly 0 (RG10). Pure functions only; nothing is stored.
 */

/** À saisir: no statement. Écart: statement with a gap. Validé / Régularisé: gap 0 (Régularisé = at least one active adjustment in the period). Aucun mouvement: not concerned. */
export type ReleveStatus = 'to-enter' | 'gap' | 'validated' | 'regularised' | 'no-movement';

export interface ReleveRow {
  account: BankAccount;
  /** Group of the page: the kind of the account (courant, épargne, invest, enveloppe). */
  kind: AccountKind;
  /** Real balance of the month (start and end). */
  real: MonthBalance;
  inflow: number;
  outflow: number;
  /** Date proposed or shown for the statement: the statement's own date, else the default one (RG7). Null when nothing can be dated (future month). */
  date: string | null;
  /** Real balance expected at `date`, that day included. */
  expected: number | null;
  statement: AccountBalanceEntry | null;
  gap: number | null;
  status: ReleveStatus;
  /** False for an account with no movement and no balance: listed, but never blocking (RG2). */
  concerned: boolean;
  /** In the budget? An account out of the budget is mentioned as such (RG2). */
  inBudget: boolean;
}

/** Order of the groups of the page (RG2). */
export const RELEVE_KINDS: { kind: AccountKind; title: string }[] = [
  { kind: 'courant', title: 'Comptes courants' },
  { kind: 'epargne', title: 'Épargne' },
  { kind: 'invest', title: 'Investissements' },
  { kind: 'enveloppe', title: 'Enveloppes' },
];

/** Default date of a statement: the end of the period, or today when it is still ahead; null in a month that has not started (RG7). */
export function defaultStatementDate(d: BudgetData, m: MonthKey, today: string): string | null {
  const { min, max } = balanceDateBounds(d, m, today);
  return min <= max ? max : null;
}

/** The row of one account for a month, or null when it is not listed: the reserved cash account (RG5) or an account not open by `m` (RG4). */
function rowOf(d: BudgetData, m: MonthKey, a: BankAccount, today: string): ReleveRow | null {
  const real = realMonthBalance(d, m, a.id);
  if (a.id === CASH_ACCOUNT_ID || !real) return null;
  const movements = realMovements(d, a.id, m);
  const flow = flowOf(movements);
  const statement = d.months[m]?.accountBalances?.[a.id] ?? null;
  const date = statement?.on ?? defaultStatementDate(d, m, today);
  const gap = statementGap(real, statement, movements);
  const noMovement = real.start === 0 && movements.length === 0;
  let status: ReleveStatus;
  if (noMovement) status = 'no-movement';
  else if (!statement) status = 'to-enter';
  else if (gap !== 0) status = 'gap';
  else status = (d.adjustments ?? []).some(x => x.accountId === a.id && !x.cancelledOn && inPeriod(d, m, x.date)) ? 'regularised' : 'validated';
  return {
    account: a, kind: kindOf(a), real, inflow: flow.in, outflow: flow.out, date, expected: date === null ? null : realBalanceOn(real, movements, date),
    statement, gap, status, concerned: !noMovement, inBudget: isAccountInBudget(d, a.id),
  };
}

/** Rows of the page for a month, concerned accounts first in each group, then the ones with no movement (RG2). Empty for a month not initialized. */
export function releveRows(d: BudgetData, m: MonthKey, today: string): ReleveRow[] {
  if (!d.months[m]?.initialized) return [];
  const rows = d.accounts.flatMap(a => rowOf(d, m, a, today) ?? []);
  return rows.sort((a, b) => Number(!a.concerned) - Number(!b.concerned));
}

/** Whether the gap of a row can be regularised: a gap to fill, on any account, out of the budget included (an adjustment only moves the real balance of the account). */
export const canRegularise = (r: ReleveRow): boolean => r.status === 'gap';

/** Whether a row is « en règle » (RG10). */
export const isInOrder = (r: ReleveRow): boolean => r.status === 'validated' || r.status === 'regularised';

/** Counter of the page: concerned accounts in order / concerned accounts (RG11). */
export function releveCount(rows: ReleveRow[]): { ok: number; total: number } {
  const concerned = rows.filter(r => r.concerned);
  return { ok: concerned.filter(isInOrder).length, total: concerned.length };
}

/** Why an account holds back the closing (RG15). */
export interface ReleveFailure {
  accountId: string;
  name: string;
  reason: 'missing' | 'gap';
  /** The gap, for `reason: 'gap'`. */
  gap: number;
}

/** The concerned accounts of month `m` whose statement is missing or in gap (RG13). */
export function releveFailures(d: BudgetData, m: MonthKey, today: string): ReleveFailure[] {
  return releveRows(d, m, today)
    .filter(r => r.concerned && !isInOrder(r))
    .map((r): ReleveFailure => ({ accountId: r.account.id, name: r.account.name, reason: r.status === 'to-enter' ? 'missing' : 'gap', gap: r.gap ?? 0 }));
}
