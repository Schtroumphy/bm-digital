import { clearManualActuals, migrateBankAccounts, migrateCashWithdrawals, migrateCheckAmounts, migrateEnvelopeOpeningCash, migrateGoals, migrateLineStatements, migrateMovementTargets } from '../domain/migrate';
import type { BudgetData } from '../domain/types';
import type { BudgetRepository } from './ports';

/**
 * Loads the budget and brings it up to date: accounts, check amounts, the goals of the old settings (spec 0032), the opening cash of the envelopes (spec 0026), the statements of the lines turned into statements of their dedicated account (spec 0041), the old « Espèces » account turned into withdrawals and cash parts (spec 0037), and the actual of every line recomputed from its entries
 * (spec 0019, RG22). When actuals typed by hand were emptied, the cleaned data is saved right away, so the next load finds nothing
 * to clean and the banner is shown only once (CA20). A failed save is not fatal: the store saves again on its first change.
 */
export async function loadBudget(repository: BudgetRepository, initialData: () => BudgetData): Promise<{ data: BudgetData; cleared: number; unconverted: number }> {
  const stored = await repository.load();
  const start = stored ?? initialData();
  // A transfer's single `target` becomes a list of `targets` (spec 0045, RG18); saved right away like the other conversions.
  const retargeted = migrateMovementTargets(start);
  const base = migrateEnvelopeOpeningCash(migrateCheckAmounts(migrateBankAccounts(retargeted)));
  // The old « Espèces » account is emptied into withdrawals and cash parts (spec 0037); the rewritten data is saved right away, like the goals.
  const withCash = migrateCashWithdrawals(base);
  const withGoals = migrateGoals(withCash);
  // The statements of the lines become statements of their dedicated account (spec 0041, RG24); those that cannot are counted, for a banner shown once.
  const statements = migrateLineStatements(withGoals);
  const loaded = { ...clearManualActuals(statements.data), unconverted: statements.unconverted };
  // Goals migrated from the old settings (spec 0032, RG15) are saved right away, like the cleaned actuals.
  const goalsMigrated = stored !== null && stored.settings.goalsMigrated !== true;
  const cashMigrated = withCash !== base;
  const targetsMigrated = retargeted !== start;
  const statementsMigrated = statements.data !== withGoals;
  if (loaded.cleared > 0 || goalsMigrated || cashMigrated || statementsMigrated || targetsMigrated) await repository.save(loaded.data).catch(() => undefined);
  return loaded;
}
