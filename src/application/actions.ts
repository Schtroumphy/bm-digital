import { BANK_HUES, CASH_ACCOUNT_ID, accountIdOf, canAssignTo, defaultBankAccounts, defaultTransactionAccountId, fixedTransactionAccountId, freeEnvelopeAccountId, isAssignableType, isEnvelopeAccount, newEnvelopeAccount, isSavingsWithdrawalAllowed, kindForBlock, MAIN_ACCOUNT_ID } from '../domain/bank';
import { applyDetail, normalizeDetail } from '../domain/detail';
import { addMonths, compareMonths, currentMonthKey, round2 } from '../domain/format';
import { syncLineActual } from '../domain/lineActuals';
import { expenseLineBlocker, expenseLine, revenueLine, expenseLineAccountId } from '../domain/lineExpenses';
import { exceedsEnvelopeCash } from '../domain/envelopeCash';
import { isMonthLocked } from '../domain/ledger';
import type { BankAccount, BlockKey, BudgetData, Envelope, EnvHistory, Line, MonthKey, Transaction, TxType } from '../domain/types';
import type { SetupDraft, SetupRow } from './setup';

function initMonth(d: BudgetData, m: MonthKey, lines: Line[], alloc: Record<string, number>) {
  d.months[m] = {
    initialized: true,
    // The actual of a line is the sum of its entries (spec 0019, RG19, RG20): copied from nothing, recomputed below from the entries already recorded.
    lines: lines.map(l => ({ ...l, actual: null })),
    alloc: { ...alloc },
    transfersDone: d.months[m]?.transfersDone ?? {},
    // The pointages belong to the lines just replaced and are not copied (spec 0009, RG17); the balances typed by hand stay.
    ...(d.months[m]?.accountBalances ? { accountBalances: d.months[m].accountBalances } : {}),
  };
  for (const l of d.months[m].lines) syncLineActual(d, m, l.key);
}

/** Creates the month's lines and allocations from the budget model (no actual is copied, spec 0019, RG19). Refused (false) on a locked month. */
export function applyTemplate(d: BudgetData, m: MonthKey): boolean {
  if (isMonthLocked(d, m)) return false;
  initMonth(d, m, d.template.lines.map(l => ({ ...l, actual: null })), d.template.envAlloc);
  return true;
}

/** Creates the month from the previous month's budgets (actuals start empty). Refused (false) on a locked month. */
export function duplicatePrevious(d: BudgetData, m: MonthKey): boolean {
  const prev = d.months[addMonths(m, -1)];
  if (!prev?.initialized || isMonthLocked(d, m)) return false;
  initMonth(d, m, prev.lines, prev.alloc);
  return true;
}

export function saveAsTemplate(d: BudgetData, m: MonthKey) {
  const md = d.months[m];
  if (!md?.initialized) return;
  d.template = { lines: md.lines.map(({ actual: _actual, ...l }) => l), envAlloc: { ...md.alloc } };
}

/**
 * Sets an envelope's allocation for a month (replacement, not addition) and
 * copies the value into the budget model so that future months start from it,
 * even when it equals the current allocation. 0 is valid. Refuses negative or
 * invalid amounts, and does nothing for an unknown envelope or a month that is
 * not initialized or is locked. Returns true when applied.
 */
export function setEnvelopeAllocation(d: BudgetData, m: MonthKey, envelopeId: string, amount: number): boolean {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return false;
  if (!d.envelopes.some(e => e.id === envelopeId)) return false;
  if (!(amount >= 0)) return false;
  const next = round2(amount);
  md.alloc[envelopeId] = next;
  d.template.envAlloc[envelopeId] = next;
  return true;
}

/** Months the assistant can start from: one year before to one year after today, never before an existing first month. */
export function setupMonths(d: BudgetData, today = currentMonthKey()): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = addMonths(today, -12); compareMonths(k, addMonths(today, 12)) <= 0; k = addMonths(k, 1)) {
    if (d.firstMonth === null || compareMonths(k, d.firstMonth) >= 0) out.push(k);
  }
  return out;
}

export const isSetupMonthAllowed = (d: BudgetData, m: MonthKey, today = currentMonthKey()) => setupMonths(d, today).includes(m);

