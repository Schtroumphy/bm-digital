import { useState } from 'react';
import { DetailsBubble } from '../components/DetailsBubble';
import { Icon } from '../components/Icon';
import { tone } from '../components/tone';
import { YearLineChart } from '../components/YearLineChart';
import { YearPie } from '../components/YearPie';
import { currentMonthKey, money, MONTH_SHORT, monthLabel, percent } from '../../domain/format';
import { rowTotal, yearCellEntries, yearLineDetails, yearView, type YearBlockId, type YearMode, type YearRow, type YearSliceId } from '../../domain/yearView';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';
import type { OperationsFocus } from './Expenses';

const dash = '—';

/** Which direction is good news for a row: income and savings should go up, expenses down. */
type Good = 'up' | 'down';
const BLOCK_GOOD: Record<YearBlockId, Good> = { rev: 'up', epa: 'up', inv: 'up', cre: 'down', fix: 'down', var: 'down', pln: 'down', env: 'down' };

/** Change in % from the previous month; null when either month is unknown, the previous one is zero or nothing changed (rounded to 0,1 %). */
function evolution(prev: number | null | undefined, v: number | null): number | null {
  if (prev === null || prev === undefined || v === null || prev === 0) return null;
  const pct = Math.round(((v - prev) / Math.abs(prev)) * 1000) / 10;
  return pct === 0 ? null : pct;
}

/** Hue of each block / series, the same in the table, the curves and the pie (RG21): the block hues of the app. */
const HUES: Record<YearBlockId | YearSliceId, number> = { rev: 150, cre: 20, fix: 38, var: 75, pln: 340, epa: 300, inv: 250, env: 330, sav: 300, left: 190 };
const color = (id: YearBlockId | YearSliceId) => tone(HUES[id]).base;

