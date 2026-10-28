import { round2, currentMonthKey } from '../domain/format';
import { isGoalYearEditable } from '../domain/goals';
import type { BudgetData, Goal, GoalKind, GoalScope, MonthKey } from '../domain/types';

/*
 * Annual goals (spec 0032): create, change and delete. Every action refuses to touch a past year (RG9), checks its input first and changes
 * nothing when it is refused. Pure functions on a copy of the data, like the other use cases.
 */

export const GOAL_NAME_MAX = 60;
export const PAST_YEAR_MESSAGE = 'Une année passée est en lecture seule';

/**
 * Parses what the user typed in a target field: « 25 000,5 » is accepted (comma, spaces, €, %).
 * Returns the value, or a message in French when it is refused (empty, not a number, ≤ 0, rate over 100).
 */
export function parseGoalTarget(text: string, kind: GoalKind): { value: number } | { error: string } {
  const clean = text.replace(/[\s  €%]/g, '').replace(',', '.');
  if (!clean) return { error: 'Saisissez une valeur' };
  if (!/^-?\d+(\.\d+)?$/.test(clean)) return { error: 'Valeur numérique requise' };
  const value = round2(parseFloat(clean));
  if (!(value > 0)) return { error: 'La cible doit être supérieure à 0' };
  if (kind === 'rate' && value > 100) return { error: 'Le taux ne peut pas dépasser 100 %' };
  return { value };
}

/** Trimmed name, or a message when it is empty or longer than 60 characters. */
export function parseGoalName(text: string): { value: string } | { error: string } {
  const name = text.trim();
  if (!name) return { error: 'Saisissez un nom' };
  if (name.length > GOAL_NAME_MAX) return { error: `${GOAL_NAME_MAX} caractères maximum` };
  return { value: name };
}

const isIsoDate = (s: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === s;
};

/** What the creation panel collects (RG10). */
export interface GoalDraft {
  kind: GoalKind;
  name: string;
  /** Raw text of the target field. */
  target: string;
  /** `amount` and `saved`: ticked lines. */
  accounts: string[];
  /** `cap`: what the ceiling watches. */
  scope: GoalScope | null;
  /** `amount`: optional due date `YYYY-MM-DD`, empty = none. */
  due: string;
}

export type GoalField = 'name' | 'target' | 'params' | 'due';
export type GoalErrors = Partial<Record<GoalField, string>>;

/** The errors of a draft, field by field; empty when it can be created (RG10). */
export function validateGoalDraft(draft: GoalDraft): GoalErrors {
  const errors: GoalErrors = {};
  const name = parseGoalName(draft.name);
  if ('error' in name) errors.name = name.error;
  const target = parseGoalTarget(draft.target, draft.kind);
  if ('error' in target) errors.target = target.error;
  if ((draft.kind === 'amount' || draft.kind === 'saved') && draft.accounts.length === 0) errors.params = 'Cochez au moins un compte';
  if (draft.kind === 'cap' && draft.scope === null) errors.params = 'Choisissez ce que le plafond surveille';
  if (draft.kind === 'amount' && draft.due.trim() && !isIsoDate(draft.due.trim())) errors.due = 'Date invalide';
  return errors;
}

/**
 * Creates a goal for `year` at the end of the list. Returns the errors (nothing is written) or null once created.
 * A past year is refused with an error on the name field, since the panel is not even offered there.
 */
export function createGoal(d: BudgetData, year: number, draft: GoalDraft, id: string, today: MonthKey = currentMonthKey()): GoalErrors | null {
  if (!isGoalYearEditable(year, today)) return { name: PAST_YEAR_MESSAGE };
  const errors = validateGoalDraft(draft);
  if (Object.keys(errors).length > 0) return errors;
  const goals = (d.goals ??= []);
  const target = (parseGoalTarget(draft.target, draft.kind) as { value: number }).value;
  const due = draft.due.trim();
  goals.push({
    id,
    year,
    kind: draft.kind,
    name: (parseGoalName(draft.name) as { value: string }).value,
    target,
    ...(draft.kind === 'amount' && due ? { due } : {}),
    ...(draft.kind === 'amount' || draft.kind === 'saved' ? { accounts: [...draft.accounts] } : {}),
    ...(draft.kind === 'cap' && draft.scope ? { scope: draft.scope } : {}),
    position: goals.reduce((max, g) => Math.max(max, g.position), -1) + 1,
  });
  return null;
}

/** The goal when it exists and its year can be changed. */
function editable(d: BudgetData, id: string, today: MonthKey): Goal | null {
  const g = d.goals?.find(x => x.id === id);
  return g && isGoalYearEditable(g.year, today) ? g : null;
}

/** Writes the target of a goal. Returns an error message and changes nothing when the text is refused, null when applied. */
export function setGoalTarget(d: BudgetData, id: string, text: string, today: MonthKey = currentMonthKey()): string | null {
  const g = editable(d, id, today);
  if (!g) return PAST_YEAR_MESSAGE;
  const parsed = parseGoalTarget(text, g.kind);
  if ('error' in parsed) return parsed.error;
  g.target = parsed.value;
  return null;
}

/** Renames a goal. Returns an error message and changes nothing when the name is refused, null when applied. */
export function renameGoal(d: BudgetData, id: string, text: string, today: MonthKey = currentMonthKey()): string | null {
  const g = editable(d, id, today);
  if (!g) return PAST_YEAR_MESSAGE;
  const parsed = parseGoalName(text);
  if ('error' in parsed) return parsed.error;
  g.name = parsed.value;
  return null;
}

/** Sets the due date (`YYYY-MM-DD`) of an `amount` goal; an empty date clears it. Returns false (nothing changed) for an invalid date, another kind or a past year. */
export function setGoalDue(d: BudgetData, id: string, date: string, today: MonthKey = currentMonthKey()): boolean {
  const g = editable(d, id, today);
  if (!g || g.kind !== 'amount') return false;
  const v = date.trim();
  if (v && !isIsoDate(v)) return false;
  if (v) g.due = v;
  else delete g.due;
  return true;
}

/** Ticks or unticks a line of an `amount` or `saved` goal. Returns false when nothing changed. */
export function toggleGoalAccount(d: BudgetData, id: string, key: string, today: MonthKey = currentMonthKey()): boolean {
  const g = editable(d, id, today);
  if (!g || (g.kind !== 'amount' && g.kind !== 'saved')) return false;
  const current = g.accounts ?? [];
  g.accounts = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
  return true;
}

/** Deletes a goal for good (no bin, RG12). Returns false for an unknown goal or a past year. */
export function deleteGoal(d: BudgetData, id: string, today: MonthKey = currentMonthKey()): boolean {
  if (!editable(d, id, today)) return false;
  d.goals = (d.goals ?? []).filter(g => g.id !== id);
  return true;
}
