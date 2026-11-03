import { accountIdOf, envelopeAccountAt, isAccountInBudget, isSavingsBlock, isTransactionAssigned, isTransactionOffBudget, mainAccount, resolveBoxAccountId } from './bank';
import { compareMonths, round2 } from './format';
import { bankDateOf } from './lineExpenses';
import { creditDateOf, debitDateOf, hasEnvelopesDebit, isEnvelopesPool, movementAccountName } from './internalTransfers';
import { isItemTransferred } from './movementTargets';
import { budgetStart, inPeriod, periodOf } from './periods';
import type { BudgetData, MonthKey, Transaction } from './types';

/** Émoji de fin de libellé d'un mouvement (légende affichée dans le détail du compte : `MOVE_LEGEND`). */
export const MOVE_MARK = { expense: '💸', entry: '📥', withdrawal: '🏧', transfer: '🔁', saving: '🐖', checked: '✅', received: '📩' } as const;
export const MOVE_LEGEND: { mark: string; meaning: string }[] = [
  { mark: MOVE_MARK.expense, meaning: 'dépense' },
  { mark: MOVE_MARK.entry, meaning: 'entrée d’argent' },
  { mark: MOVE_MARK.withdrawal, meaning: 'retrait' },
  { mark: MOVE_MARK.transfer, meaning: 'transfert' },
  { mark: MOVE_MARK.saving, meaning: 'versement d’épargne' },
  { mark: MOVE_MARK.checked, meaning: 'ligne pointée (estimé)' },
  { mark: MOVE_MARK.received, meaning: 'ligne reçue' },
];

/*
 * The money movements of a bank account in a month, dated and signed (positive = in), in two separate chains (spec 0019):
 * - `realMovements`: only real entries (expenses, entries of money, transfers, adjustments). They make the REAL balance, the one
 *   compared with the bank statement (RG1);
 * - `estimatedMovements`: the budget (checked lines and their counterparts, fictive) plus the entries that are exact for a `var`,
 *   envelope or savings item, plus the transfers. They make the ESTIMATED balance, which is informative (RG6, RG13).
 * A transfer is in both. Each chain reads each entry once (RG13).
 */

export interface BankMovement {
  /** `YYYY-MM-DD`. */
  date: string;
  label: string;
  amount: number;
  kind: 'line' | 'check' | 'expense' | 'transfer' | 'adjustment';
  /** Expense or entry of money: the budget item it is attached to (line or envelope name) and its nature, for the account's movement list. */
  imputation?: { name: string; type: Transaction['type'] };
  /** Key of the line, for a line or a check. */
  lineKey?: string;
  adjustmentId?: string;
  /** The month of the budget the entry is attached to, when it differs from the month of its bank date (spec 0015, RG4): for the tooltip. */
  attachedMonth?: MonthKey;
  /** Attached to the month but dated in another one: listed for information, counted in the balance of its bank date's month. */
  outOfMonth?: boolean;
  /** A counterpart between two accounts (checked allocation or variable line): the fictive money sent to another account. */
  counterpart?: boolean;
  /** Dated before the start of the budget: in no period, counted in no balance, listed for information only (spec 0039, RG17). */
  beforeBudget?: boolean;
  /** Comes from a check (pointage): a fictive debit or credit that never touches the real balance (RG6). */
  fictive?: boolean;
}

/** Where the amount counted for a line comes from (spec 0009, RG76). */
export type CountedSource = 'actual' | 'budget';

/**
 * Amount counted for a checked rev/cre/fix/epa/inv line in the estimated balance: its actual (the sum of its entries) when it has
 * one, otherwise its budget. The « Reste à sortir » and the « Revenus attendus » do NOT use it: they stay budgetary (RG7).
 */
export function countedAmount(l: { actual: number | null; budget: number }): { amount: number; source: CountedSource } {
  return l.actual !== null ? { amount: l.actual, source: 'actual' } : { amount: l.budget, source: 'budget' };
}

/** Key of an envelope's allocation check in `MonthData.checks` (a line key never contains a colon). */
export const envelopeCheckKey = (envelopeId: string) => `env:${envelopeId}`;

/** An expense paid in cash, envelope (spec 0026) or variable line (spec 0037, RG7): it moves no bank account. */
const isCashExpense = (t: Transaction) => (t.type === 'env' || t.type === 'var') && t.payMode === 'especes';

