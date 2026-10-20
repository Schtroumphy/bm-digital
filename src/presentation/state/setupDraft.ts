import { useCallback, useEffect, useState } from 'react';
import { emptyDraft, parseDraft, type SetupDraft } from '../../application/setup';
import { currentMonthKey } from '../../domain/format';

/*
 * The assistant's draft lives in the browser (localStorage, its own key), not
 * in BudgetData: it is temporary state and must not reach the saved budget.
 * See docs/adr/0002-brouillon-de-l-assistant-en-local-storage.md.
 */
const KEY = 'budget-perso:setup-draft';

function readDraft(): SetupDraft {
  try {
    const raw = localStorage.getItem(KEY);
    const draft = raw ? parseDraft(JSON.parse(raw)) : null;
    if (draft) return draft;
  } catch {
    // Unreadable draft: start again from an empty one.
  }
  return emptyDraft(currentMonthKey());
}

/** The draft, restored after a page reload, and a setter that takes a pure `draft => draft` function. */
export function useSetupDraft(): [SetupDraft, (fn: (d: SetupDraft) => SetupDraft) => void] {
  const [draft, setDraft] = useState(readDraft);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(draft));
    } catch {
      // Storage full or blocked: the draft stays in memory for this session.
    }
  }, [draft]);

  const change = useCallback((fn: (d: SetupDraft) => SetupDraft) => setDraft(fn), []);
  return [draft, change];
}
