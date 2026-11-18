import { accountIdOf, isAccountTransfer, isSavingsBlock, lineDisplayName, mainAccount, resolveBoxAccountId } from './bank';
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
      out.push({ target: { kind: 'line', key: l.key }, label: `${lineDisplayName(d, l)} (${l.block === 'epa' ? 'épargne' : 'investissement'})`, fromAccountId: accountIdOf(d, l.accountId), toAccountId: l.linkedAccountId });
    } else if (isDedicatedVarLine(d, l)) {
      out.push({ target: { kind: 'line', key: l.key }, label: `${l.name} (variable)`, fromAccountId: main, toAccountId: resolveBoxAccountId(d, l) });
    }
  }
  return out;
}

/**
 * The item proposed by default for an imported transfer whose destination is `toAccountId` (RG15): the envelope or the line of that account. A transfer
 * between accounts is never proposed: an import never attaches to one by itself, the user chooses (spec 0050, RG51).
 */
export function defaultTransferTarget(d: BudgetData, m: MonthKey, toAccountId: string, fromAccountId?: string): MovementTarget | null {
  const lines = d.months[m]?.lines ?? [];
  const items = transferItems(d, m).filter(i => i.toAccountId === toAccountId && !(i.target.kind === 'line' && lines.some(l => l.key === (i.target as { key: string }).key && isAccountTransfer(d, l))));
  return (items.find(i => i.fromAccountId === fromAccountId) ?? items[0])?.target ?? null;
}

/** Whether a transfer can stand for the item: the item exists in the month and the destination is its account. */
export const isValidTransferTarget = (d: BudgetData, m: MonthKey, toAccountId: string, target: MovementTarget): boolean =>
  transferItems(d, m).some(i => sameTarget(i.target, target) && i.toAccountId === toAccountId);

/** Value of a target in a selector (`line:<key>` or `env:<id>`), '' for none. */
export const targetValue = (t: MovementTarget | null | undefined): string => (t ? (t.kind === 'line' ? `line:${t.key}` : `env:${t.id}`) : '');

/**
 * Items a transfer to `toAccountId` can be attached to by the « Rattacher à » selector (spec 0050, RG47, RG48): those whose account is the destination, the
 * variable lines of a dedicated account left out (they keep their checkboxes, spec 0045). The source of the transfer is not looked at: « Principal → Travaux »
 * counts for « LDDS Travaux → Travaux ».
 */
export function attachableItems(d: BudgetData, m: MonthKey, toAccountId: string): TransferItem[] {
  const isVar = (t: MovementTarget) => t.kind === 'line' && !!d.months[m]?.lines.some(l => l.key === t.key && l.block === 'var');
  return transferItems(d, m).filter(i => i.toAccountId === toAccountId && !isVar(i.target));
}

/**
 * The `targets` an edited transfer sends (RG49, RG50): the chosen item when there is one (a single target), else the checked variable lines, else none
 * (« Aucune » removes the attachment). An item that is not attachable to the destination is dropped.
 */
export function editedTargets(d: BudgetData, m: MonthKey, toAccountId: string, lineKeys: string[], itemValue: string): MovementTarget[] {
  const item = attachableItems(d, m, toAccountId).find(i => targetValue(i.target) === itemValue);
  if (item) return [item.target];
  return lineKeys.map(key => ({ kind: 'line' as const, key }));
}

/** The item the creation form proposes (RG51, unchanged): the one whose payer is the source of the transfer, else the first one that aims at the destination. */
export const creationDefaultItem = (d: BudgetData, m: MonthKey, fromAccountId: string, toAccountId: string): MovementTarget | undefined => {
  const items = attachableItems(d, m, toAccountId);
  return (items.find(i => i.fromAccountId === fromAccountId) ?? items[0])?.target;
};