/** Debit of a transaction side: a withdrawal from savings and an entry of money are money in, the others money out. */
const isMoneyIn = (type: string) => type === 'epa' || type === 'rev';

/** Name of the budget item an expense or an entry is attached to; empty when it was deleted. */
function imputationOf(d: BudgetData, t: Transaction): { name: string; type: Transaction['type'] } {
  const md = d.months[t.month];
  const name = t.type === 'env' ? d.envelopes.find(e => e.id === t.target)?.name : (md?.initialized ? md.lines : d.template.lines).find(l => l.key === t.target)?.name;
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
    out.push({ date, label: `${t.type === 'epa' ? MOVE_MARK.withdrawal : t.type === 'rev' ? MOVE_MARK.entry : MOVE_MARK.expense} ${t.label}`, amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), ...(attached ? { attachedMonth: attached } : {}) });
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
    out.push({ date, label: `${t.type === 'epa' ? MOVE_MARK.withdrawal : t.type === 'rev' ? MOVE_MARK.entry : MOVE_MARK.expense} ${t.label}`, amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), attachedMonth: t.month, beforeBudget: true });
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
    out.push({ date, label: `${t.type === 'epa' ? MOVE_MARK.withdrawal : t.type === 'rev' ? MOVE_MARK.entry : MOVE_MARK.expense} ${t.label}`, amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), attachedMonth: t.month, outOfMonth: true });
  }
  return out;
}

/**
 * Movements of the estimated balance (RG8, RG9, RG10, RG12): the lines checked at their date and the fictive counterparts of checked
 * items, replaced by the transfers when the item has some; the `var`, envelope and savings expenses at their date; the transfers.
 * A month with no check holds no line movement. No adjustment, no entry of money, no expense on a fixed/credit line (those enter by their check),
 * except the ones assigned to a savings account or marked off budget (spec 0031), which leave the checked amount of their line and are read here (spec 0028, RG10).
 */
