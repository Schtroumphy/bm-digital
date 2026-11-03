import { useState } from 'react';
import { IGNORED_REASON, accountPointage, effectiveDueDay, lateCount, pointageAccounts, shortDate, type AccountPointage, type PendingLine } from '../../domain/checkoff';
import { addMonths, money, monthLabel, monthName, parseMonth } from '../../domain/format';
import type { MonthKey } from '../../domain/types';
import { AccountDot } from '../components/AccountPicker';
import { Icon } from '../components/Icon';
import { BAD, GOOD, gapColor, HUE, toneVars } from '../components/tone';
import { useStore } from '../state/store';

/**
 * « Pointage par compte » (spec 0009): Reste à sortir, Solde estimé, Marge, relevé et écart of each account, with a detail that unfolds on click.
 * The statement and its gap are read-only here: they are typed, and regularised, on the page « Relevé » (spec 0041, RG26).
 */
export function PointageCard({ month, today, onOpenStatements }: { month: MonthKey; today: string; onOpenStatements: () => void }) {
  const { data } = useStore();
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
          const p = accountPointage(data, month, a.id, today);
          if (!p) return null;
          const open = openId === a.id;
          return (
            <div key={a.id} className="pt-account">
              <div className="pt-head" onClick={() => setOpenId(open ? null : a.id)}>
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
                <AccountDot account={a} />
                <span className="pt-name">{a.name}</span>
                <span className="pt-est-label">Solde réel</span>
                <b>{p.real === null ? '—' : money(p.real.end)}</b>
                <span className="pt-est-label" title="Budget et pointages fictifs, plus les transferts. Informatif.">Estimé (budget)</span>
                <span>{p.estimated === null ? '—' : money(p.estimated)}</span>
              </div>
              {open && <AccountBody p={p} month={month} onOpenStatements={onOpenStatements} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const IGNORED_TIP = 'Ce compte est hors budget : le mouvement est enregistré sur lui seul et ne modifie pas le solde du compte principal.';

function AccountBody({ p, month, onOpenStatements }: { p: AccountPointage; month: MonthKey; onOpenStatements: () => void }) {
  // The grey lines come from a separate list and are only interleaved by date for display: they join no total (RG101).
  // Two views of the same month (spec 0019, RG27): the real entries, or the estimate (checks marked fictive, transfers, expenses).
  const [view, setView] = useState<'real' | 'estimated'>('real');
  const list = view === 'real' ? p.realMovements : p.estimatedMovements;
  const rows = view === 'real' ? list : [...list, ...p.ignored].sort((a, b) => a.date.localeCompare(b.date));
  const balance = view === 'real' ? p.real : p.estimatedBalance;
  const prevMonth = monthName(parseMonth(addMonths(month, -1)).month).toLowerCase();

  return (
    <div className="pt-body">
      <div className="pt-line">
        <b>Solde réel</b>
        <b>{p.real === null ? '—' : money(p.real.end)}</b>
      </div>
      <div className="pt-line">
        <span>Solde estimé (budget)</span>
        <span>
          {p.estimated === null ? '—' : money(p.estimated)}
          {p.difference !== null && p.difference !== 0 && <span className="pt-maj" title="Écart : solde réel moins solde estimé"> écart {money(p.difference, true)}</span>}
        </span>
      </div>
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
        <span title="Comparé au solde réel à la date du relevé">Solde relevé</span>
        <span className="pt-balance">
          <b>{p.statement ? money(p.statement.amount) : '—'}</b>
          {p.statement && <span className="pt-maj">au {shortDate(p.statement.on)}</span>}
        </span>
      </div>
      {p.gap !== null && (
        <div className="pt-line">
          <span title="Relevé moins solde réel">Écart</span>
          <b style={{ color: p.gap === 0 ? GOOD : BAD }}>{money(p.gap, true)}</b>
        </div>
      )}
      <div className="pt-line">
        <span className="pt-link" onClick={onOpenStatements}>{p.statement ? 'Voir le relevé' : 'Saisir le relevé'}</span>
      </div>

      <div className="pt-detail">
        <div className="pt-detail-title">Détail de {monthName(parseMonth(month).month).toLowerCase()}</div>
        <div className="pt-views" role="group" aria-label="Vue du détail">
          <button type="button" className={`pt-view${view === 'real' ? ' is-on' : ''}`} aria-pressed={view === 'real'} onClick={() => setView('real')}>Réel</button>
          <button type="button" className={`pt-view${view === 'estimated' ? ' is-on' : ''}`} aria-pressed={view === 'estimated'} onClick={() => setView('estimated')}>Estimé (budget)</button>
        </div>
        {balance !== null && (
          <div className="pt-row">
            <span>Début de mois (fin {prevMonth})</span>
            <span>{money(balance.start)}</span>
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
          <div key={i} className={`pt-row${x.counted ? '' : ' is-grey'}${x.fictive ? ' is-fictive' : ''}`} title={x.fictive ? 'Pointage fictif : estimation de budget, n’affecte pas les soldes réels.' : x.attachedMonth ? `Rattachée à ${monthLabel(x.attachedMonth).toLowerCase()}` : undefined}>
            <span style={x.cancelledOn ? { textDecoration: 'line-through' } : undefined}>
              {shortDate(x.date)} {x.label}
              {x.adjustmentId && ` (régularisation, créée le ${shortDate(x.createdOn ?? x.date)})`}
              {x.cancelledOn && <span className="pt-maj"> annulée le {shortDate(x.cancelledOn)}</span>}
              {x.note && <span className="pt-maj"> {x.note}</span>}
            </span>
            <span style={{ color: x.counted && x.amount > 0 ? 'oklch(0.48 0.13 150)' : undefined, textDecoration: x.cancelledOn ? 'line-through' : undefined }}>{money(x.amount, true)}</span>
          </div>
        ))}
        {balance !== null && (
          <div className="pt-row is-total">
            <span>= {view === 'real' ? 'Solde réel' : 'Solde estimé (budget)'}</span>
            <span>{money(balance.end)}</span>
          </div>
        )}
        {p.difference !== null && (
          <div className="pt-row is-grey" title="Information : solde réel moins solde estimé à la fin du mois">
            <span>Écart réel − estimé : {money(p.difference, true)}</span>
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
