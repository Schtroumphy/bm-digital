import { useState, type FormEvent } from 'react';
import type { AuthService } from '../../application/ports';

/** E-mail and password sign-in. No sign-up link: the account is created outside the app (spec 0012, RG2). */
export function LoginScreen({ auth }: { auth: AuthService }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      // On success the session changes and the app replaces this screen by itself.
      const result = await auth.signIn(email.trim(), password);
      if (result === 'invalid-credentials') setError('E-mail ou mot de passe incorrect');
    } catch {
      setError('Connexion impossible. Vérifiez votre réseau, puis réessayez.');
    }
    setSending(false);
  };

  return (
    <div className="auth-screen">
      <div className="auth-brand">Budget Perso</div>
      <form className="card form-card auth-card" onSubmit={submit}>
        <div className="form-title">Connexion</div>
        <label className="field-w">
          <span className="field-label">E-mail</span>
          <input className="text-input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label className="field-w">
          <span className="field-label">Mot de passe</span>
          <input className="text-input" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        <button type="submit" className={`btn-dark is-block${sending ? ' is-disabled' : ''}`} disabled={sending}>
          {sending ? 'Connexion…' : 'Se connecter'}
        </button>
        {error && (
          <div className="auth-error" role="alert">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
