import { Fragment, useState } from 'react';
import { AccountDot, AccountPicker } from '../components/AccountPicker';
import { AssignPicker, OFF_BUDGET_CHOICE } from '../components/AssignPicker';
import { DetailInput } from '../components/DetailInput';
import { EntryDate } from '../components/EntryDate';
import { Icon } from '../components/Icon';
import { GOOD, HUE, tone } from '../components/tone';
import { deleteTransaction, deleteTransactions, transactionsCsv, updateTransaction, setTransactionDetail, setTransactionFlag } from '../../application/actions';
import { addManualTransaction, addManualTransfer } from '../../application/manualEntry';
import type { StatementSource } from '../../application/ports';
import { ImportWizard } from './ImportWizard';
import { bankDateOf, expenseLineBlocker, isExpenseLineBlock } from '../../domain/lineExpenses';
import { defaultTransferTarget, similarPointedItem, transferItems } from '../../domain/transfers';
import { deleteAccountMovement, setAccountMovementDetail, setTransferTarget, unlinkMovementFace, updateAccountMovement } from '../../application/accountMovements';
import { CASH_ID, CASH_LABEL, creditDateOf, debitDateOf, envelopeSplit, isEnvelopesPool, linkStateOf, movementAccountName } from '../../domain/internalTransfers';
import { setTransactionAccount } from '../../application/bankAccounts';
import { activeBankAccounts, assignableAccounts, bankAccount, envelopeEntryAccount, offBudgetEntryAccounts, isAssignableType, isTransactionOffBudget, CASH_ACCOUNT_ID, defaultTransactionAccountId, fixedTransactionAccountId, isAccountInBudget, isEnvelopeAccount, isLineInBudget, transactionBox, savingsExpenseLines } from '../../domain/bank';
import { isoDate, lineCheck } from '../../domain/checkoff';
import { defaultEntryDate, isRealDate } from '../../domain/periods';
import { matchesEntrySearch } from '../../domain/detail';
import { monthSummary, variableRemaining } from '../../domain/budget';
import { exceedsEnvelopeCash } from '../../domain/envelopeCash';
import { money, monthLabel, parseAmount, round2, sanitizeAmountInput } from '../../domain/format';
import { isMonthLocked, monthLines } from '../../domain/ledger';
import type { AccountMovement, MonthKey, MovementTarget, PayMode, TxType } from '../../domain/types';
import { newId, useStore } from '../state/store';

/** Prefix of the choice of an envelope among the targets of an entry of money (spec 0036): a line key never contains a colon. */
const ENVELOPE_PREFIX = 'env:';
/** Same for an account out of the budget (spec 0042): its choice is written `acc:<id>` and makes the entry an `accin`. */
const ACCOUNT_PREFIX = 'acc:';

/** Sum of the expenses of a list: an entry of money (`rev`) is never an expense (spec 0015). */
const spentOf = (xs: { type: TxType; amount: number }[]) => round2(xs.filter(t => t.type !== 'rev' && t.type !== 'envin' && t.type !== 'accin').reduce((a, t) => a + t.amount, 0));

/** Signed amount seen from the account: an entry of money and a withdrawal from savings are credits (+), the others debits (−). */
const signedAmount = (t: { type: TxType; amount: number }) => (t.type === 'rev' || t.type === 'epa' || t.type === 'envin' || t.type === 'accin' ? t.amount : -t.amount);

const TYPE_LABEL: Record<TxType, string> = { var: 'Variable', env: 'Enveloppe', epa: 'Sortie épargne', fix: 'Ligne fixe / crédit', rev: 'Entrée d’argent', envin: 'Entrée sur enveloppe', accin: 'Entrée sur compte hors budget', epd: 'Dépense d’épargne' };

/** Filter an other tab asks the Opérations tab to open with: the entries of one budget line or envelope. */
export interface OperationsFocus {
  type: TxType;
  target: string;
  label: string;
}

export function ExpensesScreen({ month, statementSource, focus }: { month: MonthKey; statementSource: StatementSource; focus: OperationsFocus | null }) {
  const [importing, setImporting] = useState(false);
  if (importing) return <ImportWizard source={statementSource} onClose={() => setImporting(false)} />;
  return (
    <>
      <div className="import-bar">
        <div className="tabs">
          <div className="tab is-active">Saisie des dépenses</div>
        </div>
        <button type="button" className="btn-outline" onClick={() => setImporting(true)}>
          Importer
        </button>
      </div>
      <EntryTab month={month} focus={focus} />
    </>
  );
}

/** Libellé d'une écriture (+ détail) : clic sur le libellé pour ajouter ou modifier le détail (le crayon de fin de ligne modifie toute l'écriture). */
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

/** Above this many choices, chips take too much room: a drop-down list is used instead. */
const MAX_CHIPS = 10;

/** Single choice among `options` (id, name): chips, or a drop-down list when there are more than `MAX_CHIPS`. `render` customises the chip content only. */
function Choice({ options, value, onPick, render }: { options: [string, string][]; value: string; onPick: (id: string) => void; render?: (id: string, name: string) => React.ReactNode }) {
  if (options.length > MAX_CHIPS && render) return <Menu options={options} value={value} onPick={onPick} render={render} />;
  if (options.length > MAX_CHIPS) {
    return (
      <select className="text-input" value={value} onChange={e => onPick(e.target.value)}>
        {!options.some(o => o[0] === value) && <option value="">Choisir…</option>}
        {options.map(([id, name]) => (
          <option key={id} value={id}>{name}</option>
        ))}
      </select>
    );
  }
  return (
    <div className="chips is-wrap">
      {options.map(([id, name]) => (
        <Chip key={id} on={value === id} onClick={() => onPick(id)}>
          {render ? render(id, name) : name}
        </Chip>
      ))}
    </div>
  );
}

