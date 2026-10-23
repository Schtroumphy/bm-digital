import { accountIdOf, isSavingsBlock, mainAccount, resolveBoxAccountId } from './bank';
import { countedAmount, envelopeCheckKey } from './bankMovements';
import { sameTarget } from './movementTargets';
import type { AccountMovement, BudgetData, Line, MonthKey, MovementTarget } from './types';

export { isItemTransferred, sameTarget, transfersTargeting } from './movementTargets';

/*
 * Transfers and the budget items they stand for (spec 0019, RG10, RG11, RG14, RG15). A transfer is an `AccountMovement`; its optional
 * `target` says which budget item it is the real counterpart of, so that the estimated balance counts the movement once.
 */

/** A `var` line paid from a dedicated account (not the main one). */
export const isDedicatedVarLine = (d: BudgetData, l: Line): boolean => l.block === 'var' && resolveBoxAccountId(d, l) !== mainAccount(d).id;

/** A budget item a transfer can be attached to, with the accounts the money would move between (RG14). */
export interface TransferItem {
  target: MovementTarget;
  label: string;
  /** Account debited by the counterpart of the item, and the one credited. */
  fromAccountId: string;
  toAccountId: string;
  /** Amount of the item's pointed counterpart, 0 when it cannot be pointed (used by the « Semblable à un pointage » signal). */
  amount: number;
  /** The date the item was pointed, if it was. */
  pointedOn?: string;
}

/** Items of a month a transfer can stand for: envelopes, savings/investment lines with a dedicated account, `var` lines with a dedicated account. */
export function transferItems(d: BudgetData, m: MonthKey): TransferItem[] {
  const md = d.months[m];
  const lines = md?.initialized ? md.lines : [];
  const main = mainAccount(d).id;
  const out: TransferItem[] = [];
  for (const e of d.envelopes) {
    out.push({ target: { kind: 'env', id: e.id }, label: `Allocation ${e.name} (enveloppe)`, fromAccountId: main, toAccountId: e.accountId, amount: md?.alloc[e.id] ?? 0, pointedOn: md?.checks?.[envelopeCheckKey(e.id)]?.doneOn });
  }
  for (const l of lines) {
    if (isSavingsBlock(l.block) && l.linkedAccountId) {
      out.push({ target: { kind: 'line', key: l.key }, label: `${l.name} (${l.block === 'epa' ? 'épargne' : 'investissement'})`, fromAccountId: accountIdOf(d, l.accountId), toAccountId: l.linkedAccountId, amount: countedAmount(l).amount, pointedOn: md?.checks?.[l.key]?.doneOn });
    } else if (isDedicatedVarLine(d, l)) {
      out.push({ target: { kind: 'line', key: l.key }, label: `${l.name} (variable)`, fromAccountId: main, toAccountId: resolveBoxAccountId(d, l), amount: l.budget, pointedOn: md?.checks?.[l.key]?.doneOn });
    }
  }
  return out;
}

/** The item proposed by default for a transfer whose destination is `toAccountId` (RG15): the envelope or the line of that account. */
export function defaultTransferTarget(d: BudgetData, m: MonthKey, toAccountId: string, fromAccountId?: string): MovementTarget | null {
  const items = transferItems(d, m).filter(i => i.toAccountId === toAccountId);
  return (items.find(i => i.fromAccountId === fromAccountId) ?? items[0])?.target ?? null;
}

/** Whether a transfer can stand for the item: the item exists in the month and the destination is its account. */
export const isValidTransferTarget = (d: BudgetData, m: MonthKey, toAccountId: string, target: MovementTarget): boolean =>
  transferItems(d, m).some(i => sameTarget(i.target, target) && i.toAccountId === toAccountId);

/**
 * The pointed item a transfer without target looks like (RG11): same month, same source and destination accounts, same amount, and the item is
 * pointed. Null when the transfer has a target or nothing looks like it.
 */
export function similarPointedItem(d: BudgetData, mv: AccountMovement): TransferItem | null {
  if (mv.target) return null;
  return transferItems(d, mv.month).find(i => i.pointedOn !== undefined && i.amount === mv.amount && i.fromAccountId === mv.fromAccountId && i.toAccountId === mv.toAccountId) ?? null;
}
