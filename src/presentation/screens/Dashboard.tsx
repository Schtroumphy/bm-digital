import { useState, type ReactNode } from 'react';
import { addEnvelopeEntry, addLineEntry } from '../../application/quickEntry';
import { dashboardView, type DashboardView, type DonutId, type DashboardWealth, type YearlyMonth } from '../../domain/dashboard';
import { isoDate } from '../../domain/checkoff';
import { MONTH_NAMES, money, monthLabel, parseMonth, percent } from '../../domain/format';
import type { GoalView } from '../../domain/goals';
import { isMonthLocked } from '../../domain/ledger';
import type { MonthKey } from '../../domain/types';
import { Donut, DONUT_COLORS } from '../components/Donut';
import { Icon } from '../components/Icon';
import { MonthNotes } from '../components/MonthNotes';
import { QuickEntryPopup } from '../components/QuickEntryPopup';
import { BAD, GOOD, HUE, MUTED, tone, toneVars } from '../components/tone';
import { newId, useStore } from '../state/store';

/** Where a link of the dashboard leads: a screen, or the « Soldes épargnes » tab of Opérations (spec 0027, RG10, RG16). */
export type DashboardTarget = 'budget' | 'env' | 'prevAnn' | 'goals' | 'balances';

const DASH = '—';
const SALMON = 35;
const signed = (n: number) => (n > 0 ? '+' : '') + money(n);

function DetailLink({ to, onOpen }: { to: DashboardTarget; onOpen: (t: DashboardTarget) => void }) {
  return (
    <button type="button" className="btn-quiet dash-detail" onClick={() => onOpen(to)}>
      Détail
    </button>
  );
}

/** « + » of a row: opens the shared quick entry form next to it and records the entry through `record` (spec 0027, RG6, RG8). */
function PlusButton({ month, name, hue, record }: { month: MonthKey; name: string; hue: number; record: (input: { amount: number; day: number; label: string }) => void }) {
  const [open, setOpen] = useState(false);
  const t = tone(hue);
  return (
    <span className="dash-plus-wrap">
      <button type="button" className="dash-plus" style={{ background: t.soft, color: t.ink }} title="Ajouter une écriture" aria-label={`Ajouter une écriture sur ${name}`} onClick={() => setOpen(o => !o)}>
        <Icon name="plus" size={12} stroke={3} />
      </button>
      {open && (
        <QuickEntryPopup
          month={month}
          name={name}
          onClose={() => setOpen(false)}
          onSave={input => {
            record(input);
            setOpen(false);
          }}
        />
      )}
    </span>
  );
}

function Kpis({ v, month }: { v: DashboardView; month: MonthKey }) {
  const k = v.kpis;
  const cell = (f: (x: NonNullable<typeof k>) => string) => (k ? f(k) : DASH);
  const rateOk = !!k && k.savingsRate >= k.savingsRateTarget;
  return (
    <div className="dash-kpis">
      <div className="dash-kpi is-hero">
        <div className="kpi-label">Reste à placer en {MONTH_NAMES[parseMonth(month).month]}</div>
        <div className="dash-hero" style={{ color: k && k.remaining < 0 ? BAD : undefined }}>{cell(x => money(x.remaining))}</div>
        <div className="dash-sub" style={{ color: k?.availableReal != null && k.availableReal < 0 ? BAD : MUTED }}>{k?.availableReal != null ? `Disponible (réel) ${money(k.availableReal)}` : ''}</div>
      </div>
      <div className="dash-kpi">
        <div className="kpi-label">Revenus</div>
        <div className="dash-val">{cell(x => money(x.income))}</div>
        <div className="dash-sub">{k ? `Réel ${money(k.incomeActual)}` : ''}</div>
      </div>
      <div className="dash-kpi">
        <div className="kpi-label">Dépenses</div>
        <div className="dash-val">{cell(x => money(x.expenses))}</div>
        {k && <div className="dash-sub" style={{ color: k.variableRemaining < 0 ? BAD : GOOD }}>Restant variables {money(k.variableRemaining)}</div>}
      </div>
      <div className="dash-kpi">
        <div className="kpi-label">Taux d’épargne</div>
        <div className="dash-val">{cell(x => percent(x.savingsRate))}</div>
        {k && <div className="dash-sub" style={{ color: rateOk ? GOOD : BAD }}>Objectif {k.savingsRateTarget} %</div>}
      </div>
      <div className="dash-kpi">
        <div className="kpi-label">Épargne brute</div>
        <div className="dash-val">{cell(x => money(x.grossSavings))}</div>
        <div className="dash-sub">{k ? 'Budgétisée' : ''}</div>
      </div>
      <div className="dash-kpi">
        <div className="kpi-label">Épargne réelle</div>
        <div className="dash-val">{cell(x => money(x.realSavings))}</div>
        {k && <div className="dash-sub" style={{ color: k.savingsVsGross < 0 ? BAD : GOOD }}>{signed(k.savingsVsGross)} vs brute</div>}
      </div>
    </div>
  );
}

