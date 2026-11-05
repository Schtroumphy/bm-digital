import { isLineInBudget, resolveBoxAccountId } from './bank';
import { round2 } from './format';
import { linkStateOf } from './internalTransfers';
import { monthLines } from './ledger';
import { lineKeysOf } from './movementTargets';
import { isDedicatedVarLine, isValidTransferTarget } from './transfers';
import type { AccountMovement, BudgetData, Line, MonthKey, MovementTarget } from './types';

/*
 * Transfers attached to several variable lines (spec 0045). The budget of a month feeds a dedicated account (e.g. Boursorama) with ONE transfer
 * that stands for several `var` lines of that account. Everything here is pure; the use cases (`accountMovements.ts`) and the screens read it.
 */

/** A transfer typed by hand (no import trace): its amount is ours to set (RG4); an imported one keeps the amount of the bank statement (RG7). */
export const isManualMovement = (mv: AccountMovement): boolean => linkStateOf(mv) === null;

/** The variable lines a transfer to `toAccountId` can be attached to in a month (RG1, CA7): paid from that dedicated account and counted in the budget. */
export const proposableLines = (d: BudgetData, m: MonthKey, toAccountId: string): Line[] =>
  monthLines(d, m).filter(l => isDedicatedVarLine(d, l) && isLineInBudget(d, l) && resolveBoxAccountId(d, l) === toAccountId);

/**
 * Whether a list of targets fits a transfer to `toAccountId` in a month (RG1, RG2): empty, or ONE envelope / savings item, or any number of distinct
 * variable lines of that account (never a mix of the two families).
 */
export function isValidTransferTargets(d: BudgetData, m: MonthKey, toAccountId: string, targets: MovementTarget[]): boolean {
  if (targets.length === 0) return true;
  const keys = lineKeysOf({ targets });
  const proposable = proposableLines(d, m, toAccountId);
  const onlyVarLines = keys.length === targets.length && keys.every(k => proposable.some(l => l.key === k));
  if (onlyVarLines) return new Set(keys).size === keys.length;
  // One envelope or savings/investment item; a variable line only goes through the list above.
  const [one] = targets;
  const isVarLine = one.kind === 'line' && monthLines(d, m).some(l => l.key === one.key && l.block === 'var');
  return targets.length === 1 && !isVarLine && isValidTransferTarget(d, m, toAccountId, one);
}

/** The variable lines a transfer is attached to that still exist and count in the budget (RG11: the others are ignored). */
export function linkedLines(d: BudgetData, mv: AccountMovement): Line[] {
  const keys = lineKeysOf(mv);
  return monthLines(d, mv.month).filter(l => keys.includes(l.key) && isDedicatedVarLine(d, l) && isLineInBudget(d, l));
}

/** Sum of the budgets of lines, rounded to 2 decimals. */
export const budgetOf = (lines: Pick<Line, 'budget'>[]): number => round2(lines.reduce((s, l) => s + l.budget, 0));

/** The amount a hand-typed transfer takes when these lines are attached to it (RG4): the sum of their budgets. */
export const amountForLines = (d: BudgetData, m: MonthKey, toAccountId: string, keys: string[]): number =>
  budgetOf(proposableLines(d, m, toAccountId).filter(l => keys.includes(l.key)));

/** The gap between the lines and the transfer (RG8): null without a linked line or when both amounts are equal. */
export function budgetGap(d: BudgetData, mv: AccountMovement): { budget: number; amount: number } | null {
  const lines = linkedLines(d, mv);
  if (lines.length === 0) return null;
  const budget = budgetOf(lines);
  return budget === round2(mv.amount) ? null : { budget, amount: round2(mv.amount) };
}

/** The transfers of a month a variable line is attached to (RG9, RG10). */
export const movementsLinkedTo = (d: BudgetData, m: MonthKey, l: Line): AccountMovement[] =>
  isDedicatedVarLine(d, l) && isLineInBudget(d, l) ? (d.accountMovements ?? []).filter(mv => mv.month === m && lineKeysOf(mv).includes(l.key)) : [];

/** Why the budget of a line cannot be changed, or null when it can (RG9). */
export function budgetLockReason(d: BudgetData, m: MonthKey, l: Line): string | null {
  const first = movementsLinkedTo(d, m, l)[0];
  return first ? `Verrouillé : ligne associée au virement ${first.label}. Retire-la du virement pour la modifier.` : null;
}
