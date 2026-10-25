import { useEffect, useRef, useState } from 'react';
import { parseGoalTarget, setGoalDue, setGoalTarget, toggleGoalAccount } from '../../application/goals';
import { MONTH_SHORT, money, percent, rawNumber } from '../../domain/format';
import { goalView, type GoalId, type GoalView } from '../../domain/goals';
import { Icon, type IconName } from '../components/Icon';
import { BAD, GOOD, HUE, tone, toneVars } from '../components/tone';
import { useStore } from '../state/store';

const GOALS: { id: GoalId; hue: number; icon: IconName }[] = [
  { id: 'emergency', hue: HUE.obj, icon: 'shield' },
  { id: 'invest', hue: HUE.rev, icon: 'trend' },
  { id: 'savings', hue: 85, icon: 'percent' },
];

const STATUS_HUE = { 'À rattraper': 85, 'En progression': 190, 'En bonne voie': 150, Atteint: 150 } as const;

const signed = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.', ',');
const dueLabel = (iso: string) => `${+iso.slice(8, 10)} ${MONTH_SHORT[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

export function GoalsScreen() {
  const { data, ledger } = useStore();
  return (
    <div className="goals-grid">
      {GOALS.map(g => {
        const view = goalView(data, ledger, g.id);
        return view ? <GoalCard key={g.id} view={view} hue={g.hue} icon={g.icon} /> : null;
      })}
    </div>
  );
}

function GoalCard({ view, hue, icon }: { view: GoalView; hue: number; icon: IconName }) {
  const { update } = useStore();
  const isRate = view.kind === 'rate';
  const t = tone(hue);
  const ink = view.status === 'À définir' ? t.ink : tone(STATUS_HUE[view.status]).ink;
  const fmt = (v: number) => (isRate ? percent(v) : money(v));
  const planLabel = isRate ? 'Objectif' : 'Plan linéaire';
  return (
    <div className="panel goal-card" style={toneVars(hue)}>
      <div className="goal-card-head" style={{ color: ink }}>
        <div className="goal-card-icon">
          <Icon name={icon} size={17} stroke={2.5} />
        </div>
        <div className="goal-card-title">
          <div className="goal-card-name">{view.name}</div>
          {isRate ? <div className="goal-card-due">Objectif {view.year} · moyenne mensuelle</div> : <DueField view={view} onSet={date => update(d => void setGoalDue(d, view.id as 'emergency' | 'invest', date))} />}
        </div>
        <span className="goal-card-status">{view.status}</span>
      </div>

      <div className="goal-card-body">
        <div>
          <div className="goal-card-value">{view.defined ? fmt(view.current) : '—'}</div>
          <div className="goal-card-target">
            <span>sur</span>
            <TargetField
              view={view}
              onCommit={text => {
                // Checked before `update`: the update function runs later, so it cannot report an error back.
                const parsed = parseGoalTarget(text, view.id);
                if ('error' in parsed) return parsed.error;
                update(d => void setGoalTarget(d, view.id, text));
                return null;
              }}
            />
          </div>
          {view.defined && (
            <>
              <div className="goal-card-bar">
                <div style={{ width: `${view.pct}%` }} />
              </div>
              <div className="goal-card-pct">
                <span>{percent(view.pct)}</span>
                <span className="goal-card-left">{isRate ? (view.left > 0 ? `Encore ${view.left.toFixed(1).replace('.', ',')} pts` : 'Atteint') : `Reste ${money(view.left)}`}</span>
              </div>
            </>
          )}
        </div>
        {view.defined && (
          <div>
            <GoalChart view={view} />
            <div className="goal-card-axis">
              {['Jan.', 'Mars', 'Mai', 'Juil.', 'Sept.', 'Déc.'].map(l => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div className="goal-card-legend">
              <span>
                <i className="is-real" />
                Réel
              </span>
              <span>
                <i className="is-plan" />
                {planLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {view.accounts.length > 0 && (
        <div className="goal-card-accounts">
          <div className="goal-card-accounts-title">
            Comptes pris en compte · {view.checkedCount} / {view.accounts.length}
          </div>
          <div className="goal-card-chips">
            {view.accounts.map(a => (
              <button
                key={a.key}
                type="button"
                className={`goal-chip${a.checked ? ' is-on' : ''}`}
                aria-pressed={a.checked}
                onClick={() => update(d => toggleGoalAccount(d, view.id as 'emergency' | 'invest', a.key))}
              >
                {a.checked && <Icon name="check" size={11} stroke={3.4} />}
                <span>{a.name}</span>
                <b>{money(a.balance)}</b>
              </button>
            ))}
          </div>
        </div>
      )}

      {view.defined && (
        <div className="goal-card-stats">
          {isRate ? (
            <>
              <Stat label="Moyenne sur 12 mois" value={view.average === null ? '—' : percent(view.average)} />
              <Stat label={`Mois au-dessus de ${view.target} %`} value={`${view.monthsAbove} / ${view.monthsKnown}`} />
              <Stat label="Écart à l’objectif" value={view.rateGap === null ? '—' : `${signed(view.rateGap)} pts`} color={view.rateGap === null ? undefined : view.rateGap >= 0 ? GOOD : BAD} />
            </>
          ) : (
            <>
              <Stat label="Prévu à ce jour" value={view.planned === null ? '—' : money(view.planned)} />
              <Stat label="Écart au plan" value={view.gap === null ? '—' : money(view.gap, true)} color={view.gap === null ? undefined : view.gap >= 0 ? GOOD : BAD} />
              <Stat label="À mettre de côté / mois" value={view.perMonth === null ? '—' : money(view.perMonth)} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="goal-stat">
      <div className="goal-stat-label">{label}</div>
      <div className="goal-stat-value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

/** Target « sur X »: click opens a prefilled field; Entrée or leaving validates, Échap cancels, an invalid value shows an error and stays open (RG6). */
function TargetField({ view, onCommit }: { view: GoalView; onCommit: (text: string) => string | null }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);
  const close = () => {
    setEditing(false);
    setError(null);
  };
  const submit = () => {
    if (cancelled.current) return;
    const err = onCommit(ref.current?.value ?? '');
    if (err) {
      setError(err);
      ref.current?.focus();
      return;
    }
    close();
  };
  if (!editing) {
    return (
      <span
        className="goal-card-target-value"
        title="Modifier la cible"
        onClick={() => {
          cancelled.current = false;
          setEditing(true);
        }}
      >
        {view.target > 0 ? (view.kind === 'rate' ? `${rawNumber(view.target)} %` : money(view.target)) : 'À définir'}
      </span>
    );
  }
  return (
    <span className="goal-card-target-edit">
      <input
        ref={ref}
        className="goal-field is-target"
        inputMode="decimal"
        aria-label="Cible"
        defaultValue={view.target > 0 ? rawNumber(view.target) : ''}
        onChange={() => setError(null)}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            close();
          }
        }}
        onBlur={submit}
      />
      {error && <span className="goal-card-error">{error}</span>}
    </span>
  );
}

/** Due date under the name: click opens a date field; Entrée or leaving validates, Échap cancels, an empty date clears the due date (RG7). */
function DueField({ view, onSet }: { view: GoalView; onSet: (date: string) => void }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);
  const submit = () => {
    // A half-typed date reads as empty: leave the field alone rather than clearing the due date.
    if (ref.current?.validity.badInput) return;
    if (!cancelled.current) onSet(ref.current?.value ?? '');
    setEditing(false);
  };
  if (!editing) {
    return (
      <div
        className="goal-card-due is-editable"
        title="Modifier l’échéance"
        onClick={() => {
          cancelled.current = false;
          setEditing(true);
        }}
      >
        {view.due ? `Échéance ${dueLabel(view.due)}` : 'Échéance à définir'}
      </div>
    );
  }
  return (
    <input
      ref={ref}
      type="date"
      className="goal-field is-due"
      aria-label="Échéance"
      defaultValue={view.due ?? ''}
      onKeyDown={e => {
        if (e.key === 'Enter') submit();
        else if (e.key === 'Escape') {
          cancelled.current = true;
          setEditing(false);
        }
      }}
      onBlur={submit}
    />
  );
}

const W = 400;
const H = 118;

/** Hand-written SVG: dotted target line, dashed plan, real curve with area. Gaps in the data interrupt the curve (RG8). */
function GoalChart({ view }: { view: GoalView }) {
  const t = tone(view.kind === 'rate' ? 85 : view.id === 'emergency' ? HUE.obj : HUE.rev);
  const values = [...view.series, ...view.plan, view.target].filter((v): v is number => v !== null);
  const rawLo = Math.min(...values);
  const rawHi = Math.max(...values);
  const span = rawHi - rawLo || 1;
  const lo = rawLo - span * 0.1;
  const hi = rawHi + span * 0.1;
  const x = (i: number) => (i * W) / 11;
  const y = (v: number) => 108 - ((v - lo) / (hi - lo)) * 100;
  // Contiguous runs of months with a value.
  const runs = (s: (number | null)[]) => {
    const out: { i: number; v: number }[][] = [];
    s.forEach((v, i) => {
      if (v === null) return;
      if (i > 0 && s[i - 1] !== null) out[out.length - 1].push({ i, v });
      else out.push([{ i, v }]);
    });
    return out;
  };
  const path = (run: { i: number; v: number }[]) => run.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
  const real = runs(view.series);
  return (
    <svg className="goal-chart" viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={`Évolution de ${view.name} sur l’année`}>
      <line x1="0" y1={y(view.target).toFixed(1)} x2={W} y2={y(view.target).toFixed(1)} stroke={t.base} strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      {runs(view.plan).map(r => (
        <path key={`p${r[0].i}`} d={path(r)} fill="none" stroke="rgba(32,30,29,.35)" strokeWidth="1.5" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      ))}
      {real.map(r => (
        <path key={`a${r[0].i}`} d={`${path(r)} L${x(r[r.length - 1].i).toFixed(1)} ${H} L${x(r[0].i).toFixed(1)} ${H} Z`} fill={t.soft} opacity=".7" />
      ))}
      {real
        .filter(r => r.length === 1)
        .map(r => (
          <circle key={`c${r[0].i}`} cx={x(r[0].i)} cy={y(r[0].v)} r="3.5" fill={t.base} />
        ))}
      {real.map(r => (
        <path key={`l${r[0].i}`} d={path(r)} fill="none" stroke={t.base} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
