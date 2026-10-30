import { AccountDot } from '../components/AccountPicker';
import { OFF_BUDGET_CHOICE } from '../components/AssignPicker';
import { lineBalanceWarning, canUseEnvelopesPool, destinationAccounts, linkCandidates, linkedPartner, transferAttachment, isIncome, isLocked, lineProblem, NEW_REVENUE_LINE, natureLabel, changeMonth, changeNature, natureOptions, withValidAssignment, type LineNature, type PreviewLine } from '../../application/statementImport';
import { lineStates, STATE_LABEL, type LineState } from '../../application/importFilters';
import { assignableAccounts, bankAccount, fixedTransactionAccountId, isEnvelopeAccount, savingsExpenseLines } from '../../domain/bank';
import { ENVELOPES_ID, ENVELOPES_LABEL } from '../../domain/internalTransfers';
import { dayLabel, money, monthLabel } from '../../domain/format';
import type { ImportTarget, MovementTarget } from '../../domain/types';
import { expenseLineAccountId } from '../../domain/lineExpenses';
import { transferItems } from '../../domain/transfers';
import { useStore } from '../state/store';

const isEnvelopesTarget = (l: PreviewLine) => l.target?.kind === 'account' && l.target.id === ENVELOPES_ID;

/** One line of the import preview: checkbox, date, label, amount, nature, target, month and state chips (spec 0013). */

/** Hint of an entry whose label speaks of a transfer: informative, in the tooltip only (spec 0015, RG17). */
const TRANSFER_HINT = 'Virement possible : vérifiez que ce n’est pas un virement entre vos comptes.';

const LOCKED_HELP = 'Déjà importée dans votre budget : elle ne peut pas être importée à nouveau. Pour une dépense réellement identique, la saisir à la main dans l’onglet Saisie.';

export const targetValue = (t: ImportTarget | null) => (t ? `${t.kind}:${t.kind === 'var' || t.kind === 'line' || t.kind === 'savings' ? t.key : t.id}` : '');
export function targetFrom(value: string): ImportTarget | null {
  const i = value.indexOf(':');
  if (i < 0) return null;
  const [kind, id] = [value.slice(0, i), value.slice(i + 1)];
  return kind === 'var' ? { kind: 'var', key: id } : kind === 'line' ? { kind: 'line', key: id } : kind === 'savings' ? { kind: 'savings', key: id } : kind === 'env' ? { kind: 'env', id } : { kind: 'account', id };
}

/** The budget item a transfer is attached to, from a select value; null for « Aucun » (spec 0019). */
function movementTargetFrom(value: string): MovementTarget | null {
  const t = targetFrom(value);
  return t?.kind === 'line' || t?.kind === 'env' ? t : null;
}

/** Colour family of a state chip: blocking (yellow), duplicate (grey), informative (blue), month (violet), entry of money (green), neutral. */
const CHIP_TONE: Record<LineState, string> = {
  nouveau: 'neutral', a_rattacher: 'warn', a_qualifier: 'warn', compte_a_rattacher: 'warn', doublon: 'gray', doublon_probable: 'info',
  semblable_importee: 'info', saisie_manuelle: 'info', mois_different: 'violet', decochee: 'gray', entree: 'green', importee: 'gray', date_hors_soldes: 'warn',
  lie: 'info', une_face: 'neutral', complete_virement: 'info', appariement_ambigu: 'warn',
};
export const chipClass = (s: LineState) => `state-chip is-${CHIP_TONE[s]}`;

interface Props {
  line: PreviewLine;
  months: string[];
  onChange: (fn: (l: PreviewLine) => PreviewLine) => void;
  /** Written during this session: struck through, not editable, not checkable (RG70, RG82). */
  imported?: boolean;
  /** The budget refused this line at the last import (RG76). */
  failed?: boolean;
  /** All the lines of the preview: to find the other face of a linked pair and the credits a debit can be linked to (spec 0016, RG7, RG9). */
  lines?: PreviewLine[];
  /** Links a debit to a credit by hand / unlinks a pair (spec 0016, RG9). */
  onLink?: (debitId: string, creditId: string) => void;
  onUnlink?: (id: string) => void;
}

