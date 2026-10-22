import { describe, expect, it } from 'vitest';
import { emptyData } from '../domain/empty';
import type { BudgetRepository } from './ports';
import { createSaveTracker, type SaveStatus } from './saveTracker';

/** A repository that fails while `down` is true. */
function flaky() {
  const state = { down: false, saved: [] as unknown[] };
  const repository: BudgetRepository = {
    load: async () => null,
    save: async d => {
      if (state.down) throw new Error('network down');
      state.saved.push(d);
    },
  };
  return { state, repository };
}
const flush = () => new Promise(r => setTimeout(r, 0));

describe('suivi des sauvegardes', () => {
  it('passe de « saving » à « saved » (CA13)', async () => {
    const { repository } = flaky();
    const seen: SaveStatus[] = [];
    createSaveTracker(repository, s => seen.push(s)).save(emptyData());
    await flush();
    expect(seen).toEqual(['saving', 'saved']);
  });

  it('signale l’échec, puis « Réessayer » renvoie les dernières données (CA12)', async () => {
    const { state, repository } = flaky();
    const seen: SaveStatus[] = [];
    const tracker = createSaveTracker(repository, s => seen.push(s));
    const data = emptyData();
    state.down = true;
    tracker.save(data);
    await flush();
    expect(seen.at(-1)).toBe('error');

    state.down = false;
    tracker.retry();
    await flush();
    expect(seen.at(-1)).toBe('saved');
    expect(state.saved).toEqual([data]);
  });

  it('une sauvegarde réussie des dernières données efface l’erreur précédente', async () => {
    const { state, repository } = flaky();
    const seen: SaveStatus[] = [];
    const tracker = createSaveTracker(repository, s => seen.push(s));
    state.down = true;
    tracker.save(emptyData());
    await flush();
    state.down = false;
    tracker.save(emptyData());
    await flush();
    expect(seen.at(-1)).toBe('saved');
  });

  it('reste en « saving » tant qu’une sauvegarde est en cours', async () => {
    const { repository } = flaky();
    const seen: SaveStatus[] = [];
    const tracker = createSaveTracker(repository, s => seen.push(s));
    tracker.save(emptyData());
    tracker.save(emptyData());
    await flush();
    expect(seen).toEqual(['saving', 'saving', 'saving', 'saved']);
  });

  it('retry sans rien à renvoyer ne fait rien', async () => {
    const { repository } = flaky();
    const seen: SaveStatus[] = [];
    createSaveTracker(repository, s => seen.push(s)).retry();
    await flush();
    expect(seen).toEqual([]);
  });
});
