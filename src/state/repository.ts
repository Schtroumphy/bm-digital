import type { BudgetData } from '../domain/types';

/**
 * Where the budget lives. The app only talks to this interface, so the
 * localStorage implementation can be replaced by a Supabase one
 * (see supabase/schema.sql) without touching the screens.
 */
export interface BudgetRepository {
  load(): Promise<BudgetData | null>;
  save(data: BudgetData): Promise<void>;
}

const KEY = 'budget-perso:v1';

export const localRepository: BudgetRepository = {
  async load() {
    try {
      const raw = localStorage.getItem(KEY);
      const d = raw ? (JSON.parse(raw) as BudgetData) : null;
      return d?.version === 1 ? d : null;
    } catch {
      return null;
    }
  },
  async save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Storage full or blocked: the session keeps working in memory.
    }
  },
};
