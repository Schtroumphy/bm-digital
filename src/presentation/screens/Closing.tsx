import { EditableAmount } from '../components/Editable';
import { Icon, type IconName } from '../components/Icon';
import { MUTED, tone, toneVars } from '../components/tone';
import { AccountDot } from '../components/AccountPicker';
import { closingView, type ClosingGroupId } from '../../domain/closing';
import { money, monthKey, round2 } from '../../domain/format';
import { useStore } from '../state/store';

const ADJ = 'oklch(0.45 0.1 70)';

const GROUP_STYLE: Record<ClosingGroupId, { hue: number; icon: IconName }> = {
  courant: { hue: 200, icon: 'card' },
  epargne: { hue: 300, icon: 'bank' },
  enveloppe: { hue: 280, icon: 'mail' },
  invest: { hue: 250, icon: 'trend' },
};

export function ClosingScreen({ year }: { year: number }) {
  const { data, ledger, update } = useStore();
  const dec = monthKey(year, 11);
  const close = data.closes[year] ?? { closed: false, overrides: {} };
  const next = year + 1;

  if (!ledger.months.includes(dec))
    return (
      <div className="panel-lg empty-state">
        Décembre {year} n’est pas encore dans l’application : la clôture de {year} sera possible une fois ce mois créé.
      </div>
    );

  // Each amount is in one group only: a bank account by its kind, a savings line tied to an account by that account (spec 0010).
  const { groups: view, total, nAdj } = closingView(data, ledger, year);
  const setOverride = (id: string, v: number, calc: number) =>
    update(d => {
      const c = (d.closes[year] ??= { closed: false, overrides: {} });
      if (round2(v - calc) === 0) delete c.overrides[id];
      else c.overrides[id] = v;
    });
  const adjText = (a: number) => (a ? money(a, true) : '—');

  return (
    <div className="close-layout">
      <div className="close-main">
        <div className="intro">
          Vérifie les soldes de chaque compte bancaire, épargne, enveloppe et investissement au 1er janvier {next}. Ils serviront de base de départ pour {next}. Clique sur un montant pour l’ajuster.
        </div>
        {view.map(g => (
          <div key={g.id} className="panel-lg" style={toneVars(GROUP_STYLE[g.id].hue)}>
            <div className="group-head is-icon">
              <div className="block-icon is-24">
                <Icon name={GROUP_STYLE[g.id].icon} size={15} />
              </div>
              {g.title}
            </div>
            <div className="close-grid close-cols">
              <span>Nom</span>
              <span className="num pad8">Solde au 31 déc. {year}</span>
              <span className="num pad8">Base au 1er janv. {next}</span>
              <span className="num">Ajustement</span>
            </div>
            {g.rows.map(r => (
              <div key={r.id} className="close-grid close-row">
                <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {r.account && <AccountDot account={r.account} />}
                  {r.name}
                  {r.unlinked && <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>non lié</span>}
                </div>
                <div className="num pad8 muted">{money(r.calc)}</div>
                <div className="rel">
                  <EditableAmount
                    id={`k:${r.id}`}
                    value={r.val}
                    disabled={close.closed}
                    onCommit={v => v !== null && setOverride(r.id, v, r.calc)}
                    className="stmt-cell"
                    style={{ background: r.adj ? 'oklch(0.96 0.04 90)' : undefined, cursor: close.closed ? 'default' : 'text' }}
                    inputClassName="cell-input is-close"
                  >
                    {money(r.val)}
                  </EditableAmount>
                </div>
                <div className="num" style={{ fontWeight: 600, color: r.adj ? ADJ : MUTED }}>
                  {adjText(r.adj)}
                </div>
              </div>
            ))}
            <div className="close-grid close-total">
              <div>Total</div>
              <div className="num pad8">{money(g.tcalc)}</div>
              <div className="num pad8">{money(g.tval)}</div>
              <div className="num" style={{ color: g.tadj ? ADJ : MUTED }}>
                {adjText(g.tadj)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="panel-lg close-side">
        <div>
          <div className="kpi-label">Base reportée au 1er janvier {next}</div>
          <div className="close-total-value">{money(total)}</div>
        </div>
        <div className="close-legend">
          {view.map(g => (
            <div key={g.id}>
              <span className="dot is-9" style={{ background: tone(GROUP_STYLE[g.id].hue).base }} />
              <span style={{ flex: 1, fontWeight: 500 }}>{g.title}</span>
              <b>{money(g.tval)}</b>
            </div>
          ))}
        </div>
        <div className="note-box">{nAdj ? `${nAdj} ${nAdj > 1 ? 'soldes ajustés' : 'solde ajusté'} par rapport au calcul` : 'Aucun ajustement'}</div>
        {close.closed && (
          <div className="ok-box">
            <Icon name="lock" size={16} stroke={2.8} />
            Année {year} clôturée. Les soldes sont la base de {next}.
          </div>
        )}
        <div
          className={close.closed ? 'btn-outline is-block' : 'btn-dark is-block'}
          onClick={() =>
            update(d => {
              const c = (d.closes[year] ??= { closed: false, overrides: {} });
              c.closed = !c.closed;
            })
          }
        >
          {close.closed ? `Rouvrir l’année ${year}` : `Clôturer l’année ${year}`}
        </div>
        <div className="small-note">
          La clôture verrouille {year} et initialise les soldes de départ de janvier {next}. Elle peut être rouverte.
        </div>
      </div>
    </div>
  );
}
