import { CASH_ACCOUNT_ID, accountIdOf, envelopeAccountAt, isEnvelopeAccount, isLineInBudget, isTransactionOffBudget, mainAccount } from './bank';
import { EXEC_MODES, effectiveDueDay, payerAccountId, realBalanceOn, realMonthBalance } from './checkoff';
import { compareMonths, round2 } from './format';
import { hasEnvelopesDebit, movementAccountName } from './internalTransfers';
import { cashWithdrawalSummary, envelopeCashPart } from './cash';
import { lineEntriesNote } from './lineActuals';
import { isMonthLocked, monthLines } from './ledger';
import { linkedLines, movementsLinkedTo } from './movementLines';
import { isDedicatedVarLine } from './transfers';
import { transfersTargeting } from './movementTargets';
import { realMovements } from './bankMovements';
import { periodOf } from './periods';
import type { BankAccount, BudgetData, ExecMode, Line, MonthKey } from './types';

/*
 * « À venir ce mois-ci » (spec 0043): what is still to leave each bank account, and what the account would have left.
 * Pure and informative: nothing here is written or enters a balance. The rest of a line is its budget minus its actual
 * (the sum of its entries, spec 0019), never below 0: an overspent line does not lower the rest of the others.
 */

/**
 * Rest of a line (RG5, amended 2026-11-05). Fixed and credit lines, and variable lines of a dedicated account: the whole budget while the line has no
 * entry; as soon as it has one, nothing is left, because the unspent part of what was budgeted is a bonus, not something still to pay. Every other line
 * (variable of the main account, revenue, savings, investment): budget − actual. Never negative: an overrun lowers no other rest.
 */
export function leftOfLine(d: BudgetData, l: Pick<Line, 'key' | 'block' | 'budget' | 'actual' | 'accountId' | 'payMode'>): number {
  const bonusRule = l.block === 'fix' || l.block === 'cre' || (l.block === 'var' && isDedicatedVarLine(d, l as Line));
  if (bonusRule && l.actual !== null && l.actual !== undefined) return 0;
  return Math.max(round2(l.budget - (bonusRule ? 0 : l.actual ?? 0)), 0);
}

/**
 * Rest of an envelope's allocation (RG5): the part of the allocation that goes to the envelope's account (the cash part leaves with its withdrawal),
 * minus what the transfers attached to it have already sent. Nothing left once a global « vers enveloppes » transfer stands for the month (spec 0016, RG28).
 */
export function leftOfAllocation(d: BudgetData, m: MonthKey, envelopeId: string): number {
  const md = d.months[m];
  const e = d.envelopes.find(x => x.id === envelopeId);
  if (!md?.initialized || !e || !envelopeAccountAt(d, e, m) || hasEnvelopesDebit(d, m)) return 0;
  const planned = (md.alloc[envelopeId] ?? 0) - (md.cashPart?.[envelopeId] ?? 0);
  const sent = transfersTargeting(d, m, { kind: 'env', id: envelopeId }).reduce((s, mv) => s + mv.amount, 0);
  return Math.max(round2(planned - sent), 0);
}

/** « En retard » (RG11): the planned day is over, something is left, the line is not « informatif » and the month is not closed. `today` is `YYYY-MM-DD`. */
export function isLate(d: BudgetData, m: MonthKey, l: Line, today: string): boolean {
  if (l.dueDay === undefined || l.execMode === 'informatif' || isMonthLocked(d, m) || !isLineInBudget(d, l) || leftOfLine(d, l) === 0) return false;
  const cmp = compareMonths(m, today.slice(0, 7));
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  return +today.slice(8, 10) > effectiveDueDay(l.dueDay, m);
}

/** Number of late lines in a month. */
export const lateCount = (d: BudgetData, m: MonthKey, today: string): number => monthLines(d, m).filter(l => isLate(d, m, l, today)).length;

/** The headings the rests are filed under (RG7), in display order. */
export type LeftGroupId = 'prelevement' | 'virement' | 'retrait' | 'autres';
export const LEFT_GROUPS: { id: LeftGroupId; label: string }[] = [
  { id: 'prelevement', label: 'À prélever' },
  { id: 'virement', label: 'À virer' },
  { id: 'retrait', label: 'À retirer en espèces' },
  { id: 'autres', label: 'Autres à sortir' },
];

