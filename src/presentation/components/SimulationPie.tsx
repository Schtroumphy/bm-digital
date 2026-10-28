import { money, percent } from '../../domain/format';
import { revenueSplit, type RevenueSlice, type SimulationTotals } from '../../domain/simulation';
import { SIM_BLOCK_META } from './SimulationBlock';
import { tone } from './tone';

export type SliceId = RevenueSlice['id'];

const REMAINING_HUE = 190;
const SIZE = 124;
const R = 54;
const C = SIZE / 2;
const POP = 4;

export const sliceLabel = (id: RevenueSlice['id']) => (id === 'remaining' ? 'Reste à placer' : SIM_BLOCK_META[id].title);
export const sliceColor = (id: RevenueSlice['id']) => tone(id === 'remaining' ? REMAINING_HUE : SIM_BLOCK_META[id].hue).base;

const point = (angle: number, r: number) => [C + r * Math.sin(angle), C - r * Math.cos(angle)];

/** One wedge between two angles (radians, clockwise from the top). */
function wedge(from: number, to: number): string {
  const [x1, y1] = point(from, R);
  const [x2, y2] = point(to, R);
  return `M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/**
 * Pie chart of how the revenues are split between the outgoing blocks and what is left (hand-written SVG, like `Donut`).
 * Hovering or focusing a wedge, or a bar of the summary (the legend, through `active`), pulls the wedge out, dims the others and shows its amount and share.
 */
export function SimulationPie({ totals, active, onActive }: { totals: SimulationTotals; active: SliceId | null; onActive: (id: SliceId | null) => void }) {
  const slices = revenueSplit(totals);
  const total = slices.reduce((s, x) => s + x.amount, 0);
  const shown = slices.find(s => s.id === active);

  let angle = 0;
  const wedges = slices.map(s => {
    const from = angle;
    angle += (s.amount / total) * 2 * Math.PI;
    return { s, from, to: angle };
  });

  const handlers = (id: SliceId) => ({
    onMouseEnter: () => onActive(id),
    onMouseLeave: () => onActive(null),
    onFocus: () => onActive(id),
    onBlur: () => onActive(null),
  });

  return (
    <div className="sim-pie">
      <div className="kpi-label">Répartition des revenus</div>
      {slices.length === 0 ? (
        <div className="sim-pie-empty">Renseigne des revenus pour voir leur répartition.</div>
      ) : (
        <>
          <svg className="sim-pie-svg" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Répartition des revenus">
            {wedges.map(({ s, from, to }) => {
              const mid = (from + to) / 2;
              const [dx, dy] = active === s.id ? [Math.sin(mid) * POP, -Math.cos(mid) * POP] : [0, 0];
              const common = {
                className: 'sim-pie-wedge',
                fill: sliceColor(s.id),
                opacity: active && active !== s.id ? 0.35 : 1,
                transform: `translate(${dx} ${dy})`,
                tabIndex: 0,
                'aria-label': `${sliceLabel(s.id)} ${money(s.amount)}, ${percent(s.pct)} des revenus`,
                ...handlers(s.id),
              };
              return to - from >= 2 * Math.PI - 1e-6 ? <circle key={s.id} cx={C} cy={C} r={R} {...common} /> : <path key={s.id} d={wedge(from, to)} {...common} />;
            })}
          </svg>
          <div className="sim-pie-info" aria-live="polite">
            {shown ? (
              <>
                <b>{sliceLabel(shown.id)}</b>
                <span>
                  {money(shown.amount)} · {percent(shown.pct)} des revenus
                </span>
              </>
            ) : (
              <span>Survole une part pour la détailler</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
