import { AccountDot } from '../components/AccountPicker';
import { lineBalanceWarning, destinationAccounts, isIncome, isReceivedTransfer, lineProblem, NEW_REVENUE_LINE, natureLabel, changeMonth, changeNature, type LineNature, type PreviewLine } from '../../application/statementImport';
import { lineStates, STATE_LABEL, type LineState } from '../../application/importFilters';
import { bankAccount, fixedTransactionAccountId, isEnvelopeAccount } from '../../domain/bank';
import { dayLabel, money, monthLabel } from '../../domain/format';
import type { ImportTarget } from '../../domain/types';
import { expenseLineAccountId } from '../../domain/lineExpenses';
import { useStore } from '../state/store';

/** One line of the import preview: checkbox, date, label, amount, nature, target, month and state chips (spec 0013). */

const NATURES: LineNature[] = ['depense', 'retrait', 'interne', 'externe', 'a_qualifier'];
/** Hint of an entry whose label speaks of a transfer: informative, in the tooltip only (spec 0015, RG17). */
const TRANSFER_HINT = 'Virement possible : vérifiez que ce n’est pas un virement entre vos comptes.';
const CREDIT_NATURES: LineNature[] = ['revenu', 'recu'];

export const targetValue = (t: ImportTarget | null) => (t ? `${t.kind}:${t.kind === 'var' || t.kind === 'line' ? t.key : t.id}` : '');
export function targetFrom(value: string): ImportTarget | null {
  const i = value.indexOf(':');
  if (i < 0) return null;
  const [kind, id] = [value.slice(0, i), value.slice(i + 1)];
  return kind === 'var' ? { kind: 'var', key: id } : kind === 'line' ? { kind: 'line', key: id } : kind === 'env' ? { kind: 'env', id } : { kind: 'account', id };
}

/** Colour family of a state chip: blocking (yellow), duplicate (grey), informative (blue), month (violet), entry of money (green), neutral. */
const CHIP_TONE: Record<LineState, string> = {
  nouveau: 'neutral', a_rattacher: 'warn', a_qualifier: 'warn', compte_a_rattacher: 'warn', doublon: 'gray', doublon_probable: 'info',
  semblable_importee: 'info', saisie_manuelle: 'info', mois_different: 'violet', decochee: 'gray', entree: 'green', importee: 'gray', reel_remplace: 'info', date_hors_soldes: 'warn',
};
export const chipClass = (s: LineState) => `state-chip is-${CHIP_TONE[s]}`;

interface Props {
  line: PreviewLine;
  months: string[];
  onChange: (fn: (l: PreviewLine) => PreviewLine) => void;
  /** Written during this session: greyed, not editable, not checkable (RG70). */
  imported?: boolean;
  /** The budget refused this line at the last import (RG76). */
  failed?: boolean;
}

