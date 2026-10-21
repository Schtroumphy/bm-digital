import { useState } from 'react';
import { AccountDot } from '../components/AccountPicker';
import { EditableAmount, EditableText } from '../components/Editable';
import { Icon } from '../components/Icon';
import { tone, toneVars } from '../components/tone';
import {
  addBankAccount,
  archiveBankAccount,
  archiveBlocker,
  confirmOpeningBalances,
  needsOpeningBalances,
  renameBankAccount,
  setBankAccountHue,
  setBankAccountInBudget,
  setBankAccountOpening,
  setMainBankAccount,
  unarchiveBankAccount,
} from '../../application/bankAccounts';
import { setPointageStart } from '../../application/checkoff';
import { setEnvelopeDefaultAccount } from '../../application/payment';
import { BANK_HUES, CASH_ACCOUNT_ID, envelopeDefaultAccountId } from '../../domain/bank';
import { canSetPointageStart } from '../../domain/checkoff';
import { IN_BUDGET_HINT } from '../components/hints';
import { money, monthLabel } from '../../domain/format';
import { isMonthLocked, monthLines } from '../../domain/ledger';
import type { BankAccount, MonthKey } from '../../domain/types';
import { newId, useStore } from '../state/store';
import { useUi } from '../state/ui';

/** Header button of the screen. */
export function AccountsActions({ month }: { month: MonthKey }) {
  const { data, update } = useStore();
  const { setEditing } = useUi();
  if (isMonthLocked(data, month)) return null;
  return (
    <div
      className="btn-dark"
      onClick={() => {
        const id = newId('acc');
        update(d => addBankAccount(d, id));
        setEditing(`an:${id}`);
      }}
    >
      <Icon name="plus" size={15} stroke={3} />
      Ajouter un compte
    </div>
  );
}

