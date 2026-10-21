import { accountIdOf, isAccountInBudget, isLineInBudget, mainAccount, resolveBoxAccountId, resolveEnvelopeAccountId } from './bank';
import { bankMovements, countedAmount, envelopeCheckKey, flowOf, type BankMovement, type CountedSource } from './bankMovements';
import { addMonths, compareMonths, money, parseMonth, round2 } from './format';
import { closeKey, isMonthLocked, isYearClosed, monthLines, type Ledger } from './ledger';
import type { AccountBalanceEntry, BankAccount, BudgetData, ExecMode, Line, LineCheck, MonthKey } from './types';

/*
 * Pointage des lignes du budget (spec 0009): « l'argent a bougé ». Pure functions only.
 * A check never changes the actual of a line (RG2); it feeds the « Reste à sortir »,
 * the estimated balance and the margin of each bank account.
 */

/** Modes shown in the picker, in order (RG18); `short` is the text of the chip on the line. */
export const EXEC_MODES: { value: ExecMode; label: string; short: string }[] = [
  { value: 'prelevement', label: 'Prélèvement automatique', short: 'prél.' },
  { value: 'virement_auto', label: 'Virement automatique', short: 'vir. auto' },
  { value: 'virement_manuel', label: 'Virement manuel', short: 'vir.' },
  { value: 'retrait', label: 'Retrait d’espèces', short: 'espèces' },
  { value: 'informatif', label: 'Informatif', short: 'info' },
];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Local date as `YYYY-MM-DD`. The clock is a parameter everywhere else, so tests can fix it. */
export const isoDate = (date: Date = new Date()): string => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** True for a real calendar date written `YYYY-MM-DD`. */
export function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, day] = [+m[1], +m[2], +m[3]];
  return mo >= 1 && mo <= 12 && day >= 1 && day <= new Date(y, mo, 0).getDate();
}

/** `dd/mm` for a short display. */
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const daysInMonth = (m: MonthKey): number => {
  const { year, month } = parseMonth(m);
  return new Date(year, month + 1, 0).getDate();
};

/** Planned day brought back to the last day of a shorter month (RG16): 31 in a 30-day month gives 30. */
export const effectiveDueDay = (dueDay: number, m: MonthKey): number => Math.min(dueDay, daysInMonth(m));

/** Whole numbers 1 to 31 only. */
export const isValidDueDay = (n: number) => Number.isInteger(n) && n >= 1 && n <= 31;

/** The account that has to pay for a line: its own, or the main account for a variable line (RG12). */
export function payerAccountId(d: BudgetData, l: Line): string {
  return l.block === 'var' ? mainAccount(d).id : accountIdOf(d, l.accountId);
}

/** The account a variable line is paid from (spec 0006). */
const varAccountId = (d: BudgetData, l: Line) => resolveBoxAccountId(d, l);

/** A variable line paid from a dedicated account (not the main one): « virer / retirer le budget » can be checked (RG5). */
export const isDedicatedVar = (d: BudgetData, l: Line): boolean => l.block === 'var' && varAccountId(d, l) !== mainAccount(d).id;

/** Lines that have a checkbox: all but variable lines of the main account (RG4) and lines in « informatif » mode (RG19). Revenues are checked as « reçu » (RG45). */
export function isPointable(d: BudgetData, l: Line): boolean {
  if (l.execMode === 'informatif') return false;
  return l.block === 'var' ? isDedicatedVar(d, l) : true;
}

/** Amount counted for a checked or pending line, with where it comes from: the budget sent for a variable line to a dedicated account (RG82), `countedAmount` for the others. */
export function lineCounted(d: BudgetData, l: Line): { amount: number; source: CountedSource } {
  return isDedicatedVar(d, l) ? { amount: l.budget, source: 'budget' } : countedAmount(l);
}

/**
 * Tooltip text of a line of the Budget screen (spec 0009, RG86): one fact per line, only the ones that exist.
 * The date checked (« Reçu » for a revenue), the planned day, the execution mode with its full label, the amount
 * counted and where it comes from, the « en retard » state, and the out-of-budget notice. Shown on the whole row, so
 * the narrow line itself carries no pointage text. Empty when there is nothing to say.
 */
