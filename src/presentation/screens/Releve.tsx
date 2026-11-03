import { useEffect, useRef, useState } from 'react';
import { cancelAdjustment, createAdjustment, setAccountStatement } from '../../application/checkoff';
import { closeBlockers } from '../../application/monthClosing';
import { accountPointage, isoDate, shortDate, validateBalanceDate, balanceDateBounds, type BalanceDateError } from '../../domain/checkoff';
import { addMonths, money, monthLabel, monthName, parseMonth } from '../../domain/format';
import { isMonthLocked, isYearClosed } from '../../domain/ledger';
import { RELEVE_KINDS, canRegularise, releveCount, releveRows, type ReleveRow, type ReleveStatus } from '../../domain/releve';
import type { MonthKey } from '../../domain/types';
import { AccountDot } from '../components/AccountPicker';
import { blockerItems, MonthCloseControl, type BlockerItem } from '../components/CloseMonth';
import { EditableAmount } from '../components/Editable';
import { Icon } from '../components/Icon';
import { Spark } from '../components/Spark';
import { BAD, GOOD, HUE, MUTED, toneVars } from '../components/tone';
import { newId, useStore } from '../state/store';

const DATE_ERRORS: Record<BalanceDateError, string> = { invalid: 'Date invalide', outside: 'Date hors de la période du mois', future: 'Date dans le futur' };

/** Label and colours of the status pill (RG, « Définitions »). */
const STATUS: Record<ReleveStatus, { label: string; bg: string; fg: string }> = {
  'to-enter': { label: 'À saisir', bg: 'rgba(32,30,29,.06)', fg: 'rgba(32,30,29,.6)' },
  gap: { label: 'Écart', bg: 'oklch(0.95 0.06 85)', fg: 'oklch(0.38 0.07 80)' },
  validated: { label: 'Validé', bg: 'oklch(0.95 0.05 150)', fg: 'oklch(0.35 0.09 150)' },
  regularised: { label: 'Régularisé', bg: 'oklch(0.95 0.04 250)', fg: 'oklch(0.35 0.08 250)' },
  'no-movement': { label: 'Aucun mouvement', bg: 'rgba(32,30,29,.04)', fg: 'rgba(32,30,29,.45)' },
};

/**
 * Page « Relevé » (spec 0041): the balance of every account at the end of the month, typed from the bank, compared with the real balance.
 * It is also where the month is closed: the closing is refused until each account concerned has a statement with no gap.
 * `onOpenBudget` and `onOpenMonth` are the links of the banner « Impossible de clôturer ».
 */
