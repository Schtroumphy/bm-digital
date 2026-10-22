import { afterEach, vi } from 'vitest';
import { describeBudgetRepositoryContract } from '../application/budgetRepository.contract';
import { localRepository } from './localRepository';
import { createMemoryRemote } from './memoryRemote';
import { createSupabaseRepository } from './supabaseRepository';

// Same contract for both implementations (spec 0012, CA17).

describeBudgetRepositoryContract('localRepository', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  return () => localRepository;
});

describeBudgetRepositoryContract('SupabaseRepository', () => {
  const remote = createMemoryRemote();
  return () => createSupabaseRepository(remote);
});

afterEach(() => vi.unstubAllGlobals());
