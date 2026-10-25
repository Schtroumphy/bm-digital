import { useState } from 'react';
import { EditableAmount, EditableText } from '../components/Editable';
import { EnvelopeBalances } from '../components/EnvelopeBalances';
import { OPENING_MESSAGE } from '../components/hints';
import { Icon } from '../components/Icon';
import { deleteEnvelope, envelopeBalance, openingBalanceRefusal, openingCashRefusal, renameEnvelope, setEnvelopeOpeningBalance, setEnvelopeOpeningCash } from '../../application/envelopes';
import { toneVars } from '../components/tone';
import { envelopeAlerts } from '../../domain/budget';
import { envelopeCash, envelopeTotal } from '../../domain/envelopeCash';
import { cashHistory, virtualHistory } from '../../domain/envelopeHistory';
import { addMonths, compareMonths, dayLabel, money, monthLabel, MONTH_SHORT, parseMonth, round2 } from '../../domain/format';
import { isMonthLocked, monthAlloc } from '../../domain/ledger';
import type { Envelope, MonthKey } from '../../domain/types';
import { useStore } from '../state/store';
import { useUi } from '../state/ui';

const LOCKED_HINT = 'Le mois de départ de cette enveloppe est clos ou verrouillé : le départ n’est plus modifiable.';
const HISTORY_COLUMNS = '1fr 90px 90px';

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

/** Header total of the Envelopes tab: the sum of every envelope's total (virtual + cash) this month. */
export function EnvelopesBalanceTotal({ month }: { month: MonthKey }) {
  const { data, ledger } = useStore();
  const total = round2(data.envelopes.reduce((a, e) => a + envelopeTotal(ledger.envMonth(e.id, month)?.balance ?? 0, envelopeCash(data, e.id, month)), 0));
  return (
    <div className="header-total">
      <span className="kpi-label">Total</span>
      <b>{money(total)}</b>
    </div>
  );
}

export function EnvelopesScreen({ month, onFundCash }: { month: MonthKey; onFundCash: (envelopeId: string) => void }) {
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
          const cash = envelopeCash(data, e.id, month);
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
                      // Refused while the envelope holds money: it has to be emptied first (spec 0011, Q7).
                      if (round2(envelopeBalance(data, e.id)) !== 0) return void window.alert(`« ${e.name} » contient encore de l’argent. Vide-la d’abord (par exemple avec un écart constaté sur son compte), puis supprime-la.`);
                      if (!window.confirm(`Supprimer l’enveloppe « ${e.name} » ? Son compte est archivé.`)) return;
                      update(d => void deleteEnvelope(d, e.id));
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
                  <div className="kpi-label">Provision</div>
                  <div className="env-card-solde">{money(envelopeTotal(balance, cash))}</div>
                  <EnvelopeBalances virtual={balance} cash={cash} />
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
            </div>
          );
        })}
      </div>
      {drawerEnv && <EnvelopeDrawer env={drawerEnv} month={month} onClose={() => setOpen(null)} onFundCash={onFundCash} />}
    </>
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

