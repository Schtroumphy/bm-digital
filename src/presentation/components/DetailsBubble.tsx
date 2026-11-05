import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const BUBBLE_WIDTH = 300;

/** Bubble of a line's details, beside the row (right if there is room, else left); closed by its cross, a click outside or Escape. */
export function DetailsBubble({ title, text, rect, onClose }: { title: string; text: string; rect: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const room = window.innerWidth - rect.right;
  const left = room >= BUBBLE_WIDTH + 12 ? rect.right + 8 : Math.max(8, rect.left - BUBBLE_WIDTH - 8);
  return createPortal(
    <div ref={ref} className="details-bubble" style={{ left, top: Math.max(8, rect.top), width: BUBBLE_WIDTH }}>
      <div className="details-bubble-head">
        <div className="popover-title">{title}</div>
        <div className="icon-btn" onClick={onClose}>
          <Icon name="close" size={14} />
        </div>
      </div>
      <div className="details-bubble-text">{text}</div>
    </div>,
    document.body,
  );
}