/** True when creating the month would overwrite lines already there (the UI asks for confirmation first). */
export const willReplaceMonth = (d: BudgetData, m: MonthKey) => !!d.months[m]?.initialized;

/** OKLCH hues given to envelopes, in order. */
const ENVELOPE_HUES = [300, 170, 350, 240, 75, 130, 190, 25];

/**
 * Creates the first month from the assistant's draft: the month's lines, the
 * budget model (`template`), the envelopes and the starting balances.
 *
 * Starting balances are the balances on the 1st day of the month, i.e. the
 * ones at the end of the previous month. We therefore store them as a
 * statement (accounts) and an imported-history entry (envelopes) of the
 * previous month, which the Ledger already reads as opening balances
 * (see docs/adr/0001-soldes-de-depart-via-le-mois-precedent.md).
 *
 * Returns false, and changes nothing, when the month is not allowed.
 */
export function createFirstMonth(d: BudgetData, draft: SetupDraft, today = currentMonthKey()): boolean {
  const m = draft.month;
  if (!isSetupMonthAllowed(d, m, today)) return false;
  const rows = draft.rows;

  // The assistant has no source column for savings: they are paid from the main account, which cannot also be their dedicated one (RG2).
  const mainId = rows.acc.find(a => a.isDefault)?.id ?? MAIN_ACCOUNT_ID;
  // Like an envelope, a savings/investment row without a dedicated account of its own choice gets one, of the kind of its block,
  // opening on the first month with the balance typed in the assistant (spec 0010). An account already created by an earlier run is kept.
  const savingsAccounts: BankAccount[] = [];
  const takenHues = (): number[] => [...rows.acc.map(a => a.hue), ...savingsAccounts.map(a => a.hue)].filter((h): h is number => h !== undefined);
  const savingsAccountOf = (r: SetupRow, block: BlockKey): string => {
    const id = freeSavingsAccountId(d, r.id);
    if (!d.accounts.some(a => a.id === id) && !savingsAccounts.some(a => a.id === id)) {
      const used = takenHues();
      const hue = BANK_HUES.find(h => !used.includes(h)) ?? BANK_HUES[(rows.acc.length + savingsAccounts.length) % BANK_HUES.length];
      savingsAccounts.push({ id, name: r.name.trim() || 'Sans nom', hue, isDefault: false, openingBalance: r.balance, openingMonth: m, inBudget: true, archived: false, kind: kindForBlock(block), openingConfirmed: true });
    }
    return id;
  };
  const linkOf = (r: SetupRow, block: BlockKey) => ({ linkedAccountId: isValidSetupLink(r, block, mainId, rows.acc) ? r.linkedAccountId : savingsAccountOf(r, block) });
  const line = (block: BlockKey, r: SetupRow, section = ''): Line => ({
    key: r.id,
    block,
    section,
    name: r.name.trim() || 'Sans nom',
    budget: r.amount,
    actual: null,
    ...(r.accountId ? { accountId: r.accountId } : {}),
    // Dedicated account of a savings/investment line (spec 0007, RG16); only epa/inv rows carry it.
    ...(block === 'epa' || block === 'inv' ? linkOf(r, block) : {}),
  });

  // A variable line's « Compte » column also holds « Espèces »: that is the cash mode, not an assigned account (spec 0006, RG9).
  const varLine = (r: SetupRow): Line => {
    const { accountId, ...rest } = line('var', r);
    return accountId === CASH_ACCOUNT_ID ? { ...rest, payMode: 'especes' } : { ...rest, ...(accountId ? { accountId } : {}) };
  };
  const lines: Line[] = [
    ...rows.rev.map(r => line('rev', r)),
    ...rows.cre.map(r => line('cre', r)),
    ...rows.dep.filter(r => r.kind === 'fix').map(r => line('fix', r)),
    ...rows.dep.filter(r => r.kind !== 'fix').map(varLine),
    ...rows.epa.map(r => line('epa', r, SAVINGS_SECTIONS[r.kind === 'MT' ? 'MT' : 'LT'])),
    ...rows.inv.map(r => line('inv', r)),
  ];
  // Each envelope has its own account, opening on the first month with the balance typed in the assistant (spec 0011, RG3).
  const keptAccount = (id: string) => d.envelopes.find(e => e.id === id)?.accountId;
  const envelopeAccounts: BankAccount[] = [];
  const envelopes: Envelope[] = rows.env.map((r, i) => {
    const name = r.name.trim() || 'Sans nom';
    const hue = ENVELOPE_HUES[i % ENVELOPE_HUES.length];
    const kept = keptAccount(r.id);
    const accountId = kept ?? freeEnvelopeAccountId(d, r.id, envelopeAccounts.map(a => a.id));
    if (!kept) envelopeAccounts.push(newEnvelopeAccount(accountId, r.id, name, hue, r.balance, m));
    return { id: r.id, name, hue, openingCash: r.cash, accountId };
  });
  const envAlloc = Object.fromEntries(rows.env.map(r => [r.id, r.amount]));

  d.template = { lines: lines.map(({ actual: _actual, ...l }) => l), envAlloc };
  // The accounts of the envelopes that are no longer in the draft stay, archived (spec 0011, RG22).
  for (const a of d.accounts) if (isEnvelopeAccount(a) && !envelopes.some(e => e.accountId === a.id)) a.archived = true;
  d.envelopes = envelopes;
  d.accounts = [...(d.firstMonth === null ? accountsFromDraft(rows.acc, m) : mergeAccounts(d.accounts, accountsFromDraft(rows.acc, m))), ...envelopeAccounts, ...savingsAccounts];
  initMonth(d, m, lines, envAlloc);

  const before = addMonths(m, -1);
  d.statements[before] = Object.fromEntries([...rows.epa, ...rows.inv].map(r => [r.id, r.balance]));
  d.envHistory[before] = Object.fromEntries(rows.env.map((r): [string, EnvHistory] => [r.id, { alloc: 0, spent: 0, balance: r.balance }]));
  if (d.firstMonth === null) d.firstMonth = m;
  return true;
}

