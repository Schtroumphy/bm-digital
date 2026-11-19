import { useEffect } from 'react';

/** Confirmation modal before a destructive action. Escape or « Annuler » closes without change; the confirm button is focused. */
export function ConfirmModal({ title, message, confirmLabel = 'Supprimer', onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; onConfirm: () => void; onClose: () => void }) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus();
    };
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="annot-backdrop" onMouseDown={onClose} onContextMenu={e => e.stopPropagation()}>
      <div className="panel annot-modal" role="alertdialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
        <div className="annot-title">{title}</div>
        <div>{message}</div>
        <div className="annot-actions">
          <button type="button" className="btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn-dark"
            autoFocus
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
