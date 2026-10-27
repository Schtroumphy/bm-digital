import { accountIdOf } from '../domain/bank';
import { daysInMonth } from '../domain/checkoff';
import { round2 } from '../domain/format';
import type { BudgetData, MonthKey, TxType } from '../domain/types';
import { addTransaction } from './actions';
import { addTransfer } from './accountMovements';

/*
 * « + Écriture » on a line of the Budget screen (spec 0019, RG21): a real entry written from the line itself, on the account the line imposes.
 * It is the same entry as the Saisie screen would make, so it moves the real balance and feeds the actual of the line.
 */

export interface QuickEntry {
  id: string;
  amount: number;
  /** Day of the month. */
  day: number;
  label: string;
}

const TYPE_OF_BLOCK: Partial<Record<string, TxType>> = { var: 'var', fix: 'fix', cre: 'fix', rev: 'rev' };

/**
 * Records an entry on a line: an expense for a `var`, `fix` or `cre` line, an entry of money for a `rev` line, a transfer from the line's account to its
 * dedicated account for an `epa`/`inv` line (refused when it has none, RG16). Refused (false) on a locked month, an unknown line or an amount that is not positive.
 */
export function addLineEntry(d: BudgetData, m: MonthKey, key: string, entry: QuickEntry): boolean {
  const line = d.months[m]?.initialized ? d.months[m].lines.find(l => l.key === key) : undefined;
  if (!line || !(entry.amount > 0) || !Number.isInteger(entry.day) || entry.day < 1 || entry.day > daysInMonth(m)) return false;
  const label = entry.label.trim() || line.name;
  const amount = round2(entry.amount);
  const type = TYPE_OF_BLOCK[line.block];
  if (type) return addTransaction(d, { id: entry.id, month: m, day: entry.day, label, amount, type, target: key });
  if (!line.linkedAccountId) return false;
  return addTransfer(d, { id: entry.id, month: m, day: entry.day, label, amount, fromAccountId: accountIdOf(d, line.accountId), toAccountId: line.linkedAccountId, target: { kind: 'line', key } });
}

/**
 * « + » on an envelope of the dashboard (spec 0027, RG8): an expense of the envelope, on its own account, the same entry as the Saisie screen
 * makes (`addTransaction`, type `env`). Refused (false) on a locked or uninitialized month, an unknown envelope, an amount that is not positive or a day outside the month.
 */
export function addEnvelopeEntry(d: BudgetData, m: MonthKey, envelopeId: string, entry: QuickEntry): boolean {
  const envelope = d.envelopes.find(e => e.id === envelopeId);
  if (!envelope || !d.months[m]?.initialized || !(entry.amount > 0) || !Number.isInteger(entry.day) || entry.day < 1 || entry.day > daysInMonth(m)) return false;
  return addTransaction(d, { id: entry.id, month: m, day: entry.day, label: entry.label.trim() || envelope.name, amount: round2(entry.amount), type: 'env', target: envelopeId });
}
