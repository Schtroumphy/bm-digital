import type { MonthKey } from './types';

const NBSP = ' ';

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** French currency: « 1 665 € », « 2 914,93 € », « −20 € », and « +20 € » when `sign` is set. */
export function money(n: number, sign = false): string {
  n = round2(n);
  const abs = Math.abs(n);
  const cents = Math.round(abs * 100) % 100 !== 0;
  const s =
    abs
      .toLocaleString('fr-FR', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: 2 })
      .replace(/[  ]/g, NBSP) +
    NBSP +
    '€';
  if (n < 0) return '−' + s;
  return sign && n > 0 ? '+' + s : s;
}

export const percent = (n: number) => n.toFixed(1).replace('.', ',') + ' %';

/** Raw value for an edit field: « 349,93 ». */
export const rawNumber = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

/** Parses « 1 234,5 », « 25.50 », « −20 ». Returns null when the text holds no number. */
export function parseAmount(v: string): number | null {
  const x = parseFloat(v.replace(/[\s  €]/g, '').replace('−', '-').replace(',', '.'));
  return Number.isNaN(x) ? null : round2(x);
}

/** Keeps only what a French amount can contain. */
export const sanitizeAmountInput = (v: string) => v.replace(/[^\d,\s]/g, '').replace(/,(?=.*,)/g, '');

export const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const monthKey = (year: number, month0: number): MonthKey => `${year}-${String(month0 + 1).padStart(2, '0')}`;
export const parseMonth = (k: MonthKey) => ({ year: +k.slice(0, 4), month: +k.slice(5, 7) - 1 });
export function addMonths(k: MonthKey, n: number): MonthKey {
  const { year, month } = parseMonth(k);
  const t = year * 12 + month + n;
  return monthKey(Math.floor(t / 12), ((t % 12) + 12) % 12);
}
export const compareMonths = (a: MonthKey, b: MonthKey) => (a < b ? -1 : a > b ? 1 : 0);

/** « Décembre 2026 » */
export const monthLabel = (k: MonthKey) => {
  const { year, month } = parseMonth(k);
  return `${cap(MONTH_NAMES[month])} ${year}`;
};
export const monthName = (m: number) => cap(MONTH_NAMES[m]);
/** « 04 déc. » */
export const dayLabel = (k: MonthKey, day: number) => `${String(day).padStart(2, '0')} ${MONTH_SHORT[parseMonth(k).month]}`;

export const currentMonthKey = (d = new Date()) => monthKey(d.getFullYear(), d.getMonth());
