import { applyChanges, diffByKey, type Changes } from '../application/diff';
import type { BudgetRepository } from '../application/ports';
import type { BudgetData } from '../domain/types';
import { fromRows, toRows } from './supabaseRows';
import { emptyRows, rowKey, TABLE_ORDER, type AnyRow, type ReadRows, type TableName, type TableRows } from './supabaseSchema';

/** The few operations the repository needs from the database. Supabase implements it, tests use an in-memory copy. */
export interface RemoteTables {
  /** Every row of the signed-in user in `table`. */
  selectAll(table: TableName): Promise<AnyRow[]>;
  upsert(table: TableName, rows: AnyRow[]): Promise<void>;
  /** Deletes the rows whose primary key (without `user_id`) is given. */
  remove(table: TableName, keys: AnyRow[]): Promise<void>;
}

/**
 * `BudgetRepository` over relational tables (spec 0012). It remembers the rows it knows to be stored (`synced`)
 * and, at each `save`, sends only the rows that differ from them: upserts and deletions, table by table.
 * Saves run one after the other, in the order they were asked. `synced` moves forward step by step as the
 * database confirms, so after a failure the next `save` sends exactly what is still missing.
 */
export function createSupabaseRepository(remote: RemoteTables): BudgetRepository {
  let synced: TableRows | null = null;
  // One operation at a time; a failed one must not block the next.
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
  };

  async function read(): Promise<ReadRows> {
    const entries = await Promise.all(TABLE_ORDER.map(async t => [t, await remote.selectAll(t)] as const));
    return Object.fromEntries(entries) as unknown as ReadRows;
  }

  async function refresh() {
    const data = fromRows(await read());
    synced = data ? toRows(data) : emptyRows();
    return data;
  }

  async function write(data: BudgetData) {
    if (!synced) await refresh();
    // Typed rows seen as plain records: the diff and the remote do not care about the columns.
    const known = synced as unknown as Record<TableName, AnyRow[]>;
    const next = toRows(data) as unknown as Record<TableName, AnyRow[]>;
    const changes = {} as Record<TableName, Changes<AnyRow>>;
    for (const t of TABLE_ORDER) {
      changes[t] = diffByKey(known[t], next[t], row => rowKey(t, row));
    }
    const setRows = (t: TableName, rows: AnyRow[]) => (known[t] = rows);
    const rowsOf = (t: TableName) => known[t];

    // Deletions first, children before parents.
    for (const t of [...TABLE_ORDER].reverse()) {
      const { deletes } = changes[t];
      if (!deletes.length) continue;
      await remote.remove(t, deletes);
      setRows(t, applyChanges(rowsOf(t), { upserts: [], deletes }, row => rowKey(t, row)));
    }
    for (const t of TABLE_ORDER) {
      const { upserts } = changes[t];
      if (!upserts.length) continue;
      await remote.upsert(t, upserts);
      setRows(t, applyChanges(rowsOf(t), { upserts, deletes: [] }, row => rowKey(t, row)));
    }
  }

  return {
    load: () => enqueue(refresh),
    save: data => enqueue(() => write(data)),
  };
}
