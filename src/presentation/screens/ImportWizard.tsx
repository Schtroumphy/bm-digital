import { useState } from 'react';
import { AccountDot } from '../components/AccountPicker';
import {
  changeMonth, changeNature, choosePairAccount, destinationAccounts, importMonths, lineProblem, natureLabel, prepareImport, previewCounts, validateImport,
  type ImportPreview, type ImportSummary, type LineNature, type PreviewLine,
} from '../../application/statementImport';
import { linkableAccounts } from '../../application/accountLinks';
import { AccountLinks } from './AccountLinks';
import type { StatementReading } from '../../domain/statement';
import type { StatementSource } from '../../application/ports';
import { bankAccount, fixedTransactionAccountId, isEnvelopeAccount } from '../../domain/bank';
import { money, monthLabel } from '../../domain/format';
import type { ImportTarget } from '../../domain/types';
import { newId, useStore } from '../state/store';

/*
 * Assistant « Importer des dépenses » (spec 0013): 1. file, 2. preview (accounts to match, corrections), 3. summary.
 * Everything is kept here, in this component's state, until « Importer »: closing it changes no data (RG25).
 */

const NATURES: LineNature[] = ['depense', 'retrait', 'interne', 'externe', 'a_qualifier'];

const targetValue = (t: ImportTarget | null) => (t ? `${t.kind}:${t.kind === 'var' ? t.key : t.id}` : '');
function targetFrom(value: string): ImportTarget | null {
  const i = value.indexOf(':');
  if (i < 0) return null;
  const [kind, id] = [value.slice(0, i), value.slice(i + 1)];
  return kind === 'var' ? { kind: 'var', key: id } : kind === 'env' ? { kind: 'env', id } : { kind: 'account', id };
}

