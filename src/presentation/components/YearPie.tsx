import { money, percent } from '../../domain/format';
import type { YearSlice, YearSliceId } from '../../domain/yearView';

const R = 70;
const CIRC = 2 * Math.PI * R;

interface Props {
  slices: YearSlice[];
  /** Total of the revenues, shown in the middle. */
  total: number;
  color: (id: YearSliceId) => string;
  active: YearSliceId | null;
  onActive: (id: YearSliceId | null) => void;
  label: string;
}

/**
 * Donut of the year's revenues (spec 0044, RG22) with its legend list. Hovering or focusing a part or a legend row pulls the part out,
 * dims the others and shows its amount and share in the middle. A part with no amount is not drawn but stays listed.
 */
export function YearPie({ slices, total, color, active, onActive, label }: Props) {
  const drawn = slices.reduce((s, x) => s + x.amount, 0) || 1;
  const shown = slices.find(s => s.id === active);
  let cum = 0;
  const arcs = slices.map(s => {
    const len = (s.amount / drawn) * CIRC;
    const arc = { s, len, off: -cum };
    cum += len;
    return arc;
  });
  const handlers = (id: YearSliceId) => ({
    onMouseEnter: () => onActive(id),
    onMouseLeave: () => onActive(null),
    onFocus: () => onActive(id),
    onBlur: () => onActive(null),
  });

  return (
    <>
      <div className="ya-pie-wrap">
        <div className="ya-pie">
          <svg viewBox="0 0 200 200" width="176" height="176" role="img" aria-label={label}>
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(32,30,29,.06)" strokeWidth="28" />
            {arcs
              .filter(a => a.s.amount > 0)
              .map(({ s, len, off }) => (
                <circle
                  key={s.id}
                  cx="100"
                  cy="100"
                  r={R}
                  fill="none"
                  stroke={color(s.id)}
                  strokeWidth={active === s.id ? 34 : 28}
                  strokeDasharray={`${Math.max(0, len - 1.5)} ${CIRC - Math.max(0, len - 1.5)}`}
                  strokeDashoffset={off}
                  transform="rotate(-90 100 100)"
                  opacity={active && active !== s.id ? 0.35 : 1}
                  className="ya-pie-arc"
                  tabIndex={0}
                  aria-label={`${s.label} ${money(s.amount)}, ${percent(s.pct)} des revenus`}
                  {...handlers(s.id)}
                />
              ))}
          </svg>
          <div className="ya-pie-center" aria-live="polite">
            {shown ? (
              <>
                <span className="ya-pie-cap">{shown.label}</span>
                <span className="ya-pie-total">{money(shown.amount)}</span>
                <span className="ya-pie-cap">{percent(shown.pct)} des revenus</span>
              </>
            ) : (
              <>
                <span className="ya-pie-cap">Revenus</span>
                <span className="ya-pie-total">{money(total)}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <ul className="ya-pie-legend">
        {slices.map(s => (
          <li key={s.id} className={`ya-pie-row${active === s.id ? ' is-active' : ''}`} {...handlers(s.id)}>
            <span className="ya-pie-dot" style={{ background: color(s.id) }} />
            <span className="ya-pie-name">{s.label}</span>
            <span className="ya-pie-amount">{money(s.amount)}</span>
            <b>{percent(s.pct)}</b>
          </li>
        ))}
      </ul>
    </>
  );
}
