import { Fragment, useState } from 'react';
import { addCategory, deleteCategory, renameCategory, setCategoryEmoji, usedMessage } from '../../application/categories';
import { categoryBreakdown, categoryEmoji, categoryEntries, categoryUsage, EMOJI_CHOICES, parseCategoryName, pieSlices, type CategoryShare } from '../../domain/categories';
import { categoryIndicators, type IndicatorRow, type Variation } from '../../domain/categoryIndicators';
import { currentMonthKey, MONTH_SHORT, money, monthLabel, parseMonth, percent } from '../../domain/format';
import type { Category, MonthKey } from '../../domain/types';
import { CategoryPie } from '../components/CategoryPie';
import { Icon } from '../components/Icon';
import { Sparkline } from '../components/Sparkline';
import type { OperationsFocus } from './Expenses';
import { BAD, GOOD, tone } from '../components/tone';
import { newId, useStore } from '../state/store';

type CategoriesTab = 'repartition' | 'indicateurs' | 'gerer';
const TABS: { id: CategoriesTab; label: string }[] = [
  { id: 'indicateurs', label: 'Indicateurs' },
  { id: 'repartition', label: 'Répartition' },
  { id: 'gerer', label: 'Gérer' },
];

/**
 * Screen « Catégories » (spec 0046, RG27): three sub-tabs, « Indicateurs » (open by default: the month against its yearly average, spec 0052, read only), « Répartition » (the month's breakdown, read only) and « Gérer » (the list).
 * Same `tabs` look as the rest of the app; arrow keys move between the tabs. The last tab is not remembered: the screen opens on « Indicateurs ».
 */
export function CategoriesScreen({ month, onOpenOperations }: { month: MonthKey; onOpenOperations: (f: OperationsFocus) => void }) {
  const [tab, setTab] = useState<CategoriesTab>('indicateurs');
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
        {tab === 'indicateurs' && <IndicatorsSection key={month} month={month} />}
        {tab === 'repartition' && <BreakdownSection key={month} month={month} />}
        {tab === 'gerer' && <ManageSection onOpenOperations={onOpenOperations} />}
      </div>
    </>
  );
}

function BreakdownSection({ month }: { month: MonthKey }) {
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
                <ShareRow key={r.category?.id ?? 'none'} row={r} max={maxAmount} month={month} active={hover === (r.category?.id ?? 'none')} dimmed={hover !== null && hover !== (r.category?.id ?? 'none')} open={open === (r.category?.id ?? 'none')} onHover={setHover} onToggle={toggle} />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function ShareRow({ row, max, month, active, dimmed, open, onHover, onToggle }: { row: CategoryShare; max: number; month: MonthKey; active: boolean; dimmed: boolean; open: boolean; onHover: (id: string | null) => void; onToggle: (id: string) => void }) {
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
      </div>
      {open && (
        <EntryList id={`cat-detail-${id}`} name={name} month={month} categoryId={row.category?.id ?? null} />
      )}
    </div>
  );
}

/** Operations of a category for the month, listed in place. */
function EntryList({ id, name, month, categoryId }: { id: string; name: string; month: MonthKey; categoryId: string | null }) {
  const { data } = useStore();
  const entries = categoryEntries(data, month, categoryId);
  return (
    <ul id={id} className="cat-detail" aria-label={`Écritures : ${name}`}>
      {entries.length === 0 && <li className="muted">Aucune écriture</li>}
      {entries.map(e => (
        <li key={e.id}>
          <span className="cat-detail-date">{e.date.slice(8, 10)}/{e.date.slice(5, 7)}</span>
          <span className="cat-detail-label">{e.label}</span>
          <b className="num">{money(e.amount)}</b>
        </li>
      ))}
    </ul>
  );
}

const signed = (n: number, text: string) => (n > 0 ? `+${text}` : text);
const spendGapColor = (delta: number) => (delta > 0 ? BAD : delta < 0 ? GOOD : undefined);

/** « +85,00 € · +21,3 % » or « 0,00 € »: the sign is always written, never colour alone (RG5, RG6). */
const fullGapText = (v: Variation) => `${money(v.delta, true)}${v.isNew ? ' · nouveau' : v.percent !== null ? ` · ${signed(v.percent, percent(v.percent).replace('-', '−'))}` : ''}`;
/** What is shown: a new line (average 0) only says « nouveau »; the amount stays in the hidden text (`SrGap`). */
const gapText = (v: Variation) => (v.isNew ? 'nouveau' : fullGapText(v));
/** Hidden complement for screen readers: the visible « nouveau » plus this gives « nouveau, +X € », once. */
const SrGap = ({ v }: { v: Variation }) => (v.isNew ? <span className="sr-only">, {money(v.delta, true)}</span> : null);