/** Id of the account created for a savings/investment row: stable, so a second run of the assistant finds it again. */
const freeSavingsAccountId = (_d: BudgetData, rowId: string): string => `acc-sav-${rowId}`;

/**
 * A draft row's dedicated account is kept when it differs from the account paying the row, exists in the draft
 * (spec 0007, RG2, RG16) and is of the kind of the row's block (spec 0010, RG7).
 */
function isValidSetupLink(r: SetupRow, block: BlockKey, mainId: string, accountRows: SetupRow[]): boolean {
  const id = r.linkedAccountId;
  const target = accountRows.find(a => a.id === id);
  return !!id && id !== (r.accountId ?? mainId) && !!target && !target.isDefault && id !== CASH_ACCOUNT_ID && (target.accountKind ?? 'courant') === kindForBlock(block);
}

/** Bank accounts typed in the assistant. The main account and « Espèces » are always there, whatever was typed. */
function accountsFromDraft(rows: SetupRow[], month: MonthKey): BankAccount[] {
  const fallback = defaultBankAccounts(month);
  const typed = rows.map((r, i): BankAccount => ({
    id: r.id,
    name: r.name.trim() || 'Sans nom',
    hue: r.hue ?? BANK_HUES[i % BANK_HUES.length],
    isDefault: !!r.isDefault,
    openingBalance: r.balance,
    openingMonth: month,
    inBudget: r.inBudget ?? true,
    archived: false,
    // The main account and « Espèces » are always `courant`: no kind written for them (spec 0010, RG2).
    ...(r.isDefault || r.id === CASH_ACCOUNT_ID ? {} : { kind: r.accountKind ?? 'courant' }),
    openingConfirmed: true,
  }));
  if (!typed.some(a => a.id === CASH_ACCOUNT_ID)) typed.push(fallback[1]);
  if (!typed.some(a => a.isDefault)) {
    const first = typed.find(a => a.id !== CASH_ACCOUNT_ID) ?? typed[0];
    first.isDefault = true;
  }
  // A single main account: the first one flagged.
  let seen = false;
  for (const a of typed) {
    if (a.isDefault && seen) a.isDefault = false;
    seen ||= a.isDefault;
  }
  return typed;
}

/** Adds the accounts of a new draft to an already started budget; existing accounts are never overwritten. */
function mergeAccounts(existing: BankAccount[], typed: BankAccount[]): BankAccount[] {
  return [...existing, ...typed.filter(a => !existing.some(e => e.id === a.id)).map(a => ({ ...a, isDefault: false }))];
}

