import { defaultBankAccounts, isTransactionInBudget, MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID } from './bank';
import { varActualFromTx } from './budget';
import { oldestCheckedMonth } from './checkoff';
import { currentMonthKey, round2 } from './format';
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

/**
 * Brings the actual of variable lines in line with spec 0008 (RG18). A line with at least one
 * `var` expense paid from an out-of-budget account had left it out of its actual. Its actual
 * becomes the sum of all its expenses only when it is detectably stale: empty, or equal to the
 * sum of the in-budget expenses alone (the old computation). Any other actual is a manual
 * entry and is kept. Locked months are included (a correction, not an entry).
 * Pure and idempotent: the data given is returned untouched when nothing has to change,
 * and it is never mutated.
 */
export function realignVariableActuals(d: BudgetData): BudgetData {
  const leftOut = d.transactions.filter(t => t.type === 'var' && !isTransactionInBudget(d, t));
  if (!leftOut.length) return d;
  const months = { ...d.months };
  let changed = false;
  for (const [m, md] of Object.entries(d.months)) {
    if (!md.initialized) continue;
    const lines = md.lines.map(l => {
      if (l.block !== 'var' || !leftOut.some(t => t.month === m && t.target === l.key)) return l;
      const inBudget = d.transactions.filter(t => t.month === m && t.type === 'var' && t.target === l.key && isTransactionInBudget(d, t));
      const old = inBudget.length ? round2(inBudget.reduce((s, t) => s + t.amount, 0)) : null;
      if (l.actual !== null && l.actual !== old) return l;
      changed = true;
      return { ...l, actual: varActualFromTx(d, m, l.key) };
    });
    months[m] = { ...md, lines };
  }
  return changed ? { ...d, months } : d;
}

/**
 * Spec 0009, RG73: data with checks but no start of the pointage gets one, at the oldest month holding a check.
 * Statements (`accountBalances`) are kept as they are. Pure and idempotent: the data given is returned untouched
 * when nothing has to change.
 */
export function migratePointageStart(d: BudgetData): BudgetData {
  if (d.settings.pointageStart !== undefined) return d;
  const oldest = oldestCheckedMonth(d);
  return oldest === null ? d : { ...d, settings: { ...d.settings, pointageStart: oldest } };
}

/**
 * Spec 0009, RG87: a check no longer holds an amount (the amount counted is computed on reading). Removes the
 * `amount` of the checks saved by an earlier version, keeping their date. Pure and idempotent: the data given is
 * returned untouched when no check carries an amount, and it is never mutated.
 */
export function migrateCheckAmounts(d: BudgetData): BudgetData {
  const hasAmount = (md: BudgetData['months'][string]) => Object.values(md.checks ?? {}).some(c => 'amount' in c);
  if (!Object.values(d.months).some(hasAmount)) return d;
  const months = { ...d.months };
  for (const [m, md] of Object.entries(d.months)) {
    if (!hasAmount(md)) continue;
    months[m] = { ...md, checks: Object.fromEntries(Object.entries(md.checks ?? {}).map(([k, c]) => {
      // Only the amount goes: the date and the destination account of an allocation check stay.
      const { amount: _amount, ...rest } = c as typeof c & { amount?: number };
      return [k, rest];
    })) };
  }
  return { ...d, months };
}