/** Mention under the KPI band (spec 0028, RG25): operations assigned to a savings account do not count in the figures above. */
function AssignedNote({ v }: { v: DashboardView }) {
  const a = v.assigned;
  if (!a) return null;
  const tip = a.byAccount.map(x => `${x.accountName} : ${x.count} ${x.count > 1 ? 'opérations' : 'opération'} (dépenses ${money(x.expenses)}, entrées ${money(x.entries)})`).join('\n');
  return (
    <div className="dash-assigned has-tip" data-tip={tip}>
      {a.count} {a.count > 1 ? 'opérations' : 'opération'} ({money(a.expenses)} de dépenses, {money(a.entries)} d’entrées) {a.count > 1 ? 'sont affectées' : 'est affectée'} à un compte d’épargne et {a.count > 1 ? 'ne comptent' : 'ne compte'} pas dans ces chiffres
    </div>
  );
}

function DonutCard({ v }: { v: DashboardView }) {
  const d = v.donut;
  const [active, setActive] = useState<DonutId | null>(null);
  const left = d?.slices.slice(0, 4);
  const right = d?.slices.slice(4);
  const col = (slices: NonNullable<typeof left>) =>
    slices.map(s => (
      <div key={s.id} className={`legend-row${active === s.id ? ' is-active' : ''}`} style={{ opacity: active && active !== s.id ? 0.5 : 1 }} onMouseEnter={() => setActive(s.id)} onMouseLeave={() => setActive(null)}>
        <i style={{ background: DONUT_COLORS[s.id] }} />
        <span className="legend-name">{s.label}</span>
        <b style={{ color: s.amount < 0 ? BAD : undefined }}>{money(s.amount)}</b>
        <span className="legend-pct">{s.pct === null ? DASH : percent(s.pct)}</span>
      </div>
    ));
  return (
    <div className="dash-donut">
      {d ? <Donut donut={d} active={active} onActive={setActive} /> : <div className="donut is-empty">{DASH}</div>}
      <div className="legend">
        <div className="legend-title">Où va chaque euro de revenu</div>
        {d ? (
          <div className="legend-cols">
            <div>{col(left!)}</div>
            <div>{col(right!)}</div>
          </div>
        ) : (
          <div className="dash-empty">{DASH}</div>
        )}
      </div>
    </div>
  );
}