export function ReleveScreen({ month, onOpenBudget, onOpenMonth }: { month: MonthKey; onOpenBudget: () => void; onOpenMonth: (m: MonthKey) => void }) {
  const { data, ledger } = useStore();
  const today = isoDate();
  const uninit = !data.months[month]?.initialized;
  const locked = isMonthLocked(data, month);
  const rows = releveRows(data, month, today);
  const count = releveCount(rows);
  // « Clôturer le mois » was clicked and refused: the banner explains why until it is dismissed or nothing is left to explain (RG16).
  const [closeAttempt, setCloseAttempt] = useState(false);
  const items = closeAttempt ? closeBlockers(data, month, today).flatMap(blockerItems) : [];
  // Row shown by a click on an account of the banner (RG15).
  const [flash, setFlash] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2200);
    return () => window.clearTimeout(t);
  }, [flash]);
  const show = (accountId: string) => {
    rowRefs.current[accountId]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlash(accountId);
  };
  const yearClosed = isYearClosed(data, parseMonth(month).year);

  return (
    <>
      {uninit && (
        <div className="banner">
          <div className="banner-icon">
            <Icon name="calendar" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">{monthLabel(month)} n’est pas encore initialisé</div>
            <div className="banner-text">Il n’y a pas de relevé à saisir : initialise le mois depuis l’écran Budget.</div>
          </div>
        </div>
      )}
      {locked && !uninit && (
        <div className="banner is-locked">
          <Icon name="lock" size={16} />
          {yearClosed ? `L’année ${parseMonth(month).year} est clôturée : ce mois est en lecture seule.` : 'Ce mois est clôturé : il est en lecture seule.'}
        </div>
      )}
      {items.length > 0 && (
        <div className="banner" role="alert">
          <div className="banner-icon">
            <Icon name="alert" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">Impossible de clôturer {monthLabel(month)}</div>
            {items.map(i => (
              <BlockerLine key={i.text} item={i} onAccount={show} onOpenBudget={onOpenBudget} onOpenMonth={onOpenMonth} />
            ))}
          </div>
          <div className="btn-quiet" onClick={() => setCloseAttempt(false)} title="Fermer">
            <Icon name="close" size={15} />
          </div>
        </div>
      )}
      <div className="soldes-intro">
        <div className="intro">Saisis le solde de chaque compte tel que ta banque le montre. Le mois ne se clôture que lorsque tous les écarts sont à 0.</div>
        {!uninit && (
          <div className="pill is-lg" style={{ background: 'oklch(0.95 0.05 150)', color: 'oklch(0.35 0.09 150)' }}>
            {count.ok} / {count.total} en règle
          </div>
        )}
        <MonthCloseControl month={month} onRefused={() => setCloseAttempt(true)} onDone={() => setCloseAttempt(false)} />
      </div>
      {!uninit && rows.length === 0 && <div className="muted">Aucun compte à relever pour ce mois.</div>}
      {RELEVE_KINDS.map(g => {
        const list = rows.filter(r => r.kind === g.kind);
        if (!list.length) return null;
        return (
          <div key={g.kind} className="panel-lg" style={toneVars(g.kind === 'epargne' ? HUE.epa : g.kind === 'invest' ? HUE.inv : g.kind === 'enveloppe' ? HUE.obj : HUE.dep)}>
            <div className="group-head">{g.title}</div>
            <div className="acc-grid rel-cols rel-head">
              <span>Compte</span>
              <span>6 mois</span>
              <span className="num">Début</span>
              <span className="num">+ Entrées</span>
              <span className="num">− Sorties</span>
              <span className="num">= Réel</span>
              <span>Date relevé</span>
              <span className="num" style={{ paddingRight: 8 }}>Solde relevé</span>
              <span className="num">Écart</span>
              <span className="num">Statut</span>
            </div>
            {list.map(r => (
              <div key={r.account.id} ref={el => { rowRefs.current[r.account.id] = el; }}>
                <ReleveLine row={r} month={month} locked={locked || uninit} today={today} flash={flash === r.account.id} spark={sparkOf(ledger.bankMonth.bind(ledger), r.account.id, month, r.real.end)} />
              </div>
            ))}
            <div style={{ height: 8 }} />
          </div>
        );
      })}
    </>
  );
}

/** Real balances at the end of the last 6 months, the current one included (the « 6 mois » column). */
function sparkOf(bankMonth: (id: string, m: MonthKey) => { balance: number } | null, id: string, month: MonthKey, current: number): number[] {
  const past = [5, 4, 3, 2, 1].map(k => bankMonth(id, addMonths(month, -k))?.balance).filter((v): v is number => v !== undefined);
  return [...past, current];
}

/** A line of the banner: its text, and a click or a link to fix it where it can be fixed (RG15, RG16). */
function BlockerLine({ item, onAccount, onOpenBudget, onOpenMonth }: { item: BlockerItem; onAccount: (id: string) => void; onOpenBudget: () => void; onOpenMonth: (m: MonthKey) => void }) {
  const link = item.link;
  return (
    <div className="banner-text">
      {item.accountId ? (
        <span className="pt-link" onClick={() => onAccount(item.accountId!)}>
          {item.text}
        </span>
      ) : (
        item.text
      )}
      {link && (
        <>
          {' '}
          <span className="pt-link" onClick={link.kind === 'budget' ? onOpenBudget : () => onOpenMonth(link.month)}>
            {link.kind === 'budget' ? 'Ouvrir le Budget' : `Aller à ${monthLabel(link.month)}`}
          </span>
        </>
      )}
    </div>
  );
}

