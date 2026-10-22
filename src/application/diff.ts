/** JSON with sorted object keys: two equal values always give the same text, whatever the order of their keys. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface Changes<R> {
  /** Rows that are new or whose content changed. */
  upserts: R[];
  /** Rows of the previous state that no longer exist. */
  deletes: R[];
}

/** What it takes to go from `prev` to `next`, comparing rows of the same key. Unchanged rows are not in the result. */
export function diffByKey<R>(prev: readonly R[], next: readonly R[], keyOf: (row: R) => string): Changes<R> {
  const before = new Map(prev.map(r => [keyOf(r), r]));
  const after = new Set(next.map(keyOf));
  const upserts = next.filter(r => {
    const old = before.get(keyOf(r));
    return old === undefined || stableStringify(old) !== stableStringify(r);
  });
  const deletes = prev.filter(r => !after.has(keyOf(r)));
  return { upserts, deletes };
}

/** The rows once `changes` are applied: the state a store has after receiving them. Order of the rows is kept, new ones go last. */
export function applyChanges<R>(rows: readonly R[], changes: Changes<R>, keyOf: (row: R) => string): R[] {
  const removed = new Set(changes.deletes.map(keyOf));
  const updated = new Map(changes.upserts.map(r => [keyOf(r), r]));
  const kept = rows.filter(r => !removed.has(keyOf(r))).map(r => updated.get(keyOf(r)) ?? r);
  const known = new Set(kept.map(keyOf));
  return [...kept, ...changes.upserts.filter(r => !known.has(keyOf(r)))];
}
