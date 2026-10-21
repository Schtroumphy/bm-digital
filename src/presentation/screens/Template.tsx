import { useState } from 'react';
import { EditableAmount, EditableText } from '../components/Editable';
import { Icon } from '../components/Icon';
import { BAD, GOOD, MUTED, tone, toneVars } from '../components/tone';
import { applyTemplate, saveAsTemplate } from '../../application/actions';
import { addTemplateLine, deleteTemplateLine, setTemplateAllocation, updateTemplateLine } from '../../application/template';
import { isLineInBudget } from '../../domain/bank';
import { blockTotals, templateSummary } from '../../domain/budget';
import { money, monthLabel, percent } from '../../domain/format';
import { isMonthLocked } from '../../domain/ledger';
import type { BlockKey, MonthKey } from '../../domain/types';
import { BLOCKS } from './Budget';
import { newId, useStore } from '../state/store';
import { useUi } from '../state/ui';

const ORDER: BlockKey[] = ['rev', 'cre', 'fix', 'var', 'epa', 'inv'];

/** The budget model: what « Appliquer le modèle » copies into a month. Editing it never touches the months already created. */
export function TemplateScreen({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  const { setEditing, openMenu } = useUi();
  const [target, setTarget] = useState<MonthKey>(month);
  const t = data.template;
  const allocTotal = data.envelopes.reduce((s, e) => s + (t.envAlloc[e.id] ?? 0), 0);
  const sum = templateSummary(data);
  const empty = t.lines.length === 0 && data.envelopes.length === 0;
  const months = ledger.months.filter(m => !isMonthLocked(data, m));
  const chosen = months.includes(target) ? target : (months[0] ?? '');
  const canSave = !!data.months[month]?.initialized && !isMonthLocked(data, month);

  const apply = () => {
    if (!chosen) return;
    if (data.months[chosen]?.initialized && !window.confirm(`Remplacer les lignes de ${monthLabel(chosen)} par le modèle ? Les montants réels saisis seront effacés.`)) return;
    update(d => void applyTemplate(d, chosen));
  };
  const saveFromMonth = () => {
    if (!window.confirm(`Remplacer le modèle par les lignes de ${monthLabel(month)} ?`)) return;
    update(d => saveAsTemplate(d, month));
  };

  return (
    <>
      <div className="banner">
        <div className="banner-icon">
          <Icon name="copy" size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="banner-title">Modèle de budget</div>
          <div className="banner-text">Les modifications ici ne changent pas les mois déjà créés : applique le modèle à un mois pour l’y copier.</div>
        </div>
        <select className="su-select" style={{ width: 170 }} value={chosen} onChange={e => setTarget(e.target.value)} aria-label="Mois à remplir">
          {months.map(m => (
            <option key={m} value={m}>
              {monthLabel(m)}
              {data.months[m]?.initialized ? '' : ' (à créer)'}
            </option>
          ))}
        </select>
        <div className={`btn-dark${chosen && !empty ? '' : ' is-disabled'}`} onClick={chosen && !empty ? apply : undefined}>
          Appliquer à ce mois
        </div>
        <div className={`btn-outline${canSave ? '' : ' is-disabled'}`} onClick={canSave ? saveFromMonth : undefined}>
          Remplacer par {monthLabel(month)}
        </div>
      </div>
      <div className="tpl-kpis">
        <div className="panel kpi">
          <div className="kpi-label">Reste à placer</div>
          <div className="kpi-box-value is-plain" style={{ color: sum.remaining === 0 ? undefined : sum.remaining > 0 ? GOOD : BAD }}>
            {money(sum.remaining)}
          </div>
        </div>
        <div className="panel kpi">
          <div className="kpi-label">Taux d’épargne</div>
          <div className="kpi-box-value is-plain">{percent(sum.savingsRate)}</div>
        </div>
      </div>
      <div className="budget-grid">
        {ORDER.map(block => {
          const meta = BLOCKS[block];
          const lines = t.lines.filter(l => l.block === block);
          const total = blockTotals(lines.map(l => ({ ...l, actual: null })), block).budget;
          const sections: { label: string; keys: string[] }[] = [];
          // As in the monthly budget: variable lines paid from an out-of-budget account are grouped under « Hors budget » (display only).
          const inBudget = (l: (typeof lines)[number]) => isLineInBudget(data, { ...l, actual: null });
          const offBudget = block === 'var' ? lines.filter(l => !inBudget(l)) : [];
          for (const l of lines) {
            if (offBudget.includes(l)) continue;
            const sec = sections.find(s => s.label === l.section);
            if (sec) sec.keys.push(l.key);
            else sections.push({ label: l.section, keys: [l.key] });
          }
          if (offBudget.length) sections.push({ label: 'Hors budget', keys: offBudget.map(l => l.key) });
          const add = () => {
            const key = newId('l');
            update(d => addTemplateLine(d, block, key));
            setEditing(`tn:${key}`);
          };
          return (
            <div key={block} className="panel block" style={toneVars(meta.hue)}>
              <div className="block-head">
                <div className="block-icon">
                  <Icon name={meta.icon} size={14} />
                </div>
                <div className="block-title">{meta.title}</div>
                <div style={{ flex: 1 }} />
                <div className="block-strip">{money(total)}</div>
              </div>
              <div className="line-grid line-head is-tpl">
                <span>Nom</span>
                <span className="num pad">Budget</span>
                <span className="num pad">Réel</span>
              </div>
              {sections.map(sec => (
                <div key={sec.label}>
                  {sec.label && <div className="block-section">{sec.label}</div>}
                  {sec.keys.map(key => {
                    const l = lines.find(x => x.key === key)!;
                    return (
                      <div
                        key={key}
                        className={`line-grid line-row is-tpl${inBudget(l) ? '' : ' is-off-budget'}`}
                        onContextMenu={e => openMenu(e, l.name, [{ label: 'Supprimer la ligne', danger: true, onSelect: () => update(d => void deleteTemplateLine(d, key)) }])}
                      >
                        <EditableText id={`tn:${key}`} value={l.name} onCommit={name => update(d => void updateTemplateLine(d, key, { name }))} className="line-name" inputClassName="cell-input is-text" title={l.name}>
                          {l.name}
                        </EditableText>
                        <EditableAmount id={`tb:${key}`} value={l.budget} onCommit={v => update(d => void updateTemplateLine(d, key, { budget: v ?? 0 }))} className="cell" inputClassName="cell-input" hint="right">
                          {money(l.budget)}
                        </EditableAmount>
                        <EditableAmount
                          id={`tr:${key}`}
                          value={l.actual ?? null}
                          allowEmpty
                          onCommit={v => update(d => void updateTemplateLine(d, key, { actual: v }))}
                          className="cell"
                          style={{ color: l.actual == null ? MUTED : undefined }}
                          inputClassName="cell-input"
                          hint="right"
                        >
                          {l.actual == null ? '—' : money(l.actual)}
                        </EditableAmount>
                      </div>
                    );
                  })}
                </div>
              ))}
              {lines.length === 0 && <div className="block-section">Aucune ligne</div>}
              <div style={{ flex: 1 }} />
              <div className="line-grid block-foot is-tpl">
                <div className="add-btn" title="Ajouter une ligne" onClick={add}>
                  <span className="add-icon">
                    <Icon name="plus" size={13} stroke={3} />
                  </span>
                  <span>Ajouter</span>
                </div>
              </div>
            </div>
          );
        })}
        <div className="panel block" style={toneVars(300)}>
          <div className="block-head">
            <div className="block-icon">
              <Icon name="mail" size={14} />
            </div>
            <div className="block-title">Enveloppes</div>
            <div style={{ flex: 1 }} />
            <div className="block-strip">{money(allocTotal)}</div>
          </div>
          {data.envelopes.map(e => (
            <div key={e.id} className="line-grid line-row is-tpl is-tpl-env">
              <div className="line-name">
                <span className="dot is-10" style={{ background: tone(e.hue).base, marginRight: 6 }} />
                {e.name}
              </div>
              <EditableAmount id={`ta:${e.id}`} value={t.envAlloc[e.id] ?? 0} onCommit={v => update(d => void setTemplateAllocation(d, e.id, v ?? 0))} className="cell" inputClassName="cell-input" hint="right">
                {money(t.envAlloc[e.id] ?? 0)}
              </EditableAmount>
            </div>
          ))}
          {data.envelopes.length === 0 && <div className="block-section">Aucune enveloppe</div>}
        </div>
      </div>
    </>
  );
}
