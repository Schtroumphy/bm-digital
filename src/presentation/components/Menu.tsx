import { Fragment, useState } from 'react';
import { Icon } from './Icon';

/**
 * Drop-down menu whose entries keep the chip content (e.g. the account dot), which a native `<select>` cannot show. `pill` is the rounded filter design
 * of the Operations screen. Shared by the Operations filters and the form of a transfer between accounts (spec 0050).
 * Keyboard: Enter or Space opens the menu, Escape closes it, each entry is reachable with Tab and picked with Enter or Space.
 */
export function Menu({ options, value, onPick, render, pill, groupOf, ariaLabel, disabled, placeholder = 'Choisir…', title }: {
  options: [string, string][];
  value: string;
  onPick: (id: string) => void;
  render: (id: string, name: string) => React.ReactNode;
  pill?: boolean;
  /** Heading of the group an option belongs to; options must already be sorted by group. */
  groupOf?: (id: string) => string | undefined;
  /** Accessible name of the closed control (the visible label of a form field). */
  ariaLabel?: string;
  disabled?: boolean;
  /** Shown when no option is selected. */
  placeholder?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o[0] === value);
  const toggle = () => !disabled && setOpen(o => !o);
  const onKey = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      action();
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };
  const content = current ? render(current[0], current[1]) : placeholder;
  const trigger = { role: 'button', tabIndex: disabled ? -1 : 0, 'aria-haspopup': 'listbox' as const, 'aria-expanded': open, 'aria-disabled': disabled || undefined, 'aria-label': ariaLabel, title, onClick: toggle, onKeyDown: (e: React.KeyboardEvent) => onKey(e, toggle) };
  return (
    <span className="acc-picker" style={{ display: 'block' }}>
      {pill ? (
        <div {...trigger} className={`menu-pill${open ? ' is-open' : ''}`} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
          <span className="menu-pill-label">{content}</span>
          <Icon name="chevronDown" size={14} />
        </div>
      ) : (
        <div {...trigger} className="text-input" style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}>
          {content}
        </div>
      )}
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popmenu acc-menu" role="listbox" aria-label={ariaLabel}>
            {options.map(([id, name], i) => {
              const group = groupOf?.(id);
              const pick = () => { setOpen(false); onPick(id); };
              return (
                <Fragment key={id}>
                  {group && group !== (i > 0 ? groupOf?.(options[i - 1][0]) : undefined) && <div className="popmenu-group">{group}</div>}
                  <div role="option" aria-selected={id === value} tabIndex={0} className={`popmenu-item${id === value ? ' is-active' : ''}`} onClick={pick} onKeyDown={e => onKey(e, pick)}>
                    {render(id, name)}
                  </div>
                </Fragment>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}
