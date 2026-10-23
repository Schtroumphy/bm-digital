import { clearManualActuals, migrateBankAccounts, migrateCheckAmounts } from '../domain/migrate';
import type { BudgetData } from '../domain/types';
import type { BudgetRepository } from './ports';

/**
 * Loads the budget and brings it up to date: accounts, check amounts, and the actual of every line recomputed from its entries
 * (spec 0019, RG22). When actuals typed by hand were emptied, the cleaned data is saved right away, so the next load finds nothing
 * to clean and the banner is shown only once (CA20). A failed save is not fatal: the store saves again on its first change.
 */
export async function loadBudget(repository: BudgetRepository, initialData: () => BudgetData): Promise<{ data: BudgetData; cleared: number }> {
  const stored = await repository.load();
  const loaded = clearManualActuals(migrateCheckAmounts(migrateBankAccounts(stored ?? initialData())));
  if (loaded.cleared > 0) await repository.save(loaded.data).catch(() => undefined);
  return loaded;
}
