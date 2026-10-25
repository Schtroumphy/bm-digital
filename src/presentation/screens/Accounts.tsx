import { useEffect, useRef, useState } from 'react';
import { AccountDot } from '../components/AccountPicker';
import { EditableAmount, EditableText } from '../components/Editable';
import { Icon } from '../components/Icon';
import { GOOD, tone, toneVars } from '../components/tone';
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
import { collidingLine, kindCandidates, kindMismatches } from '../../domain/accountKind';
import { BANK_HUES, CASH_ACCOUNT_ID, isEnvelopeAccount, isKindFixed, kindOf } from '../../domain/bank';
import { attachedMovements, realMovements } from '../../domain/bankMovements';
import { IN_BUDGET_HINT, OPENING_MESSAGE } from '../components/hints';
import { openingCashRefusal, setEnvelopeOpeningCash } from '../../application/envelopes';
import { envelopeAccountTotal, envelopeCash, envelopesGroupTotals } from '../../domain/envelopeCash';
import { money, monthLabel, round2 } from '../../domain/format';
import { isMonthLocked, monthLines } from '../../domain/ledger';
import type { AccountKind, BankAccount, MonthKey, TxType } from '../../domain/types';
import { newId, useStore } from '../state/store';
import { useUi } from '../state/ui';

/** Kinds the user can choose (spec 0010, RG3). « enveloppe » is never chosen: the account of an envelope is made with its envelope (spec 0011, RG3). */
const KIND_CHOICES: { value: AccountKind; label: string }[] = [
  { value: 'courant', label: 'Courant' },
  { value: 'epargne', label: 'Épargne' },
  { value: 'invest', label: 'Investissement' },
];
const KIND_LABEL: Record<AccountKind, string> = { courant: 'courant', epargne: 'épargne', invest: 'investissement', enveloppe: 'enveloppe' };

/** Tooltip of « Solde virtuel » on the cards of an envelope's account (spec 0026, D36). */
const VIRTUAL_HINT = 'Solde réel du compte de l’enveloppe, hors espèces';

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

type Group = 'main' | 'other' | 'env' | 'sav' | 'inv';
type Tab = 'view' | 'setup';
type PanelTab = 'moves' | 'hist';

const GROUPS: { id: Group; title: string; sub: string }[] = [
  { id: 'main', title: 'Compte principal', sub: 'Là où tombent les revenus et partent les prélèvements' },
  { id: 'other', title: 'Autres comptes', sub: 'Espèces, titres-restaurant…' },
  { id: 'env', title: 'Enveloppes', sub: 'Budgets mis de côté, dépensés au fil du mois' },
  { id: 'sav', title: 'Épargne', sub: 'Comptes et livrets' },
  { id: 'inv', title: 'Investissements', sub: 'Bourse et placements long terme' },
];
const MOVE_KIND: Record<string, string> = { expense: 'Écriture', transfer: 'Transfert', adjustment: 'Régularisation' };
/** Nature of an expense or an entry, read from the budget item it is attached to. */
const IMPUTATION_KIND: Record<TxType, string> = { var: 'Dépense variable', env: 'Enveloppe', epa: 'Sortie d’épargne', fix: 'Ligne fixe / crédit', rev: 'Entrée d’argent' };

const groupOf = (a: BankAccount): Group =>
  isEnvelopeAccount(a) ? 'env' : a.isDefault ? 'main' : kindOf(a) === 'epargne' ? 'sav' : kindOf(a) === 'invest' ? 'inv' : 'other';
const tagOf = (a: BankAccount, g: Group) => (g === 'main' ? 'Principal' : g === 'env' ? 'Enveloppe' : g === 'sav' ? 'Épargne' : g === 'inv' ? 'Investissement' : a.inBudget ? 'Autre compte' : 'Hors budget');
/** Savings and investment accounts are read by what is paid in; the others by what is spent. */
const isSaving = (g: Group) => g === 'sav' || g === 'inv';
const dayOf = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

