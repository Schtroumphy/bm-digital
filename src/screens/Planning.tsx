import { EditableAmount, EditableText } from '../components/Editable';
import { Icon } from '../components/Icon';
import { tone } from '../components/tone';
import { envelopeAlerts } from '../domain/budget';
import { currentMonthKey, money, monthKey, monthName, MONTH_NAMES } from '../domain/format';
import type { PlannedItem } from '../domain/types';
import { newId, useStore } from '../state/store';
import { useUi } from '../state/ui';

export function PlanningScreen({ year }: { year: number }) {
  const { data, ledger, update } = useStore();
  const { openMenu, setEditing } = useUi();
  const items = data.planned.filter(p => p.year === year);
  const total = items.reduce((a, p) => a + p.amount, 0);
  const today = currentMonthKey();
  const patch = (id: string, fn: (p: PlannedItem) => void) => update(d => fn(d.planned.find(p => p.id === id)!));

  return (
    <>
      <div className="plan-top">
        <div className="panel kpi-box is-hero">
          <div className="kpi-label">Total annuel prévu</div>
          <div className="kpi-box-value">{money(total)}</div>
        </div>
        <div className="panel kpi-box">
          <div className="kpi-label">Moyenne mensuelle</div>
          <div className="kpi-box-value is-plain">{money(total / 12)}</div>
        </div>
        <div style={{ flex: 1 }} />
        <div className="legend">
          {data.envelopes.map(e => (
            <span key={e.id}>
              <span className="dot is-10" style={{ background: tone(e.hue).base }} />
              {e.name}
            </span>
          ))}
        </div>
      </div>
      <div className="plan-grid">
        {MONTH_NAMES.map((_, m) => {
          const its = items.filter(p => p.month === m);
          const current = monthKey(year, m) === today;
          const alerts = envelopeAlerts(data, ledger, year, m);
          const alertText = alerts.map(a => `${data.envelopes.find(e => e.id === a.envelopeId)?.name} : il manquera ~${money(a.missing)}`).join('\n');
          return (
            <div key={m} className={`panel plan-month${current ? ' is-current' : ''}`}>
              <div className="plan-month-head">
                <span className="plan-month-name">{monthName(m)}</span>
                {current && <span className="pill is-current">En cours</span>}
                {alerts.length > 0 && (
                  <span className="alert-pill is-small" title={alertText}>
                    <Icon name="alert" size={11} stroke={3} />
                    Alerte
                  </span>
                )}
                <div style={{ flex: 1 }} />
                <span className="plan-month-total">{money(its.reduce((a, p) => a + p.amount, 0))}</span>
              </div>
              <div className="plan-items">
                {its.map(p => {
                  const env = data.envelopes.find(e => e.id === p.envelopeId);
                  const t = tone(env?.hue ?? 0);
                  return (
                    <div
                      key={p.id}
                      className="plan-item"
                      style={{ '--t-base': t.base, '--t-line': t.line } as React.CSSProperties}
                      onContextMenu={e => openMenu(e, p.label, [{ label: 'Supprimer la dépense prévue', danger: true, onSelect: () => update(d => void (d.planned = d.planned.filter(x => x.id !== p.id))) }])}
                    >
                      <span
                        className="plan-dot"
                        title={`${env?.name ?? 'Aucune enveloppe'} · cliquer pour changer`}
                        style={{ background: env ? t.base : 'rgba(32,30,29,.2)' }}
                        onClick={e =>
                          openMenu(
                            e,
                            'Enveloppe liée',
                            data.envelopes.map(x => ({ label: x.name, onSelect: () => patch(p.id, q => void (q.envelopeId = x.id)) })),
                          )
                        }
                      />
                      <EditableText id={`pl:${p.id}`} value={p.label} onCommit={v => patch(p.id, q => void (q.label = v))} className="plan-label" inputClassName="cell-input is-text">
                        {p.label}
                      </EditableText>
                      <div className="plan-amount">
                        <EditableAmount id={`pa:${p.id}`} value={p.amount} onCommit={v => patch(p.id, q => void (q.amount = v ?? 0))} className="cell is-strong" inputClassName="cell-input">
                          {money(p.amount)}
                        </EditableAmount>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div
                className="add-btn is-neutral"
                onClick={() => {
                  const id = newId('p');
                  update(d => void d.planned.push({ id, year, month: m, label: 'Nouvelle dépense', amount: 0, envelopeId: d.envelopes[0]?.id ?? '' }));
                  setEditing(`pl:${id}`);
                }}
              >
                <span className="add-icon">
                  <Icon name="plus" size={13} stroke={3} />
                </span>
                Ajouter
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