function VariablesCard({ v, month, canAdd, onOpen }: { v: DashboardView; month: MonthKey; canAdd: boolean; onOpen: (t: DashboardTarget) => void }) {
  const { update } = useStore();
  const x = v.variables;
  const t = tone(SALMON);
  return (
    <div className="panel block" style={toneVars(SALMON)}>
      <div className="block-head">
        <div className="block-title">Dépenses variables</div>
        <div style={{ flex: 1 }} />
        <DetailLink to="budget" onOpen={onOpen} />
      </div>
      {x ? (
        <div className="dash-body">
          <div className="dash-big">
            <b style={{ color: x.remaining < 0 ? BAD : GOOD }}>{money(x.remaining)}</b>
            <span>restant sur {money(x.budget)}</span>
          </div>
          {x.rows.length === 0 && <div className="dash-empty">Aucune dépense variable</div>}
          {x.rows.map(r => (
            <div key={r.key} className="dash-row has-tip" data-tip={`Budget ${money(r.budget)} · dépensé ${money(r.actual ?? 0)} (${percent(r.consumed)}) · restant ${money(r.remaining)}`}>
              <span className="dash-row-name">{r.name}</span>
              <div className="progress dash-bar" style={{ background: t.soft }}>
                <div style={{ width: `${r.consumed}%`, background: r.remaining <= 0 ? 'oklch(0.62 0.18 25)' : 'oklch(0.72 0.12 35)' }} />
              </div>
              <b className="dash-row-val" style={{ color: r.remaining > 0 ? GOOD : BAD }}>{money(r.remaining)}</b>
              {canAdd ? (
                <PlusButton month={month} name={r.name} hue={SALMON} record={input => update(d => void addLineEntry(d, month, r.key, { id: newId('t'), ...input }))} />
              ) : (
                <span className="dash-plus-wrap" />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="dash-body"><div className="dash-empty">{DASH}</div></div>
      )}
    </div>
  );
}

function EnvelopesCard({ v, month, canAdd, onOpen }: { v: DashboardView; month: MonthKey; canAdd: boolean; onOpen: (t: DashboardTarget) => void }) {
  const { update } = useStore();
  const x = v.envelopes;
  return (
    <div className="panel block" style={toneVars(HUE.epa)}>
      <div className="block-head">
        <div className="block-title">Enveloppes</div>
        <div style={{ flex: 1 }} />
        <DetailLink to="env" onOpen={onOpen} />
      </div>
      {x ? (
        <div className="dash-body">
          <div className="dash-big">
            <b style={{ color: 'var(--violet-ink)' }}>{money(x.total)}</b>
          </div>
          <div className="dash-caption">solde cumulé · {money(x.allocated)} alloués ce mois</div>
          {x.rows.length === 0 && <div className="dash-empty">Aucune enveloppe</div>}
          {x.rows.map(r => {
            const t = tone(r.hue);
            return (
              <div key={r.id} className="dash-row has-tip" data-tip={`Solde de départ ${money(r.start)} · dépensé ${money(r.spent)} (${percent(r.consumed)}) · reste ${money(r.remaining)}`}>
                <span className="dash-row-name">
                  <i className="dot" style={{ background: t.base }} />
                  {r.name}
                </span>
                <div className="progress dash-bar" style={{ background: t.soft }}>
                  <div style={{ width: `${r.consumed}%`, background: r.remaining < 0 ? 'oklch(0.62 0.18 25)' : t.base }} />
                </div>
                <b className="dash-row-val" style={{ color: r.balance < 0 ? BAD : undefined }}>{money(r.balance)}</b>
                {canAdd ? (
                  <PlusButton month={month} name={r.name} hue={r.hue} record={input => update(d => void addEnvelopeEntry(d, month, r.id, { id: newId('t'), ...input }))} />
                ) : (
                  <span className="dash-plus-wrap" />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="dash-body"><div className="dash-empty">{DASH}</div></div>
      )}
    </div>
  );
}

/** Month labels of the bars (spec 0027, RG9): three letters or more, no dot, all different. */
const MONTH_TICKS = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
const monthTick = (m: YearlyMonth) => MONTH_TICKS[m.month];

function YearlyCard({ v, onOpen }: { v: DashboardView; onOpen: (t: DashboardTarget) => void }) {
  const y = v.yearly;
  const biggest = Math.max(0, ...(y?.months.map(m => m.amount) ?? []));
  return (
    <div className="panel dash-card dash-yearly">
      <div className="dash-card-head">
        <div className="dash-card-title">Dépenses prévues sur l’année</div>
        <div style={{ flex: 1 }} />
        {y && <span className="dash-caption">Total {money(y.total)} · moyenne {money(y.average)} / mois</span>}
        <DetailLink to="prevAnn" onOpen={onOpen} />
      </div>
      {y ? (
        <div className="bars">
          {y.months.map(m => (
            <div key={m.month} className={`bar has-tip${m.selected ? ' is-selected' : ''}`} data-tip={`${MONTH_NAMES[m.month]} · ${money(m.amount)}${y.total > 0 ? ` (${percent((m.amount / y.total) * 100)} de l’année)` : ''}`}>
              <span className="bar-amount">{money(m.amount)}</span>
              <div className="bar-col">
                <div className="bar-fill" style={{ height: `${biggest > 0 ? Math.max(4, (m.amount / biggest) * 100) : 4}%` }} />
              </div>
              <span className="bar-month">{monthTick(m)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="dash-empty">{DASH}</div>
      )}
    </div>
  );
}

function TaskRow({ kind, onClick, title, sub }: { kind: 'alert' | 'transfer' | 'balance'; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" className={`dash-task is-${kind}`} onClick={onClick}>
      <i className="dash-task-dot" />
      <span className="dash-task-text">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
      <Icon name="chevronRight" size={15} />
    </button>
  );
}

function TodoCard({ v, onOpen }: { v: DashboardView; onOpen: (t: DashboardTarget) => void }) {
  const t = v.todo;
  const n = (c: number, one: string, many: string) => `${c} ${c > 1 ? many : one}`;
  const nothing = !!t && t.alerts.length === 0 && t.transfers.length === 0 && t.balancesToEnter.length === 0;
  return (
    <div className="panel dash-card">
      <div className="dash-card-head">
        <div className="dash-card-title">À faire ce mois-ci</div>
      </div>
      <div className="dash-tasks">
        {!t && <div className="dash-empty">{DASH}</div>}
        {t?.alerts.map(a => (
          <TaskRow key={a.envelopeId} kind="alert" onClick={() => onOpen('env')} title={`${a.label} ${money(a.planned)} prévu, il manque ~${money(a.missing)}`} sub={`Enveloppe ${a.envelopeName} · prévu au budget annuel`} />
        ))}
        {t && t.transfers.length > 0 && (
          <TaskRow kind="transfer" onClick={() => onOpen('budget')} title={n(t.transfers.length, 'virement à effectuer', 'virements à effectuer')} sub={`${money(t.transfersTotal)} · ${t.transfersDone} / ${t.transfersAll} faits`} />
        )}
        {t && t.balancesToEnter.length > 0 && (
          <TaskRow kind="balance" onClick={() => onOpen('balances')} title={n(t.balancesToEnter.length, 'solde de compte à saisir', 'soldes de compte à saisir')} sub={t.balancesToEnter.join(', ')} />
        )}
        {nothing && <div className="dash-empty">Rien à faire ce mois-ci</div>}
      </div>
    </div>
  );
}

function WealthCard({ w, emergency }: { w: DashboardWealth | null; emergency: GoalView | null }) {
  return (
    <div className="panel dash-card">
      <div className="dash-card-head">
        <div className="dash-card-title">Patrimoine</div>
        <div style={{ flex: 1 }} />
        <b className="dash-wealth-total">{w ? money(w.total) : DASH}</b>
      </div>
      <div className="dash-wealth">
        <div className="wealth-bar">
          {w && w.total > 0 && (
            <>
              <div style={{ width: `${w.savingsShare * 100}%`, background: 'oklch(0.7 0.12 300)' }} />
              <div style={{ width: `${(1 - w.savingsShare) * 100}%`, background: 'oklch(0.7 0.13 250)' }} />
            </>
          )}
        </div>
        <div className="wealth-row">
          <i style={{ background: 'oklch(0.7 0.12 300)' }} />
          <span>Épargnes</span>
          <b>{w ? money(w.savings) : DASH}</b>
        </div>
        <div className="wealth-row">
          <i style={{ background: 'oklch(0.7 0.13 250)' }} />
          <span>Investissements</span>
          <b>{w ? money(w.invest) : DASH}</b>
        </div>
        {emergency && (
          <div className="dash-emergency">
            <div className="wealth-row">
              <span>Fond de secours</span>
              <b>{emergency.defined ? percent(emergency.pct) : 'À définir'}</b>
            </div>
            {emergency.defined && (
              <>
                <div className="progress is-obj" style={{ background: 'oklch(0.97 0.02 190)' }}>
                  <div style={{ width: `${emergency.pct}%`, background: 'oklch(0.72 0.12 190)' }} />
                </div>
                <div className="dash-caption">
                  {money(emergency.current)} sur {money(emergency.target)} · il reste {money(emergency.left)}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GoalsCard({ v, onOpen }: { v: DashboardView; onOpen: (t: DashboardTarget) => void }) {
  const rows: { view: GoalView | null; name: (g: GoalView) => string; color: string }[] = [
    { view: v.emergency, name: () => 'Fond de secours', color: 'oklch(0.72 0.12 190)' },
    { view: v.invest, name: g => g.name, color: 'oklch(0.72 0.12 190)' },
    { view: v.savings, name: g => `Taux d’épargne > ${g.target} %`, color: 'oklch(0.82 0.13 90)' },
  ];
  return (
    <div className="panel dash-card dash-goals" role="link" tabIndex={0} onClick={() => onOpen('goals')} onKeyDown={e => e.key === 'Enter' && onOpen('goals')}>
      <div className="dash-card-head">
        <div className="dash-card-title">Objectifs annuels</div>
      </div>
      <div className="dash-goal-list">
        {rows.map(({ view, name, color }, i) =>
          view ? (
            <div key={i} className="dash-goal">
              <div className="wealth-row">
                <span>{name(view)}</span>
                <b>{view.defined ? percent(view.pct) : 'À définir'}</b>
              </div>
              {view.defined && (
                <div className="progress dash-goal-bar">
                  <div style={{ width: `${view.pct}%`, background: color }} />
                </div>
              )}
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Accueil (spec 0027): what to know and to do for a month. Its only writes are the quick entries of the « + » and the notes. */
export function DashboardScreen({ month, onOpen }: { month: MonthKey; onOpen: (t: DashboardTarget) => void }) {
  const { data, ledger } = useStore();
  const v = dashboardView(data, ledger, month, isoDate());
  const canAdd = v.initialized && !isMonthLocked(data, month);
  const gate = (node: ReactNode) => (v.initialized ? node : <div className="is-preview">{node}</div>);
  return (
    <>
      {!v.initialized && (
        <div className="banner">
          <div className="banner-icon">
            <Icon name="calendar" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">{monthLabel(month)} n’est pas encore initialisé</div>
          </div>
          <button type="button" className="btn-dark" onClick={() => onOpen('budget')}>
            Voir le Budget
          </button>
        </div>
      )}
      <div className="dash-grid">
        <div className="dash-left">
          <div className="panel dash-top">
            {gate(<Kpis v={v} month={month} />)}
            <AssignedNote v={v} />
            {gate(<DonutCard v={v} />)}
          </div>
          <div className="dash-pair">
            <VariablesCard v={v} month={month} canAdd={canAdd} onOpen={onOpen} />
            <EnvelopesCard v={v} month={month} canAdd={canAdd} onOpen={onOpen} />
          </div>
          <YearlyCard v={v} onOpen={onOpen} />
        </div>
        <div className="dash-right">
          <TodoCard v={v} onOpen={onOpen} />
          <MonthNotes month={month} notes={v.notes} />
          <WealthCard w={v.wealth} emergency={v.emergency} />
          <GoalsCard v={v} onOpen={onOpen} />
        </div>
      </div>
    </>
  );
}
