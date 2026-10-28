import { clearManualActuals, migrateBankAccounts, migrateCheckAmounts, migrateEnvelopeOpeningCash, migrateGoals } from '../domain/migrate';
import type { BudgetData } from '../domain/types';
import type { BudgetRepository } from './ports';

/**
 * Loads the budget and brings it up to date: accounts, check amounts, the goals of the old settings (spec 0032), the opening cash of the envelopes (spec 0026), and the actual of every line recomputed from its entries
 * (spec 0019, RG22). When actuals typed by hand were emptied, the cleaned data is saved right away, so the next load finds nothing
 * to clean and the banner is shown only once (CA20). A failed save is not fatal: the store saves again on its first change.
 */
export async function loadBudget(repository: BudgetRepository, initialData: () => BudgetData): Promise<{ data: BudgetData; cleared: number }> {
  const stored = await repository.load();
  const migrated = migrateGoals(migrateEnvelopeOpeningCash(migrateCheckAmounts(migrateBankAccounts(stored ?? initialData()))));
  const loaded = clearManualActuals(migrated);
  // Goals migrated from the old settings (spec 0032, RG15) are saved right away, like the cleaned actuals.
  const goalsMigrated = stored !== null && stored.settings.goalsMigrated !== true;
  if (loaded.cleared > 0 || goalsMigrated) await repository.save(loaded.data).catch(() => undefined);
  return loaded;
}
