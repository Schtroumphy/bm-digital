import { useState } from 'react';
import { deleteSimulation, saveSimulation, simulationSaveError } from '../../application/simulations';
import { Icon } from '../components/Icon';
import { SIM_BLOCK_META, SimulationBlock } from '../components/SimulationBlock';
import { SimulationPie, type SliceId } from '../components/SimulationPie';
import { BAD, GOOD, MUTED, tone, toneVars } from '../components/tone';
import { money, percent } from '../../domain/format';
import {
  blockShare, simulationSavings, duplicateSimulation, gapWithModel, newSimulation, openSimulation, SIM_BLOCKS, SIM_OUTGOING_BLOCKS, simulationTotals,
  type SimulationDraft, type SimulationSource,
} from '../../domain/simulation';
import { templateSummary } from '../../domain/budget';
import type { SimBlockKey } from '../../domain/types';
import { newId, useStore } from '../state/store';

const SOURCES: { id: SimulationSource; label: string }[] = [
  { id: 'model', label: 'Budget modèle' },
  { id: 'vide', label: 'Vide' },
];

const VIOLET = 'var(--violet-ink)';
const SAVED_MESSAGE = 'Simulation enregistrée';

/**
 * « Simulation » (spec 0034): a sandbox month made of free lines. The draft lives in `App` (kept when changing tab, lost on reload);
 * only « Enregistrer » writes, and only into `BudgetData.simulations`. Every figure comes from the domain.
 */