export function lineTooltip(d: BudgetData, m: MonthKey, l: Line, today: string): string {
  const parts: string[] = [];
  if (!isLineInBudget(d, l)) parts.push('Ligne hors budget : elle ne compte dans aucun total ni dans le reste à placer.');
  const check = lineCheck(d, m, l.key);
  if (check) {
    const c = lineCounted(d, l);
    parts.push(`${l.block === 'rev' ? 'Reçu' : 'Pointé'} le ${shortDate(check.doneOn)}`);
    parts.push(`Montant compté : ${money(c.amount)} (${c.source === 'actual' ? 'réel' : 'budget'})`);
    parts.push(c.source === 'actual' ? `Le réel (${money(c.amount)}) prime sur le budget (${money(l.budget)}).` : 'Pas de réel : le budget est compté.');
  }
  if (l.dueDay !== undefined) parts.push(`Prévu le ${effectiveDueDay(l.dueDay, m)} du mois`);
  const mode = EXEC_MODES.find(x => x.value === l.execMode);
  if (mode) parts.push(`Mode d’exécution : ${mode.label}`);
  if (isLate(d, m, l, today)) parts.push('En retard');
  return parts.join('\n');
}

/**
 * Tooltip text of an envelope tile (RG90): the allocation sent (date and destination once checked, otherwise what
 * checking would do), the account, and the payment mode of the envelope. Empty for an envelope with nothing to check.
 */
export function envelopeTooltip(d: BudgetData, m: MonthKey, e: { id: string; name: string; payMode?: Line['payMode']; accountId?: string }): string {
  const check = envelopeCheck(d, m, e.id);
  if (!check && !isEnvelopePointable(d, m, e)) return '';
  const accountId = check?.accountId ?? resolveEnvelopeAccountId(d, e);
  const account = d.accounts.find(a => a.id === accountId);
  const alloc = d.months[m]?.alloc[e.id] ?? 0;
  const parts = [
    check ? `Allocation virée le ${shortDate(check.doneOn)} vers ${account?.name ?? 'ce compte'}` : `Virement de l’allocation (${money(alloc)}) vers ${account?.name ?? 'ce compte'}`,
    check ? `Montant : ${money(alloc)}` : null,
    `Mode de paiement : ${e.payMode === 'especes' ? 'Espèces' : 'Virtuel'}`,
    account && !account.inBudget ? 'Compte hors budget : le principal n’est pas touché' : null,
  ];
  return parts.filter(Boolean).join('\n');
}

/** Pointage of an envelope's allocation for a month (RG90). */
export const envelopeCheck = (d: BudgetData, m: MonthKey, envelopeId: string): LineCheck | undefined => d.months[m]?.checks?.[envelopeCheckKey(envelopeId)];

/**
 * An envelope's allocation can be checked when the month exists, the allocation is above 0 and the account of
 * the envelope (RG98) is not the main account: on the main account the money simply stays where it is (RG89).
 */
export function isEnvelopePointable(d: BudgetData, m: MonthKey, e: { id: string; payMode?: Line['payMode']; accountId?: string }): boolean {
  const md = d.months[m];
  return !!md?.initialized && (md.alloc[e.id] ?? 0) > 0 && resolveEnvelopeAccountId(d, e) !== mainAccount(d).id;
}

export const lineCheck = (d: BudgetData, m: MonthKey, key: string): LineCheck | undefined => d.months[m]?.checks?.[key];

/**
 * « En retard » (RG19): not checked, with a planned day, from the day after it. In a past month
 * still open, every such line is late. Never on a closed month, a checked line, a line
 * without planned day or in « informatif » mode. `today` is `YYYY-MM-DD`.
 */
export function isLate(d: BudgetData, m: MonthKey, l: Line, today: string): boolean {
  // A variable line out of the budget is entirely informative: never late (spec 0009, RG105).
  if (l.dueDay === undefined || !isPointable(d, l) || !isLineInBudget(d, l) || lineCheck(d, m, l.key) || isMonthLocked(d, m)) return false;
  const cmp = compareMonths(m, today.slice(0, 7));
  if (cmp < 0) return true;
  if (cmp > 0) return false;
  return +today.slice(8, 10) > effectiveDueDay(l.dueDay, m);
}

/** Number of late lines in a month. */
export const lateCount = (d: BudgetData, m: MonthKey, today: string): number => monthLines(d, m).filter(l => isLate(d, m, l, today)).length;

/** Why a date of statement or adjustment is refused (RG32, RG62, RG65). */
export type BalanceDateError = 'invalid' | 'outside' | 'future';

/** Checks a date for month `m`: a real date, in the month, not after `today`. Null = valid. */
export function validateBalanceDate(m: MonthKey, on: string, today: string): BalanceDateError | null {
  if (!isIsoDate(on)) return 'invalid';
  if (on.slice(0, 7) !== m) return 'outside';
  return on > today ? 'future' : null;
}

