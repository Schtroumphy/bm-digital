import { useState } from 'react';
import { accountTransfersView, type AccountTransfer, type TransferStatus } from '../../domain/accountTransfers';
import { createAccountTransfer, deleteAccountTransfer, updateAccountTransfer } from '../../application/accountTransfers';
import { money } from '../../domain/format';
import { isMonthLocked } from '../../domain/ledger';
import type { MonthKey } from '../../domain/types';
import { Icon } from '../components/Icon';
import { HUE, toneVars } from '../components/tone';
import { TransferModal, type TransferFormValues } from '../components/TransferModal';
import { newId, useStore } from '../state/store';

/**
 * « Transferts entre comptes » (spec 0050): the savings transfers paid by an account other than the main one, with what is left to send.
 * No checkbox (RG12): the only actions are « Ajouter » and a click on a line, which open the form (RG22, RG27). The state shown is computed, never typed.
 */
export function AccountTransfersCard({ month, today }: { month: MonthKey; today: string }) {
  const { data, update } = useStore();
  // `null` = closed, `'new'` = creation, a key = edition of that line.
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const view = accountTransfersView(data, month, today);
  if (!view) return null;
  const locked = isMonthLocked(data, month);
  const total = view.items.length;
  const line = editing && editing !== 'new' ? data.months[month]?.lines.find(l => l.key === editing) : undefined;
  // The use case runs first on a copy, to tell the form why it refuses; only then is it applied to the real data.
  const run = (fn: (d: typeof data) => string | null): string | null => {
    const message = fn(structuredClone(data));
    if (message === null) update(d => void fn(d));
    return message;
  };
  const toInput = (v: TransferFormValues) => ({ fromAccountId: v.fromAccountId, toAccountId: v.toAccountId, amount: v.amount, ...(v.dueDay !== undefined ? { dueDay: v.dueDay } : {}), label: v.label });
  return (
    <div className="panel block" style={toneVars(HUE.epa)}>
      <div className="block-head">
        <div className="block-icon">
          <Icon name="transfer" size={14} />
        </div>
        <div className="block-title">Transferts entre comptes</div>
        <div style={{ flex: 1 }} />
        {total > 0 && <span className="tr-count" title="Transferts faits sur le total">{view.done} / {total}</span>}
      </div>
      {total === 0 ? (
        <div className="tr-empty">Aucun transfert ce mois-ci</div>
      ) : (
        <>
          <div className="progress tr-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={view.done} aria-label="Transferts faits">
            <div style={{ width: `${(view.done / total) * 100}%` }} />
          </div>
          <div className="tr-list">
            {view.items.map(t => <TransferRow key={t.key} t={t} onOpen={() => setEditing(t.key)} />)}
          </div>
          <div className="tr-foot">
            <span>Reste à transférer</span>
            <b>{money(view.left)}</b>
          </div>
        </>
      )}
      <div className="tr-add">
        <div
          className={`add-btn${locked ? ' is-disabled' : ''}`}
          role="button"
          tabIndex={locked ? -1 : 0}
          aria-disabled={locked || undefined}
          title={locked ? 'Mois clos ou verrouillé' : 'Ajouter un transfert'}
          onClick={locked ? undefined : () => setEditing('new')}
          onKeyDown={e => { if (!locked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setEditing('new'); } }}
        >
          <span className="add-icon">
            <Icon name="plus" size={13} stroke={3} />
          </span>
          <span>Ajouter</span>
        </div>
      </div>
      {editing === 'new' && (
        <TransferModal data={data} month={month} onClose={() => setEditing(null)} onSave={v => run(d => createAccountTransfer(d, month, newId('l'), toInput(v)))} />
      )}
      {line && (
        <TransferModal
          data={data}
          month={month}
          line={line}
          onClose={() => setEditing(null)}
          onSave={v => run(d => updateAccountTransfer(d, month, line.key, toInput(v)))}
          onDelete={() => run(d => deleteAccountTransfer(d, month, line.key))}
        />
      )}
    </div>
  );
}

const STATUS: Record<TransferStatus, { label: string; mark: string }> = {
  todo: { label: 'À faire', mark: 'is-empty' },
  partial: { label: 'Partiel', mark: 'is-half' },
  done: { label: 'Fait', mark: 'is-full' },
  late: { label: 'En retard', mark: 'is-empty' },
};

/** « 800 € prévus · 300 € de dépenses rattachées · 0 € viré » (RG9). */
const detailOf = (t: AccountTransfer) => `${money(t.planned)} prévus · ${money(t.attached)} de dépenses rattachées · ${money(t.transferred)} viré`;

function TransferRow({ t, onOpen }: { t: AccountTransfer; onOpen: () => void }) {
  const s = STATUS[t.status];
  return (
    <div className="tr-row" role="button" tabIndex={0} onClick={onOpen} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}>
      {/* Visual mark of the badge only: not clickable, not a checkbox (RG12). */}
      <span className={`tr-mark ${s.mark}`} aria-hidden="true">{t.status === 'done' && <Icon name="check" size={10} stroke={3} />}</span>
      <div className="tr-main">
        <div className="tr-name" title={t.title}>{t.title}</div>
        {(t.route || t.day !== undefined) && <div className="tr-sub" title={t.route}>{[t.route, t.day !== undefined ? `Avant le ${t.day}` : null].filter(Boolean).join(' · ')}</div>}
      </div>
      <div className="tr-side">
        <span title={`Reste à transférer : ${money(t.left)}`}>{money(t.left)}</span>
        <span className={`tr-badge is-${t.status}`}>{s.label}</span>
      </div>
      {(t.transferred !== 0 || t.attached !== 0) && <div className="tr-detail">{detailOf(t)}</div>}
    </div>
  );
}
