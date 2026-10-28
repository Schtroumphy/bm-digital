import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createGoal, deleteGoal, GOAL_NAME_MAX, parseGoalName, parseGoalTarget, renameGoal, setGoalDue, setGoalTarget, toggleGoalAccount, validateGoalDraft, type GoalDraft, type GoalErrors } from '../../application/goals';
import { currentMonthKey, MONTH_SHORT, money, percent, rawNumber } from '../../domain/format';
import { currentYear, expenseLines, goalsOfYear, goalView, goalYears, isGoalYearEditable, type GoalView } from '../../domain/goals';
import { accounts } from '../../domain/ledger';
import type { GoalKind, GoalScope } from '../../domain/types';
import { formatGoalValue } from '../../domain/goalText';
import { goalHue, goalIcon, STATUS_HUE } from '../components/goalStyle';
import { Icon, type IconName } from '../components/Icon';
import { BAD, GOOD, HUE, tone, toneVars } from '../components/tone';
import { newId, useStore } from '../state/store';

const signed = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(1).replace('.', ',');
const dueLabel = (iso: string) => `${+iso.slice(8, 10)} ${MONTH_SHORT[+iso.slice(5, 7) - 1]} ${iso.slice(0, 4)}`;

const KIND_LABEL: Record<GoalKind, string> = { amount: 'Montant sur comptes', rate: 'Taux d’épargne', cap: 'Plafond de dépenses', saved: 'Épargné dans l’année' };
const KINDS: GoalKind[] = ['amount', 'rate', 'cap', 'saved'];

export function GoalsScreen() {
  const { data, ledger } = useStore();
  const today = currentMonthKey();
  const years = goalYears(data, today);
  const [year, setYear] = useState(currentYear(today));
  const [creating, setCreating] = useState(false);
  const editable = isGoalYearEditable(year, today);
  const goals = goalsOfYear(data, year);
  const hasPrevious = goalsOfYear(data, year - 1).length > 0;
  return (
    <>
      <div className="goals-bar">
        <div className="picker">
          <button className="picker-arrow" disabled={year <= years[0]} onClick={() => setYear(y => y - 1)} aria-label="Année précédente">
            <Icon name="chevronLeft" />
          </button>
          <div className="picker-label is-year">{year}</div>
          <button className="picker-arrow" disabled={year >= years[years.length - 1]} onClick={() => setYear(y => y + 1)} aria-label="Année suivante">
            <Icon name="chevronRight" />
          </button>
        </div>
        <div style={{ flex: 1 }} />
        {editable && (
          <button type="button" className="btn-dark" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} />
            Nouvel objectif
          </button>
        )}
      </div>

      {goals.length === 0 ? (
        <div className="panel goals-empty">
          <div className="goals-empty-title">Aucun objectif pour {year}</div>
          {/* « Reprendre ceux de <année−1> » arrivera avec la spec 0033 ; `hasPrevious` sert alors à l'afficher. */}
          {hasPrevious && <div className="goals-empty-sub">Les objectifs de {year - 1} restent consultables avec la flèche ‹.</div>}
          {editable && (
            <button type="button" className="btn-outline" onClick={() => setCreating(true)}>
              Créer un objectif
            </button>
          )}
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map(g => (
            <GoalCard key={g.id} view={goalView(data, ledger, g, today)} hue={goalHue(data, g)} icon={goalIcon(data, g)} editable={editable} />
          ))}
        </div>
      )}
      {creating && editable && <NewGoalDrawer year={year} onClose={() => setCreating(false)} />}
    </>
  );
}