export function AccountsScreen({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  // « Renommer » in the row menu puts the name cell in edit mode.
  const { setEditing } = useUi();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Account whose month-by-month history is open (spec 0007, RG15).
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const start = data.settings.pointageStart;
  const locked = isMonthLocked(data, month);
  const active = data.accounts.filter(a => !a.archived);
  const archived = data.accounts.filter(a => a.archived);
  const lastMonth = ledger.months[ledger.months.length - 1];
  const savingsLines = monthLines(data, month).filter(l => (l.block === 'epa' || l.block === 'inv') && l.linkedAccountId);

  const archive = (a: BankAccount) => {
    const balance = ledger.bankMonth(a.id, lastMonth)?.balance ?? 0;
    if (balance !== 0 && !window.confirm(`« ${a.name} » a un solde de ${money(balance)}. L’archiver quand même ? Son historique reste visible.`)) return;
    update(d => void archiveBankAccount(d, a.id));
  };

  const row = (a: BankAccount) => {
    const r = ledger.bankMonth(a.id, month);
    const blocker = archiveBlocker(data, a.id);
    const receives = savingsLines.filter(l => l.linkedAccountId === a.id).map(l => l.name);
    return (
      <div key={a.id} className={`accounts-grid accounts-row${a.archived ? ' is-archived' : ''}`}>
        <div>
          <div className="accounts-name">
            <AccountDot account={a} />
            <EditableText id={`an:${a.id}`} value={a.name} onCommit={name => update(d => void renameBankAccount(d, a.id, name))} className="ellipsis" inputClassName="cell-input is-text" disabled={locked}>
              {a.name}
            </EditableText>
          </div>
          <div className="mention">
            {receives.length > 0 && <span>Reçoit : {receives.join(', ')} · </span>}
            <span className="link" onClick={() => setHistoryFor(historyFor === a.id ? null : a.id)}>{historyFor === a.id ? 'Masquer l’historique' : 'Historique'}</span>
          </div>
        </div>
        <div>
          <div className="rel">
            <EditableAmount
              id={`ao:${a.id}`}
              value={a.openingBalance}
              disabled={locked}
              onCommit={v => v !== null && update(d => setBankAccountOpening(d, a.id, { balance: v }))}
              className="stmt-cell"
              inputClassName="cell-input is-stmt"
              title="Solde au 1er jour du mois de départ"
            >
              {money(a.openingBalance)}
            </EditableAmount>
          </div>
          <div className="accounts-sub num pad8">au 1er {monthLabel(a.openingMonth).toLowerCase()}</div>
        </div>
        <div className="num muted">{r ? money(r.in, true) : '—'}</div>
        <div className="num muted">{r ? money(-r.out) : '—'}</div>
        <b className="num">{r ? money(r.balance) : '—'}</b>
        <div>
          <div
            className="su-kind is-on"
            style={{ ...toneVars(a.hue), cursor: locked ? 'default' : 'pointer', width: 'max-content' }}
            title={IN_BUDGET_HINT}
            onClick={locked ? undefined : () => update(d => setBankAccountInBudget(d, a.id, !a.inBudget))}
          >
            {a.inBudget ? 'oui' : 'non'}
          </div>
        </div>
        <div
          className={`accounts-radio${a.isDefault ? ' is-on' : ''}${locked || a.archived ? ' is-disabled' : ''}`}
          title="Compte principal"
          onClick={locked || a.archived ? undefined : () => update(d => void setMainBankAccount(d, a.id))}
        />
        {a.archived ? (
          <span className="btn-quiet" onClick={locked ? undefined : () => update(d => unarchiveBankAccount(d, a.id))}>Désarchiver</span>
        ) : (
          <span className="icon-btn" title="Actions" onClick={locked ? undefined : () => setMenuFor(menuFor === a.id ? null : a.id)}>⋯</span>
        )}
        {menuFor === a.id && (
          <>
            <div className="backdrop" onClick={() => setMenuFor(null)} />
            <div className="popmenu accounts-menu">
              <div
                className="popmenu-item"
                onClick={() => {
                  setMenuFor(null);
                  setEditing(`an:${a.id}`);
                }}
              >
                Renommer
              </div>
              <div className="dest-group">Couleur</div>
              <div className="palette">
                {BANK_HUES.map(h => (
                  <span key={h} className={`palette-dot${a.hue === h ? ' is-on' : ''}`} style={{ background: tone(h).base }} onClick={() => update(d => setBankAccountHue(d, a.id, h))} />
                ))}
              </div>
              <div className="dest-group">Mois de départ</div>
              <div className="palette">
                <select
                  className="su-select"
                  value={a.openingMonth}
                  onChange={e => update(d => setBankAccountOpening(d, a.id, { month: e.target.value }))}
                >
                  {[...new Set([...ledger.months, a.openingMonth])].sort().map(m => (
                    <option key={m} value={m}>{monthLabel(m)}</option>
                  ))}
                </select>
              </div>
              <div
                className={`popmenu-item${blocker ? ' is-disabled' : ''}`}
                title={blocker === 'main' ? 'Choisis d’abord un autre compte principal' : blocker === 'cash' ? 'Le compte Espèces ne peut pas être archivé' : undefined}
                onClick={() => {
                  if (blocker) return;
                  setMenuFor(null);
                  archive(a);
                }}
              >
                Archiver{blocker === 'main' ? ' (compte principal)' : blocker === 'cash' ? ' (toujours actif)' : ''}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {needsOpeningBalances(data) && !locked && (
        <div className="banner">
          <div className="banner-icon">
            <Icon name="alert" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">Saisis les soldes de départ</div>
            <div className="banner-text">Indique le solde de ton compte principal et d’Espèces au 1er jour de leur mois de départ : sans lui, les soldes calculés sont faux.</div>
          </div>
          <div className="btn-quiet" onClick={() => update(d => confirmOpeningBalances(d))}>
            C’est bon, 0 € partout
          </div>
        </div>
      )}
      <div className="panel-lg" style={toneVars(200)}>
        <div className="accounts-grid accounts-cols">
          <span>Compte</span>
          <span className="num pad8">Départ</span>
          <span className="num">Entrées</span>
          <span className="num">Sorties</span>
          <span className="num">Solde</span>
          <span>Budget</span>
          <span className="num" style={{ textAlign: 'center' }}>Principal</span>
          <span />
        </div>
        {active.map(row)}
        <div style={{ height: 8 }} />
      </div>
      {historyFor && <AccountHistory accountId={historyFor} />}
      <div className="pointage-start">
        <span>Pointage depuis :</span>
        <select
          className="su-select"
          value={start ?? ''}
          onChange={e => {
            const next = e.target.value === '' ? null : e.target.value;
            if (!canSetPointageStart(data, next)) return setStartError('Ce changement modifierait un mois clôturé : rouvre-le d’abord.');
            setStartError(null);
            update(d => void setPointageStart(d, next));
          }}
        >
          <option value="">Aucun (tout est compté au réel)</option>
          {[...new Set([...ledger.months, ...(start ? [start] : [])])].sort().map(m => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <span className="accounts-sub">Avant ce mois, le Solde estimé suit le réel ; à partir de ce mois, il suit les pointages.</span>
        {startError && <span className="env-tile-error">{startError}</span>}
      </div>
      <div className="pointage-start">
        <span>Compte des enveloppes :</span>
        <select className="su-select" value={envelopeDefaultAccountId(data)} onChange={e => {
            // The choices are active accounts other than « Espèces »: the action cannot refuse, its result is ignored on purpose.
            const id = e.target.value;
            update(d => void setEnvelopeDefaultAccount(d, id));
          }}>
          {active.filter(a => a.id !== CASH_ACCOUNT_ID).map(a => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <span className="accounts-sub">Les enveloppes sans compte propre utilisent ce compte. Une allocation pointée sort du principal vers lui.</span>
      </div>
      {archived.length > 0 && (
        <div className="panel-lg">
          <div className="accounts-fold" onClick={() => setShowArchived(o => !o)}>
            <Icon name={showArchived ? 'chevronDown' : 'chevronRight'} size={14} />
            Archivés ({archived.length})
          </div>
          {showArchived && archived.map(row)}
        </div>
      )}
    </>
  );
}

/** Month-by-month history of a bank account: opening, money in and out, balance (spec 0007, RG15). Latest month first. */
function AccountHistory({ accountId }: { accountId: string }) {
  const { data, ledger } = useStore();
  const account = data.accounts.find(a => a.id === accountId);
  if (!account) return null;
  const rows = ledger.months.flatMap(m => {
    const r = ledger.bankMonth(accountId, m);
    return r ? [{ m, r }] : [];
  }).reverse();
  return (
    <div className="panel-lg" style={toneVars(account.hue)}>
      <div className="accounts-name" style={{ padding: '14px 22px 6px' }}>
        <AccountDot account={account} />
        <b>{account.name}</b>
        <span className="muted">Historique mensuel</span>
      </div>
      <div className="history-grid accounts-cols">
        <span>Mois</span>
        <span className="num">Début</span>
        <span className="num">Entrées</span>
        <span className="num">Sorties</span>
        <span className="num">Solde</span>
      </div>
      {rows.map(({ m, r }) => (
        <div key={m} className="history-grid history-row">
          <span>{monthLabel(m)}</span>
          <span className="num muted">{money(r.start)}</span>
          <span className="num muted">{money(r.in, true)}</span>
          <span className="num muted">{money(-r.out)}</span>
          <b className="num">{money(r.balance)}</b>
        </div>
      ))}
      <div style={{ height: 8 }} />
    </div>
  );
}
