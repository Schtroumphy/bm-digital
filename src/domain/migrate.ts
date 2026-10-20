import { defaultBankAccounts, MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID } from './bank';
import { currentMonthKey } from './format';
import type { BudgetData, Transaction, Transfer } from './types';

/** Shapes of the data saved before bank accounts existed. */
type LegacyTransaction = Omit<Transaction, 'accountId'> & { source?: 'vir' | 'esp' };
type LegacyTransfer = Omit<Transfer, 'fromAccountId'> & { fromAccountId?: string };
type LegacyData = Omit<BudgetData, 'accounts' | 'transactions' | 'transfers'> & {
  accounts?: BudgetData['accounts'];
  transactions: LegacyTransaction[];
  transfers: LegacyTransfer[];
};

/**
 * Brings data saved before bank accounts up to date (RG27, RG28).
 *
 * Triggered by the absence of accounts, so running it twice changes nothing:
 * the second time it returns the data untouched. It creates « Compte principal »
 * and « Espèces » (opening balance 0, from `firstMonth`), puts `esp` transactions
 * on Espèces, `vir` ones on the main account, drops the `source` field and
 * attaches the existing transfers to the main account. `version`, `firstMonth`,
 * lines and months are left as they are.
 */
export function migrateBankAccounts(raw: BudgetData | LegacyData): BudgetData {
  const d = raw as LegacyData;
  if (Array.isArray(d.accounts) && d.accounts.length > 0) return d as BudgetData;
  return {
    ...d,
    accounts: defaultBankAccounts(d.firstMonth ?? currentMonthKey()),
    transactions: d.transactions.map(({ source, ...t }): Transaction => ({ ...t, accountId: source === 'esp' ? CASH_ACCOUNT_ID : MAIN_ACCOUNT_ID })),
    transfers: d.transfers.map((t): Transfer => ({ ...t, fromAccountId: t.fromAccountId ?? MAIN_ACCOUNT_ID })),
  };
}