/** Range of a statement or adjustment date (RG32): the 1st to the last day of the month, never after today. A month in the future gives min > max (nothing possible). */
export function balanceDateBounds(m: MonthKey, today: string): { min: string; max: string } {
  const last = `${m}-${pad2(daysInMonth(m))}`;
  return { min: `${m}-01`, max: last < today ? last : today };
}

/** « Mois compté au réel » or « au pointage » (RG59, RG61): from `settings.pointageStart` on, a month is counted from the checks. */
export type MonthMode = 'real' | 'pointage';

export const monthMode = (d: BudgetData, m: MonthKey): MonthMode => (d.settings.pointageStart !== undefined && compareMonths(m, d.settings.pointageStart) >= 0 ? 'pointage' : 'real');

/**
 * Can the start of the pointage become `start` (null = none)? Refused when it would change the mode of a
 * locked month: those months are frozen (RG61).
 */
export function canSetPointageStart(d: BudgetData, start: MonthKey | null): boolean {
  const next = { ...d, settings: { ...d.settings, pointageStart: start ?? undefined } };
  return Object.keys(d.months).every(k => !d.months[k].initialized || !isMonthLocked(d, k) || monthMode(d, k) === monthMode(next, k));
}

/** Oldest month holding a check, or null. */
export function oldestCheckedMonth(d: BudgetData): MonthKey | null {
  const months = Object.keys(d.months).filter(k => Object.keys(d.months[k].checks ?? {}).length > 0).sort();
  return months[0] ?? null;
}

/** Start and end of a month for an account, from the single starting balance (RG57, RG58). */
export interface MonthBalance {
  start: number;
  end: number;
}

/**
 * Estimated balance of a bank account: the opening balance of the Comptes tab, then month after month
 * start of month = end of the previous one, plus the month's movements (RG58). Same chain as the Ledger
 * (year-close carry-over `bank:<id>` included), the movements coming from the checks instead of the
 * actuals from `pointageStart` on. Null before the account's opening month (RG57).
 */
export function monthBalance(d: BudgetData, m: MonthKey, accountId: string): MonthBalance | null {
  const account = d.accounts.find(a => a.id === accountId);
  if (!account || d.firstMonth === null || compareMonths(m, account.openingMonth) < 0 || compareMonths(m, d.firstMonth) < 0) return null;
  let balance: number | undefined;
  let result: MonthBalance | null = null;
  for (let k = d.firstMonth; compareMonths(k, m) <= 0; k = addMonths(k, 1)) {
    if (compareMonths(k, account.openingMonth) < 0) continue;
    const { year, month } = parseMonth(k);
    const prevClose = month === 0 && isYearClosed(d, year - 1) ? d.closes[year - 1] : null;
    const start = prevClose?.overrides[closeKey('bank', accountId)] ?? (compareMonths(k, account.openingMonth) === 0 ? undefined : balance) ?? account.openingBalance;
    const flow = flowOf(bankMovements(d, accountId, k, monthMode(d, k) === 'pointage' ? 'checks' : 'actual'));
    balance = round2(start + flow.in - flow.out);
    result = { start, end: balance };
  }
  return result;
}

/** One line of the detail of an account: a signed movement, counted or not in the estimated balance. */
export interface Movement {
  /** `YYYY-MM-DD` */
  date: string;
  label: string;
  /** Positive = money in, negative = money out. */
  amount: number;
  kind: BankMovement['kind'];
  /** False for a cancelled adjustment and for a check without effect (month counted at the actuals, RG72). */
  counted: boolean;
  /** Explanation shown next to a movement that is not counted. */
  note?: string;
  lineKey?: string;
  adjustmentId?: string;
  cancelledOn?: string;
  createdOn?: string;
}

export interface PendingLine {
  line: Line;
  /** What the line adds to « Reste à sortir » (or to « Revenus attendus »). */
  amount: number;
  /** `actual`: the actual takes precedence over the budget; `budget`: no actual (RG76, RG86). */
  source: CountedSource;
  late: boolean;
}

