import { DETAIL_MAX } from '../../domain/detail';

/** Single-line « Détail » field: typing stops at 200 characters, with a discreet counter (spec 0020, RG2). */
export function DetailInput({ value, onChange, onEnter, onEscape, autoFocus }: { value: string; onChange: (v: string) => void; onEnter?: () => void; onEscape?: () => void; autoFocus?: boolean }) {
  return (
    <span className="detail-input">
      <input
        className="text-input"
        value={value}
        maxLength={DETAIL_MAX}
        placeholder="Détail (facultatif)"
        aria-label="Détail"
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onEnter?.();
          if (e.key === 'Escape') onEscape?.();
        }}
      />
      <span className="detail-count">
        {value.length}/{DETAIL_MAX}
      </span>
    </span>
  );
}
