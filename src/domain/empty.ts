import type { BudgetData } from './types';

/**
 * A brand-new budget: no lines, no month, no balances. The « Démarrage »
 * assistant fills it in. Real use starts here, not from `seedData`.
 */
export function emptyData(): BudgetData {
  return {
    version: 1,
    firstMonth: null,
    template: { lines: [], envAlloc: {} },
    months: {},
    envelopes: [],
    envHistory: {},
    statements: {},
    transactions: [],
    transfers: [],
    planned: [],
    closes: {},
    settings: { emergencyAccounts: [], emergencyTarget: 0, investTarget: 0, savingsRateTarget: 0 },
  };
}
