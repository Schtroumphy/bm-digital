import { accountIdOf, isSavingsBlock, mainAccount, resolveBoxAccountId } from './bank';
import { sameTarget } from './movementTargets';
import type { BudgetData, Line, MonthKey, MovementTarget } from './types';

export { isItemTransferred, sameTarget, transfersTargeting } from './movementTargets';

/*
 * Transfers and the budget items they stand for (spec 0019, RG10, RG11, RG14, RG15). A transfer is an `AccountMovement`; its optional
 * `target` says which budget item it is the real counterpart of, so that the rest of the item (spec 0043) counts what it already sent.
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
}

/** Items of a month a transfer can stand for: envelopes, savings/investment lines with a dedicated account, `var` lines with a dedicated account. */
export function transferItems(d: BudgetData, m: MonthKey): TransferItem[] {
  const md = d.months[m];
  const lines = md?.initialized ? md.lines : [];
  const main = mainAccount(d).id;
  const out: TransferItem[] = [];
  for (const e of d.envelopes) {
    out.push({ target: { kind: 'env', id: e.id }, label: `Allocation ${e.name} (enveloppe)`, fromAccountId: main, toAccountId: e.accountId });
  }
  for (const l of lines) {
    if (isSavingsBlock(l.block) && l.linkedAccountId) {
      out.push({ target: { kind: 'line', key: l.key }, label: `${l.name} (${l.block === 'epa' ? 'épargne' : 'investissement'})`, fromAccountId: accountIdOf(d, l.accountId), toAccountId: l.linkedAccountId });
    } else if (isDedicatedVarLine(d, l)) {
      out.push({ target: { kind: 'line', key: l.key }, label: `${l.name} (variable)`, fromAccountId: main, toAccountId: resolveBoxAccountId(d, l) });
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
