import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

const BUBBLE_WIDTH = 300;

/** A « label : value » line becomes a row (label left, value right); any other line stays a plain paragraph. */
function DetailLine({ line }: { line: string }) {
  const i = line.indexOf(' : ');
  if (i > 0 && i <= 40 && i + 3 < line.length) {
    const value = line.slice(i + 3);
    // « + » / « − » prefix = credit / debit of an entry: green / red.
    const tone = value.startsWith('+') ? 'is-credit' : value.startsWith('−') ? 'is-debit' : undefined;
    return (
      <div className="details-row">
        <span>{line.slice(0, i)}</span>
        <b className={tone}>{value}</b>
      </div>
    );
  }
  return <div className="details-line">{line}</div>;
}

/** Bubble of a line's details, beside the row (right if there is room, else left); closed by its cross, a click outside or Escape. Scrolls when taller than the screen. */
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
  const top = Math.max(8, rect.top);
  // Taller than the space left under the row: the body scrolls, the head stays.
  return createPortal(
    <div ref={ref} className="details-bubble" style={{ left, top, width: BUBBLE_WIDTH, maxHeight: window.innerHeight - top - 8 }}>
      <div className="details-bubble-head">
        <div className="popover-title">{title}</div>
        <div className="icon-btn" onClick={onClose}>
          <Icon name="close" size={14} />
        </div>
      </div>
      <div className="details-bubble-body">
        {text.split('\n\n').map((section, k) => (
          <div key={k} className="details-section">
            {section.split('\n').map((line, n) => (
              <DetailLine key={n} line={line} />
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
