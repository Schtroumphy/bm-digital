import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountDot } from '../components/AccountPicker';
import {
  accountProgress, choosePairAccount, destinationAccounts, hasPendingCorrections, importableIds, importMonths, isIncome, linkLines, natureLabel, prepareImport,
  previewCounts, refreshPreview, saveSkipChoices, sessionSummary, syncLinked, unlinkLine, validateImport, withLinkedPartners,
  type ImportBatch, type ImportPreview, type ImportSummary, type LineNature, type PreviewLine, type SessionTotals,
} from '../../application/statementImport';
import {
  applyBulk, emptyFilters, filterCounts, filterLines, isFilterActive, pruneFilters, setChecked, STATE_LABEL, STATE_ORDER,
  type BulkChange, type LineState, type PreviewFilters,
} from '../../application/importFilters';
import { linkableAccounts } from '../../application/accountLinks';
import type { StatementSource } from '../../application/ports';
import { bankAccount, isEnvelopeAccount } from '../../domain/bank';
import { money, monthLabel } from '../../domain/format';
import type { StatementReading } from '../../domain/statement';
import { isExpenseLineBlock } from '../../domain/lineExpenses';
import { newId, useStore } from '../state/store';
import { AccountLinks } from './AccountLinks';
import { ImportRow, targetFrom } from './ImportRow';

/*
 * Assistant « Importer des dépenses » (spec 0013): 1. file, 2. preview (accounts to match, filters, corrections), 3. summary.
 * Everything is kept here, in this component's state, until « Importer »: closing it changes no data (RG25). The list
 * « Correspondances de comptes » replaces the page without unmounting the assistant, so nothing is lost when it is shown (RG42).
 */

const ABANDON = 'Abandonner l’import en cours ? Les corrections seront perdues.';
const ABANDON_KEEP = `${ABANDON} Les lignes déjà importées sont conservées.`;
const NO_TOTALS: SessionTotals = { expenses: 0, revenues: 0, withdrawals: 0, internalTransfers: 0, linkedTransfers: 0, envelopeTransfers: 0, completedFaces: 0 };

/** « 2 dépenses, 1 retrait » : what a batch wrote, for the session banner. */
function describeBatch(b: ImportBatch): string {
  const part = (n: number, one: string, many: string) => (n > 0 ? [`${n} ${n > 1 ? many : one}`] : []);
  return [...part(b.expenses, 'dépense', 'dépenses'), ...part(b.revenues, 'entrée', 'entrées'), ...part(b.withdrawals, 'retrait', 'retraits'), ...part(b.internalTransfers, 'transfert interne', 'transferts internes'), ...part(b.envelopeTransfers, 'virement vers enveloppes', 'virements vers enveloppes'), ...part(b.completedFaces, 'ligne liée à un virement existant', 'lignes liées à un virement existant')].join(', ');
}
const NATURE_CHOICES: LineNature[] = ['depense', 'retrait', 'interne', 'externe', 'revenu'];

