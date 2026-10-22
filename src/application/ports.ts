import type { BudgetData } from '../domain/types';

/**
 * Where the budget lives. The application only talks to this port, so the
 * Supabase implementation (the one used by the app) and the localStorage one
 * are interchangeable without touching the screens.
 *
 * - `load` returns `null` only when nothing is stored yet. A read failure
 *   rejects: it is never mistaken for an empty account (spec 0012, RG7).
 * - `save` writes the whole aggregate as far as the caller can tell, and
 *   rejects on failure. Calling it again with the same data retries everything
 *   that is not stored yet.
 */
export interface BudgetRepository {
  load(): Promise<BudgetData | null>;
  save(data: BudgetData): Promise<void>;
}

/** The signed-in user. */
export interface AuthUser {
  id: string;
  email: string;
}

export type SignInResult = 'ok' | 'invalid-credentials';

/**
 * Who is using the app. Sign-up is not offered: the single account is created
 * outside the application (spec 0012, RG2).
 */
export interface AuthService {
  /**
   * Calls `listener` with the current user (or `null`) as soon as it is known,
   * then each time the session starts or ends (sign-out, expired session).
   * Returns the function that stops listening.
   */
  onChange(listener: (user: AuthUser | null) => void): () => void;
  /** Rejects when the service cannot be reached; a wrong e-mail or password is a normal result. */
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
}
