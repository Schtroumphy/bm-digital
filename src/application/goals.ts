import { goalAccountKeys } from '../domain/budget';
import { round2 } from '../domain/format';
import type { GoalId } from '../domain/goals';
import type { BudgetData } from '../domain/types';

/**
 * Parses what the user typed in a target field: « 25 000,5 » is accepted (comma, spaces, €, %).
 * Returns the value, or a message in French when it is refused (empty, not a number, ≤ 0, rate over 100).
 */
export function parseGoalTarget(text: string, goal: GoalId): { value: number } | { error: string } {
  const clean = text.replace(/[\s  €%]/g, '').replace(',', '.');
  if (!clean) return { error: 'Saisissez une valeur' };
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return { error: 'Valeur numérique requise' };
  const value = round2(parseFloat(clean));
  if (!(value > 0)) return { error: 'La cible doit être supérieure à 0' };
  if (goal === 'savings' && value > 100) return { error: 'Le taux ne peut pas dépasser 100 %' };
  return { value };
}

/** Writes the target of a goal. Returns an error message and changes nothing when the text is refused, null when applied. */
export function setGoalTarget(d: BudgetData, goal: GoalId, text: string): string | null {
  const parsed = parseGoalTarget(text, goal);
  if ('error' in parsed) return parsed.error;
  if (goal === 'emergency') d.settings.emergencyTarget = parsed.value;
  else if (goal === 'invest') d.settings.investTarget = parsed.value;
  else d.settings.savingsRateTarget = parsed.value;
  return null;
}

const isIsoDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s;
};

/** Sets the due date (`YYYY-MM-DD`) of the emergency fund or « Investir »; an empty date clears it. Returns false (nothing changed) for an invalid date. */
export function setGoalDue(d: BudgetData, goal: 'emergency' | 'invest', date: string): boolean {
  const v = date.trim();
  if (v && !isIsoDate(v)) return false;
  const key = goal === 'emergency' ? 'emergencyDue' : 'investDue';
  if (v) d.settings[key] = v;
  else delete d.settings[key];
  return true;
}

/** Ticks or unticks a line for a goal. For « Investir » with no choice made yet, the default (every `inv` line) is written first. */
export function toggleGoalAccount(d: BudgetData, goal: 'emergency' | 'invest', key: string): void {
  const current = goalAccountKeys(d, goal);
  const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
  if (goal === 'emergency') d.settings.emergencyAccounts = next;
  else d.settings.investAccounts = next;
}
