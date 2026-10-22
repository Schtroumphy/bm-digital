/** Shown instead of the app when the data could not be read. Never the empty « Démarrage » assistant. */
export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="auth-screen">
      <div className="card form-card auth-card" role="alert">
        <div className="form-title">Chargement impossible</div>
        <p className="auth-text">Vos données n’ont pas pu être lues. Vérifiez votre connexion, puis réessayez.</p>
        <button type="button" className="btn-dark is-block" onClick={onRetry}>
          Réessayer
        </button>
      </div>
    </div>
  );
}
