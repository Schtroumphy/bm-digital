import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { AuthService, AuthUser } from '../application/ports';

const toUser = (u: User | undefined): AuthUser | null => (u ? { id: u.id, email: u.email ?? '' } : null);

/** E-mail and password sign-in with Supabase Auth. The session is kept and renewed by the Supabase client. */
export function createSupabaseAuth(client: SupabaseClient): AuthService {
  return {
    onChange(listener) {
      // The first event (INITIAL_SESSION) gives the stored session, if any; the next ones follow sign-in, sign-out and expiry.
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (!error) return 'ok';
      if (error.code === 'invalid_credentials') return 'invalid-credentials';
      throw error;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  };
}
