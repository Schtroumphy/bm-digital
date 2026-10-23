import { Fragment, useState } from 'react';
import { AccountDot, AccountPicker } from '../components/AccountPicker';
import { EditableAmount } from '../components/Editable';
import { DetailInput } from '../components/DetailInput';
import { Icon } from '../components/Icon';
import { HUE, MUTED, tone, toneVars } from '../components/tone';
import { addTransaction, deleteTransaction, deleteTransactions, setStatement, setTransactionDetail } from '../../application/actions';
import { deleteAccountMovement, setAccountMovementDetail, updateAccountMovement } from '../../application/accountMovements';
import type { StatementSource } from '../../application/ports';
import { ImportWizard } from './ImportWizard';
import { actualReplacedBy, bankDateOf, expenseLineBlocker, isExpenseLineBlock, lineExpensesTotal } from '../../domain/lineExpenses';
import { setTransactionAccount } from '../../application/bankAccounts';
import { activeBankAccounts, bankAccount, defaultTransactionAccountId, fixedTransactionAccountId, isAccountInBudget, isEnvelopeAccount, isLineInBudget } from '../../domain/bank';
import { matchesEntrySearch } from '../../domain/detail';
import { monthSummary, variableRemaining } from '../../domain/budget';
import { addMonths, currentMonthKey, dayLabel, money, monthLabel, parseAmount, parseMonth, round2, sanitizeAmountInput } from '../../domain/format';
import { accounts, isMonthLocked, monthLines } from '../../domain/ledger';
import type { MonthKey, TxType } from '../../domain/types';
import { newId, useStore } from '../state/store';

/** Sum of the expenses of a list: an entry of money (`rev`) is never an expense (spec 0015). */
const spentOf = (xs: { type: TxType; amount: number }[]) => round2(xs.filter(t => t.type !== 'rev').reduce((a, t) => a + t.amount, 0));

const TYPE_LABEL: Record<TxType, string> = { var: 'Variable', env: 'Enveloppe', epa: 'Sortie épargne', fix: 'Ligne fixe / crédit', rev: 'Entrée d’argent' };

