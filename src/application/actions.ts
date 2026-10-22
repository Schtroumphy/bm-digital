import { BANK_HUES, CASH_ACCOUNT_ID, defaultBankAccounts, defaultTransactionAccountId, isSavingsWithdrawalAllowed, kindForBlock, MAIN_ACCOUNT_ID } from '../domain/bank';
import { addMonths, compareMonths, currentMonthKey, round2 } from '../domain/format';
import { lineNeedsActual, varActualFromTx } from '../domain/budget';
import { isMonthLocked } from '../domain/ledger';
import type { BankAccount, BlockKey, BudgetData, Envelope, EnvHistory, Line, MonthKey, Transaction } from '../domain/types';
import type { SetupDraft, SetupRow } from './setup';

function initMonth(d: BudgetData, m: MonthKey, lines: Line[], alloc: Record<string, number>, keepActuals = false) {
  d.months[m] = {
    initialized: true,
    // Expenses already recorded on a variable line win over an actual typed in the model.
    lines: lines.map(l => ({ ...l, actual: (l.block === 'var' ? varActualFromTx(d, m, l.key) : null) ?? (keepActuals ? l.actual : null) })),
    alloc: { ...alloc },
    transfersDone: d.months[m]?.transfersDone ?? {},
    // The pointages belong to the lines just replaced and are not copied (spec 0009, RG17); the balances typed by hand stay.
    ...(d.months[m]?.accountBalances ? { accountBalances: d.months[m].accountBalances } : {}),
  };
}

/** Creates the month's lines and allocations from the budget model (actuals typed in the model included). Refused (false) on a locked month. */
export function applyTemplate(d: BudgetData, m: MonthKey): boolean {
  if (isMonthLocked(d, m)) return false;
  initMonth(d, m, d.template.lines.map(l => ({ ...l, actual: l.actual ?? null })), d.template.envAlloc, true);
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
  const linkOf = (r: SetupRow, block: BlockKey) => (isValidSetupLink(r, block, mainId, rows.acc) ? { linkedAccountId: r.linkedAccountId } : {});
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
  const envelopes: Envelope[] = rows.env.map((r, i) => ({
    id: r.id,
    name: r.name.trim() || 'Sans nom',
    hue: ENVELOPE_HUES[i % ENVELOPE_HUES.length],
    cash: Math.min(r.cash, r.balance),
  }));
  const envAlloc = Object.fromEntries(rows.env.map(r => [r.id, r.amount]));

  d.template = { lines: lines.map(({ actual: _actual, ...l }) => l), envAlloc };
  d.envelopes = envelopes;
  d.accounts = d.firstMonth === null ? accountsFromDraft(rows.acc, m) : mergeAccounts(d.accounts, accountsFromDraft(rows.acc, m));
  initMonth(d, m, lines, envAlloc);

  const before = addMonths(m, -1);
  d.statements[before] = Object.fromEntries([...rows.epa, ...rows.inv].map(r => [r.id, r.balance]));
  d.envHistory[before] = Object.fromEntries(rows.env.map((r): [string, EnvHistory] => [r.id, { alloc: 0, spent: 0, balance: r.balance }]));
  if (d.firstMonth === null) d.firstMonth = m;
  return true;
}

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

/** Edits a line's name, budget or actual. Refused (false) on a locked month or an unknown line. */
export function updateLine(d: BudgetData, m: MonthKey, key: string, patch: Partial<Pick<Line, 'name' | 'budget' | 'actual'>>): boolean {
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

/** An actual copied from the budget by `validateMonth`, kept to be able to undo it. */
export interface ValidatedLine {
  key: string;
  value: number;
}

/**
 * Considers the actual equal to the budget for every line without an actual
 * (see `lineNeedsActual`). Never overwrites an entered actual. Does nothing
 * for a month that is not initialized or is locked. Returns the lines filled.
 */
export function validateMonth(d: BudgetData, m: MonthKey): ValidatedLine[] {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return [];
  const filled: ValidatedLine[] = [];
  for (const l of md.lines) {
    if (!lineNeedsActual(l)) continue;
    l.actual = l.budget;
    filled.push({ key: l.key, value: l.budget });
  }
  return filled;
}

/** Undoes `validateMonth`: only the lines whose actual is still the copied value go back to empty. */
export function undoValidateMonth(d: BudgetData, m: MonthKey, filled: ValidatedLine[]) {
  const md = d.months[m];
  if (!md?.initialized || isMonthLocked(d, m)) return;
  for (const { key, value } of filled) {
    const l = md.lines.find(x => x.key === key);
    if (l && l.actual === value) l.actual = null;
  }
}

/**
 * Records a transaction; a variable expense also raises its line's actual. Refused (false) on a locked month,
 * or for a withdrawal credited to the dedicated account of its savings line (spec 0007, RG7).
 * Without an account, the transaction takes the one resolved from its box (spec 0006, RG3):
 * the account is written down, so a later change of the box does not move it (RG6).
 */
export function addTransaction(d: BudgetData, input: Transaction): boolean {
  if (isMonthLocked(d, input.month) || !isSavingsWithdrawalAllowed(d, input)) return false;
  const t = input.accountId === undefined && input.type !== 'epa' ? { ...input, accountId: defaultTransactionAccountId(d, input) } : input;
  d.transactions.push(t);
  // A variable expense always counts in its line's actual, whatever the paying account (spec 0008, RG2).
  if (t.type !== 'var') return true;
  const l = d.months[t.month]?.lines.find(x => x.key === t.target);
  if (l) l.actual = round2((l.actual ?? 0) + t.amount);
  return true;
}

export function deleteTransaction(d: BudgetData, id: string): boolean {
  const t = d.transactions.find(x => x.id === id);
  if (!t || isMonthLocked(d, t.month)) return false;
  d.transactions = d.transactions.filter(x => x.id !== id);
  if (t.type !== 'var') return true;
  const l = d.months[t.month]?.lines.find(x => x.key === t.target);
  if (!l) return true;
  const left = round2((l.actual ?? 0) - t.amount);
  // No expense left on the line and nothing else in its actual: the actual is empty again (spec 0008, CA2).
  l.actual = left === 0 && !d.transactions.some(x => x.month === t.month && x.type === 'var' && x.target === t.target) ? null : left;
  return true;
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
