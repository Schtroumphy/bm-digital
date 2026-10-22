import type { BudgetData } from '../domain/types';
import type { BudgetRepository } from './ports';

export type SaveStatus = 'saved' | 'saving' | 'error';

export interface SaveTracker {
  /** Sends `data` to the repository. Never throws: a failure becomes the `error` status. */
  save(data: BudgetData): void;
  /** Sends the latest data again (spec 0012, RG10). The repository sends whatever it has not stored yet. */
  retry(): void;
}

/**
 * Follows the saves of the store and tells the screen where they stand (« Enregistrement… », « Enregistré »,
 * error banner). Several saves can be in flight: the status is `saving` until all of them are over, and `error`
 * when the last save of the latest data failed. A later success clears an earlier failure, because a save carries
 * everything not stored yet.
 */
export function createSaveTracker(repository: BudgetRepository, onStatus: (status: SaveStatus) => void): SaveTracker {
  let latest: BudgetData | null = null;
  let pending = 0;
  let failed = false;

  const report = () => onStatus(pending > 0 ? 'saving' : failed ? 'error' : 'saved');

  const run = (data: BudgetData) => {
    latest = data;
    pending++;
    report();
    repository.save(data).then(
      () => {
        if (data === latest) failed = false;
      },
      () => {
        failed = true;
      },
    ).finally(() => {
      pending--;
      report();
    });
  };

  return {
    save: run,
    retry: () => {
      if (latest) run(latest);
    },
  };
}
