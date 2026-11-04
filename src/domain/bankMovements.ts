import { accountIdOf, isSavingsBlock } from './bank';
import { round2 } from './format';
import { bankDateOf } from './lineExpenses';
import { creditDateOf, debitDateOf, isEnvelopesPool, movementAccountName } from './internalTransfers';
import { budgetStart, inPeriod, periodOf } from './periods';
import type { BudgetData, MonthKey, Transaction } from './types';

/** Émoji de fin de libellé d'un mouvement (légende affichée dans le détail du compte : `MOVE_LEGEND`). */
export const MOVE_MARK = { expense: '💸', entry: '📥', withdrawal: '🏧', transfer: '🔁', saving: '🐖' } as const;
export const MOVE_LEGEND: { mark: string; meaning: string }[] = [
  { mark: MOVE_MARK.expense, meaning: 'dépense' },
  { mark: MOVE_MARK.entry, meaning: 'entrée d’argent' },
  { mark: MOVE_MARK.withdrawal, meaning: 'retrait' },
  { mark: MOVE_MARK.transfer, meaning: 'transfert' },
  { mark: MOVE_MARK.saving, meaning: 'versement d’épargne' },
];

/*
 * The money movements of a bank account in a month, dated and signed (positive = in), (spec 0019): `realMovements` holds only real entries
 * (expenses, entries of money, transfers, adjustments). They make the REAL balance, the one compared with the bank statement.
 * The estimated balance and its fictive pointage movements were removed by spec 0043.
 */

export interface BankMovement {
  /** `YYYY-MM-DD`. */
  date: string;
  label: string;
  amount: number;
  kind: 'line' | 'expense' | 'transfer' | 'adjustment';
  /** Expense or entry of money: the budget item it is attached to (line or envelope name) and its nature, for the account's movement list. */
  imputation?: { name: string; type: Transaction['type'] };
  /** Key of the line, for a line or a check. */
  lineKey?: string;
  adjustmentId?: string;
  /** The month of the budget the entry is attached to, when it differs from the month of its bank date (spec 0015, RG4): for the tooltip. */
  attachedMonth?: MonthKey;
  /** Attached to the month but dated in another one: listed for information, counted in the balance of its bank date's month. */
  outOfMonth?: boolean;
  /** One face of a transfer between two accounts. */
  counterpart?: boolean;
  /** Dated before the start of the budget: in no period, counted in no balance, listed for information only (spec 0039, RG17). */
  beforeBudget?: boolean;
}

/** An expense paid in cash, envelope (spec 0026) or variable line (spec 0037, RG7): it moves no bank account. */
const isCashExpense = (t: Transaction) => (t.type === 'env' || t.type === 'var') && t.payMode === 'especes';

/** Debit of a transaction side: a withdrawal from savings and an entry of money are money in, the others money out. */
const isMoneyIn = (type: string) => type === 'epa' || type === 'rev' || type === 'envin' || type === 'accin';

/** Label of a transaction in a list of movements: a mark by nature; an entry on an envelope says so (spec 0036, RG12); an expense funded by savings says so (spec 0035, RG4). */
const movementLabel = (d: BudgetData, t: Transaction): string => {
  if (t.type === 'epd') return `${MOVE_MARK.expense} ${t.label} (${savingsExpenseWord(d, t)})`;
  return t.type === 'envin' ? `${MOVE_MARK.entry} ${t.label} (entrée sur enveloppe)` : t.type === 'accin' ? `${MOVE_MARK.entry} ${t.label} (entrée sur compte hors budget)` : `${t.type === 'epa' ? MOVE_MARK.withdrawal : t.type === 'rev' ? MOVE_MARK.entry : MOVE_MARK.expense} ${t.label}`;
};

/** Qualifier of an expense funded by savings in the account's list (spec 0035, RG4): names the savings line it is categorised by. */
const savingsExpenseWord = (d: BudgetData, t: Transaction): string => {
  const name = (d.months[t.month]?.lines ?? []).find(l => l.key === t.target)?.name;
  return name ? `dépense depuis l’épargne · ${name}` : 'dépense depuis l’épargne';
};

/** Name of the budget item an expense or an entry is attached to; empty when it was deleted. */
function imputationOf(d: BudgetData, t: Transaction): { name: string; type: Transaction['type'] } {
  const md = d.months[t.month];
  const name = t.type === 'accin' ? d.accounts.find(a => a.id === t.target)?.name : t.type === 'env' || t.type === 'envin' ? d.envelopes.find(e => e.id === t.target)?.name : (md?.initialized ? md.lines : d.template.lines).find(l => l.key === t.target)?.name;
  return { name: name ?? 'Supprimé', type: t.type };
}

/** Whether a date is in the period of month `m`, read once (spec 0039, RG9). */
function periodTest(d: BudgetData, m: MonthKey): (date: string) => boolean {
  const p = periodOf(d, m);
  return date => date >= p.start && date <= p.end;
}

/**
 * Both faces of the transfers of an account dated in a month: the same in the real and the estimated balance. Each face has its own date
 * (spec 0016, RG14); « Enveloppes (global) » is not an account, so its side is never a movement (RG25, RG27).
 */
