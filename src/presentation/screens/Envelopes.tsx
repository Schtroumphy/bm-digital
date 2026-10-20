import { useState } from 'react';
import { EditableAmount, EditableText } from '../components/Editable';
import { Icon } from '../components/Icon';
import { toneVars } from '../components/tone';
import { envelopeAlerts } from '../../domain/budget';
import { addMonths, compareMonths, dayLabel, money, monthLabel, MONTH_SHORT, parseMonth, round2 } from '../../domain/format';
import { isMonthLocked, monthAlloc } from '../../domain/ledger';
import type { Envelope, MonthKey } from '../../domain/types';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';

const CASH = 'oklch(0.82 0.12 85)';

/** Header total: what is allocated to all envelopes this month. */
export function EnvelopesTotal({ month }: { month: MonthKey }) {
  const { data } = useStore();
  const alloc = monthAlloc(data, month);
  const total = round2(data.envelopes.reduce((a, e) => a + (alloc[e.id] ?? 0), 0));
  return (
    <div className="header-total">
      <span className="kpi-label">Total alloué</span>
      <b>{money(total)}</b>
    </div>
  );
}

/** Header total of the Envelopes tab: the sum of every envelope's balance this month. */
export function EnvelopesBalanceTotal({ month }: { month: MonthKey }) {
  const { data, ledger } = useStore();
  const total = round2(data.envelopes.reduce((a, e) => a + (ledger.envMonth(e.id, month)?.balance ?? 0), 0));
  return (
    <div className="header-total">
      <span className="kpi-label">Total</span>
      <b>{money(total)}</b>
    </div>
  );
}

export function EnvelopesScreen({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  const { openMenu, setEditing } = useUi();
  const [open, setOpen] = useState<string | null>(null);
  const { year, month: m0 } = parseMonth(month);
  const alerts = envelopeAlerts(data, ledger, year, m0);
  const alloc = monthAlloc(data, month);
  const editable = !!data.months[month]?.initialized && !isMonthLocked(data, month);
  const drawerEnv = data.envelopes.find(e => e.id === open);

  return (
    <>
      <div className="env-grid">
        {data.envelopes.map(e => {
          const em = ledger.envMonth(e.id, month);
          const balance = em?.balance ?? 0;
          const planned = data.planned.filter(p => p.envelopeId === e.id && p.year === year && p.month === m0).reduce((a, p) => a + p.amount, 0);
          const alert = alerts.find(a => a.envelopeId === e.id);
          const cash = Math.min(e.cash, Math.max(0, balance));
          const series = Array.from({ length: 12 }, (_, i) => ledger.envMonth(e.id, addMonths(month, i - 11))?.balance);
          return (
            <div
              key={e.id}
              className="panel-lg env-card"
              style={toneVars(e.hue)}
              onClick={() => setOpen(e.id)}
              onContextMenu={ev =>
                openMenu(ev, e.name, [
                  {
                    label: 'Supprimer l’enveloppe',
                    danger: true,
                    onSelect: () => {
                      if (window.confirm(`Supprimer l’enveloppe « ${e.name} » ?`)) update(d => void (d.envelopes = d.envelopes.filter(x => x.id !== e.id)));
                    },
                  },
                ])
              }
            >
              <div className="env-card-head">
                <span className="dot is-12" style={{ background: 'var(--t-base)' }} />
                <span className="env-card-name">{e.name}</span>
                <div style={{ flex: 1 }} />
                {alert && (
                  <div className="alert-pill">
                    <Icon name="alert" size={12} stroke={2.8} />
                    Manque ~{money(alert.missing)}
                  </div>
                )}
              </div>
              <div className="env-card-mid">
                <div>
                  <div className="kpi-label">Solde cumulé</div>
                  <div className="env-card-solde">{money(balance)}</div>
                </div>
                <div style={{ width: 168 }}>
                  <AreaSpark values={series} />
                  <div className="spark-legend">
                    <span>{MONTH_SHORT[parseMonth(addMonths(month, -11)).month]}</span>
                    <span>12 mois</span>
                    <span>{MONTH_SHORT[m0]}</span>
                  </div>
                </div>
              </div>
              <div className="env-card-stats">
                <div
                  className="stat is-tinted"
                  style={{ cursor: editable ? 'text' : undefined }}
                  onClick={ev => {
                    if (!editable) return;
                    ev.stopPropagation();
                    setEditing(`al:${e.id}`);
                  }}
                >
                  <div className="stat-label is-ink">Alloué ce mois</div>
                  <EditableAmount
                    id={`al:${e.id}`}
                    value={alloc[e.id] ?? 0}
                    disabled={!editable}
                    onCommit={v => update(d => void (d.months[month].alloc[e.id] = v ?? 0))}
                    className="stat-value is-editable"
                    inputClassName="cell-input is-alloc"
                    hint="left"
                  >
                    {money(alloc[e.id] ?? 0)}
                  </EditableAmount>
                </div>
                <div className="stat">
                  <div className="stat-label">Dépensé</div>
                  <div className="stat-value">{money(em?.spent ?? 0)}</div>
                </div>
                <div className="stat">
                  <div className="stat-label">Prévu</div>
                  <div className="stat-value">{money(planned)}</div>
                </div>
              </div>
              <SplitBar cash={cash} balance={balance} />
            </div>
          );
        })}
      </div>
      {drawerEnv && <EnvelopeDrawer env={drawerEnv} month={month} onClose={() => setOpen(null)} />}
    </>
  );
}

function SplitBar({ cash, balance }: { cash: number; balance: number }) {
  return (
    <div className="split">
      <div className="split-bar">
        <div style={{ width: `${balance > 0 ? (cash / balance) * 100 : 0}%`, background: CASH }} />
        <div style={{ flex: 1, background: 'var(--t-base)' }} />
      </div>
      <div className="split-legend">
        <span>
          <span className="dot" style={{ background: CASH }} />
          Espèces <b>{money(cash)}</b>
        </span>
        <span>
          <span className="dot" style={{ background: 'var(--t-base)' }} />
          Virtuel <b>{money(round2(balance - cash))}</b>
        </span>
      </div>
    </div>
  );
}

function AreaSpark({ values }: { values: (number | undefined)[] }) {
  const w = 168,
    h = 52;
  const known = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== undefined);
  if (known.length < 2) return <svg width={w} height={h} />;
  const ys = known.map(p => p[1]);
  const mn = Math.min(...ys);
  const sp = Math.max(...ys) - mn || 1;
  const pts = known.map(([i, v]) => [(i * w) / 11, 4 + (h - 8) * (1 - (v - mn) / sp)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ display: 'block', overflow: 'visible' }}>
      <path d={`${line} L${last[0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`} fill="var(--t-soft)" />
      <path d={line} fill="none" stroke="var(--t-base)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="#fff" stroke="var(--t-base)" strokeWidth="2" />
    </svg>
  );
}

