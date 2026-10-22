import { stableStringify } from '../application/diff';
import type { RemoteTables } from './supabaseRepository';
import { rowKey, TABLE_ORDER, type AnyRow, type TableName } from './supabaseSchema';

export interface MemoryRemote extends RemoteTables {
  /** Every request received, in order (`upsert:budget_lines`, `remove:transactions`...). */
  readonly calls: string[];
  /** Makes the next requests fail, as a lost network would, until `failing` is set back to `false`. */
  failing: boolean;
  /** Number of rows held in `table`. */
  count(table: TableName): number;
}

/**
 * A database in memory for one user, behaving like the Supabase tables the repository relies on:
 * rows replaced by primary key, `user_id` added on reading, object keys sorted like `jsonb` does.
 * Used by the tests of the repository.
 */
export function createMemoryRemote(): MemoryRemote {
  const tables = new Map<TableName, Map<string, AnyRow>>(TABLE_ORDER.map(t => [t, new Map()]));
  const calls: string[] = [];
  const copy = (row: AnyRow): AnyRow => JSON.parse(stableStringify(row)) as AnyRow;
  const unreachable = () => {
    throw new Error('network down');
  };

  const remote: MemoryRemote = {
    calls,
    failing: false,
    count: t => tables.get(t)!.size,
    async selectAll(table) {
      calls.push(`select:${table}`);
      if (remote.failing) unreachable();
      return [...tables.get(table)!.values()].map(r => ({ user_id: 'user-1', ...copy(r) }));
    },
    async upsert(table, rows) {
      calls.push(`upsert:${table}`);
      if (remote.failing) unreachable();
      for (const r of rows) tables.get(table)!.set(rowKey(table, r), copy(r));
    },
    async remove(table, keys) {
      calls.push(`remove:${table}`);
      if (remote.failing) unreachable();
      for (const k of keys) tables.get(table)!.delete(rowKey(table, k));
    },
  };
  return remote;
}