/** Drop-down menu whose entries keep the chip content (e.g. the account dot), which a native `<select>` cannot show. */
function Menu({ options, value, onPick, render }: { options: [string, string][]; value: string; onPick: (id: string) => void; render: (id: string, name: string) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o[0] === value);
  return (
    <span className="acc-picker" style={{ display: 'block' }}>
      <div className="text-input" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        {current ? render(current[0], current[1]) : 'Choisir…'}
      </div>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popmenu acc-menu">
            {options.map(([id, name]) => (
              <div key={id} className={`popmenu-item${id === value ? ' is-active' : ''}`} onClick={() => { setOpen(false); onPick(id); }}>
                {render(id, name)}
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}

function EntryTab({ month, focus }: { month: MonthKey; focus: OperationsFocus | null }) {
  const { data, ledger, update } = useStore();
  const lines = monthLines(data, month);
  const locked = isMonthLocked(data, month);
  const [form, setForm] = useState<{ label: string; detail: string; amount: string; type: TxType; target: string; accountId: string; payMode: PayMode; assignedAccountId: string; date: string; source: string }>({ label: '', detail: '', amount: '', type: 'var', target: '', accountId: '', payMode: 'virtuel', assignedAccountId: '', date: '', source: '' });
  const [filter, setFilter] = useState<{ q: string; type: TxType | 'all'; accountId: string; pointedOnly: boolean; flaggedOnly: boolean; showDetail: boolean; from: string; to: string; min: string; max: string; target: string }>({ q: '', type: focus?.type ?? 'all', accountId: 'all', pointedOnly: false, flaggedOnly: false, showDetail: true, from: '', to: '', min: '', max: '', target: focus?.target ?? '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The list below the form is split in two tabs: the transactions and the transfers (account movements); the filters apply to both.
  const [view, setView] = useState<'ops' | 'transferts'>('ops');
  // « Transfert » (spec 0019, RG14) is a type of entry of this form, written as an `AccountMovement`; the other types are transactions.
  const [transfer, setTransfer] = useState(false);
  // Transaction whose detail is being edited (spec 0020, RG6): allowed on a locked month too (RG11).
  const [editingDetail, setEditingDetail] = useState<{ id: string; text: string } | null>(null);
  const [editingTx, setEditingTx] = useState<{ id: string; label: string; amount: string; date: string; detail: string; type: TxType; target: string; assignedAccountId: string } | null>(null);
  const openDetail = (id: string, detail?: string) => setEditingDetail({ id, text: detail ?? '' });
  const saveDetail = () => {
    if (!editingDetail) return;
    const { id, text } = editingDetail;
    update(d => void setTransactionDetail(d, id, text));
    setEditingDetail(null);
  };

  const revenueTargets: [string, string][] = lines.filter(l => l.block === 'rev').map(l => [l.key, `${l.name} (${bankAccount(data, l.accountId)?.name ?? ''})`]);
  // Envelopes without an active account cannot take an entry (spec 0036, RG3).
  const envelopeTargets: [string, string][] = data.envelopes.filter(e => envelopeEntryAccount(data, e.id)).map(e => [`${ENVELOPE_PREFIX}${e.id}`, e.name]);
  // Current accounts out of the budget (e.g. Swile) take an entry too, with no revenue line at all (spec 0042, RG1).
  const accountTargets: [string, string][] = offBudgetEntryAccounts(data).map(a => [`${ACCOUNT_PREFIX}${a.id}`, a.name]);
  const targets: [string, string][] =
    form.type === 'var' ? lines.filter(l => l.block === 'var').map(l => [l.key, l.name]) : form.type === 'env' ? data.envelopes.map(e => [e.id, e.name]) : form.type === 'fix' ? lines.filter(l => isExpenseLineBlock(l.block)).map(l => [l.key, `${l.name} (${l.block === 'cre' ? 'Crédit' : 'Fixe'}, ${bankAccount(data, l.accountId)?.name ?? ''})`]) : form.type === 'rev' ? [...revenueTargets, ...envelopeTargets, ...accountTargets] : lines.filter(l => l.block === 'epa').map(l => [l.key, l.name]);
  const target = targets.some(t => t[0] === form.target) ? form.target : targets[0]?.[0] ?? '';
  // An entry of money can target an envelope (spec 0036, RG1): its choice is written `env:<id>` and makes the entry a `envin`. Same form, same type chip.
  const entryEnvelopeId = form.type === 'rev' && target.startsWith(ENVELOPE_PREFIX) ? target.slice(ENVELOPE_PREFIX.length) : undefined;
  const entryAccountId = form.type === 'rev' && target.startsWith(ACCOUNT_PREFIX) ? target.slice(ACCOUNT_PREFIX.length) : undefined;
  const txType: TxType = entryEnvelopeId ? 'envin' : entryAccountId ? 'accin' : form.type;
  const txTarget = entryEnvelopeId ?? entryAccountId ?? target;
  // « Payé avec » is frozen on the account of the envelope (spec 0011, RG10) or on the account assigned to the variable line (spec 0006 amended).
  // Otherwise, until the user picks an account (form.accountId empty), it follows the payment mode of the chosen box (spec 0006, RG5).
  const fixedId = form.type === 'epa' ? undefined : fixedTransactionAccountId(data, { type: txType, month, target: txTarget });
  const envelopeAccount = form.type === 'env' ? data.accounts.find(a => a.id === data.envelopes.find(e => e.id === target)?.accountId) : data.accounts.find(a => a.id === fixedId);
  const accountId = envelopeAccount ? envelopeAccount.id : data.accounts.some(a => a.id === form.accountId && !a.archived) ? form.accountId : defaultTransactionAccountId(data, { type: txType, month, target: txTarget });
  // A withdrawal cannot be credited to the dedicated account of its savings line (spec 0007, RG7).
  const refusedAccountId = form.type === 'epa' ? lines.find(l => l.key === target)?.linkedAccountId : undefined;
  const accountRefused = accountId === refusedAccountId;
  // A variable line managed in cash takes no « Payé avec »: the expense debits no account (spec 0037, RG7, RG8).
  const cashLine = form.type === 'var' ? transactionBox(data, { type: 'var', month, target })?.payMode === 'especes' : false;
  // A fixed/credit line whose account is archived takes no expense (spec 0014).
  const lineBlocker = form.type === 'fix' && target ? expenseLineBlocker(data, month, target) : null;
  // Savings accounts the operation can be assigned to (spec 0028, RG2, RG16): none for an envelope expense or a savings withdrawal.
  const assignOptions = isAssignableType(txType) ? assignableAccounts(data, accountId) : [];
  const assignedId = form.assignedAccountId === OFF_BUDGET_CHOICE && isAssignableType(txType) ? OFF_BUDGET_CHOICE : assignOptions.some(a => a.id === form.assignedAccountId) ? form.assignedAccountId : '';
  const amount = parseAmount(form.amount) ?? 0;
  // The real date of the new entry is always explicit (spec 0039, RG11): today when it is in the period of the month, else the nearest end of the period.
  const entryDate = form.date || defaultEntryDate(data, month, isoDate());
  // Envelope and savings expenses paid from an account out of the budget leave the budget figures alone; a variable expense always counts in its line (spec 0008, RG15, RG16).
  const budgetAmount = isAccountInBudget(data, accountId) ? amount : 0;

  // An envelope expense paid in cash cannot exceed the cash left on the envelope (spec 0026, RG7).
  const cashRefused = form.type === 'env' && form.payMode === 'especes' && !!target && amount > 0 && exceedsEnvelopeCash(data, target, month, amount);

  const s = monthSummary(data, ledger, month);
  // An entry is « rattachée à un pointage » when its line is checked off this month (envelopes have no pointage).
  const isPointed = (t: { type: TxType; target: string }) => t.type !== 'env' && t.type !== 'epd' && t.type !== 'envin' && t.type !== 'accin' && !!lineCheck(data, month, t.target);
  const minAmount = parseAmount(filter.min) ?? null;
  const maxAmount = parseAmount(filter.max) ?? null;
  const txs = data.transactions.filter(t => t.month === month);
  const assignedSpent = spentOf(txs.filter(isTransactionOffBudget));
  const shown = txs
    .filter(t => filter.type === 'all' || t.type === filter.type)
    .filter(t => filter.accountId === 'all' || bankAccount(data, t.accountId)?.id === filter.accountId || t.assignedAccountId === filter.accountId)
    .filter(t => !filter.target || (t.target === filter.target && !isTransactionOffBudget(t)))
    .filter(t => matchesEntrySearch(t, filter.q))
    .filter(t => !filter.pointedOnly || isPointed(t))
    .filter(t => !filter.flaggedOnly || t.flagged === true)
    .filter(t => (!filter.from || bankDateOf(t, data) >= filter.from) && (!filter.to || bankDateOf(t, data) <= filter.to))
    .filter(t => (minAmount === null || t.amount >= minAmount) && (maxAmount === null || t.amount <= maxAmount))
    .sort((a, b) => bankDateOf(b, data).localeCompare(bankDateOf(a, data)));
  const isFiltered = !!(filter.q || filter.type !== 'all' || !!filter.target || filter.accountId !== 'all' || filter.pointedOnly || filter.flaggedOnly || filter.from || filter.to || filter.min || filter.max);
  const envelopeEntriesTotal = round2(txs.filter(t => t.type === 'envin').reduce((a, t) => a + t.amount, 0));
  const accountEntriesTotal = round2(txs.filter(t => t.type === 'accin').reduce((a, t) => a + t.amount, 0));
  const shownRevenue = round2(shown.filter(t => t.type === 'rev').reduce((a, t) => a + t.amount, 0));
  const inRange = (date: string, amount: number) => (!filter.from || date >= filter.from) && (!filter.to || date <= filter.to) && (minAmount === null || amount >= minAmount) && (maxAmount === null || amount <= maxAmount);
  const allMovements = (data.accountMovements ?? []).filter(m => m.month === month);
  const shownMovements = allMovements
    .filter(m => filter.accountId === 'all' || m.fromAccountId === filter.accountId || m.toAccountId === filter.accountId)
    .filter(m => matchesEntrySearch(m, filter.q))
    .filter(m => !filter.pointedOnly || (m.target?.kind === 'line' && !!lineCheck(data, month, m.target.key)))
    .filter(m => inRange(bankDateOf(m, data), m.amount));
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
  const targetsOf = (type: TxType, payerId?: string): [string, string][] =>
    type === 'epd' ? savingsExpenseLines(data, month, bankAccount(data, payerId)?.id ?? '').map(l => [l.key, l.name]) : type === 'var' ? lines.filter(l => l.block === 'var').map(l => [l.key, l.name]) : type === 'env' ? data.envelopes.map(e => [e.id, e.name]) : type === 'fix' ? lines.filter(l => isExpenseLineBlock(l.block)).map(l => [l.key, l.name]) : type === 'rev' ? lines.filter(l => l.block === 'rev').map(l => [l.key, l.name]) : lines.filter(l => l.block === 'epa').map(l => [l.key, l.name]);
  const startEdit = (t: (typeof txs)[number]) => setEditingTx({ id: t.id, label: t.label, amount: String(t.amount).replace('.', ','), date: bankDateOf(t, data), detail: t.detail ?? '', type: t.type, target: t.target, assignedAccountId: t.assignedAccountId ?? (t.offBudget ? OFF_BUDGET_CHOICE : '') });
  const editPatch = editingTx && { label: editingTx.label, amount: parseAmount(editingTx.amount) ?? 0, date: editingTx.date, detail: editingTx.detail, type: editingTx.type, target: editingTx.target, assignedAccountId: editingTx.assignedAccountId === OFF_BUDGET_CHOICE ? null : editingTx.assignedAccountId || null, offBudget: editingTx.assignedAccountId === OFF_BUDGET_CHOICE };
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
    const rows = [...picked].sort((a, b) => bankDateOf(a, data).localeCompare(bankDateOf(b, data))).map(t => ({
      date: bankDateOf(t, data),
      label: t.label,
      detail: t.detail ?? '',
      type: TYPE_LABEL[t.type],
      imputation: targetName(t.type, t.target),
      account: bankAccount(data, t.accountId)?.name ?? '',
      offBudget: isTransactionOffBudget(t),
      assignedTo: t.assignedAccountId ? data.accounts.find(a => a.id === t.assignedAccountId)?.name ?? '' : '',
      amount: signedAmount(t),
    }));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([transactionsCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    a.download = `operations-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const targetName = (type: TxType, id: string) => (type === 'accin' ? data.accounts.find(a => a.id === id)?.name : type === 'env' || type === 'envin' ? data.envelopes.find(e => e.id === id)?.name : lines.find(l => l.key === id)?.name) ?? 'Supprimé';
  const targetHue = (type: TxType, id: string) => (type === 'var' || type === 'fix' ? HUE.dep : type === 'env' || type === 'envin' ? data.envelopes.find(e => e.id === id)?.hue ?? HUE.epa : HUE.epa);

  let impact: [string, string][] = [];
  if (target && form.type === 'var') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    // Only the variable lines in the budget count in « Restant des variables »; a line out of the budget leaves it unchanged (spec 0009, RG112).
    const rest = variableRemaining(data, month);
    const lineAmount = isLineInBudget(data, l) && !assignedId ? amount : 0;
    impact = [
      [`${l.name} · réel`, `${money(cur)} → ${money(cur + (assignedId ? 0 : amount))}`],
      ['Restant des variables', `${money(rest)} → ${money(rest - lineAmount)}`],
    ];
  } else if (target && form.type === 'env') {
    const e = data.envelopes.find(x => x.id === target)!;
    const spent = ledger.envMonth(e.id, month)?.spent ?? 0;
    impact = [
      [`${e.name} · dépensé`, `${money(spent)} → ${money(spent + budgetAmount)}`],
      ['Épargne réelle', `${money(s.realSavings)} → ${money(s.realSavings - budgetAmount)}`],
    ];
  } else if (entryAccountId) {
    // Money on an account out of the budget: only its balance moves, no revenue, no envelope, no budget figure (spec 0042, RG5, RG6).
    const acc = data.accounts.find(x => x.id === entryAccountId)!;
    const balance = ledger.bankMonth(acc.id, month)?.balance ?? 0;
    impact = [
      [`${acc.name} · solde réel`, `${money(balance)} → ${money(balance + amount)}`],
      ['Revenus', 'inchangés'],
      ['Épargne réelle', 'inchangée'],
    ];
  } else if (entryEnvelopeId) {
    // Money back on an envelope: its spending goes down, its balance up, and no revenue moves (spec 0036, RG6, RG7).
    const e = data.envelopes.find(x => x.id === entryEnvelopeId)!;
    const spent = ledger.envMonth(e.id, month)?.spent ?? 0;
    impact = [
      [`${e.name} · dépensé`, `${money(spent)} → ${money(spent - budgetAmount)}`],
      ['Épargne réelle', `${money(s.realSavings)} → ${money(s.realSavings + budgetAmount)}`],
      ['Revenus', 'inchangés'],
    ];
  } else if (target && form.type === 'rev') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    impact = [[`${l.name} · réel`, `${money(cur)} → ${money(cur + (assignedId ? 0 : amount))}`]];
  } else if (target && form.type === 'fix') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    impact = [
      [`${l.name} · réel`, `${money(cur)} → ${money(cur + (assignedId ? 0 : amount))}`],
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
    if (transfer || !amount || amount < 0 || !target || locked || accountRefused || lineBlocker || cashRefused || !isRealDate(entryDate)) return;
    update(d =>
      addManualTransaction(d, { id: newId('t'), month, label: form.label.trim() || targetName(txType, txTarget), amount, type: txType, target: txTarget, ...(cashLine ? {} : { accountId }), detail: form.detail, ...((entryEnvelopeId || entryAccountId) && form.source.trim() ? { source: form.source.trim() } : {}), ...(assignedId === OFF_BUDGET_CHOICE ? { offBudget: true as const } : assignedId ? { assignedAccountId: assignedId } : {}), ...((form.type === 'env' && form.payMode === 'especes') || cashLine ? { payMode: 'especes' as const } : {}) }, entryDate),
    );
    // Picking another account is a one-off: the next expense follows its box again.
    setForm(f => ({ ...f, label: '', detail: '', amount: '', accountId: '', payMode: 'virtuel', assignedAccountId: '', date: '', source: '' }));
  };

  const flow: { label: string; value: number; hero?: boolean }[] = [
    { label: 'Épargne budgétisée', value: s.savings },
    { label: '+ Allocations des enveloppes', value: round2(s.grossSavings - s.savings) },
    { label: '− Dépenses des enveloppes', value: s.envelopeSpent },
    { label: '− Sorties des comptes d’épargne', value: s.savingsOut },
    { label: '− Dépenses payées par l’épargne', value: s.fundedBySavings },
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
          <span className="field-label">Date <span className="field-optional">de l’opération</span></span>
          <input className="text-input" type="date" value={entryDate} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        </label>
        <label className="field-w">
          <span className="field-label">Détail <span className="field-optional">facultatif</span></span>
          <DetailInput value={form.detail} onChange={detail => setForm(f => ({ ...f, detail }))} onEnter={add} />
        </label>
        {(entryEnvelopeId || entryAccountId) && (
          <label className="field-w">
            <span className="field-label">Source <span className="field-optional">facultatif</span></span>
            <input className="text-input" value={form.source} placeholder="Ex. Garage" onChange={e => setForm(f => ({ ...f, source: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
        )}
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
          <TransferFields month={month} locked={locked} label={form.label} detail={form.detail} amount={amount} date={entryDate} onDone={() => setForm(f => ({ ...f, label: '', detail: '', amount: '', date: '' }))} />
        ) : (
          <>
        <div>
          <div className="field-label is-gap">{form.type === 'var' ? 'Ligne de dépense variable' : form.type === 'env' ? 'Enveloppe' : form.type === 'fix' ? 'Ligne fixe ou crédit' : form.type === 'rev' ? (accountTargets.length > 0 ? 'Revenu, enveloppe ou compte' : 'Revenu ou enveloppe') : 'Compte d’épargne débité'}</div>
          {form.type === 'rev' && envelopeTargets.length + accountTargets.length > 0 ? (
            // Groups, as in a select with optgroups: the revenue lines, the envelopes (spec 0036, RG1), the accounts out of the budget (spec 0042, RG1); an empty group is absent.
            ([['Lignes de revenu', revenueTargets], ['Enveloppes', envelopeTargets], ['Comptes hors budget', accountTargets]] as [string, [string, string][]][]).filter(([, group]) => group.length > 0).map(([title, group]) => (
              <Fragment key={title}>
                <div className="muted is-small">{title}</div>
                <div className="chips is-wrap">
                  {group.map(([id, name]) => (
                    <Chip key={id} on={target === id} onClick={() => setForm(f => ({ ...f, target: id }))}>
                      {name}
                    </Chip>
                  ))}
                </div>
              </Fragment>
            ))
          ) : (
            <Choice options={targets} value={target} onPick={id => setForm(f => ({ ...f, target: id }))} />
          )}
        </div>
        <div>
          <div className="field-label is-gap">{form.type === 'epa' || form.type === 'rev' ? 'Reçu sur' : 'Payé avec'}</div>
          {cashLine ? (
            <div className="muted">Espèces : aucun compte n’est débité. Le montant s’ajoute au réel de la ligne.</div>
          ) : form.type === 'env' ? (
            // An envelope expense is always on the envelope's account: only cash or virtual is chosen (spec 0026, RG5).
            <div className="chips is-wrap">
              {([['virtuel', 'Virtuel'], ['especes', 'Espèces']] as const).map(([mode, name]) => (
                <Chip key={mode} on={form.payMode === mode} onClick={() => setForm(f => ({ ...f, payMode: mode }))}>
                  {name}
                </Chip>
              ))}
            </div>
          ) : (
          <Choice
            options={(envelopeAccount ? [envelopeAccount] : activeBankAccounts(data)).map(a => [a.id, a.name])}
            value={accountId}
            onPick={envelopeAccount ? () => undefined : id => setForm(f => ({ ...f, accountId: id }))}
            render={(id, name) => (
              <span className="acc-item">
                <AccountDot account={data.accounts.find(a => a.id === id)!} />
                {name}
              </span>
            )}
          />
          )}
        </div>
        {isAssignableType(txType) && <AssignPicker accounts={assignOptions} value={assignedId} disabled={locked} onChange={assignedAccountId => setForm(f => ({ ...f, assignedAccountId }))} />}
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
            <div className="tx-title">{view === 'ops' ? 'Opérations' : 'Transferts'} de {monthLabel(month)}</div>
            {view === 'ops' ? (
              <b title={`Total des dépenses (les entrées d’argent ne comptent pas)${assignedSpent > 0 ? `\ndont ${money(assignedSpent)} hors budget / affectés` : ''}${envelopeEntriesTotal > 0 ? `\nEntrées sur enveloppe du mois : ${money(envelopeEntriesTotal)} (non déduites)` : ''}${accountEntriesTotal > 0 ? `\nEntrées sur compte hors budget du mois : ${money(accountEntriesTotal)} (non déduites)` : ''}`}>{money(spentOf(txs))}</b>
            ) : (
              <b>{money(allMovements.reduce((a, m) => a + m.amount, 0))}</b>
            )}
          </div>
          <div className="tabs" style={{ margin: '0 16px 8px' }}>
            {([['ops', 'Opérations', txs.length], ['transferts', 'Transferts', allMovements.length]] as const).map(([id, name, n]) => (
              <div key={id} className={`tab${view === id ? ' is-active' : ''}`} onClick={() => setView(id)}>
                {name} ({n})
              </div>
            ))}
          </div>
          <div className="tx-filters">
            <div className="tx-f">
              <span className="tx-f-label">Recherche</span>
              <input className="text-input" value={filter.q} placeholder="Libellé ou détail" onChange={e => setFilter(f => ({ ...f, q: e.target.value }))} />
            </div>
            {focus && filter.target && (
              <div className="tx-f">
                <span className="tx-f-label">Ligne</span>
                <span className="btn-outline tx-clear" title="Retirer le filtre sur la ligne" onClick={() => setFilter(f => ({ ...f, target: '', type: 'all' }))}>
                  {focus.label} ✕
                </span>
              </div>
            )}
            {view === 'ops' && <div className="tx-f">
              <span className="tx-f-label">Type</span>
              <select className="text-input" value={filter.type} onChange={e => setFilter(f => ({ ...f, type: e.target.value as TxType | 'all' }))}>
                <option value="all">Tous les types</option>
                {(Object.keys(TYPE_LABEL) as TxType[]).map(t => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>}
            <div className="tx-f">
              <span className="tx-f-label">Compte</span>
              <select className="text-input" value={filter.accountId} onChange={e => setFilter(f => ({ ...f, accountId: e.target.value }))}>
                <option value="all">Tous les comptes</option>
                {data.accounts.filter(a => a.id !== CASH_ACCOUNT_ID).map(a => (
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
                <label className="tx-pointed-filter" title="N’afficher que les opérations marquées d’un drapeau">
                  <input type="checkbox" checked={filter.flaggedOnly} onChange={e => setFilter(f => ({ ...f, flaggedOnly: e.target.checked }))} />
                  Marquées
                </label>
                <label className="tx-pointed-filter" title="Afficher le détail sous le libellé de chaque ligne">
                  <input type="checkbox" checked={filter.showDetail} onChange={e => setFilter(f => ({ ...f, showDetail: e.target.checked }))} />
                  Détails
                </label>
                {(filter.from || filter.to || filter.min || filter.max || filter.pointedOnly || filter.flaggedOnly) && (
                  <span className="btn-outline tx-clear" onClick={() => setFilter(f => ({ ...f, from: '', to: '', min: '', max: '', pointedOnly: false, flaggedOnly: false }))}>
                    Effacer
                  </span>
                )}
              </div>
            </div>
          </div>
          {view === 'ops' && <>
          {isFiltered && (
            <div className="tx-bulk">
              <span>
                {shown.length} opération{shown.length > 1 ? 's' : ''} filtrée{shown.length > 1 ? 's' : ''} · Total dépenses {money(spentOf(shown))}
                {shownRevenue > 0 && ` · Revenus ${money(shownRevenue)} · Différence ${money(round2(shownRevenue - spentOf(shown)))}`}
              </span>
            </div>
          )}
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
                <EntryDate entry={t} attachedWord="Rattachée" />
                <EntryLabel entry={t} hideDetail={!filter.showDetail} onOpen={openDetail} />
                <span className="tx-target">
                  <span className="dot is-9" style={{ background: tone(targetHue(t.type, t.target)).base }} />
                  <span className="ellipsis">{targetName(t.type, t.target)}</span>
                  <span className="tx-type">{TYPE_LABEL[t.type]}</span>
                  {t.assignedAccountId && (
                    <span className="tx-assigned" title="Affectée à ce compte d’épargne : hors budget, sans effet sur les soldes">
                      {data.accounts.find(a => a.id === t.assignedAccountId)?.name ?? 'Compte'}
                    </span>
                  )}
                  {t.payMode === 'especes' && (t.type === 'var' || t.type === 'env') && (
                    <span className="tx-assigned" title="Payée en espèces : ne débite aucun compte, absente des mouvements du compte">
                      Espèces
                    </span>
                  )}
                  {t.offBudget && (
                    <span className="tx-assigned" title="Hors budget : n’entre pas dans les chiffres du budget, sans effet sur les soldes">
                      Hors budget
                    </span>
                  )}
                </span>
                <AccountPicker data={data} accountId={t.accountId} showName disabled={locked || isEnvelopeAccount(bankAccount(data, t.accountId)) || fixedTransactionAccountId(data, t) !== undefined} onPick={id => update(d => setTransactionAccount(d, t.id, id))} />
                <b className="num" style={signedAmount(t) > 0 ? { color: GOOD } : undefined}>{money(signedAmount(t), true)}</b>
                <span className="tx-actions">
                  <span className={`icon-btn${t.flagged ? ' is-on' : ''}`} title={t.flagged ? 'Retirer le drapeau' : 'Marquer d’un drapeau (filtre « Marquées »)'} onClick={() => update(d => setTransactionFlag(d, t.id, !t.flagged))}>
                    <Icon name="flag" size={13} stroke={2} />
                  </span>
                  {!locked && (<>
                    {t.type !== 'envin' && t.type !== 'accin' && <span className="icon-btn" title="Modifier" onClick={() => (editingTx?.id === t.id ? setEditingTx(null) : startEdit(t))}>
                      <Icon name="pencil" size={13} stroke={2} />
                    </span>}
                    <span className="icon-btn" title="Supprimer" onClick={() => update(d => deleteTransaction(d, t.id))}>
                      <Icon name="close" size={14} />
                    </span>
                  </>)}
                </span>
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
                  {editingTx.type !== 'rev' && editingTx.type !== 'epd' && (
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
                    <Choice options={targetsOf(editingTx.type, t.accountId)} value={editingTx.target} onPick={id => setEditingTx({ ...editingTx, target: id })} />
                  </div>
                  {(isAssignableType(editingTx.type) || editingTx.assignedAccountId !== '') && (
                    <AssignPicker
                      accounts={[...assignableAccounts(data, t.accountId), ...data.accounts.filter(a => a.id === t.assignedAccountId && a.archived)]}
                      value={editingTx.assignedAccountId}
                      onChange={assignedAccountId => setEditingTx({ ...editingTx, assignedAccountId })}
                    />
                  )}
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
          </>}
          {view === 'transferts' && <MovementsBlock month={month} locked={locked} showDetail={filter.showDetail} movements={shownMovements} total={allMovements.length} />}
        </div>
      </div>
    </div>
  );
}

/** Transfers of the month (spec 0013, RG10d; spec 0019): created by the import or by the « Transfert » form, edited (label, amount) or deleted here. */
function MovementsBlock({ month, locked, showDetail, movements, total }: { month: MonthKey; locked: boolean; showDetail: boolean; movements: AccountMovement[]; total: number }) {
  const { data, update } = useStore();
  const [editing, setEditing] = useState<{ id: string; label: string; amount: string; detail: string; date: string; from: string; to: string } | null>(null);
  // Detail-only editing, also on a locked month (spec 0020, RG6, RG11).
  const [editingDetail, setEditingDetail] = useState<{ id: string; text: string } | null>(null);
  if (movements.length === 0) return <div className="empty">{total === 0 ? 'Aucun transfert ce mois-ci.' : 'Aucun transfert ne correspond aux filtres.'}</div>;
  const openDetail = (id: string, detail?: string) => setEditingDetail({ id, text: detail ?? '' });
  const saveDetail = () => {
    if (!editingDetail) return;
    const { id, text } = editingDetail;
    update(d => void setAccountMovementDetail(d, id, text));
    setEditingDetail(null);
  };
  const nameOf = (id: string) => movementAccountName(data, id);
  // Accounts offered when editing a transfer: active ones, plus the current ones (possibly archived); never the reserved cash account.
  const editableAccounts = data.accounts.filter(a => a.id !== CASH_ACCOUNT_ID && (!a.archived || a.id === editing?.from || a.id === editing?.to));
  // « Réparti dans les enveloppes » next to a debit « vers enveloppes » (spec 0016, RG29): calculated, never typed, no balance.
  const split = envelopeSplit(data, month);
  // Several debits « vers enveloppes » in a month: the monthly total is shown once, on the first one listed.
  const firstPoolId = [...movements].sort((a, b) => bankDateOf(b, data).localeCompare(bankDateOf(a, data))).find(m => isEnvelopesPool(m.toAccountId))?.id;
  // State of the link between the two lines of the bank file (spec 0016, RG18).
  const linkLabel = (m: AccountMovement) => {
    const state = linkStateOf(m);
    const day = (date: string) => date.slice(8, 10) + '/' + date.slice(5, 7);
    if (state === 'lie') return `Lié · Débit ${day(debitDateOf(m, data))} ${nameOf(m.fromAccountId)}, Crédit ${day(creditDateOf(m, data))} ${nameOf(m.toAccountId)}`;
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
    update(d => void updateAccountMovement(d, editing.id, { label: editing.label, amount: parseAmount(editing.amount) ?? 0, detail: editing.detail, date: editing.date, fromAccountId: editing.from, toAccountId: editing.to }));
    setEditing(null);
  };
  return (
    <>
      {[...movements]
        .sort((a, b) => bankDateOf(b, data).localeCompare(bankDateOf(a, data)))
        .map(m =>
          editing?.id === m.id ? (
            <Fragment key={m.id}>
              <div className="mv-grid tx-row">
                <input className="text-input" type="date" value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })} />
                <input className="text-input" value={editing.label} onChange={e => setEditing({ ...editing, label: e.target.value })} />
                {!isEnvelopesPool(m.fromAccountId) && !isEnvelopesPool(m.toAccountId) ? (
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <select className="text-input" value={editing.from} onChange={e => setEditing({ ...editing, from: e.target.value })}>
                      {editableAccounts.filter(a => a.id !== editing.to || a.id === editing.from).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                    →
                    <select className="text-input" value={editing.to} onChange={e => setEditing({ ...editing, to: e.target.value })}>
                      {editableAccounts.filter(a => a.id !== editing.from).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                      {!isEnvelopeAccount(data.accounts.find(a => a.id === editing.from)) && <option value={CASH_ID}>{CASH_LABEL} (retrait)</option>}
                    </select>
                  </span>
                ) : (
                  <span className="muted ellipsis" title="Comptes figés : virement vers les enveloppes.">
                    {nameOf(m.fromAccountId)} → {nameOf(m.toAccountId)}
                  </span>
                )}
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
                <EntryDate entry={m} attachedWord="Rattaché" />
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
                    <span className="icon-btn" style={{ width: 'auto', padding: '0 6px' }} title="Modifier" onClick={() => setEditing({ id: m.id, label: m.label, amount: String(m.amount).replace('.', ','), detail: m.detail ?? '', date: bankDateOf(m, data), from: m.fromAccountId, to: m.toAccountId })}>
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
    </>
  );
}

/**
 * Fields of the « Transfert » type (spec 0019, RG14, RG15): source and destination accounts, day and the budget item the transfer stands for
 * (optional; the envelope or the savings line of the destination is proposed). The label, detail and amount are those of the form.
 */
function TransferFields({ month, locked, label, detail, amount, date, onDone }: { month: MonthKey; locked: boolean; label: string; detail: string; amount: number; date: string; onDone: () => void }) {
  const { data, update } = useStore();
  // The reserved « Espèces » account is hidden (spec 0037, RG21).
  const accounts = data.accounts.filter(a => !a.archived && a.id !== CASH_ACCOUNT_ID);
  const main = accounts.find(a => a.isDefault) ?? accounts[0];
  const [fromId, setFromId] = useState(main?.id ?? '');
  const [toChoice, setToChoice] = useState('');
  // `undefined`: not chosen yet, the default of the destination applies; `''`: « aucune ».
  const [chosen, setChosen] = useState<string | undefined>(undefined);
  // « Espèces » (a withdrawal, spec 0037, RG1) is a destination of any account but an envelope's; it is not an account and credits none.
  const canWithdraw = !isEnvelopeAccount(accounts.find(a => a.id === fromId));
  const toId = toChoice === CASH_ID && canWithdraw ? CASH_ID : toChoice && toChoice !== CASH_ID && toChoice !== fromId && accounts.some(a => a.id === toChoice) ? toChoice : accounts.find(a => a.id !== fromId)?.id ?? '';
  const items = toId === CASH_ID ? [] : transferItems(data, month).filter(i => i.toAccountId === toId);
  const valueOf = (t: MovementTarget | null | undefined) => (t ? (t.kind === 'line' ? `line:${t.key}` : `env:${t.id}`) : '');
  const value = toId === CASH_ID ? '' : chosen !== undefined ? chosen : valueOf(defaultTransferTarget(data, month, toId, fromId));
  const item = items.find(i => valueOf(i.target) === value);
  const ready = !!fromId && !!toId && (fromId !== toId) && amount > 0 && isRealDate(date) && !locked;
  const add = () => {
    if (!ready) return;
    update(d => void addManualTransfer(d, { id: newId('m'), month, label: label.trim() || (toId === CASH_ID ? 'Retrait' : 'Transfert'), amount, fromAccountId: fromId, toAccountId: toId, ...(item ? { target: item.target } : {}), detail }, date));
    setChosen(undefined);
    onDone();
  };
  const accountChips = (current: string, pick: (id: string) => void, exclude?: string, withCash = false) => (
    <Choice
      options={[...accounts.filter(a => a.id !== exclude).map((a): [string, string] => [a.id, a.name]), ...(withCash ? [[CASH_ID, `${CASH_LABEL} (retrait)`] as [string, string]] : [])]}
      value={current}
      onPick={pick}
      render={(id, name) =>
        id === CASH_ID ? (
          <span className="acc-item">
            <Icon name="cash" size={13} stroke={2.2} />
            {name}
          </span>
        ) : (
          <span className="acc-item">
            <AccountDot account={accounts.find(a => a.id === id)!} />
            {name}
          </span>
        )
      }
    />
  );
  return (
    <>
      <div>
        <div className="field-label is-gap">De</div>
        {accountChips(fromId, id => { setFromId(id); setChosen(undefined); })}
      </div>
      <div>
        <div className="field-label is-gap">Vers</div>
        {accountChips(toId, id => { setToChoice(id); setChosen(undefined); }, fromId, canWithdraw)}
      </div>
      <div className="form-row">
        {toId !== CASH_ID && (
          <label className="field-w">
            <span className="field-label">Rattacher à (facultatif)</span>
            <select className="text-input" value={value} onChange={e => setChosen(e.target.value)}>
              <option value="">Aucun (transfert libre)</option>
              {items.map(i => (
                <option key={valueOf(i.target)} value={valueOf(i.target)}>{i.label}</option>
              ))}
            </select>
          </label>
        )}
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
