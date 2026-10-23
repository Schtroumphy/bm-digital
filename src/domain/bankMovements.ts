import { accountIdOf, envelopeAccountAt, isAccountInBudget, isSavingsBlock, mainAccount, resolveBoxAccountId } from './bank';
import { compareMonths, round2 } from './format';
import { isExpenseLineBlock, isLineCarried } from './lineExpenses';
import type { BudgetData, MonthKey } from './types';

/*
 * Every money movement of a bank account in a month, dated and signed (positive = in). It is the one place
 * where the Ledger (balances of the Comptes screen) and the estimated balance of the pointage (spec 0009)
 * agree on what moves an account. They differ only in where the lines' money comes from:
 * - `actual`: the actual of the lines (month « au réel »);
 * - `checks`: the checked amount of the lines at their checked date (month « au pointage »).
 */

export type MovementSource = 'actual' | 'checks';

export interface BankMovement {
  /** `YYYY-MM-DD`. Actuals and old transfers have no day: they are dated the 1st of the month. */
  date: string;
  label: string;
  amount: number;
  kind: 'line' | 'check' | 'expense' | 'transfer' | 'adjustment';
  /** Key of the line, for a line or a check. */
  lineKey?: string;
  adjustmentId?: string;
  /** A counterpart between two accounts (checked allocation or variable line): it moves money in both modes (RG72, RG90). */
  counterpart?: boolean;
}

/** Where the amount counted for a line comes from (spec 0009, RG76). */
export type CountedSource = 'actual' | 'budget';

/**
 * Amount counted for a rev/cre/fix/epa/inv line: its actual when it exists (not empty, a typed 0 included),
 * otherwise its budget (RG76). The one place that decides it (RG84): the movements at the checks, the
 * « Reste à sortir » and the « Revenus attendus » all use it. Variable lines follow RG82 and do not come here.
 */
export function countedAmount(l: { actual: number | null; budget: number }): { amount: number; source: CountedSource } {
  return l.actual !== null ? { amount: l.actual, source: 'actual' } : { amount: l.budget, source: 'budget' };
}

/** « Mois compté au réel » or « au pointage » (spec 0009, RG59, RG61): from `settings.pointageStart` on, a month is counted from the checks. */
export type MonthMode = 'real' | 'pointage';

export const monthMode = (d: BudgetData, m: MonthKey): MonthMode => (d.settings.pointageStart !== undefined && compareMonths(m, d.settings.pointageStart) >= 0 ? 'pointage' : 'real');