/** Index of the last item matching the predicate, or -1. */
function lastIndexWhere<T>(items: T[], test: (item: T) => boolean): number {
  for (let i = items.length - 1; i >= 0; i--) if (test(items[i])) return i;
  return -1;
}

/** Sections of the savings block: the horizon of a savings line is its section. */
export const SAVINGS_SECTIONS = { LT: 'Épargne long terme', MT: 'Épargne moyen terme' } as const;

/**
 * Adds a line to a block. Without `targetSection`, it joins the section of the
 * block's last line. With one, it follows the last line of that section, or
 * opens the section at the end of the block when it does not exist yet.
 */
export function addLine(d: BudgetData, m: MonthKey, block: BlockKey, key: string, targetSection?: string): boolean {
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return false;
  const lines = d.months[m].lines;
  const inBlock = (l: Line) => l.block === block;
  let idx = lastIndexWhere(lines, l => inBlock(l) && (targetSection === undefined || l.section === targetSection));
  if (idx < 0 && targetSection !== undefined) idx = lastIndexWhere(lines, inBlock);
  const section = targetSection ?? (idx >= 0 ? lines[idx].section : '');
  const line: Line = { key, block, section, name: 'Nouvelle ligne', budget: 0, actual: null };
  lines.splice(idx >= 0 ? idx + 1 : lines.length, 0, line);
  return true;
}

/** Edits a line's name or budget. The actual cannot be edited: it is the sum of the entries (spec 0019, RG19). Refused (false) on a locked month or an unknown line. */
export function updateLine(d: BudgetData, m: MonthKey, key: string, patch: Partial<Pick<Line, 'name' | 'budget'>>): boolean {
  if (isMonthLocked(d, m)) return false;
  const l = d.months[m]?.lines.find(x => x.key === key);
  if (!l) return false;
  Object.assign(l, patch);
  return true;
}

export function deleteLine(d: BudgetData, m: MonthKey, key: string): boolean {
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return false;
  d.months[m].lines = d.months[m].lines.filter(l => l.key !== key);
  // The line's pointage goes with it (spec 0009), so it cannot reappear on a new line with the same key.
  delete d.months[m].checks?.[key];
  return true;
}

/**
 * Records a transaction (every type is a real entry, spec 0019, RG2); an entry on a line also feeds the actual of that line (RG20).
 * Refused (false) on a locked month, for a withdrawal credited to the dedicated account of its savings line (spec 0007, RG7), and for a
 * variable expense or a withdrawal on the account of an envelope (spec 0011, RG2).
 * An envelope expense is always on the account of its envelope, whatever account is given (spec 0011, RG10); a variable
 * expense on a line with an assigned account is refused on any other account.
 * Without an account, the transaction takes the one resolved from its box (spec 0006, RG3):
 * the account is written down, so a later change of the box does not move it (RG6).
 * An envelope expense may be paid in cash (`payMode: 'especes'`, spec 0026, RG5); it is refused when it exceeds the cash balance of the envelope (RG7), whatever its virtual balance.
 * The mode only exists on an envelope expense: it is dropped elsewhere, and `virtuel` is written as no mode at all.
 * An operation may be assigned to a savings account (`assignedAccountId`, spec 0028): only `var`, `fix` and `rev`, an active savings account other than the
 * operation's own (RG1, RG2, RG20). It may instead be marked « hors budget » (`offBudget`, spec 0031): same types, no account, and never together with an assignment
 * (RG3); `env` and `epa` are refused. `keepAssignment` is an assignment that stands even if its account was archived since (RG4): the unchanged one on an edit.
 */