const dayMonth = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function ImportWizard({ source, onClose }: { source: StatementSource; onClose: () => void }) {
  const { data, update } = useStore();
  const [reading, setReading] = useState<StatementReading | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [showLinks, setShowLinks] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setPreview(null);
    const r = source.read(new Uint8Array(await file.arrayBuffer()));
    if (r.fileError) {
      setReading(null);
      setFileError(r.fileError);
      return;
    }
    setReading(r);
    setPreview(prepareImport(data, r));
  };
  const setLine = (id: string, fn: (l: PreviewLine) => PreviewLine) =>
    setPreview(p => (p ? { ...p, lines: p.lines.map(l => (l.id === id ? fn(l) : l)) } : p));
  // A match chosen in the banner: the lines of that account are redone, the other corrections are kept. Nothing is saved yet (RG25).
  const choosePair = (pairKey: string, accountId: string | null) => {
    if (reading && preview) setPreview(choosePairAccount(data, reading, preview, pairKey, accountId));
  };

  const confirm = () => {
    if (!preview) return;
    // The summary comes from a copy (the real change runs later, inside the store); the counts are the same.
    setSummary(validateImport(structuredClone(data), preview, newId));
    update(d => void validateImport(d, preview, newId));
  };

  const header = (
    <div className="tx-head">
      <div className="tx-title">Importer des dépenses</div>
      {!summary && !showLinks && (
        <button type="button" className="btn-quiet" onClick={() => setShowLinks(true)}>
          Correspondances de comptes
        </button>
      )}
      <button type="button" className="btn-quiet" onClick={onClose}>
        {summary ? 'Fermer' : 'Annuler'}
      </button>
    </div>
  );

  if (showLinks) {
    return (
      <div className="panel-lg import-wizard">
        {header}
        <AccountLinks onBack={() => setShowLinks(false)} />
      </div>
    );
  }

  if (summary) {
    const rows: [string, number][] = [
      ['Dépenses importées', summary.expenses],
      ['Retraits importés', summary.withdrawals],
      ['Transferts internes importés', summary.internalTransfers],
      ['Doublons ignorés', summary.duplicatesSkipped],
      ['Entrées ignorées', summary.creditsIgnored],
      ['Lignes de comptes « Ne pas importer »', summary.accountsSkipped],
      ['Lignes décochées ou incomplètes', summary.leftOut],
      ['Lignes en erreur', summary.errors],
    ];
    return (
      <div className="panel-lg import-wizard">
        {header}
        <div className="import-body">
          <div className="field-label">Étape 3 · Récapitulatif</div>
          {rows.map(([label, n]) => (
            <div key={label} className="impact-row">
              <span>{label}</span>
              <b>{n}</b>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const counts = preview ? previewCounts(data, preview) : null;
  const months = importMonths(data);
  const toLink = preview ? preview.pairs.filter(p => !p.known) : [];

  return (
    <div className="panel-lg import-wizard">
      {header}
      <div className="import-body">
        <div className="import-step">
          <div className="field-label">Étape 1 · Fichier</div>
          <div className="import-controls">
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values" onChange={e => void onFile(e.target.files?.[0])} />
          </div>
          {fileError && <div className="alert-box">{fileError}</div>}
        </div>

        {preview && counts && (
          <>
            {toLink.length > 0 && (
              <div className="import-pairs">
                <b>{counts.pairsToLink} compte{counts.pairsToLink > 1 ? 's' : ''} à rattacher</b>
                {toLink.map(p => (
                  <div key={p.key} className="import-pair">
                    <span className="ellipsis" title={p.accountName}>
                      {p.accountName}
                    </span>
                    <span className="muted ellipsis">{p.connectionName}</span>
                    <span className="muted">{p.lines} ligne{p.lines > 1 ? 's' : ''}</span>
                    <select
                      className="su-select"
                      value={p.key in preview.choices ? preview.choices[p.key] ?? 'skip' : ''}
                      onChange={e => choosePair(p.key, e.target.value === 'skip' ? null : e.target.value)}
                    >
                      <option value="" disabled>
                        Choisir un compte…
                      </option>
                      {linkableAccounts(data).map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name}{isEnvelopeAccount(a) ? ' (enveloppe)' : ''}
                        </option>
                      ))}
                      <option value="skip">Ne pas importer</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
            <div className="field-label">
              Étape 2 · Aperçu : {preview.lines.length} lignes · {counts.duplicates} doublons · {preview.ignoredCredits} entrées ignorées · {preview.skipped} lignes de comptes ignorés · {counts.incomplete} à compléter · {preview.errors.length} erreurs
            </div>
            {preview.errors.map(e => (
              <div key={e.record} className="alert-box">
                Enregistrement {e.record} : {e.reason}, non importé.
              </div>
            ))}
            {preview.lines.length === 0 && <div className="empty">Aucune dépense à importer dans ce fichier.</div>}
            {preview.lines.length > 0 && (
              <div className="import-table">
                <div className="import-grid import-cols">
                  <span />
                  <span>Date</span>
                  <span>Libellé</span>
                  <span className="num">Montant</span>
                  <span>Nature</span>
                  <span>Rattacher à</span>
                  <span>Mois</span>
                  <span>État</span>
                </div>
                {preview.lines.map(l => (
                  <ImportRow key={l.id} line={l} months={months} onChange={fn => setLine(l.id, fn)} />
                ))}
              </div>
            )}
            <div className="import-actions">
              <button type="button" className="btn-outline" onClick={onClose}>
                Annuler
              </button>
              <button type="button" className={`btn-dark${counts.toImport === 0 ? ' is-disabled' : ''}`} disabled={counts.toImport === 0} onClick={confirm}>
                Importer {counts.toImport} ligne{counts.toImport > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ImportRow({ line: l, months, onChange }: { line: PreviewLine; months: string[]; onChange: (fn: (l: PreviewLine) => PreviewLine) => void }) {
  const { data } = useStore();
  const problem = lineProblem(data, l);
  const account = l.accountId ? bankAccount(data, l.accountId) : undefined;
  const expense = l.nature === 'depense' || l.nature === 'externe';
  // A line of an envelope's account can only be spent from that envelope (spec 0011, RG2).
  const fromEnvelope = isEnvelopeAccount(account);
  const monthLines = fromEnvelope ? [] : data.months[l.month]?.lines.filter(x => x.block === 'var') ?? [];
  const envelopes = fromEnvelope ? data.envelopes.filter(e => e.accountId === l.accountId) : data.envelopes;
  const destinations = destinationAccounts(data, l.nature, l.accountId);
  const boxAccount = l.target?.kind === 'var' ? fixedTransactionAccountId(data, { type: 'var', month: l.month, target: l.target.key }) : undefined;

  const states = [
    l.duplicate && 'Doublon',
    l.similarManual && 'Saisie manuelle semblable',
    l.similarImported === 'probable' && 'Doublon probable',
    l.similarImported === 'semblable' && 'Semblable déjà importée',
    l.transferHint && 'Virement possible vers un de vos comptes',
    l.month !== l.row.date.slice(0, 7) && 'Mois différent de la date',
    boxAccount && boxAccount !== l.accountId && `Compte de la box : ${bankAccount(data, boxAccount)?.name ?? ''}`,
    problem,
  ].filter(Boolean);

  return (
    <>
      <div className={`import-grid import-row${l.checked ? '' : ' is-off'}`}>
        <input type="checkbox" checked={l.checked} onChange={e => onChange(x => ({ ...x, checked: e.target.checked }))} aria-label="Importer cette ligne" />
        <span className="muted">{dayMonth(l.row.date)}</span>
        <span className="ellipsis" title={`${l.row.label} ${l.row.notes}`.trim()}>
          <AccountDot account={account} /> {l.row.label}
        </span>
        <b className="num">{money(l.row.amount)}</b>
        <select className="su-select" value={l.nature} onChange={e => onChange(x => changeNature(data, x, e.target.value as LineNature))}>
          {NATURES.filter(n => n !== 'a_qualifier' || l.nature === 'a_qualifier').map(n => (
            <option key={n} value={n}>
              {natureLabel(n)}
            </option>
          ))}
        </select>
        {l.nature === 'a_qualifier' ? (
          <span className="muted">—</span>
        ) : (
          <select className="su-select" value={targetValue(l.target)} onChange={e => onChange(x => ({ ...x, target: targetFrom(e.target.value) }))}>
            <option value="">Choisir…</option>
            {expense ? (
              <>
                <optgroup label="Lignes variables">
                  {monthLines.map(x => (
                    <option key={x.key} value={`var:${x.key}`}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Enveloppes">
                  {envelopes.map(e => (
                    <option key={e.id} value={`env:${e.id}`}>
                      {e.name}
                    </option>
                  ))}
                </optgroup>
              </>
            ) : (
              destinations.map(a => (
                <option key={a.id} value={`account:${a.id}`}>
                  {a.name}
                </option>
              ))
            )}
          </select>
        )}
        <select className="su-select" value={l.month} onChange={e => onChange(x => changeMonth(data, x, e.target.value))}>
          {!months.includes(l.month) && <option value={l.month}>{monthLabel(l.month)} (indisponible)</option>}
          {months.map(m => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
        <span className={`import-state${problem || l.duplicate ? ' is-warn' : ''}`}>{states.join(' · ') || 'Nouveau'}</span>
      </div>
      {l.target && l.nature !== 'a_qualifier' && (
        <label className="import-remember">
          <input type="checkbox" checked={l.remember !== null} onChange={e => onChange(x => ({ ...x, remember: e.target.checked ? x.suggestedPattern : null }))} />
          Mémoriser la règle
          {l.remember !== null && <input className="text-input" value={l.remember} onChange={e => onChange(x => ({ ...x, remember: e.target.value }))} />}
        </label>
      )}
    </>
  );
}
