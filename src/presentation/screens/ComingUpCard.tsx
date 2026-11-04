import { useState } from 'react';
import { accountComingUp, comingUpAccounts, lateCount, type AccountComingUp, type LeftItem } from '../../domain/comingUp';
import { money } from '../../domain/format';
import type { MonthKey } from '../../domain/types';
import { AccountDot } from '../components/AccountPicker';
import { Icon } from '../components/Icon';
import { HUE, gapColor, toneVars } from '../components/tone';
import { useStore } from '../state/store';

/**
 * « À venir ce mois-ci » (spec 0043): for each bank account with something to pay, the real balance, what is still to leave it
 * (filed by execution mode) and what would remain. Purely informative: it writes nothing and enters no balance. Nothing to click but the detail.
 */
export function ComingUpCard({ month, today }: { month: MonthKey; today: string }) {
  const { data } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const late = lateCount(data, month, today);
  return (
    <div className="panel block" style={toneVars(HUE.obj)}>
      <div className="block-head">
        <div className="block-icon">
          <Icon name="transfer" size={14} />
        </div>
        <div className="block-title">À venir ce mois-ci</div>
        <div style={{ flex: 1 }} />
        {late > 0 && (
          <div className="alert-pill">
            <Icon name="alert" size={12} stroke={2.8} />
            {late} {late > 1 ? 'lignes en retard' : 'ligne en retard'}
          </div>
        )}
      </div>
      <div className="coming-up">
        {comingUpAccounts(data, month).map(a => {
          const p = accountComingUp(data, month, a.id, today);
          if (!p) return null;
          const open = openId === a.id;
          return (
            <div key={a.id} className="pt-account">
              <div className="pt-head" onClick={() => setOpenId(open ? null : a.id)}>
                <Icon name={open ? 'chevronDown' : 'chevronRight'} size={13} />
                <AccountDot account={a} />
                <span className="pt-name">{a.name}</span>
                <span className="pt-est-label">Solde réel</span>
                <b>{p.reference === null ? '—' : money(p.reference)}</b>
              </div>
              <AccountSummary p={p} />
              {open && <AccountDetail p={p} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const plural = (n: number) => (n > 1 ? 'lignes' : 'ligne');

/** A negative amount is red and carries its « − » sign, so the colour is never the only signal (RG19). */
function AccountSummary({ p }: { p: AccountComingUp }) {
  return (
    <div className="pt-body">
      {p.groups.length === 0 && <div className="pt-line"><span>Rien à sortir</span></div>}
      {p.groups.map(g => (
        <div key={g.id} className="pt-line">
          <span>{g.label} ({g.items.length} {plural(g.items.length)})</span>
          <span>{money(-g.total, true)}</span>
        </div>
      ))}
      <div className="pt-line">
        <span>Marge après les mouvements à venir</span>
        <b style={{ color: gapColor(p.margin) }}>{p.margin === null ? '—' : money(p.margin, true)}</b>
      </div>
      {p.expectedItems.length > 0 && (
        <div className="pt-line">
          <span>Revenus attendus</span>
          <span>{money(p.expected, true)}</span>
        </div>
      )}
    </div>
  );
}

function ItemRow({ x }: { x: LeftItem }) {
  return (
    <div className="pt-row">
      <span>
        {x.name}
        {x.day !== undefined && <span className="pt-maj"> le {x.day}</span>}
        {x.late && <span className="late-badge">en retard</span>}
      </span>
      <span title={`Budget ${money(x.budget)} ; reste ${money(x.amount)}`}>{money(x.amount)}</span>
    </div>
  );
}

function AccountDetail({ p }: { p: AccountComingUp }) {
  return (
    <div className="pt-body">
      <div className="pt-detail">
        {p.groups.length === 0 && <div className="pt-row is-grey"><span>Rien à sortir</span></div>}
        {p.groups.map(g => (
          <div key={g.id}>
            <div className="pt-detail-sub">{g.label}</div>
            {g.items.map(x => <ItemRow key={`${x.kind}:${x.id}`} x={x} />)}
          </div>
        ))}
        {p.expectedItems.length > 0 && (
          <>
            <div className="pt-detail-sub">Revenus attendus</div>
            {p.expectedItems.map(x => <ItemRow key={x.id} x={x} />)}
          </>
        )}
      </div>
    </div>
  );
}
