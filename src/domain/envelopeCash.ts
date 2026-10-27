import { cashHistory } from './envelopeHistory';
import { envelopeAccountAt } from './bank';
import { addMonths, round2 } from './format';
import type { Ledger } from './ledger';
import type { BudgetData, MonthKey } from './types';

/*
 * Cash balance of an envelope (spec 0026): a balance APART from the envelope's account (its virtual balance), never a part of it.
 * Always derived: opening cash, plus the transfers from the « Espèces » account to the envelope's account (RG4), minus the envelope's
 * expenses paid in cash (RG6). It is not a bank account and touches the virtual balance in no way (RG3).
 */

/** Cash balance of an envelope at the end of a month, never below 0 (RG7). 0 for an unknown envelope or before its account opens. */
export const envelopeCash = (d: BudgetData, envelopeId: string, m: MonthKey): number =>
  Math.max(0, cashHistory(d, envelopeId, m).at(-1)?.balance ?? 0);

/** Total shown as the title of an envelope's card (RG12): virtual + cash. Display only, never stored. */
export const envelopeTotal = (virtual: number, cash: number): number => round2(virtual + cash);

/** True when an expense of `amount` paid in cash would exceed the cash balance of the envelope in the month (RG7). */
export const exceedsEnvelopeCash = (d: BudgetData, envelopeId: string, m: MonthKey, amount: number): boolean => amount > envelopeCash(d, envelopeId, m);

/** Consumption of an envelope over a month, the figures behind its bar (Budget and Tableau de bord). */
export interface EnvelopeConsumption {
  /** Balance available at the start of the month: the account's balance at the end of the previous month + the month's money in, plus cash. */
  start: number;
  /** Spent in the month, cash included. */
  spent: number;
  /** start − spent: negative when the month's spending went past the opening balance. */
  remaining: number;
  /** spent / start in %, from 0 to 100. */
  consumed: number;
}

/**
 * An envelope is a provision: its bar compares the month's spending with what it holds at the start of the month (previous balance + the
 * month's money in), so it shows at a glance whether that balance is used up. Null for an unknown envelope or a month before it opens.
 */
export function envelopeConsumption(d: BudgetData, ledger: Ledger, envelopeId: string, m: MonthKey): EnvelopeConsumption | null {
  const em = ledger.envMonth(envelopeId, m);
  if (!em) return null;
  const e = d.envelopes.find(x => x.id === envelopeId);
  // From the month its account exists, the money really in is read on that account (transfers, entries): start of the month + money in.
  // Before that, only the budget figures exist: carried balance + allocation.
  const bank = e && envelopeAccountAt(d, e, m) ? ledger.bankMonth(e.accountId, m) : null;
  const virtualStart = bank ? bank.start + bank.in : em.start + em.alloc;
  const start = round2(virtualStart + envelopeCash(d, envelopeId, addMonths(m, -1)));
  const spent = em.spent;
  return { start, spent, remaining: round2(start - spent), consumed: start > 0 ? Math.min(100, (spent / start) * 100) : spent > 0 ? 100 : 0 };
}

/**
 * Total of the envelope's card in the Comptes screen (spec 0026, RG23, D24): the real balance of its account (`bankMonth`) plus its cash balance,
 * at the end of the month. Display only (D25). Null for an unknown envelope or a month before its account opens.
 */
export function envelopeAccountTotal(d: BudgetData, ledger: Ledger, envelopeId: string, m: MonthKey): { virtual: number; cash: number; total: number } | null {
  const e = d.envelopes.find(x => x.id === envelopeId);
  const virtual = e && ledger.bankMonth(e.accountId, m)?.balance;
  if (virtual === undefined) return null;
  const cash = envelopeCash(d, envelopeId, m);
  return { virtual, cash, total: envelopeTotal(virtual, cash) };
}

/**
 * Figures of the « Enveloppes » group title in the Comptes screen (spec 0026, RG24): the sum of the real balances of the ACTIVE envelopes' accounts
 * (virtual only, the group's main figure), their cash, and the two together (the subtitle « avec espèces »). Display only (D25); an archived
 * envelope's account counts for neither.
 */
export function envelopesGroupTotals(d: BudgetData, ledger: Ledger, m: MonthKey): { virtual: number; cash: number; withCash: number } {
  let virtual = 0;
  let cash = 0;
  for (const e of d.envelopes) {
    if (d.accounts.find(a => a.id === e.accountId)?.archived) continue;
    const t = envelopeAccountTotal(d, ledger, e.id, m);
    virtual += t?.virtual ?? 0;
    cash += t?.cash ?? 0;
  }
  return { virtual: round2(virtual), cash: round2(cash), withCash: envelopeTotal(round2(virtual), round2(cash)) };
}
