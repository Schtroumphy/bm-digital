import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The browser only knows the project URL and the public (anon) key, read from the environment (spec 0012, RG15).
 * Never put a service key here: access is limited by the row level security of the database.
 */
export function createSupabaseClient(): SupabaseClient {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont à renseigner dans .env.local (voir .env.example).');
  }
  return createClient(url, anonKey);
}