export interface AccountPointage {
  account: BankAccount;
  mode: MonthMode;
  /** Start of the month = end of the previous one (RG58); null before the opening month. */
  start: number | null;
  /** End of the month; null before the opening month (« — »). */
  estimated: number | null;
  /** Balance of the Comptes screen for the same month, to show when it differs (RG69). */
  ledgerBalance: number | null;
  /** Statement of the month and its gap with the estimate at the statement date (RG62, RG63). */
  statement: AccountBalanceEntry | null;
  gap: number | null;
  /** All movements of the month sorted by date, including cancelled adjustments (RG66) and checks without effect (RG72). */
  movements: Movement[];
  /** Grey lines of the main account's detail: counterparts ignored because the other account is out of the budget. Never summed (RG101). */
  ignored: IgnoredMovement[];
  inflow: number;
  outflow: number;
  remaining: number;
  /** Estimated − remaining; null before the opening month. */
  margin: number | null;
  pending: PendingLine[];
  /** Income lines of the account not received yet, apart from the estimate and the margin (RG49). */
  expectedLines: PendingLine[];
  expected: number;
}

/** Lines still to pay out of an account, with their weight in « Reste à sortir » (RG12). */
function pendingLines(d: BudgetData, m: MonthKey, accountId: string, today: string): PendingLine[] {
  const out: PendingLine[] = [];
  for (const l of monthLines(d, m)) {
    if (l.block === 'rev' || l.execMode === 'informatif' || payerAccountId(d, l) !== accountId) continue;
    let amount: number;
    let source: CountedSource = 'budget';
    if (l.block === 'var') {
      // A variable line paid from an account out of the budget is informative: it weighs nothing, checked or not (RG105).
      if (!isLineInBudget(d, l)) continue;
      if (isDedicatedVar(d, l)) {
        if (lineCheck(d, m, l.key)) continue;
        amount = l.budget;
      } else {
        amount = Math.max(round2(l.budget - (l.actual ?? 0)), 0);
        if (l.actual !== null) source = 'actual';
      }
    } else {
      if (lineCheck(d, m, l.key)) continue;
      ({ amount, source } = countedAmount(l));
    }
    out.push({ line: l, amount, source, late: isLate(d, m, l, today) });
  }
  return out;
}

/** Income lines of an account not received yet and not « informatif » (RG49). */
function expectedLines(d: BudgetData, m: MonthKey, accountId: string, today: string): PendingLine[] {
  return monthLines(d, m)
    .filter(l => l.block === 'rev' && l.execMode !== 'informatif' && accountIdOf(d, l.accountId) === accountId && !lineCheck(d, m, l.key))
    .map(l => ({ line: l, ...countedAmount(l), late: isLate(d, m, l, today) }));
}

/** Why a counterpart is not counted by the main account (RG101). */
export const IGNORED_REASON = 'compte hors budget, sans effet sur ce compte';

/** A movement the main account does not count because the other side is out of the budget; shown in grey only (spec 0009, RG100). */
export interface IgnoredMovement {
  date: string;
  label: string;
  /** What it would have been for the main account (signed). */
  amount: number;
  reason: string;
}

/**
 * Counterparts that do not touch the main account because the other account is really out of the budget (RG92, RG100):
 * a checked variable line, a checked envelope allocation, an old transfer marked « fait ». Pure and separate from
 * `bankMovements` on purpose: it is never summed, so it cannot change a balance, an entry/exit total, a statement gap
 * or the Ledger (RG101, RG104). Empty for any account but the main one (the out-of-budget account records its own side).
 */