function ReleveLine({ row: r, month, locked, today, flash, spark }: { row: ReleveRow; month: MonthKey; locked: boolean; today: string; flash: boolean; spark: number[] }) {
  const { data, update } = useStore();
  const id = r.account.id;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Date typed before the amount: used when the amount is entered.
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const bounds = balanceDateBounds(data, month, today);
  // Nothing can be dated in a month that has not started (RG7).
  const canWrite = !locked && bounds.min <= bounds.max;
  const date = draftDate ?? r.date;
  const status = STATUS[r.status];

  const save = (amount: number | null, on: string | null) => {
    if (amount === null) {
      setError(null);
      setDraftDate(null);
      update(d => void setAccountStatement(d, month, id, null, on ?? bounds.max, today));
      return;
    }
    if (on === null) return setError('Aucune date possible pour ce mois');
    const err = validateBalanceDate(data, month, on, today);
    setError(err ? DATE_ERRORS[err] : null);
    if (err) return;
    setDraftDate(null);
    update(d => void setAccountStatement(d, month, id, amount, on, today));
  };
  const commitDate = (value: string) => {
    if (!value || value === date) return;
    if (r.statement) save(r.statement.amount, value);
    else setDraftDate(value);
  };
  const regularise = () => {
    if (!r.statement || !r.gap) return;
    if (!window.confirm(`Régulariser l’écart de ${money(r.gap, true)} sur ${r.account.name} ?`)) return;
    const amount = r.gap;
    const on = r.statement.on;
    update(d => void createAdjustment(d, month, newId('adj'), id, on, amount, today));
  };

  return (
    <>
      <div className={`acc-grid rel-cols acc-row rel-row${flash ? ' is-flash' : ''}${r.concerned ? '' : ' is-dim'}`}>
        <span className="rel-name" onClick={() => setOpen(o => !o)}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
          <AccountDot account={r.account} />
          <span style={{ fontWeight: 600 }}>{r.account.name}</span>
          {!r.inBudget && <span className="pt-maj"> hors budget</span>}
        </span>
        <Spark values={spark} />
        <span className="num muted">{money(r.real.start)}</span>
        <span className="num muted">{r.inflow ? money(r.inflow) : '—'}</span>
        <span className="num muted">{r.outflow ? money(-r.outflow) : '—'}</span>
        <b className="num" title={date ? `Solde réel attendu au ${shortDate(date)}` : undefined}>{r.expected === null ? '—' : money(r.expected)}</b>
        <span>
          {date === null ? (
            '—'
          ) : (
            <input
              key={date}
              type="date"
              className="cell-input rel-date"
              defaultValue={date}
              min={bounds.min}
              max={bounds.max}
              disabled={!canWrite}
              aria-label={`Date du relevé de ${r.account.name}`}
              onKeyDown={e => e.key === 'Enter' && commitDate(e.currentTarget.value)}
              onBlur={e => commitDate(e.currentTarget.value)}
            />
          )}
        </span>
        <div className="rel">
          <EditableAmount
            id={`rel:${id}`}
            value={r.statement?.amount ?? null}
            allowEmpty
            disabled={!canWrite}
            onCommit={v => save(v, date)}
            className="stmt-cell"
            style={{ background: r.status === 'gap' ? 'oklch(0.96 0.04 90)' : undefined }}
            inputClassName="cell-input is-stmt"
          >
            {r.statement ? money(r.statement.amount) : 'Saisir…'}
          </EditableAmount>
        </div>
        <span className="num" style={{ fontWeight: 600, color: r.gap === null ? MUTED : r.gap === 0 ? GOOD : BAD }}>
          {r.gap === null ? '—' : r.gap === 0 ? '0,00 €' : money(r.gap, true)}
        </span>
        <span className="rel-status">
          {canRegularise(r) && canWrite && (
            <span className="btn-quiet pt-btn" onClick={regularise}>
              Régulariser l’écart
            </span>
          )}
          <span className="pill" style={{ background: status.bg, color: status.fg }}>
            {status.label}
          </span>
        </span>
      </div>
      {error && <div className="env-tile-error rel-error">{error}</div>}
      {open && <ReleveDetail row={r} month={month} locked={locked} today={today} />}
    </>
  );
}

/** Real movements of the month for one account, adjustments included: where an error is looked for (RG6). */
function ReleveDetail({ row: r, month, locked, today }: { row: ReleveRow; month: MonthKey; locked: boolean; today: string }) {
  const { data, update } = useStore();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const p = accountPointage(data, month, r.account.id, today);
  if (!p) return null;
  const prevMonth = monthName(parseMonth(addMonths(month, -1)).month).toLowerCase();
  return (
    <div className="pt-body rel-detail">
      <div className="pt-detail-title">Détail de {monthName(parseMonth(month).month).toLowerCase()}</div>
      <div className="pt-row">
        <span>Début de mois (fin {prevMonth})</span>
        <span>{money(r.real.start)}</span>
      </div>
      {p.realMovements.map((x, i) => (
        <div key={i} className={`pt-row${x.counted ? '' : ' is-grey'}`} title={x.attachedMonth ? `Rattachée à ${monthLabel(x.attachedMonth).toLowerCase()}` : undefined}>
          <span style={x.cancelledOn ? { textDecoration: 'line-through' } : undefined}>
            {shortDate(x.date)} {x.label}
            {x.adjustmentId && ` (régularisation, créée le ${shortDate(x.createdOn ?? x.date)})`}
            {x.cancelledOn && <span className="pt-maj"> annulée le {shortDate(x.cancelledOn)}</span>}
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
      <div className="pt-row is-total">
        <span>= Solde réel</span>
        <span>{money(r.real.end)}</span>
      </div>
    </div>
  );
}
