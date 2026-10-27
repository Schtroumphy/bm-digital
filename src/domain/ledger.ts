import { balanceRangeEnd, isMonthInBalanceRange } from './balanceRange';
import { flowOf, realMovements } from './bankMovements';
import { envelopeAccountAt, isTransactionInBudget } from './bank';
import { addMonths, compareMonths, currentMonthKey, monthKey, parseMonth, round2 } from './format';
import type { BudgetData, Line, MonthKey, Transaction } from './types';

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

/** A bank account over one month: opening, money in and out, closing balance. */
export interface BankMonth {
  start: number;
  in: number;
  out: number;
  balance: number;
}

export interface Account {
  key: string;
  name: string;
  block: 'epa' | 'inv';
}

/** Months listed in the month picker: from the first app month to two months past the latest one in use. */
export function monthRange(d: BudgetData, today = currentMonthKey()): MonthKey[] {
  const end = balanceRangeEnd(d, today);
  if (d.firstMonth === null || end === null) return [];
  const out: MonthKey[] = [];
  for (let k = d.firstMonth; compareMonths(k, end) <= 0; k = addMonths(k, 1)) out.push(k);
  return out;
}

export const isYearClosed = (d: BudgetData, year: number) => !!d.closes[year]?.closed;
/** The month itself was closed by the user (not through its year). */
export const isMonthClosed = (d: BudgetData, m: MonthKey) => !!d.months[m]?.closed;
/** Read-only: the month's year is closed, or the month itself is. */
export const isMonthLocked = (d: BudgetData, m: MonthKey) => isYearClosed(d, parseMonth(m).year) || isMonthClosed(d, m);

/** The closest initialized month before `m`, or null for the first month of the budget (months not created are skipped). */
export function previousInitializedMonth(d: BudgetData, m: MonthKey): MonthKey | null {
  if (d.firstMonth === null || compareMonths(m, d.firstMonth) <= 0) return null;
  const before = Object.keys(d.months).filter(k => d.months[k].initialized && compareMonths(k, m) < 0);
  return before.length ? before.sort().at(-1)! : null;
}

export const closeKey = (kind: 'acc' | 'env' | 'bank', id: string) => `${kind}:${id}`;

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

const sumTx = (d: BudgetData, m: MonthKey, type: string, target: string, keep = (_t: Transaction) => true) =>
  round2(d.transactions.filter(t => t.month === m && t.type === type && t.target === target && keep(t)).reduce((s, t) => s + t.amount, 0));

const isCashPaid = (t: Transaction) => t.payMode === 'especes';

/**
 * Month-by-month balances of envelopes and savings/investment accounts, from
 * the imported history through the app months. From the month its own account exists
 * (spec 0011), an envelope's balance is the balance of that account; before, it is the old
 * calculation (start + allocation − spending) over the imported history. A closed year's adjusted bases
 * become the opening balances of the following January.
 */
export class Ledger {
  readonly months: MonthKey[];
  private env = new Map<string, EnvMonth>();
  private acc = new Map<string, AccMonth>();
  private bank = new Map<string, BankMonth>();

