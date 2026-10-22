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
  setBankAccountKind,
  setBankAccountOpening,
  setMainBankAccount,
  unarchiveBankAccount,
} from '../../application/bankAccounts';
import { decideAccountKind, linkLineToAccount } from '../../application/accountKinds';
import { setPointageStart } from '../../application/checkoff';
import { collidingLine, kindCandidates, kindMismatches } from '../../domain/accountKind';
import { BANK_HUES, isEnvelopeAccount, isKindFixed, kindOf } from '../../domain/bank';
import { canSetPointageStart } from '../../domain/checkoff';
import { IN_BUDGET_HINT } from '../components/hints';
import { money, monthLabel, round2 } from '../../domain/format';
import { isMonthLocked, monthLines } from '../../domain/ledger';
import type { AccountKind, BankAccount, MonthKey } from '../../domain/types';
import { newId, useStore } from '../state/store';
import { useUi } from '../state/ui';

/** Kinds the user can choose (spec 0010, RG3). « enveloppe » is never chosen: the account of an envelope is made with its envelope (spec 0011, RG3). */
const KIND_CHOICES: { value: AccountKind; label: string }[] = [
  { value: 'courant', label: 'Courant' },
  { value: 'epargne', label: 'Épargne' },
  { value: 'invest', label: 'Investissement' },
];
const KIND_LABEL: Record<AccountKind, string> = { courant: 'courant', epargne: 'épargne', invest: 'investissement', enveloppe: 'enveloppe' };

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
  // The accounts of the envelopes are grouped and folded by default, with their total (spec 0011, Q10).
  const [showEnvelopes, setShowEnvelopes] = useState(false);
  // Account whose month-by-month history is open (spec 0007, RG15).
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  // Panel listing the accounts that seem counted twice (spec 0010, RG18).
  const [reviewing, setReviewing] = useState(false);
  const candidates = kindCandidates(data);
  const mismatches = kindMismatches(data);
  const start = data.settings.pointageStart;
  const locked = isMonthLocked(data, month);
  const active = data.accounts.filter(a => !a.archived && !isEnvelopeAccount(a));
  const envelopeAccounts = data.accounts.filter(a => !a.archived && isEnvelopeAccount(a));
  const envelopeTotal = round2(envelopeAccounts.reduce((sum, a) => sum + (ledger.bankMonth(a.id, month)?.balance ?? 0), 0));
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
    const collision = collidingLine(data, a.name, a.id);
    const receives = savingsLines.filter(l => l.linkedAccountId === a.id).map(l => l.name);
    // The name, the kind and the budget status of an envelope's account follow its envelope (spec 0011, RG3, RG4).
    const fromEnvelope = isEnvelopeAccount(a);
    return (
      <div key={a.id} className={`accounts-grid accounts-row${a.archived ? ' is-archived' : ''}`}>
        <div>
          <div className="accounts-name">
            <AccountDot account={a} />
            <EditableText id={`an:${a.id}`} value={a.name} onCommit={name => update(d => void renameBankAccount(d, a.id, name))} className="ellipsis" inputClassName="cell-input is-text" disabled={locked || fromEnvelope}>
              {a.name}
            </EditableText>
          </div>
          {!isKindFixed(a) && (
            <div className="su-kinds" style={{ marginTop: 4, ...toneVars(a.hue) }}>
              {KIND_CHOICES.map(k => (
                <div key={k.value} className={`su-kind${kindOf(a) === k.value ? ' is-on' : ''}`} onClick={() => update(d => void setBankAccountKind(d, a.id, k.value))}>{k.label}</div>
              ))}
            </div>
          )}
          {collision && !a.archived && (
            <div className="mention">
              <span className="env-tile-error">Une ligne d’épargne porte déjà ce nom. Liez-la à ce compte pour éviter de la compter deux fois.</span>{' '}
              <span className="link" onClick={() => update(d => void linkLineToAccount(d, collision.key, a.id))}>Lier à la ligne</span>
            </div>
          )}
          <div className="mention">
            {mismatches[a.id] && <span className="env-tile-error">Type à revoir ({mismatches[a.id].join(', ')}) · </span>}
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
            style={{ ...toneVars(a.hue), cursor: locked || fromEnvelope ? 'default' : 'pointer', width: 'max-content' }}
            title={fromEnvelope ? 'Le compte d’une enveloppe est toujours dans le budget' : IN_BUDGET_HINT}
            onClick={locked || fromEnvelope ? undefined : () => update(d => setBankAccountInBudget(d, a.id, !a.inBudget))}
          >
            {a.inBudget ? 'oui' : 'non'}
          </div>
        </div>
        {fromEnvelope ? (
          <span />
        ) : (
          <div
            className={`accounts-radio${a.isDefault ? ' is-on' : ''}${locked || a.archived ? ' is-disabled' : ''}`}
            title="Compte principal"
            onClick={locked || a.archived ? undefined : () => update(d => void setMainBankAccount(d, a.id))}
          />
        )}
        {a.archived ? (
          fromEnvelope ? <span /> : <span className="btn-quiet" onClick={locked ? undefined : () => update(d => unarchiveBankAccount(d, a.id))}>Désarchiver</span>
        ) : fromEnvelope ? (
          <span />
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
                title={blocker === 'main' ? 'Choisis d’abord un autre compte principal' : blocker === 'cash' ? 'Le compte Espèces ne peut pas être archivé' : blocker === 'envelope' ? 'Supprime l’enveloppe pour archiver son compte' : undefined}
                onClick={() => {
                  if (blocker) return;
                  setMenuFor(null);
                  archive(a);
                }}
              >
                Archiver{blocker === 'main' ? ' (compte principal)' : blocker === 'cash' ? ' (toujours actif)' : blocker === 'envelope' ? ' (enveloppe)' : ''}
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <>
      {candidates.length > 0 && (
        <div className="banner">
          <div className="banner-icon">
            <Icon name="alert" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">
              {candidates.length} {candidates.length > 1 ? 'comptes semblent comptés' : 'compte semble compté'} deux fois dans la clôture.
            </div>
            <div className="banner-text">Un compte porte le même nom qu’une ligne d’épargne ou d’investissement. Confirme leur lien pour ne les compter qu’une fois.</div>
          </div>
          <div className="btn-quiet" onClick={() => setReviewing(o => !o)}>{reviewing ? 'Masquer' : 'Vérifier'}</div>
        </div>
      )}
      {candidates.length > 0 && reviewing && (
        <div className="panel-lg">
          {candidates.map(c => {
            const a = data.accounts.find(x => x.id === c.accountId);
            if (!a) return null;
            const kind: AccountKind = c.block === 'epa' ? 'epargne' : 'invest';
            return (
              <div key={c.accountId} className="accounts-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 22px' }}>
                <AccountDot account={a} />
                <b>{a.name}</b>
                <span className="muted" style={{ flex: 1 }}>
                  ligne « {c.lineName} » ({KIND_LABEL[kind]})
                  {c.taken && ' · déjà liée à un autre compte'}
                  {c.shared && !c.taken && ' · plusieurs comptes portent ce nom : choisis celui à lier'}
                </span>
                {!c.taken && (
                  <span className="btn-quiet" onClick={() => update(d => void linkLineToAccount(d, c.lineKey, c.accountId))}>Confirmer {KIND_LABEL[kind]}</span>
                )}
                <select
                  className="su-select"
                  value=""
                  onChange={e => e.target.value && update(d => void decideAccountKind(d, c.accountId, e.target.value as AccountKind))}
                >
                  <option value="">Autre type, sans lien…</option>
                  {KIND_CHOICES.filter(k => k.value !== 'courant').map(k => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
                <span className="btn-quiet" onClick={() => update(d => void decideAccountKind(d, c.accountId, 'courant'))}>Garder courant</span>
              </div>
            );
          })}
        </div>
      )}
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
      {envelopeAccounts.length > 0 && (
        <div className="panel-lg" style={toneVars(280)}>
          <div className="accounts-fold" onClick={() => setShowEnvelopes(o => !o)}>
            <Icon name={showEnvelopes ? 'chevronDown' : 'chevronRight'} size={14} />
            Enveloppes ({envelopeAccounts.length}) · <b>{money(envelopeTotal)}</b>
          </div>
          {showEnvelopes && envelopeAccounts.map(row)}
        </div>
      )}
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
