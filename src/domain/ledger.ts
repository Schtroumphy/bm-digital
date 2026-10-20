import { addMonths, compareMonths, currentMonthKey, monthKey, parseMonth, round2 } from './format';
import type { BudgetData, Line, MonthKey } from './types';

export interface EnvMonth {
  start: number;
  alloc: number;
  spent: number;
  balance: number;
}

export interface AccMonth {
  start: number;
  paid: number;
  out: number;
  expected: number;
  statement: number | null;
  /** Statement when entered, otherwise the expected balance. */
  balance: number;
}

export interface Account {
  key: string;
  name: string;
  block: 'epa' | 'inv';
}

/** Months listed in the month picker: from the first app month to two months past the latest one in use. */
export function monthRange(d: BudgetData, today = currentMonthKey()): MonthKey[] {
  if (d.firstMonth === null) return [];
  let last = today;
  for (const [k, m] of Object.entries(d.months)) if (m.initialized && compareMonths(k, last) > 0) last = k;
  const end = addMonths(compareMonths(last, d.firstMonth) < 0 ? d.firstMonth : last, 2);
  const out: MonthKey[] = [];
  for (let k = d.firstMonth; compareMonths(k, end) <= 0; k = addMonths(k, 1)) out.push(k);
  return out;
}

export const isYearClosed = (d: BudgetData, year: number) => !!d.closes[year]?.closed;
export const isMonthLocked = (d: BudgetData, m: MonthKey) => isYearClosed(d, parseMonth(m).year);

export const closeKey = (kind: 'acc' | 'env', id: string) => `${kind}:${id}`;

/** Lines of an initialized month, or the template preview for a month not created yet. */
export function monthLines(d: BudgetData, m: MonthKey): Line[] {
  const md = d.months[m];
  return md?.initialized ? md.lines : d.template.lines.map(l => ({ ...l, actual: null }));
}

export function monthAlloc(d: BudgetData, m: MonthKey): Record<string, number> {
  const md = d.months[m];
  return md?.initialized ? md.alloc : d.template.envAlloc;
}

export function accounts(d: BudgetData): Account[] {
  const seen = new Map<string, Account>();
  const add = (l: { key: string; name: string; block: string }) => {
    if (l.block === 'epa' || l.block === 'inv') seen.set(l.key, { key: l.key, name: l.name, block: l.block });
  };
  d.template.lines.forEach(add);
  Object.keys(d.months).sort().forEach(k => d.months[k].lines.forEach(add));
  return [...seen.values()];
}

const sumTx = (d: BudgetData, m: MonthKey, type: string, target: string) =>
  round2(d.transactions.filter(t => t.month === m && t.type === type && t.target === target).reduce((s, t) => s + t.amount, 0));

/**
 * Month-by-month balances of envelopes and savings/investment accounts, from
 * the imported history through the app months. A closed year's adjusted bases
 * become the opening balances of the following January.
 */
export class Ledger {
  readonly months: MonthKey[];
  private env = new Map<string, EnvMonth>();
  private acc = new Map<string, AccMonth>();

  constructor(private d: BudgetData, today = currentMonthKey()) {
    this.months = monthRange(d, today);
    const first = d.firstMonth;
    if (first === null) return; // nothing to compute before the first month exists
    const envBal: Record<string, number> = {};
    const accBal: Record<string, number> = {};
    const accs = accounts(d);

    for (const m of Object.keys(d.envHistory).sort()) {
      if (compareMonths(m, first) >= 0) continue;
      for (const [id, h] of Object.entries(d.envHistory[m])) {
        this.env.set(`${m}|${id}`, { start: round2(h.balance + h.spent - h.alloc), alloc: h.alloc, spent: h.spent, balance: h.balance });
        envBal[id] = h.balance;
      }
    }
    for (const m of Object.keys(d.statements).sort()) {
      if (compareMonths(m, first) >= 0) continue;
      for (const [key, v] of Object.entries(d.statements[m])) {
        this.acc.set(`${m}|${key}`, { start: v, paid: 0, out: 0, expected: v, statement: v, balance: v });
        accBal[key] = v;
      }
    }

    for (const m of this.months) {
      const { year, month } = parseMonth(m);
      const prevClose = month === 0 && isYearClosed(d, year - 1) ? d.closes[year - 1] : null;
      const md = d.months[m];
      const alloc = md?.initialized ? md.alloc : {};
      for (const e of d.envelopes) {
        const start = prevClose?.overrides[closeKey('env', e.id)] ?? envBal[e.id] ?? 0;
        const a = alloc[e.id] ?? 0;
        const spent = sumTx(d, m, 'env', e.id);
        // An envelope opening balance set by the assistant for a later month acts like an account statement.
        const opening = d.envHistory[m]?.[e.id];
        const r = { start, alloc: a, spent, balance: opening ? opening.balance : round2(start + a - spent) };
        this.env.set(`${m}|${e.id}`, r);
        envBal[e.id] = r.balance;
      }
      for (const a of accs) {
        const start = prevClose?.overrides[closeKey('acc', a.key)] ?? accBal[a.key] ?? 0;
        const line = md?.initialized ? md.lines.find(l => l.key === a.key) : undefined;
        const paid = line?.actual ?? 0;
        const out = sumTx(d, m, 'epa', a.key);
        const expected = round2(start + paid - out);
        const st = d.statements[m]?.[a.key];
        const statement = st === undefined ? null : st;
        const r = { start, paid, out, expected, statement, balance: statement ?? expected };
        this.acc.set(`${m}|${a.key}`, r);
        accBal[a.key] = r.balance;
      }
    }
  }

  envMonth(id: string, m: MonthKey): EnvMonth | null {
    return this.env.get(`${m}|${id}`) ?? null;
  }

  accMonth(key: string, m: MonthKey): AccMonth | null {
    return this.acc.get(`${m}|${key}`) ?? null;
  }

  /**
   * What an envelope can spend in a month before that month's planned expenses:
   * opening balance + allocation. Past the last app month it is projected with
   * the template allocation, assuming each month's planned expenses get spent.
   */
  envAvailable(id: string, year: number, month: number): number | null {
    const m = monthKey(year, month);
    const known = this.envMonth(id, m);
    if (known) return round2(known.start + known.alloc);
    const last = this.months[this.months.length - 1];
    if (compareMonths(m, last) < 0) return null;
    let bal = this.envMonth(id, last)?.balance ?? 0;
    const perMonth = this.d.template.envAlloc[id] ?? 0;
    for (let k = addMonths(last, 1); ; k = addMonths(k, 1)) {
      const avail = bal + perMonth;
      if (k === m) return round2(avail);
      const p = parseMonth(k);
      bal = avail - this.d.planned.filter(x => x.envelopeId === id && x.year === p.year && x.month === p.month).reduce((s, x) => s + x.amount, 0);
    }
  }
}
