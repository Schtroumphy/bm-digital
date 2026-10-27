import { accountIdOf, isTransactionAssigned, isTransactionOffBudget } from './bank';
import { bankDateOf } from './lineExpenses';
import { round2 } from './format';
import type { BudgetData, MonthKey, Transaction } from './types';

/*
 * Operations « affectées » to a savings account (spec 0028): informative only. They move no money and appear in no balance, no flow and no
 * history of the savings account; they are listed in its detail and summed here, apart from every balance.
 */

/** One assigned operation as the detail of the savings account lists it. `amount` is signed: negative = expense, positive = entry. */
export interface AssignedOperation {
  id: string;
  /** `YYYY-MM-DD` (date at the bank). */
  date: string;
  label: string;
  detail?: string;
  amount: number;
  /** Name of the line the operation targets (empty when it was deleted). */
  imputation: string;
  type: Transaction['type'];
  /** Name of the account the money really moved on. */
  ownAccountName: string;
}

/** Assigned operations of a month (month of attachment), oldest first. */
export function assignedOperations(d: BudgetData, accountId: string, m: MonthKey): AssignedOperation[] {
  const lines = d.months[m]?.initialized ? d.months[m].lines : d.template.lines;
  return d.transactions
    .filter(t => t.month === m && t.assignedAccountId === accountId)
    .map(t => ({
      id: t.id,
      date: bankDateOf(t),
      label: t.label,
      ...(t.detail ? { detail: t.detail } : {}),
      amount: t.type === 'rev' ? t.amount : -t.amount,
      imputation: lines.find(l => l.key === t.target)?.name ?? 'Supprimé',
      type: t.type,
      ownAccountName: d.accounts.find(a => a.id === accountIdOf(d, t.accountId))?.name ?? '',
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface AssignedTotals {
  count: number;
  expenses: number;
  entries: number;
  net: number;
}

/** Expenses, entries and net (entries − expenses) of a list of assigned operations. */
export function assignedTotals(ops: Pick<AssignedOperation, 'amount'>[]): AssignedTotals {
  const expenses = round2(-ops.filter(o => o.amount < 0).reduce((s, o) => s + o.amount, 0));
  const entries = round2(ops.filter(o => o.amount > 0).reduce((s, o) => s + o.amount, 0));
  return { count: ops.length, expenses, entries, net: round2(entries - expenses) };
}

export interface AssignedByAccount extends AssignedTotals {
  accountId: string;
  accountName: string;
}

export interface AssignedSummary extends AssignedTotals {
  /** Operations assigned to a savings account, split by account. */
  byAccount: AssignedByAccount[];
  /** Operations marked « hors budget » with no account (spec 0031); null when there is none. */
  offBudget: AssignedTotals | null;
}

/**
 * Every operation of the month taken out of the budget, assigned to a savings account or marked « hors budget » (the dashboard mention,
 * spec 0028 RG25, spec 0031 RG5): the totals cover both, the split by account only the assigned ones.
 */
export function monthAssignedSummary(d: BudgetData, m: MonthKey): AssignedSummary {
  const all = d.transactions.filter(t => t.month === m && isTransactionOffBudget(t));
  const assigned = all.filter(isTransactionAssigned);
  const plain = all.filter(t => !isTransactionAssigned(t));
  const ids = [...new Set(assigned.map(t => t.assignedAccountId!))];
  const signed = (t: Transaction) => ({ amount: t.type === 'rev' ? t.amount : -t.amount });
  const byAccount = ids.map(id => ({
    accountId: id,
    accountName: d.accounts.find(a => a.id === id)?.name ?? '',
    ...assignedTotals(assigned.filter(t => t.assignedAccountId === id).map(signed)),
  }));
  return { ...assignedTotals(all.map(signed)), byAccount, offBudget: plain.length > 0 ? assignedTotals(plain.map(signed)) : null };
}
