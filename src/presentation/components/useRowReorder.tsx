import { useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { dropIndex } from '../../domain/ordering';
import { Icon } from './Icon';

/**
 * Reordering of rows by drag and drop (native browser API) and by keyboard (spec 0055).
 *
 * One call per list of rows that share a block (Budget: one per block card; Simulation: one per block). Each row belongs to a zone,
 * given as the ordered ids of the rows it can be swapped with. A row dropped outside its zone is refused: the zone check is the
 * absence of `preventDefault` on `dragover`, which makes the browser show the « interdit » cursor and ignore the drop.
 *
 * `onMove(id, toIndex)` receives the new position of the row among the rows of its zone (0 = first).
 */
export function useRowReorder(onMove: (id: string, toIndex: number) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  // Row next to which the insertion mark is drawn, and on which side.
  const [mark, setMark] = useState<{ id: string; after: boolean } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  // A moved row can be re-created by the browser; once rendered, the focus goes back to its handle.
  const focusId = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (focusId.current === null) return;
    document.querySelector<HTMLElement>(`[data-reorder-handle="${CSS.escape(focusId.current)}"]`)?.focus();
    focusId.current = null;
  });

  const reset = () => {
    setDragId(null);
    setMark(null);
  };
  /** Final position of the dragged row when it is dropped on the given side of `overId`. */
  const targetIndex = (zone: string[], overId: string, after: boolean) => dropIndex(zone, dragId!, overId, after);
  const move = (id: string, zone: string[], to: number) => {
    onMove(id, to);
    setAnnouncement(`Position ${to + 1} sur ${zone.length}`);
  };

  /** Props of the element that wraps a row: it receives the dragged row and shows the insertion mark. */
  const item = (id: string, zone: string[]) => ({
    className: `reorder-item${dragId === id ? ' is-dragging' : ''}${mark?.id === id ? (mark.after ? ' is-drop-after' : ' is-drop-before') : ''}`,
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (dragId === null || !zone.includes(dragId)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      const useful = id !== dragId && targetIndex(zone, id, after) !== zone.indexOf(dragId);
      setMark(prev => (useful ? (prev?.id === id && prev.after === after ? prev : { id, after }) : prev === null ? prev : null));
    },
    onDrop: (e: DragEvent<HTMLElement>) => {
      if (dragId === null || !zone.includes(dragId)) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const to = targetIndex(zone, id, e.clientY > rect.top + rect.height / 2);
      if (id !== dragId && to !== zone.indexOf(dragId)) move(dragId, zone, to);
      reset();
    },
  });

  /** The « ⋮⋮ » handle of a row: draggable, and focusable to move the row with ▲ ▼. Greyed out when the zone holds a single row. */
  const handle = (id: string, zone: string[], label: string): ReactNode => {
    const single = zone.length < 2;
    const index = zone.indexOf(id);
    const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
      if (single || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const to = index + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= zone.length) return;
      focusId.current = id;
      move(id, zone, to);
    };
    return (
      <span
        className={`reorder-handle${single ? ' is-disabled' : ''}`}
        role="button"
        tabIndex={single ? -1 : 0}
        aria-disabled={single}
        aria-label={`Déplacer ${label || 'la ligne'} (flèches haut et bas pour déplacer)`}
        title={single ? 'Une seule ligne : rien à déplacer' : 'Glisser, ou ▲ ▼ au clavier'}
        data-reorder-handle={id}
        draggable={!single}
        onKeyDown={onKeyDown}
        onDragStart={e => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', id);
          const wrap = e.currentTarget.closest('.reorder-item');
          if (wrap) e.dataTransfer.setDragImage(wrap, 12, 12);
          setDragId(id);
        }}
        onDragEnd={reset}
      >
        <Icon name="grip" size={14} stroke={3} />
      </span>
    );
  };

  /** Hidden text read aloud after a move (« Position 2 sur 5 »). */
  const live = (
    <span className="sr-only" role="status" aria-live="polite">
      {announcement}
    </span>
  );
  return { item, handle, live };
}