export function ExpensesScreen({ month, statementSource }: { month: MonthKey; statementSource: StatementSource }) {
  const [tab, setTab] = useState<'saisie' | 'soldes'>('saisie');
  const [importing, setImporting] = useState(false);
  if (importing) return <ImportWizard source={statementSource} onClose={() => setImporting(false)} />;
  return (
    <>
      <div className="import-bar">
        <div className="tabs">
          {(
            [
              ['saisie', 'Saisie des dépenses'],
              ['soldes', 'Soldes épargnes'],
            ] as const
          ).map(([id, label]) => (
            <div key={id} className={`tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
              {label}
            </div>
          ))}
        </div>
        <button type="button" className="btn-outline" onClick={() => setImporting(true)}>
          Importer
        </button>
      </div>
      {tab === 'saisie' ? <EntryTab month={month} /> : <BalancesTab month={month} />}
    </>
  );
}

/** Day given to a new expense: today in the current month, else the month's last day (past) or first day (future). */
function defaultDay(month: MonthKey) {
  const now = currentMonthKey();
  if (month === now) return new Date().getDate();
  if (month > now) return 1;
  const { year, month: m } = parseMonth(month);
  return new Date(year, m + 1, 0).getDate();
}

/** Libellé d'une écriture (+ détail) : clic souris sur le libellé, et crayon (seul arrêt clavier) visible au survol/focus pour ajouter ou modifier le détail. */
function EntryLabel({ entry, onOpen }: { entry: { id: string; label: string; detail?: string }; onOpen: (id: string, detail?: string) => void }) {
  const open = () => onOpen(entry.id, entry.detail);
  const editLabel = entry.detail ? 'Modifier le détail' : 'Ajouter un détail';
  return (
    <div className="entry-cell">
      <div className="entry-label" title={entry.detail ? `${entry.label}\n${entry.detail}` : editLabel} onClick={open}>
        <div className="ellipsis" style={{ fontWeight: 500 }}>
          {entry.label}
        </div>
        {entry.detail && <div className="entry-detail">{entry.detail}</div>}
      </div>
      <button type="button" className="entry-edit" aria-label={editLabel} title={editLabel} onClick={open}>
        <Icon name="pencil" size={12} stroke={2} />
      </button>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={`chip${on ? ' is-on' : ''}`} onClick={onClick}>
      {children}
    </div>
  );
}

function EntryTab({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  const lines = monthLines(data, month);
  const locked = isMonthLocked(data, month);
  const [form, setForm] = useState<{ label: string; detail: string; amount: string; type: TxType; target: string; accountId: string }>({ label: '', detail: '', amount: '', type: 'var', target: '', accountId: '' });
  const [filter, setFilter] = useState<{ q: string; type: TxType | 'all'; accountId: string }>({ q: '', type: 'all', accountId: 'all' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Transaction whose detail is being edited (spec 0020, RG6): allowed on a locked month too (RG11).
  const [editingDetail, setEditingDetail] = useState<{ id: string; text: string } | null>(null);
  const openDetail = (id: string, detail?: string) => setEditingDetail({ id, text: detail ?? '' });
  const saveDetail = () => {
    if (!editingDetail) return;
    const { id, text } = editingDetail;
    update(d => void setTransactionDetail(d, id, text));
    setEditingDetail(null);
  };

  const targets: [string, string][] =
    form.type === 'var' ? lines.filter(l => l.block === 'var').map(l => [l.key, l.name]) : form.type === 'env' ? data.envelopes.map(e => [e.id, e.name]) : form.type === 'fix' ? lines.filter(l => isExpenseLineBlock(l.block)).map(l => [l.key, `${l.name} (${l.block === 'cre' ? 'Crédit' : 'Fixe'}, ${bankAccount(data, l.accountId)?.name ?? ''})`]) : lines.filter(l => l.block === 'epa').map(l => [l.key, l.name]);
  const target = targets.some(t => t[0] === form.target) ? form.target : targets[0]?.[0] ?? '';
  // « Payé avec » is frozen on the account of the envelope (spec 0011, RG10) or on the account assigned to the variable line (spec 0006 amended).
  // Otherwise, until the user picks an account (form.accountId empty), it follows the payment mode of the chosen box (spec 0006, RG5).
  const fixedId = form.type === 'epa' ? undefined : fixedTransactionAccountId(data, { type: form.type, month, target });
  const envelopeAccount = form.type === 'env' ? data.accounts.find(a => a.id === data.envelopes.find(e => e.id === target)?.accountId) : data.accounts.find(a => a.id === fixedId);
  const accountId = envelopeAccount ? envelopeAccount.id : data.accounts.some(a => a.id === form.accountId && !a.archived) ? form.accountId : defaultTransactionAccountId(data, { type: form.type, month, target });
  // A withdrawal cannot be credited to the dedicated account of its savings line (spec 0007, RG7).
  const refusedAccountId = form.type === 'epa' ? lines.find(l => l.key === target)?.linkedAccountId : undefined;
  const accountRefused = accountId === refusedAccountId;
  // A fixed/credit line whose account is archived takes no expense (spec 0014).
  const lineBlocker = form.type === 'fix' && target ? expenseLineBlocker(data, month, target) : null;
  const amount = parseAmount(form.amount) ?? 0;
  // Envelope and savings expenses paid from an account out of the budget leave the budget figures alone; a variable expense always counts in its line (spec 0008, RG15, RG16).
  const budgetAmount = isAccountInBudget(data, accountId) ? amount : 0;

  const s = monthSummary(data, ledger, month);
  const txs = data.transactions.filter(t => t.month === month);
  const shown = txs
    .filter(t => filter.type === 'all' || t.type === filter.type)
    .filter(t => filter.accountId === 'all' || bankAccount(data, t.accountId)?.id === filter.accountId)
    .filter(t => matchesEntrySearch(t, filter.q))
    .sort((a, b) => b.day - a.day);
  // Only the shown rows can be selected, so a bulk delete never removes an expense the user cannot see.
  const picked = shown.filter(t => selected.has(t.id));
  const allPicked = shown.length > 0 && picked.length === shown.length;
  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const removePicked = () => {
    if (locked || picked.length === 0) return;
    if (!window.confirm(`Supprimer ${picked.length} opération${picked.length > 1 ? 's' : ''} (dépenses : ${money(spentOf(picked))}) ?`)) return;
    const ids = picked.map(t => t.id);
    update(d => void deleteTransactions(d, ids));
    setSelected(new Set());
  };
  const targetName = (type: TxType, id: string) => (type === 'env' ? data.envelopes.find(e => e.id === id)?.name : lines.find(l => l.key === id)?.name) ?? 'Supprimé';
  const targetHue = (type: TxType, id: string) => (type === 'var' || type === 'fix' ? HUE.dep : type === 'env' ? data.envelopes.find(e => e.id === id)?.hue ?? HUE.epa : HUE.epa);

  let impact: [string, string][] = [];
  if (target && form.type === 'var') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    // Only the variable lines in the budget count in « Restant des variables »; a line out of the budget leaves it unchanged (spec 0009, RG112).
    const rest = variableRemaining(data, month);
    const lineAmount = isLineInBudget(data, l) ? amount : 0;
    impact = [
      [`${l.name} · réel`, `${money(cur)} → ${money(cur + amount)}`],
      ['Restant des variables', `${money(rest)} → ${money(rest - lineAmount)}`],
    ];
  } else if (target && form.type === 'env') {
    const e = data.envelopes.find(x => x.id === target)!;
    const spent = ledger.envMonth(e.id, month)?.spent ?? 0;
    impact = [
      [`${e.name} · dépensé`, `${money(spent)} → ${money(spent + budgetAmount)}`],
      ['Épargne réelle', `${money(s.realSavings)} → ${money(s.realSavings - budgetAmount)}`],
    ];
  } else if (target && form.type === 'fix') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    const carried = lineExpensesTotal(data, month, target) !== null;
    impact = [
      [`${l.name} · réel`, `${money(cur)} → ${money(carried ? cur + amount : amount)}`],
      ['Reste à sortir', 'inchangé (budgétaire)'],
    ];
  } else if (target) {
    const out = round2(txs.filter(t => t.type === 'epa' && t.target === target).reduce((a, t) => a + t.amount, 0));
    impact = [
      [`${targetName('epa', target)} · sorties`, `${money(out)} → ${money(out + amount)}`],
      ['Épargne réelle', `${money(s.realSavings)} → ${money(s.realSavings - budgetAmount)}`],
    ];
  }

  const add = () => {
    if (!amount || amount < 0 || !target || locked || accountRefused || lineBlocker) return;
    // A typed actual on a fixed/credit line is replaced only after an explicit confirmation (spec 0014, RG6).
    const replaced = form.type === 'fix' ? actualReplacedBy(data, month, target) : null;
    if (replaced !== null && !window.confirm(`Cette ligne a un réel saisi de ${money(replaced)}. L’enregistrer le remplacera par le montant des dépenses et il ne sera pas restauré si vous supprimez ensuite la dépense. Remplacer ?`)) return;
    update(d =>
      addTransaction(d, { id: newId('t'), month, day: defaultDay(month), label: form.label.trim() || targetName(form.type, target), amount, type: form.type, target, accountId, detail: form.detail }, { replaceActual: replaced !== null }),
    );
    // Picking another account is a one-off: the next expense follows its box again.
    setForm(f => ({ ...f, label: '', detail: '', amount: '', accountId: '' }));
  };

  const flow: { label: string; value: number; hero?: boolean }[] = [
    { label: 'Épargne budgétisée', value: s.savings },
    { label: '+ Allocations des enveloppes', value: round2(s.grossSavings - s.savings) },
    { label: '− Dépenses des enveloppes', value: s.envelopeSpent },
    { label: '− Sorties des comptes d’épargne', value: s.savingsOut },
    { label: 'Épargne réelle', value: s.realSavings, hero: true },
  ];

  return (
    <div className="dep-layout">
      <div className="panel-lg form-card">
        <div className="form-title">Nouvelle dépense</div>
        <div className="form-row has-detail">
          <label className="field-w">
            <span className="field-label">Libellé</span>
            <input className="text-input" value={form.label} placeholder="Ex. Pharmacie" onChange={e => setForm(f => ({ ...f, label: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
          <label className="field-w">
            <span className="field-label">Détail</span>
            <DetailInput value={form.detail} onChange={detail => setForm(f => ({ ...f, detail }))} onEnter={add} />
          </label>
          <label className="field-w">
            <span className="field-label">Montant</span>
            <input className="text-input is-amount" value={form.amount} placeholder="0,00 €" inputMode="decimal" onChange={e => setForm(f => ({ ...f, amount: sanitizeAmountInput(e.target.value) }))} onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
        </div>
        <div>
          <div className="field-label is-gap">Type</div>
          <div className="chips">
            {(['var', 'env', 'epa', 'fix'] as const).map(t => (
              <Chip key={t} on={form.type === t} onClick={() => setForm(f => ({ ...f, type: t, target: '' }))}>
                {{ var: 'Dépense variable', env: 'Enveloppe', epa: 'Sortie épargne', fix: 'Ligne fixe / crédit' }[t]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="field-label is-gap">{form.type === 'var' ? 'Ligne de dépense variable' : form.type === 'env' ? 'Enveloppe' : form.type === 'fix' ? 'Ligne fixe ou crédit' : 'Compte d’épargne débité'}</div>
          <div className="chips is-wrap">
            {targets.map(([id, name]) => (
              <Chip key={id} on={target === id} onClick={() => setForm(f => ({ ...f, target: id }))}>
                {name}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="field-label is-gap">{form.type === 'epa' ? 'Reçu sur' : 'Payé avec'}</div>
          <div className="chips is-wrap">
            {(envelopeAccount ? [envelopeAccount] : activeBankAccounts(data)).map(a => (
              <Chip key={a.id} on={accountId === a.id} onClick={envelopeAccount ? () => undefined : () => setForm(f => ({ ...f, accountId: a.id }))}>
                <span className="acc-item">
                  <AccountDot account={a} />
                  {a.name}
                </span>
              </Chip>
            ))}
          </div>
        </div>
        {lineBlocker && <div className="alert-box">{lineBlocker}</div>}
        {accountRefused && <div className="alert-box">Choisis un compte différent du compte débité (le compte dédié de la ligne).</div>}
        <div className="impact">
          <div className="field-label">Impact sur le réel</div>
          {impact.map(([l, v]) => (
            <div key={l} className="impact-row">
              <span>{l}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className={`btn-dark is-block${!amount || locked || accountRefused || lineBlocker ? ' is-disabled' : ''}`} onClick={add}>
          <Icon name="plus" size={15} stroke={3} />
          Ajouter la dépense
        </div>
      </div>

      <div className="dep-side">
        <div className="panel-lg flow">
          {flow.map((c, i) => (
            <div key={c.label} className={`flow-cell${c.hero ? ' is-hero' : ''}${i === flow.length - 1 ? ' is-last' : ''}`}>
              <div className="flow-label">{c.label}</div>
              <div className="flow-value">{money(c.value)}</div>
            </div>
          ))}
        </div>
        <div className="panel-lg">
          <div className="tx-head">
            <div className="tx-title">Opérations de {monthLabel(month)}</div>
            <b title="Total des dépenses (les entrées d’argent ne comptent pas)">{money(spentOf(txs))}</b>
          </div>
          <div className="tx-filters">
            <input className="text-input" value={filter.q} placeholder="Rechercher un libellé ou un détail" onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} />
            <select className="text-input" value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value as TxType | 'all' }))}>
              <option value="all">Tous les types</option>
              {(Object.keys(TYPE_LABEL) as TxType[]).map(t => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <select className="text-input" value={filter.accountId} onChange={e => setFilter(f => ({ ...f, accountId: e.target.value }))}>
              <option value="all">Tous les comptes</option>
              {data.accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {picked.length > 0 && (
            <div className="tx-bulk">
              <span>
                {picked.length} sélectionnée{picked.length > 1 ? 's' : ''} · {money(spentOf(picked))}
              </span>
              <span className="btn-outline" onClick={() => setSelected(new Set())}>
                Désélectionner
              </span>
              <span className={`btn-outline is-danger${locked ? ' is-disabled' : ''}`} onClick={removePicked}>
                Supprimer la sélection
              </span>
            </div>
          )}
          <div className="tx-grid tx-cols">
            <input type="checkbox" aria-label="Tout sélectionner" checked={allPicked} disabled={locked || shown.length === 0} onChange={() => setSelected(allPicked ? new Set() : new Set(shown.map(t => t.id)))} />
            <span>Date</span>
            <span>Libellé</span>
            <span>Imputation</span>
            <span>Compte</span>
            <span className="num">Montant</span>
            <span />
          </div>
          {shown.map(t => (
            <Fragment key={t.id}>
              <div className={`tx-grid tx-row${selected.has(t.id) ? ' is-selected' : ''}`}>
                <input type="checkbox" aria-label={`Sélectionner ${t.label}`} checked={selected.has(t.id)} disabled={locked} onChange={() => toggle(t.id)} />
                <span className="muted" title={bankDateOf(t).slice(0, 7) !== t.month ? `Rattachée à ${monthLabel(t.month).toLowerCase()}` : undefined}>{dayLabel(bankDateOf(t).slice(0, 7), Number(bankDateOf(t).slice(8, 10)))}</span>
                <EntryLabel entry={t} onOpen={openDetail} />
                <span className="tx-target">
                  <span className="dot is-9" style={{ background: tone(targetHue(t.type, t.target)).base }} />
                  <span className="ellipsis">{targetName(t.type, t.target)}</span>
                  <span className="tx-type">{TYPE_LABEL[t.type]}</span>
                </span>
                <AccountPicker data={data} accountId={t.accountId} showName disabled={locked || isEnvelopeAccount(bankAccount(data, t.accountId)) || fixedTransactionAccountId(data, t) !== undefined} onPick={id => update(d => setTransactionAccount(d, t.id, id))} />
                <b className="num">{money(t.amount)}</b>
                {locked ? <span /> : (
                  <span className="icon-btn" title="Supprimer" onClick={() => update(d => deleteTransaction(d, t.id))}>
                    <Icon name="close" size={14} />
                  </span>
                )}
              </div>
              {editingDetail?.id === t.id && (
                <div className="detail-edit">
                  <DetailInput autoFocus value={editingDetail.text} onChange={text => setEditingDetail({ id: t.id, text })} onEnter={saveDetail} onEscape={() => setEditingDetail(null)} />
                  <span className="icon-btn" title="Enregistrer le détail" onClick={saveDetail}>
                    <Icon name="check" size={14} />
                  </span>
                </div>
              )}
            </Fragment>
          ))}
          {txs.length > 0 && shown.length === 0 && <div className="empty">Aucune opération ne correspond aux filtres.</div>}
          {txs.length === 0 && <div className="empty">Aucune opération saisie ce mois-ci.</div>}
          <div style={{ height: 8 }} />
        </div>
        <MovementsBlock month={month} locked={locked} />
      </div>
    </div>
  );
}

/** Movements between accounts created by the import (spec 0013, RG10d): edited (label, amount) or deleted, never created here. */
function MovementsBlock({ month, locked }: { month: MonthKey; locked: boolean }) {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ id: string; label: string; amount: string; detail: string } | null>(null);
  // Detail-only editing, also on a locked month (spec 0020, RG6, RG11).
  const [editingDetail, setEditingDetail] = useState<{ id: string; text: string } | null>(null);
  const movements = (data.accountMovements ?? []).filter(m => m.month === month);
  if (movements.length === 0) return null;
  const openDetail = (id: string, detail?: string) => setEditingDetail({ id, text: detail ?? '' });
  const saveDetail = () => {
    if (!editingDetail) return;
    const { id, text } = editingDetail;
    update(d => void setAccountMovementDetail(d, id, text));
    setEditingDetail(null);
  };
  const nameOf = (id: string) => data.accounts.find(a => a.id === id)?.name ?? 'Supprimé';
  const save = () => {
    if (!editing) return;
    update(d => void updateAccountMovement(d, editing.id, { label: editing.label, amount: parseAmount(editing.amount) ?? 0, detail: editing.detail }));
    setEditing(null);
  };
  return (
    <div className="panel-lg">
      <div className="tx-head">
        <div className="tx-title">Mouvements entre comptes de {monthLabel(month)}</div>
        <b>{money(movements.reduce((a, m) => a + m.amount, 0))}</b>
      </div>
      {[...movements]
        .sort((a, b) => b.day - a.day)
        .map(m =>
          editing?.id === m.id ? (
            <Fragment key={m.id}>
              <div className="mv-grid tx-row">
                <span className="muted" title={bankDateOf(m).slice(0, 7) !== m.month ? `Rattaché à ${monthLabel(m.month).toLowerCase()}` : undefined}>{dayLabel(bankDateOf(m).slice(0, 7), Number(bankDateOf(m).slice(8, 10)))}</span>
                <input className="text-input" value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} />
                <span className="muted ellipsis">
                  {nameOf(m.fromAccountId)} → {nameOf(m.toAccountId)}
                </span>
                <input className="text-input is-amount" value={editing.amount} inputMode="decimal" onChange={e => setEditing({ ...editing, amount: sanitizeAmountInput(e.target.value) })} />
                <span className="icon-btn" title="Enregistrer" onClick={save}>
                  <Icon name="check" size={14} />
                </span>
              </div>
              <div className="detail-edit">
                <DetailInput value={editing.detail} onChange={detail => setEditing({ ...editing, detail })} onEnter={save} />
              </div>
            </Fragment>
          ) : (
            <Fragment key={m.id}>
              <div className="mv-grid tx-row">
                <span className="muted" title={bankDateOf(m).slice(0, 7) !== m.month ? `Rattaché à ${monthLabel(m.month).toLowerCase()}` : undefined}>{dayLabel(bankDateOf(m).slice(0, 7), Number(bankDateOf(m).slice(8, 10)))}</span>
                <EntryLabel entry={m} onOpen={openDetail} />
                <span className="muted ellipsis">
                  {nameOf(m.fromAccountId)} → {nameOf(m.toAccountId)}
                </span>
                <b className="num">{money(m.amount)}</b>
                {locked ? (
                  <span />
                ) : (
                  <span style={{ display: 'flex', gap: 4 }}>
                    <span className="icon-btn" style={{ width: 'auto', padding: '0 6px' }} title="Modifier" onClick={() => setEditing({ id: m.id, label: m.label, amount: String(m.amount).replace('.', ','), detail: m.detail ?? '' })}>
                      <span style={{ fontSize: 11 }}>Modifier</span>
                    </span>
                    <span className="icon-btn" title="Supprimer" onClick={() => update(d => void deleteAccountMovement(d, m.id))}>
                      <Icon name="close" size={14} />
                    </span>
                  </span>
                )}
              </div>
              {editingDetail?.id === m.id && (
                <div className="detail-edit">
                  <DetailInput autoFocus value={editingDetail.text} onChange={text => setEditingDetail({ id: m.id, text })} onEnter={saveDetail} onEscape={() => setEditingDetail(null)} />
                </div>
              )}
            </Fragment>
          ),
        )}
      <div style={{ height: 8 }} />
    </div>
  );
}

function BalancesTab({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  // accounts() also lists lines deleted or replaced in other months: only the month's own lines are shown.
  const monthKeys = new Set(monthLines(data, month).map(l => l.key));
  const accs = accounts(data).filter(a => monthKeys.has(a.key));
  const locked = isMonthLocked(data, month);
  let nOk = 0;
  const groups = (
    [
      ['Épargnes', HUE.epa, 'epa'],
      ['Investissements', HUE.inv, 'inv'],
    ] as const
  ).map(([title, hue, block]) => ({
    title,
    hue,
    rows: accs
      .filter(a => a.block === block)
      .map(a => {
        const r = ledger.accMonth(a.key, month);
        if (!r) return null;
        const has = r.statement !== null;
        const gap = has ? round2(r.statement! - r.expected) : null;
        const ok = has && Math.abs(gap!) < 0.005;
        if (ok) nOk++;
        const series = [5, 4, 3, 2, 1].map(k => ledger.accMonth(a.key, addMonths(month, -k))?.balance).filter((v): v is number => v !== undefined);
        series.push(r.expected);
        return { a, r, has, gap, ok, series };
      })
      .filter(x => x !== null),
  }));
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <div className="soldes-intro">
        <div className="intro">Solde attendu = début de mois + versements réels − sorties. Saisis le solde relevé de chaque compte pour valider le mois.</div>
        <div className="pill is-lg" style={{ background: 'oklch(0.95 0.05 150)', color: 'oklch(0.35 0.09 150)' }}>
          {nOk} / {total} validés
        </div>
      </div>
      {groups.map(g => (
        <div key={g.title} className="panel-lg" style={toneVars(g.hue)}>
          <div className="group-head">{g.title}</div>
          <div className="acc-grid acc-cols">
            <span>Compte</span>
            <span>6 mois</span>
            <span className="num">Début</span>
            <span className="num">+ Versé</span>
            <span className="num">− Sorties</span>
            <span className="num">= Attendu</span>
            <span className="num" style={{ paddingRight: 8 }}>
              Solde relevé
            </span>
            <span className="num">Écart</span>
            <span className="num">Statut</span>
          </div>
          {g.rows.map(({ a, r, has, gap, ok, series }) => {
            const status = !has ? ['À saisir', 'rgba(32,30,29,.06)', 'rgba(32,30,29,.6)'] : ok ? ['Validé', 'oklch(0.95 0.05 150)', 'oklch(0.35 0.09 150)'] : ['À vérifier', 'oklch(0.95 0.06 85)', 'oklch(0.38 0.07 80)'];
            return (
              <div key={a.key} className="acc-grid acc-row">
                <span style={{ fontWeight: 600 }}>{a.name}</span>
                <Spark values={series} />
                <span className="num muted">{money(r.start)}</span>
                <span className="num muted">{r.paid ? money(r.paid) : '—'}</span>
                <span className="num muted">{r.out ? money(-r.out) : '—'}</span>
                <b className="num">{money(r.expected)}</b>
                <div className="rel">
                  <EditableAmount
                    id={`rel:${a.key}`}
                    value={r.statement}
                    allowEmpty
                    disabled={locked}
                    onCommit={v => update(d => setStatement(d, month, a.key, v))}
                    className="stmt-cell"
                    style={{ background: has && !ok ? 'oklch(0.96 0.04 90)' : undefined }}
                    inputClassName="cell-input is-stmt"
                  >
                    {has ? money(r.statement!) : 'Saisir…'}
                  </EditableAmount>
                </div>
                <span className="num" style={{ fontWeight: 600, color: has && !ok ? 'oklch(0.45 0.1 70)' : MUTED }}>
                  {has && !ok ? money(gap!, true) : '—'}
                </span>
                <span className="pill" style={{ justifySelf: 'end', background: status[1], color: status[2] }}>
                  {status[0]}
                </span>
              </div>
            );
          })}
          <div style={{ height: 8 }} />
        </div>
      ))}
    </>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div />;
  const mn = Math.min(...values);
  const sp = Math.max(...values) - mn || 1;
  const pts = values.map((v, i) => [(i * 84) / (values.length - 1), 3 + 20 * (1 - (v - mn) / sp)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div>
      <svg viewBox="0 0 84 26" width="84" height="26" style={{ display: 'block', overflow: 'visible' }}>
        <path d={d} fill="none" stroke="var(--t-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="3" fill="#fff" stroke="var(--t-base)" strokeWidth="2" />
      </svg>
    </div>
  );
}