export function ImportRow({ line: l, months, onChange, imported = false, failed = false }: Props) {
  const { data } = useStore();
  // `credit`: an entry of money; `income`: one that is only shown (received transfer), never imported (spec 0015, RG17).
  const credit = isIncome(l);
  const income = isReceivedTransfer(l);
  const problem = lineProblem(data, l);
  const account = l.accountId ? bankAccount(data, l.accountId) : undefined;
  const expense = l.nature === 'depense' || l.nature === 'externe';
  // A line of an envelope's account can only be spent from that envelope (spec 0011, RG2).
  const fromEnvelope = isEnvelopeAccount(account);
  const monthLines = fromEnvelope ? [] : data.months[l.month]?.lines.filter(x => x.block === 'var') ?? [];
  // Fixed lines and credits of the month on the account of the imported line (spec 0014, RG3, RG17); none for an envelope's account.
  const fixedLines: [string, typeof monthLines][] = fromEnvelope || !l.accountId
    ? []
    : ([['Lignes fixes', 'fix'], ['Crédits', 'cre']] as const)
        .map(([title, block]) => [title, (data.months[l.month]?.lines ?? []).filter(x => x.block === block && expenseLineAccountId(data, x) === l.accountId)] as [string, typeof monthLines])
        .filter(([, group]) => group.length > 0);
  // Revenue lines of the month on the account of the imported entry (spec 0015, RG8); none for an envelope's account.
  const revenueLines = fromEnvelope || !l.accountId ? [] : (data.months[l.month]?.lines ?? []).filter(x => x.block === 'rev' && expenseLineAccountId(data, x) === l.accountId);
  const envelopes = fromEnvelope ? data.envelopes.filter(e => e.accountId === l.accountId) : data.envelopes;
  const destinations = destinationAccounts(data, l.nature, l.accountId);
  const boxAccount = l.target?.kind === 'var' ? fixedTransactionAccountId(data, { type: 'var', month: l.month, target: l.target.key }) : undefined;
  const states = lineStates(data, l, imported ? new Set([l.id]) : undefined).filter(s => s !== 'decochee');

  if (imported) {
    return (
      <div className="import-grid import-row is-off is-imported">
        <input type="checkbox" checked={false} disabled aria-label="Ligne déjà importée" />
        <span className="muted">{dayLabel(l.row.date.slice(0, 7), Number(l.row.date.slice(8, 10)))}</span>
        <span className="import-label" title={`${l.row.label} ${l.row.notes}`.trim()}>
          <span className="ellipsis">
            <AccountDot account={account} /> {l.row.label}
          </span>
        </span>
        <b className="num import-amount">{money(l.row.amount)}</b>
        <span className="muted">—</span>
        <span className="muted">—</span>
        <span className="muted">{monthLabel(l.month).split(' ')[0]}</span>
        <span className="import-chips">
          <span className={chipClass('importee')}>{STATE_LABEL.importee}</span>
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={`import-grid import-row${l.checked ? '' : ' is-off'}${!income && problem && l.accountId !== null && l.nature !== 'a_qualifier' ? ' is-blocked' : ''}${income ? ' is-income' : ''}`}>
        <input type="checkbox" checked={l.checked} disabled={income} aria-describedby={l.receivedHint ? `hint:${l.id}` : undefined} onChange={e => onChange(x => ({ ...x, checked: e.target.checked }))} aria-label={income ? 'Virement reçu, non importable' : 'Importer cette ligne'} />
        <span className="muted">{dayLabel(l.row.date.slice(0, 7), Number(l.row.date.slice(8, 10)))}</span>
        <span className="import-label" title={[`${l.row.label} ${l.row.notes}`.trim(), l.receivedHint ? TRANSFER_HINT : ''].filter(Boolean).join('\n')}>
          <span className="ellipsis">
            <AccountDot account={account} /> {l.row.label}
          </span>
          {l.row.notes && <span className="import-notes ellipsis">{l.row.notes}</span>}
          {/* The hint of a possible transfer is in the tooltip; screen readers get it here, with no effect on the layout (spec 0015, RG17). */}
          {l.receivedHint && <span className="sr-only" id={`hint:${l.id}`}>{TRANSFER_HINT}</span>}
        </span>
        <b className={`num import-amount${credit ? ' is-income' : ''}`}>{credit ? money(l.row.amount, true) : money(l.row.amount)}</b>
        {income ? (
          <>
            <span className="muted">—</span>
            <span className="muted">—</span>
            <span className="muted">{monthLabel(l.month).split(' ')[0]}</span>
          </>
        ) : (
          <>
            <select className="su-select" value={l.nature} onChange={e => onChange(x => changeNature(data, x, e.target.value as LineNature))}>
              {(credit ? CREDIT_NATURES : NATURES.filter(n => n !== 'a_qualifier' || l.nature === 'a_qualifier')).map(n => (
                <option key={n} value={n}>
                  {natureLabel(n)}
                </option>
              ))}
            </select>
            {l.nature === 'a_qualifier' ? (
              <span className="muted">—</span>
            ) : credit ? (
              <select className="su-select" value={targetValue(l.target)} onChange={e => onChange(x => ({ ...x, target: targetFrom(e.target.value) }))}>
                <option value="">Choisir…</option>
                {revenueLines.length > 0 && (
                  <optgroup label="Lignes de revenu">
                    {revenueLines.map(x => (
                      <option key={x.key} value={`line:${x.key}`}>
                        {x.name}
                      </option>
                    ))}
                  </optgroup>
                )}
                {!fromEnvelope && <option value={`line:${NEW_REVENUE_LINE}`}>+ Nouvelle ligne de revenu</option>}
              </select>
            ) : (
              <select className="su-select" value={targetValue(l.target)} onChange={e => onChange(x => ({ ...x, target: targetFrom(e.target.value) }))}>
                <option value="">Choisir…</option>
                {expense ? (
                  <>
                    {monthLines.length > 0 && (
                      <optgroup label="Lignes variables">
                        {monthLines.map(x => (
                          <option key={x.key} value={`var:${x.key}`}>
                            {x.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {fixedLines.map(([title, group]) => (
                      <optgroup key={title} label={title}>
                        {group.map(x => (
                          <option key={x.key} value={`line:${x.key}`}>
                            {x.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
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
          </>
        )}
        <span className="import-chips">
          {states.map(s => (
            <span key={s} className={chipClass(s)} title={s === 'date_hors_soldes' ? lineBalanceWarning(data, l) ?? undefined : undefined}>
              {s === 'a_rattacher' && problem ? problem : STATE_LABEL[s]}
            </span>
          ))}
          {failed && <span className="state-chip is-warn">Refusée par le budget : non importée</span>}
          {l.transferHint && <span className="state-chip is-info">Virement possible vers un de vos comptes</span>}
          {boxAccount && boxAccount !== l.accountId && <span className="state-chip is-neutral">Compte de la box : {bankAccount(data, boxAccount)?.name ?? ''}</span>}
        </span>
      </div>
      {l.target?.kind === 'line' && l.target.key === NEW_REVENUE_LINE && (
        <div className="import-remember">
          <span>Nom de la nouvelle ligne de revenu</span>
          <input className="text-input" value={l.newLineName} placeholder={l.row.label} onChange={e => onChange(x => ({ ...x, newLineName: e.target.value }))} aria-label="Nom de la nouvelle ligne de revenu" />
        </div>
      )}
      {(income || (l.target && l.nature !== 'a_qualifier' && !(l.target.kind === 'line' && l.target.key === NEW_REVENUE_LINE))) && (
        <div className="import-remember">
          {l.remember === null ? (
            <button type="button" className="link-btn" onClick={() => onChange(x => ({ ...x, remember: x.suggestedPattern }))}>
              Mémoriser…
            </button>
          ) : (
            <>
              <span>Mémoriser la règle</span>
              <input className="text-input" value={l.remember} onChange={e => onChange(x => ({ ...x, remember: e.target.value }))} aria-label="Motif de la règle" />
              <button type="button" className="link-btn" onClick={() => onChange(x => ({ ...x, remember: null }))}>
                Ne pas mémoriser
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
