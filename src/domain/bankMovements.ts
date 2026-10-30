import { accountIdOf, envelopeAccountAt, isAccountInBudget, isSavingsBlock, isTransactionAssigned, isTransactionOffBudget, mainAccount, resolveBoxAccountId } from './bank';
import { compareMonths, round2 } from './format';
import { bankDateOf } from './lineExpenses';
import { creditDateOf, debitDateOf, hasEnvelopesDebit, isEnvelopesPool, movementAccountName } from './internalTransfers';
import { isCashFunding, isItemTransferred } from './movementTargets';
import type { BudgetData, MonthKey, Transaction } from './types';

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

/** An envelope expense paid in cash (spec 0026): it moves no bank account. */
const isCashExpense = (t: Transaction) => t.type === 'env' && t.payMode === 'especes';

/** Debit of a transaction side: a withdrawal from savings and an entry of money are money in, the others money out. */
const isMoneyIn = (type: string) => type === 'epa' || type === 'rev';

/** Word that qualifies a movement in the account's list: a withdrawal, an entry, an expense funded by savings (spec 0035, RG4), or a plain expense. */
const movementWord = (d: BudgetData, t: Transaction): string => {
  if (t.type === 'epa') return 'retrait';
  if (t.type === 'rev') return 'entrée';
  if (t.type !== 'epd') return 'dépense';
  const name = (d.months[t.month]?.lines ?? []).find(l => l.key === t.target)?.name;
  return name ? `dépense depuis l’épargne · ${name}` : 'dépense depuis l’épargne';
};

/** Name of the budget item an expense or an entry is attached to; empty when it was deleted. */
function imputationOf(d: BudgetData, t: Transaction): { name: string; type: Transaction['type'] } {
  const md = d.months[t.month];
  const name = t.type === 'env' ? d.envelopes.find(e => e.id === t.target)?.name : (md?.initialized ? md.lines : d.template.lines).find(l => l.key === t.target)?.name;
  return { name: name ?? 'Supprimé', type: t.type };
}

/**
 * Both faces of the transfers of an account dated in a month: the same in the real and the estimated balance. Each face has its own date
 * (spec 0016, RG14); « Enveloppes (global) » is not an account, so its side is never a movement (RG25, RG27).
 */
function transferMovements(d: BudgetData, id: string, m: MonthKey): BankMovement[] {
  const out: BankMovement[] = [];
  const nameOf = (accountId: string) => movementAccountName(d, accountId);
  for (const mv of d.accountMovements ?? []) {
    if (mv.amount === 0) continue;
    if (mv.fromAccountId === id && !isEnvelopesPool(id) && debitDateOf(mv).startsWith(m)) out.push({ date: debitDateOf(mv), label: `${mv.label} → ${nameOf(mv.toAccountId)} (transfert)`, amount: -mv.amount, kind: 'transfer', counterpart: true });
    // The cash funding of an envelope credits its cash balance, not its account (spec 0026, RG4).
    if (mv.toAccountId === id && !isEnvelopesPool(id) && !isCashFunding(d, mv) && creditDateOf(mv).startsWith(m)) out.push({ date: creditDateOf(mv), label: `${mv.label} depuis ${nameOf(mv.fromAccountId)} (transfert)`, amount: mv.amount, kind: 'transfer', counterpart: true });
  }
  return out;
}

/** Real entries of an account in a month: transactions, transfers (both faces), active adjustments. Nothing from the budget (RG1, RG2). */
export function realMovements(d: BudgetData, id: string, m: MonthKey): BankMovement[] {
  const out: BankMovement[] = [];
  const md = d.months[m];
  const lines = md?.initialized ? md.lines : [];
  // Money leaving a dedicated account when it is withdrawn from its savings line (spec 0007).
  const linked = lines.filter(l => isSavingsBlock(l.block) && l.linkedAccountId === id);
  for (const t of d.transactions) {
    // Balances rank an entry by its date at the bank, not by its month of attachment (spec 0015, RG2).
    const date = bankDateOf(t);
    if (!date.startsWith(m)) continue;
    const attached = date.slice(0, 7) !== t.month ? t.month : undefined;
    if (t.type === 'epa' && linked.some(l => l.key === t.target)) {
      out.push({ date, label: `${t.label} (retrait de ${linked.find(l => l.key === t.target)!.name})`, amount: -t.amount, kind: 'expense' });
    }
    // An envelope expense paid in cash leaves the envelope's cash balance, never its account (spec 0026, RG6).
    if (isCashExpense(t) || accountIdOf(d, t.accountId) !== id) continue;
    out.push({ date, label: `${t.label} (${movementWord(d, t)})`, amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), ...(attached ? { attachedMonth: attached } : {}) });
  }
  // A transfer is real: both faces count, whatever the budget status of the accounts (RG2, RG12).
  out.push(...transferMovements(d, id, m));
  for (const a of d.adjustments ?? []) {
    if (a.accountId === id && !a.cancelledOn && a.date.startsWith(m)) out.push({ date: a.date, label: a.label, amount: a.amount, kind: 'adjustment', adjustmentId: a.id });
  }
  return out;
}

/**
 * Entries of an account attached to a month whose bank date falls in another month (spec 0015, RG4). They are counted in the balance of
 * the month of their bank date, never in this one: the account's movement list shows them for information, flagged `outOfMonth`.
 */
