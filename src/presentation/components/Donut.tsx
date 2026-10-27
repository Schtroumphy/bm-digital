import type { DashboardDonut, DonutId } from '../../domain/dashboard';
import { money, percent } from '../../domain/format';

/** Colors of the slices (spec 0027, RG4): credits and fixed expenses in the expense family, variables in salmon, savings in violet, envelopes in lavender, investments in blue, what is left in turquoise. */
export const DONUT_COLORS: Record<DonutId, string> = {
  cre: 'oklch(0.55 0.13 35)',
  fix: 'oklch(0.68 0.13 38)',
  var: 'oklch(0.76 0.11 40)',
  epa: 'oklch(0.66 0.12 300)',
  env: 'oklch(0.82 0.09 300)',
  inv: 'oklch(0.7 0.13 250)',
  remaining: 'oklch(0.86 0.09 190)',
};

/** Drawing order around the ring, from the top, clockwise. */
const RING_ORDER: DonutId[] = ['cre', 'fix', 'var', 'epa', 'env', 'inv', 'remaining'];

const SIZE = 140;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Hand-written SVG ring: one arc per slice, proportional to the income. Negative parts are not drawn; without income the ring is grey.
 * Hovering (or focusing) an arc, or a legend row through `active`, shows that slice in the center and dims the others.
 */
export function Donut({ donut, active, onActive }: { donut: DashboardDonut; active: DonutId | null; onActive: (id: DonutId | null) => void }) {
  const shown = active ? donut.slices.find(s => s.id === active) : undefined;
  let offset = 0;
  return (
    <div className="donut">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Répartition du revenu du mois">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="oklch(0.94 0.005 80)" strokeWidth={STROKE} />
        <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
          {RING_ORDER.map(id => {
            const slice = donut.slices.find(s => s.id === id);
            if (!slice || !slice.drawn) return null;
            const len = Math.min(C, (slice.amount / donut.income) * C);
            const arc = (
              <circle
                key={id}
                className="donut-arc"
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={DONUT_COLORS[id]}
                strokeWidth={active === id ? STROKE + 4 : STROKE}
                strokeDasharray={`${len} ${C - len}`}
                strokeDashoffset={-offset}
                opacity={active && active !== id ? 0.35 : 1}
                tabIndex={0}
                aria-label={`${slice.label} ${money(slice.amount)}`}
                onMouseEnter={() => onActive(id)}
                onMouseLeave={() => onActive(null)}
                onFocus={() => onActive(id)}
                onBlur={() => onActive(null)}
              />
            );
            offset += len;
            return arc;
          })}
        </g>
      </svg>
      <div className="donut-center">
        <span>{shown ? shown.label : 'Revenus'}</span>
        <b>{money(shown ? shown.amount : donut.income)}</b>
        {shown && shown.pct !== null && <span>{percent(shown.pct)} du revenu</span>}
      </div>
    </div>
  );
}