export function ignoredMovements(d: BudgetData, accountId: string, m: MonthKey): IgnoredMovement[] {
  const main = mainAccount(d).id;
  const md = d.months[m];
  if (accountId !== main || !md?.initialized) return [];
  const out: IgnoredMovement[] = [];
  const outOfBudget = (id: string) => id !== main && !isAccountInBudget(d, id);
  const nameOf = (id: string) => d.accounts.find(a => a.id === id)?.name ?? '';
  for (const l of md.lines) {
    const c = md.checks?.[l.key];
    const to = l.block === 'var' && c ? varAccountId(d, l) : null;
    if (c && to && outOfBudget(to) && l.budget !== 0) out.push({ date: c.doneOn, label: `${l.name} → ${nameOf(to)} (pointé)`, amount: -l.budget, reason: IGNORED_REASON });
  }
  for (const e of d.envelopes) {
    const c = md.checks?.[envelopeCheckKey(e.id)];
    const amount = md.alloc[e.id] ?? 0;
    if (c?.accountId && outOfBudget(c.accountId) && amount !== 0) out.push({ date: c.doneOn, label: `Allocation ${e.name} → ${nameOf(c.accountId)} (pointée)`, amount: -amount, reason: IGNORED_REASON });
  }
  for (const t of d.transfers) {
    if (!md.transfersDone[t.id] || t.to?.kind !== 'bank' || t.amount === 0) continue;
    if (t.to.id === main && outOfBudget(t.fromAccountId)) out.push({ date: `${m}-01`, label: `${t.name} (virement)`, amount: t.amount, reason: IGNORED_REASON });
    if (t.fromAccountId === main && outOfBudget(t.to.id)) out.push({ date: `${m}-01`, label: `${t.name} (virement)`, amount: -t.amount, reason: IGNORED_REASON });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Movements shown in the detail of an account for a month (RG28, RG65, RG66, RG72). */
function detailMovements(d: BudgetData, m: MonthKey, accountId: string): Movement[] {
  const mode = monthMode(d, m);
  const active = bankMovements(d, accountId, m, mode === 'pointage' ? 'checks' : 'actual').map((x): Movement => ({ ...x, counted: true }));
  const adjustments = new Map((d.adjustments ?? []).map(a => [a.id, a]));
  for (const x of active) if (x.adjustmentId) Object.assign(x, { createdOn: adjustments.get(x.adjustmentId)?.createdOn });
  const extra: Movement[] = [];
  // Cancelled adjustments stay listed, struck through, and no longer count (RG66).
  for (const a of d.adjustments ?? []) {
    if (a.accountId === accountId && a.cancelledOn && a.date.startsWith(m)) {
      extra.push({ date: a.date, label: a.label, amount: a.amount, kind: 'adjustment', counted: false, adjustmentId: a.id, cancelledOn: a.cancelledOn, createdOn: a.createdOn });
    }
  }
  // In a month counted at the actuals, a check has no effect on the estimate, except the budget sent to a dedicated account, which the Ledger counts (RG72).
  if (mode === 'real') {
    for (const x of bankMovements(d, accountId, m, 'checks')) {
      if (x.kind === 'check' && !x.counterpart) {
        extra.push({ ...x, counted: false, note: 'pointé, sans effet sur le Solde estimé (mois compté au réel)' });
      }
    }
  }
  return [...active, ...extra].sort((a, b) => a.date.localeCompare(b.date));
}

/** Reste à sortir, estimated balance, statement gap and margin of one account for a month (RG11, RG58, RG63). */
export function accountPointage(d: BudgetData, m: MonthKey, accountId: string, today: string, ledger?: Ledger): AccountPointage | null {
  const account = d.accounts.find(a => a.id === accountId);
  if (!account) return null;
  const bal = monthBalance(d, m, accountId);
  const movements = detailMovements(d, m, accountId);
  const counted = movements.filter(x => x.counted);
  const flow = flowOf(counted);
  const pending = pendingLines(d, m, accountId, today);
  const remaining = round2(pending.reduce((s, p) => s + p.amount, 0));
  const estimated = bal ? bal.end : null;
  const statement = d.months[m]?.accountBalances?.[accountId] ?? null;
  const expectedL = expectedLines(d, m, accountId, today);
  // Gap: statement − estimate at the statement date, that day included (RG63).
  let gap: number | null = null;
  if (statement && bal) {
    const upTo = flowOf(counted.filter(x => x.date <= statement.on));
    gap = round2(statement.amount - round2(bal.start + upTo.in - upTo.out));
  }
  return {
    account, mode: monthMode(d, m), start: bal ? bal.start : null, estimated,
    ledgerBalance: ledger?.bankMonth(accountId, m)?.balance ?? null,
    statement, gap,
    movements, ignored: ignoredMovements(d, accountId, m), inflow: flow.in, outflow: flow.out, remaining,
    margin: estimated === null ? null : round2(estimated - remaining), pending,
    expectedLines: expectedL, expected: round2(expectedL.reduce((s, p) => s + p.amount, 0)),
  };
}

/**
 * Accounts shown in the « Pointage par compte » card: the main account, and every other active account that
 * has a line, a statement or a movement in the month. An archived account only shows while lines are attached to it.
 */
export function pointageAccounts(d: BudgetData, m: MonthKey): BankAccount[] {
  const main = mainAccount(d).id;
  const withLine = new Set<string>();
  for (const l of monthLines(d, m)) {
    withLine.add(payerAccountId(d, l));
    if (l.block === 'var') withLine.add(varAccountId(d, l));
  }
  return d.accounts.filter(a => {
    if (withLine.has(a.id)) return true;
    if (a.archived) return false;
    return a.id === main || !!d.months[m]?.accountBalances?.[a.id] || bankMovements(d, a.id, m, monthMode(d, m) === 'pointage' ? 'checks' : 'actual').length > 0;
  });
}
