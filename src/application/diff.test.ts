import { describe, expect, it } from 'vitest';
import { applyChanges, diffByKey, stableStringify } from './diff';

interface R { id: string; v: number }
const key = (r: R) => r.id;

describe('diffByKey', () => {
  const prev: R[] = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }];

  it('ne renvoie rien sans changement (CA10)', () => {
    expect(diffByKey(prev, structuredClone(prev), key)).toEqual({ upserts: [], deletes: [] });
  });

  it('renvoie les lignes modifiées, ajoutées et supprimées (CA10, CA11)', () => {
    const next: R[] = [{ id: 'a', v: 1 }, { id: 'b', v: 20 }, { id: 'd', v: 4 }];
    expect(diffByKey(prev, next, key)).toEqual({ upserts: [{ id: 'b', v: 20 }, { id: 'd', v: 4 }], deletes: [{ id: 'c', v: 3 }] });
  });

  it('ignore l’ordre des clés d’un objet', () => {
    const a = [{ id: 'x', o: { p: 1, q: 2 } }];
    const b = [{ id: 'x', o: { q: 2, p: 1 } }];
    expect(diffByKey(a, b, r => r.id)).toEqual({ upserts: [], deletes: [] });
  });
});

describe('applyChanges', () => {
  it('rejoue un diff sur l’ancien état', () => {
    const prev: R[] = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }];
    const next: R[] = [{ id: 'b', v: 5 }, { id: 'c', v: 3 }];
    const out = applyChanges(prev, diffByKey(prev, next, key), key);
    expect(out.map(key).sort()).toEqual(['b', 'c']);
    expect(out.find(r => r.id === 'b')?.v).toBe(5);
  });
});

describe('stableStringify', () => {
  it('donne le même texte quel que soit l’ordre des clés', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 1, c: 2 }] })).toBe(stableStringify({ a: [1, { c: 2, d: 1 }], b: 1 }));
  });
  it('distingue null et valeur absente', () => {
    expect(stableStringify({ a: null })).not.toBe(stableStringify({}));
  });
});