function transferMovements(d: BudgetData, id: string, m: MonthKey): BankMovement[] {
  const out: BankMovement[] = [];
  const nameOf = (accountId: string) => movementAccountName(d, accountId);
  const within = periodTest(d, m);
  for (const mv of d.accountMovements ?? []) {
    if (mv.amount === 0) continue;
    if (mv.fromAccountId === id && !isEnvelopesPool(id) && within(debitDateOf(mv, d))) out.push({ date: debitDateOf(mv, d), label: `${MOVE_MARK.transfer} ${mv.label} → ${nameOf(mv.toAccountId)}`, amount: -mv.amount, kind: 'transfer', counterpart: true });
    // A cash withdrawal (`CASH_ID`) credits no account: only its source is debited (spec 0037, RG1).
    if (mv.toAccountId === id && !isEnvelopesPool(id) && within(creditDateOf(mv, d))) out.push({ date: creditDateOf(mv, d), label: `${MOVE_MARK.transfer} ${mv.label} depuis ${nameOf(mv.fromAccountId)}`, amount: mv.amount, kind: 'transfer', counterpart: true });
  }
  return out;
}

/** Real entries of an account in a month: transactions, transfers (both faces), active adjustments. Nothing from the budget (RG1, RG2). */
export function realMovements(d: BudgetData, id: string, m: MonthKey): BankMovement[] {
  const out: BankMovement[] = [];
  const md = d.months[m];
  const lines = md?.initialized ? md.lines : [];
  const within = periodTest(d, m);
  // Money leaving a dedicated account when it is withdrawn from its savings line (spec 0007).
  const linked = lines.filter(l => isSavingsBlock(l.block) && l.linkedAccountId === id);
  for (const t of d.transactions) {
    // Balances rank an entry by its date at the bank, in the period of the month, not by its month of attachment (spec 0015, RG2; spec 0039, RG9).
    const date = bankDateOf(t, d);
    if (!within(date)) continue;
    const attached = inPeriod(d, t.month, date) ? undefined : t.month;
    if (t.type === 'epa' && linked.some(l => l.key === t.target)) {
      out.push({ date, label: `${MOVE_MARK.withdrawal} ${t.label} (${linked.find(l => l.key === t.target)!.name})`, amount: -t.amount, kind: 'expense' });
    }
    // An envelope expense paid in cash leaves the envelope's cash balance, never its account (spec 0026, RG6).
    if (isCashExpense(t) || accountIdOf(d, t.accountId) !== id) continue;
    out.push({ date, label: movementLabel(d, t), amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), ...(attached ? { attachedMonth: attached } : {}) });
  }
  // A transfer is real: both faces count, whatever the budget status of the accounts (RG2, RG12).
  out.push(...transferMovements(d, id, m));
  for (const a of d.adjustments ?? []) {
    if (a.accountId === id && !a.cancelledOn && within(a.date)) out.push({ date: a.date, label: a.label, amount: a.amount, kind: 'adjustment', adjustmentId: a.id });
  }
  return out;
}

/**
 * Entries of an account dated before the start of the budget (spec 0039, RG17): in no period, so in no balance. The account's detail lists them,
 * flagged `beforeBudget`, with their real date; both faces of a transfer count. Adjustments are not concerned (they are dated inside a month's period).
 */
export function beforeBudgetMovements(d: BudgetData, id: string): BankMovement[] {
  const start = budgetStart(d);
  if (start === null) return [];
  const out: BankMovement[] = [];
  for (const t of d.transactions) {
    const date = bankDateOf(t, d);
    if (date >= start || isCashExpense(t) || accountIdOf(d, t.accountId) !== id) continue;
    out.push({ date, label: movementLabel(d, t), amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), attachedMonth: t.month, beforeBudget: true });
  }
  for (const mv of d.accountMovements ?? []) {
    if (mv.amount === 0 || isEnvelopesPool(id)) continue;
    if (mv.fromAccountId === id && debitDateOf(mv, d) < start) out.push({ date: debitDateOf(mv, d), label: `${MOVE_MARK.transfer} ${mv.label} → ${movementAccountName(d, mv.toAccountId)}`, amount: -mv.amount, kind: 'transfer', counterpart: true, beforeBudget: true });
    if (mv.toAccountId === id && creditDateOf(mv, d) < start) out.push({ date: creditDateOf(mv, d), label: `${MOVE_MARK.transfer} ${mv.label} depuis ${movementAccountName(d, mv.fromAccountId)}`, amount: mv.amount, kind: 'transfer', counterpart: true, beforeBudget: true });
  }
  return out;
}

/**
 * Entries of an account attached to a month whose bank date falls in another month (spec 0015, RG4). They are counted in the balance of
 * the month of their bank date, never in this one: the account's movement list shows them for information, flagged `outOfMonth`.
 */
export function attachedMovements(d: BudgetData, id: string, m: MonthKey): BankMovement[] {
  const out: BankMovement[] = [];
  const within = periodTest(d, m);
  for (const t of d.transactions) {
    const date = bankDateOf(t, d);
    if (t.month !== m || within(date) || isCashExpense(t) || accountIdOf(d, t.accountId) !== id) continue;
    out.push({ date, label: movementLabel(d, t), amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), attachedMonth: t.month, outOfMonth: true });
  }
  return out;
}

/**
 * Money in and out of a movement list, split by the sign of each movement. A negative amount (for instance a negative
 * actual) therefore lands in the other column than its nature suggests; the net balance (in − out) is identical.
 */
export function flowOf(movements: { amount: number }[]): { in: number; out: number } {
  return {
    in: round2(movements.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0)),
    out: round2(-movements.filter(x => x.amount < 0).reduce((s, x) => s + x.amount, 0)),
  };
}
