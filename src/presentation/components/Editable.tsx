import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { parseAmount, rawNumber } from '../../domain/format';
import { useUi } from '../state/ui';

interface BaseProps {
  /** Unique cell id; one cell is edited at a time. */
  id: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  inputClassName?: string;
  /** Where the « ↵ valider · Échap annuler » hint sits, if shown. */
  hint?: 'right' | 'left';
  disabled?: boolean;
  title?: string;
}

function useEditor(id: string, commit: (text: string) => void) {
  const { editing, setEditing } = useUi();
  const active = editing === id;
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    if (active) {
      done.current = false;
      ref.current?.focus();
      ref.current?.select();
    }
  }, [active]);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && ref.current) commit(ref.current.value);
    setEditing(null);
  };
  const inputProps = {
    ref,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    },
    onBlur: () => finish(true),
    onClick: (e: React.MouseEvent) => e.stopPropagation(),
  };
  return { active, inputProps, start: () => setEditing(id) };
}

function Shell({ active, start, props, input }: { active: boolean; start: () => void; props: BaseProps; input: ReactNode }) {
  if (active)
    return (
      <div className="edit-wrap">
        {input}
        {props.hint && <div className={`edit-hint edit-hint-${props.hint}`}>↵ valider · Échap annuler</div>}
      </div>
    );
  return (
    <div
      className={props.className}
      style={props.style}
      title={props.title}
      data-disabled={props.disabled || undefined}
      onClick={
        props.disabled
          ? undefined
          : e => {
              e.stopPropagation();
              start();
            }
      }
    >
      {props.children}
    </div>
  );
}

/** A French amount edited in place: Entrée or leaving the field saves, Échap cancels. */
export function EditableAmount(props: BaseProps & { value: number | null; onCommit: (v: number | null) => void; allowEmpty?: boolean }) {
  const { active, inputProps, start } = useEditor(props.id, text => {
    if (!text.trim()) {
      if (props.allowEmpty) props.onCommit(null);
      return;
    }
    const v = parseAmount(text);
    if (v !== null) props.onCommit(v);
  });
  return <Shell active={active} start={start} props={props} input={<input {...inputProps} className={props.inputClassName} defaultValue={rawNumber(props.value)} inputMode="decimal" />} />;
}

export function EditableText(props: BaseProps & { value: string; onCommit: (v: string) => void }) {
  const { active, inputProps, start } = useEditor(props.id, text => {
    if (text.trim()) props.onCommit(text.trim());
  });
  return <Shell active={active} start={start} props={props} input={<input {...inputProps} className={props.inputClassName} defaultValue={props.value} />} />;
}
