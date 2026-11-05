import { useState } from 'react';
import { accountComingUp, comingUpAccounts, lateCount, type AccountComingUp, type LeftGroup, type LeftItem } from '../../domain/comingUp';
import { money } from '../../domain/format';
import type { MonthKey } from '../../domain/types';
import { AccountDot } from '../components/AccountPicker';
import { DetailsBubble } from '../components/DetailsBubble';
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

/** Title of a heading as shown: the cash one carries a banknote mark (display only, the data keep the plain label). */
const groupTitle = (g: LeftGroup) => (g.id === 'retrait' ? `💵 ${g.label}` : g.label);

/** One line per movement already passed (« JJ/MM  libellé : +/−montant »), then the total. */
function passedText(p: AccountComingUp): string {
  if (p.passedMovements.length === 0) return 'Aucun mouvement.';
  const lines = p.passedMovements.map(x => `${dayMonth(x.date)}  ${x.label} : ${money(x.amount, true)}`);
  return [...lines, '', `Total : ${money(p.passed ?? 0, true)}`].join('\n');
}

/** `YYYY-MM-DD` as `JJ/MM`. */
const dayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

const plural = (n: number) => (n > 1 ? 'lignes' : 'ligne');

/** A negative amount is red and carries its « − » sign, so the colour is never the only signal (RG19). */
function AccountSummary({ p }: { p: AccountComingUp }) {
  const [info, setInfo] = useState<DOMRect | null>(null);
  return (
    <div className="pt-body">
      {p.start && (
        <div className="pt-line">
          <span>Solde de départ ({dayMonth(p.start.date)})</span>
          <span>{money(p.start.amount, true)}</span>
        </div>
      )}
      {p.passed !== null && p.reference !== null && (
        <>
          <div className="pt-line" style={{ cursor: 'pointer' }} title="Cliquer pour voir le détail" onClick={e => setInfo(e.currentTarget.getBoundingClientRect())}>
            <span>Mouvements déjà passés</span>
            <span>{money(p.passed, true)}</span>
          </div>
          {info && <DetailsBubble title="Mouvements déjà passés" text={passedText(p)} rect={info} onClose={() => setInfo(null)} />}
          <div className="pt-line">
            <span>= Solde réel</span>
            <b>{money(p.reference, true)}</b>
          </div>
        </>
      )}
      {p.groups.every(g => g.items.length === 0) && <div className="pt-line"><span>Rien à sortir</span></div>}
      {p.groups.filter(g => g.items.length > 0).map(g => (
        <div key={g.id} className="pt-line">
          <span>{groupTitle(g)} ({g.items.length} {plural(g.items.length)})</span>
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
      {p.expected > 0 && (
        <div className="pt-line">
          <span>Marge après les revenus attendus</span>
          <b style={{ color: gapColor(p.marginWithExpected) }}>{p.marginWithExpected === null ? '—' : money(p.marginWithExpected, true)}</b>
        </div>
      )}
    </div>
  );
}

/** A transfer to a dedicated account (spec 0045, RG14, RG15): unfolds to the lines it is attached to and their real expenses, which are indicative (in no total). */
function TransferRow({ x }: { x: LeftItem }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="pt-row is-grey" style={{ cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          {x.name}
          {x.day !== undefined && <span className="pt-maj"> le {x.day}</span>}
        </span>
        <span>{money(x.amount)}</span>
      </div>
      {open && (x.lines ?? []).map(l => (
        <div key={l.key} style={{ paddingLeft: 20 }}>
          <div className="pt-row is-grey">
            <span>{l.name}</span>
            <span>{money(l.spent)} dépensés</span>
          </div>
          {l.expenses.map(e => (
            <div key={e.id} className="pt-row is-grey" style={{ paddingLeft: 12, fontSize: '0.9em' }}>
              <span>{e.label}<span className="pt-maj"> le {e.day}</span></span>
              <span>{money(e.amount)}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

function ItemRow({ x, done }: { x: LeftItem; done?: boolean }) {
  if (x.kind === 'transfer') return <TransferRow x={x} />;
  return (
    <div className={done ? 'pt-row is-grey' : 'pt-row'}>
      <span>
        {x.name}
        {x.day !== undefined && <span className="pt-maj"> le {x.day}</span>}
        {x.late && <span className="late-badge">en retard</span>}
      </span>
      <span title={done ? `Budget ${money(x.budget)} ; sorti ${money(x.amount)}` : `Budget ${money(x.budget)} ; reste ${money(x.amount)}`}>{money(x.amount)}</span>
    </div>
  );
}

function SubHead({ label, total }: { label: string; total: number }) {
  return (
    <div className="pt-detail-sub" style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span>{money(total)}</span>
    </div>
  );
}

function AccountDetail({ p }: { p: AccountComingUp }) {
  const left = p.groups.filter(g => g.items.length > 0);
  const done = p.groups.flatMap(g => g.done).sort((a, b) => (a.day ?? Infinity) - (b.day ?? Infinity));
  return (
    <div className="pt-body">
      <div className="pt-detail">
        {left.length === 0 && <div className="pt-row is-grey"><span>Rien à sortir</span></div>}
        {left.map(g => (
          <div key={g.id}>
            <SubHead label={groupTitle(g)} total={g.total} />
            {g.items.map(x => <ItemRow key={`${x.kind}:${x.id}`} x={x} />)}
            {g.withdrawn !== undefined && <div className="pt-row is-grey"><span>Déjà retiré</span><span>{money(-g.withdrawn, true)}</span></div>}
          </div>
        ))}
        {done.length > 0 && (
          <div>
            <SubHead label="Déjà sorti" total={done.reduce((t, x) => t + x.amount, 0)} />
            {done.map(x => <ItemRow key={`done:${x.kind}:${x.id}`} x={x} done />)}
          </div>
        )}
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
