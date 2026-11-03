import { isRealDate } from '../domain/periods';
import type { BudgetData, Transaction } from '../domain/types';
import { addTransaction } from './actions';
import { addTransfer, type NewTransfer } from './accountMovements';

/*
 * Entries typed by hand (spec 0039, RG11): the real date is explicit and mandatory, written as the bank date of the entry. The couple
 * month + day no longer dates a new entry; the month stays the month of attachment to the budget. The import writes its own bank dates and
 * does not go through here.
 */

/** A transaction without its date: `addManualTransaction` adds `day` and `bankDate` from the real date. */
export type ManualTransaction = Omit<Transaction, 'day' | 'bankDate'>;

/** Records an expense or an entry of money dated `date` (`YYYY-MM-DD`). Refused (false) without a real date, and for every reason `addTransaction` refuses. */
export function addManualTransaction(d: BudgetData, input: ManualTransaction, date: string | undefined, keepAssignment?: string): boolean {
  if (date === undefined || !isRealDate(date)) return false;
  return addTransaction(d, { ...input, day: Number(date.slice(8, 10)), bankDate: date }, keepAssignment);
}

/** Records a transfer typed by hand dated `date`. Refused (false) without a real date, and for every reason `addTransfer` refuses. */
export function addManualTransfer(d: BudgetData, input: Omit<NewTransfer, 'day' | 'bankDate'>, date: string | undefined): boolean {
  if (date === undefined || !isRealDate(date)) return false;
  return addTransfer(d, { ...input, day: Number(date.slice(8, 10)), bankDate: date });
}