/** Vue annuelle (spec 0044): read-only table of the 12 months of a year, by block and line. */
export function YearViewScreen({ year, onOpenOperations }: { year: number; onOpenOperations: (month: string, focus: OperationsFocus) => void }) {
  const { data, ledger } = useStore();
  const { openMenu } = useUi();
  const [details, setDetails] = useState<{ title: string; text: string; rect: DOMRect } | null>(null);
  const [mode, setMode] = useState<YearMode>('real');
  const [average, setAverage] = useState(false);
  const [showEvolution, setShowEvolution] = useState(false);
  const [active, setActive] = useState<YearSliceId | null>(null);
  const [open, setOpen] = useState<Set<YearBlockId>>(new Set());
  const today = currentMonthKey();
  const view = yearView(data, ledger, year, mode, today);
  const target = view.rateTarget;
  const k = view.kpis;
  const kind = mode === 'budget' ? 'budgétés' : 'réels';
  const cur = view.months.findIndex(m => m.month === today);
  const kpiCards: { label: string; value: number | null; sub: string }[] = [
    { label: 'Revenus', value: k.income, sub: k.incomeMean === null ? dash : `soit ${money(k.incomeMean)} par mois` },
    { label: 'Dépenses', value: k.expenses, sub: k.planned === null ? dash : `dont ${money(k.planned)} prévues` },
    { label: 'Épargne et placements', value: k.savings, sub: k.savingsPct === null ? dash : `${percent(k.savingsPct)} des revenus` },
    { label: 'Reste à vivre', value: k.left, sub: k.left === null ? dash : 'après épargne' },
  ];

  const toggle = (id: YearBlockId) =>
    setOpen(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  // Display of one value: « — » for an unknown month, and for a zero where the row asks for it (RG7).
  const fmt = (r: YearRow, v: number | null, f: (n: number) => string = n => money(n)) => (v === null || (r.dashZero && v === 0) ? dash : f(v));
  const cells = (r: YearRow, f?: (n: number) => string, line?: { block: YearBlockId; section: string; name: string }, good?: Good) => (
    <>
      {r.values.map((v, i) => {
        const delta = showEvolution ? evolution(r.values[i - 1], v) : null;
        const entries = line && v !== null ? yearCellEntries(data, view.months[i].month, line.block, line.section, line.name) : null;
        const open = entries ? () => onOpenOperations(view.months[i].month, { type: entries.type, target: entries.target, label: `${line!.name} · ${monthLabel(view.months[i].month)}` }) : undefined;
        const recap = entries ? [`${entries.count} opération${entries.count > 1 ? 's' : ''} · ${money(entries.total)}`, ...entries.top.map(t => `${t.date.slice(8, 10)}/${t.date.slice(5, 7)} · ${t.label} · ${money(t.amount)}`), ...(entries.count > entries.top.length ? [`… et ${entries.count - entries.top.length} autre${entries.count - entries.top.length > 1 ? 's' : ''}`] : []), 'Cliquer pour voir le détail'].join('\n') : undefined;
        return (
          <div key={i} className={`ya-cell${v === null ? ' is-empty' : ''}${open ? ' is-link' : ''}`} onClick={open ? e => { e.stopPropagation(); open(); } : undefined} title={recap} role={open ? 'link' : undefined} tabIndex={open ? 0 : undefined} onKeyDown={open ? e => e.key === 'Enter' && open() : undefined}>
            {delta !== null ? (
              <span className="ya-with-delta">
                <span className={`ya-delta${good ? ((delta > 0) === (good === 'up') ? ' is-good' : ' is-bad') : ''}`} title="Évolution par rapport au mois précédent">{delta > 0 ? '+' : '−'}{percent(Math.abs(delta)).replace(' %', '')} %</span>
                {fmt(r, v, f)}
              </span>
            ) : (
              fmt(r, v, f)
            )}
          </div>
        );
      })}
      <div className="ya-cell is-total">{fmt(r, rowTotal(r, average), f)}</div>
      {r.balance !== undefined && <div className={`ya-cell is-balance${r.balance === null ? ' is-empty' : ''}`}>{r.balance === null ? dash : money(r.balance)}</div>}
    </>
  );

  const rates = view.summary.rate.values;
  const ratePoints = rates.flatMap((v, i) => (v === null ? [] : [{ i, v }]));
  const spark = (() => {
    if (ratePoints.length < 2) return null;
    const vs = ratePoints.map(p => p.v).concat(target === null ? [] : [target]);
    const lo = Math.min(...vs) - 3;
    const hi = Math.max(...vs) + 3;
    const x = (i: number) => 2 + (i * 60) / 11;
    const y = (v: number) => 18 - ((v - lo) / (hi - lo)) * 16;
    return { points: ratePoints.map(p => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' '), targetY: target === null ? null : y(target) };
  })();

  return (
    <>
      <div className="ya-bar">
        <div className="ya-seg" role="group" aria-label="Valeurs affichées">
          {(['budget', 'real'] as const).map(m => (
            <button key={m} type="button" className={`ya-seg-btn${mode === m ? ' is-on' : ''}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'budget' ? 'Budgété' : 'Réel'}
            </button>
          ))}
        </div>
        <button type="button" className={`switch${showEvolution ? ' is-on' : ''}`} role="switch" aria-checked={showEvolution} onClick={() => setShowEvolution(e => !e)} title="Afficher l’évolution en % par rapport au mois précédent">
          <span className="switch-track">
            <span className="switch-thumb" />
          </span>
          Évolution mensuelle
        </button>
      </div>
      <div className="ya-kpis">
        {kpiCards.map(c => (
          <div key={c.label} className="panel-lg ya-kpi">
            <div className="ya-kpi-label">{c.label}</div>
            <div className="ya-kpi-value">{c.value === null ? dash : money(c.value)}</div>
            <div className="ya-kpi-sub">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="ya-charts">
        <div className="panel-lg ya-chart-panel">
          <div className="ya-panel-head">
            <div className="ya-panel-title">Évolution mensuelle par type</div>
            {view.hasData &&
              view.series.map(sr => (
                <span key={sr.id} className="ya-chart-key">
                  <span className="ya-chart-swatch" style={{ background: color(sr.id) }} />
                  {sr.label}
                </span>
              ))}
          </div>
          {view.hasData ? (
            <YearLineChart series={view.series} color={color} currentMonth={cur >= 0 ? cur : null} label={`Évolution mensuelle des montants ${kind} de ${year}, par type`} />
          ) : (
            <div className="ya-empty">Aucune donnée pour {year}</div>
          )}
        </div>
        <div className="panel-lg ya-pie-panel">
          <div className="ya-panel-title">Répartition annuelle</div>
          <div className="ya-pie-sub">Emploi des revenus {kind} sur l’année</div>
          {view.hasData && k.income !== null ? (
            <YearPie slices={view.pie} total={k.income} color={color} active={active} onActive={setActive} label={`Répartition des revenus ${kind} de ${year}`} />
          ) : (
            <div className="ya-empty">Aucune donnée pour {year}</div>
          )}
        </div>
      </div>
      <div className="panel-lg ya-scroll">
        <div className="ya-table">
          <div className="ya-row ya-head">
            <div className="ya-label" />
            {view.months.map((m, i) => (
              <div key={m.month} className={`ya-cell ya-head-cell${m.month === today ? ' is-current' : ''}`} aria-label={monthLabel(m.month)} aria-current={m.month === today ? 'date' : undefined}>
                <span className="ya-caption">{m.caption ?? ''}</span>
                <span>{MONTH_SHORT[i]}</span>
              </div>
            ))}
            <button type="button" className="ya-cell ya-head-cell is-total ya-total-btn" onClick={() => setAverage(a => !a)} title="Basculer entre total et moyenne">
              {average ? 'Moyenne' : 'Total'}
            </button>
            <div className="ya-cell ya-head-cell is-balance" title="Solde du compte associé à la fin du dernier mois affiché (enveloppes : virtuel + espèces)">
              Solde compte
            </div>
          </div>

          {view.blocks.filter(b => b.id !== 'pln').map(b => {
            const isOpen = open.has(b.id);
            return (
              <div key={b.id}>
                <button type="button" className="ya-row ya-block" aria-expanded={isOpen} onClick={() => toggle(b.id)}>
                  <div className="ya-label">
                    <span className={`ya-chev${isOpen ? ' is-open' : ''}`}>
                      <Icon name="chevronRight" size={14} />
                    </span>
                    <span className="dot" style={{ background: color(b.id) }} />
                    {b.label}
                  </div>
                  {cells(b, undefined, undefined, BLOCK_GOOD[b.id])}
                </button>
                {isOpen &&
                  b.sections.map(s => (
                    <div key={s.title}>
                      {s.title && (
                        <div className="ya-row ya-section">
                          <div className="ya-label">{s.title}</div>
                        </div>
                      )}
                      {s.lines.map(l => (
                        <div
                          key={l.name}
                          className="ya-row ya-line"
                          onContextMenu={e => {
                            setDetails(null);
                            const rect = e.currentTarget.getBoundingClientRect();
                            const text = yearLineDetails(data, year, b.id, s.title, l.name);
                            openMenu(e, l.name, text ? [{ label: 'Détails', onSelect: () => setDetails({ title: l.name, text, rect }) }] : [{ label: 'Aucun détail saisi', onSelect: () => {} }]);
                          }}
                        >
                          <div className="ya-label">{l.name}</div>
                          {cells(l, undefined, { block: b.id, section: s.title, name: l.name }, BLOCK_GOOD[b.id])}
                        </div>
                      ))}
                    </div>
                  ))}
              </div>
            );
          })}

          <div className="ya-gap" />
          <div className="ya-row ya-syn is-big">
            <div className="ya-label">Reste à placer</div>
            {cells(view.summary.remaining, undefined, undefined, 'up')}
          </div>
          <div className="ya-row ya-syn is-rate">
            <div className="ya-label">{target === null ? 'Taux d’épargne' : `Taux d’épargne · objectif ${target} %`}</div>
            {rates.map((v, i) => (
              <div key={i} className={`ya-cell${v === null ? ' is-empty' : ''}`}>
                {v === null ? dash : percent(v)}
                {v !== null && (
                  <div className="ya-bar-track">
                    <div className={`ya-bar-fill${target !== null && v >= target ? ' is-reached' : ''}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
                    {target !== null && <div className="ya-bar-target" style={{ left: `${Math.max(0, Math.min(100, target))}%` }} />}
                  </div>
                )}
              </div>
            ))}
            <div className="ya-cell is-total">
              {fmt(view.summary.rate, rowTotal(view.summary.rate, average), percent)}
              {spark && (
                <svg viewBox="0 0 64 20" width="64" height="20" aria-hidden="true">
                  {spark.targetY !== null && <line x1="0" x2="64" y1={spark.targetY} y2={spark.targetY} className="ya-spark-target" />}
                  <polyline points={spark.points} fill="none" className="ya-spark" />
                </svg>
              )}
            </div>
          </div>
          {(
            [
              ['Épargne brute', view.summary.grossSavings],
              ['Épargne réelle', view.summary.realSavings],
              ['Total investi', view.summary.investTotal],
              ['Dépenses totales', view.summary.expenses],
            ] as const
          ).map(([label, r]) => (
            <div key={label} className="ya-row ya-syn">
              <div className="ya-label">{label}</div>
              {cells(r, undefined, undefined, label === 'Dépenses totales' ? 'down' : 'up')}
            </div>
          ))}
          <div className="ya-row ya-syn ya-total-row">
            <div className="ya-label">Total des soldes comptes</div>
            {view.months.map(m => (
              <div key={m.month} className="ya-cell" />
            ))}
            <div className="ya-cell is-total" />
            <div className={`ya-cell is-balance${view.balanceTotal === null ? ' is-empty' : ''}`}>{view.balanceTotal === null ? dash : money(view.balanceTotal)}</div>
          </div>
        </div>
      </div>
      {details && <DetailsBubble title={details.title} text={details.text} rect={details.rect} onClose={() => setDetails(null)} />}
    </>
  );
}
