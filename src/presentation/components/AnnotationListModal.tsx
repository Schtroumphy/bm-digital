import type { AttachedOperation } from '../../domain/annotation';
import { money } from '../../domain/format';

/** Text shown on hovering the icon of a line: each annotated operation, its amount then its annotation (spec 0047, RG10). */
export const annotationsTooltip = (ops: AttachedOperation[]): string => ops.map(o => `${money(o.amount, o.kind === 'tx')} — ${o.annotation}`).join('\n');

/** Annotated operations of a line, opened by clicking its icon (spec 0047, RG10): each one can be edited (its text only) or removed. */
export function AnnotationListModal({ title, operations, onEdit, onRemove, onClose }: { title: string; operations: AttachedOperation[]; onEdit: (o: AttachedOperation) => void; onRemove: (o: AttachedOperation) => void; onClose: () => void }) {
  return (
    <div className="annot-backdrop" onMouseDown={onClose} onContextMenu={e => e.stopPropagation()}>
      <div className="panel annot-modal is-wide" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.stopPropagation()} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="annot-title">{title}</div>
        <div className="annot-list">
          {operations.map(o => (
            <div key={`${o.kind}:${o.id}`} className="annot-item">
              <b className="num">{money(o.amount, o.kind === 'tx')}</b>
              <span className="annot-item-label ellipsis" title={o.label}>{o.date.slice(8, 10)}/{o.date.slice(5, 7)} · {o.label}</span>
              <span className="annot-item-text">{o.annotation}</span>
              <span className="annot-item-actions">
                <button type="button" className="btn-outline" onClick={() => onEdit(o)}>Modifier</button>
                <button type="button" className="btn-outline" onClick={() => onRemove(o)}>Supprimer</button>
              </span>
            </div>
          ))}
        </div>
        <div className="annot-actions">
          <button type="button" autoFocus className="btn-dark" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
