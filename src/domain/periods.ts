import { addMonths, compareMonths, parseMonth } from './format';
import type { BudgetData, MonthData, MonthKey } from './types';

/*
 * Budget periods (spec 0039). A month of the budget is a name, not a calendar month: « octobre » can run from 29/09 to 29/10.
 * A period is the inclusive interval `[start, end]` of dates (`YYYY-MM-DD`) of a month. Periods are contiguous: the start of a month is
 * the day after the end of the previous one; only the start of the budget (first month) and the end of each month are data.
 * Without any date (`Settings.startDate`, `MonthData.endDate`), every period is the calendar month: nothing changes (RG6).
 * Pure functions only; the only state is a cache of the computed chain, rebuilt whenever the dates change.
 */

export interface Period {
  start: string;
  end: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (year: number, month1: number) => new Date(Date.UTC(year, month1, 0)).getUTCDate();
const iso = (year: number, month1: number, day: number) => `${year}-${pad(month1)}-${pad(day)}`;
const parts = (s: string) => ({ year: +s.slice(0, 4), month1: +s.slice(5, 7), day: +s.slice(8, 10) });

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { year, month1, day } = parts(s);
  return month1 >= 1 && month1 <= 12 && day >= 1 && day <= daysIn(year, month1);
}

/** The date `n` days after (or before, if negative) a `YYYY-MM-DD` date. */
export function addDays(date: string, n: number): string {
  const { year, month1, day } = parts(date);
  const t = new Date(Date.UTC(year, month1 - 1, day + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Last day of a calendar month. */
export const lastDayOf = (m: MonthKey): string => `${m}-${pad(daysIn(parseMonth(m).year, parseMonth(m).month + 1))}`;

/** `dd/mm/yyyy`. */
export const fullDate = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;

/** The calendar month: the period of a month with no date, and of the months before the first one. */
const civilPeriod = (m: MonthKey): Period => ({ start: `${m}-01`, end: lastDayOf(m) });

/**
 * End of the next month when the user gave none (RG5): the same day number as the end of the previous month, capped to the length of the month;
 * an end on the last day of its calendar month stays on the last day (29/10 gives 29/11, 31/01 gives 28/02, 28/02 gives 31/03).
 */
export function nextDefaultEnd(previousEnd: string): string {
  const { year, month1, day } = parts(previousEnd);
  const year2 = month1 === 12 ? year + 1 : year;
  const month2 = month1 === 12 ? 1 : month1 + 1;
  const last2 = daysIn(year2, month2);
  return iso(year2, month2, day === daysIn(year, month1) ? last2 : Math.min(day, last2));
}

/** Start of the budget (RG2): the date typed in, else the 1st of the first month. Null without a first month. */
export function budgetStart(d: BudgetData): string | null {
  return d.firstMonth === null ? null : d.settings.startDate ?? `${d.firstMonth}-01`;
}

interface Slot extends Period {
  /** The end the month would have with no date of its own. */
  defaultEnd: string;
  /** The user typed the end of this month. */
  explicit: boolean;
  /** The end typed or computed is before the start: the chain is broken (the period is then reduced to its start). */
  empty: boolean;
}

/** Furthest month the chain is built to: 100 years, a safety stop (a month beyond it is read as a calendar month). */
const MAX_SLOTS = 1200;

const cache = new WeakMap<BudgetData, { signature: string; slots: Slot[] }>();

const signatureOf = (d: BudgetData): string => {
  const ends: string[] = [];
  for (const [k, md] of Object.entries(d.months)) if (md.endDate) ends.push(`${k}=${md.endDate}`);
  return `${d.firstMonth}|${d.settings.startDate ?? ''}|${ends.sort().join(',')}`;
};

/** Slot `index` of the chain (0 = first month), built from the cached ones. */
function slotAt(d: BudgetData, index: number): Slot {
  const first = d.firstMonth!;
  const signature = signatureOf(d);
  let entry = cache.get(d);
  if (!entry || entry.signature !== signature) {
    entry = { signature, slots: [] };
    cache.set(d, entry);
  }
  const { slots } = entry;
  while (slots.length <= index) {
    const i = slots.length;
    const k = addMonths(first, i);
    const prev = i === 0 ? null : slots[i - 1];
    const start = prev ? addDays(prev.end, 1) : budgetStart(d)!;
    const defaultEnd = nextDefaultEnd(prev ? prev.end : lastDayOf(addMonths(first, -1)));
    const explicit = d.months[k]?.endDate;
    const raw = explicit ?? defaultEnd;
    const empty = raw < start;
    slots.push({ start, end: empty ? start : raw, defaultEnd, explicit: explicit !== undefined, empty });
  }
  return slots[index];
}

const offsetOf = (d: BudgetData, m: MonthKey): number => {
  const a = parseMonth(d.firstMonth!);
  const b = parseMonth(m);
  return (b.year - a.year) * 12 + (b.month - a.month);
};

/** Period of a month: its dates, or the calendar month when no date was typed, before the first month, or without a first month (RG1, RG3, RG5, RG6). */
export function periodOf(d: BudgetData, m: MonthKey): Period {
  if (d.firstMonth === null || compareMonths(m, d.firstMonth) < 0) return civilPeriod(m);
  const offset = offsetOf(d, m);
  if (offset >= MAX_SLOTS) return civilPeriod(m);
  const { start, end } = slotAt(d, offset);
  return { start, end };
}

/** Whether a date (`YYYY-MM-DD`) belongs to the period of a month. */
export function inPeriod(d: BudgetData, m: MonthKey, date: string): boolean {
  const p = periodOf(d, m);
  return date >= p.start && date <= p.end;
}

/** The month whose period contains a date; null before the start of the budget (or without a first month). */
export function monthOfDate(d: BudgetData, date: string): MonthKey | null {
  const start = budgetStart(d);
  if (start === null || date < start) return null;
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (date <= slotAt(d, i).end) return addMonths(d.firstMonth!, i);
  }
  return null;
}

/** A date before the start of the budget: it is in no period and counted in no balance (RG17). */
export function isBeforeBudget(d: BudgetData, date: string): boolean {
  const start = budgetStart(d);
  return start !== null && date < start;
}

/**
 * Bank date of an entry that has none, deduced from its month of attachment and its day number (spec 0015, RG2; spec 0039, RG11a): the latest date of the
 * period of the month carrying this day number (29/10 for the 29th of a period 29/09-29/10). A day that does not exist in the period keeps the old reading
 * (`month` + `day`), or the end of the period when that date does not exist (31/02).
 */
export function deducedDate(d: BudgetData, month: MonthKey, day: number): string {
  const legacy = `${month}-${pad(day)}`;
  const p = periodOf(d, month);
  if (p.start === `${month}-01` && p.end === lastDayOf(month)) return legacy;
  for (let date = p.end; date >= p.start; date = addDays(date, -1)) if (+date.slice(8, 10) === day) return date;
  return isRealDate(legacy) ? legacy : p.end;
}

// --- Input rules (RG4) ---

const blankMonth = (): MonthData => ({ initialized: false, lines: [], alloc: {}, transfersDone: {} });

/** A copy of the budget with the dates of the proposal, to check the whole chain without touching the real data. */
function withDates(d: BudgetData, change: { startDate?: string | null; month?: MonthKey; endDate?: string | null }): BudgetData {
  const settings = { ...d.settings };
  if (change.startDate !== undefined) {
    if (change.startDate === null) delete settings.startDate;
    else settings.startDate = change.startDate;
  }
  const months = { ...d.months };
  if (change.month !== undefined && change.endDate !== undefined) {
    const md = { ...(months[change.month] ?? blankMonth()) };
    if (change.endDate === null) delete md.endDate;
    else md.endDate = change.endDate;
    months[change.month] = md;
  }
  return { ...d, settings, months };
}

/** Some period up to the last month with a typed end is empty (an end before the start of its month). */
function hasEmptyPeriod(d: BudgetData): boolean {
  const ends = Object.entries(d.months).filter(([, md]) => md.endDate).map(([k]) => k);
  const last = ends.length ? ends.sort().at(-1)! : d.firstMonth!;
  const count = Math.max(offsetOf(d, last), 0) + 1;
  for (let i = 0; i < count; i++) if (slotAt(d, i).empty) return true;
  return false;
}

/** Earliest and latest end of a month (RG4): not before its start, not after the day before the current end of the next month. Null before the first month. */
export function periodEndBounds(d: BudgetData, m: MonthKey): { min: string; max: string } | null {
  if (d.firstMonth === null || compareMonths(m, d.firstMonth) < 0) return null;
  const i = offsetOf(d, m);
  const slot = slotAt(d, i);
  const next = slotAt(d, i + 1);
  return { min: slot.start, max: addDays(next.end, -1) };
}

/** Why an end date is refused for a month (RG4), or null when it is acceptable. Locks (RG8) are checked by the use case. */
export function validatePeriodEnd(d: BudgetData, m: MonthKey, end: string): string | null {
  const bounds = periodEndBounds(d, m);
  if (!bounds) return 'Ce mois n’a pas de période propre.';
  if (!isRealDate(end)) return 'Date invalide.';
  if (end < bounds.min) return `La fin ne peut pas précéder le début de la période (${fullDate(bounds.min)}).`;
  if (end > bounds.max) return `La fin doit être au plus tard le ${fullDate(bounds.max)} (la veille de la fin du mois suivant).`;
  if (hasEmptyPeriod(withDates(d, { month: m, endDate: end }))) return 'Cette date viderait la période d’un mois suivant.';
  return null;
}

/** Why the typed end of a month cannot be cleared (the default end would empty the period of a later month), or null. */
export function validatePeriodEndCleared(d: BudgetData, m: MonthKey): string | null {
  if (d.firstMonth === null || compareMonths(m, d.firstMonth) < 0) return 'Ce mois n’a pas de période propre.';
  return hasEmptyPeriod(withDates(d, { month: m, endDate: null })) ? 'La fin par défaut viderait la période d’un mois suivant.' : null;
}

/** Earliest and latest start of the budget (RG4): from the 1st of the calendar month before the first month to the last day of the first month. */
export function budgetStartBounds(d: BudgetData): { min: string; max: string } | null {
  if (d.firstMonth === null) return null;
  return { min: `${addMonths(d.firstMonth, -1)}-01`, max: lastDayOf(d.firstMonth) };
}

/** Why a start of the budget is refused (RG4), or null. Locks (RG8) are checked by the use case. */
export function validateBudgetStart(d: BudgetData, start: string): string | null {
  const bounds = budgetStartBounds(d);
  if (!bounds) return 'Choisis d’abord le premier mois.';
  if (!isRealDate(start)) return 'Date invalide.';
  if (start < bounds.min) return `Le début du budget ne peut pas précéder le ${fullDate(bounds.min)}.`;
  if (start > bounds.max) return `Le début du budget ne peut pas dépasser le ${fullDate(bounds.max)}.`;
  if (hasEmptyPeriod(withDates(d, { startDate: start }))) return 'Cette date dépasserait la fin du premier mois.';
  return null;
}

/** Date proposed for a new entry of month `m`: today when it is in the period, else the end of the period (past month) or its start (future month). */
export function defaultEntryDate(d: BudgetData, m: MonthKey, today: string): string {
  const p = periodOf(d, m);
  return today < p.start ? p.start : today > p.end ? p.end : today;
}
