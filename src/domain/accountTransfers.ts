import { activeBankAccounts, isAccountTransfer, lineDisplayName, mainAccount, transferRoute, transferTitle, nameOfAccount } from './bank';
import { effectiveDueDay, payerAccountId } from './checkoff';
import { compareMonths, round2 } from './format';
import { isMonthLocked, monthLines } from './ledger';
import { lineSpentNet, lineTransferredNet, savingsLineEntries } from './lineActuals';
import type { BankAccount, BudgetData, Line, MonthKey, Transaction } from './types';

export { isAccountTransfer, lineDisplayName, transferRoute, transferTitle };

/*
 * « Transferts entre comptes » (spec 0050): the savings/investment lines paid by an account other than the main one, followed apart from « À venir ».
 * Pure: nothing here is written or enters a balance (the card's use cases are in `application/accountTransfers.ts`). A transfer is out of the budget totals
 * (RG29, `isLineInBudget`), but its rest, status and actual are unchanged. The rest of a transfer is the rest of a savings line (spec 0043, RG5):
 * budget − transferred − expenses attached to the target account (spec 0028), never below 0.
 */

/** Status of a transfer (RG10, RG11): a single one, computed, never typed. */
export type TransferStatus = 'todo' | 'partial' | 'done' | 'late';

/** One line of the « Transferts entre comptes » card. */
export interface AccountTransfer {
  /** Key of the savings line. */
  key: string;
  /** Shown name (RG26): the label, or « Compte débité → Compte cible ». */
  title: string;
  /** « Compte débité → Compte cible », shown under a labelled transfer; absent when it is already the title. */
  route?: string;
  fromName: string;
  toName: string;
  /** Budget of the line (RG6). */
  planned: number;
  /** Transfers received by the line, net of what its account passes on (RG6). */
  transferred: number;
  /** Net of the operations assigned to the target account (RG6): an expense in positive, an entry of money in negative. */
  attached: number;
  /** Still to transfer (RG7), never negative. */
  left: number;
  /** Planned day brought back to the month's last day. */
  day?: number;
  status: TransferStatus;
}

export interface AccountTransfersView {
  items: AccountTransfer[];
  /** Transfers with nothing left (RG13). */
  done: number;
  /** Sum of the rests (RG14). */
  left: number;
}

/** Accounts the form of a transfer offers (RG23): active, not the main account (`activeBankAccounts` already drops envelopes and « Espèces »). */
export const transferAccountChoices = (d: BudgetData): BankAccount[] => activeBankAccounts(d).filter(a => a.id !== mainAccount(d).id);

/** Accounts offered as target for a given debited account (RG23): the same list without the debited account. */
export const transferTargetChoices = (d: BudgetData, fromId?: string): BankAccount[] => transferAccountChoices(d).filter(a => a.id !== fromId);

/** What the lock of a transfer line stops (RG27): its accounts when it has entries (a transfer aimed at it or an expense associated with it, RG36). The amount is never locked. */
export function transferLocks(d: BudgetData, m: MonthKey, l: Line): { accounts: string | null; entries: boolean } {
  const e = savingsLineEntries(d, m, l);
  const entries = e.toLine.length > 0 || e.assigned.length > 0;
  return {
    accounts: entries ? 'Des écritures sont rattachées à ce transfert : les comptes ne peuvent plus changer.' : null,
    entries,
  };
}

/** Rest, transferred and attached amounts of one transfer line (RG6, RG7). */
function amountsOf(d: BudgetData, m: MonthKey, l: Line) {
  const transferred = lineTransferredNet(d, m, l) ?? 0;
  const attached = lineSpentNet(d, m, l) ?? 0;
  return { transferred, attached, left: Math.max(round2(l.budget - transferred - attached), 0) };
}

/** The planned day is over, something is left and the month is open: same rule as « En retard » of « À venir » (spec 0043, RG11). `today` is `YYYY-MM-DD`. */
function isOverdue(d: BudgetData, m: MonthKey, dueDay: number | undefined, left: number, today: string): boolean {
  if (dueDay === undefined || left === 0 || isMonthLocked(d, m)) return false;
  const cmp = compareMonths(m, today.slice(0, 7));
  if (cmp !== 0) return cmp < 0;
  return +today.slice(8, 10) > effectiveDueDay(dueDay, m);
}

/** Transfers of the month, by planned day (those without a day last, then budget order); an empty list on an initialized month, null on a month not initialized (RG5, RG25). */
export function accountTransfersView(d: BudgetData, m: MonthKey, today: string): AccountTransfersView | null {
  if (!d.months[m]?.initialized) return null;
  const items = monthLines(d, m)
    .filter(l => isAccountTransfer(d, l))
    .map((l): AccountTransfer => {
      const { transferred, attached, left } = amountsOf(d, m, l);
      const status: TransferStatus = left === 0 ? 'done' : isOverdue(d, m, l.dueDay, left, today) ? 'late' : transferred !== 0 || attached !== 0 ? 'partial' : 'todo';
      return {
        key: l.key, title: transferTitle(d, l), ...(l.name.trim() ? { route: transferRoute(d, l) } : {}), fromName: nameOfAccount(d, payerAccountId(d, l)), toName: nameOfAccount(d, l.linkedAccountId as string),
        planned: l.budget, transferred, attached, left, status,
        ...(l.dueDay !== undefined ? { day: effectiveDueDay(l.dueDay, m) } : {}),
      };
    })
    // Array.prototype.sort is stable: equal days keep the budget order.
    .sort((a, b) => (a.day ?? Infinity) - (b.day ?? Infinity));
  return { items, done: items.filter(x => x.status === 'done').length, left: round2(items.reduce((s, x) => s + x.left, 0)) };
}

/** The transfers of a month whose target account is `accountId`: the lines an operation assigned to that account can be associated with (spec 0050, RG38). */
export const transferLinesTo = (d: BudgetData, m: MonthKey, accountId: string): Line[] =>
  (d.months[m]?.initialized ? d.months[m].lines : []).filter(l => isAccountTransfer(d, l) && l.linkedAccountId === accountId);

/**
 * Whether `key` can be the association of an operation (RG36): a type that can be assigned, an assignment, and a transfer of the operation's month whose
 * target is the account it is assigned to.
 */
export const canAssociateTransfer = (d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'assignedAccountId'>, key: string): boolean =>
  (t.type === 'var' || t.type === 'fix' || t.type === 'rev') && t.assignedAccountId !== undefined && transferLinesTo(d, t.month, t.assignedAccountId).some(l => l.key === key);

/**
 * Whether the link an operation already carries still holds (RG44, D15 to D17): the operation is still assigned (`assignmentKept`: same account as before),
 * of a type that can be assigned, not marked « hors budget », and no line of its month with that key is aimed at another account. A line that is gone does not
 * break the link: it stays, without effect, and takes effect again if the line comes back.
 */
export const transferLinkHolds = (d: BudgetData, t: Pick<Transaction, 'type' | 'month' | 'assignedAccountId' | 'offBudget'>, key: string, assignmentKept: boolean): boolean =>
  t.assignedAccountId !== undefined && assignmentKept && !t.offBudget && (t.type === 'var' || t.type === 'fix' || t.type === 'rev') &&
  !(d.months[t.month]?.lines.some(l => l.key === key && l.linkedAccountId !== t.assignedAccountId));

