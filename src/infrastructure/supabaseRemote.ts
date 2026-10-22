import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteTables } from './supabaseRepository';
import { TABLE_KEYS, type AnyRow } from './supabaseSchema';

const PAGE = 1000; // PostgREST returns at most 1000 rows per request.
const BATCH = 200; // Keeps the request (and the URL of a deletion) small.

function check(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

/** `RemoteTables` on the Supabase client. Requests are scoped to the signed-in user by the database (RLS). */
export function createSupabaseRemote(client: SupabaseClient): RemoteTables {
  return {
    async selectAll(table) {
      const rows: AnyRow[] = [];
      // Ordered by primary key so that pages never overlap.
      const order = ['user_id', ...TABLE_KEYS[table]];
      for (let from = 0; ; from += PAGE) {
        let query = client.from(table).select('*');
        for (const column of order) query = query.order(column);
        const { data, error } = await query.range(from, from + PAGE - 1);
        check(error);
        const page = (data ?? []) as AnyRow[];
        rows.push(...page);
        if (page.length < PAGE) return rows;
      }
    },

    async upsert(table, rows) {
      for (let i = 0; i < rows.length; i += BATCH) {
        const { error } = await client.from(table).upsert(rows.slice(i, i + BATCH));
        check(error);
      }
    },

    async remove(table, keys) {
      const columns = TABLE_KEYS[table];
      // `settings` has one row per user and is never deleted.
      if (!columns.length) return;
      const last = columns[columns.length - 1];
      // One request per value of the leading key columns (the month, usually), then `in (...)` on the last column.
      const groups = new Map<string, AnyRow[]>();
      for (const k of keys) {
        const id = JSON.stringify(columns.slice(0, -1).map(c => k[c]));
        groups.set(id, [...(groups.get(id) ?? []), k]);
      }
      for (const group of groups.values()) {
        for (let i = 0; i < group.length; i += BATCH) {
          const part = group.slice(i, i + BATCH);
          let query = client.from(table).delete();
          for (const c of columns.slice(0, -1)) query = query.eq(c, part[0][c] as string);
          const { error } = await query.in(last, part.map(k => k[last] as string));
          check(error);
        }
      }
    },
  };
}