  constructor(private d: BudgetData, today = currentMonthKey()) {
    this.months = monthRange(d, today);
    const first = d.firstMonth;
    if (first === null) return; // nothing to compute before the first month exists
    const envBal: Record<string, number> = {};
    const accBal: Record<string, number> = {};
    const bankBal: Record<string, number> = {};
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
      for (const b of d.accounts) {
        if (!isMonthInBalanceRange(d, b, m)) continue;
        const start = prevClose?.overrides[closeKey('bank', b.id)] ?? (compareMonths(m, b.openingMonth) === 0 ? undefined : bankBal[b.id]) ?? b.openingBalance;
        const flow = this.bankFlow(b.id, m);
        const r = { start, in: flow.in, out: flow.out, balance: round2(start + flow.in - flow.out) };
        this.bank.set(`${m}|${b.id}`, r);
        bankBal[b.id] = r.balance;
      }
      for (const e of d.envelopes) {
        const a = alloc[e.id] ?? 0;
        // From the month its account exists, spending is on that account (spec 0011, RG10). The envelope's own balance stays BUDGETARY
        // (start + allocation − spent, spec 0019, RG16): the money really on its account is its real balance (`bankMonth`), which only
        // moves when the funding is recorded as a transfer. It starts from the account's balance in its opening month and after a
        // closed year that carried the account, else from the previous month of the envelope.
        if (envelopeAccountAt(d, e, m)) {
          const b = this.bank.get(`${m}|${e.accountId}`)!;
          const account = d.accounts.find(x => x.id === e.accountId)!;
          const fromAccount = compareMonths(m, account.openingMonth) === 0 || prevClose?.overrides[closeKey('bank', e.accountId)] !== undefined;
          const start = fromAccount ? b.start : envBal[e.id] ?? b.start;
          const spent = sumTx(d, m, 'env', e.id);
          // An expense paid in cash counts in `spent` but never touches the balance (the virtual one, spec 0026, RG6).
          const r = { start, alloc: a, spent, balance: round2(start + a - sumTx(d, m, 'env', e.id, t => !isCashPaid(t))) };
          this.env.set(`${m}|${e.id}`, r);
          envBal[e.id] = Math.max(0, r.balance); // an overspent envelope does not carry a debt into the next month
          continue;
        }
        const start = prevClose?.overrides[closeKey('env', e.id)] ?? envBal[e.id] ?? 0;
        // Spending paid from an account that is out of the budget does not touch the envelope.
        const spent = sumTx(d, m, 'env', e.id, t => isTransactionInBudget(d, t));
        // An envelope opening balance set by the assistant for a later month acts like an account statement.
        const opening = d.envHistory[m]?.[e.id];
        const r = { start, alloc: a, spent, balance: opening ? opening.balance : round2(start + a - sumTx(d, m, 'env', e.id, t => !isCashPaid(t) && isTransactionInBudget(d, t))) };
        this.env.set(`${m}|${e.id}`, r);
        envBal[e.id] = Math.max(0, r.balance);
      }
      for (const a of accs) {
        const start = prevClose?.overrides[closeKey('acc', a.key)] ?? accBal[a.key] ?? 0;
        const line = md?.initialized ? md.lines.find(l => l.key === a.key) : undefined;
        const paid = line?.actual ?? 0;
        const out = sumTx(d, m, 'epa', a.key);
        const expected = round2(start + paid - out);
        // A line with a dedicated bank account reads it, like the Accounts screen: opening, real money in and out, closing balance.
        const bank = line?.linkedAccountId && !md!.lines.some(o => o.key !== a.key && o.linkedAccountId === line.linkedAccountId) ? this.bank.get(`${m}|${line.linkedAccountId}`) : undefined;
        if (bank) {
          const st = d.statements[m]?.[a.key];
          const r = { start: bank.start, paid: bank.in, out: bank.out, expected: bank.balance, statement: st === undefined ? null : st, balance: st ?? bank.balance };
          this.acc.set(`${m}|${a.key}`, r);
          accBal[a.key] = r.balance;
          continue;
        }
        const st = d.statements[m]?.[a.key];
        const statement = st === undefined ? null : st;
        const r = { start, paid, out, expected, statement, balance: statement ?? expected };
        this.acc.set(`${m}|${a.key}`, r);
        accBal[a.key] = r.balance;
      }
    }
  }

  /**
   * Money in and out of a bank account during a month: its REAL movements only (spec 0019, RG1): expenses, entries of money, transfers
   * and active adjustments. A check, a line's actual or an allocation never moves a real balance.
   */
  private bankFlow(id: string, m: MonthKey) {
    return flowOf(realMovements(this.d, id, m));
  }

  envMonth(id: string, m: MonthKey): EnvMonth | null {
    return this.env.get(`${m}|${id}`) ?? null;
  }

  /** Balance of a bank account at the end of a month; null before its opening month. */
  bankMonth(id: string, m: MonthKey): BankMonth | null {
    return this.bank.get(`${m}|${id}`) ?? null;
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
    let bal = Math.max(0, this.envMonth(id, last)?.balance ?? 0);
    const perMonth = this.d.template.envAlloc[id] ?? 0;
    for (let k = addMonths(last, 1); ; k = addMonths(k, 1)) {
      const avail = bal + perMonth;
      if (k === m) return round2(avail);
      const p = parseMonth(k);
      bal = Math.max(0, avail - this.d.planned.filter(x => x.envelopeId === id && x.year === p.year && x.month === p.month).reduce((s, x) => s + x.amount, 0));
    }
  }
}