function GoalCard({ view, hue, icon, editable }: { view: GoalView; hue: number; icon: IconName; editable: boolean }) {
  const { update } = useStore();
  const isRate = view.kind === 'rate';
  const isCap = view.kind === 'cap';
  const t = tone(hue);
  const over = isCap && view.status === 'Dépassé';
  const ink = view.status === 'À définir' ? t.ink : tone(STATUS_HUE[view.status]).ink;
  const fmt = (v: number) => formatGoalValue(view, v);
  const planLabel = isRate ? 'Objectif' : isCap ? 'Rythme du plafond' : 'Plan linéaire';
  const hasAccounts = view.kind === 'amount' || view.kind === 'saved';
  const sub = isRate ? (
    <div className="goal-card-due">Objectif {view.year} · moyenne mensuelle</div>
  ) : isCap ? (
    <div className="goal-card-due">
      Plafond {view.year} · {view.scopeLabel}
      {view.scopeMissing && <b className="goal-card-warn"> · Périmètre introuvable</b>}
    </div>
  ) : view.kind === 'saved' ? (
    <div className="goal-card-due">Objectif {view.year} · échéance {dueLabel(view.due as string)}</div>
  ) : (
    <DueField view={view} editable={editable} onSet={date => update(d => void setGoalDue(d, view.id, date))} />
  );
  return (
    <div className="panel goal-card" style={toneVars(hue)}>
      <div className="goal-card-head" style={{ color: ink }}>
        <div className="goal-card-icon">
          <Icon name={icon} size={17} stroke={2.5} />
        </div>
        <div className="goal-card-title">
          <InPlaceText
            display={view.name}
            initial={view.name}
            ariaLabel="Nom de l’objectif"
            title="Renommer l’objectif"
            className="goal-card-name"
            inputClass="is-name"
            editable={editable}
            onCommit={text => {
              // Checked before `update`: the update function runs later, so it cannot report an error back.
              const parsed = parseGoalName(text);
              if ('error' in parsed) return parsed.error;
              update(d => void renameGoal(d, view.id, text));
              return null;
            }}
          />
          {sub}
        </div>
        <span className="goal-card-status">{view.status}</span>
        {editable && (
          <button
            type="button"
            className="goal-card-delete"
            aria-label="Supprimer l’objectif"
            title="Supprimer l’objectif"
            onClick={() => {
              if (window.confirm(`Supprimer l’objectif « ${view.name} » ? Cette action est définitive`)) update(d => void deleteGoal(d, view.id));
            }}
          >
            <Icon name="trash" size={15} />
          </button>
        )}
      </div>

      <div className="goal-card-body">
        <div>
          <div className="goal-card-value">{view.defined ? fmt(view.current) : '—'}</div>
          <div className="goal-card-target">
            <span>{isCap ? 'plafond' : 'sur'}</span>
            <InPlaceText
              display={fmt(view.target)}
              initial={rawNumber(view.target)}
              ariaLabel="Cible"
              title="Modifier la cible"
              className="goal-card-target-value"
              inputClass="is-target"
              inputMode="decimal"
              editable={editable}
              onCommit={text => {
                const parsed = parseGoalTarget(text, view.kind);
                if ('error' in parsed) return parsed.error;
                update(d => void setGoalTarget(d, view.id, text));
                return null;
              }}
            />
          </div>
          {view.defined && (
            <>
              <div className="goal-card-bar">
                <div style={{ width: `${view.pct}%`, background: over ? BAD : undefined }} />
              </div>
              <div className="goal-card-pct">
                <span>{percent(view.pct)}</span>
                <span className="goal-card-left" style={{ color: over ? BAD : undefined }}>
                  {isRate ? (view.left > 0 ? `Encore ${view.left.toFixed(1).replace('.', ',')} pts` : 'Atteint') : isCap ? (over ? `Dépassé de ${money(view.over)}` : `Reste ${money(view.left)}`) : `Reste ${money(view.left)}`}
                </span>
              </div>
            </>
          )}
        </div>
        {view.defined && (
          <div>
            <GoalChart view={view} hue={hue} />
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

      {hasAccounts && view.accounts.length > 0 && (
        <div className="goal-card-accounts">
          <div className="goal-card-accounts-title">
            {view.kind === 'saved' ? 'Lignes prises en compte' : 'Comptes pris en compte'} · {view.checkedCount} / {view.accounts.length}
          </div>
          <div className="goal-card-chips">
            {view.accounts.map(a => (
              <button
                key={a.key}
                type="button"
                className={`goal-chip${a.checked ? ' is-on' : ''}`}
                aria-pressed={a.checked}
                disabled={!editable}
                onClick={() => update(d => void toggleGoalAccount(d, view.id, a.key))}
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
          ) : isCap ? (
            <>
              <Stat label="Cumul depuis janvier" value={money(view.current)} />
              <Stat label="Part du plafond écoulée" value={money(view.elapsedShare ?? 0)} />
              <Stat label={over ? 'Dépassé de' : 'Reste'} value={money(over ? view.over : view.left)} color={over ? BAD : GOOD} />
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

/**
 * Text edited in place (name, target): click opens a prefilled field; Entrée or leaving validates, Échap cancels, an invalid value shows an error
 * and stays open. Not clickable when `editable` is false (past year, spec 0032 RG9). `onCommit` returns the error message, or null once applied.
 */
function InPlaceText(p: { display: ReactNode; initial: string; ariaLabel: string; title: string; className: string; inputClass: string; inputMode?: 'decimal'; editable: boolean; onCommit: (text: string) => string | null }) {
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
    const err = p.onCommit(ref.current?.value ?? '');
    if (err) {
      setError(err);
      ref.current?.focus();
      return;
    }
    close();
  };
  if (!editing) {
    return (
      <div
        className={p.className}
        title={p.editable ? p.title : undefined}
        style={p.editable ? { cursor: 'text' } : undefined}
        onClick={
          p.editable
            ? () => {
                cancelled.current = false;
                setEditing(true);
              }
            : undefined
        }
      >
        {p.display}
      </div>
    );
  }
  return (
    <span className="goal-card-target-edit">
      <input
        ref={ref}
        className={`goal-field ${p.inputClass}`}
        inputMode={p.inputMode}
        aria-label={p.ariaLabel}
        defaultValue={p.initial}
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

/** Due date under the name: click opens a date field; Entrée or leaving validates, Échap cancels, an empty date clears the due date (spec 0025, RG7). */
function DueField({ view, editable, onSet }: { view: GoalView; editable: boolean; onSet: (date: string) => void }) {
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
        className={`goal-card-due${editable ? ' is-editable' : ''}`}
        title={editable ? 'Modifier l’échéance' : undefined}
        onClick={
          editable
            ? () => {
                cancelled.current = false;
                setEditing(true);
              }
            : undefined
        }
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

/** Creation panel (RG10): 1. type, 2. name, 3. target, 4. parameters of the kind, 5. due date (amount). Errors appear under their field and the panel stays open. */
function NewGoalDrawer({ year, onClose }: { year: number; onClose: () => void }) {
  const { data, update } = useStore();
  const all = accounts(data);
  const lines = expenseLines(data);
  const [kind, setKind] = useState<GoalKind>('amount');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [due, setDue] = useState('');
  const [scopeKind, setScopeKind] = useState<GoalScope['kind']>('line');
  const [block, setBlock] = useState<'cre' | 'fix' | 'var'>('var');
  const [section, setSection] = useState('');
  const [lineKey, setLineKey] = useState('');
  const [errors, setErrors] = useState<GoalErrors>({});

  const sections = [...new Set(lines.filter(l => l.block === block && l.section).map(l => l.section))];
  const scope: GoalScope | null = scopeKind === 'block' ? { kind: 'block', block } : scopeKind === 'section' ? (section ? { kind: 'section', block, section } : null) : lineKey ? { kind: 'line', key: lineKey } : null;
  const pickKind = (k: GoalKind) => {
    setKind(k);
    // « Épargné dans l'année » counts every savings / investment line by default (RG6).
    setTicked(k === 'saved' ? all.map(a => a.key) : []);
    setErrors({});
  };
  const toggle = (key: string) => setTicked(t => (t.includes(key) ? t.filter(k => k !== key) : [...t, key]));
  const draft: GoalDraft = { kind, name, target, accounts: ticked, scope, due };
  const submit = () => {
    const found = validateGoalDraft(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    update(d => void createGoal(d, year, draft, newId('goal')));
    onClose();
  };
  const err = (f: keyof GoalErrors) => errors[f] && <div className="goal-card-error">{errors[f]}</div>;
  const hue = kind === 'rate' ? HUE.cash : kind === 'cap' ? HUE.dep : kind === 'saved' ? HUE.epa : HUE.obj;
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" style={toneVars(hue)} role="dialog" aria-label="Nouvel objectif">
        <div className="drawer-head">
          <div className="drawer-title-row">
            <div className="drawer-name">Nouvel objectif {year}</div>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn-quiet" onClick={onClose} aria-label="Fermer">
              <Icon name="close" size={14} />
            </button>
          </div>
        </div>
        <div className="drawer-body goal-form">
          <div>
            <span className="field-label">1. Type</span>
            <div className="chips is-wrap">
              {KINDS.map(k => (
                <button key={k} type="button" className={`chip${k === kind ? ' is-on' : ''}`} onClick={() => pickKind(k)}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
          </div>
          <label className="field-w">
            <span className="field-label">2. Nom</span>
            <input className="text-input" value={name} maxLength={GOAL_NAME_MAX + 20} onChange={e => setName(e.target.value)} aria-label="Nom" />
            {err('name')}
          </label>
          <label className="field-w">
            <span className="field-label">3. Cible {kind === 'rate' ? '(en %)' : kind === 'cap' ? '(plafond en €)' : '(en €)'}</span>
            <input className="text-input is-amount" inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} aria-label="Cible" />
            {err('target')}
          </label>
          {(kind === 'amount' || kind === 'saved') && (
            <div>
              <span className="field-label">4. {kind === 'amount' ? 'Comptes pris en compte' : 'Lignes prises en compte'}</span>
              <div className="goal-card-chips">
                {all.map(a => (
                  <button key={a.key} type="button" className={`goal-chip${ticked.includes(a.key) ? ' is-on' : ''}`} aria-pressed={ticked.includes(a.key)} onClick={() => toggle(a.key)}>
                    {ticked.includes(a.key) && <Icon name="check" size={11} stroke={3.4} />}
                    <span>{a.name}</span>
                  </button>
                ))}
              </div>
              {err('params')}
            </div>
          )}
          {kind === 'cap' && (
            <div>
              <span className="field-label">4. Périmètre surveillé</span>
              <div className="chips">
                {(['block', 'section', 'line'] as const).map(k => (
                  <button key={k} type="button" className={`chip${k === scopeKind ? ' is-on' : ''}`} onClick={() => setScopeKind(k)}>
                    {k === 'block' ? 'Un bloc' : k === 'section' ? 'Une section' : 'Une ligne'}
                  </button>
                ))}
              </div>
              {scopeKind !== 'line' && (
                <select className="text-input goal-select" aria-label="Bloc" value={block} onChange={e => { setBlock(e.target.value as 'cre' | 'fix' | 'var'); setSection(''); }}>
                  <option value="cre">Crédits</option>
                  <option value="fix">Dépenses fixes</option>
                  <option value="var">Dépenses variables</option>
                </select>
              )}
              {scopeKind === 'section' && (
                <select className="text-input goal-select" aria-label="Section" value={section} onChange={e => setSection(e.target.value)}>
                  <option value="">Choisir une section…</option>
                  {sections.map(sec => (
                    <option key={sec} value={sec}>
                      {sec}
                    </option>
                  ))}
                </select>
              )}
              {scopeKind === 'line' && (
                <select className="text-input goal-select" aria-label="Ligne" value={lineKey} onChange={e => setLineKey(e.target.value)}>
                  <option value="">Choisir une ligne…</option>
                  {lines.map(l => (
                    <option key={l.key} value={l.key}>
                      {l.name}
                    </option>
                  ))}
                </select>
              )}
              {err('params')}
            </div>
          )}
          {kind === 'amount' && (
            <label className="field-w">
              <span className="field-label">
                5. Échéance <span className="field-optional">facultative</span>
              </span>
              <input className="text-input" type="date" value={due} onChange={e => setDue(e.target.value)} aria-label="Échéance" />
              {err('due')}
            </label>
          )}
          <div className="goal-form-actions">
            <button type="button" className="btn-outline" onClick={onClose}>
              Annuler
            </button>
            <button type="button" className="btn-dark" onClick={submit}>
              Créer
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

const W = 400;
const H = 118;

/** Hand-written SVG: dotted target line, dashed plan, real curve with area. Gaps in the data interrupt the curve (RG8). */
function GoalChart({ view, hue }: { view: GoalView; hue: number }) {
  const t = tone(hue);
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
