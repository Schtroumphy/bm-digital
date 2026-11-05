import { money } from '../../domain/format';
import type { Line } from '../../domain/types';

/**
 * « Lignes associées » of a transfer (spec 0045): the variable lines of the destination account, one checkbox each, with their budget.
 * Controlled: the parent keeps the list of checked keys. Nothing is shown when the account has no line to propose (RG1).
 */
export function MovementLines({ lines, checked, onToggle, disabled }: { lines: Line[]; checked: string[]; onToggle: (key: string) => void; disabled?: boolean }) {
  if (lines.length === 0) return <div className="muted">Aucune ligne variable pour ce compte</div>;
  return (
    <div>
      <div className="field-label is-gap">Lignes associées <span className="field-optional">facultatif</span></div>
      <div className="chips is-wrap">
        {lines.map(l => (
          <label key={l.key} className="acc-item" style={{ marginRight: 12 }}>
            <input type="checkbox" checked={checked.includes(l.key)} disabled={disabled} onChange={() => onToggle(l.key)} style={{ accentColor: 'var(--violet-ink)' }} />
            {l.name} <span className="muted">{money(l.budget)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** The gap between the budgets of the lines and the amount of the transfer (spec 0045, RG8), in a warning tone. */
export function MovementGap({ budget, amount }: { budget: number; amount: number }) {
  return <span className="state-chip is-warn">Budget lignes {money(budget)} / virement {money(amount)}</span>;
}
