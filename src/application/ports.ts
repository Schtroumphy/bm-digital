import type { BudgetData } from '../domain/types';

/**
 * Where the budget lives. The application only talks to this port, so the
 * localStorage implementation can be replaced by a Supabase one
 * (see supabase/migrations) without touching the screens.
 */
export interface BudgetRepository {
  load(): Promise<BudgetData | null>;
  save(data: BudgetData): Promise<void>;
}
