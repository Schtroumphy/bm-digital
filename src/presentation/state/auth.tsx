import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthService, AuthUser } from '../../application/ports';
import { LoginScreen } from '../screens/Login';

interface Auth {
  user: AuthUser;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

type Session = { status: 'checking' } | { status: 'out' } | { status: 'in'; user: AuthUser };

/**
 * Shows the app only for a signed-in user (spec 0012, RG1). Without a session, or once it expires or ends (RG13),
 * the children are removed from the screen: their state, the budget in memory included, is gone with them.
 */
export function AuthGate({ auth, children }: { auth: AuthService; children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: 'checking' });

  useEffect(
    () =>
      auth.onChange(user =>
        setSession(prev => {
          if (!user) return { status: 'out' };
          // A renewed token tells the same user again: keep the same state, so nothing is reloaded.
          return prev.status === 'in' && prev.user.id === user.id ? prev : { status: 'in', user };
        }),
      ),
    [auth],
  );

  if (session.status === 'checking') return <p className="auth-wait">Chargement…</p>;
  if (session.status === 'out') return <LoginScreen auth={auth} />;
  return (
    <AuthContext.Provider value={{ user: session.user, signOut: () => auth.signOut() }}>
      {/* A different user gets a fresh tree, hence a fresh load. */}
      <Fragment key={session.user.id}>{children}</Fragment>
    </AuthContext.Provider>
  );
}

export function useAuth(): Auth {
  const a = useContext(AuthContext);
  if (!a) throw new Error('useAuth outside AuthGate');
  return a;
}
