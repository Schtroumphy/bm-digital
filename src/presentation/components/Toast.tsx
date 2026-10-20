import { useEffect } from 'react';

/** Short message at the bottom of the screen with one action; it closes itself after `duration` ms. */
export function Toast({ message, actionLabel, onAction, onClose, duration = 5000 }: { message: string; actionLabel: string; onAction: () => void; onClose: () => void; duration?: number }) {
  useEffect(() => {
    const t = setTimeout(onClose, duration);
    return () => clearTimeout(t);
  }, [message, duration, onClose]);
  return (
    <div className="toast" role="status">
      <span>{message}</span>
      <button type="button" className="toast-action" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}
