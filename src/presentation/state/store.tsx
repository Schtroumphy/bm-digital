import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Ledger } from '../../domain/ledger';
import type { BudgetData } from '../../domain/types';
import type { BudgetRepository } from '../../application/ports';

interface Store {
  data: BudgetData;
  ledger: Ledger;
  /** Applies a mutation to a copy of the data, then saves it. */
  update: (fn: (d: BudgetData) => void) => void;
}

const StoreContext = createContext<Store | null>(null);

interface StoreProviderProps {
  children: ReactNode;
  repository: BudgetRepository;
  /** Data used when the repository has nothing stored yet. */
  initialData: () => BudgetData;
}

export function StoreProvider({ children, repository, initialData }: StoreProviderProps) {
  const [data, setData] = useState<BudgetData | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    repository.load().then(d => {
      loaded.current = true;
      setData(d ?? initialData());
    });
  }, [repository, initialData]);

  useEffect(() => {
    if (data && loaded.current) void repository.save(data);
  }, [data, repository]);

  const update = useCallback((fn: (d: BudgetData) => void) => {
    setData(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const ledger = useMemo(() => (data ? new Ledger(data) : null), [data]);

  if (!data || !ledger) return null;
  return <StoreContext.Provider value={{ data, ledger, update }}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

let seq = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