export function ImportWizard({ source, onClose }: { source: StatementSource; onClose: () => void }) {
  const { data, update } = useStore();
  const [reading, setReading] = useState<StatementReading | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [view, setView] = useState<'import' | 'links'>('import');
  // Filters (RG54), lines edited since the filters last changed (RG55), the last bulk action to undo (RG57) and its message.
  const [filters, setFilters] = useState<PreviewFilters>(emptyFilters());
  const [kept, setKept] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<PreviewLine[] | null>(null);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  // Session of the import (RG69 to RG80): lines written so far, those the budget refused, the totals, accounts marked « traité ».
  const [done, setDone] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [totals, setTotals] = useState<SessionTotals>(NO_TOTALS);
  const [lastBatch, setLastBatch] = useState<string | null>(null);
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [showTreated, setShowTreated] = useState(false);
  // `importing` only disables the buttons as a safeguard: the import is synchronous, so it is never seen on screen. The real protection
  // against a double import is `busy` and the idempotence of `validateImport` (RG77).
  const [importing, setImporting] = useState(false);
  const busy = useRef(false);
  const linksButton = useRef<HTMLButtonElement>(null);
  const fromLinks = useRef(false);
  const linksAtOpen = useRef<string>('');
  const scrollAtOpen = useRef(0);

  // The undo of a bulk action is only valid right after it: any other change of the preview would be lost by restoring it.
  const dropUndo = () => {
    setUndo(null);
    setBulkMessage(null);
  };
  const resetSession = () => {
    setDone(new Set());
    setFailed(new Set());
    setTotals(NO_TOTALS);
    setLastBatch(null);
    setMarked(new Set());
    setOpened(new Set());
    setShowTreated(false);
  };
  const resetFilters = () => {
    setFilters(emptyFilters());
    setKept(new Set());
  };
  const changeFilters = (f: PreviewFilters) => {
    setFilters(f);
    setKept(new Set());
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    const r = source.read(new Uint8Array(await file.arrayBuffer()));
    if (r.fileError) {
      setReading(null);
      setPreview(null);
      setFileError(r.fileError);
      return;
    }
    setReading(r);
    setFileName(file.name);
    setPreview(prepareImport(data, r));
    resetFilters();
    resetSession();
    dropUndo();
  };
  // After an import, changing the file loses the session's totals: the user confirms first (RG81).
  const askChangeFile = () => {
    if (done.size > 0 && !window.confirm('Le cumul de la session sera perdu sans récapitulatif ; les lignes déjà importées restent enregistrées.')) return;
    changeFile();
  };
  const changeFile = () => {
    setReading(null);
    setPreview(null);
    setFileError(null);
    resetFilters();
    resetSession();
    dropUndo();
  };
  const setLine = (id: string, fn: (l: PreviewLine) => PreviewLine) => {
    // The other face of a linked pair follows the edit (checked, month), or the pair is cut if the edit broke it (spec 0016, RG7, RG9).
    setPreview(p => (p ? { ...p, lines: syncLinked(data, p.lines.map(l => (l.id === id ? fn(l) : l)), id) } : p));
    setKept(k => new Set(k).add(id));
    dropUndo();
  };
  // A match chosen in the banner: the lines of that account are redone, the other corrections kept. Nothing is saved yet (RG25).
  const choosePair = (pairKey: string, accountId: string | null) => {
    if (!reading || !preview) return;
    const next = choosePairAccount(data, reading, preview, pairKey, accountId);
    setPreview(next);
    setFilters(f => pruneFilters(f, next.lines));
    dropUndo();
  };

  const openLinks = () => {
    linksAtOpen.current = JSON.stringify(data.importAccountLinks ?? []);
    scrollAtOpen.current = window.scrollY;
    fromLinks.current = true;
    setView('links');
  };
  // Back from the list, the focus returns to the button that opened it (accessibility).
  useEffect(() => {
    if (view === 'import' && fromLinks.current) {
      fromLinks.current = false;
      linksButton.current?.focus();
    }
  }, [view]);
  // Back to the import: the preview is redone only if a match changed in the list (RG43); the filters keep what still exists (RG54).
  const backToImport = () => {
    if (reading && preview && linksAtOpen.current !== JSON.stringify(data.importAccountLinks ?? [])) {
      const next = refreshPreview(data, reading, preview);
      setPreview(next);
      setFilters(f => pruneFilters(f, next.lines));
      setUndo(null);
    }
    setView('import');
    requestAnimationFrame(() => window.scrollTo(0, scrollAtOpen.current));
  };
  // Escape goes back from the list (RG41); a native drop-down that is open takes the key first and the page never sees it.
  const backRef = useRef(backToImport);
  backRef.current = backToImport;
  useEffect(() => {
    if (view !== 'links') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) backRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  // Closing asks nothing when everything the user did is written; corrections not imported are lost, so they are confirmed (RG79).
  const closeAssistant = () => {
    if (preview && reading && !summary) {
      const ask = done.size === 0 || hasPendingCorrections(data, reading, preview, done);
      if (ask && !window.confirm(done.size > 0 ? ABANDON_KEEP : ABANDON)) return;
    }
    onClose();
  };

  // One batch: the lines are written and marked « Importée » at the same time, then the preview is redone from the new data (RG75, RG77).
  // The batch runs on a copy first, only to know what it writes and to redo the preview; the real change is made by the store.
  const importLines = (ids: ReadonlySet<string>) => {
    if (!preview || !reading || busy.current || ids.size === 0) return;
    busy.current = true;
    setImporting(true);
    const options = { ids, done, marked };
    const copy = structuredClone(data);
    const batch = validateImport(copy, preview, newId, options);
    update(d => void validateImport(d, preview, newId, options));
    setDone(new Set([...done, ...batch.importedIds]));
    setFailed(f => new Set([...[...f].filter(id => !batch.importedIds.includes(id)), ...batch.failedIds]));
    setTotals(t => ({
      outsideBalances: (t.outsideBalances ?? 0) + batch.outsideBalances, expenses: t.expenses + batch.expenses, revenues: t.revenues + batch.revenues, withdrawals: t.withdrawals + batch.withdrawals, internalTransfers: t.internalTransfers + batch.internalTransfers,
      linkedTransfers: (t.linkedTransfers ?? 0) + batch.linkedTransfers, envelopeTransfers: (t.envelopeTransfers ?? 0) + batch.envelopeTransfers, completedFaces: (t.completedFaces ?? 0) + batch.completedFaces,
    }));
    // Never a silent click: say what happened when nothing was written, and how many lines the budget refused.
    const written = describeBatch(batch);
    setLastBatch(batch.importedIds.length === 0 ? `Aucune ligne importée${batch.failedIds.length ? ` : ${batch.failedIds.length} refusée${batch.failedIds.length > 1 ? 's' : ''} (lignes marquées)` : ' : les lignes cochées sont incomplètes, déjà importées ou liées à une ligne non cochée'}` : batch.failedIds.length ? `${written} · ${batch.failedIds.length} refusée${batch.failedIds.length > 1 ? 's' : ''}` : written);
    const next = refreshPreview(copy, reading, preview);
    setPreview(next);
    setFilters(f => pruneFilters(f, next.lines));
    setKept(new Set());
    dropUndo();
    busy.current = false;
    setImporting(false);
  };
  const finish = () => {
    if (!preview) return;
    // The « Ne pas importer » choices made since the last batch are remembered now (RG74).
    update(d => {
      saveSkipChoices(d, preview, newId);
    });
    setSummary(sessionSummary(preview, totals, done, failed));
  };

  const steps = (
    <ol className="import-steps" aria-label="Étapes de l’import">
      {['Fichier', 'Aperçu', 'Récapitulatif'].map((label, i) => {
        const current = summary ? 2 : preview ? 1 : 0;
        return (
          <li key={label} className={i === current ? 'is-current' : i < current ? 'is-done' : ''} aria-current={i === current ? 'step' : undefined}>
            <span className="import-step-num">{i + 1}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );

  if (view === 'links') {
    const backLabel = preview ? '← Retour à l’import' : '← Retour';
    return (
      <div className="panel-lg import-wizard">
        <div className="tx-head">
          <button type="button" className="btn-outline" onClick={backToImport}>
            {backLabel}
          </button>
          <div className="tx-title import-title">Correspondances de comptes</div>
          <button type="button" className="btn-quiet is-discreet" onClick={closeAssistant}>
            Fermer l’assistant
          </button>
        </div>
        <AccountLinks onBack={backToImport} backLabel={backLabel} />
      </div>
    );
  }

  const header = (
    <div className="tx-head">
      <div className="tx-title">Importer des dépenses</div>
      {!summary && (
        <button type="button" ref={linksButton} className="btn-quiet" onClick={openLinks}>
          Correspondances de comptes
        </button>
      )}
      <button type="button" className="btn-quiet" onClick={summary || done.size === 0 ? onClose : closeAssistant}>
        {summary ? 'Fermer' : 'Annuler'}
      </button>
    </div>
  );

  if (summary) {
    const groups: [string, [string, number][]][] = [
      ['Importées', [['Dépenses', summary.expenses], ['Entrées d’argent (revenus)', summary.revenues], ['Retraits', summary.withdrawals], ['Virements internes', summary.internalTransfers], ['dont liés (deux lignes)', summary.linkedTransfers], ['Virements vers enveloppes', summary.envelopeTransfers]]],
      ['Liées à un virement existant', [['Lignes qui complètent un virement déjà importé (aucune écriture ajoutée)', summary.completedFaces]]],
      ['Ignorées', [['Déjà importées (non réimportées)', summary.duplicatesSkipped], ['Comptes « Ne pas importer »', summary.accountsSkipped], ['Décochées ou incomplètes', summary.leftOut]]],
      ['À vérifier', [['Lignes en erreur', summary.errors], ['Importées avec une date hors soldes', summary.outsideBalances]]],
    ];
    const total = summary.expenses + summary.revenues + summary.withdrawals + summary.internalTransfers;
    return (
      <div className="panel-lg import-wizard">
        {header}
        {steps}
        <div className="import-body">
          <div className="import-done">
            ✓ {total} ligne{total > 1 ? 's' : ''} importée{total > 1 ? 's' : ''}
          </div>
          {groups.map(([title, rows]) => (
            <div key={title} className="import-summary-group">
              <div className="field-label">{title}</div>
              {rows.map(([label, n]) => (
                <div key={label} className="impact-row">
                  <span>{label}</span>
                  <b>{n}</b>
                </div>
              ))}
            </div>
          ))}
          <div className="import-actions">
            <button type="button" className="btn-outline" onClick={onClose}>
              Fermer
            </button>
            <button
              type="button"
              className="btn-dark"
              onClick={() => {
                setSummary(null);
                changeFile();
              }}
            >
              Importer un autre fichier
            </button>
          </div>
        </div>
      </div>
    );
  }

  const scope = { done, marked };
  const counts = preview ? previewCounts(data, preview, scope) : null;
  const months = importMonths(data);

  return (
    <div className="panel-lg import-wizard">
      {header}
      {steps}
      <div className="import-body">
        {!preview && (
          <div className="import-step import-empty">
            <b>Choisissez l’export Linxo (.csv, .tsv)</b>
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={e => void onFile(e.target.files?.[0])} />
            <div className="muted is-small">Les comptes sont rattachés au premier import.</div>
            {fileError && <div className="alert-box">{fileError}</div>}
          </div>
        )}
        {preview && counts && (
          <PreviewPane
            preview={preview}
            counts={counts}
            scope={scope}
            failed={failed}
            lastBatch={lastBatch}
            importing={importing}
            marked={marked}
            opened={opened}
            showTreated={showTreated}
            onShowTreated={setShowTreated}
            onMark={key => {
              setMarked(m => new Set(m).add(key));
              setOpened(o => {
                const n = new Set(o);
                n.delete(key);
                return n;
              });
            }}
            onReopen={key => {
              setMarked(m => {
                const n = new Set(m);
                n.delete(key);
                return n;
              });
              setOpened(o => new Set(o).add(key));
            }}
            onImport={importLines}
            onFinish={finish}
            months={months}
            fileName={fileName}
            filters={filters}
            kept={kept}
            undo={undo}
            bulkMessage={bulkMessage}
            onChangeFile={askChangeFile}
            onChoosePair={choosePair}
            onFilters={changeFilters}
            onLine={setLine}
            onLines={lines => {
              setPreview(p => (p ? { ...p, lines } : p));
              dropUndo();
            }}
            onBulk={(lines, before, message, ids) => {
              setPreview(p => (p ? { ...p, lines } : p));
              setUndo(before);
              setBulkMessage(message);
              setKept(k => new Set([...k, ...ids]));
            }}
            onUndo={() => {
              if (!undo) return;
              setPreview(p => (p ? { ...p, lines: undo } : p));
              setUndo(null);
              setBulkMessage(null);
            }}
            onCancel={done.size === 0 ? onClose : closeAssistant}
          />
        )}
      </div>
    </div>
  );
}

interface PaneProps {
  preview: ImportPreview;
  counts: ReturnType<typeof previewCounts>;
  scope: { done: Set<string>; marked: Set<string> };
  failed: Set<string>;
  lastBatch: string | null;
  importing: boolean;
  marked: Set<string>;
  opened: Set<string>;
  showTreated: boolean;
  onShowTreated: (v: boolean) => void;
  onMark: (key: string) => void;
  onReopen: (key: string) => void;
  onImport: (ids: ReadonlySet<string>) => void;
  onFinish: () => void;
  months: string[];
  fileName: string;
  filters: PreviewFilters;
  kept: Set<string>;
  undo: PreviewLine[] | null;
  bulkMessage: string | null;
  onChangeFile: () => void;
  onChoosePair: (key: string, accountId: string | null) => void;
  onFilters: (f: PreviewFilters) => void;
  onLine: (id: string, fn: (l: PreviewLine) => PreviewLine) => void;
  onLines: (lines: PreviewLine[]) => void;
  onBulk: (lines: PreviewLine[], before: PreviewLine[], message: string, ids: string[]) => void;
  onUndo: () => void;
  onCancel: () => void;
}

function PreviewPane(p: PaneProps) {
  const { data } = useStore();
  const { preview, counts, filters } = p;
  const { done, marked } = p.scope;
  const fc = useMemo(() => filterCounts(data, preview.lines, done), [data, preview.lines, done]);
  const shown = useMemo(() => filterLines(data, preview.lines, filters, p.kept, done), [data, preview.lines, filters, p.kept, done]);
  const shownIds = useMemo(() => new Set(shown.map(l => l.id)), [shown]);
  // What an import writes (RG68): the checked, complete lines that are shown (N); the ones a filter hides are K, all of them M.
  const importable = useMemo(() => importableIds(data, preview, p.scope), [data, preview, p.scope]);
  // A linked pair is imported together: its face hidden by a filter comes along with the shown one (spec 0016, RG7).
  const shownImportable = new Set([...withLinkedPartners(preview.lines, new Set([...importable].filter(id => shownIds.has(id))))].filter(id => importable.has(id)));
  const N = shownImportable.size;
  const M = importable.size;
  const K = M - N;
  const filterOn = isFilterActive(filters);
  const importedAny = done.size > 0;
  const progress = (key: string) => accountProgress(preview, key, done);
  const isTreated = (key: string) => marked.has(key) || progress(key).treated;
  const collapsed = (key: string) => isTreated(key) && !p.showTreated && !p.opened.has(key);
  const importedShown = filters.states.includes('importee');
  const toLink = preview.pairs.filter(x => !x.known);
  const grouped = new Set(preview.lines.map(l => l.pairKey)).size >= 2;
  const incomeTotal = preview.lines.filter(isIncome).reduce((s, l) => s + l.row.amount, 0);
  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const set = (patch: Partial<PreviewFilters>) => p.onFilters({ ...filters, ...patch });
  const pairLabel = (key: string) => {
    const pair = preview.pairs.find(x => x.key === key);
    return pair ? pair.accountName : key;
  };

  return (
    <>
      <div className="import-file">
        <span>
          Fichier : <b>{p.fileName}</b> · {preview.lines.length + preview.skipped} lignes
        </span>
        <button type="button" className="btn-quiet" onClick={p.onChangeFile}>
          Changer de fichier
        </button>
      </div>

      {!importedAny && p.lastBatch && <div className="import-session" role="alert">{p.lastBatch}</div>}
      {importedAny && (
        <div className="import-session" role="status">
          <span>
            {done.size} ligne{done.size > 1 ? 's' : ''} importée{done.size > 1 ? 's' : ''} pendant cette session{p.lastBatch ? ` · dernier import : ${p.lastBatch}` : ''}
          </span>
          <span style={{ flex: 1 }} />
          <button type="button" className="link-btn" onClick={() => set({ states: importedShown ? filters.states.filter(x => x !== 'importee') : ['importee'] })}>
            {importedShown ? 'Masquer les lignes importées' : 'Voir seulement les lignes importées'}
          </button>
          <label className="import-treated-toggle">
            <input type="checkbox" checked={p.showTreated} onChange={e => p.onShowTreated(e.target.checked)} /> Afficher les comptes traités
          </label>
        </div>
      )}

      {toLink.length > 0 && (
        <div className="import-pairs">
          <b>{counts.pairsToLink} compte{counts.pairsToLink > 1 ? 's' : ''} à rattacher</b>
          <span className="muted is-small">Ces comptes n’ont pas encore de correspondance. Choisissez le compte de l’app pour pouvoir importer leurs lignes.</span>
          {toLink.map(x => (
            <div key={x.key} className="import-pair">
              <span className="ellipsis" title={x.accountName}>
                {x.accountName}
              </span>
              <span className="muted ellipsis">{x.connectionName}</span>
              <span className="muted">
                {x.lines} ligne{x.lines > 1 ? 's' : ''}
              </span>
              <select className="su-select" value={x.key in preview.choices ? preview.choices[x.key] ?? 'skip' : ''} onChange={e => p.onChoosePair(x.key, e.target.value === 'skip' ? null : e.target.value)}>
                <option value="" disabled>
                  Choisir un compte…
                </option>
                {linkableAccounts(data).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {isEnvelopeAccount(a) ? ' (enveloppe)' : ''}
                  </option>
                ))}
                <option value="skip">Ne pas importer</option>
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="import-head-line">
        <b>Aperçu</b>
        <span className="muted">
          {preview.lines.length} lignes · {counts.duplicates} déjà importées · {counts.incomes} entrées d’argent{counts.incomes > 0 ? ` (${money(incomeTotal, true)})` : ''} · {preview.skipped} lignes de comptes ignorés · {counts.incomplete} à compléter · {preview.errors.length} erreurs
        </span>
      </div>
      {preview.errors.map(e => (
        <div key={e.record} className="alert-box">
          Enregistrement {e.record} : {e.reason}, non importé.
        </div>
      ))}

      {preview.lines.length === 0 ? (
        <div className="empty">Aucune dépense à importer dans ce fichier.</div>
      ) : (
        <>
          <div className="import-filters">
            <div className="import-filter-row">
              <input className="text-input" value={filters.text} placeholder="Rechercher (libellé, notes)" aria-label="Rechercher" onChange={e => set({ text: e.target.value })} />
              <FilterSelect label="Compte" value={filters.accounts[0] ?? ''} options={Object.entries(fc.accounts).map(([k, n]) => [k, `${pairLabel(k)} (${n})`])} onChange={v => set({ accounts: v ? [v] : [] })} />
              <FilterSelect label="Nature" value={filters.natures[0] ?? ''} options={Object.entries(fc.natures).map(([k, n]) => [k, `${natureLabel(k as LineNature)} (${n})`])} onChange={v => set({ natures: v ? [v as LineNature] : [] })} />
              <FilterSelect label="Mois" value={filters.months[0] ?? ''} options={Object.entries(fc.months).sort().map(([k, n]) => [k, `${monthLabel(k)} (${n})`])} onChange={v => set({ months: v ? [v] : [] })} />
              <FilterSelect label="Catégorie" value={filters.categories[0] ?? ''} options={Object.entries(fc.categories).map(([k, n]) => [k, `${k} (${n})`])} onChange={v => set({ categories: v ? [v] : [] })} />
            </div>
            <div className="import-filter-row">
              <span className="field-label">État</span>
              <button type="button" className={`filter-chip${filters.states.length === 0 ? ' is-on' : ''}`} aria-pressed={filters.states.length === 0} onClick={() => set({ states: [] })}>
                Tous <b>{fc.total}</b>
              </button>
              {STATE_ORDER.filter(s => fc.states[s] > 0 || filters.states.includes(s)).map(s => (
                <button key={s} type="button" className={`filter-chip${filters.states.includes(s) ? ' is-on' : ''}`} aria-pressed={filters.states.includes(s)} onClick={() => set({ states: toggle<LineState>(filters.states, s) })}>
                  {STATE_LABEL[s]} <b>{fc.states[s]}</b>
                </button>
              ))}
            </div>
            <div className="import-filter-row">
              <span className="muted">
                {shown.length} ligne{shown.length > 1 ? 's' : ''} affichée{shown.length > 1 ? 's' : ''} sur {preview.lines.length}
              </span>
              {isFilterActive(filters) && (
                <button type="button" className="link-btn" onClick={() => p.onFilters(emptyFilters())}>
                  Effacer les filtres
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button type="button" className="btn-quiet" onClick={() => p.onLines(setChecked(preview.lines, shownIds, true, done))}>
                Tout cocher
              </button>
              <button type="button" className="btn-quiet" onClick={() => p.onLines(setChecked(preview.lines, shownIds, false, done))}>
                Tout décocher
              </button>
              <BulkPanel shown={shown} preview={preview} done={done} onApply={p.onBulk} />
              {p.undo && (
                <button type="button" className="btn-quiet" onClick={p.onUndo}>
                  Annuler la dernière modification en masse
                </button>
              )}
            </div>
            {p.bulkMessage && <div className="muted is-small">{p.bulkMessage}</div>}
          </div>

          {(() => {
            const groups = grouped
              ? preview.pairs.filter(x => (collapsed(x.key) ? filters.accounts.length === 0 || filters.accounts.includes(x.key) : shown.some(l => l.pairKey === x.key)))
              : [null];
            const allTreated = grouped && preview.pairs.filter(x => preview.lines.some(l => l.pairKey === x.key)).every(x => isTreated(x.key));
            if (shown.length === 0 && (!grouped || groups.length === 0)) {
              return filterOn ? (
                <div className="empty">
                  Aucune ligne ne correspond aux filtres.{' '}
                  <button type="button" className="link-btn" onClick={() => p.onFilters(emptyFilters())}>
                    Effacer les filtres
                  </button>
                </div>
              ) : importedAny ? (
                <div className="empty">
                  Tout est traité.{' '}
                  <button type="button" className="link-btn" onClick={p.onFinish}>
                    Terminer l’import
                  </button>
                </div>
              ) : (
                <div className="empty">Aucune ligne à afficher.</div>
              );
            }
            return (
              <div className="import-table">
                {allTreated && (
                  <div className="empty">
                    Tout est traité.{' '}
                    <button type="button" className="link-btn" onClick={p.onFinish}>
                      Terminer l’import
                    </button>
                  </div>
                )}
                <div className="import-grid import-cols">
                  <span />
                  <span>Date</span>
                  <span>Libellé / notes</span>
                  <span className="num">Montant</span>
                  <span>Nature</span>
                  <span>Rattacher à</span>
                  <span>Mois</span>
                  <span>État</span>
                </div>
                {groups.map(pair => {
                  const rows = pair ? shown.filter(l => l.pairKey === pair.key) : shown;
                  const all = pair ? preview.lines.filter(l => l.pairKey === pair.key) : [];
                  const debits = all.filter(l => !isIncome(l));
                  const incomes = all.filter(isIncome);
                  const account = pair ? bankAccount(data, all.find(l => l.accountId)?.accountId ?? undefined) : undefined;
                  const prog = pair ? progress(pair.key) : null;
                  if (pair && collapsed(pair.key)) {
                    return (
                      <div key={pair.key} className="import-group-head is-treated">
                        <AccountDot account={account} />
                        <b>{pair.accountName}</b>
                        <span className="muted">
                          ✓ traité · {prog!.imported + prog!.alreadyImported} importée{prog!.imported + prog!.alreadyImported > 1 ? 's' : ''}
                        </span>
                        <span style={{ flex: 1 }} />
                        <button type="button" className="link-btn" onClick={() => p.onReopen(pair.key)}>
                          Rouvrir
                        </button>
                      </div>
                    );
                  }
                  return (
                    <div key={pair?.key ?? 'all'}>
                      {pair && (
                        <div className="import-group-head">
                          <AccountDot account={account} />
                          <b>{pair.accountName}</b>
                          <span className="muted">
                            {debits.length} dépense{debits.length > 1 ? 's' : ''}
                            {incomes.length > 0 && ` · ${incomes.length} entrée${incomes.length > 1 ? 's' : ''} (${money(incomes.reduce((s, l) => s + l.row.amount, 0), true)})`} · {money(debits.reduce((s, l) => s + l.row.amount, 0))} de dépenses
                            {' · '}
                            {isTreated(pair.key) ? 'traité' : `${prog!.remaining} ligne${prog!.remaining > 1 ? 's' : ''} restante${prog!.remaining > 1 ? 's' : ''}`}
                          </span>
                          <span style={{ flex: 1 }} />
                          {isTreated(pair.key) ? (
                            marked.has(pair.key) && (
                              <button type="button" className="link-btn" onClick={() => p.onReopen(pair.key)}>
                                Rouvrir
                              </button>
                            )
                          ) : (
                            <button type="button" className="link-btn" onClick={() => p.onMark(pair.key)}>
                              Marquer comme traité
                            </button>
                          )}
                        </div>
                      )}
                      {rows.map(l => (
                        <ImportRow
                          key={l.id} line={l} months={p.months} imported={done.has(l.id)} failed={p.failed.has(l.id)} onChange={fn => p.onLine(l.id, fn)}
                          lines={preview.lines} onUnlink={id => p.onLines(unlinkLine(preview.lines, id))}
                          onLink={(debitId, creditId) => {
                            const linked = linkLines(data, preview.lines, debitId, creditId);
                            if (linked) p.onLines(linked);
                          }}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>
      )}

      <div className="import-footer">
        <div className="import-footer-info">
          <span>
            <b>{counts.toImport}</b> lignes prêtes · {counts.duplicates} déjà importées · {counts.incomes} entrées d’argent · {counts.incomplete} à compléter
          </span>
          {filterOn && K > 0 && (
            <span className="import-hidden">
              {K} ligne{K > 1 ? 's' : ''} cochée{K > 1 ? 's' : ''} {K > 1 ? 'sont masquées' : 'est masquée'} par les filtres : ce bouton ne {K > 1 ? 'les' : 'la'} importe pas.
            </span>
          )}
        </div>
        {importedAny && (
          <button type="button" className="btn-outline" onClick={p.onFinish}>
            Terminer l’import
          </button>
        )}
        <button type="button" className="btn-outline" onClick={p.onCancel}>
          Annuler
        </button>
        {filterOn && K > 0 ? (
          <>
            <button type="button" className={`btn-dark${N === 0 || p.importing ? ' is-disabled' : ''}`} disabled={N === 0 || p.importing} onClick={() => p.onImport(shownImportable)}>
              Importer {N} ligne{N > 1 ? 's' : ''} affichée{N > 1 ? 's' : ''} cochée{N > 1 ? 's' : ''}
            </button>
            <button
              type="button"
              className={`btn-outline${p.importing ? ' is-disabled' : ''}`}
              disabled={p.importing}
              onClick={() => {
                if (window.confirm(`Importer toutes les lignes cochées (${M}), y compris les ${K} masquées par les filtres ?`)) p.onImport(importable);
              }}
            >
              Importer toutes les cochées ({M})…
            </button>
          </>
        ) : (
          <button type="button" className={`btn-dark${N === 0 || p.importing ? ' is-disabled' : ''}`} disabled={N === 0 || p.importing} onClick={() => p.onImport(importable)}>
            Importer {N} ligne{N > 1 ? 's' : ''}
          </button>
        )}
      </div>
    </>
  );
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <label className="filter-select">
      {label}
      <select className="su-select" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Tous</option>
        {options.map(([k, text]) => (
          <option key={k} value={k}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

/** « Appliquer à N lignes affichées » : a nature, a target and/or a month for the lines shown, with a confirmation and an undo (RG57). */
function BulkPanel({ shown, preview, done, onApply }: { shown: PreviewLine[]; preview: ImportPreview; done: ReadonlySet<string>; onApply: PaneProps['onBulk'] }) {
  const { data } = useStore();
  const [open, setOpen] = useState(false);
  const [nature, setNature] = useState('');
  const [target, setTarget] = useState('');
  const [month, setMonth] = useState('');
  const editable = shown;
  const natureNow = (nature || 'depense') as LineNature;
  const varLines = new Map<string, string>();
  const fixedLines = new Map<string, string>();
  const revenueLines = new Map<string, string>();
  for (const m of importMonths(data)) for (const l of data.months[m].lines) {
    if (l.block === 'var') varLines.set(l.key, l.name);
    else if (isExpenseLineBlock(l.block)) fixedLines.set(l.key, l.name);
    else if (l.block === 'rev') revenueLines.set(l.key, l.name);
  }
  const apply = () => {
    const change: BulkChange = {};
    if (nature) change.nature = nature as LineNature;
    const t = targetFrom(target);
    if (t) change.target = t;
    if (month) change.month = month;
    if (Object.keys(change).length === 0) return;
    const ids = new Set(shown.map(l => l.id));
    const result = applyBulk(data, preview.lines, ids, change, done);
    if (result.changed === 0) {
      window.alert('Aucune ligne ne peut être modifiée avec ces valeurs.');
      return;
    }
    const note = result.unchanged > 0 ? `, ${result.unchanged} laissée${result.unchanged > 1 ? 's' : ''} telle${result.unchanged > 1 ? 's' : ''} quelle${result.unchanged > 1 ? 's' : ''}` : '';
    if (!window.confirm(`${result.changed} ligne${result.changed > 1 ? 's' : ''} seront modifiées${note}. Continuer ?`)) return;
    onApply(result.lines, preview.lines, `${result.changed} ligne${result.changed > 1 ? 's' : ''} modifiée${result.changed > 1 ? 's' : ''} · ${result.unchanged} ligne${result.unchanged > 1 ? 's' : ''} non modifiée${result.unchanged > 1 ? 's' : ''}`, [...ids]);
    setOpen(false);
  };
  if (!open) {
    return (
      <button type="button" className="btn-outline" disabled={editable.length === 0} onClick={() => setOpen(true)}>
        Appliquer à {shown.length} ligne{shown.length > 1 ? 's' : ''} affichée{shown.length > 1 ? 's' : ''}…
      </button>
    );
  }
  return (
    <span className="import-bulk">
      <select className="su-select" value={nature} aria-label="Nature à appliquer" onChange={e => { setNature(e.target.value); setTarget(''); }}>
        <option value="">Nature : inchangée</option>
        {NATURE_CHOICES.map(n => (
          <option key={n} value={n}>
            {natureLabel(n)}
          </option>
        ))}
      </select>
      <select className="su-select" value={target} aria-label="Cible à appliquer" onChange={e => setTarget(e.target.value)}>
        <option value="">Cible : inchangée</option>
        {natureNow === 'revenu' ? (
          [...revenueLines].map(([k, name]) => (
            <option key={k} value={`line:${k}`}>
              {name}
            </option>
          ))
        ) : natureNow === 'retrait' || natureNow === 'interne' ? (
          destinationAccounts(data, natureNow, null).map(a => (
            <option key={a.id} value={`account:${a.id}`}>
              {a.name}
            </option>
          ))
        ) : (
          <>
            <optgroup label="Lignes variables">
              {[...varLines].map(([k, name]) => (
                <option key={k} value={`var:${k}`}>
                  {name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Lignes fixes et crédits">
              {[...fixedLines].map(([k, name]) => (
                <option key={k} value={`line:${k}`}>
                  {name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Enveloppes">
              {data.envelopes.map(e => (
                <option key={e.id} value={`env:${e.id}`}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          </>
        )}
      </select>
      <select className="su-select" value={month} aria-label="Mois à appliquer" onChange={e => setMonth(e.target.value)}>
        <option value="">Mois : inchangé</option>
        {importMonths(data).map(m => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <button type="button" className="btn-dark" onClick={apply}>
        Appliquer
      </button>
      <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
        Fermer
      </button>
    </span>
  );
}