export function addTransaction(d: BudgetData, input: Transaction, keepAssignment?: string): boolean {
  if (isMonthLocked(d, input.month) || !isSavingsWithdrawalAllowed(d, input)) return false;
  if (input.assignedAccountId !== undefined && !isAssignableType(input.type)) return false;
  if (input.offBudget !== undefined && (!isAssignableType(input.type) || input.assignedAccountId !== undefined)) return false;
  if (input.type === 'fix' || input.type === 'rev') return addLineExpense(d, input, keepAssignment);
  const given = d.accounts.find(a => a.id === input.accountId);
  if (input.type !== 'env' && given && isEnvelopeAccount(given)) return false;
  // A variable expense on a line with an assigned account stays on it: another account is refused (spec 0006 amended, 0011 RG10).
  const fixed = input.type === 'var' ? fixedTransactionAccountId(d, input) : undefined;
  if (fixed && input.accountId !== undefined && input.accountId !== fixed) return false;
  const envelope = input.type === 'env' ? d.envelopes.find(e => e.id === input.target) : undefined;
  const inCash = !!envelope && input.payMode === 'especes';
  if (inCash && exceedsEnvelopeCash(d, envelope.id, input.month, input.amount)) return false;
  const t = envelope
    ? { ...input, accountId: envelope.accountId }
    : input.accountId === undefined && input.type !== 'epa' ? { ...input, accountId: defaultTransactionAccountId(d, input) } : input;
  if (t.assignedAccountId !== undefined && !canAssignTo(d, t.type, accountIdOf(d, t.accountId), t.assignedAccountId, keepAssignment)) return false;
  const detail = normalizeDetail(input.detail);
  const { detail: _raw, payMode: _mode, ...base } = t;
  const rest = inCash ? { ...base, payMode: 'especes' as const } : base;
  d.transactions.push(detail === undefined ? rest : { ...rest, detail });
  // A variable expense always counts in its line's actual, whatever the paying account (spec 0008, RG2).
  if (t.type === 'var') syncLineActual(d, t.month, t.target);
  return true;
}

/**
 * Expense on a fixed or credit line (spec 0014), entry on a revenue line (spec 0015): refused on a locked month, on a line of another
 * block, on another account than the line's (RG2) or on an envelope's account. The actual of the line becomes the sum of its entries (spec 0019, RG20).
 */
function addLineExpense(d: BudgetData, input: Transaction, keepAssignment?: string): boolean {
  const line = input.type === 'rev' ? revenueLine(d, input.month, input.target) : expenseLine(d, input.month, input.target);
  if (!line || expenseLineBlocker(d, input.month, input.target)) return false;
  const accountId = expenseLineAccountId(d, line);
  if (input.accountId !== undefined && input.accountId !== accountId) return false;
  if (isEnvelopeAccount(d.accounts.find(a => a.id === accountId))) return false;
  if (input.assignedAccountId !== undefined && !canAssignTo(d, input.type, accountId, input.assignedAccountId, keepAssignment)) return false;
  const detail = normalizeDetail(input.detail);
  const { detail: _raw, payMode: _mode, ...rest } = input;
  d.transactions.push(detail === undefined ? { ...rest, accountId } : { ...rest, accountId, detail });
  syncLineActual(d, input.month, input.target);
  return true;
}

/** Sets, changes or clears (empty text) the detail of a transaction, nothing else. Allowed on a locked month: it changes no figure (spec 0020, RG6, RG11). */
export function setTransactionDetail(d: BudgetData, id: string, detail: string): boolean {
  const t = d.transactions.find(x => x.id === id);
  if (!t) return false;
  applyDetail(t, detail);
  return true;
}

/** What `updateTransaction` can change on an expense or an entry: everything but its month of attachment and its import trace. */
export interface TransactionPatch {
  label: string;
  amount: number;
  /** `YYYY-MM-DD`. */
  date: string;
  detail?: string;
  type: TxType;
  target: string;
  /** Savings account the operation is assigned to (spec 0028, RG18): undefined = keep the current one, null = remove it. */
  assignedAccountId?: string | null;
  /** Marked « hors budget » (spec 0031): undefined = keep the current marking. Dropped when the operation is assigned to an account. */
  offBudget?: boolean;
}

/**
 * Rewrites an expense or an entry (label, amount, bank date, detail, nature, imputation) under the rules of `addTransaction`: it is removed and
 * added again, and put back untouched when the new version is refused. Its month of attachment, its account (unless the imputation changes it) and
 * its import trace (deduplication) are kept. A date outside the month of attachment becomes its bank date (spec 0015, RG4). Refused (false) on a locked month.
 */
