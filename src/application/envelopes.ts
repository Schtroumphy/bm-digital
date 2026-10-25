import { freeEnvelopeAccountId, newEnvelopeAccount } from '../domain/bank';
import { compareMonths, currentMonthKey, round2 } from '../domain/format';
import { lowestCashBalance } from '../domain/envelopeHistory';
import { isMonthLocked, Ledger } from '../domain/ledger';
import { setBankAccountOpening } from './bankAccounts';
import type { BudgetData } from '../domain/types';

/*
 * Use cases on envelopes (spec 0011). An envelope and its bank account are created, renamed and archived together:
 * the account is the envelope's balance, so the two never get out of step. Each use case changes the data it is given
 * and returns false (changing nothing) when a rule forbids it.
 */

/** Hue of the next envelope, spread around the colour wheel. */
const nextEnvelopeHue = (d: BudgetData) => (d.envelopes.length * 47 + 20) % 360;

/**
 * Creates an envelope and its account (RG3): the account has the envelope's name and hue, is in the budget and opens
 * on the current month at 0, never before the first month of the budget. Refused for an id already used.
 */
export function addEnvelope(d: BudgetData, id: string, name = 'Nouvelle enveloppe', today = currentMonthKey()): boolean {
  if (d.envelopes.some(e => e.id === id)) return false;
  const hue = nextEnvelopeHue(d);
  const month = d.firstMonth !== null && compareMonths(today, d.firstMonth) < 0 ? d.firstMonth : today;
  const accountId = freeEnvelopeAccountId(d, id);
  d.accounts.push(newEnvelopeAccount(accountId, id, name, hue, 0, month));
  d.envelopes.push({ id, name, hue, openingCash: 0, accountId });
  return true;
}

/** Renames an envelope and its account (RG3). An empty name is refused. */
export function renameEnvelope(d: BudgetData, id: string, name: string): boolean {
  const e = d.envelopes.find(x => x.id === id);
  if (!e || !name.trim()) return false;
  e.name = name.trim();
  const account = d.accounts.find(a => a.id === e.accountId);
  if (account) account.name = e.name;
  return true;
}

export type OpeningResult = 'ok' | 'unknown' | 'invalid' | 'locked';
export type OpeningCashResult = OpeningResult | 'negative';

/**
 * Why an opening cash cannot be set (spec 0026, RG1, RG8), or null when it can: an unknown envelope, an amount that is not a number ≥ 0
 * (`invalid`), an opening month that is locked or closed (`locked`), an opening that would make the cash balance negative on some date
 * (`negative`, D11). It is not bounded by the virtual balance (RG7).
 */
export function openingCashRefusal(d: BudgetData, id: string, amount: number): Exclude<OpeningCashResult, 'ok'> | null {
  const e = d.envelopes.find(x => x.id === id);
  const account = e && d.accounts.find(a => a.id === e.accountId);
  if (!account) return 'unknown';
  if (!Number.isFinite(amount) || amount < 0) return 'invalid';
  if (isMonthLocked(d, account.openingMonth)) return 'locked';
  if (lowestCashBalance(d, id, round2(amount)) < 0) return 'negative';
  return null;
}

/** Sets the cash held by an envelope at its opening, or changes nothing and tells why (see `openingCashRefusal`). */
export function setEnvelopeOpeningCash(d: BudgetData, id: string, amount: number): OpeningCashResult {
  const refusal = openingCashRefusal(d, id, amount);
  if (refusal) return refusal;
  d.envelopes.find(x => x.id === id)!.openingCash = round2(amount);
  return 'ok';
}

/**
 * Why the virtual starting balance of an envelope cannot be set (spec 0026, RG13, RG15), or null when it can: an unknown envelope, a value that
 * is not a number (`invalid`), a locked or closed opening month (`locked`). It may be negative.
 */
export function openingBalanceRefusal(d: BudgetData, id: string, amount: number): Exclude<OpeningResult, 'ok'> | null {
  const account = d.accounts.find(a => a.id === d.envelopes.find(x => x.id === id)?.accountId);
  if (!account) return 'unknown';
  if (!Number.isFinite(amount)) return 'invalid';
  return isMonthLocked(d, account.openingMonth) ? 'locked' : null;
}

/** Sets the virtual starting balance of an envelope: the opening balance of its account, the same data as in the Comptes screen (RG14). */
export function setEnvelopeOpeningBalance(d: BudgetData, id: string, amount: number): OpeningResult {
  const refusal = openingBalanceRefusal(d, id, amount);
  if (refusal) return refusal;
  setBankAccountOpening(d, d.envelopes.find(x => x.id === id)!.accountId, { balance: round2(amount) });
  return 'ok';
}

export type DeleteEnvelopeResult = 'ok' | 'unknown' | 'not_empty';

/**
 * Balance of the envelope's account at the end of the last month of the application, or 0 when it has none. Money moved to
 * the future is not known yet: the last month listed is the latest that can hold some.
 */
export function envelopeBalance(d: BudgetData, id: string): number {
  const e = d.envelopes.find(x => x.id === id);
  const ledger = new Ledger(d);
  const last = ledger.months[ledger.months.length - 1];
  return (e && last ? ledger.bankMonth(e.accountId, last)?.balance : undefined) ?? 0;
}

/**
 * Deletes an envelope and archives its account, which is never erased (RG22). The envelope must be empty first
 * (Q7): moving its money away is not handled yet, so an envelope with a balance cannot be deleted.
 * The account keeps `envelopeId`, so the allocations of the past stay in the history of the main account. From the month
 * after `today` on, the envelope is no longer allocated: its allocation leaves the model and the months already created.
 */
export function deleteEnvelope(d: BudgetData, id: string, today = currentMonthKey()): DeleteEnvelopeResult {
  const e = d.envelopes.find(x => x.id === id);
  if (!e) return 'unknown';
  if (round2(envelopeBalance(d, id)) !== 0) return 'not_empty';
  const account = d.accounts.find(a => a.id === e.accountId);
  if (account) account.archived = true;
  d.envelopes = d.envelopes.filter(x => x.id !== id);
  delete d.template.envAlloc[id];
  for (const [m, md] of Object.entries(d.months)) if (compareMonths(m, today) > 0 && !isMonthLocked(d, m)) delete md.alloc[id];
  return 'ok';
}
