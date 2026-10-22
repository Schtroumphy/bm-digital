import { freeEnvelopeAccountId, newEnvelopeAccount } from '../domain/bank';
import { compareMonths, currentMonthKey, round2 } from '../domain/format';
import { isMonthLocked, Ledger } from '../domain/ledger';
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
  d.envelopes.push({ id, name, hue, cash: 0, accountId });
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
