import { DETAIL_MAX, normalizeDetail } from '../domain/detail';
import type { BudgetData, MonthKey, MonthNote } from '../domain/types';

/*
 * Notes du mois (spec 0027, RG12): personal notes of a month. They change no figure, so they stay editable on a closed or
 * uninitialized month. The first note of a month that has no record creates it, without initializing it.
 */

/** Longest note (same rule as an entry detail, spec 0020). */
export const NOTE_MAX = DETAIL_MAX;

/** Notes of a month, in creation order. */
export const monthNotes = (d: BudgetData, m: MonthKey): MonthNote[] => d.months[m]?.notes ?? [];

/** Adds a note at the end of the month's list. Refused (false) when the text is empty once trimmed, longer than 200 characters (refused, not cut), or the id is already used in the month. */
export function addNote(d: BudgetData, m: MonthKey, id: string, text: string): boolean {
  const clean = normalizeDetail(text);
  if (clean === undefined || text.trim().length > NOTE_MAX || monthNotes(d, m).some(n => n.id === id)) return false;
  const md = (d.months[m] ??= { initialized: false, lines: [], alloc: {}, transfersDone: {} });
  (md.notes ??= []).push({ id, text: clean, done: false });
  return true;
}

/** Ticks or unticks a note. Refused (false) for an unknown note. */
export function toggleNote(d: BudgetData, m: MonthKey, id: string): boolean {
  const note = d.months[m]?.notes?.find(n => n.id === id);
  if (!note) return false;
  note.done = !note.done;
  return true;
}

/** Deletes a note; the list property disappears when it becomes empty, so the month looks like one saved before the notes existed. */
export function deleteNote(d: BudgetData, m: MonthKey, id: string): boolean {
  const md = d.months[m];
  if (!md?.notes?.some(n => n.id === id)) return false;
  md.notes = md.notes.filter(n => n.id !== id);
  if (md.notes.length === 0) delete md.notes;
  return true;
}
