import { accountIdOf, isAccountInBudget, mainAccount, resolveBoxAccountId } from './bank';
import { round2 } from './format';
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
  // A checked envelope allocation sends the month's allocation to the account recorded when it was checked (RG88, RG90, RG91).
  if (md?.initialized) {
    for (const e of d.envelopes) {
      const c = md.checks?.[envelopeCheckKey(e.id)];
      if (c?.accountId) counterpart(c.accountId, md.alloc[e.id] ?? 0, c.doneOn, `Allocation ${e.name}`, envelopeCheckKey(e.id), nameOf(c.accountId), 'pointée');
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
  for (const a of d.adjustments ?? []) {
    if (a.accountId === id && !a.cancelledOn && a.date.startsWith(m)) out.push({ date: a.date, label: a.label, amount: a.amount, kind: 'adjustment', adjustmentId: a.id });
  }
  return out;
}

/** Money in and out of a movement list. */
export function flowOf(movements: BankMovement[]): { in: number; out: number } {
  return {
    in: round2(movements.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0)),
    out: round2(-movements.filter(x => x.amount < 0).reduce((s, x) => s + x.amount, 0)),
  };
}
