import { useEffect, useRef, useState } from 'react';
import { MONTH_SHORT, money } from '../../domain/format';
import type { YearSeries } from '../../domain/yearView';

const LEFT = 52;
const TOP = 12;
const AXIS_H = 28;

/** Round graduation step (1, 2 or 5 × a power of ten) giving at most 5 intervals up to `max`. */
export function niceStep(max: number): number {
  if (max <= 0) return 1;
  const raw = max / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 5, 10].find(u => u * pow >= raw)!;
  return unit * pow;
}

const axisLabel = (v: number) => (v >= 1000 ? `${(v / 1000).toString().replace('.', ',')} k` : String(v));

interface Props {
  series: YearSeries[];
  /** Colour of a series. */
  color: (id: YearSeries['id']) => string;
  /** Month index (0-11) of the current month, highlighted on the axis; null if none. */
  currentMonth: number | null;
  label: string;
}

/**
 * Multi-series line chart over the 12 months (spec 0044, RG21), hand-written SVG. A null value is not drawn and cuts the line.
 * Hovering or focusing a point shows its month, series and amount.
 */
export function YearLineChart({ series, color, currentMonth, label }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1000, h: 300 });
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.max(300, Math.round(e.contentRect.width)), h: Math.max(180, Math.round(e.contentRect.height)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = size.w;
  const H = size.h;
  const BOTTOM = H - AXIS_H;
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const values = series.flatMap(s => s.values.filter((v): v is number => v !== null));
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  // The axis spans negative values too (e.g. a savings withdrawal): graduations run from the lowest multiple of the step up to the highest.
  const step = niceStep(max - min);
  const top = max > 0 ? Math.ceil(max / step) * step : min < 0 ? 0 : step;
  const bottomValue = Math.floor(min / step) * step;
  const X = (i: number) => LEFT + ((i + 0.5) * (W - LEFT)) / 12;
  const Y = (v: number) => BOTTOM - ((v - bottomValue) / (top - bottomValue)) * (BOTTOM - TOP);
  const ticks = Array.from({ length: Math.round((top - bottomValue) / step) + 1 }, (_, j) => bottomValue + j * step);

  return (
    <div className="ya-chart-box" ref={boxRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="ya-chart" role="img" aria-label={label}>
        {ticks.map(t => (
          <g key={t}>
            <line x1={LEFT} x2={W} y1={Y(t)} y2={Y(t)} className="ya-grid" strokeWidth={t === 0 && bottomValue < 0 ? 1.6 : undefined} />
            <text x={LEFT - 8} y={Y(t)} className="ya-axis" textAnchor="end" dominantBaseline="middle">
              {axisLabel(t)}
            </text>
          </g>
        ))}
        {MONTH_SHORT.map((m, i) => (
          <text key={m} x={X(i)} y={BOTTOM + 20} className={`ya-axis${i === currentMonth ? ' is-current' : ''}`} textAnchor="middle">
            {m}
          </text>
        ))}
        {series.map(s => {
          let d = '';
          let pen = false;
          s.values.forEach((v, i) => {
            if (v === null) {
              pen = false;
              return;
            }
            d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`;
            pen = true;
          });
          return <path key={s.id} d={d} fill="none" stroke={color(s.id)} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {series.flatMap(s =>
          s.values.map((v, i) => {
            if (v === null) return null;
            const text = `${MONTH_SHORT[i]} · ${s.label} · ${money(v)}`;
            const show = () => setTip({ x: X(i), y: Y(v), text });
            return (
              <g key={`${s.id}-${i}`} tabIndex={0} aria-label={text} onMouseEnter={show} onMouseLeave={() => setTip(null)} onFocus={show} onBlur={() => setTip(null)}>
                <circle cx={X(i)} cy={Y(v)} r="10" fill="transparent" />
                <circle cx={X(i)} cy={Y(v)} r="3" fill="#fff" stroke={color(s.id)} strokeWidth="2" />
              </g>
            );
          }),
        )}
        {tip && (
          <g pointerEvents="none">
            <rect x={Math.min(Math.max(tip.x - 90, LEFT), W - 180)} y={Math.max(tip.y - 34, 0)} width="180" height="24" rx="6" className="ya-tip" />
            <text x={Math.min(Math.max(tip.x - 90, LEFT), W - 180) + 90} y={Math.max(tip.y - 34, 0) + 12} textAnchor="middle" dominantBaseline="middle" className="ya-tip-text">
              {tip.text}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
