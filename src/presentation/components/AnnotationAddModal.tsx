import { useEffect, useState } from 'react';
import { isAnnotationTooLong, normalizeAnnotation, type AttachedOperation, type OperationRef } from '../../domain/annotation';
import { money } from '../../domain/format';
import { AnnotationField } from './AnnotationModal';

const keyOf = (o: OperationRef) => `${o.kind}:${o.id}`;
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Modal opened from a line of the Budget (spec 0047, RG9): lists the operations attached to the line for the month, with a checkbox each, and applies one
 * text to the checked ones. « Enregistrer » is disabled without a checked operation or with an empty or too long text. When a checked operation already
 * carries an annotation, its text is shown beside it and a confirmation is asked before overwriting (`overwrites` tells which ones).
 */
export function AnnotationAddModal({ title, operations, overwrites, onSave, onClose }: { title: string; operations: AttachedOperation[]; overwrites: (refs: OperationRef[]) => OperationRef[]; onSave: (refs: OperationRef[], text: string) => void; onClose: () => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  // Number of annotations about to be overwritten, while the confirmation is shown.
  const [confirming, setConfirming] = useState<number | null>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => opener?.focus();
  }, []);
  const refs: OperationRef[] = operations.filter(o => checked.has(keyOf(o))).map(({ kind, id }) => ({ kind, id }));
  const canSave = refs.length > 0 && normalizeAnnotation(text) !== undefined && !isAnnotationTooLong(text);
  const commit = () => {
    onSave(refs, text);
    onClose();
  };
  const save = () => {
    if (!canSave) return;
    const replaced = overwrites(refs).length;
    if (replaced > 0) setConfirming(replaced);
    else commit();
  };
  const toggle = (key: string) =>
    setChecked(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  // Escape closes the confirmation when it is shown, else the modal, whatever element has the focus (spec 0047, CA16). The text field lets the key bubble up to here.
  const onEscape = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (confirming !== null) setConfirming(null);
    else onClose();
  };
  const allChecked = operations.length > 0 && checked.size === operations.length;
  return (
    <div className="annot-backdrop" onMouseDown={onClose} onContextMenu={e => e.stopPropagation()}>
      <div className="panel annot-modal is-wide" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()} onKeyDown={onEscape}>
        <div className="annot-title">{title}</div>
        {operations.length === 0 ? (
          <div className="annot-empty">Aucune opération n’est rattachée à cette ligne pour ce mois : il n’y a rien à annoter.</div>
        ) : (
          <>
            <div className="annot-ops-head">
              <span>Opérations concernées</span>
              <button type="button" className="btn-outline" onClick={() => setChecked(allChecked ? new Set() : new Set(operations.map(keyOf)))}>
                {allChecked ? 'Tout décocher' : 'Tout cocher'}
              </button>
            </div>
            <div className="annot-ops">
              {operations.map(o => (
                <label key={keyOf(o)} className="annot-op">
                  <input type="checkbox" checked={checked.has(keyOf(o))} onChange={() => toggle(keyOf(o))} />
                  <span className="annot-op-date">{shortDate(o.date)}</span>
                  <span className="annot-op-label ellipsis" title={o.label}>{o.label}</span>
                  <b className="num">{money(o.amount, o.kind === 'tx')}</b>
                  {o.annotation && <span className="annot-op-current" title={o.annotation}>Déjà annotée : {o.annotation}</span>}
                </label>
              ))}
            </div>
            <AnnotationField autoFocus value={text} onChange={setText} onEnter={save} onEscape={() => {}} />
          </>
        )}
        <div className="annot-actions">
          <button type="button" className="btn-outline" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="btn-dark" disabled={!canSave} onClick={save}>
            Enregistrer
          </button>
        </div>
        {confirming !== null && (
          <div className="annot-backdrop" onMouseDown={e => { e.stopPropagation(); setConfirming(null); }}>
            <div className="panel annot-modal" role="alertdialog" aria-modal="true" aria-label="Confirmer le remplacement" onMouseDown={e => e.stopPropagation()}>
              <div className="annot-title">
                {confirming} opération{confirming > 1 ? 's' : ''} déjà annotée{confirming > 1 ? 's' : ''} sera{confirming > 1 ? 'ont' : ''} remplacée{confirming > 1 ? 's' : ''}.
              </div>
              <div className="annot-actions">
                <button type="button" className="btn-outline" autoFocus onClick={() => setConfirming(null)}>
                  Annuler
                </button>
                <button type="button" className="btn-dark" onClick={commit}>
                  Remplacer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