/** Key of an envelope's allocation check in `MonthData.checks` (a line key never contains a colon). */
export const envelopeCheckKey = (envelopeId: string) => `env:${envelopeId}`;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Active movements of an account in a month. A cancelled adjustment is not one. */
export function bankMovements(d: BudgetData, id: string, m: MonthKey, source: MovementSource): BankMovement[] {
  const out: BankMovement[] = [];
  const md = d.months[m];
  const first = `${m}-01`;
  const main = mainAccount(d).id;
  const mine = (accountId?: string) => accountIdOf(d, accountId) === id;
  const nameOf = (accountId: string) => d.accounts.find(a => a.id === accountId)?.name ?? '';
  const lines = md?.initialized ? md.lines : [];

  for (const l of lines) {
    if (l.block === 'var') continue; // variable lines move money through their transactions only
    // A fixed/credit line carrying expenses moves money through them, at their date: its own movement is not counted (spec 0014, RG9).
    if (isExpenseLineBlock(l.block) && isLineCarried(d, m, l.key)) continue;
    if (!mine(l.accountId)) continue;
    const sign = l.block === 'rev' ? 1 : -1;
    if (source === 'actual') {
      if (l.actual) out.push({ date: first, label: `${l.name} (réel)`, amount: sign * l.actual, kind: 'line', lineKey: l.key });
    } else {
      const c = md.checks?.[l.key];
      const counted = countedAmount(l);
      if (c) out.push({ date: c.doneOn, label: `${l.name} (${l.block === 'rev' ? 'reçu' : 'pointé'}${counted.source === 'actual' ? ', réel' : ''})`, amount: sign * counted.amount, kind: 'check', lineKey: l.key });
    }
  }
  // Lines whose dedicated account is this one (spec 0007, RG6): it receives their payments and funds their withdrawals.
  // At the actuals the payment is the line's actual; at the checks it is the amount counted, on the day it is checked.
  const linked = lines.filter(l => isSavingsBlock(l.block) && l.linkedAccountId === id);
  for (const l of linked) {
    if (source === 'actual') {
      if (l.actual) out.push({ date: first, label: `${l.name} (versement, réel)`, amount: l.actual, kind: 'line', lineKey: l.key });
    } else {
      const c = md.checks?.[l.key];
      if (c) out.push({ date: c.doneOn, label: `${l.name} (versement, pointé)`, amount: countedAmount(l).amount, kind: 'check', lineKey: l.key });
    }
  }
  for (const t of d.transactions) {
    if (t.month === m && t.type === 'epa' && linked.some(l => l.key === t.target)) {
      out.push({ date: `${m}-${pad2(t.day)}`, label: `${t.label} (retrait de ${linked.find(l => l.key === t.target)!.name})`, amount: -t.amount, kind: 'expense' });
    }
  }
  // Counterparts: money leaving the main account for another one, once checked, in both modes (RG9, RG90).
  // The main account is never touched by an account out of the budget, which records its own side alone (RG92).
  const counterpart = (to: string, amount: number, date: string, name: string, key: string, toName: string, done = 'pointé') => {
    if (to === main || amount === 0) return;
    if (id === main && isAccountInBudget(d, to)) out.push({ date, label: `${name} → ${toName} (${done})`, amount: -amount, kind: 'check', lineKey: key, counterpart: true });
    else if (id === to) out.push({ date, label: `${name} (${done})`, amount, kind: 'check', lineKey: key, counterpart: true });
  };
  // A checked variable line sends its budget (RG82) to its dedicated account.
  for (const l of lines) {
    const c = md.checks?.[l.key];
    if (l.block === 'var' && c) counterpart(resolveBoxAccountId(d, l), l.budget, c.doneOn, l.name, l.key, nameOf(resolveBoxAccountId(d, l)));
  }
  // Envelope allocations (spec 0011). They are read from the accounts of the envelopes, not from the envelopes, so that
  // deleting an envelope leaves its past allocations in the history. From the month its account exists, an envelope receives
  // its allocation from the main account (RG5): on the 1st in a month counted at the actuals, on the day it is checked in a
  // month counted at the checks (RG6). The two faces are the debit of the main account and the credit of the envelope's account (RG7).
  if (md?.initialized) {
    for (const account of d.accounts) {
      if (!account.envelopeId || account.kind !== 'enveloppe' || compareMonths(m, account.openingMonth) < 0 || account.id === main) continue;
      const amount = md.alloc[account.envelopeId] ?? 0;
      if (amount === 0) continue; // RG8
      const key = envelopeCheckKey(account.envelopeId);
      const c = md.checks?.[key];
      const counted = monthMode(d, m) === 'real' ? { date: first, done: 'virée' } : c ? { date: c.doneOn, done: 'pointée' } : null;
      if (!counted) continue;
      const kind = c && counted.done === 'pointée' ? 'check' : 'transfer';
      if (id === main) out.push({ date: counted.date, label: `Allocation → ${account.name} (${counted.done})`, amount: -amount, kind, lineKey: key, counterpart: true });
      else if (id === account.id) out.push({ date: counted.date, label: `Allocation ${account.name} (${counted.done})`, amount, kind, lineKey: key, counterpart: true });
    }
    // Before its account exists, a checked allocation keeps the account recorded when it was checked (spec 0009, RG88, RG90, RG91; spec 0011, RG18).
    for (const e of d.envelopes) {
      const c = md.checks?.[envelopeCheckKey(e.id)];
      if (!envelopeAccountAt(d, e, m) && c?.accountId) counterpart(c.accountId, md.alloc[e.id] ?? 0, c.doneOn, `Allocation ${e.name}`, envelopeCheckKey(e.id), nameOf(c.accountId), 'pointée');
    }
  }
  for (const t of d.transactions) {
    if (t.month !== m || !mine(t.accountId)) continue;
    // A withdrawal from savings is money in; variable and envelope expenses are money out.
    out.push({ date: `${m}-${pad2(t.day)}`, label: `${t.label} (${t.type === 'epa' ? 'retrait' : 'dépense'})`, amount: t.type === 'epa' ? t.amount : -t.amount, kind: 'expense' });
  }
  // Old transfers marked « fait »: inert since spec 0009 but still part of the balances (RG15, RG60).
  for (const t of d.transfers) {
    if (!md?.transfersDone[t.id] || t.to?.kind !== 'bank' || t.amount === 0) continue; // a 0 € transfer moves nothing (RG108)
    // The main account is not touched by a transfer whose other side is out of the budget (RG92).
    if (t.to.id === id && !(id === main && !isAccountInBudget(d, t.fromAccountId))) out.push({ date: first, label: `${t.name} (virement)`, amount: t.amount, kind: 'transfer' });
    if (t.fromAccountId === id && !(id === main && !isAccountInBudget(d, t.to.id))) out.push({ date: first, label: `${t.name} (virement)`, amount: -t.amount, kind: 'transfer' });
  }
  // Movements between accounts created by the import (spec 0013, RG10b): a fact, so counted in both modes. The main account
  // is not touched when the other side is out of the budget (spec 0009, RG92).
  for (const mv of d.accountMovements ?? []) {
    if (mv.month !== m || mv.amount === 0) continue;
    const date = `${m}-${pad2(mv.day)}`;
    if (mv.fromAccountId === id && !(id === main && !isAccountInBudget(d, mv.toAccountId))) out.push({ date, label: `${mv.label} → ${nameOf(mv.toAccountId)} (mouvement)`, amount: -mv.amount, kind: 'transfer', counterpart: true });
    if (mv.toAccountId === id && !(id === main && !isAccountInBudget(d, mv.fromAccountId))) out.push({ date, label: `${mv.label} depuis ${nameOf(mv.fromAccountId)} (mouvement)`, amount: mv.amount, kind: 'transfer', counterpart: true });
  }
  for (const a of d.adjustments ?? []) {
    if (a.accountId === id && !a.cancelledOn && a.date.startsWith(m)) out.push({ date: a.date, label: a.label, amount: a.amount, kind: 'adjustment', adjustmentId: a.id });
  }
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
