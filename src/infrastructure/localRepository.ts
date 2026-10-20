import type { BudgetRepository } from '../application/ports';
import type { BudgetData } from '../domain/types';

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
