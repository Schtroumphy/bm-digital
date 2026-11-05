import type { Category } from '../../domain/types';
import { toneVars } from './tone';

/** « Rouvrir le mois pour modifier » : why the list is disabled on a closed month (RG10). */
export const LOCKED_HINT = 'Rouvrir le mois pour modifier';

/**
 * Drop-down list of the categories of expenses (spec 0046, RG11): « Sans catégorie » first, then the categories in the order of the list.
 * `value` is a category id, '' = « Sans catégorie »; a value no longer in the list is shown as « Sans catégorie ».
 * Three looks, one list of options:
 * - `field` (default): label above a boxed select, for the forms;
 * - `box`: the boxed select alone, for a toolbar;
 * - `inline`: a coloured pill (hue of the category, same `tone` as the other screens; grey for « Sans catégorie »), for a table cell. The native select sits
 *   invisibly on top of the pill, so a click opens the native list and the keyboard works as for any select; no box, no arrow.
 */
export function CategorySelect({ categories, value, disabled, label = 'Catégorie', variant = 'field', lockedHint, onChange }: { categories: Category[]; value: string; disabled?: boolean; label?: string; variant?: 'field' | 'box' | 'inline'; lockedHint?: string; onChange: (id: string) => void }) {
  const current = categories.some(c => c.id === value) ? value : '';
  const select = (
    <select
      className={variant === 'inline' ? 'cat-pill-select' : 'su-select'}
      aria-label={label}
      disabled={disabled}
      title={disabled && lockedHint ? lockedHint : undefined}
      value={current}
      onChange={e => onChange(e.target.value)}
    >
      <option value="">Sans catégorie</option>
      {categories.map(c => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
  if (variant === 'inline') {
    const category = categories.find(c => c.id === current);
    return (
      <span className={`cat-pill${category ? '' : ' is-none'}${disabled ? ' is-disabled' : ''}`} style={category ? toneVars(category.hue) : undefined} title={disabled && lockedHint ? lockedHint : undefined}>
        <span className="cat-pill-text">{category?.name ?? 'Sans catégorie'}</span>
        {select}
      </span>
    );
  }
  if (variant !== 'field') return select;
  return (
    <label className="field-w">
      <span className="field-label">{label}</span>
      {select}
      {disabled && lockedHint && <span className="field-optional">{lockedHint}</span>}
    </label>
  );
}