export function estimatedMovements(d: BudgetData, id: string, m: MonthKey): BankMovement[] {
  const out: BankMovement[] = [];
  const md = d.months[m];
  const main = mainAccount(d).id;
  const mine = (accountId?: string) => accountIdOf(d, accountId) === id;
  const nameOf = (accountId: string) => d.accounts.find(a => a.id === accountId)?.name ?? '';
  const lines = md?.initialized ? md.lines : [];
  // A transfer « vers enveloppes » in the month stands for every allocation of that month: none is counted, the main account is debited once (spec 0016, RG28).
  const pooled = hasEnvelopesDebit(d, m);
  const within = periodTest(d, m);

  // Money sent to another account, once checked, as a fictive counterpart. The main account is never touched by an account out of the
  // budget, which records its own side alone (spec 0009, RG92; spec 0019, RG12: only for fictive counterparts).
  const counterpart = (to: string, amount: number, date: string, name: string, key: string, toName: string, done: string = MOVE_MARK.checked) => {
    if (to === main || amount === 0) return;
    if (id === main && isAccountInBudget(d, to)) out.push({ date, label: `${done} ${name} → ${toName}`, amount: -amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
    else if (id === to) out.push({ date, label: `${done} ${name}`, amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
  };

  for (const l of lines) {
    const c = md.checks?.[l.key];
    if (!c) continue;
    if (l.block === 'var') {
      // A checked variable line sends its budget to its dedicated account, unless transfers stand for it (RG10).
      if (!isItemTransferred(d, m, { kind: 'line', key: l.key })) counterpart(resolveBoxAccountId(d, l), l.budget, c.doneOn, l.name, l.key, nameOf(resolveBoxAccountId(d, l)));
      continue;
    }
    // A checked savings/investment line is replaced by the transfers attached to it (both faces: payer debit and dedicated credit).
    if (isSavingsBlock(l.block) && isItemTransferred(d, m, { kind: 'line', key: l.key })) continue;
    // A line whose every entry is assigned to a savings account has no actual: it counts for nothing here (not its budget), the entries being read at their
    // date below, so the estimated balance stays what it was before the assignment (spec 0028, RG10, CA5). The checkbox of the Budget still shows the budget.
    const onlyAssigned = l.actual === null && d.transactions.some(t => (t.type === 'fix' || t.type === 'rev') && t.month === m && t.target === l.key && isTransactionOffBudget(t));
    const counted = onlyAssigned ? { amount: 0, source: 'actual' as const } : countedAmount(l);
    const sign = l.block === 'rev' ? 1 : -1;
    if (mine(l.accountId)) out.push({ date: c.doneOn, label: `${l.block === 'rev' ? MOVE_MARK.received : MOVE_MARK.checked} ${l.name}${counted.source === 'actual' ? ' (réel)' : ''}`, amount: sign * counted.amount, kind: 'check', lineKey: l.key, fictive: true });
    if (isSavingsBlock(l.block) && l.linkedAccountId === id) out.push({ date: c.doneOn, label: `${MOVE_MARK.saving} ${l.name}`, amount: counted.amount, kind: 'check', lineKey: l.key, fictive: true });
  }

  // Envelope allocations (spec 0011): read from the accounts of the envelopes, so that deleting an envelope leaves its past allocations in
  // the history. They move only once checked (RG8), from the main account to the envelope's account.
  if (md?.initialized) {
    for (const account of d.accounts) {
      if (!account.envelopeId || account.kind !== 'enveloppe' || compareMonths(m, account.openingMonth) < 0 || account.id === main) continue;
      // The cash part of the allocation does not go through the envelope's account: the main account is debited once, by the withdrawal (spec 0037, RG12).
      const amount = (md.alloc[account.envelopeId] ?? 0) - (md.cashPart?.[account.envelopeId] ?? 0);
      const key = envelopeCheckKey(account.envelopeId);
      const c = md.checks?.[key];
      if (amount === 0 || !c || pooled || isItemTransferred(d, m, { kind: 'env', id: account.envelopeId })) continue;
      if (id === main) out.push({ date: c.doneOn, label: `${MOVE_MARK.checked} Allocation → ${account.name}`, amount: -amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
      else if (id === account.id) out.push({ date: c.doneOn, label: `${MOVE_MARK.checked} Allocation ${account.name}`, amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
    }
    // Before its account exists, a checked allocation keeps the account recorded when it was checked (spec 0009, RG88, RG90, RG91; spec 0011, RG18).
    for (const e of d.envelopes) {
      const c = md.checks?.[envelopeCheckKey(e.id)];
      if (!pooled && !envelopeAccountAt(d, e, m) && c?.accountId) counterpart(c.accountId, (md.alloc[e.id] ?? 0) - (md.cashPart?.[e.id] ?? 0), c.doneOn, `Allocation ${e.name}`, envelopeCheckKey(e.id), nameOf(c.accountId), MOVE_MARK.checked);
    }
  }

  // Expenses of `var` lines, envelopes and savings accounts, at their date. A line `fix`/`cre`/`rev` is estimated by its check, never by its entries.
  const linked = lines.filter(l => isSavingsBlock(l.block) && l.linkedAccountId === id);
  for (const t of d.transactions) {
    if (t.type === 'fix' || t.type === 'rev') {
      // An entry assigned to a savings account leaves the counted amount of its checked line, so it is read here at its date: the account's estimated
      // balance stays what it was before the assignment, with no double count (spec 0028, RG10). A line not checked holds nothing, assigned or not.
      const date = bankDateOf(t, d);
      if (isTransactionOffBudget(t) && within(date) && mine(t.accountId) && d.months[t.month]?.checks?.[t.target]) {
        out.push({ date, label: `${t.type === 'rev' ? MOVE_MARK.entry : MOVE_MARK.expense} ${t.label} ${isTransactionAssigned(t) ? '(affectée)' : '(hors budget)'}`, amount: t.type === 'rev' ? t.amount : -t.amount, kind: 'expense' });
      }
      continue;
    }
    const date = bankDateOf(t, d);
    if (!within(date)) continue;
    if (t.type === 'epa' && linked.some(l => l.key === t.target)) {
      out.push({ date, label: `${MOVE_MARK.withdrawal} ${t.label} (${linked.find(l => l.key === t.target)!.name})`, amount: -t.amount, kind: 'expense' });
    }
    if (isCashExpense(t) || !mine(t.accountId)) continue;
    const attached = inPeriod(d, t.month, date) ? undefined : t.month;
    out.push({ date, label: `${t.type === 'epa' ? MOVE_MARK.withdrawal : MOVE_MARK.expense} ${t.label}`, amount: t.type === 'epa' ? t.amount : -t.amount, kind: 'expense', ...(attached ? { attachedMonth: attached } : {}) });
  }
  // Transfers are real and also count here, on both faces (RG9, RG12).
  out.push(...transferMovements(d, id, m));
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