export function attachedMovements(d: BudgetData, id: string, m: MonthKey): BankMovement[] {
  const out: BankMovement[] = [];
  for (const t of d.transactions) {
    const date = bankDateOf(t);
    if (t.month !== m || date.startsWith(m) || isCashExpense(t) || accountIdOf(d, t.accountId) !== id) continue;
    out.push({ date, label: `${t.label} (${movementWord(d, t)})`, amount: isMoneyIn(t.type) ? t.amount : -t.amount, kind: 'expense', imputation: imputationOf(d, t), attachedMonth: t.month, outOfMonth: true });
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

  // Money sent to another account, once checked, as a fictive counterpart. The main account is never touched by an account out of the
  // budget, which records its own side alone (spec 0009, RG92; spec 0019, RG12: only for fictive counterparts).
  const counterpart = (to: string, amount: number, date: string, name: string, key: string, toName: string, done = 'pointé') => {
    if (to === main || amount === 0) return;
    if (id === main && isAccountInBudget(d, to)) out.push({ date, label: `${name} → ${toName} (${done})`, amount: -amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
    else if (id === to) out.push({ date, label: `${name} (${done})`, amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
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
    if (mine(l.accountId)) out.push({ date: c.doneOn, label: `${l.name} (${l.block === 'rev' ? 'reçu' : 'pointé'}${counted.source === 'actual' ? ', réel' : ''})`, amount: sign * counted.amount, kind: 'check', lineKey: l.key, fictive: true });
    if (isSavingsBlock(l.block) && l.linkedAccountId === id) out.push({ date: c.doneOn, label: `${l.name} (versement, pointé)`, amount: counted.amount, kind: 'check', lineKey: l.key, fictive: true });
  }

  // Envelope allocations (spec 0011): read from the accounts of the envelopes, so that deleting an envelope leaves its past allocations in
  // the history. They move only once checked (RG8), from the main account to the envelope's account.
  if (md?.initialized) {
    for (const account of d.accounts) {
      if (!account.envelopeId || account.kind !== 'enveloppe' || compareMonths(m, account.openingMonth) < 0 || account.id === main) continue;
      const amount = md.alloc[account.envelopeId] ?? 0;
      const key = envelopeCheckKey(account.envelopeId);
      const c = md.checks?.[key];
      if (amount === 0 || !c || pooled || isItemTransferred(d, m, { kind: 'env', id: account.envelopeId })) continue;
      if (id === main) out.push({ date: c.doneOn, label: `Allocation → ${account.name} (pointée)`, amount: -amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
      else if (id === account.id) out.push({ date: c.doneOn, label: `Allocation ${account.name} (pointée)`, amount, kind: 'check', lineKey: key, counterpart: true, fictive: true });
    }
    // Before its account exists, a checked allocation keeps the account recorded when it was checked (spec 0009, RG88, RG90, RG91; spec 0011, RG18).
    for (const e of d.envelopes) {
      const c = md.checks?.[envelopeCheckKey(e.id)];
      if (!pooled && !envelopeAccountAt(d, e, m) && c?.accountId) counterpart(c.accountId, md.alloc[e.id] ?? 0, c.doneOn, `Allocation ${e.name}`, envelopeCheckKey(e.id), nameOf(c.accountId), 'pointée');
    }
  }

  // Expenses of `var` lines, envelopes and savings accounts, at their date. A line `fix`/`cre`/`rev` is estimated by its check, never by its entries.
  const linked = lines.filter(l => isSavingsBlock(l.block) && l.linkedAccountId === id);
  for (const t of d.transactions) {
    if (t.type === 'fix' || t.type === 'rev') {
      // An entry assigned to a savings account leaves the counted amount of its checked line, so it is read here at its date: the account's estimated
      // balance stays what it was before the assignment, with no double count (spec 0028, RG10). A line not checked holds nothing, assigned or not.
      const date = bankDateOf(t);
      if (isTransactionOffBudget(t) && date.startsWith(m) && mine(t.accountId) && d.months[t.month]?.checks?.[t.target]) {
        out.push({ date, label: `${t.label} (${t.type === 'rev' ? 'entrée' : 'dépense'}, ${isTransactionAssigned(t) ? 'affectée' : 'hors budget'})`, amount: t.type === 'rev' ? t.amount : -t.amount, kind: 'expense' });
      }
      continue;
    }
    const date = bankDateOf(t);
    if (!date.startsWith(m)) continue;
    if (t.type === 'epa' && linked.some(l => l.key === t.target)) {
      out.push({ date, label: `${t.label} (retrait de ${linked.find(l => l.key === t.target)!.name})`, amount: -t.amount, kind: 'expense' });
    }
    if (isCashExpense(t) || !mine(t.accountId)) continue;
    const attached = date.slice(0, 7) !== t.month ? t.month : undefined;
    out.push({ date, label: `${t.label} (${movementWord(d, t)})`, amount: t.type === 'epa' ? t.amount : -t.amount, kind: 'expense', ...(attached ? { attachedMonth: attached } : {}) });
  }
  // Transfers are real and also count here, on both faces (RG9, RG12).
  out.push(...transferMovements(d, id, m));
  return out;
}

/**
 * Money in and out of a movement list, split by the sign of each movement. A negative amount (for instance a negative
 * actual) therefore lands in the other column than its nature suggests; the net balance (in − out) is identical.
 */
export function flowOf(movements: BankMovement[]): { in: number; out: number } {
  return {
    in: round2(movements.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0)),
    out: round2(-movements.filter(x => x.amount < 0).reduce((s, x) => s + x.amount, 0)),
  };
}