export function ImportRow({ line: l, months, onChange: onChangeRaw, imported = false, failed = false, lines = [], onLink, onUnlink }: Props) {
  const { data } = useStore();
  // Every edit passes through here: an assignment is dropped when the nature or the target no longer allows it (spec 0028, RG17).
  const onChange = (fn: (l: PreviewLine) => PreviewLine) => onChangeRaw(x => withValidAssignment(fn(x)));
  // `credit`: an entry of money, a « Revenu » or a « Virement interne » received (spec 0016).
  const credit = isIncome(l);
  const partner = linkedPartner(lines, l);
  const candidates = !credit && !partner && onLink ? linkCandidates(lines, l.id) : [];
  const pool = canUseEnvelopesPool(data, l.nature, l.accountId);
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
  // Savings lines of the month tied to the savings account of the imported line: an expense funded by savings (spec 0035, RG1); none for another kind of account.
  const savingsLines = l.accountId ? savingsExpenseLines(data, l.month, l.accountId) : [];
  const envelopes = fromEnvelope ? data.envelopes.filter(e => e.accountId === l.accountId) : data.envelopes;
  const destinations = destinationAccounts(data, l.nature, l.accountId);
  const boxAccount = l.target?.kind === 'var' ? fixedTransactionAccountId(data, { type: 'var', month: l.month, target: l.target.key }) : undefined;
  // A withdrawal or internal transfer can stand for a budget item of its destination account; the default is proposed (spec 0019, RG15, CA23).
  // « Affecter à » (spec 0028, RG17): a variable or fixed expense, or a revenue, can be assigned to a savings account; not an envelope expense nor a transfer.
  const assignable = (l.nature === 'depense' || l.nature === 'externe' ? l.target?.kind === 'var' || l.target?.kind === 'line' : l.nature === 'revenu' && !!l.target) && l.accountId !== null;
  const assignChoices = assignable ? assignableAccounts(data, l.accountId ?? undefined) : [];
  const transferChoices = (l.nature === 'retrait' || l.nature === 'interne') && l.target?.kind === 'account' && !isEnvelopesTarget(l) ? transferItems(data, l.month).filter(i => i.toAccountId === (l.target as { id: string }).id) : [];
  const attached = transferAttachment(data, l);
  const attachValue = attached ? (attached.kind === 'line' ? `line:${attached.key}` : `env:${attached.id}`) : '';
  const states = lineStates(data, l, imported ? new Set([l.id]) : undefined).filter(s => s !== 'decochee');

  // Done lines (imported in this session, or already imported before) are shown struck through and locked (spec 0013, RG82, RG83, RG88).
  if (imported || isLocked(l)) {
    const state: LineState = imported ? 'importee' : 'doublon';
    return (
      <div className="import-grid import-row is-done" title={imported ? undefined : LOCKED_HELP}>
        <input type="checkbox" checked={false} disabled aria-label={imported ? 'Ligne déjà importée' : 'Déjà importée, non réimportable'} />
        <span className="muted">{dayLabel(l.row.date.slice(0, 7), Number(l.row.date.slice(8, 10)))}</span>
        <span className="import-label" title={`${l.row.label} ${l.row.notes}`.trim()}>
          <span className="ellipsis">
            <AccountDot account={account} /> <s>{l.row.label}</s>
          </span>
          {l.row.notes && <span className="import-notes ellipsis"><s>{l.row.notes}</s></span>}
        </span>
        <b className="num import-amount"><s>{money(l.row.amount)}</s></b>
        <span className="muted">—</span>
        <span className="muted">—</span>
        <span className="muted">{monthLabel(l.month).split(' ')[0]}</span>
        <span className="import-chips">
          <span className={chipClass(state)}>{STATE_LABEL[state]}</span>
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={`import-grid import-row${l.checked ? '' : ' is-off'}${problem && l.accountId !== null && l.nature !== 'a_qualifier' ? ' is-blocked' : ''}${partner ? ' is-paired' : ''}`}>
        <input type="checkbox" checked={l.checked} aria-describedby={l.receivedHint ? `hint:${l.id}` : undefined} onChange={e => onChange(x => ({ ...x, checked: e.target.checked }))} aria-label={partner ? 'Importer ce virement (les deux lignes)' : 'Importer cette ligne'} />
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
        {(
          <>
            <select className="su-select" value={l.nature} onChange={e => onChange(x => changeNature(data, x, e.target.value as LineNature))}>
              {natureOptions(l).map(n => (
                <option key={n} value={n}>
                  {natureLabel(n)}
                </option>
              ))}
            </select>
            {l.nature === 'a_qualifier' ? (
              <span className="muted">—</span>
            ) : credit && l.nature === 'recu' ? (
              // Received transfer: where the money comes from (spec 0016, RG12, RG27). « Enveloppes (global) » is not an account.
              <select className="su-select" value={targetValue(l.target)} aria-label="Depuis" onChange={e => onChange(x => ({ ...x, target: targetFrom(e.target.value) }))}>
                <option value="">Depuis…</option>
                <optgroup label="Comptes">
                  {destinations.map(a => (
                    <option key={a.id} value={`account:${a.id}`}>
                      {a.name}
                    </option>
                  ))}
                </optgroup>
                {pool && (
                  <optgroup label="Enveloppes">
                    <option value={`account:${ENVELOPES_ID}`}>{ENVELOPES_LABEL}</option>
                  </optgroup>
                )}
              </select>
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
                    {savingsLines.length > 0 && (
                      <optgroup label="Sorties d’épargne du compte" title="Dépense financée par l’épargne : baisse l’épargne réelle, pas le disponible">
                        {savingsLines.map(x => (
                          <option key={x.key} value={`savings:${x.key}`} title="Dépense financée par l’épargne : baisse l’épargne réelle, pas le disponible">
                            {x.name} (sortie d’épargne)
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Enveloppes">
                      {envelopes.map(e => (
                        <option key={e.id} value={`env:${e.id}`}>
                          {e.name}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  <>
                    {destinations.map(a => (
                      <option key={a.id} value={`account:${a.id}`}>
                        {a.name}
                      </option>
                    ))}
                    {/* « Enveloppes (global) »: a choice of destination, not an account (spec 0016, RG24). */}
                    {pool && <option value={`account:${ENVELOPES_ID}`}>{ENVELOPES_LABEL}</option>}
                  </>
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
          {partner && onUnlink && (
            <button type="button" className="link-btn" onClick={() => onUnlink(l.id)} title="Rendre les deux lignes indépendantes">
              Délier
            </button>
          )}
          {candidates.length > 0 && onLink && (
            <select className="su-select" value="" aria-label="Relier à une entrée" onChange={e => e.target.value && onLink(l.id, e.target.value)}>
              <option value="">Relier à une entrée…</option>
              {candidates.map(c => (
                <option key={c.id} value={c.id}>
                  {dayLabel(c.row.date.slice(0, 7), Number(c.row.date.slice(8, 10)))} · {c.row.label} · {bankAccount(data, c.accountId ?? undefined)?.name ?? ''}
                </option>
              ))}
            </select>
          )}
          {boxAccount && boxAccount !== l.accountId && <span className="state-chip is-neutral">Compte de la box : {bankAccount(data, boxAccount)?.name ?? ''}</span>}
        </span>
      </div>
      {l.target?.kind === 'line' && l.target.key === NEW_REVENUE_LINE && (
        <div className="import-remember">
          <span>Nom de la nouvelle ligne de revenu</span>
          <input className="text-input" value={l.newLineName} placeholder={l.row.label} onChange={e => onChange(x => ({ ...x, newLineName: e.target.value }))} aria-label="Nom de la nouvelle ligne de revenu" />
        </div>
      )}
      {l.nature === 'revenu' && l.target && !(l.target.kind === 'line' && l.target.key === NEW_REVENUE_LINE) && (
        <div className="import-remember">
          <label htmlFor={`source:${l.id}`}>Source</label>
          <input id={`source:${l.id}`} className="text-input" value={l.source ?? ''} placeholder={l.row.label} onChange={e => onChange(x => ({ ...x, source: e.target.value }))} aria-label="Source du revenu" />
        </div>
      )}
      {assignable && (
        <div className="import-remember">
          <label htmlFor={`assign:${l.id}`}>Budget</label>
          <select
            id={`assign:${l.id}`}
            className="su-select"
            value={l.assignedAccountId ?? (l.offBudget ? OFF_BUDGET_CHOICE : '')}
            onChange={e => {
              const v = e.target.value;
              onChange(x => {
                const { assignedAccountId: _a, offBudget: _o, ...rest } = x;
                return v === OFF_BUDGET_CHOICE ? { ...rest, offBudget: true } : v ? { ...rest, assignedAccountId: v } : rest;
              });
            }}
          >
            <option value="">Compté au budget</option>
            <option value={OFF_BUDGET_CHOICE}>Hors budget</option>
            {assignChoices.map(a => (
              <option key={a.id} value={a.id}>Affecter à {a.name}</option>
            ))}
          </select>
          {(l.assignedAccountId || l.offBudget) && <span className="assigned-hint">Hors budget : n’entre pas dans les chiffres du budget.</span>}
        </div>
      )}
      {transferChoices.length > 0 && (
        <div className="import-remember">
          <label htmlFor={`attach:${l.id}`}>Rattacher le transfert à</label>
          <select id={`attach:${l.id}`} className="su-select" value={attachValue} onChange={e => onChange(x => ({ ...x, attach: movementTargetFrom(e.target.value) }))}>
            <option value="">Aucun (transfert libre)</option>
            {transferChoices.map(i => (
              <option key={targetValue(i.target)} value={targetValue(i.target)}>{i.label}</option>
            ))}
          </select>
        </div>
      )}
      {l.target && l.nature !== 'a_qualifier' && !(l.target.kind === 'line' && l.target.key === NEW_REVENUE_LINE) && (
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