function EnvelopeDrawer({ env, month, onClose }: { env: Envelope; month: MonthKey; onClose: () => void }) {
  const { data, ledger, update } = useStore();
  const balance = ledger.envMonth(env.id, month)?.balance ?? 0;
  const cash = Math.min(env.cash, Math.max(0, balance));
  const patch = (fn: (e: Envelope) => void) => update(d => fn(d.envelopes.find(x => x.id === env.id)!));
  const hist = [5, 4, 3, 2, 1, 0]
    .map(k => addMonths(month, -k))
    .map(m => ({ m, r: ledger.envMonth(env.id, m) }))
    .filter(x => x.r);
  const txs = data.transactions
    .filter(t => t.type === 'env' && t.target === env.id && compareMonths(t.month, month) <= 0)
    .sort((a, b) => compareMonths(b.month, a.month) || b.day - a.day);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" style={toneVars(env.hue)}>
        <div className="drawer-head">
          <div className="drawer-title-row">
            <span className="dot is-12" style={{ background: 'var(--t-base)' }} />
            <EditableText id={`dn:${env.id}`} value={env.name} onCommit={name => patch(e => void (e.name = name))} className="drawer-name" inputClassName="cell-input is-title">
              {env.name}
            </EditableText>
            <div style={{ flex: 1 }} />
            <div className="round-btn" onClick={onClose} title="Fermer">
              <Icon name="close" size={16} />
            </div>
          </div>
          <div className="drawer-kicker">Solde cumulé · {monthLabel(month)}</div>
          <div className="drawer-solde">{money(balance)}</div>
        </div>

        <div className="drawer-section">Répartition du solde</div>
        <div className="drawer-body">
          <div className="split-bar is-lg">
            <div style={{ width: `${balance > 0 ? (cash / balance) * 100 : 0}%`, background: CASH }} />
            <div style={{ flex: 1, background: 'var(--t-base)' }} />
          </div>
          <div className="split-cards">
            <div className="split-card is-cash">
              <div className="split-card-label">
                <Icon name="cash" size={14} />
                En espèces
              </div>
              <EditableAmount
                id={`cash:${env.id}`}
                value={cash}
                onCommit={v => patch(e => void (e.cash = Math.max(0, Math.min(v ?? 0, balance))))}
                className="split-card-value is-editable"
                inputClassName="cell-input is-cash"
              >
                {money(cash)}
              </EditableAmount>
            </div>
            <div className="split-card">
              <div className="split-card-label is-ink">
                <Icon name="creditCard" size={14} />
                Virtuel (compte)
              </div>
              <div className="split-card-value">{money(round2(balance - cash))}</div>
              <div className="split-card-note">solde moins espèces</div>
            </div>
          </div>
        </div>

        <div className="drawer-section">Historique mensuel</div>
        <div className="drawer-body is-table">
          <div className="hist-grid hist-head">
            <span>Mois</span>
            <span className="num">Alloué</span>
            <span className="num">Dépensé</span>
            <span className="num">Solde</span>
          </div>
          {hist.map(({ m, r }) => (
            <div key={m} className="hist-grid hist-row">
              <span style={{ fontWeight: 500 }}>{monthLabel(m)}</span>
              <span className="num">{money(r!.alloc)}</span>
              <span className="num">{money(r!.spent)}</span>
              <b className="num">{money(r!.balance)}</b>
            </div>
          ))}
        </div>

        <div className="drawer-section is-spaced">Transactions liées</div>
        <div className="drawer-body is-table is-last">
          {txs.map(t => (
            <div key={t.id} className="drawer-tx">
              <span className="muted is-small">{dayLabel(t.month, t.day)}</span>
              <span style={{ fontWeight: 500 }}>{t.label}</span>
              <b className="num">{money(-t.amount)}</b>
            </div>
          ))}
          {txs.length === 0 && <div className="empty">Aucune transaction.</div>}
        </div>
      </aside>
    </>
  );
}
