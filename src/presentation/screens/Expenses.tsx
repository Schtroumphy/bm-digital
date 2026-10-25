import { Fragment, useEffect, useState } from 'react';
import { AccountDot, AccountPicker } from '../components/AccountPicker';
import { EditableAmount } from '../components/Editable';
import { DetailInput } from '../components/DetailInput';
import { Icon } from '../components/Icon';
import { GOOD, HUE, MUTED, tone, toneVars } from '../components/tone';
import { addTransaction, deleteTransaction, deleteTransactions, setStatement, transactionsCsv, updateTransaction, setTransactionDetail } from '../../application/actions';
import type { StatementSource } from '../../application/ports';
import { ImportWizard } from './ImportWizard';
import { bankDateOf, expenseLineBlocker, isExpenseLineBlock } from '../../domain/lineExpenses';
import { defaultTransferTarget, similarPointedItem, transferItems } from '../../domain/transfers';
import { addTransfer, deleteAccountMovement, setAccountMovementDetail, setTransferTarget, unlinkMovementFace, updateAccountMovement } from '../../application/accountMovements';
import { creditDateOf, debitDateOf, envelopeSplit, isEnvelopesPool, linkStateOf, movementAccountName } from '../../domain/internalTransfers';
import { setTransactionAccount } from '../../application/bankAccounts';
import { activeBankAccounts, bankAccount, CASH_ACCOUNT_ID, defaultTransactionAccountId, fixedTransactionAccountId, isAccountInBudget, isEnvelopeAccount, isLineInBudget } from '../../domain/bank';
import { lineCheck } from '../../domain/checkoff';
import { matchesEntrySearch } from '../../domain/detail';
import { monthSummary, variableRemaining } from '../../domain/budget';
import { exceedsEnvelopeCash } from '../../domain/envelopeCash';
import { addMonths, currentMonthKey, dayLabel, money, monthLabel, parseAmount, parseMonth, round2, sanitizeAmountInput } from '../../domain/format';
import { accounts, isMonthLocked, monthLines } from '../../domain/ledger';
import type { AccountMovement, MonthKey, MovementTarget, PayMode, TxType } from '../../domain/types';
import { newId, useStore } from '../state/store';

/** Sum of the expenses of a list: an entry of money (`rev`) is never an expense (spec 0015). */
const spentOf = (xs: { type: TxType; amount: number }[]) => round2(xs.filter(t => t.type !== 'rev').reduce((a, t) => a + t.amount, 0));

/** Signed amount seen from the account: an entry of money and a withdrawal from savings are credits (+), the others debits (−). */
const signedAmount = (t: { type: TxType; amount: number }) => (t.type === 'rev' || t.type === 'epa' ? t.amount : -t.amount);

const TYPE_LABEL: Record<TxType, string> = { var: 'Variable', env: 'Enveloppe', epa: 'Sortie épargne', fix: 'Ligne fixe / crédit', rev: 'Entrée d’argent' };

