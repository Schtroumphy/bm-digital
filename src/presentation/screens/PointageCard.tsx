import { useRef, useState } from 'react';
import { cancelAdjustment, createAdjustment, setAccountStatement } from '../../application/checkoff';
import { IGNORED_REASON, accountPointage, balanceDateBounds, effectiveDueDay, lateCount, pointageAccounts, shortDate, validateBalanceDate, type AccountPointage, type BalanceDateError, type PendingLine } from '../../domain/checkoff';
import { addMonths, money, monthLabel, monthName, parseAmount, parseMonth, rawNumber } from '../../domain/format';
import type { MonthKey } from '../../domain/types';
import { AccountDot } from '../components/AccountPicker';
import { EditableAmount } from '../components/Editable';
import { Icon } from '../components/Icon';
import { BAD, GOOD, gapColor, HUE, MUTED, toneVars } from '../components/tone';
import { newId, useStore } from '../state/store';

/** « Pointage par compte » (spec 0009): Reste à sortir, Solde estimé, Marge, relevé et écart of each account, with a detail that unfolds on click. */
export function PointageCard({ month, locked, today }: { month: MonthKey; locked: boolean; today: string }) {
  const { data, ledger } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const late = lateCount(data, month, today);
  const accounts = pointageAccounts(data, month);
  return (
    <div className="panel block" style={toneVars(HUE.obj)}>
      <div className="block-head">
        <div className="block-icon">
          <Icon name="transfer" size={14} />
        </div>
        <div className="block-title">Pointage par compte</div>
        <div style={{ flex: 1 }} />
        {late > 0 && (
          <div className="alert-pill">
            <Icon name="alert" size={12} stroke={2.8} />
            {late} {late > 1 ? 'lignes en retard' : 'ligne en retard'}
          </div>
        )}
      </div>
      <div className="pointage">
        {accounts.map(a => {
          const p = accountPointage(data, month, a.id, today, ledger);
          if (!p) return null;
          const open = openId === a.id;
          return (
            <div key={a.id} className="pt-account">
              <div className="pt-head" onClick={() => setOpenId(open ? null : a.id)}>
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
                <AccountDot account={a} />
                <span className="pt-name">{a.name}</span>
                <span className="pt-est-label">Solde estimé</span>
                <b>{p.estimated === null ? '—' : money(p.estimated)}</b>
              </div>
              {open && <AccountBody p={p} month={month} locked={locked} today={today} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const IGNORED_TIP = 'Ce compte est hors budget : le mouvement est enregistré sur lui seul et ne modifie pas le solde du compte principal.';

const DATE_ERRORS: Record<BalanceDateError, string> = { invalid: 'Date invalide', outside: 'Date hors du mois', future: 'Date dans le futur' };

function AccountBody({ p, month, locked, today }: { p: AccountPointage; month: MonthKey; locked: boolean; today: string }) {
  const { update } = useStore();
  const id = p.account.id;
  const bounds = balanceDateBounds(month, today);
  // Nothing can be dated in a future month (RG32).
  const canWrite = !locked && bounds.min <= bounds.max && p.estimated !== null;
  // Date of the statement being edited, why the last attempt was refused, adjustment form, adjustment being cancelled.
  const [editingDate, setEditingDate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  // Enter, Escape and the blur that follows must not validate twice.
  const closed = useRef(true);
  const startDate = () => {
    setError(null);
    closed.current = false;
    setEditingDate(true);
  };
  const saveStatement = (amount: number, on: string) => {
    const err = validateBalanceDate(month, on, today);
    setError(err ? DATE_ERRORS[err] : null);
    if (!err) update(d => void setAccountStatement(d, month, id, amount, on, today));
  };
  const commitDate = (value: string) => {
    if (closed.current) return;
    closed.current = true;
    setEditingDate(false);
    if (p.statement) saveStatement(p.statement.amount, value);
  };
  const adjustmentAmount = useRef<HTMLInputElement>(null);
  const validateAdjustment = () => {
    const v = parseAmount(adjustmentAmount.current?.value ?? '');
    if (v === null || v === 0 || !p.statement) return setError('Montant non nul requis');
    setAdjusting(false);
    setError(null);
    const adjId = newId('adj');
    update(d => void createAdjustment(d, month, adjId, id, p.statement!.on, v, today));
  };

  // The grey lines come from a separate list and are only interleaved by date for display: they join no total (RG101).
  const rows = [...p.movements, ...p.ignored].sort((a, b) => a.date.localeCompare(b.date));
  const prevMonth = monthName(parseMonth(addMonths(month, -1)).month).toLowerCase();
  const ledgerDiffers = p.ledgerBalance !== null && p.estimated !== null && p.ledgerBalance !== p.estimated;

  return (
    <div className="pt-body">
      <div className="pt-line">
        <span>Reste à sortir</span>
        <b>{money(p.remaining)}</b>
      </div>
      {p.expectedLines.length > 0 && (
        <div className="pt-line">
          <span>Revenus attendus</span>
          <b>{money(p.expected)}</b>
        </div>
      )}
      <div className="pt-line">
        <span>Marge</span>
        <b style={{ color: gapColor(p.margin) }}>{p.margin === null ? '—' : money(p.margin, true)}</b>
      </div>
      <div className="pt-line">
        <span>Solde relevé</span>
        <span className="pt-balance">
          <div className="rel">
            <EditableAmount
              id={`bal:${id}`}
              value={p.statement?.amount ?? null}
              allowEmpty
              onCommit={v => {
                setError(null);
                update(d => void setAccountStatement(d, month, id, v, p.statement?.on ?? bounds.max, today));
              }}
              className="cell"
              style={{ color: p.statement ? undefined : MUTED }}
              inputClassName="cell-input"
              hint="right"
              disabled={!canWrite}
            >
              {p.statement ? money(p.statement.amount) : 'Saisir le solde relevé'}
            </EditableAmount>
          </div>
          {p.statement && editingDate && (
            <input
              type="date"
              autoFocus
              className="cell-input pt-date"
              defaultValue={p.statement.on}
              min={bounds.min}
              max={bounds.max}
              onKeyDown={e => {
                if (e.key === 'Enter') commitDate(e.currentTarget.value);
                else if (e.key === 'Escape') {
                  closed.current = true;
                  setEditingDate(false);
                }
              }}
              onBlur={e => commitDate(e.currentTarget.value)}
            />
          )}
          {p.statement && !editingDate && (
            <span className={`pt-maj${canWrite ? ' is-editable' : ''}`} onClick={canWrite ? startDate : undefined}>
              au {shortDate(p.statement.on)}
            </span>
          )}
        </span>
      </div>
      {p.gap !== null && (
        <div className="pt-line">
          <span>Écart</span>
          <span className="pt-balance">
            <b style={{ color: p.gap === 0 ? GOOD : BAD }}>{money(p.gap, true)}</b>
            {p.gap !== 0 && canWrite && (
              <span className="rel">
                <span className="btn-quiet pt-btn" onClick={() => setAdjusting(o => !o)}>
                  Régulariser l’écart
                </span>
                {adjusting && p.statement && (
                  <div className="popmenu check-menu">
                    <div className="popmenu-label">Ajouter un mouvement « écart constaté » au {shortDate(p.statement.on)}</div>
                    <label className="check-field">
                      <span>Montant</span>
                      <input ref={adjustmentAmount} inputMode="decimal" defaultValue={rawNumber(p.gap)} />
                    </label>
                    <div className="popmenu-item" onClick={validateAdjustment}>Valider</div>
                    <div className="popmenu-item" onClick={() => setAdjusting(false)}>Fermer</div>
                  </div>
                )}
              </span>
            )}
          </span>
        </div>
      )}
      {error && <div className="env-tile-error">{error}</div>}

      <div className="pt-detail">
        <div className="pt-detail-title">Détail de {monthName(parseMonth(month).month).toLowerCase()}</div>
        {p.mode === 'real' && <div className="pt-row is-sub"><span>Mois compté au réel (avant le pointage)</span></div>}
        {p.start !== null && (
          <div className="pt-row">
            <span>Début de mois (fin {prevMonth})</span>
            <span>{money(p.start)}</span>
          </div>
        )}
        {rows.map((x, i) => 'reason' in x ? (
          <div key={`g${i}`} className="pt-row is-grey" title={IGNORED_TIP}>
            <span>
              {shortDate(x.date)} {x.label}
              <span className="pt-maj"> {IGNORED_REASON}</span>
            </span>
            <span>{money(x.amount, true)}</span>
          </div>
        ) : (
          <div key={i} className={`pt-row${x.counted ? '' : ' is-grey'}`} title={x.attachedMonth ? `Rattachée à ${monthLabel(x.attachedMonth).toLowerCase()}` : undefined}>
            <span style={x.cancelledOn ? { textDecoration: 'line-through' } : undefined}>
              {shortDate(x.date)} {x.label}
              {x.adjustmentId && ` (régularisation, créée le ${shortDate(x.createdOn ?? x.date)})`}
              {x.cancelledOn && <span className="pt-maj"> annulée le {shortDate(x.cancelledOn)}</span>}
              {x.note && <span className="pt-maj"> {x.note}</span>}
              {x.adjustmentId && x.counted && !locked &&
                (cancelling === x.adjustmentId ? (
                  <span className="pt-maj">
                    {' '}Annuler cette régularisation ? Elle restera visible, barrée.{' '}
                    <span className="pt-link" onClick={() => { setCancelling(null); update(d => void cancelAdjustment(d, x.adjustmentId!, today)); }}>Oui</span>
                    {' · '}
                    <span className="pt-link" onClick={() => setCancelling(null)}>Non</span>
                  </span>
                ) : (
                  <span className="pt-link" onClick={() => setCancelling(x.adjustmentId!)}> [Annuler]</span>
                ))}
            </span>
            <span style={{ color: x.counted && x.amount > 0 ? 'oklch(0.48 0.13 150)' : undefined, textDecoration: x.cancelledOn ? 'line-through' : undefined }}>{money(x.amount, true)}</span>
          </div>
        ))}
        {p.estimated !== null && (
          <div className="pt-row is-total">
            <span>= Solde estimé</span>
            <span>{money(p.estimated)}</span>
          </div>
        )}
        {ledgerDiffers && (
          <div className="pt-row is-grey">
            <span>Solde de l’écran Comptes : {money(p.ledgerBalance!)}</span>
          </div>
        )}
        {p.expectedLines.length > 0 && (
          <>
            <div className="pt-detail-sub">Revenus attendus</div>
            {p.expectedLines.map(x => (
              <div key={x.line.key} className="pt-row">
                <span>
                  {x.line.name}
                  {x.line.dueDay !== undefined && <span className="pt-maj"> le {effectiveDueDay(x.line.dueDay, month)}</span>}
                  {x.late && <span className="late-badge">en retard</span>}
                </span>
                <span title={sourceTip(x)}>{money(x.amount)} <span className="pt-maj">({x.source === 'actual' ? 'réel' : 'budget'})</span></span>
              </div>
            ))}
          </>
        )}
        <div className="pt-detail-sub">Reste à sortir</div>
        {p.pending.length === 0 && <div className="pt-row is-grey"><span>Rien à sortir</span></div>}
        {p.pending.map(x => (
          <div key={x.line.key} className="pt-row">
            <span>
              {x.line.name}
              {x.line.dueDay !== undefined && <span className="pt-maj"> le {effectiveDueDay(x.line.dueDay, month)}</span>}
              {x.late && <span className="late-badge">en retard</span>}
            </span>
            <span title={sourceTip(x)}>{money(x.amount)} <span className="pt-maj">({x.source === 'actual' ? 'réel' : 'budget'})</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Tooltip of a line of « Reste à sortir » or « Revenus attendus » counted at its actual (RG86). */
const sourceTip = (x: PendingLine) => (x.source === 'actual' ? `Réel ${money(x.line.actual ?? 0)} ; budget ${money(x.line.budget)}` : 'Pas de réel : le budget est compté.');