/** Heading of an execution mode; no mode goes to « Autres à sortir ». */
export function groupOfMode(mode?: ExecMode): LeftGroupId {
  if (mode === 'prelevement') return 'prelevement';
  if (mode === 'virement_auto' || mode === 'virement_manuel') return 'virement';
  if (mode === 'retrait') return 'retrait';
  return 'autres';
}

/** An expense shown under a line of a transfer (spec 0045, RG15): indicative, in no total. */
export interface TransferExpense {
  id: string;
  day: number;
  label: string;
  amount: number;
}

/** A variable line a transfer is attached to, with its real expenses of the month (spec 0045, RG15). `expenses` is empty under all but the first transfer of the line (RG16). */
export interface TransferLine {
  key: string;
  name: string;
  expenses: TransferExpense[];
  /** Sum of the expenses of the line (not of `expenses`: the line total stays visible under the later transfers). */
  spent: number;
}

/** One thing left to pay out of an account: a line, the allocation of an envelope, or a transfer to a dedicated account (spec 0045). */
export interface LeftItem {
  /** Line key, envelope id, or transfer id. */
  id: string;
  kind: 'line' | 'allocation' | 'transfer';
  /** For a transfer: the lines it is attached to, to unfold (RG15). */
  lines?: TransferLine[];
  name: string;
  /** What is left (> 0). */
  amount: number;
  budget: number;
  /** Planned day brought back to the month's last day. */
  day?: number;
  late: boolean;
  /** Paid in cash: a variable line managed in cash, or the cash part of an envelope allocation (shown with a banknote mark). */
  cash?: boolean;
}

export interface LeftGroup {
  id: LeftGroupId;
  label: string;
  /** Total of the items, less `withdrawn`. */
  total: number;
  items: LeftItem[];
  /** « À retirer en espèces » only: what the month's withdrawals already cover, taken off the total (never more than the items). */
  withdrawn?: number;
  /** What already left in this group (amount = actual paid), for the detail. */
  done: LeftItem[];
}

/** A real movement already passed on an account: signed amount (negative = money out). */
export interface PassedMovement {
  /** `YYYY-MM-DD` */
  date: string;
  label: string;
  amount: number;
}

export interface AccountComingUp {
  account: BankAccount;
  /** Real balance the margin starts from (RG8); null before the account opens. */
  reference: number | null;
  groups: LeftGroup[];
  /** Balance the period starts from (RG20): the real balance at its first day (`date`, `YYYY-MM-DD`); null before the account opens. */
  start: { amount: number; date: string } | null;
  /** What already moved since the start of the period: reference balance − start balance (RG21); null without both. */
  passed: number | null;
  /** The real movements that make up `passed`, by date (RG22): the same ones `referenceBalance` counts. Their sum is `passed`. */
  passedMovements: PassedMovement[];
  /** Total of the rests. */
  total: number;
  /** Reference balance − total of the rests; null without a reference. */
  margin: number | null;
  /** Margin once the expected income is received: margin + expected (amended 2026-11-05); null without a reference. */
  marginWithExpected: number | null;
  /** Income lines not received yet: listed apart (RG9); `marginWithExpected` adds them. */
  expected: number;
  expectedItems: LeftItem[];
}

/** Keys of the lines that still have something to leave an account this month (the « à sortir » of the card), to highlight them in the Budget. */
export function leftLineKeys(d: BudgetData, m: MonthKey, today: string): Set<string> {
  const keys = new Set<string>();
  for (const a of comingUpAccounts(d, m)) {
    for (const g of accountComingUp(d, m, a.id, today)?.groups ?? []) for (const x of g.items) if (x.kind === 'line') keys.add(x.id);
  }
  return keys;
}

/** The lines paid out of an account that can have something left: no revenue, no « informatif », a variable line only when it counts in the budget (RG6). */
function payLines(d: BudgetData, m: MonthKey, accountId: string): Line[] {
  return monthLines(d, m).filter(l => l.block !== 'rev' && l.execMode !== 'informatif' && payerAccountId(d, l) === accountId && (l.block !== 'var' || isLineInBudget(d, l)));
}

/** Envelopes whose allocation leaves the main account this month. */
const allocationEnvelopes = (d: BudgetData, m: MonthKey) => d.envelopes.filter(e => !!d.months[m]?.initialized && !!envelopeAccountAt(d, e, m) && (d.months[m].alloc[e.id] ?? 0) - (d.months[m].cashPart?.[e.id] ?? 0) > 0);

