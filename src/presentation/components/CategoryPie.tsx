import { money, percent } from '../../domain/format';
import type { PieSlice } from '../../domain/categories';
import { tone } from './tone';

const SIZE = 160;
const STROKE = 28;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;
const GREY = 'var(--neutral-fill)';

/**
 * Hand-written SVG ring of the month's breakdown by category (spec 0046, RG25). One arc per slice, in the hue of its category.
 * Interactive (RG28): hovering a slice highlights it (`active`, shared with the list) and clicking it unfolds its detail (`onSelect`).
 * The slices are not in the tab order: the rows of the list are the keyboard equivalent. The alternative text lists every slice.
 */
export function CategoryPie({ slices, total, active, onActive, onSelect }: { slices: PieSlice[]; total: number; active: string | null; onActive: (id: string | null) => void; onSelect: (id: string) => void }) {
  const text = slices.map(s => `${s.name} ${money(s.amount)} (${percent(s.share)})`).join(', ');
  return (
    <svg className="cat-pie" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Répartition des dépenses du mois, total ${money(total)} : ${text}`}>
      <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
        {slices.map(s => {
          const len = (s.to - s.from) * C;
          return (
            <circle
              key={s.id}
              className="cat-pie-slice"
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              style={{ stroke: s.hue === null ? GREY : tone(s.hue).base, opacity: active && active !== s.id ? 0.35 : 1 }}
              strokeWidth={active === s.id ? STROKE + 6 : STROKE}
              strokeDasharray={`${len} ${C - len}`}
              strokeDashoffset={-s.from * C}
              onMouseEnter={() => onActive(s.id)}
              onMouseLeave={() => onActive(null)}
              onClick={() => onSelect(s.id)}
            >
              <title>{`${s.name} : ${money(s.amount)}, ${percent(s.share)}`}</title>
            </circle>
          );
        })}
      </g>
    </svg>
  );
}
