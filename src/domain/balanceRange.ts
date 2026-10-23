import { addMonths, compareMonths, currentMonthKey } from './format';
import type { BankAccount, BudgetData, MonthKey } from './types';

/*
 * What the balances of an account cover. The Ledger (écran Comptes) and `monthBalance` (solde estimé) both use `isMonthInBalanceRange`
 * to decide which months they compute, and the import uses `balanceDateWarning` to say that an entry will not show in them: one
 * rule, so the warning and the balances never differ (spec 0015, RG6).
 */

/** A month the balances of the account are computed for: not before the first month of the budget, not before the account's opening month. */
export const isMonthInBalanceRange = (d: BudgetData, account: Pick<BankAccount, 'openingMonth'>, m: MonthKey): boolean =>
  d.firstMonth !== null && compareMonths(m, d.firstMonth) >= 0 && compareMonths(m, account.openingMonth) >= 0;

/** Last month the balances are computed for: two months past the latest one in use (today or an initialized month). Null without a first month. */
export function balanceRangeEnd(d: BudgetData, today: MonthKey = currentMonthKey()): MonthKey | null {
  if (d.firstMonth === null) return null;
  let last = today;
  for (const [k, m] of Object.entries(d.months)) if (m.initialized && compareMonths(k, last) > 0) last = k;
  return addMonths(compareMonths(last, d.firstMonth) < 0 ? d.firstMonth : last, 2);
}

/** Key of the carry-over of a bank account in a year closing (`YearClose.overrides`). */
const bankCloseKey = (accountId: string) => `bank:${accountId}`;

/**
 * Why an entry dated `date` (`YYYY-MM-DD`) on this account does not (fully) show in the balances, or null when it does:
 * its month is before the first month of the budget, before the account's opening or after the end of the range, or its year is closed with an adjusted
 * carry-over for the account (the next January then starts from that value, so the entry is not carried on).
 */
export function balanceDateWarning(d: BudgetData, accountId: string, date: string, today: MonthKey = currentMonthKey()): string | null {
  const account = d.accounts.find(a => a.id === accountId);
  const month = date.slice(0, 7);
  if (!account) return null;
  if (d.firstMonth === null || compareMonths(month, d.firstMonth) < 0) return 'Date avant le premier mois du budget : hors soldes.';
  if (!isMonthInBalanceRange(d, account, month)) return 'Date avant l’ouverture du compte : hors soldes.';
  const end = balanceRangeEnd(d, today);
  if (end !== null && compareMonths(month, end) > 0) return 'Date après la fin de la plage des soldes : hors soldes.';
  const year = Number(date.slice(0, 4));
  const close = d.closes[year];
  if (close?.closed && close.overrides[bankCloseKey(accountId)] !== undefined) return 'Année clôturée avec un solde de report ajusté : hors des soldes suivants.';
  return null;
}