/** Envelopes with a cash part in the month: that part is withdrawn in cash from the main account. */
const cashEnvelopes = (d: BudgetData, m: MonthKey) => d.envelopes.filter(e => !!d.months[m]?.initialized && envelopeCashPart(d, m, e.id) > 0);

const itemOfLine = (d: BudgetData, m: MonthKey, l: Line, today: string): LeftItem => ({
  id: l.key, kind: 'line', name: l.name, amount: leftOfLine(d, l), budget: l.budget, late: isLate(d, m, l, today),
  ...(l.dueDay !== undefined ? { day: effectiveDueDay(l.dueDay, m) } : {}),
});

/**
 * Accounts shown (RG10): every account with at least one line to pay in the month, the envelope accounts and « Espèces » excepted.
 * The main account also shows when only an envelope allocation leaves it.
 */
export function comingUpAccounts(d: BudgetData, m: MonthKey): BankAccount[] {
  const main = mainAccount(d).id;
  const hasAllocation = allocationEnvelopes(d, m).length > 0 || cashEnvelopes(d, m).length > 0;
  return d.accounts.filter(a => !isEnvelopeAccount(a) && a.id !== CASH_ACCOUNT_ID && (payLines(d, m, a.id).length > 0 || (a.id === main && hasAllocation)));
}

/**
 * Balance the margin starts from (RG8): the real balance today for the month in progress, at the end of the period for a past month,
 * at the start for a month to come.
 */
export function referenceBalance(d: BudgetData, m: MonthKey, accountId: string, today: string): number | null {
  const real = realMonthBalance(d, m, accountId);
  if (!real) return null;
  const p = periodOf(d, m);
  if (today > p.end) return real.end;
  if (today < p.start) return real.start;
  return realBalanceOn(real, realMovements(d, accountId, m), today);
}