export function AccountsScreen({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  const [tab, setTab] = useState<Tab>('view');
  // Account whose movements are open in the side panel (spec 0007, RG15) and the part of it that is shown.
  const [selected, setSelected] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('moves');
  // Account whose colour palette is open, and the account whose row menu is.
  const [hueFor, setHueFor] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Panel listing the accounts that seem counted twice (spec 0010, RG18).
  const [reviewing, setReviewing] = useState(false);
  const candidates = kindCandidates(data);
  const mismatches = kindMismatches(data);
  const locked = isMonthLocked(data, month);
  const active = data.accounts.filter(a => !a.archived);
  const archived = data.accounts.filter(a => a.archived);
  const lastMonth = ledger.months[ledger.months.length - 1];
  const savingsLines = monthLines(data, month).filter(l => (l.block === 'epa' || l.block === 'inv') && l.linkedAccountId);
  const unconfirmed = data.accounts.filter(a => (a.isDefault || a.id === CASH_ACCOUNT_ID) && a.openingBalance === 0 && !a.openingConfirmed).length;

  // Only the REAL balance is shown here (spec 0019, RG5): the end-of-month balance of each account.
  const balanceOf = (id: string) => ledger.bankMonth(id, month)?.balance ?? 0;
  const byGroup = (g: Group) => active.filter(a => groupOf(a) === g).sort((x, y) => Number(y.isDefault) - Number(x.isDefault));
  const totalOf = (list: BankAccount[]) => round2(list.reduce((sum, a) => sum + balanceOf(a.id), 0));
  const withCash = envelopesGroupTotals(data, ledger, month);
  const current = active.filter(a => ['main', 'other'].includes(groupOf(a)));
  const wealth = active.filter(a => isSaving(groupOf(a)));
  const open = active.find(a => a.id === selected) ?? null;

  const archive = (a: BankAccount) => {
    const balance = ledger.bankMonth(a.id, lastMonth)?.balance ?? 0;
    if (balance !== 0 && !window.confirm(`« ${a.name} » a un solde de ${money(balance)}. L’archiver quand même ? Son historique reste visible.`)) return;
    update(d => void archiveBankAccount(d, a.id));
    if (selected === a.id) setSelected(null);
  };

  const card = (a: BankAccount) => {
    const g = groupOf(a);
    const r = ledger.bankMonth(a.id, month);
    const env = g === 'env' ? data.envelopes.find(e => e.id === a.envelopeId) : undefined;
    const em = env ? ledger.envMonth(env.id, month) : null;
    const envTotal = env ? envelopeAccountTotal(data, ledger, env.id, month) : null;
    const flow = r ? (isSaving(g) ? r.in : r.out) : 0;
    const cumul = round2(ledger.months.filter(m => m <= month).reduce((sum, m) => sum + ((isSaving(g) ? ledger.bankMonth(a.id, m)?.in : ledger.bankMonth(a.id, m)?.out) ?? 0), 0));
    const flowLabel = isSaving(g) ? (g === 'inv' ? 'Investi ce mois' : 'Versé ce mois') : 'Dépensé ce mois';
    // A spending account splits its outflow: real spending, and money sent to another account (transfers are not spending).
    const sentOut = isSaving(g) ? 0 : round2(-realMovements(data, a.id, month).filter(x => x.kind === 'transfer' && x.amount < 0).reduce((sum, x) => sum + x.amount, 0));
    const spent = round2(flow - sentOut);
    const on = selected === a.id;
    return (
      <article key={a.id} className={`cpt-card${on ? ' is-on' : ''}`} style={toneVars(a.hue)}>
        <div className="cpt-card-head">
          <span className="dot is-10" style={{ background: tone(a.hue).base }} />
          <button className="cpt-open" aria-pressed={on} onClick={() => { setSelected(on ? null : a.id); setPanelTab('moves'); }}>{a.name}</button>
          <span className="cpt-tag">{tagOf(a, g)}</span>
        </div>
        <div className={env ? 'cpt-pair' : undefined}>
          <div>
            <div className="kpi-label" title={env ? VIRTUAL_HINT : undefined}>{env ? 'Solde virtuel' : 'Solde réel'}</div>
            <div className="cpt-solde">{r ? money(r.balance) : '—'}</div>
          </div>
          {env && (
            <div title="Solde espèces de l’enveloppe : à part du solde du compte, il n’est compté dans aucun total de cet écran.">
              <div className="kpi-label">Espèces</div>
              <div className="cpt-solde">{money(envelopeCash(data, env.id, month))}</div>
            </div>
          )}
        </div>
        <div className="cpt-flow">
          <span className="muted">{isSaving(g) ? flowLabel : 'Dépenses ce mois'}</span>
          <b>{money(isSaving(g) ? flow : spent)}</b>
          <span className="cpt-tip" title={`Cumulé depuis ${monthLabel(a.openingMonth).toLowerCase()} : ${money(cumul)} ${isSaving(g) ? 'versés' : 'sortis (dépenses et virements)'}.`} aria-label="Voir le cumulé">i</span>
        </div>
        {!isSaving(g) && (
          <div className="cpt-flow">
            <span className="muted">Virements sortants</span>
            <b>{money(sentOut)}</b>
          </div>
        )}
        {em && em.alloc > 0 && (
          <div>
            <div className="split-bar"><div style={{ width: `${Math.min(100, Math.round((em.spent / em.alloc) * 100))}%`, background: 'var(--t-base)' }} /></div>
            <div className="muted is-small">{money(em.spent)} sur {money(em.alloc)} alloués</div>
          </div>
        )}
        {envTotal && (
          <div className="cpt-flow" title="Solde virtuel du compte + espèces. Chiffre d’affichage : il n’entre dans aucun total de cet écran.">
            <b>Total</b>
            <b>{money(envTotal.total)}</b>
          </div>
        )}
      </article>
    );
  };

  const overview = (
    <>
      <section className="cpt-kpis" aria-label="Synthèse">
        <div className="panel kpi">
          <div className="kpi-label">Disponible sur les comptes courants</div>
          <div className="kpi-value">{money(totalOf(current))}</div>
          <div className="muted is-small">Solde réel · {current.map(a => a.name).join(', ')}</div>
        </div>
        <div className="panel kpi">
          <div className="kpi-label">Épargne et investissements</div>
          <div className="kpi-value">{money(totalOf(wealth))}</div>
          <div className="muted is-small">Solde réel · livrets, bourse, placements</div>
        </div>
      </section>
      {GROUPS.map(g => {
        const list = byGroup(g.id);
        if (list.length === 0) return null;
        return (
          <section key={g.id} className="cpt-group">
            <div className="cpt-group-head">
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 className="cpt-group-title">{g.title}</h2>
                <span className="muted">{g.sub}</span>
              </div>
              <div className="num">
                <div className="cpt-group-total-label">Total</div>
                <div className="cpt-group-total">{money(totalOf(list))}</div>
                {g.id === 'env' && withCash.cash !== 0 && (
                  <div className="muted is-small" title="Soldes réels des enveloppes + espèces. Chiffre d’affichage : il n’entre dans aucun total de cet écran.">
                    avec espèces {money(withCash.withCash)}
                  </div>
                )}
              </div>
            </div>
            <div className="cpt-cards">{list.map(card)}</div>
          </section>
        );
      })}
    </>
  );

  const setupCard = (a: BankAccount) => {
    const g = groupOf(a);
    const blocker = archiveBlocker(data, a.id);
    const collision = collidingLine(data, a.name, a.id);
    const receives = savingsLines.filter(l => l.linkedAccountId === a.id).map(l => l.name);
    // The name, the kind and the budget status of an envelope's account follow its envelope (spec 0011, RG3, RG4).
    const fromEnvelope = g === 'env';
    // The opening cash of the envelope (spec 0026, RG20): same data as in the Enveloppes screen and the assistant. An archived account has no card here (D21).
    const env = fromEnvelope ? data.envelopes.find(e => e.accountId === a.id) : undefined;
    const cashLocked = isMonthLocked(data, a.openingMonth);
    const confirmed = !!a.openingConfirmed || !(a.isDefault || a.id === CASH_ACCOUNT_ID) || a.openingBalance !== 0;
    return (
      <article key={a.id} className={`cpt-card${a.isDefault ? ' is-on' : ''}`} style={toneVars(a.hue)}>
        <div className="cpt-card-head">
          <span className="dot is-12 cpt-hue" role="button" aria-label="Changer la couleur" style={{ background: tone(a.hue).base }} onClick={() => setHueFor(hueFor === a.id ? null : a.id)} />
          <EditableText id={`an:${a.id}`} value={a.name} onCommit={name => update(d => void renameBankAccount(d, a.id, name))} className="ellipsis cpt-name" inputClassName="cell-input is-text" disabled={locked || fromEnvelope}>
            {a.name}
          </EditableText>
          <span className="cpt-tag" style={confirmed ? undefined : { background: 'var(--warn-bg)', color: 'var(--warn-ink)' }}>{confirmed ? 'Confirmé' : 'À confirmer'}</span>
        </div>
        {hueFor === a.id && (
          <div className="palette cpt-palette">
            {BANK_HUES.map(h => (
              <span key={h} className={`palette-dot${a.hue === h ? ' is-on' : ''}`} style={{ background: tone(h).base }} onClick={() => update(d => setBankAccountHue(d, a.id, h))} />
            ))}
          </div>
        )}
        {collision && (
          <div className="mention">
            <span className="env-tile-error">Une ligne d’épargne porte déjà ce nom. Liez-la à ce compte pour éviter de la compter deux fois.</span>{' '}
            <span className="link" onClick={() => update(d => void linkLineToAccount(d, collision.key, a.id))}>Lier à la ligne</span>
          </div>
        )}
        {(mismatches[a.id] || receives.length > 0) && (
          <div className="mention">
            {mismatches[a.id] && <span className="env-tile-error">Type à revoir ({mismatches[a.id].join(', ')}) · </span>}
            {receives.length > 0 && <span>Reçoit : {receives.join(', ')}</span>}
          </div>
        )}
        {!isKindFixed(a) && (
          <div className="su-kinds" style={toneVars(a.hue)}>
            {KIND_CHOICES.map(k => (
              <div key={k.value} className={`su-kind${kindOf(a) === k.value ? ' is-on' : ''}`} onClick={() => update(d => void setBankAccountKind(d, a.id, k.value))}>{k.label}</div>
            ))}
          </div>
        )}
        <div>
          <div className="kpi-label cpt-label-tip">Solde de départ, au 1er {monthLabel(a.openingMonth).toLowerCase()}<span className="cpt-tip" title="Solde du compte le 1er jour du mois de départ, avant toute écriture de ce mois. Ce que le compte a reçu ou payé avant (un salaire reçu le 30 du mois précédent, par exemple) y est déjà : ne le retranchez pas." aria-label="Voir l’explication">i</span></div>
          <EditableAmount
            id={`ao:${a.id}`}
            value={a.openingBalance}
            disabled={locked}
            onCommit={v => v !== null && update(d => setBankAccountOpening(d, a.id, { balance: v }))}
            className="cpt-opening"
            inputClassName="cell-input is-stmt"
            title="Solde au 1er jour du mois de départ"
          >
            {money(a.openingBalance)}
          </EditableAmount>
          <select className="su-select" aria-label="Mois de départ" disabled={locked} value={a.openingMonth} onChange={e => update(d => setBankAccountOpening(d, a.id, { month: e.target.value }))}>
            {[...new Set([...ledger.months, a.openingMonth])].sort().map(m => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>
        </div>
        {env && (
          <div>
            <div className="kpi-label cpt-label-tip">Espèces de départ (à part), au 1er {monthLabel(a.openingMonth).toLowerCase()}<span className="cpt-tip" title="Espèces de l’enveloppe au 1er jour du mois de départ. Ce n’est pas un solde du compte : elles n’entrent pas dans son solde réel." aria-label="Voir l’explication">i</span></div>
            <EditableAmount
              id={`aoc:${a.id}`}
              value={env.openingCash}
              disabled={cashLocked}
              onCommit={v => {
                if (v === null) return;
                const refused = openingCashRefusal(data, env.id, v);
                if (refused) return void window.alert(OPENING_MESSAGE[refused]);
                update(d => void setEnvelopeOpeningCash(d, env.id, v));
              }}
              className="cpt-opening"
              inputClassName="cell-input is-stmt"
              title={cashLocked ? 'Le mois de départ est clos ou verrouillé : le départ en espèces n’est plus modifiable.' : 'Espèces au 1er jour du mois de départ'}
            >
              {money(env.openingCash)}
            </EditableAmount>
          </div>
        )}
        {!fromEnvelope && (
          <div className="cpt-switches">
            <button className={`cpt-switch${a.isDefault ? ' is-on' : ''}`} aria-pressed={a.isDefault} disabled={locked || a.isDefault} onClick={() => update(d => void setMainBankAccount(d, a.id))}>
              <span className="accounts-radio" style={a.isDefault ? { borderWidth: 5, borderColor: 'var(--ink)' } : undefined} />
              <b>Compte principal</b>
              <span className="muted is-small cpt-switch-hint">Reçoit les revenus</span>
            </button>
            <button className="cpt-switch" role="switch" aria-checked={a.inBudget} title={IN_BUDGET_HINT} disabled={locked || a.isDefault} onClick={() => update(d => setBankAccountInBudget(d, a.id, !a.inBudget))}>
              <b>Dans le budget</b>
              <span className="muted is-small cpt-switch-hint">{a.isDefault ? 'Toujours dans le budget' : a.inBudget ? 'Compte dans le mois' : 'Solde seul'}</span>
              <span className={`cpt-track${a.inBudget ? ' is-on' : ''}`}><span /></span>
            </button>
          </div>
        )}
        <div className="cpt-card-foot">
          <span className="cpt-foot-pair">
            <span className="muted" title={env ? VIRTUAL_HINT : undefined}>{env ? 'Solde virtuel' : 'Solde réel'}</span>
            <b>{money(balanceOf(a.id))}</b>
          </span>
          {env && (
            <>
              <span className="cpt-foot-pair">
                <span className="muted" title="Solde espèces de l’enveloppe, à part du solde du compte">Espèces</span>
                <b>{money(envelopeCash(data, env.id, month))}</b>
              </span>
              <span className="cpt-foot-pair">
                <span className="muted" title="Solde virtuel du compte + espèces (affichage seulement)">Total</span>
                <b>{money(envelopeAccountTotal(data, ledger, env.id, month)?.total ?? balanceOf(a.id))}</b>
              </span>
            </>
          )}
          {!fromEnvelope && (
            <button className={`btn-quiet cpt-archive${blocker ? ' is-disabled' : ''}`} disabled={locked || !!blocker} title={blocker === 'main' ? 'Choisis d’abord un autre compte principal' : blocker === 'cash' ? 'Le compte Espèces ne peut pas être archivé' : undefined} onClick={() => archive(a)}>
              Archiver
            </button>
          )}
        </div>
      </article>
    );
  };

  const setup = (
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
      <p className="intro">Le solde de départ est le seul endroit où l’on saisit un solde : le solde réel s’en déduit en y ajoutant les écritures réelles (dépenses, entrées d’argent, transferts, régularisations).</p>
      {GROUPS.map(g => {
        const list = byGroup(g.id);
        if (list.length === 0) return null;
        return (
          <section key={g.id} className="cpt-group">
            <div className="cpt-group-head">
              <div>
                <h2 className="cpt-group-title">{g.title}</h2>
                <span className="muted">{g.sub}</span>
              </div>
            </div>
            <div className="cpt-cards">{list.map(setupCard)}</div>
          </section>
        );
      })}
      {archived.length > 0 && (
        <div className="panel-lg">
          <div className="accounts-fold" onClick={() => setShowArchived(o => !o)}>
            <Icon name={showArchived ? 'chevronDown' : 'chevronRight'} size={14} />
            Archivés ({archived.length})
          </div>
          {showArchived &&
            archived.map(a => (
              <div key={a.id} className="accounts-name" style={{ padding: '8px 22px' }}>
                <AccountDot account={a} />
                <span style={{ flex: 1 }}>{a.name}</span>
                {!isEnvelopeAccount(a) && <span className="btn-quiet" onClick={locked ? undefined : () => update(d => unarchiveBankAccount(d, a.id))}>Restaurer</span>}
              </div>
            ))}
        </div>
      )}
    </>
  );

  // Control of the balances: opening + real movements = real balance (spec 0019, RG1, RG5).
  const recap = (
    <aside className="cpt-aside" aria-label="Contrôle des soldes">
      <div className="cpt-aside-head" style={toneVars(300)}>
        <h2 className="cpt-group-title">Contrôle des soldes</h2>
        <span className="muted">Départ + écritures réelles = solde réel</span>
      </div>
      <ul className="cpt-list">
        {active.map(a => {
          const bal = balanceOf(a.id);
          return (
            <li key={a.id} className="cpt-recap" style={toneVars(a.hue)}>
              <div className="accounts-name">
                <AccountDot account={a} />
                <b className="ellipsis">{a.name}</b>
                <span className="cpt-recap-tag">{tagOf(a, groupOf(a))}</span>
              </div>
              <div className="cpt-recap-grid">
                <div><div className="muted is-small">Départ</div><b>{money(a.openingBalance)}</b></div>
                <div><div className="muted is-small">Écritures</div><b>{money(round2(bal - a.openingBalance), true)}</b></div>
                <div><div className="muted is-small" title={isEnvelopeAccount(a) ? VIRTUAL_HINT : undefined}>{isEnvelopeAccount(a) ? 'Solde virtuel' : 'Solde réel'}</div><b>{money(bal)}</b></div>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="cpt-recap-total">
        <b>Total des comptes</b>
        <span className="cpt-group-total">{money(totalOf(active))}</span>
      </div>
      <p className="muted is-small cpt-aside-note">Les comptes hors budget comptent dans ce total, mais leurs opérations restent à l’écart des chiffres du mois. Les enveloppes sont une part des comptes bancaires : ce total est donc un repère, pas un patrimoine net.</p>
    </aside>
  );

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
      <div className="tabs" role="group" aria-label="Mode d’affichage">
        <div className={`tab${tab === 'view' ? ' is-active' : ''}`} onClick={() => setTab('view')}>Vue d’ensemble</div>
        <div className={`tab${tab === 'setup' ? ' is-active' : ''}`} onClick={() => setTab('setup')}>
          Départ et réglages
          {unconfirmed > 0 && <span className="late-badge">{unconfirmed}</span>}
        </div>
      </div>
      <div className="cpt-layout">
        <div className="cpt-main">{tab === 'view' ? overview : setup}</div>
        {tab === 'setup' && recap}
        {tab === 'view' && open && <AccountPanel account={open} month={month} tab={panelTab} setTab={setPanelTab} onClose={() => setSelected(null)} />}
      </div>
    </>
  );
}

/** Side panel of an account: its real movements of the month, and its month-by-month history (spec 0007, RG15). Latest first. */
function AccountPanel({ account, month, tab, setTab, onClose }: { account: BankAccount; month: MonthKey; tab: PanelTab; setTab: (t: PanelTab) => void; onClose: () => void }) {
  const { data, ledger } = useStore();
  const asideRef = useRef<HTMLElement>(null);
  // Picking an account brings the top of its panel into view.
  useEffect(() => { asideRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, [account.id]);
  const g = groupOf(account);
  const r = ledger.bankMonth(account.id, month);
  const moves = [...realMovements(data, account.id, month), ...attachedMovements(data, account.id, month)].sort((x, y) => y.date.localeCompare(x.date));
  const rows = ledger.months.flatMap(m => {
    const b = ledger.bankMonth(account.id, m);
    return b ? [{ m, b }] : [];
  }).reverse();
  const flowOf = (b: { in: number; out: number }) => (isSaving(g) ? b.in : b.out);
  const max = Math.max(1, ...rows.map(x => flowOf(x.b)));
  const past = rows.filter(x => x.m !== month);
  const average = past.length ? round2(past.reduce((sum, x) => sum + flowOf(x.b), 0) / past.length) : 0;
  const top = past.reduce<(typeof past)[number] | null>((best, x) => (!best || flowOf(x.b) > flowOf(best.b) ? x : best), null);
  return (
    <aside ref={asideRef} className="cpt-aside" aria-label="Détail des mouvements" style={toneVars(account.hue)}>
      <div className="drawer-head">
        <div className="drawer-title-row">
          <span className="dot is-12" style={{ background: tone(account.hue).base }} />
          <b className="cpt-group-title" style={{ flex: 1 }}>{account.name}</b>
          <span className="icon-btn" role="button" aria-label="Fermer le panneau" onClick={onClose}><Icon name="close" size={14} /></span>
        </div>
        <div className="cpt-panel-solde">
          <span className="drawer-solde">{r ? money(r.balance) : '—'}</span>
          <span className="muted" title={isEnvelopeAccount(account) ? VIRTUAL_HINT : undefined}>{isEnvelopeAccount(account) ? 'solde virtuel' : 'solde réel'} · fin {monthLabel(month).toLowerCase()}</span>
        </div>
        {r && (
          <div className="cpt-stats">
            <div className="stat"><div className="stat-label">Début du mois</div><div className="stat-value">{money(r.start)}</div></div>
            <div className="stat"><div className="stat-label">Entrées</div><div className="stat-value" style={{ color: GOOD }}>{money(r.in, true)}</div></div>
            <div className="stat"><div className="stat-label">Sorties</div><div className="stat-value">{money(-r.out)}</div></div>
          </div>
        )}
      </div>
      <div className="tabs cpt-panel-tabs" role="group" aria-label="Contenu du compte">
        <div className={`tab${tab === 'moves' ? ' is-active' : ''}`} onClick={() => setTab('moves')}>Mouvements</div>
        <div className={`tab${tab === 'hist' ? ' is-active' : ''}`} onClick={() => setTab('hist')}>Historique</div>
      </div>
      {tab === 'moves' ? (
        moves.length === 0 ? (
          <div className="empty">Aucune écriture ce mois-ci.</div>
        ) : (
          <ul className="cpt-list">
            {moves.map((mv, i) => (
              <li key={i} className="cpt-move" style={mv.outOfMonth ? { opacity: 0.65 } : undefined} title={mv.outOfMonth ? `Rattachée à ${monthLabel(month).toLowerCase()}, datée du ${mv.date.slice(8, 10)}/${mv.date.slice(5, 7)}/${mv.date.slice(0, 4)} : comptée dans le solde de ${monthLabel(mv.date.slice(0, 7)).toLowerCase()}.` : undefined}>
                <span className="cpt-move-date">{dayOf(mv.date)}</span>
                <span className="cpt-move-label">
                  <span className="ellipsis" title={mv.label}>{mv.label}</span>
                  <span className="muted is-small ellipsis">{mv.imputation ? `${IMPUTATION_KIND[mv.imputation.type]} · ${mv.imputation.name}` : MOVE_KIND[mv.kind] ?? 'Écriture'}</span>
                </span>
                <b className="num" style={mv.amount > 0 ? { color: GOOD } : undefined}>{money(mv.amount, true)}</b>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="cpt-hist">
          <div className="cpt-stats is-two">
            <div className="stat"><div className="stat-label">Moyenne par mois</div><div className="stat-value">{money(average)}</div></div>
            <div className="stat"><div className="stat-label">Mois le plus haut</div><div className="stat-value">{top ? `${monthLabel(top.m)} · ${money(flowOf(top.b))}` : '—'}</div></div>
          </div>
          <div className="cpt-hist-head"><span>{isSaving(g) ? 'Versé' : 'Dépensé'}</span><span>{isEnvelopeAccount(account) ? 'Solde virtuel fin de mois' : 'Solde fin de mois'}</span></div>
          <ul className="cpt-list">
            {rows.map(({ m, b }) => (
              <li key={m} className={`cpt-hist-row${m === month ? ' is-current' : ''}`}>
                <div className="cpt-hist-line"><b>{monthLabel(m)}</b><b>{money(b.balance)}</b></div>
                <div className="cpt-hist-line">
                  <div className="split-bar" style={{ flex: 1 }}><div style={{ width: `${Math.round((flowOf(b) / max) * 100)}%`, background: 'var(--t-base)' }} /></div>
                  <span className="muted num" style={{ minWidth: 84 }}>{money(flowOf(b))}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
