import { Icon, type IconName } from './Icon';
import { toneVars } from './tone';
import { money } from '../../domain/format';
import { rowAnnual, sanitizeSimulationAmount } from '../../domain/simulation';
import type { SimBlockKey, SimulationRow } from '../../domain/types';

/** Title, hue, icon and « Ajouter » label of each block of a simulation (spec 0034, RG1). */
export const SIM_BLOCK_META: Record<SimBlockKey, { title: string; hue: number; icon: IconName; add: string }> = {
  rev: { title: 'Revenus', hue: 150, icon: 'arrowDown', add: 'Ajouter un revenu' },
  cre: { title: 'Crédits et dettes', hue: 20, icon: 'card', add: 'Ajouter un crédit' },
  fix: { title: 'Dépenses fixes', hue: 38, icon: 'home', add: 'Ajouter une dépense fixe' },
  var: { title: 'Dépenses variables', hue: 75, icon: 'basket', add: 'Ajouter une dépense variable' },
  epa: { title: 'Épargnes', hue: 300, icon: 'bank', add: 'Ajouter un compte' },
  inv: { title: 'Investissements', hue: 250, icon: 'trend', add: 'Ajouter un placement' },
  env: { title: 'Enveloppes', hue: 330, icon: 'mail', add: 'Ajouter une enveloppe' },
};

interface Props {
  block: SimBlockKey;
  rows: SimulationRow[];
  /** Monthly total of the block. */
  total: number;
  /** Yearly total of the block. */
  totalYear: number;
  onName: (id: string, name: string) => void;
  onAmount: (id: string, amount: string) => void;
  onRemove: (id: string) => void;
  onAdd: (block: SimBlockKey) => void;
}

/** One block of a simulation: header with its totals, free lines (name, monthly amount, yearly amount), « Ajouter » foot. */
export function SimulationBlock({ block, rows, total, totalYear, onName, onAmount, onRemove, onAdd }: Props) {
  const meta = SIM_BLOCK_META[block];
  return (
    <section className={`panel sim-block${block === 'env' ? ' is-wide' : ''}`} style={toneVars(meta.hue)}>
      <div className="block-head">
        <div className="block-icon">
          <Icon name={meta.icon} size={14} />
        </div>
        <div className="block-title" style={{ flex: 1 }}>
          {meta.title}
        </div>
        <div className="block-strip" style={{ color: 'var(--t-ink)' }}>
          {money(total)}
          <span className="sim-per-year"> · {money(totalYear)}/an</span>
        </div>
      </div>
      <div className="sim-rows">
        {rows.length === 0 && <div className="sim-empty">Aucune ligne</div>}
        {rows.map(r => {
          const annual = rowAnnual(r.amount);
          return (
            <div key={r.id} className="sim-row">
              <input className="sim-input" value={r.name} onChange={e => onName(r.id, e.target.value)} placeholder="Nom" aria-label="Nom de la ligne" />
              <div className="sim-amount">
                <input
                  className="sim-input is-amount"
                  value={r.amount}
                  onChange={e => onAmount(r.id, sanitizeSimulationAmount(e.target.value))}
                  placeholder="0"
                  inputMode="decimal"
                  aria-label="Montant mensuel"
                />
                <span className="sim-euro">€</span>
              </div>
              <span className="sim-year">{annual === null ? '' : money(annual)}</span>
              <button type="button" className="icon-btn sim-remove" title="Retirer" aria-label="Retirer la ligne" onClick={() => onRemove(r.id)}>
                <Icon name="close" size={12} stroke={3} />
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="sim-add" onClick={() => onAdd(block)}>
        <span className="sim-add-icon">
          <Icon name="plus" size={13} stroke={3} />
        </span>
        {meta.add}
      </button>
    </section>
  );
}
