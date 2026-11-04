import { CASH_ACCOUNT_ID, accountIdOf, envelopeAccountAt, isEnvelopeAccount, isLineInBudget, mainAccount } from './bank';
import { EXEC_MODES, effectiveDueDay, payerAccountId, realBalanceOn, realMonthBalance } from './checkoff';
import { compareMonths, round2 } from './format';
import { hasEnvelopesDebit } from './internalTransfers';
import { lineEntriesNote } from './lineActuals';
import { isMonthLocked, monthLines } from './ledger';
import { transfersTargeting } from './movementTargets';
import { realMovements } from './bankMovements';
import { periodOf } from './periods';
import type { BankAccount, BudgetData, ExecMode, Line, MonthKey } from './types';

/*
 * « À venir ce mois-ci » (spec 0043): what is still to leave each bank account, and what the account would have left.
 * Pure and informative: nothing here is written or enters a balance. The rest of a line is its budget minus its actual
 * (the sum of its entries, spec 0019), never below 0: an overspent line does not lower the rest of the others.
 */

/** Rest of a line: budget − actual, never negative (RG5). */
export const leftOfLine = (l: Pick<Line, 'budget' | 'actual'>): number => Math.max(round2(l.budget - (l.actual ?? 0)), 0);

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
  if (l.dueDay === undefined || l.execMode === 'informatif' || isMonthLocked(d, m) || !isLineInBudget(d, l) || leftOfLine(l) === 0) return false;
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

/** One thing left to pay out of an account: a line, or the allocation of an envelope. */
export interface LeftItem {
  /** Line key, or envelope id. */
  id: string;
  kind: 'line' | 'allocation';
  name: string;
  /** What is left (> 0). */
  amount: number;
  budget: number;
  /** Planned day brought back to the month's last day. */
  day?: number;
  late: boolean;
}

export interface LeftGroup {
  id: LeftGroupId;
  label: string;
  total: number;
  items: LeftItem[];
}

export interface AccountComingUp {
  account: BankAccount;
  /** Real balance the margin starts from (RG8); null before the account opens. */
  reference: number | null;
  groups: LeftGroup[];
  /** Total of the rests. */
  total: number;
  /** Reference balance − total; null without a reference. */
  margin: number | null;
  /** Income lines not received yet, apart from the margin (RG9). */
  expected: number;
  expectedItems: LeftItem[];
}

/** The lines paid out of an account that can have something left: no revenue, no « informatif », a variable line only when it counts in the budget (RG6). */
function payLines(d: BudgetData, m: MonthKey, accountId: string): Line[] {
  return monthLines(d, m).filter(l => l.block !== 'rev' && l.execMode !== 'informatif' && payerAccountId(d, l) === accountId && (l.block !== 'var' || isLineInBudget(d, l)));
}

/** Envelopes whose allocation leaves the main account this month. */
const allocationEnvelopes = (d: BudgetData, m: MonthKey) => d.envelopes.filter(e => !!d.months[m]?.initialized && !!envelopeAccountAt(d, e, m) && (d.months[m].alloc[e.id] ?? 0) - (d.months[m].cashPart?.[e.id] ?? 0) > 0);

const itemOfLine = (d: BudgetData, m: MonthKey, l: Line, today: string): LeftItem => ({
  id: l.key, kind: 'line', name: l.name, amount: leftOfLine(l), budget: l.budget, late: isLate(d, m, l, today),
  ...(l.dueDay !== undefined ? { day: effectiveDueDay(l.dueDay, m) } : {}),
});

/**
 * Accounts shown (RG10): every account with at least one line to pay in the month, the envelope accounts and « Espèces » excepted.
 * The main account also shows when only an envelope allocation leaves it.
 */
export function comingUpAccounts(d: BudgetData, m: MonthKey): BankAccount[] {
  const main = mainAccount(d).id;
  const hasAllocation = allocationEnvelopes(d, m).length > 0;
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

/** What is left to pay out of one account, filed by execution mode, with its margin and the expected income (RG5 to RG9). */
export function accountComingUp(d: BudgetData, m: MonthKey, accountId: string, today: string): AccountComingUp | null {
  const account = d.accounts.find(a => a.id === accountId);
  if (!account) return null;
  const items: { group: LeftGroupId; item: LeftItem }[] = [];
  for (const l of payLines(d, m, accountId)) {
    const item = itemOfLine(d, m, l, today);
    if (item.amount > 0) items.push({ group: groupOfMode(l.execMode), item });
  }
  if (accountId === mainAccount(d).id) {
    for (const e of allocationEnvelopes(d, m)) {
      const amount = leftOfAllocation(d, m, e.id);
      if (amount > 0) items.push({ group: 'autres', item: { id: e.id, kind: 'allocation', name: `Alloc. ${e.name}`, amount, budget: (d.months[m].alloc[e.id] ?? 0) - (d.months[m].cashPart?.[e.id] ?? 0), late: false } });
    }
  }
  const byDay = (a: LeftItem, b: LeftItem) => (a.day ?? Infinity) - (b.day ?? Infinity);
  const groups = LEFT_GROUPS.map(g => {
    const mine = items.filter(x => x.group === g.id).map(x => x.item).sort(byDay);
    return { ...g, total: round2(mine.reduce((s, x) => s + x.amount, 0)), items: mine };
  }).filter(g => g.items.length > 0);
  const total = round2(groups.reduce((s, g) => s + g.total, 0));
  const reference = referenceBalance(d, m, accountId, today);
  const expectedItems = monthLines(d, m)
    .filter(l => l.block === 'rev' && l.execMode !== 'informatif' && accountIdOf(d, l.accountId) === accountId && leftOfLine(l) > 0)
    .map(l => itemOfLine(d, m, l, today))
    .sort(byDay);
  return {
    account, reference, groups, total,
    margin: reference === null ? null : round2(reference - total),
    expected: round2(expectedItems.reduce((s, x) => s + x.amount, 0)), expectedItems,
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
