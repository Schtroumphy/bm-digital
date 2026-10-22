import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { migrateBankAccounts, migrateCheckAmounts, migratePointageStart, realignVariableActuals } from '../../domain/migrate';
import { Ledger } from '../../domain/ledger';
import type { BudgetData } from '../../domain/types';
import type { BudgetRepository } from '../../application/ports';
import { LoadError } from '../components/LoadError';
import { createSaveTracker, type SaveStatus } from '../../application/saveTracker';

interface Store {
  data: BudgetData;
  ledger: Ledger;
  /** Applies a mutation to a copy of the data, then saves it. */
  update: (fn: (d: BudgetData) => void) => void;
  /** Where the saving stands: shown as « Enregistrement… », « Enregistré » or the error banner. */
  saveStatus: SaveStatus;
  /** Sends again everything that is not stored yet (after a failed save). */
  retrySave: () => void;
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
  const [loadFailed, setLoadFailed] = useState(false);
  // Bumped by « Réessayer » to run the loading effect again.
  const [attempt, setAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const tracker = useMemo(() => createSaveTracker(repository, setSaveStatus), [repository]);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    repository.load().then(
      d => {
        if (cancelled) return;
        // Data saved before bank accounts existed is brought up to date here (idempotent), then the variable lines' actuals are realigned (spec 0008, RG18).
        setData(migratePointageStart(migrateCheckAmounts(realignVariableActuals(migrateBankAccounts(d ?? initialData())))));
      },
      () => {
        // A failed read is never taken for an empty account: nothing is shown but the error (spec 0012, RG12).
        if (!cancelled) setLoadFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repository, initialData, attempt]);

  // `data` only exists once the load is over, so nothing is saved before it.
  useEffect(() => {
    if (data) tracker.save(data);
  }, [data, tracker]);

  const update = useCallback((fn: (d: BudgetData) => void) => {
    setData(prev => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  }, []);

  const retrySave = useCallback(() => tracker.retry(), [tracker]);

  const ledger = useMemo(() => (data ? new Ledger(data) : null), [data]);

  if (loadFailed) return <LoadError onRetry={() => setAttempt(a => a + 1)} />;
  if (!data || !ledger) return <p className="auth-wait">Chargement de vos données…</p>;
  return <StoreContext.Provider value={{ data, ledger, update, saveStatus, retrySave }}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

let seq = 0;
export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