export function updateTransaction(d: BudgetData, id: string, patch: TransactionPatch): boolean {
  const old = d.transactions.find(x => x.id === id);
  const label = patch.label.trim();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(patch.date) && new Date(`${patch.date}T00:00:00Z`).toISOString().startsWith(patch.date);
  if (!old || isMonthLocked(d, old.month) || !label || !(patch.amount > 0) || !valid) return false;
  const before = d.transactions;
  const index = before.indexOf(old);
  const { bankDate: _b, detail: _d, accountId, assignedAccountId: _a, offBudget: _o, ...kept } = old;
  const assigned = patch.assignedAccountId === undefined ? old.assignedAccountId : (patch.assignedAccountId ?? undefined);
  const marked = assigned === undefined && (patch.offBudget ?? old.offBudget === true);
  const same = patch.type === old.type && patch.target === old.target;
  d.transactions = before.filter(x => x !== old);
  const next: Transaction = { ...kept, label, amount: round2(patch.amount), type: patch.type, target: patch.target, day: Number(patch.date.slice(8, 10)), detail: patch.detail ?? old.detail, ...(assigned !== undefined ? { assignedAccountId: assigned } : {}), ...(marked ? { offBudget: true as const } : {}), ...(same && accountId !== undefined ? { accountId } : {}), ...(patch.date.slice(0, 7) === old.month ? {} : { bankDate: patch.date }) };
  if (!addTransaction(d, next, old.assignedAccountId)) {
    d.transactions = before;
    return false;
  }
  // Same place in the list, and the lines the entry left follow their entries.
  const added = d.transactions.pop()!;
  d.transactions.splice(index, 0, added);
  if (!same && (old.type === 'var' || old.type === 'fix' || old.type === 'rev')) syncLineActual(d, old.month, old.target);
  return true;
}

export function deleteTransaction(d: BudgetData, id: string): boolean {
  const t = d.transactions.find(x => x.id === id);
  if (!t || isMonthLocked(d, t.month)) return false;
  d.transactions = d.transactions.filter(x => x.id !== id);
  // The actual follows the entries left; the last one removed empties it (spec 0019, RG20).
  if (t.type === 'var' || t.type === 'fix' || t.type === 'rev') syncLineActual(d, t.month, t.target);
  return true;
}

/** Deletes several expenses, each as `deleteTransaction` does (locked months are skipped). Returns how many were deleted. */
export function deleteTransactions(d: BudgetData, ids: string[]): number {
  return ids.filter(id => deleteTransaction(d, id)).length;
}

/** Sets (or clears with null) a savings/investment account statement. Refused (false) on a locked month. */
export function setStatement(d: BudgetData, m: MonthKey, key: string, v: number | null): boolean {
  if (isMonthLocked(d, m)) return false;
  const rec = (d.statements[m] ??= {});
  if (v === null) delete rec[key];
  else rec[key] = v;
  return true;
}

/**
 * CSV of the month's lines, in the French spreadsheet dialect (semicolons, decimal commas). The last column « Hors budget »
 * (oui / non) comes from `isOutOfBudget`, the same predicate that leaves a line out of the budget totals (spec 0009, RG119).
 */
export function monthCsv(lines: Line[], blockTitles: Record<BlockKey, string>, isOutOfBudget: (l: Line) => boolean = () => false): string {
  const n = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const rows = lines.map(l => [q(blockTitles[l.block]), q(l.section), q(l.name), n(l.budget), n(l.actual), isOutOfBudget(l) ? 'oui' : 'non'].join(';'));
  return '﻿' + ['Bloc;Section;Nom;Budget;Réel;Hors budget', ...rows].join('\r\n');
}

/** One exported operation (`amount` signed: + credit, − debit): every field already resolved to its display text. */
export interface TransactionCsvRow { date: string; label: string; detail: string; type: string; imputation: string; account: string; assignedTo: string; offBudget: boolean; amount: number }

/** CSV of the selected expenses and entries, in the same French spreadsheet dialect as `monthCsv`. */
export function transactionsCsv(rows: TransactionCsvRow[]): string {
  const q = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const body = rows.map(r => [r.date, q(r.label), q(r.detail), q(r.type), q(r.imputation), q(r.account), q(r.assignedTo), r.offBudget ? 'oui' : 'non', `${r.amount > 0 ? '+' : ''}${String(r.amount).replace('.', ',')}`].join(';'));
  return '\uFEFF' + ['Date;Libellé;Détail;Nature;Imputation;Compte;Affectée à;Hors budget;Montant', ...body].join('\r\n');
}
