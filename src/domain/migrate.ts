import { defaultBankAccounts, MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID } from './bank';
import { accounts } from './ledger';
import { currentMonthKey, parseMonth, round2 } from './format';
import { hasStaleActuals, manualActualCount, syncLineActuals } from './lineActuals';
import type { BudgetData, Goal, MonthKey, TemplateLine, Transaction, Transfer } from './types';

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
 * Spec 0019, RG22: the actual of a line is the sum of its entries, never typed. Rewrites every line's actual from its entries, which
 * empties the ones typed by hand (and drops the actuals of the budget model), and tells how many typed actuals no longer count.
 * Pure and idempotent: the data given is returned untouched when nothing has to change, and it is never mutated. No entry is invented.
 */
export function clearManualActuals(d: BudgetData): { data: BudgetData; cleared: number } {
  const cleared = manualActualCount(d);
  const modelHasActual = d.template.lines.some(l => 'actual' in l);
  if (!hasStaleActuals(d) && !modelHasActual) return { data: d, cleared: 0 };
  const next = structuredClone(d);
  syncLineActuals(next);
  next.template.lines = next.template.lines.map(({ actual: _actual, ...l }: TemplateLine & { actual?: unknown }) => l);
  return { data: next, cleared };
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

/**
 * Spec 0026, RG10, D5: the `cash` of an envelope, saved by an earlier version, becomes its opening cash, an additional balance: the virtual
 * balance is left as it is and the cash is not bounded by it. No entry is created and existing expenses stay paid in `virtuel`. Pure and
 * idempotent: the data given is returned untouched when nothing has to change, and it is never mutated.
 */
export function migrateEnvelopeOpeningCash(d: BudgetData): BudgetData {
  const legacy = (e: BudgetData['envelopes'][number]) => 'cash' in e || typeof e.openingCash !== 'number';
  if (!d.envelopes.some(legacy)) return d;
  return { ...d, envelopes: d.envelopes.map(e => {
    const { cash, ...rest } = e as typeof e & { cash?: number };
    return { ...rest, openingCash: Math.max(0, round2(e.openingCash ?? cash ?? 0)) };
  }) };
}

/** Ids of the goals created from the three old settings (spec 0032, RG15): fixed, so that migrating twice can never duplicate them. */
export const MIGRATED_GOAL_IDS = { emergency: 'goal-emergency', invest: 'goal-invest', savings: 'goal-savings' } as const;

/**
 * Spec 0032, RG15: the three fixed goals of the settings become goals of the current year, in this order: the emergency fund and « Investir »
 * (kind `amount`, with their accounts, target and due date), then the savings rate. A target of 0 creates nothing. Triggered by the absence of
 * `settings.goalsMigrated`, which is then set: so deleting every goal later never brings them back. The old settings are kept but never read again.
 * Pure: the data given is returned untouched when it is already migrated, and it is never mutated.
 */
export function migrateGoals(d: BudgetData, today: MonthKey = currentMonthKey()): BudgetData {
  if (d.settings.goalsMigrated) return d;
  const st = d.settings;
  const year = parseMonth(today).year;
  const goals: Goal[] = [...(d.goals ?? [])];
  const add = (g: Omit<Goal, 'year' | 'position'>) => goals.push({ ...g, year, position: goals.length });
  if (st.emergencyTarget > 0) {
    add({ id: MIGRATED_GOAL_IDS.emergency, kind: 'amount', name: 'Fonds de secours', target: st.emergencyTarget, accounts: [...st.emergencyAccounts], ...(st.emergencyDue ? { due: st.emergencyDue } : {}) });
  }
  if (st.investTarget > 0) {
    const keys = st.investAccounts ?? accounts(d).filter(a => a.block === 'inv').map(a => a.key);
    add({ id: MIGRATED_GOAL_IDS.invest, kind: 'amount', name: `Investir ${String(st.investTarget / 1000).replace('.', ',')}K`, target: st.investTarget, accounts: [...keys], ...(st.investDue ? { due: st.investDue } : {}) });
  }
  if (st.savingsRateTarget > 0) add({ id: MIGRATED_GOAL_IDS.savings, kind: 'rate', name: 'Taux d’épargne', target: st.savingsRateTarget });
  return { ...d, goals, settings: { ...st, goalsMigrated: true } };
}
