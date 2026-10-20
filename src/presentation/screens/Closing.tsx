import { EditableAmount } from '../components/Editable';
import { Icon, type IconName } from '../components/Icon';
import { MUTED, tone, toneVars } from '../components/tone';
import { money, monthKey, round2 } from '../../domain/format';
import { accounts, closeKey } from '../../domain/ledger';
import { useStore } from '../state/store';

const ADJ = 'oklch(0.45 0.1 70)';

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

  const accs = accounts(data);
  const groups: { title: string; hue: number; icon: IconName; rows: { id: string; name: string; calc: number }[] }[] = [
    // Bank accounts: archived ones stay while they have a balance to carry over.
    {
      title: 'Comptes bancaires',
      hue: 200,
      icon: 'card',
      rows: data.accounts
        .filter(a => ledger.bankMonth(a.id, dec) && (!a.archived || ledger.bankMonth(a.id, dec)!.balance !== 0))
        .map(a => ({ id: closeKey('bank', a.id), name: a.name, calc: ledger.bankMonth(a.id, dec)!.balance })),
    },
    { title: 'Comptes et épargnes', hue: 300, icon: 'bank', rows: accs.filter(a => a.block === 'epa').map(a => ({ id: closeKey('acc', a.key), name: a.name, calc: ledger.accMonth(a.key, dec)?.balance ?? 0 })) },
    { title: 'Enveloppes', hue: 280, icon: 'mail', rows: data.envelopes.map(e => ({ id: closeKey('env', e.id), name: e.name, calc: ledger.envMonth(e.id, dec)?.balance ?? 0 })) },
    { title: 'Investissements', hue: 250, icon: 'trend', rows: accs.filter(a => a.block === 'inv').map(a => ({ id: closeKey('acc', a.key), name: a.name, calc: ledger.accMonth(a.key, dec)?.balance ?? 0 })) },
  ];
  let nAdj = 0;
  const view = groups.map(g => {
    const rows = g.rows.map(r => {
      const val = close.overrides[r.id] ?? r.calc;
      const adj = round2(val - r.calc);
      if (adj) nAdj++;
      return { ...r, val, adj };
    });
    const tcalc = round2(rows.reduce((a, r) => a + r.calc, 0));
    const tval = round2(rows.reduce((a, r) => a + r.val, 0));
    return { ...g, rows, tcalc, tval, tadj: round2(tval - tcalc) };
  });
  const total = round2(view.reduce((a, g) => a + g.tval, 0));
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
          <div key={g.title} className="panel-lg" style={toneVars(g.hue)}>
            <div className="group-head is-icon">
              <div className="block-icon is-24">
                <Icon name={g.icon} size={15} />
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
                <div style={{ fontWeight: 500 }}>{r.name}</div>
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
            <div key={g.title}>
              <span className="dot is-9" style={{ background: tone(g.hue).base }} />
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