/** Chip of a gap: red above the average, green below, neutral when equal (RG6). */
function GapChip({ v, cell = false }: { v: Variation; cell?: boolean }) {
  return (
    <span role={cell ? 'cell' : undefined} className={`state-chip ${v.isNew ? 'is-violet' : v.delta > 0 ? 'is-red' : v.delta < 0 ? 'is-green' : 'is-neutral'}`}>
      {gapText(v)}
      <SrGap v={v} />
    </span>
  );
}

const NO_REFERENCE = <span className="cat-noref">pas de référence</span>;
const NO_REFERENCE_CELL = (
  <span role="cell" className="cat-noref">
    pas de référence
  </span>
);
type SortKey = 'name' | 'amount' | 'average' | 'gap';
interface Sort { key: SortKey; dir: 'asc' | 'desc' }
const SORT_VALUE: Record<Exclude<SortKey, 'name'>, (r: IndicatorRow) => number | null> = {
  amount: r => r.amount,
  average: r => r.average,
  gap: r => r.variation?.delta ?? null,
};

/** Header with its two arrows: a click on the active arrow brings the default order (the one of the categories list) back. */
function SortHead({ label, k, sort, onSort, num = false }: { label: string; k: SortKey; sort: Sort | null; onSort: (s: Sort | null) => void; num?: boolean }) {
  const on = (dir: 'asc' | 'desc') => sort?.key === k && sort.dir === dir;
  const arrow = (dir: 'asc' | 'desc') => (
    <button type="button" className={`sort-btn${on(dir) ? ' is-on' : ''}`} aria-pressed={on(dir)} aria-label={`Trier par ${label.toLowerCase()} ${dir === 'asc' ? 'croissant' : 'décroissant'}`} onClick={() => onSort(on(dir) ? null : { key: k, dir })}>
      <Icon name={dir === 'asc' ? 'chevronUp' : 'chevronDown'} size={11} />
    </button>
  );
  return (
    <span role="columnheader" className={`sort-head${num ? ' num' : ''}`} aria-sort={sort?.key === k ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      {label}
      <span className="sort-arrows">{arrow('asc')}{arrow('desc')}</span>
    </span>
  );
}

const rowName = (r: IndicatorRow) => `${r.category && categoryEmoji(r.category) ? `${categoryEmoji(r.category)} ` : ''}${r.category?.name ?? 'Sans catégorie'}`;

/** « janv.–oct. 2026 », or « janv. 2026 » for a single month. */
function referenceLabel(months: MonthKey[]): string {
  const first = parseMonth(months[0]);
  const last = parseMonth(months[months.length - 1]);
  return months.length === 1 ? `${MONTH_SHORT[first.month]} ${first.year}` : `${MONTH_SHORT[first.month]}–${MONTH_SHORT[last.month]} ${last.year}`;
}

/** Tab « Indicateurs » (spec 0052): the month shown against the monthly average of its year, over the past months only. Read only. */
function IndicatorsSection({ month }: { month: MonthKey }) {
  const { data } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort | null>(null);
  const r = categoryIndicators(data, month, currentMonthKey());
  const s = r.summary;
  const hasReference = r.reference.length > 0;
  const labels = r.trendMonths.map(m => `${MONTH_SHORT[parseMonth(m).month]} ${m.slice(0, 4)}`);
  // Two parts side by side, in the order of the sort: the first half on the left, the rest (« Sans catégorie » last) on the right.
  const order = new Map((data.categories ?? []).map((c, i) => [c.id, i]));
  const byOrder = (a: IndicatorRow, b: IndicatorRow) => (order.get(a.category!.id) ?? 0) - (order.get(b.category!.id) ?? 0);
  const real = r.rows.filter(x => x.category !== null);
  const none = r.rows.filter(x => x.category === null);
  const dir = sort?.dir === 'desc' ? -1 : 1;
  const sortedReal = !sort
    ? [...real].sort(byOrder)
    : [...real].sort((a, b) => {
        if (sort.key === 'name') return dir * a.category!.name.localeCompare(b.category!.name, 'fr');
        const va = SORT_VALUE[sort.key](a);
        const vb = SORT_VALUE[sort.key](b);
        if (va === null || vb === null) return va === vb ? byOrder(a, b) : va === null ? 1 : -1; // no value: last, both ways
        return dir * (va - vb) || byOrder(a, b);
      });
  const rows = [...sortedReal, ...none];
  const half = Math.ceil(rows.length / 2);
  const parts = [rows.slice(0, half), rows.slice(half)].filter(p => p.length > 0);
  const toggle = (row: IndicatorRow) => setOpenId(o => (o === (row.category?.id ?? 'none') ? null : row.category?.id ?? 'none'));
  /** From the strip: unfold the category in the table below and bring it into view. */
  const open = (row: IndicatorRow) => {
    const id = row.category?.id ?? 'none';
    setOpenId(id);
    window.setTimeout(() => document.getElementById(`cat-ind-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
  };
  /** Rise / fall column of the strip: the category is a button (RG16); « — » and a message when there is nothing to click. */
  const pick = (label: string, row: IndicatorRow | null, empty: string) => {
    const clickable = hasReference && row !== null && row.variation !== null;
    return (
      <div className="dash-kpi">
        <div className="kpi-label">{label}</div>
        <div className="dash-val cat-kpi-name">
          {clickable ? (
            <button type="button" className="cat-kpi-btn" aria-label={`Voir les opérations : ${row.category?.name}`} title="Voir les opérations" onClick={() => open(row)}>
              {rowName(row)}
            </button>
          ) : (
            '—'
          )}
        </div>
        <div className="dash-sub" style={{ color: clickable ? (row.variation!.isNew ? 'var(--violet-ink)' : spendGapColor(row.variation!.delta)) : undefined }}>
          {clickable ? <>{gapText(row.variation!)}<SrGap v={row.variation!} /></> : hasReference ? empty : 'pas de référence'}
        </div>
      </div>
    );
  };
  return (
    <>
      <section className="panel cat-panel is-ind" aria-label="Indicateurs du mois">
        <div className="cat-head is-ind">
          <div className="cat-title">Indicateurs du mois</div>
          <span className="state-chip is-violet">{hasReference ? `Moyenne ${referenceLabel(r.reference)}` : 'Aucune référence'}</span>
        </div>
        {r.empty ? (
          <div className="empty">Aucune dépense pour {monthLabel(month)}</div>
        ) : (
          <div className="dash-kpis cat-kpis">
            <div className="dash-kpi is-hero">
              <div className="kpi-label">Dépenses du mois</div>
              <div className="dash-hero">{money(s.total)}</div>
              <div className="dash-sub">
                {s.average !== null && s.variation ? (
                  <>
                    moy. {money(s.average)} <GapChip v={s.variation} />
                  </>
                ) : (
                  NO_REFERENCE
                )}
              </div>
            </div>
            {pick('Plus forte hausse', s.topRise, 'Aucune catégorie au-dessus de sa moyenne')}
            {pick('Plus forte baisse', s.topFall, 'Aucune catégorie en dessous de sa moyenne')}
            <div className="dash-kpi">
              <div className="kpi-label">Sans catégorie</div>
              <div className="dash-val" style={{ color: s.uncategorizedAmount === 0 ? 'var(--muted)' : undefined }}>{money(s.uncategorizedAmount)}</div>
              <div className="dash-sub">
                {s.uncategorizedCount} écriture{s.uncategorizedCount > 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}
      </section>
      {!r.empty && (
        <section className="panel cat-panel is-ind" aria-label="Par catégorie">
          <div className="cat-title">Par catégorie</div>
          <div className="cat-ind-parts">
            {parts.map((part, i) => (
              <div key={i} role="table" aria-label={`Indicateurs par catégorie, partie ${i + 1}`}>
                <div role="rowgroup">
                  <div className="cat-ind-row is-head" role="row">
                    <span role="presentation" aria-hidden="true" />
                    <SortHead label="Catégorie" k="name" sort={sort} onSort={setSort} />
                    <SortHead label="Mois" k="amount" sort={sort} onSort={setSort} num />
                    <SortHead label="Moyenne" k="average" sort={sort} onSort={setSort} num />
                    <SortHead label="Écart" k="gap" sort={sort} onSort={setSort} />
                    <span role="columnheader">Tendance</span>
                    <span role="presentation" aria-hidden="true" />
                  </div>
                </div>
                <div role="rowgroup">
                  {part.map(row => {
                    const name = row.category?.name ?? 'Sans catégorie';
                    const color = row.category ? tone(row.category.hue).base : 'var(--neutral-fill)';
                    const id = row.category?.id ?? 'none';
                    const isOpen = openId === id;
                    return (
                      <Fragment key={id}>
                      <div id={`cat-ind-${id}`} className={`cat-ind-row${row.category ? '' : ' is-none'}`} role="row">
                        <span className="dot is-9" role="presentation" aria-hidden="true" style={{ background: color }} />
                        <span role="cell" className="cat-name" title={rowName(row)}>{rowName(row)}</span>
                        <b role="cell" className="num">{money(row.amount)}</b>
                        {row.average !== null && row.variation ? (
                          <>
                            <span role="cell" className="num cat-avg">{money(row.average)}</span>
                            <GapChip v={row.variation} cell />
                          </>
                        ) : (
                          <>
                            {NO_REFERENCE_CELL}
                            {NO_REFERENCE_CELL}
                          </>
                        )}
                        <span role="cell">
                          <Sparkline values={row.trend} labels={labels} color={color} width={86} />
                        </span>
                        <span role="cell">
                          <button type="button" className="icon-link" aria-expanded={isOpen} aria-controls={`cat-detail-${id}`} aria-label={`${isOpen ? 'Masquer' : 'Voir'} les opérations : ${name}`} title="Voir les opérations" onClick={() => toggle(row)}>
                            <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={15} />
                          </button>
                        </span>
                      </div>
                      {isOpen && <EntryList id={`cat-detail-${id}`} name={name} month={month} categoryId={row.category?.id ?? null} />}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
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