function EnvelopeDrawer({ env, month, onClose, onFundCash }: { env: Envelope; month: MonthKey; onClose: () => void; onFundCash: (envelopeId: string) => void }) {
  const { data, ledger, update } = useStore();
  const balance = ledger.envMonth(env.id, month)?.balance ?? 0;
  const cash = envelopeCash(data, env.id, month);
  const alloc = ledger.envMonth(env.id, month)?.alloc ?? 0;
  // The opening cash is typed only here and in the assistant, and only while the envelope's opening month is open (spec 0026, RG8).
  const account = data.accounts.find(a => a.id === env.accountId);
  const openingLocked = !account || isMonthLocked(data, account.openingMonth);
  const setOpening = (v: number | null) => {
    const refused = openingCashRefusal(data, env.id, v ?? 0);
    if (refused) return void window.alert(OPENING_MESSAGE[refused]);
    update(d => void setEnvelopeOpeningCash(d, env.id, v ?? 0));
  };
  const setOpeningBalance = (v: number | null) => {
    const refused = openingBalanceRefusal(data, env.id, v ?? 0);
    if (refused) return void window.alert(OPENING_MESSAGE[refused]);
    update(d => void setEnvelopeOpeningBalance(d, env.id, v ?? 0));
  };
  const [tab, setTab] = useState<'virtuel' | 'especes'>('virtuel');
  const rows = tab === 'virtuel' ? virtualHistory(data, env.id, month) : cashHistory(data, env.id, month);
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
            <EditableText id={`dn:${env.id}`} value={env.name} onCommit={name => update(d => void renameEnvelope(d, env.id, name))} className="drawer-name" inputClassName="cell-input is-title">
              {env.name}
            </EditableText>
            <div style={{ flex: 1 }} />
            <div className="round-btn" onClick={onClose} title="Fermer">
              <Icon name="close" size={16} />
            </div>
          </div>
          <div className="drawer-kicker">Provision · {monthLabel(month)}</div>
          <div className="drawer-solde">{money(envelopeTotal(balance, cash))}</div>
          <EnvelopeBalances virtual={balance} cash={cash} />
        </div>

        <div className="drawer-section">Deux soldes séparés</div>
        <div className="drawer-body">
          <div className="split-cards">
            <div className="split-card">
              <div className="split-card-label is-ink">
                <Icon name="creditCard" size={14} />
                Virtuel
              </div>
              <div className="split-card-value">{money(balance)}</div>
              <div className="split-card-note">
                alloué {money(alloc)} · départ{' '}
                <EditableAmount id={`open:${env.id}`} value={account?.openingBalance ?? 0} disabled={openingLocked} title={openingLocked ? LOCKED_HINT : 'Cliquer pour modifier le départ virtuel'} onCommit={setOpeningBalance} className="is-editable" inputClassName="cell-input is-alloc">
                  {money(account?.openingBalance ?? 0)}
                </EditableAmount>
              </div>
            </div>
            <div className="split-card is-cash">
              <div className="split-card-label">
                <Icon name="cash" size={14} />
                Espèces (à part)
              </div>
              <div className="split-card-value">{money(cash)}</div>
              <div className="split-card-note">
                départ{' '}
                <EditableAmount
                  id={`cash:${env.id}`}
                  value={env.openingCash}
                  disabled={openingLocked}
                  title={openingLocked ? LOCKED_HINT : 'Cliquer pour modifier le départ en espèces'}
                  onCommit={setOpening}
                  className="is-editable"
                  inputClassName="cell-input is-cash"
                >
                  {money(env.openingCash)}
                </EditableAmount>
              </div>
              <button type="button" className="btn-outline" disabled={isMonthLocked(data, month)} onClick={() => onFundCash(env.id)}>
                + Alimenter
              </button>
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

        <div className="drawer-section is-spaced">Mouvements</div>
        <div className="drawer-body is-table">
          <div className="tabs" role="tablist">
            {([['virtuel', 'Virtuel'], ['especes', 'Espèces']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'virtuel' && <div className="muted is-small">Le dernier solde est celui du compte de l’enveloppe ; le chiffre de la carte Virtuel est le solde budgétaire (départ + allocation − dépenses), qui peut différer tant qu’une allocation n’est pas transférée.</div>}
          <div className="hist-grid hist-head" style={{ gridTemplateColumns: HISTORY_COLUMNS }}>
            <span>Date · Libellé</span>
            <span className="num">Montant</span>
            <span className="num">{tab === 'virtuel' ? 'Solde compte' : 'Solde'}</span>
          </div>
          {rows.map((r, i) => (
            <div key={i} className="hist-grid hist-row" style={{ gridTemplateColumns: HISTORY_COLUMNS }}>
              <span style={{ fontWeight: 500 }}>
                <span className="muted is-small">{r.date.slice(8, 10)}/{r.date.slice(5, 7)}</span> {r.label}
              </span>
              <span className="num">{money(r.amount)}</span>
              <b className="num">{money(r.balance)}</b>
            </div>
          ))}
          {rows.length === 0 && <div className="empty">Aucun mouvement</div>}
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
