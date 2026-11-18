import { money } from '../../domain/format';

const W = 96;
const H = 26;
const PAD = 4;

/**
 * Hand-written SVG trend of a category (spec 0052, RG9): one point per month, the last one (the month shown) in full colour, the others faded.
 * A `null` value is a future month: no point, and the line stops there. The alternative text lists the amounts month by month.
 */
export function Sparkline({ values, labels, color }: { values: (number | null)[]; labels: string[]; color: string }) {
  const max = Math.max(...values.map(v => v ?? 0), 0);
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(values.length - 1, 1);
  const y = (v: number) => (max > 0 ? H - PAD - (v / max) * (H - 2 * PAD) : H - PAD);
  const points = values.flatMap((v, i) => (v === null ? [] : [{ i, v, x: x(i), y: y(v) }]));
  const text = values.map((v, i) => `${labels[i]} ${v === null ? 'pas de point' : money(v)}`).join(', ');
  const last = values.length - 1;
  return (
    <svg className="cat-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`6 derniers mois : ${text}`}>
      {points.length > 1 && <polyline points={points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={1.5} strokeLinejoin="round" />}
      {points.map(p => (
        <circle key={p.i} cx={p.x} cy={p.y} r={p.i === last ? 3.5 : 2} fill={color} fillOpacity={p.i === last ? 1 : 0.4} />
      ))}
    </svg>
  );
}