export function SimulationScreen({ draft, setDraft }: { draft: SimulationDraft; setDraft: (d: SimulationDraft) => void }) {
  const { data, update } = useStore();
  // Result of the last save attempt; any edit clears it (RG12, RG22).
  // Slice of the pie shared with the bars of the summary, which are its legend.
  const [activeSlice, setActiveSlice] = useState<SliceId | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const totals = simulationTotals(draft.rows);
  const savings = simulationSavings(totals);
  const saved = data.simulations ?? [];
  const modelRemaining = templateSummary(data).remaining;
  const gap = gapWithModel(data, draft.rows);
  const isSaved = draft.id !== null && saved.some(s => s.id === draft.id);

  /** Every change of the draft goes through here, so that the message goes away. */
  const edit = (next: SimulationDraft) => {
    setMessage(null);
    setDraft(next);
  };
  const editRows = (fn: (rows: SimulationDraft['rows']) => SimulationDraft['rows']) => edit({ ...draft, rows: fn(draft.rows) });
  const rowId = () => newId('sr');

  const save = () => {
    const error = simulationSaveError(data, draft);
    if (error) return setMessage({ text: error, ok: false });
    const id = isSaved ? draft.id! : newId('sim');
    update(d => void saveSimulation(d, draft, id));
    setDraft({ ...draft, id, name: draft.name.trim() });
    setMessage({ text: SAVED_MESSAGE, ok: true });
  };
  const remove = (id: string) => {
    update(d => void deleteSimulation(d, id));
    // The open simulation stays on screen but is no longer a saved one (RG16).
    edit(draft.id === id ? { ...draft, id: null } : draft);
  };

  return (
    <div className="sim">
      <div className="panel-lg sim-top">
        <div className="sim-name-row">
          <input
            className="sim-name"
            value={draft.name}
            onChange={e => edit({ ...draft, name: e.target.value })}
            placeholder="Nom de la simulation (ex. Passage à 80 % après le déménagement)"
            aria-label="Nom de la simulation"
          />
          {isSaved && (
            <button type="button" className="btn-outline" style={{ height: 40 }} onClick={() => edit(duplicateSimulation(draft, rowId))}>
              Dupliquer
            </button>
          )}
          <button type="button" className="sim-save" onClick={save}>
            <Icon name="save" size={15} stroke={2.6} />
            Enregistrer
          </button>
        </div>
        <div className="sim-source-row">
          <span className="sim-label">Partir de</span>
          {SOURCES.map(s => (
            <button key={s.id} type="button" className={`sim-chip${draft.source === s.id ? ' is-on' : ''}`} onClick={() => edit(newSimulation(s.id, data, rowId))}>
              {s.label}
            </button>
          ))}
          <span className="sim-sep" />
          <span className="sim-label">Enregistrées</span>
          {saved.length === 0 && <span className="muted">aucune</span>}
          {saved.map(s => {
            const remaining = simulationTotals(s.rows).remaining;
            return (
              <div key={s.id} className={`sim-saved${s.id === draft.id ? ' is-open' : ''}`} onClick={() => edit(openSimulation(s))} role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') edit(openSimulation(s)); }}>
                <b>{s.name}</b>
                <b style={{ color: remaining < 0 ? BAD : VIOLET }}>{money(remaining)}</b>
                <button type="button" className="icon-btn sim-saved-x" title="Supprimer" aria-label={`Supprimer ${s.name}`} onClick={e => { e.stopPropagation(); remove(s.id); }}>
                  <Icon name="close" size={12} stroke={2.8} />
                </button>
              </div>
            );
          })}
          <div style={{ flex: 1 }} />
          {message && (
            <b role="status" style={{ color: message.ok ? VIOLET : BAD }}>
              {message.text}
            </b>
          )}
        </div>
      </div>

      <div className="sim-grid">
        {SIM_BLOCKS.map(block => (
          <SimulationBlock
            key={block}
            block={block}
            rows={draft.rows.filter(r => r.block === block)}
            total={totals.blocks[block]}
            totalYear={totals.annual.blocks[block]}
            onName={(id, name) => editRows(rows => rows.map(r => (r.id === id ? { ...r, name } : r)))}
            onAmount={(id, amount) => editRows(rows => rows.map(r => (r.id === id ? { ...r, amount } : r)))}
            onRemove={id => editRows(rows => rows.filter(r => r.id !== id))}
            onAdd={(b: SimBlockKey) => editRows(rows => [...rows, { id: rowId(), block: b, name: '', amount: '' }])}
          />
        ))}

        <aside className="panel-lg sim-summary">
          <div>
            <div className="kpi-label">Reste à placer</div>
            <div className="sim-remaining" style={{ color: totals.remaining < 0 ? BAD : VIOLET }}>
              {money(totals.remaining)}
            </div>
          </div>
          <div className="sim-tiles">
            <div className="sim-tile">
              <div className="kpi-label">Revenus</div>
              <b>{money(totals.revenue)}</b>
              <div className="kpi-label">{money(totals.annual.revenue)} / an</div>
            </div>
            <div className="sim-tile">
              <div className="kpi-label">Sorties</div>
              <b>{money(totals.outgoing)}</b>
              <div className="kpi-label">{money(totals.annual.outgoing)} / an</div>
            </div>
          </div>
          <SimulationPie totals={totals} active={activeSlice} onActive={setActiveSlice} />
          <div className="sim-bars">
            {SIM_OUTGOING_BLOCKS.map(b => (
              <div
                key={b}
                className={`sim-bar-row${activeSlice === b ? ' is-on' : ''}`}
                tabIndex={0}
                onMouseEnter={() => setActiveSlice(b)}
                onMouseLeave={() => setActiveSlice(null)}
                onFocus={() => setActiveSlice(b)}
                onBlur={() => setActiveSlice(null)}
              >
                <div className="sim-bar-label">
                  <span>{SIM_BLOCK_META[b].title}</span>
                  <span>
                    <b>{money(totals.blocks[b])}</b>
                    <span className="sim-bar-year">{money(totals.annual.blocks[b])}/an</span>
                    <span className="sim-bar-pct">{percent(totals.revenue > 0 ? (totals.blocks[b] / totals.revenue) * 100 : 0)}</span>
                  </span>
                </div>
                <div className="sim-bar">
                  <div style={{ width: `${blockShare(totals, b)}%`, background: tone(SIM_BLOCK_META[b].hue).base }} />
                </div>
              </div>
            ))}
          </div>
          <div className="sim-savings">
            <div className="sim-savings-head">
              <span>Épargne</span>
              <span>
                <b>{money(savings.monthly)}</b>
                <span className="sim-bar-year">{money(savings.annual)}/an</span>
              </span>
            </div>
            <div className="kpi-label">{percent(savings.shareOfRevenue)} des revenus</div>
            {savings.details.map(x => (
              <div key={x.block} className={`sim-savings-line${x.block === 'inv' ? ' is-invest' : ''}`} style={x.block === 'inv' ? { color: tone(SIM_BLOCK_META.inv.hue).ink } : undefined}>
                <span>{SIM_BLOCK_META[x.block].title}</span>
                <span>
                  <b>{money(x.monthly)}</b>
                  <span className="sim-bar-year">{money(x.annual)}/an</span>
                  {x.block === 'inv' && <span className="sim-invest-share">{percent(savings.investShareOfSavings)} de l’épargne</span>}
                </span>
              </div>
            ))}
          </div>
          <div className="sim-compare">
            <div>
              <span>Reste à placer sur l’année</span>
              <b style={{ color: totals.remaining < 0 ? BAD : VIOLET }}>{money(totals.remainingYear)}</b>
            </div>
            <div>
              <span>Budget modèle</span>
              <b>{money(modelRemaining)}</b>
            </div>
            <div>
              <span>Écart avec le modèle</span>
              <b style={{ color: gap === 0 ? MUTED : gap > 0 ? GOOD : BAD }}>{money(gap, true)}</b>
            </div>
          </div>
        </aside>

        <section className="panel sim-notes" style={toneVars(90)}>
          <div className="block-head">
            <div className="block-icon">
              <Icon name="note" size={14} />
            </div>
            <div className="block-title">Notes</div>
          </div>
          <textarea className="sim-notes-text" value={draft.notes} onChange={e => edit({ ...draft, notes: e.target.value })} placeholder="Hypothèses, objectifs, points à vérifier…" aria-label="Notes" />
        </section>
      </div>
    </div>
  );
}