export function ExpensesScreen({ month, statementSource, fundEnvelope, onFundUsed }: { month: MonthKey; statementSource: StatementSource; fundEnvelope: string | null; onFundUsed: () => void }) {
  const [tab, setTab] = useState<'saisie' | 'soldes'>('saisie');
  // The prefill is read by the form on its first render, then forgotten: coming back to the screen later opens it empty.
  useEffect(() => { if (fundEnvelope) onFundUsed(); }, [fundEnvelope, onFundUsed]);
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
      {tab === 'saisie' ? <EntryTab month={month} fundEnvelope={fundEnvelope} /> : <BalancesTab month={month} />}
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
/** `attach`: where the entry is attached (budget line, or the link of a transfer), shown under the detail. */
function EntryLabel({ entry, attach, hideDetail, onOpen }: { entry: { id: string; label: string; detail?: string }; attach?: string; hideDetail?: boolean; onOpen: (id: string, detail?: string) => void }) {
  const open = () => onOpen(entry.id, entry.detail);
  const editLabel = entry.detail ? 'Modifier le détail' : 'Ajouter un détail';
  return (
    <div className="entry-cell">
      <div className="entry-label" title={[entry.label, entry.detail, attach].filter(Boolean).join('\n') || editLabel} onClick={open}>
        <div className="ellipsis" style={{ fontWeight: 500 }}>
          {entry.label}
        </div>
        {entry.detail && !hideDetail && <div className="entry-detail">{entry.detail}</div>}
        {attach && !hideDetail && <div className="entry-detail is-attach">{attach}</div>}
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

function EntryTab({ month, fundEnvelope }: { month: MonthKey; fundEnvelope: string | null }) {
  const { data, ledger, update } = useStore();
  const lines = monthLines(data, month);
  const locked = isMonthLocked(data, month);
  const [form, setForm] = useState<{ label: string; detail: string; amount: string; type: TxType; target: string; accountId: string; payMode: PayMode }>({ label: '', detail: '', amount: '', type: 'var', target: '', accountId: '', payMode: 'virtuel' });
  const [filter, setFilter] = useState<{ q: string; type: TxType | 'all'; accountId: string; pointedOnly: boolean; showDetail: boolean; from: string; to: string; min: string; max: string }>({ q: '', type: 'all', accountId: 'all', pointedOnly: false, showDetail: true, from: '', to: '', min: '', max: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // « Transfert » (spec 0019, RG14) is a type of entry of this form, written as an `AccountMovement`; the other types are transactions.
  const [transfer, setTransfer] = useState(fundEnvelope !== null);
  // Transaction whose detail is being edited (spec 0020, RG6): allowed on a locked month too (RG11).
  const [editingDetail, setEditingDetail] = useState<{ id: string; text: string } | null>(null);
  const [editingTx, setEditingTx] = useState<{ id: string; label: string; amount: string; date: string; detail: string; type: TxType; target: string } | null>(null);
  const openDetail = (id: string, detail?: string) => setEditingDetail({ id, text: detail ?? '' });
  const saveDetail = () => {
    if (!editingDetail) return;
    const { id, text } = editingDetail;
    update(d => void setTransactionDetail(d, id, text));
    setEditingDetail(null);
  };

  const targets: [string, string][] =
    form.type === 'var' ? lines.filter(l => l.block === 'var').map(l => [l.key, l.name]) : form.type === 'env' ? data.envelopes.map(e => [e.id, e.name]) : form.type === 'fix' ? lines.filter(l => isExpenseLineBlock(l.block)).map(l => [l.key, `${l.name} (${l.block === 'cre' ? 'Crédit' : 'Fixe'}, ${bankAccount(data, l.accountId)?.name ?? ''})`]) : form.type === 'rev' ? lines.filter(l => l.block === 'rev').map(l => [l.key, `${l.name} (${bankAccount(data, l.accountId)?.name ?? ''})`]) : lines.filter(l => l.block === 'epa').map(l => [l.key, l.name]);
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

  // An envelope expense paid in cash cannot exceed the cash left on the envelope (spec 0026, RG7).
  const cashRefused = form.type === 'env' && form.payMode === 'especes' && !!target && amount > 0 && exceedsEnvelopeCash(data, target, month, amount);

  const s = monthSummary(data, ledger, month);
  // An entry is « rattachée à un pointage » when its line is checked off this month (envelopes have no pointage).
  const isPointed = (t: { type: TxType; target: string }) => t.type !== 'env' && !!lineCheck(data, month, t.target);
  const minAmount = parseAmount(filter.min) ?? null;
  const maxAmount = parseAmount(filter.max) ?? null;
  const txs = data.transactions.filter(t => t.month === month);
  const shown = txs
    .filter(t => filter.type === 'all' || t.type === filter.type)
    .filter(t => filter.accountId === 'all' || bankAccount(data, t.accountId)?.id === filter.accountId)
    .filter(t => matchesEntrySearch(t, filter.q))
    .filter(t => !filter.pointedOnly || isPointed(t))
    .filter(t => (!filter.from || bankDateOf(t) >= filter.from) && (!filter.to || bankDateOf(t) <= filter.to))
    .filter(t => (minAmount === null || t.amount >= minAmount) && (maxAmount === null || t.amount <= maxAmount))
    .sort((a, b) => bankDateOf(b).localeCompare(bankDateOf(a)));
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
  const targetsOf = (type: TxType): [string, string][] =>
    type === 'var' ? lines.filter(l => l.block === 'var').map(l => [l.key, l.name]) : type === 'env' ? data.envelopes.map(e => [e.id, e.name]) : type === 'fix' ? lines.filter(l => isExpenseLineBlock(l.block)).map(l => [l.key, l.name]) : type === 'rev' ? lines.filter(l => l.block === 'rev').map(l => [l.key, l.name]) : lines.filter(l => l.block === 'epa').map(l => [l.key, l.name]);
  const startEdit = (t: (typeof txs)[number]) => setEditingTx({ id: t.id, label: t.label, amount: String(t.amount).replace('.', ','), date: bankDateOf(t), detail: t.detail ?? '', type: t.type, target: t.target });
  const editPatch = editingTx && { label: editingTx.label, amount: parseAmount(editingTx.amount) ?? 0, date: editingTx.date, detail: editingTx.detail, type: editingTx.type, target: editingTx.target };
  // The edit is tried on a copy first: a refused version (locked month, imputation or account not allowed) leaves the entry untouched and keeps the form open.
  const editAllowed = !!editingTx && !!editPatch && updateTransaction(structuredClone(data), editingTx.id, editPatch);
  const saveEdit = () => {
    if (!editingTx || !editPatch || !editAllowed) return;
    const id = editingTx.id;
    update(d => void updateTransaction(d, id, editPatch));
    setEditingTx(null);
  };
  const exportPicked = () => {
    if (picked.length === 0) return;
    const rows = [...picked].sort((a, b) => bankDateOf(a).localeCompare(bankDateOf(b))).map(t => ({
      date: bankDateOf(t),
      label: t.label,
      detail: t.detail ?? '',
      type: TYPE_LABEL[t.type],
      imputation: targetName(t.type, t.target),
      account: bankAccount(data, t.accountId)?.name ?? '',
      amount: signedAmount(t),
    }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([transactionsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = `operations-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
  } else if (target && form.type === 'rev') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    impact = [[`${l.name} · réel`, `${money(cur)} → ${money(cur + amount)}`]];
  } else if (target && form.type === 'fix') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    impact = [
      [`${l.name} · réel`, `${money(cur)} → ${money(cur + amount)}`],
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
    if (transfer || !amount || amount < 0 || !target || locked || accountRefused || lineBlocker || cashRefused) return;
    update(d =>
      addTransaction(d, { id: newId('t'), month, day: defaultDay(month), label: form.label.trim() || targetName(form.type, target), amount, type: form.type, target, accountId, detail: form.detail, ...(form.type === 'env' && form.payMode === 'especes' ? { payMode: 'especes' as const } : {}) }),
    );
    // Picking another account is a one-off: the next expense follows its box again.
    setForm(f => ({ ...f, label: '', detail: '', amount: '', accountId: '', payMode: 'virtuel' }));
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
        <div className="form-title">Nouvelle opération</div>
        <div className="form-row">
          <label className="field-w">
            <span className="field-label">Libellé</span>
            <input className="text-input" value={form.label} placeholder="Ex. Pharmacie" onChange={e => setForm(f => ({ ...f, label: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
          <label className="field-w">
            <span className="field-label">Montant</span>
            <input className="text-input is-amount" value={form.amount} placeholder="0,00 €" inputMode="decimal" onChange={e => setForm(f => ({ ...f, amount: sanitizeAmountInput(e.target.value) }))} onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
        </div>
        <label className="field-w">
          <span className="field-label">Détail <span className="field-optional">facultatif</span></span>
          <DetailInput value={form.detail} onChange={detail => setForm(f => ({ ...f, detail }))} onEnter={add} />
        </label>
        <div>
          <div className="field-label is-gap">Type</div>
          <div className="chips is-wrap">
            {(['var', 'env', 'epa', 'fix', 'rev'] as const).map(t => (
              <Chip key={t} on={!transfer && form.type === t} onClick={() => { setTransfer(false); setForm(f => ({ ...f, type: t, target: '' })); }}>
                {{ var: 'Dépense variable', env: 'Enveloppe', epa: 'Sortie épargne', fix: 'Fixe / crédit', rev: 'Entrée d’argent' }[t]}
              </Chip>
            ))}
            <Chip on={transfer} onClick={() => setTransfer(true)}>
              Transfert
            </Chip>
          </div>
        </div>
        {transfer ? (
          <TransferFields month={month} locked={locked} fundEnvelope={fundEnvelope} label={form.label} detail={form.detail} amount={amount} onDone={() => setForm(f => ({ ...f, label: '', detail: '', amount: '' }))} />
        ) : (
          <>
        <div>
          <div className="field-label is-gap">{form.type === 'var' ? 'Ligne de dépense variable' : form.type === 'env' ? 'Enveloppe' : form.type === 'fix' ? 'Ligne fixe ou crédit' : form.type === 'rev' ? 'Ligne de revenu' : 'Compte d’épargne débité'}</div>
          <div className="chips is-wrap">
            {targets.map(([id, name]) => (
              <Chip key={id} on={target === id} onClick={() => setForm(f => ({ ...f, target: id }))}>
                {name}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="field-label is-gap">{form.type === 'epa' || form.type === 'rev' ? 'Reçu sur' : 'Payé avec'}</div>
          {form.type === 'env' ? (
            // An envelope expense is always on the envelope's account: only cash or virtual is chosen (spec 0026, RG5).
            <div className="chips is-wrap">
              {([['virtuel', 'Virtuel'], ['especes', 'Espèces']] as const).map(([mode, name]) => (
                <Chip key={mode} on={form.payMode === mode} onClick={() => setForm(f => ({ ...f, payMode: mode }))}>
                  {name}
                </Chip>
              ))}
            </div>
          ) : (
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
          )}
        </div>
        {cashRefused && <div className="alert-box">Espèces insuffisantes sur cette enveloppe.</div>}
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
        <div className={`btn-dark is-block${!amount || locked || accountRefused || lineBlocker || cashRefused ? ' is-disabled' : ''}`} onClick={add}>
          <Icon name="plus" size={15} stroke={3} />
          {form.type === 'rev' ? 'Ajouter l’entrée' : 'Ajouter la dépense'}
        </div>
          </>
        )}
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
            <div className="tx-f">
              <span className="tx-f-label">Recherche</span>
              <input className="text-input" value={filter.q} placeholder="Libellé ou détail" onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} />
            </div>
            <div className="tx-f">
              <span className="tx-f-label">Type</span>
              <select className="text-input" value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value as TxType | 'all' }))}>
                <option value="all">Tous les types</option>
                {(Object.keys(TYPE_LABEL) as TxType[]).map(t => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="tx-f">
              <span className="tx-f-label">Compte</span>
              <select className="text-input" value={filter.accountId} onChange={e => setFilter(f => ({ ...f, accountId: e.target.value }))}>
                <option value="all">Tous les comptes</option>
                {data.accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="tx-f">
              <span className="tx-f-label">Période</span>
              <div className="tx-f-pair">
                <input className="text-input" type="date" aria-label="Du" value={filter.from} max={filter.to || undefined} onChange={e => setFilter(f => ({ ...f, from: e.target.value }))} />
                <span>→</span>
                <input className="text-input" type="date" aria-label="Au" value={filter.to} min={filter.from || undefined} onChange={e => setFilter(f => ({ ...f, to: e.target.value }))} />
              </div>
            </div>
            <div className="tx-f">
              <span className="tx-f-label">Montant</span>
              <div className="tx-f-pair">
                <input className="text-input is-amount" aria-label="Montant minimum" value={filter.min} placeholder="min" inputMode="decimal" onChange={e => setFilter(f => ({ ...f, min: sanitizeAmountInput(e.target.value) }))} />
                <span>→</span>
                <input className="text-input is-amount" aria-label="Montant maximum" value={filter.max} placeholder="max" inputMode="decimal" onChange={e => setFilter(f => ({ ...f, max: sanitizeAmountInput(e.target.value) }))} />
              </div>
            </div>
            <div className="tx-f">
              <span className="tx-f-label">Affichage</span>
              <div className="tx-f-pair">
                <label className="tx-pointed-filter" title={'Opérations rattachées à une ligne de budget pointée ce mois-ci.\nPointer = cocher la case d’une ligne du Budget pour dire que l’argent a bougé (prélèvement passé, revenu reçu). Le pointage sert au « Reste à sortir » et au « Solde estimé » de chaque compte : c’est une estimation de budget, qui n’affecte pas les soldes réels.\nL’état est celui de la ligne : toutes ses opérations sont donc marquées. Les enveloppes n’ont pas de pointage.'}>
                  <input type="checkbox" checked={filter.pointedOnly} onChange={e => setFilter(f => ({ ...f, pointedOnly: e.target.checked }))} />
                  Pointées
                </label>
                <label className="tx-pointed-filter" title="Afficher le détail sous le libellé de chaque ligne">
                  <input type="checkbox" checked={filter.showDetail} onChange={e => setFilter(f => ({ ...f, showDetail: e.target.checked }))} />
                  Détails
                </label>
                {(filter.from || filter.to || filter.min || filter.max || filter.pointedOnly) && (
                  <span className="btn-outline tx-clear" onClick={() => setFilter(f => ({ ...f, from: '', to: '', min: '', max: '', pointedOnly: false }))}>
                    Effacer
                  </span>
                )}
              </div>
            </div>
          </div>
          {picked.length > 0 && (
            <div className="tx-bulk">
              <span>
                {picked.length} sélectionnée{picked.length > 1 ? 's' : ''} · {money(spentOf(picked))}
              </span>
              <span className="btn-outline" onClick={() => setSelected(new Set())}>
                Désélectionner
              </span>
              <span className="btn-outline" onClick={exportPicked}>
                <Icon name="download" size={15} />
                Exporter la sélection
              </span>
              <span className={`btn-outline is-danger${locked ? ' is-disabled' : ''}`} onClick={removePicked}>
                Supprimer la sélection
              </span>
            </div>
          )}
          <div className="tx-grid tx-cols">
            <input type="checkbox" aria-label="Tout sélectionner" checked={allPicked} disabled={shown.length === 0} onChange={() => setSelected(allPicked ? new Set() : new Set(shown.map(t => t.id)))} />
            <span>Date</span>
            <span>Libellé</span>
            <span>Imputation</span>
            <span>Compte</span>
            <span className="num">Montant</span>
            <span />
          </div>
          {shown.map(t => (
            <Fragment key={t.id}>
              <div className={`tx-grid tx-row${selected.has(t.id) ? ' is-selected' : ''}${isPointed(t) ? ' is-pointed' : ''}`}>
                <input type="checkbox" aria-label={`Sélectionner ${t.label}`} checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                <span className="muted" title={bankDateOf(t).slice(0, 7) !== t.month ? `Rattachée à ${monthLabel(t.month).toLowerCase()}` : undefined}>{dayLabel(bankDateOf(t).slice(0, 7), Number(bankDateOf(t).slice(8, 10)))}</span>
                <EntryLabel entry={t} hideDetail={!filter.showDetail} onOpen={openDetail} />
                <span className="tx-target">
                  <span className="dot is-9" style={{ background: tone(targetHue(t.type, t.target)).base }} />
                  <span className="ellipsis">{targetName(t.type, t.target)}</span>
                  <span className="tx-type">{TYPE_LABEL[t.type]}</span>
                </span>
                <AccountPicker data={data} accountId={t.accountId} showName disabled={locked || isEnvelopeAccount(bankAccount(data, t.accountId)) || fixedTransactionAccountId(data, t) !== undefined} onPick={id => update(d => setTransactionAccount(d, t.id, id))} />
                <b className="num" style={signedAmount(t) > 0 ? { color: GOOD } : undefined}>{money(signedAmount(t), true)}</b>
                {locked ? <span /> : (
                  <span className="tx-actions">
                    <span className="icon-btn" title="Modifier" onClick={() => (editingTx?.id === t.id ? setEditingTx(null) : startEdit(t))}>
                      <Icon name="pencil" size={13} stroke={2} />
                    </span>
                    <span className="icon-btn" title="Supprimer" onClick={() => update(d => deleteTransaction(d, t.id))}>
                      <Icon name="close" size={14} />
                    </span>
                  </span>
                )}
              </div>
              {editingTx?.id === t.id && (
                <div className="tx-edit">
                  <div className="form-row">
                    <label className="field-w">
                      <span className="field-label">Libellé</span>
                      <input className="text-input" value={editingTx.label} onChange={e => setEditingTx({ ...editingTx, label: e.target.value })} onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    </label>
                    <label className="field-w">
                      <span className="field-label">Montant</span>
                      <input className="text-input is-amount" value={editingTx.amount} inputMode="decimal" onChange={e => setEditingTx({ ...editingTx, amount: sanitizeAmountInput(e.target.value) })} onKeyDown={e => e.key === 'Enter' && saveEdit()} />
                    </label>
                    <label className="field-w">
                      <span className="field-label">Date</span>
                      <input className="text-input" type="date" value={editingTx.date} onChange={e => setEditingTx({ ...editingTx, date: e.target.value })} />
                    </label>
                  </div>
                  <label className="field-w">
                    <span className="field-label">Détail <span className="field-optional">facultatif</span></span>
                    <DetailInput value={editingTx.detail} onChange={detail => setEditingTx({ ...editingTx, detail })} onEnter={saveEdit} onEscape={() => setEditingTx(null)} />
                  </label>
                  {editingTx.type !== 'rev' && (
                    <div>
                      <div className="field-label is-gap">Type</div>
                      <div className="chips is-wrap">
                        {(['var', 'env', 'epa', 'fix'] as const).map(ty => (
                          <Chip key={ty} on={editingTx.type === ty} onClick={() => setEditingTx({ ...editingTx, type: ty, target: ty === t.type ? t.target : targetsOf(ty)[0]?.[0] ?? '' })}>
                            {{ var: 'Dépense variable', env: 'Enveloppe', epa: 'Sortie épargne', fix: 'Fixe / crédit' }[ty]}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="field-label is-gap">Imputation</div>
                    <div className="chips is-wrap">
                      {targetsOf(editingTx.type).map(([id, name]) => (
                        <Chip key={id} on={editingTx.target === id} onClick={() => setEditingTx({ ...editingTx, target: id })}>
                          {name}
                        </Chip>
                      ))}
                    </div>
                  </div>
                  {!editAllowed && <div className="alert-box">Cette modification est refusée : vérifie le libellé, le montant, la date et l’imputation (compte de la ligne, ligne archivée…).</div>}
                  <div className="tx-edit-actions">
                    <span className="btn-outline" onClick={() => setEditingTx(null)}>Annuler</span>
                    <span className={`btn-dark${editAllowed ? '' : ' is-disabled'}`} onClick={saveEdit}>
                      <Icon name="check" size={14} stroke={3} />
                      Enregistrer
                    </span>
                  </div>
                </div>
              )}
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
        <MovementsBlock month={month} locked={locked} showDetail={filter.showDetail} />
      </div>
    </div>
  );
}

/** Transfers of the month (spec 0013, RG10d; spec 0019): created by the import or by the « Transfert » form, edited (label, amount) or deleted here. */
function MovementsBlock({ month, locked, showDetail }: { month: MonthKey; locked: boolean; showDetail: boolean }) {
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
  const nameOf = (id: string) => movementAccountName(data, id);
  // « Réparti dans les enveloppes » next to a debit « vers enveloppes » (spec 0016, RG29): calculated, never typed, no balance.
  const split = envelopeSplit(data, month);
  // Several debits « vers enveloppes » in a month: the monthly total is shown once, on the first one listed.
  const firstPoolId = [...movements].sort((a, b) => bankDateOf(b).localeCompare(bankDateOf(a))).find(m => isEnvelopesPool(m.toAccountId))?.id;
  // State of the link between the two lines of the bank file (spec 0016, RG18).
  const linkLabel = (m: AccountMovement) => {
    const state = linkStateOf(m);
    const day = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7);
    if (state === 'lie') return `Lié · Débit ${day(debitDateOf(m))} ${nameOf(m.fromAccountId)}, Crédit ${day(creditDateOf(m))} ${nameOf(m.toAccountId)}`;
    if (state === 'debit') return 'Une face (débit)';
    if (state === 'credit') return 'Une face (crédit)';
    return null;
  };
  // Tooltip of a transfer: the budget item it stands for, if any (list lines carry their extra information in the tooltip, spec 0019).
  const targetLabel = (target?: MovementTarget) => {
    if (!target) return 'Transfert libre : sans ligne de budget';
    return transferItems(data, month).find(i => (target.kind === 'line' ? i.target.kind === 'line' && i.target.key === target.key : i.target.kind === 'env' && i.target.id === target.id))?.label ?? 'Poste de budget supprimé';
  };
  const save = () => {
    if (!editing) return;
    update(d => void updateAccountMovement(d, editing.id, { label: editing.label, amount: parseAmount(editing.amount) ?? 0, detail: editing.detail }));
    setEditing(null);
  };
  return (
    <div className="panel-lg">
      <div className="tx-head">
        <div className="tx-title">Transferts de {monthLabel(month)}</div>
        <b>{money(movements.reduce((a, m) => a + m.amount, 0))}</b>
      </div>
      {[...movements]
        .sort((a, b) => bankDateOf(b).localeCompare(bankDateOf(a)))
        .map(m =>
          editing?.id === m.id ? (
            <Fragment key={m.id}>
              <div className="mv-grid tx-row">
                <span className="muted" title={bankDateOf(m).slice(0, 7) !== m.month ? `Rattaché à ${monthLabel(m.month).toLowerCase()}` : undefined}>{dayLabel(bankDateOf(m).slice(0, 7), Number(bankDateOf(m).slice(8, 10)))}</span>
                <input className="text-input" value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} />
                <span className="muted ellipsis">
                  {nameOf(m.fromAccountId)} → {nameOf(m.toAccountId)}
                </span>
                <input className="text-input is-amount" value={editing.amount} inputMode="decimal" disabled={linkStateOf(m) === 'lie'} title={linkStateOf(m) === 'lie' ? 'Montant figé : les deux lignes du fichier ont ce montant. Déliez ou supprimez le virement.' : undefined} onChange={e => setEditing({ ...editing, amount: sanitizeAmountInput(e.target.value) })} />
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
              <div className={`mv-grid tx-row${m.target?.kind === 'line' && lineCheck(data, month, m.target.key) ? ' is-pointed' : ''}`}>
                <span className="muted" title={bankDateOf(m).slice(0, 7) !== m.month ? `Rattaché à ${monthLabel(m.month).toLowerCase()}` : undefined}>{dayLabel(bankDateOf(m).slice(0, 7), Number(bankDateOf(m).slice(8, 10)))}</span>
                <EntryLabel entry={m} hideDetail={!showDetail} attach={[targetLabel(m.target), linkLabel(m)].filter(Boolean).join(' · ')} onOpen={openDetail} />
                <span className="muted ellipsis" title={[targetLabel(m.target), linkLabel(m)].filter(Boolean).join('\n')}>
                  {nameOf(m.fromAccountId)} → {nameOf(m.toAccountId)}
                  {linkLabel(m) && <span className="state-chip is-info" style={{ marginLeft: 6 }}>{linkLabel(m)}</span>}
                  {isEnvelopesPool(m.toAccountId) && m.id === firstPoolId && <span className="state-chip is-neutral" style={{ marginLeft: 6 }} title="Total du mois : tous les virements vers enveloppes et tous les crédits individuels">Réparti : {money(split.distributed)} sur {money(split.sent)}</span>}
                </span>
                <b className="num">{money(m.amount)}</b>
                {locked ? (
                  <span />
                ) : (
                  <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                    <span className="icon-btn" style={{ width: 'auto', padding: '0 6px' }} title="Modifier" onClick={() => setEditing({ id: m.id, label: m.label, amount: String(m.amount).replace('.', ','), detail: m.detail ?? '' })}>
                      <span style={{ fontSize: 11 }}>Modifier</span>
                    </span>
                    {linkStateOf(m) === 'lie' && (
                      <>
                        <span className="icon-btn" style={{ width: 'auto', padding: '0 6px' }} title="Délier le débit. Retire la ligne du fichier côté débit : le virement garde sa face crédit" onClick={() => update(d => void unlinkMovementFace(d, m.id, 'debit'))}>
                          <span style={{ fontSize: 11 }}>− débit</span>
                        </span>
                        <span className="icon-btn" style={{ width: 'auto', padding: '0 6px' }} title="Délier le crédit. Retire la ligne du fichier côté crédit : le virement garde sa face débit" onClick={() => update(d => void unlinkMovementFace(d, m.id, 'credit'))}>
                          <span style={{ fontSize: 11 }}>− crédit</span>
                        </span>
                      </>
                    )}
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
              {/* A transfer without target that looks like a checked item: possible double count (spec 0019, RG11). */}
              {(() => {
                const similar = similarPointedItem(data, m);
                return similar && !locked ? (
                  <div className="sim-signal">
                    Semblable à un pointage : {similar.label}.{' '}
                    <button type="button" className="link-btn" onClick={() => update(d => void setTransferTarget(d, m.id, similar.target))}>
                      Rattacher
                    </button>
                  </div>
                ) : null;
              })()}
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

/**
 * Fields of the « Transfert » type (spec 0019, RG14, RG15): source and destination accounts, day and the budget item the transfer stands for
 * (optional; the envelope or the savings line of the destination is proposed). The label, detail and amount are those of the form.
 */
function TransferFields({ month, locked, fundEnvelope, label, detail, amount, onDone }: { month: MonthKey; locked: boolean; fundEnvelope: string | null; label: string; detail: string; amount: number; onDone: () => void }) {
  const { data, update } = useStore();
  const accounts = data.accounts.filter(a => !a.archived);
  const main = accounts.find(a => a.isDefault) ?? accounts[0];
  // « Alimenter en espèces » (spec 0026, RG3): from « Espèces » to the envelope's account, standing for the envelope.
  const funded = data.envelopes.find(e => e.id === fundEnvelope);
  const [fromId, setFromId] = useState(funded ? CASH_ACCOUNT_ID : main?.id ?? '');
  const [toChoice, setToChoice] = useState(funded?.accountId ?? '');
  const [day, setDay] = useState(String(defaultDay(month)));
  // `undefined`: not chosen yet, the default of the destination applies; `''`: « aucune ».
  const [chosen, setChosen] = useState<string | undefined>(funded ? `env:${funded.id}` : undefined);
  const toId = toChoice && toChoice !== fromId && accounts.some(a => a.id === toChoice) ? toChoice : accounts.find(a => a.id !== fromId)?.id ?? '';
  const items = transferItems(data, month).filter(i => i.toAccountId === toId);
  const valueOf = (t: MovementTarget | null | undefined) => (t ? (t.kind === 'line' ? `line:${t.key}` : `env:${t.id}`) : '');
  const value = chosen !== undefined ? chosen : valueOf(defaultTransferTarget(data, month, toId, fromId));
  const item = items.find(i => valueOf(i.target) === value);
  const dayNumber = Number(day);
  const ready = !!fromId && !!toId && fromId !== toId && amount > 0 && Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= 31 && !locked;
  const add = () => {
    if (!ready) return;
    update(d => void addTransfer(d, { id: newId('m'), month, day: dayNumber, label: label.trim() || 'Transfert', amount, fromAccountId: fromId, toAccountId: toId, ...(item ? { target: item.target } : {}), detail }));
    setChosen(undefined);
    onDone();
  };
  const accountChips = (current: string, pick: (id: string) => void, exclude?: string) => (
    <div className="chips is-wrap">
      {accounts.filter(a => a.id !== exclude).map(a => (
        <Chip key={a.id} on={current === a.id} onClick={() => pick(a.id)}>
          <span className="acc-item">
            <AccountDot account={a} />
            {a.name}
          </span>
        </Chip>
      ))}
    </div>
  );
  return (
    <>
      <div>
        <div className="field-label is-gap">De</div>
        {accountChips(fromId, id => { setFromId(id); setChosen(undefined); })}
      </div>
      <div>
        <div className="field-label is-gap">Vers</div>
        {accountChips(toId, id => { setToChoice(id); setChosen(undefined); }, fromId)}
      </div>
      <div className="form-row">
        <label className="field-w">
          <span className="field-label">Jour</span>
          <input className="text-input" inputMode="numeric" value={day} onChange={e => setDay(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field-w">
          <span className="field-label">Rattacher à (facultatif)</span>
          <select className="text-input" value={value} onChange={e => setChosen(e.target.value)}>
            <option value="">Aucun (transfert libre)</option>
            {items.map(i => (
              <option key={valueOf(i.target)} value={valueOf(i.target)}>{i.label}</option>
            ))}
          </select>
        </label>
      </div>
      {item?.pointedOn && <div className="impact">Cette ligne est pointée : le transfert remplacera sa contrepartie fictive dans le solde estimé.</div>}
      {locked && <div className="alert-box">Ce mois est clôturé : aucun transfert ne peut y être créé.</div>}
      <div className={`btn-dark is-block${ready ? '' : ' is-disabled'}`} onClick={add}>
        <Icon name="plus" size={15} stroke={3} />
        Ajouter le transfert
      </div>
    </>
  );
}
