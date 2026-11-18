import { ANNOTATION_MAX, isAnnotationTooLong } from '../../domain/annotation';

/**
 * Single-line « Annotation » field of the entry forms (spec 0051, RG6, RG7). Never cuts the text: past 500 characters the counter turns red and
 * the caller refuses to save (`isAnnotationTooLong`). Line breaks are typed through the modal of the annotation (spec 0047).
 */
export function AnnotationInput({ value, onChange, onEnter, onEscape, autoFocus }: { value: string; onChange: (v: string) => void; onEnter?: () => void; onEscape?: () => void; autoFocus?: boolean }) {
  const over = isAnnotationTooLong(value);
  return (
    <span className="annot-inline">
      <input
        className="text-input"
        value={value}
        placeholder="Annotation (facultatif)"
        aria-label="Annotation"
        aria-invalid={over}
        autoFocus={autoFocus}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onEnter?.();
          if (e.key === 'Escape') onEscape?.();
        }}
      />
      <span className={`annot-inline-count${over ? ' is-over' : ''}`}>
        {value.trim().length}/{ANNOTATION_MAX}
      </span>
    </span>
  );
}
