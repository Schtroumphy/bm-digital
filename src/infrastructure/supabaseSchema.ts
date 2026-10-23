import type { Database } from '../domain/database.types';

type Tables = Database['public']['Tables'];

export type TableName = keyof Tables;
/** A row as the app writes it: `user_id` is filled in by the database (`auth.uid()`). */
export type InsertRow<T extends TableName> = Tables[T]['Insert'];
/** A row as the database returns it. */
export type SelectRow<T extends TableName> = Tables[T]['Row'];

export type TableRows = { [T in TableName]: InsertRow<T>[] };
export type ReadRows = { [T in TableName]: SelectRow<T>[] };

/**
 * Tables in the order they are written: a table comes after the ones it refers to.
 * Deletions run in the reverse order.
 */
export const TABLE_ORDER: readonly TableName[] = [
  'settings',
  'bank_accounts',
  'envelopes',
  'template_lines',
  'months',
  'budget_lines',
  'line_checks',
  'account_balances',
  'envelope_allocations',
  'envelope_history',
  'account_statements',
  'transactions',
  'account_movements',
  'import_rules',
  'import_account_links',
  'transfers',
  'transfers_done',
  'adjustments',
  'planned_items',
  'year_closes',
];

/** Primary key of each table, without `user_id` (the database scopes every request to the signed-in user). */
export const TABLE_KEYS: Record<TableName, readonly string[]> = {
  settings: [],
  bank_accounts: ['id'],
  envelopes: ['id'],
  template_lines: ['key'],
  months: ['month'],
  budget_lines: ['month', 'key'],
  line_checks: ['month', 'line_key'],
  account_balances: ['month', 'account_id'],
  envelope_allocations: ['month', 'envelope_id'],
  envelope_history: ['month', 'envelope_id'],
  account_statements: ['month', 'account_key'],
  transactions: ['id'],
  account_movements: ['id'],
  import_rules: ['id'],
  import_account_links: ['id'],
  transfers: ['id'],
  transfers_done: ['month', 'transfer_id'],
  adjustments: ['id'],
  planned_items: ['id'],
  year_closes: ['year'],
};

export type AnyRow = Record<string, unknown>;

/** Identity of a row inside its table. */
export function rowKey(table: TableName, row: AnyRow): string {
  return TABLE_KEYS[table].map(c => String(row[c])).join('\u0001');
}

export function emptyRows(): TableRows {
  return Object.fromEntries(TABLE_ORDER.map(t => [t, []])) as unknown as TableRows;
}
