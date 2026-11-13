import { useState } from 'react';
import { addCategory, deleteCategory, renameCategory, setCategoryEmoji, usedMessage } from '../../application/categories';
import { categoryBreakdown, categoryEmoji, categoryEntries, categoryUsage, EMOJI_CHOICES, parseCategoryName, pieSlices, type CategoryShare } from '../../domain/categories';
import { money, monthLabel, percent } from '../../domain/format';
import type { Category, MonthKey } from '../../domain/types';
import { CategoryPie } from '../components/CategoryPie';
import { Icon } from '../components/Icon';
import type { OperationsFocus } from './Expenses';
import { tone } from '../components/tone';
import { newId, useStore } from '../state/store';

type CategoriesTab = 'repartition' | 'gerer';
const TABS: { id: CategoriesTab; label: string }[] = [
  { id: 'repartition', label: 'Répartition' },
  { id: 'gerer', label: 'Gérer' },
];

/**
 * Screen « Catégories » (spec 0046, RG27): two sub-tabs, « Répartition » (open by default: the month's breakdown, read only) and « Gérer » (the list).
 * Same `tabs` look as the rest of the app; arrow keys move between the tabs. The last tab is not remembered: the screen opens on « Répartition ».
 */
export function CategoriesScreen({ month, onOpenOperations }: { month: MonthKey; onOpenOperations: (f: OperationsFocus) => void }) {
  const [tab, setTab] = useState<CategoriesTab>('repartition');
  const move = (e: React.KeyboardEvent, from: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = TABS[(from + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`cat-tab-${next.id}`)?.focus();
  };
  return (
    <>
      <div className="tabs cat-tabs" role="tablist" aria-label="Catégories">
        {TABS.map((t, i) => (
          <button key={t.id} id={`cat-tab-${t.id}`} type="button" role="tab" aria-selected={tab === t.id} aria-controls={`cat-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} className={`tab${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)} onKeyDown={e => move(e, i)}>
            {t.label}
          </button>
        ))}
      </div>
      <div id={`cat-panel-${tab}`} role="tabpanel" aria-labelledby={`cat-tab-${tab}`}>
        {tab === 'repartition' ? <BreakdownSection key={month} month={month} onOpenOperations={onOpenOperations} /> : <ManageSection onOpenOperations={onOpenOperations} />}
      </div>
    </>
  );
}

function BreakdownSection({ month, onOpenOperations }: { month: MonthKey; onOpenOperations: (f: OperationsFocus) => void }) {
  const { data } = useStore();
  // Slice or row under the pointer (shared by the pie and the list, RG28) and the one row unfolded; both are forgotten when the month changes.
  const [hover, setHover] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen(o => (o === id ? null : id));
  const breakdown = categoryBreakdown(data, month);
  const rows: CategoryShare[] = [...breakdown.rows, ...(breakdown.none ? [breakdown.none] : [])];
  const maxAmount = Math.max(...rows.map(r => r.amount), 0);
  return (
    <section className="panel cat-panel" aria-label="Répartition du mois">
      <div className="cat-title">Répartition du mois</div>
      {breakdown.total === 0 && rows.length === 0 ? (
        <div className="empty">Aucune dépense pour {monthLabel(month)}</div>
      ) : (
        <>
          <div className="cat-head">
            <span>
              Dépenses du mois : <b>{money(breakdown.total)}</b>
            </span>
            <span>
              {breakdown.uncategorizedCount} écriture{breakdown.uncategorizedCount > 1 ? 's' : ''} sans catégorie
            </span>
          </div>
          <div className="cat-split">
            <CategoryPie slices={pieSlices(breakdown)} total={breakdown.total} active={hover} onActive={setHover} onSelect={toggle} />
            <div className="cat-legend">
              {rows.map(r => (
                <ShareRow key={r.category?.id ?? 'none'} row={r} max={maxAmount} month={month} active={hover === (r.category?.id ?? 'none')} dimmed={hover !== null && hover !== (r.category?.id ?? 'none')} open={open === (r.category?.id ?? 'none')} onHover={setHover} onToggle={toggle} onOpenOperations={onOpenOperations} />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ShareRow({ row, max, month, active, dimmed, open, onHover, onToggle, onOpenOperations }: { row: CategoryShare; max: number; month: MonthKey; active: boolean; dimmed: boolean; open: boolean; onHover: (id: string | null) => void; onToggle: (id: string) => void; onOpenOperations: (f: OperationsFocus) => void }) {
  const { data } = useStore();
  const id = row.category?.id ?? 'none';
  const name = row.category?.name ?? 'Sans catégorie';
  return (
    <div className={`cat-share${active ? ' is-active' : ''}${dimmed ? ' is-dimmed' : ''}`} onMouseEnter={() => onHover(id)} onMouseLeave={() => onHover(null)}>
      <div className="cat-share-main">
        <button type="button" className={`cat-row cat-row-btn${row.category ? '' : ' is-none'}`} aria-expanded={open} aria-controls={`cat-detail-${id}`} onClick={() => onToggle(id)} onFocus={() => onHover(id)} onBlur={() => onHover(null)}>
          <span className="dot is-9" style={{ background: row.category ? tone(row.category.hue).base : 'var(--neutral-fill)' }} />
          <span className="cat-name">{row.category && categoryEmoji(row.category) ? `${categoryEmoji(row.category)} ` : ''}{name}</span>
          <b className="num">{money(row.amount)}</b>
          <span className="num">{percent(row.share)}</span>
          <span className="num cat-count">({row.count})</span>
          <span className="progress" aria-hidden="true">
            <span style={{ display: 'block', height: '100%', borderRadius: 99, width: `${max > 0 ? (row.amount / max) * 100 : 0}%`, background: row.category ? tone(row.category.hue).base : 'var(--neutral-fill)' }} />
          </span>
        </button>
        <button type="button" className="icon-link" aria-label={`Voir les dépenses : ${name}`} title="Voir les dépenses" onClick={() => onOpenOperations(row.category ? { categoryId: row.category.id, label: name } : { uncategorized: true, label: name })}>
          <Icon name="list" size={15} />
        </button>
      </div>
      {open && (
        <ul id={`cat-detail-${id}`} className="cat-detail" aria-label={`Écritures : ${name}`}>
          {categoryEntries(data, month, row.category?.id ?? null).map(e => (
            <li key={e.id}>
              <span className="cat-detail-date">{e.date.slice(8, 10)}/{e.date.slice(5, 7)}</span>
              <span className="cat-detail-label">{e.label}</span>
              <b className="num">{money(e.amount)}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ManageSection({ onOpenOperations }: { onOpenOperations: (f: OperationsFocus) => void }) {
  const { data, update } = useStore();
  const categories = data.categories ?? [];
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const add = () => {
    const parsed = parseCategoryName(name, categories);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    const id = newId('cat');
    update(d => void addCategory(d, name, id));
    setName('');
    setError('');
  };
  return (
    <section className="panel cat-panel" aria-label="Gérer">
      <div className="cat-title">Gérer</div>
      <div className="cat-add">
        <input className="text-input" value={name} placeholder="Nouvelle catégorie…" aria-label="Nouvelle catégorie" onChange={e => { setName(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && add()} />
        <button type="button" className="btn-dark" onClick={add}>
          Ajouter
        </button>
      </div>
      {error && <div className="alert-box" role="alert">{error}</div>}
      {message && <div className="alert-box" role="alert">{message}</div>}
      {categories.length === 0 && <div className="empty">Aucune catégorie, ajoutes-en une</div>}
      {categories.map(c => (
        <ManageRow key={c.id} category={c} categories={categories} onMessage={setMessage} onOpenOperations={onOpenOperations} />
      ))}
    </section>
  );
}

function ManageRow({ category: c, categories, onMessage, onOpenOperations }: { category: Category; categories: Category[]; onMessage: (m: string) => void; onOpenOperations: (f: OperationsFocus) => void }) {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const used = categoryUsage(data, c.id);
  const save = () => {
    if (editing === null) return;
    const parsed = parseCategoryName(editing, categories, c.id);
    if ('error' in parsed) {
      setError(parsed.error);
      return;
    }
    update(d => void renameCategory(d, c.id, editing));
    setEditing(null);
    setError('');
  };
  const remove = () => {
    if (!window.confirm(`Supprimer la catégorie « ${c.name} » ?`)) return;
    onMessage('');
    update(d => void deleteCategory(d, c.id));
  };
  return (
    <div className="cat-row is-manage">
      <span className="dot is-9" style={{ background: tone(c.hue).base }} />
      <span className="acc-picker">
        <button type="button" className="btn-outline emoji-btn" aria-label={`Choisir l’emoji de ${c.name}`} title="Choisir un emoji" onClick={() => setPicking(p => !p)}>
          {categoryEmoji(c) || '＋'}
        </button>
        {picking && (
          <>
            <div className="backdrop" onClick={() => setPicking(false)} />
            <div className="popmenu emoji-menu">
              {EMOJI_CHOICES.map(e => (
                <button key={e} type="button" className={`emoji-choice${categoryEmoji(c) === e ? ' is-on' : ''}`} onClick={() => { update(d => void setCategoryEmoji(d, c.id, e)); setPicking(false); }}>
                  {e}
                </button>
              ))}
              <button type="button" className="emoji-reset" onClick={() => { update(d => void setCategoryEmoji(d, c.id, '')); setPicking(false); }}>
                Emoji par défaut
              </button>
            </div>
          </>
        )}
      </span>
      {editing === null ? (
        <>
          <span className="cat-name">{c.name}</span>
          <span className="cat-count">{used} dépense{used > 1 ? 's' : ''}</span>
          <button type="button" className="icon-link" aria-label={`Voir les dépenses : ${c.name}`} title="Voir les dépenses" onClick={() => onOpenOperations({ categoryId: c.id, label: c.name })}>
            <Icon name="list" size={15} />
          </button>
          <button type="button" className="btn-outline" aria-label={`Renommer ${c.name}`} onClick={() => setEditing(c.name)}>
            Renommer
          </button>
          <button type="button" className="btn-outline is-danger" aria-label={`Supprimer ${c.name}`} disabled={used > 0} title={used > 0 ? usedMessage(used) : undefined} onClick={remove}>
            Supprimer
          </button>
        </>
      ) : (
        <>
          <input className="text-input" autoFocus value={editing} aria-label={`Nouveau nom de ${c.name}`} onChange={e => { setEditing(e.target.value); setError(''); }} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(null); setError(''); } }} />
          <button type="button" className="btn-dark" onClick={save}>
            Enregistrer
          </button>
          <button type="button" className="btn-outline" onClick={() => { setEditing(null); setError(''); }}>
            Annuler
          </button>
          {error && <span className="cat-error" role="alert">{error}</span>}
        </>
      )}
    </div>
  );
}