/** The real movements counted in the reference balance (RG22): up to today in the month in progress, all of a past month, none of a month to come. */
export function passedMovements(d: BudgetData, m: MonthKey, accountId: string, today: string): PassedMovement[] {
  const p = periodOf(d, m);
  if (today < p.start) return [];
  return realMovements(d, accountId, m)
    .filter(x => today > p.end || x.date <= today)
    .map(x => ({ date: x.date, label: x.label, amount: x.amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** What is left to pay out of one account, filed by execution mode, with its margin and the expected income (RG5 to RG9). */
export function accountComingUp(d: BudgetData, m: MonthKey, accountId: string, today: string): AccountComingUp | null {
  const account = d.accounts.find(a => a.id === accountId);
  if (!account) return null;
  const items: { group: LeftGroupId; item: LeftItem }[] = [];
  const doneItems: { group: LeftGroupId; item: LeftItem }[] = [];
  for (const l of payLines(d, m, accountId)) {
    // A variable line attached to a transfer is covered by it: the transfer is its way out, counted in « Déjà sorti » (spec 0045, RG17).
    if (movementsLinkedTo(d, m, l).length > 0) continue;
    // A variable line managed in cash goes to « À retirer en espèces », whatever its execution mode (no double count with the cash parts, RG7).
    const cash = l.block === 'var' && l.payMode === 'especes';
    const item = { ...itemOfLine(d, m, l, today), ...(cash ? { cash } : {}) };
    const group = cash ? 'retrait' : groupOfMode(l.execMode);
    if (item.amount > 0) items.push({ group, item });
    if ((l.actual ?? 0) > 0) doneItems.push({ group, item: { ...item, amount: l.actual ?? 0, late: false } });
  }
  if (accountId === mainAccount(d).id) {
    for (const e of allocationEnvelopes(d, m)) {
      const amount = leftOfAllocation(d, m, e.id);
      const budget = (d.months[m].alloc[e.id] ?? 0) - (d.months[m].cashPart?.[e.id] ?? 0);
      const base = { id: e.id, kind: 'allocation' as const, name: `Alloc. ${e.name}`, budget, late: false };
      if (amount > 0) items.push({ group: 'autres', item: { ...base, amount } });
      const sent = round2(budget - amount);
      if (sent > 0 && !hasEnvelopesDebit(d, m)) doneItems.push({ group: 'autres', item: { ...base, amount: sent } });
    }
    // The cash part of an envelope allocation leaves with the cash withdrawal (RG7).
    for (const e of cashEnvelopes(d, m)) {
      const part = envelopeCashPart(d, m, e.id);
      items.push({ group: 'retrait', item: { id: `cash:${e.id}`, kind: 'allocation', name: `Alloc. espèces ${e.name}`, amount: part, budget: part, late: false, cash: true } });
    }
  }
  // A transfer to the dedicated account of variable lines (e.g. Boursorama for Alimentation, Loisirs): it has left this account (spec 0045, RG14).
  // Only the transfer counts. The real expenses of its lines are listed under it, under the first transfer of a line only (RG16).
  const shown = new Set<string>();
  const sentTransfers = (d.accountMovements ?? []).filter(mv => mv.month === m && mv.fromAccountId === accountId).map((mv, order) => ({ mv, order })).sort((a, b) => a.mv.day - b.mv.day || a.order - b.order);
  for (const { mv } of sentTransfers) {
    const linked = linkedLines(d, mv);
    if (linked.length === 0) continue;
    const lines = linked.map((l): TransferLine => {
      const all = d.transactions.filter(t => t.month === m && t.type === 'var' && t.target === l.key && !isTransactionOffBudget(t)).sort((a, b) => a.day - b.day);
      const first = !shown.has(l.key);
      shown.add(l.key);
      return { key: l.key, name: l.name, spent: round2(all.reduce((t, x) => t + x.amount, 0)), expenses: first ? all.map(t => ({ id: t.id, day: t.day, label: t.label, amount: t.amount })) : [] };
    });
    doneItems.push({ group: 'virement', item: { id: mv.id, kind: 'transfer', name: `Virement → ${movementAccountName(d, mv.toAccountId)}`, amount: mv.amount, budget: mv.amount, day: mv.day, late: false, lines } });
  }
  const byDay = (a: LeftItem, b: LeftItem) => (a.day ?? Infinity) - (b.day ?? Infinity);
  const groups = LEFT_GROUPS.map(g => {
    const mine = items.filter(x => x.group === g.id).map(x => x.item).sort(byDay);
    const done = doneItems.filter(x => x.group === g.id).map(x => x.item).sort(byDay);
    const gross = round2(mine.reduce((s, x) => s + x.amount, 0));
    // The withdrawals of the month already cover part of the cash to withdraw: they are taken off, never below 0 (RG7).
    const withdrawn = g.id === 'retrait' && accountId === mainAccount(d).id ? Math.min(gross, cashWithdrawalSummary(d, m).withdrawn) : 0;
    return { ...g, total: round2(gross - withdrawn), items: mine, done, ...(withdrawn > 0 ? { withdrawn } : {}) };
  }).filter(g => g.items.length > 0 || g.done.length > 0);
  const total = round2(groups.reduce((s, g) => s + g.total, 0));
  const reference = referenceBalance(d, m, accountId, today);
  const real = realMonthBalance(d, m, accountId);
  const start = real ? { amount: real.start, date: periodOf(d, m).start } : null;
  const expectedItems = monthLines(d, m)
    .filter(l => l.block === 'rev' && l.execMode !== 'informatif' && accountIdOf(d, l.accountId) === accountId && leftOfLine(d, l) > 0)
    .map(l => itemOfLine(d, m, l, today))
    .sort(byDay);
  const expected = round2(expectedItems.reduce((s, x) => s + x.amount, 0));
  return {
    account, reference, start, passed: reference === null || !start ? null : round2(reference - start.amount), passedMovements: passedMovements(d, m, accountId, today), groups, total,
    margin: reference === null ? null : round2(reference - total),
    marginWithExpected: reference === null ? null : round2(reference - total + expected),
    expected, expectedItems,
  };
}

/**
 * Tooltip text of a line of the Budget screen: one fact per line, only the ones that exist. The out-of-budget notice, the entries of the line,
 * its planned day, its execution mode with its full label and its « en retard » state. Empty when there is nothing to say.
 */
export function lineTooltip(d: BudgetData, m: MonthKey, l: Line, today: string): string {
  const parts: string[] = [];
  if (!isLineInBudget(d, l)) parts.push('Ligne hors budget : elle ne compte dans aucun total ni dans le reste à placer.');
  const entries = lineEntriesNote(d, m, l);
  if (entries) parts.push(entries);
  if (l.dueDay !== undefined) parts.push(`Prévu le ${effectiveDueDay(l.dueDay, m)} du mois`);
  const mode = EXEC_MODES.find(x => x.value === l.execMode);
  if (mode) parts.push(`Mode d’exécution : ${mode.label}`);
  if (isLate(d, m, l, today)) parts.push('En retard');
  return parts.join('\n');
}
