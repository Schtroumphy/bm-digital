import { useEffect, useRef, useState } from 'react';
import { ANNOTATION_MAX, isAnnotationTooLong } from '../../domain/annotation';

/**
 * Text field of an annotation with its counter (spec 0047, RG2, RG9). Enter calls `onEnter`, Shift+Enter adds a line break, Escape calls `onEscape`.
 * Over 500 characters: the counter turns red (the text is never cut; the caller disables « Enregistrer »).
 */
export function AnnotationField({ value, onChange, onEnter, onEscape, autoFocus }: { value: string; onChange: (text: string) => void; onEnter: () => void; onEscape: () => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    ref.current?.focus();
    ref.current?.setSelectionRange(value.length, value.length);
    // Only on opening: typing must not move the cursor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <textarea
        ref={ref}
        aria-label="Texte de l’annotation"
        className="cell-input is-text annot-input"
        rows={5}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') onEscape();
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      <div className={`annot-count${isAnnotationTooLong(value) ? ' is-over' : ''}`} aria-live="polite">
        {value.trim().length} / {ANNOTATION_MAX}
      </div>
    </>
  );
}

/**
 * Modal to edit the annotation of ONE operation (spec 0047, RG10, RG12). Enter saves, Shift+Enter adds a line break, Escape or « Annuler » closes
 * without change. An empty text saves as « no annotation » (the annotation is removed).
 */
export function AnnotationModal({ title, initial, onSave, onClose }: { title: string; initial: string; onSave: (text: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  const tooLong = isAnnotationTooLong(text);
  useEffect(() => {
    // Focus comes back to the element that opened the modal on closing.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => opener?.focus();
  }, []);
  const save = () => {
    if (tooLong) return;
    onSave(text);
    onClose();
  };
  return (
    <div className="annot-backdrop" onMouseDown={onClose} onContextMenu={e => e.stopPropagation()}>
      <div className="panel annot-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()}>
        <div className="annot-title">{title}</div>
        <AnnotationField autoFocus value={text} onChange={setText} onEnter={save} onEscape={onClose} />
        <div className="annot-actions">
          <button type="button" className="btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-dark" disabled={tooLong} onClick={save}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}
