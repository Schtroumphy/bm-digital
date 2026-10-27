import { CASH_ACCOUNT_ID, accountIdOf, canAssignTo, fixedTransactionAccountId, isEnvelopeAccount } from '../domain/bank';
import { ENVELOPES_ID, canLinkFaces, findCompletable, isEnvelopesPool, pairFaces, tracesOf, type Face } from '../domain/internalTransfers';
import { compareMonths } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import { accountPairKey, fingerprintOf, fullLabelOf, isTransferReceived, normalizeLabel, suggestedPattern, type StatementError, type StatementReading, type StatementRow } from '../domain/statement';
import type { AccountMovement, BankAccount, BudgetData, ImportNature, ImportRule, ImportTarget, ImportTrace, MonthKey, MovementTarget, Transaction } from '../domain/types';
import { balanceDateWarning } from '../domain/balanceRange';
import { bankDateOf, expenseLine, expenseLineAccountId, revenueLine } from '../domain/lineExpenses';
import { syncLineActual } from '../domain/lineActuals';
import { defaultTransferTarget, isValidTransferTarget } from '../domain/transfers';
import { addLine, addTransaction } from './actions';
import { findImportAccountLink, isLinkableAccount, linkedAccountOf, setImportAccountLink } from './accountLinks';

/*
 * Import of the bank's expenses (spec 0013). Pure functions: `prepareImport` turns a read statement into lines to
 * review, `validateImport` writes the chosen lines into the data (like the other use cases, on a copy handed in by the
 * store). Nothing here knows React, Supabase or the file format. Each line has its own account (RG32): the one its
 * (account name, connection name) pair is matched to.
 */

/**
 * `a_qualifier` only exists in the preview: a transfer the user has not yet decided to be internal or external (RG35), never stored.
 * `recu` (in `ImportNature`) is the credit face of an internal transfer, shown « Virement interne »: an entry of money that comes from
 * another of the user's accounts, or from « Enveloppes (global) » (spec 0016, RG1, RG12, RG27). Importable like any other line.
 */
export type LineNature = ImportNature | 'a_qualifier';

/** Target « Nouvelle ligne de revenu »: a revenue line at budget 0 created in the month of attachment when the entry is written (spec 0015, RG9). Never stored in a rule. */
export const NEW_REVENUE_LINE = '+new';

/** Keywords that propose another nature than « Dépense », on whole words of the normalized complete label. Kept short and easy to complete on real examples (RG35). */
const NATURE_KEYWORDS: { pattern: RegExp; nature: LineNature }[] = [
  { pattern: /\bretrait\b/, nature: 'retrait' },
  { pattern: /\bvirement emis\b/, nature: 'a_qualifier' },
];
const natureByKeyword = (row: StatementRow): LineNature | null => {
  const text = normalizeLabel(fullLabelOf(row));
  return NATURE_KEYWORDS.find(k => k.pattern.test(text))?.nature ?? null;
};

export interface PreviewLine {
  /** Position of the row in the file. */
  id: string;
  row: StatementRow;
  /** Pair (account name, connection name) of the file this line belongs to. */
  pairKey: string;
  /** Account of the app the line goes through (RG33); null while its pair is not matched (RG32). */
  accountId: string | null;
  fingerprint: string;
  /** Rank among the lines of the same account and fingerprint (RG21, RG34). */
  rank: number;
  /** (account, fingerprint, rank) already imported: the line is « déjà importée » and locked (RG22, RG82, RG83). */
  duplicate: boolean;
  /** A hand-typed transaction has the same account, amount and day (RG23). */
  similarManual: boolean;
  /** An imported line of the same account, day and amount but another fingerprint; « probable » when the category is the same too (RG37). */
  similarImported: 'semblable' | 'probable' | null;
  /** The label says « virement emis »: possibly a transfer to one of the user's accounts (RG35). */
  transferHint: boolean;
  /** An entry of money whose label speaks of a transfer: informative only, qualifies nothing (RG62). */
  receivedHint: boolean;
  nature: LineNature;
  target: ImportTarget | null;
  /** Month the line is attached to (RG11). */
  month: MonthKey;
  checked: boolean;
  /** Pattern of the rule to remember on validation (RG18); null = no rule. */
  remember: string | null;
  suggestedPattern: string;
  /** Name of the revenue line created by « Nouvelle ligne de revenu » (spec 0015, RG9); empty = the label of the line. */
  newLineName: string;
  /**
   * Withdrawal and internal transfer only (spec 0019, RG14, RG15, CA23): the budget item the transfer stands for. `undefined` = the user has not chosen,
   * the default of the destination applies (`transferAttachment`); `null` = the user chose « aucune ».
   */
  attach?: MovementTarget | null;
  /**
   * The other face of the internal transfer this line belongs to (spec 0016, RG6, RG7): the id of the credit line for a debit and the other way round.
   * `undefined` = not linked (the automatic pairing may link it), `null` = the user unlinked it, no automatic pairing.
   */
  link?: string | null;
  /** Several faces could be its other half: nothing is paired automatically, the user links by hand (RG6). */
  ambiguous?: boolean;
  /** `revenu` only: who paid, free text (RG3). Empty = the label of the line. */
  source?: string;
  /**
   * Dépense (variable or fixed) or revenu only: the savings account the operation is assigned to, outside the budget (spec 0028, RG17). Absent = counted.
   * Not remembered in the import rules, and not part of the fingerprint, the rank nor the deduplication.
   */
  assignedAccountId?: string;
  /** Same kinds of line: marked « hors budget » with no account (spec 0031). Exclusive with `assignedAccountId`. Absent = counted. */
  offBudget?: boolean;
}

/** The two accounts a line of nature « virement » (debit `interne`/`retrait`, credit `recu`) moves money between; null when it is not one or has no target yet. */
export function transferEnds(l: Pick<PreviewLine, 'nature' | 'target' | 'accountId'>): { from: string; to: string } | null {
  if (l.accountId === null || l.target?.kind !== 'account') return null;
  if (l.nature === 'interne' || l.nature === 'retrait') return { from: l.accountId, to: l.target.id };
  if (l.nature === 'recu') return { from: l.target.id, to: l.accountId };
  return null;
}

/**
 * The budget item a withdrawal or internal transfer will be attached to when written: the user's choice when it still fits, else (not chosen) the
 * envelope or the savings/investment line of the destination account (RG15). Null when there is none.
 */
export function transferAttachment(d: BudgetData, l: Pick<PreviewLine, 'nature' | 'target' | 'month' | 'accountId' | 'attach'>): MovementTarget | null {
  const ends = transferEnds(l);
  // « Enveloppes (global) » has no budget item: the global debit replaces the allocations of the month by itself (spec 0016, RG28).
  if (!ends || isEnvelopesPool(ends.from) || isEnvelopesPool(ends.to)) return null;
  const wanted = l.attach === undefined ? defaultTransferTarget(d, l.month, ends.to, ends.from) : l.attach;
  return wanted && isValidTransferTarget(d, l.month, ends.to, wanted) ? wanted : null;
}

/** An account of the file seen in the lines. */
export interface PairInfo {
  key: string;
  accountName: string;
  connectionName: string;
  /** Lines of the file for this pair (debits and entries of money). */
  lines: number;
  /** The pair already had a usable match when the file was opened. The others are listed in the « comptes à rattacher » banner (RG32). */
  known: boolean;
}

/** Match chosen in the preview: an account id, or null for « Ne pas importer ». A pair with no entry is not decided yet. */
export type PairChoices = Record<string, string | null>;

export interface ImportPreview {
  /** Debits and entries of money (credits), the latter listed but never imported (spec 0013, amendment 4). */
  lines: PreviewLine[];
  /** Lines (debits and entries of money) of pairs matched to « Ne pas importer », left out of the preview (RG32). */
  skipped: number;
  pairs: PairInfo[];
  /** Matches chosen in this preview; saved with the import, not before (RG25, RG32). */
  choices: PairChoices;
  errors: StatementError[];
}

/** A line already imported in an earlier session: shown as done, unchecked and locked, it can never be imported again (spec 0013, RG83). */
export const isLocked = (l: PreviewLine): boolean => l.duplicate;

/** An entry of money (credit of the file): a « Revenu » on a revenue line (spec 0015) or a « Virement interne » received from another account (spec 0016). */
export const isIncome = (l: Pick<PreviewLine, 'row'>): boolean => l.row.direction === 'credit';

const NATURE_LABEL: Record<LineNature, string> = { depense: 'Dépense', retrait: 'Retrait', interne: 'Transfert interne', externe: 'Transfert externe', revenu: 'Revenu', a_qualifier: 'À qualifier', recu: 'Virement interne' };
export const natureLabel = (n: LineNature) => NATURE_LABEL[n];

const importKey = (accountId: string, fingerprint: string, rank: number) => `${accountId}\u0001${fingerprint}\u0001${rank}`;
/** Key of « same account, day, amount and sense »: a credit and a debit of the same amount the same day are not alike (spec 0015). */
const dayKey = (accountId: string, date: string, amount: number, credit: boolean) => `${accountId}|${date}|${amount.toFixed(2)}|${credit ? '+' : '-'}`;

/** A month an import can attach a line to: created, not before the first month, not closed (RG13). */
export const isImportMonth = (d: BudgetData, m: MonthKey): boolean =>
  d.firstMonth !== null && compareMonths(m, d.firstMonth) >= 0 && !!d.months[m]?.initialized && !isMonthLocked(d, m);

export const importMonths = (d: BudgetData): MonthKey[] => Object.keys(d.months).filter(m => isImportMonth(d, m)).sort();

/**
 * Accounts offered as the destination of a withdrawal (cash, an envelope's account), of an internal transfer (any other active account, an
 * envelope's included: a transfer paired with the credit of an envelope's account ends there, spec 0016) or as the source of a received transfer
 * (any other active account). « Enveloppes (global) » is not an account: see `canUseEnvelopesPool`.
 */
export function destinationAccounts(d: BudgetData, nature: LineNature, sourceId: string | null): BankAccount[] {
  if (nature === 'retrait') return d.accounts.filter(a => !a.archived && a.id !== sourceId && (a.id === CASH_ACCOUNT_ID || isEnvelopeAccount(a)));
  if (nature === 'interne' || nature === 'recu') return d.accounts.filter(a => !a.archived && a.id !== sourceId);
  return [];
}

/**
 * « Enveloppes (global) » is offered as « Vers » of a debit from any account but an envelope's (RG25) and as « Depuis » of a credit that
 * lands on an envelope's account (RG27).
 */
export function canUseEnvelopesPool(d: BudgetData, nature: LineNature, accountId: string | null): boolean {
  const isEnv = d.accounts.some(a => a.id === accountId && isEnvelopeAccount(a));
  return accountId !== null && (nature === 'interne' ? !isEnv : nature === 'recu' ? isEnv : false);
}

const isExpenseNature = (n: LineNature) => n === 'depense' || n === 'externe';

/** The envelope whose account is `sourceId`, as an expense target; null when the account is not an envelope's. */
function ownEnvelopeTarget(d: BudgetData, sourceId: string | null): ImportTarget | null {
  const e = d.envelopes.find(x => x.accountId === sourceId && d.accounts.some(a => a.id === sourceId && isEnvelopeAccount(a)));
  return e ? { kind: 'env', id: e.id } : null;
}

/** Whether a target is usable for a nature, in a month, for a line of the account `sourceId`. */
export function targetIsValid(d: BudgetData, sourceId: string | null, nature: LineNature, target: ImportTarget | null, month: MonthKey): boolean {
  if (!target || sourceId === null) return false;
  // An entry of money goes to a revenue line of the account of the imported line, or to a new one; never on an envelope's account (spec 0015, RG8).
  if (nature === 'revenu') {
    if (target.kind !== 'line' || ownEnvelopeTarget(d, sourceId)) return false;
    if (target.key === NEW_REVENUE_LINE) return isImportMonth(d, month);
    const line = revenueLine(d, month, target.key);
    return !!line && expenseLineAccountId(d, line) === sourceId;
  }
  if (isExpenseNature(nature)) {
    // A line of an envelope's account can only be spent from that envelope: no variable line on an envelope's account (spec 0011, RG2, RG10).
    const own = ownEnvelopeTarget(d, sourceId);
    if (own) return target.kind === 'env' && own.kind === 'env' && target.id === own.id;
    if (target.kind === 'var') return !!d.months[month]?.lines.some(l => l.block === 'var' && l.key === target.key);
    // A fixed/credit line, only when it is on the account of the imported line (spec 0014, RG3).
    if (target.kind === 'line') {
      const line = expenseLine(d, month, target.key);
      return !!line && expenseLineAccountId(d, line) === sourceId;
    }
    return target.kind === 'env' && d.envelopes.some(e => e.id === target.id);
  }
  if (nature === 'retrait' || nature === 'interne' || nature === 'recu') {
    if (target.kind !== 'account') return false;
    if (isEnvelopesPool(target.id)) return canUseEnvelopesPool(d, nature, sourceId);
    return destinationAccounts(d, nature, sourceId).some(a => a.id === target.id);
  }
  return false;
}

/**
 * Accounts whose balances an imported line would move: the account of the line, the account of the envelope it is spent from, the
 * account of the box of a variable line, or the destination of a movement.
 */
function balanceAccounts(d: BudgetData, l: PreviewLine): string[] {
  if (l.accountId === null || !l.target) return l.accountId === null ? [] : [l.accountId];
  const t = l.target;
  if (t.kind === 'env') return [d.envelopes.find(e => e.id === t.id)?.accountId ?? l.accountId];
  if (t.kind === 'var') return [fixedTransactionAccountId(d, { type: 'var', month: l.month, target: t.key }) ?? l.accountId];
  if (t.kind === 'account') return isEnvelopesPool(t.id) ? [l.accountId] : [l.accountId, t.id];
  return [l.accountId];
}

/** Why the bank date of a line would put it outside the balances (not blocking: the line stays importable), or null (spec 0015, RG6). */
export function lineBalanceWarning(d: BudgetData, l: PreviewLine): string | null {
  for (const id of balanceAccounts(d, l)) {
    const warning = balanceDateWarning(d, id, l.row.date);
    if (warning) return warning;
  }
  return null;
}

/**
 * The line without its assignment to a savings account when it can no longer carry one (spec 0028, RG17): only a variable or fixed expense
 * or a revenue can, not an envelope expense nor a transfer. Applied after every change of nature or target.
 */
export function withValidAssignment(l: PreviewLine): PreviewLine {
  const carries = (l.nature === 'depense' || l.nature === 'externe' ? l.target?.kind === 'var' || l.target?.kind === 'line' : l.nature === 'revenu' && !!l.target);
  if ((l.assignedAccountId === undefined && l.offBudget === undefined) || carries) return l;
  const { assignedAccountId: _a, offBudget: _o, ...rest } = l;
  return rest;
}

/** Why a line cannot be imported yet, or null when it is complete (RG12, RG17, RG32). */
export function lineProblem(d: BudgetData, l: PreviewLine): string | null {
  if (l.accountId === null) return 'Compte à rattacher';
  if (l.nature === 'a_qualifier') return 'À qualifier';
  // A line that completes a transfer already imported only adds its trace to it: its own month does not matter, the month of the transfer does (RG13).
  const completes = completionOf(d, l);
  if (completes) return isMonthLocked(d, completes.month) ? 'Virement d’un mois clos' : null;
  if (!isImportMonth(d, l.month)) return 'Choisir un mois ouvert';
  if (!targetIsValid(d, l.accountId, l.nature, l.target, l.month)) return isExpenseNature(l.nature) || l.nature === 'revenu' ? 'À rattacher' : l.nature === 'recu' ? 'Choisir le compte source' : 'Choisir une destination';
  // The assignment to a savings account (spec 0028): only on a `var`, `fix` or revenue line, to an account that can take it.
  if (l.assignedAccountId && (isExpenseNature(l.nature) || l.nature === 'revenu') && l.target?.kind !== 'env' && !canAssignTo(d, l.nature === 'revenu' ? 'rev' : 'var', balanceAccounts(d, l)[0], l.assignedAccountId)) return 'Compte d’affectation invalide';
  return null;
}

/** The transfer already imported with a single face that this line completes, if it does (spec 0016, RG13). Not for a line linked to another line of the file. */
export function completionOf(d: BudgetData, l: PreviewLine): AccountMovement | null {
  const ends = transferEnds(l);
  if (!ends || l.nature === 'retrait' || l.accountId === null || (l.link !== undefined && l.link !== null) || l.duplicate) return null;
  const credit = l.nature === 'recu';
  return findCompletable(d, { accountId: l.accountId, credit, amount: l.row.amount, date: l.row.date }, credit ? ends.from : ends.to);
}

/** Longest rule whose pattern is in the label and whose target still exists (RG16, RG18). */
function matchingRule(d: BudgetData, sourceId: string, row: StatementRow, month: MonthKey): ImportRule | null {
  const text = normalizeLabel(fullLabelOf(row));
  const credit = row.direction === 'credit';
  const found = (d.importRules ?? [])
    // A rule « Revenu » or « Virement interne » (received) applies to entries of money only, the others to debits only; a rule cannot aim at a new revenue line (spec 0015, RG21).
    .filter(r => r.pattern !== '' && text.includes(r.pattern) && (r.nature === 'revenu' || r.nature === 'recu') === credit && !!r.target && !(r.target.kind === 'line' && r.target.key === NEW_REVENUE_LINE) && targetIsValid(d, sourceId, r.nature, r.target, month))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  return found[0] ?? null;
}

/** Nature and target proposed for a line (RG35, RG16): a remembered rule first, then the keywords, else a plain expense. */
function proposal(d: BudgetData, sourceId: string, row: StatementRow, month: MonthKey): { nature: LineNature; target: ImportTarget | null } {
  const rule = matchingRule(d, sourceId, row, month);
  if (rule) return { nature: rule.nature, target: rule.target ?? null };
  if (row.direction === 'credit') {
    // An entry of money on an envelope's account comes from « Enveloppes (global) » (spec 0016, RG27); otherwise it is a « Revenu » by default,
    // a transfer-like label only adds a hint (spec 0015, RG17, RG18).
    return canUseEnvelopesPool(d, 'recu', sourceId) ? { nature: 'recu', target: { kind: 'account', id: ENVELOPES_ID } } : { nature: 'revenu', target: null };
  }
  const nature = natureByKeyword(row) ?? 'depense';
  if (nature === 'retrait') {
    const cash = destinationAccounts(d, 'retrait', sourceId).find(a => a.id === CASH_ACCOUNT_ID);
    return { nature, target: cash ? { kind: 'account', id: cash.id } : null };
  }
  return { nature, target: nature === 'depense' ? ownEnvelopeTarget(d, sourceId) : null };
}

/** Account a pair goes to: the choice made in the preview, else the stored match. `undefined`: not decided; `null`: not imported. */
function resolveAccount(d: BudgetData, choices: PairChoices, name: string, connection: string): string | null | undefined {
  const key = accountPairKey(name, connection);
  if (key in choices) {
    const c = choices[key];
    return c === null || isLinkableAccount(d, c) ? c : undefined;
  }
  return linkedAccountOf(d, name, connection);
}

/**
 * Lines to review from a read statement. Writes nothing (RG25). `choices` are the matches picked in the preview so far;
 * `previous` are the lines of the preview being redone, whose corrections are kept when the line is unchanged.
 */
export function prepareImport(d: BudgetData, reading: StatementReading, choices: PairChoices = {}, previous: PreviewLine[] = []): ImportPreview {
  const known = new Set<string>();
  const byDay = new Map<string, { fingerprint: string; category?: string }[]>();
  // Every import trace already stored is a key that can serve once: a transaction has one, a transfer up to two (debit face, credit face; spec 0016, RG16).
  const stored: { trace: ImportTrace; amount: number; credit: boolean; category?: string }[] = [
    ...d.transactions.filter(t => t.importAccountId && t.fingerprint).map(t => ({ trace: { importAccountId: t.importAccountId!, fingerprint: t.fingerprint!, rank: t.rank ?? 0, bankDate: bankDateOf(t) }, amount: t.amount, credit: t.type === 'rev', category: t.category })),
    ...(d.accountMovements ?? []).flatMap(mv => tracesOf(mv).map(trace => ({ trace, amount: mv.amount, credit: trace === mv.creditTrace, category: mv.category }))),
  ];
  for (const x of stored) {
    if (x.trace.rank) known.add(importKey(x.trace.importAccountId, x.trace.fingerprint, x.trace.rank));
    const k = dayKey(x.trace.importAccountId, x.trace.bankDate, x.amount, x.credit);
    byDay.set(k, [...(byDay.get(k) ?? []), { fingerprint: x.trace.fingerprint, category: x.category }]);
  }
  const manual = new Set(d.transactions.filter(t => !t.fingerprint).map(t => dayKey(accountIdOf(d, t.accountId), bankDateOf(t), t.amount, t.type === 'rev')));
  const before = new Map(previous.map(l => [l.id, l]));
  // Lines carried over from the previous preview with their corrections: the automatic pairing leaves them as they are (a unlinked or requalified line stays so).
  const carried = new Set<string>();

  const seen = new Map<string, number>();
  const lines: PreviewLine[] = [];
  const pairs = new Map<string, PairInfo>();
  let skipped = 0;

  reading.rows.forEach((row, index) => {
    const pairKey = accountPairKey(row.accountName, row.connectionName);
    const pair = pairs.get(pairKey) ?? { key: pairKey, accountName: row.accountName, connectionName: row.connectionName, lines: 0, known: linkedAccountOf(d, row.accountName, row.connectionName) !== undefined };
    pair.lines++;
    pairs.set(pairKey, pair);
    const resolved = resolveAccount(d, choices, row.accountName, row.connectionName);
    if (resolved === null) {
      skipped++;
      return;
    }
    const accountId = resolved ?? null;
    const fingerprint = fingerprintOf(row);
    const rankKey = `${accountId ?? `pair:${pairKey}`}\u0001${fingerprint}`;
    const rank = (seen.get(rankKey) ?? 0) + 1;
    seen.set(rankKey, rank);
    const month = row.date.slice(0, 7);
    const base = { id: String(index), row, pairKey, accountId, fingerprint, rank, month, remember: null, suggestedPattern: suggestedPattern(row), newLineName: '' };
    const credit = row.direction === 'credit';

    if (accountId === null) {
      lines.push({ ...base, duplicate: false, similarManual: false, similarImported: null, transferHint: false, receivedHint: credit && isTransferReceived(row), nature: credit ? 'revenu' : 'depense', target: null, checked: false });
      return;
    }
    const { nature, target } = proposal(d, accountId, row, month);
    const duplicate = known.has(importKey(accountId, fingerprint, rank));
    const near = (byDay.get(dayKey(accountId, row.date, row.amount, credit)) ?? []).filter(x => x.fingerprint !== fingerprint);
    const fresh: PreviewLine = {
      ...base, duplicate, nature, target,
      similarManual: manual.has(dayKey(accountId, row.date, row.amount, credit)),
      similarImported: near.length === 0 ? null : row.category !== '' && near.some(x => x.category === row.category) ? 'probable' : 'semblable',
      transferHint: nature === 'a_qualifier',
      receivedHint: credit && isTransferReceived(row),
      // An entry is checked only once it has a revenue line (spec 0015, RG18); a received transfer never is.
      checked: credit ? !duplicate && (nature === 'revenu' || nature === 'recu') && target !== null : !duplicate && nature !== 'a_qualifier',
    };
    const old = before.get(fresh.id);
    // The corrections already made on an unchanged line (same account, same rank) are kept.
    // A locked line stays unchecked whatever the old state was (RG83).
    if (old && old.accountId === accountId && old.rank === rank) {
      // Only a line the user touched (or already linked/unlinked) is protected from the automatic pairing; an untouched one may now find its other half.
      if (old.link !== undefined || old.nature !== fresh.nature || old.checked !== fresh.checked || JSON.stringify(old.target) !== JSON.stringify(fresh.target)) carried.add(fresh.id);
      lines.push({ ...fresh, nature: old.nature, target: old.target, month: old.month, checked: old.checked && !duplicate, remember: old.remember, newLineName: old.newLineName, attach: old.attach, link: old.link, ambiguous: old.ambiguous, source: old.source, assignedAccountId: old.assignedAccountId, offBudget: old.offBudget });
    } else lines.push(fresh);
  });
  // Debits and entries of money are listed together, by date (RG59); the sort keeps the file's order for the same day.
  lines.sort((a, b) => a.row.date.localeCompare(b.row.date) || Number(a.id) - Number(b.id));
  return { lines: linkFaces(d, reconcileLinks(lines), carried), skipped, pairs: [...pairs.values()], choices, errors: reading.errors };
}

const faceOf = (l: PreviewLine): Face => ({ id: l.id, accountId: l.accountId!, amount: l.row.amount, date: l.row.date, credit: isIncome(l) });
/** A line that looks like one half of a transfer between two accounts: a debit qualified or worded as a transfer, a credit worded as one or already a received transfer (spec 0016, RG2). */
const looksLikeTransfer = (l: PreviewLine): boolean => (isIncome(l) ? l.receivedHint || l.nature === 'recu' : l.nature === 'interne' || l.nature === 'a_qualifier');

/**
 * Automatic pairing of the lines of a preview (spec 0016, RG6, RG10): a debit and a credit of the same amount on two different accounts, within 3 days,
 * one possible match on each side, at least one of the two looking like a transfer. The pair is proposed « À confirmer »: both lines unchecked, nature
 * « Transfert interne » on the debit and « Virement interne » on the credit. Several candidates: nothing is paired, the lines are `ambiguous`.
 * A line the user already handled (kept from the previous preview) or unlinked is left alone, and so is a line already imported.
 */
function linkFaces(d: BudgetData, lines: PreviewLine[], carried: ReadonlySet<string>): PreviewLine[] {
  const open = lines.filter(l => l.accountId !== null && !l.duplicate && l.link === undefined && !carried.has(l.id) && l.nature !== 'retrait');
  const byId = new Map(open.map(l => [l.id, l]));
  const { pairs, ambiguous } = pairFaces(open.map(faceOf), undefined, (debit, credit) => looksLikeTransfer(byId.get(debit.id)!) || looksLikeTransfer(byId.get(credit.id)!));
  const patch = new Map<string, Partial<PreviewLine>>();
  for (const [debitId, creditId] of pairs) {
    const debit = byId.get(debitId)!;
    const credit = byId.get(creditId)!;
    patch.set(debitId, { nature: 'interne', target: { kind: 'account', id: credit.accountId! }, checked: false, link: creditId, ambiguous: false, transferHint: false });
    patch.set(creditId, { nature: 'recu', target: { kind: 'account', id: debit.accountId! }, checked: false, link: debitId, ambiguous: false });
  }
  for (const id of ambiguous) if (!patch.has(id)) patch.set(id, { ambiguous: true });
  // A line that finishes a transfer imported with one face only is proposed as such (RG13): unchecked until the user confirms.
  for (const l of open) {
    if (patch.has(l.id)) continue;
    const credit = isIncome(l);
    const mv = findCompletable(d, { accountId: l.accountId!, credit, amount: l.row.amount, date: l.row.date });
    if (mv) patch.set(l.id, credit ? { nature: 'recu', target: { kind: 'account', id: mv.fromAccountId }, checked: false } : { nature: 'interne', target: { kind: 'account', id: mv.toAccountId }, checked: false, transferHint: false });
  }
  return lines.map(l => (patch.has(l.id) ? { ...l, ...patch.get(l.id) } : l));
}

/** Whether two lines still make a coherent pair: one debit « Transfert interne » to the account of the credit, one credit « Virement interne » from the account of the debit, same amount (RG10). */
function coherentPair(a: PreviewLine, b: PreviewLine): boolean {
  const [debit, credit] = isIncome(a) ? [b, a] : [a, b];
  return !isIncome(debit) && isIncome(credit) && a.link === b.id && b.link === a.id && debit.nature === 'interne' && credit.nature === 'recu' &&
    debit.target?.kind === 'account' && debit.target.id === credit.accountId && credit.target?.kind === 'account' && credit.target.id === debit.accountId &&
    debit.accountId !== credit.accountId && round2Eq(debit.row.amount, credit.row.amount);
}
const round2Eq = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Links that no longer make a coherent pair are cut on both lines (a nature or an account was changed by hand): the two lines become independent, to qualify (RG9). */
export function reconcileLinks(lines: PreviewLine[]): PreviewLine[] {
  const byId = new Map(lines.map(l => [l.id, l]));
  return lines.map(l => {
    if (l.link === undefined || l.link === null) return l;
    const other = byId.get(l.link);
    return other && coherentPair(l, other) ? l : { ...l, link: null };
  });
}

/** The partner of a linked line, when the two still make a pair. */
export function linkedPartner(lines: PreviewLine[], l: PreviewLine): PreviewLine | undefined {
  const other = l.link ? lines.find(x => x.id === l.link) : undefined;
  return other && coherentPair(l, other) ? other : undefined;
}

/**
 * The lines after the line `id` was edited: the pair follows (spec 0016, RG7). Checking, unchecking and the month of the attachment are copied to the other
 * face; if the edit broke the pair (another nature or account), the two lines are unlinked.
 */
export function syncLinked(d: BudgetData, lines: PreviewLine[], id: string): PreviewLine[] {
  const settled = reconcileLinks(lines);
  const l = settled.find(x => x.id === id);
  const partner = l && linkedPartner(settled, l);
  if (!l || !partner) return settled;
  return settled.map(x => (x.id === partner.id ? { ...changeMonth(d, x, l.month), checked: l.checked } : x));
}

/** Credits that can be linked by hand to a debit (RG9): same rule as the automatic pairing, minus the « looks like a transfer » condition; an already linked line is exclusive. */
export function linkCandidates(lines: PreviewLine[], debitId: string): PreviewLine[] {
  const debit = lines.find(l => l.id === debitId);
  if (!debit || isIncome(debit) || debit.accountId === null || debit.duplicate) return [];
  return lines.filter(c => isIncome(c) && c.accountId !== null && !c.duplicate && !linkedPartner(lines, c) && canLinkFaces(faceOf(debit), faceOf(c)));
}

/** Links a debit to a credit by hand (RG9). Null when they cannot be linked (different amounts, same account, a face already linked...). The pair is unchecked, to confirm. */
export function linkLines(d: BudgetData, lines: PreviewLine[], debitId: string, creditId: string): PreviewLine[] | null {
  const debit = lines.find(l => l.id === debitId);
  const credit = lines.find(l => l.id === creditId);
  if (!debit || !credit || linkedPartner(lines, debit) || linkedPartner(lines, credit) || !linkCandidates(lines, debitId).some(c => c.id === creditId)) return null;
  const month = debit.month;
  return lines.map(l =>
    l.id === debitId ? { ...l, nature: 'interne', target: { kind: 'account', id: credit.accountId! }, checked: false, link: creditId, ambiguous: false, transferHint: false }
    : l.id === creditId ? { ...changeMonth(d, l, month), nature: 'recu', target: { kind: 'account', id: debit.accountId! }, checked: false, link: debitId, ambiguous: false }
    : l,
  );
}

/** Unlinks a pair (RG9): the two lines become independent and are not paired again automatically. */
export function unlinkLine(lines: PreviewLine[], id: string): PreviewLine[] {
  const l = lines.find(x => x.id === id);
  const partner = l && linkedPartner(lines, l);
  return lines.map(x => (x.id === id || x.id === partner?.id ? { ...x, link: null, checked: false } : x));
}

/**
 * The preview redone with the matches as they are now, after the list « Correspondances de comptes » was used (spec 0013, RG43).
 * A pair that now has a stored match uses it and drops its undecided choice; the corrections of the lines whose account and rank
 * did not change are kept, the others start from the default proposals.
 */
export function refreshPreview(d: BudgetData, reading: StatementReading, preview: ImportPreview): ImportPreview {
  const choices = Object.fromEntries(
    Object.entries(preview.choices).filter(([key]) => {
      const pair = preview.pairs.find(p => p.key === key);
      return !pair || linkedAccountOf(d, pair.accountName, pair.connectionName) === undefined;
    }),
  );
  return prepareImport(d, reading, choices, preview.lines);
}

/** The same file with the match of one pair chosen (an account id, or null for « Ne pas importer »): lines are redone, other corrections kept. */
export function choosePairAccount(d: BudgetData, reading: StatementReading, preview: ImportPreview, pairKey: string, accountId: string | null): ImportPreview {
  return prepareImport(d, reading, { ...preview.choices, [pairKey]: accountId }, preview.lines);
}

/** Natures offered in the selector of a line: « Revenu » / « Virement interne » for an entry of money, the debit natures otherwise (« À qualifier » only while the line is in that state). Always the same set, whatever the current nature, so a choice can be undone (spec 0015, RG19; spec 0016, RG1). */
export function natureOptions(l: Pick<PreviewLine, 'row' | 'nature'>): LineNature[] {
  if (isIncome(l)) return ['revenu', 'recu'];
  return (['depense', 'retrait', 'interne', 'externe', 'a_qualifier'] as const).filter(n => n !== 'a_qualifier' || l.nature === 'a_qualifier');
}

/** The line with another nature: the target is kept only if it still fits, a withdrawal goes to cash by default (RG35), an expense of an envelope's account goes to that envelope. */
export function changeNature(d: BudgetData, l: PreviewLine, nature: LineNature): PreviewLine {
  // An entry of money is a revenue or a received transfer, a debit never is (spec 0015, RG17).
  if (isIncome(l) ? nature !== 'revenu' && nature !== 'recu' : nature === 'revenu' || nature === 'recu') return l;
  let target = targetIsValid(d, l.accountId, nature, l.target, l.month) ? l.target : null;
  // A credit on an envelope's account comes from « Enveloppes (global) » by default (spec 0016, RG27).
  if (nature === 'recu' && !target && canUseEnvelopesPool(d, 'recu', l.accountId)) target = { kind: 'account', id: ENVELOPES_ID };
  if (!target && (nature === 'depense' || nature === 'externe')) target = ownEnvelopeTarget(d, l.accountId);
  if (nature === 'retrait' && !target && l.accountId !== null) {
    const cash = destinationAccounts(d, nature, l.accountId).find(a => a.id === CASH_ACCOUNT_ID);
    target = cash ? { kind: 'account', id: cash.id } : null;
  }
  return { ...l, nature, target, remember: target ? l.remember : null, checked: nature === 'recu' && !target ? false : l.checked };
}

/** The line attached to another month: a `var` line is kept if the month has it too (RG11). */
export function changeMonth(d: BudgetData, l: PreviewLine, month: MonthKey): PreviewLine {
  return { ...l, month, target: targetIsValid(d, l.accountId, l.nature, l.target, month) ? l.target : null };
}

export interface PreviewCounts {
  /** Checked and complete: what « Importer N lignes » will write. */
  toImport: number;
  duplicates: number;
  /** Lines with no account, target, destination, nature or month yet (checked or not). */
  incomplete: number;
  /** Pairs of the banner with no match chosen yet (RG32). */
  pairsToLink: number;
  /** Entries of money listed in the preview (revenues and received transfers). */
  incomes: number;
}

/** What the session already did, and what it leaves aside: lines imported earlier, and accounts marked « traité » (spec 0013, RG71, RG72). */
export interface ImportScope {
  /** Ids of the lines imported during this session. */
  done?: ReadonlySet<string>;
  /** Pair keys of the accounts the user marked as handled: their lines are not imported nor counted as « à compléter » (RG72). */
  marked?: ReadonlySet<string>;
}

/** Ids of the lines an import would write: checked, complete, not already imported (before or in the session), not in a marked account (RG68, RG77). */
export function importableIds(d: BudgetData, preview: ImportPreview, scope: ImportScope = {}): Set<string> {
  const ready = new Set(preview.lines.filter(l => l.checked && !isLocked(l) && !lineProblem(d, l) && !scope.done?.has(l.id) && !scope.marked?.has(l.pairKey)).map(l => l.id));
  // A linked pair is written whole or not at all (spec 0016, RG7): a face whose partner is not ready is not ready either.
  return new Set([...ready].filter(id => {
    const partner = linkedPartner(preview.lines, preview.lines.find(l => l.id === id)!);
    return !partner || ready.has(partner.id);
  }));
}

/** The ids plus the other face of every linked line among them, even when a filter hides it: a pair is imported together (spec 0016, RG7). */
export function withLinkedPartners(lines: PreviewLine[], ids: ReadonlySet<string>): Set<string> {
  const out = new Set(ids);
  for (const l of lines) if (ids.has(l.id)) {
    const partner = linkedPartner(lines, l);
    if (partner) out.add(partner.id);
  }
  return out;
}

export function previewCounts(d: BudgetData, preview: ImportPreview, scope: ImportScope = {}): PreviewCounts {
  const open = preview.lines.filter(l => !scope.done?.has(l.id));
  return {
    toImport: importableIds(d, preview, scope).size,
    duplicates: open.filter(l => l.duplicate).length,
    incomplete: open.filter(l => !isLocked(l) && !scope.marked?.has(l.pairKey) && lineProblem(d, l)).length,
    incomes: preview.lines.filter(isIncome).length,
    pairsToLink: preview.pairs.filter(p => !p.known && !(p.key in preview.choices)).length,
  };
}

/** Progress of one account of the file: what is left to do on it (RG71). */
export interface AccountProgress {
  imported: number;
  /** Already imported before: the locked lines (RG83, RG87). */
  alreadyImported: number;
  remaining: number;
  /** Nothing left to do: every debit line is imported here or before. A file account with no debit line is not « traité ». */
  treated: boolean;
}

export function accountProgress(preview: ImportPreview, pairKey: string, done: ReadonlySet<string> = new Set()): AccountProgress {
  const debits = preview.lines.filter(l => l.pairKey === pairKey);
  const imported = debits.filter(l => done.has(l.id)).length;
  const alreadyImported = debits.filter(l => !done.has(l.id) && isLocked(l)).length;
  const remaining = debits.length - imported - alreadyImported;
  return { imported, alreadyImported, remaining, treated: debits.length > 0 && remaining === 0 };
}

/** What a batch wrote. `failedIds` are lines the budget refused: they are not marked imported (RG76). */
export interface ImportBatch {
  /** Lines written whose bank date puts them outside the balances (warned in the preview, spec 0015). */
  outsideBalances: number;
  expenses: number;
  /** Entries of money written as revenues (spec 0015). */
  revenues: number;
  withdrawals: number;
  /** Internal transfers written (one per pair, whatever its faces), « Enveloppes (global) » debits left out (spec 0016, RG21). */
  internalTransfers: number;
  /** Of which written from both faces at once (« Lié »). */
  linkedTransfers: number;
  /** Debits written « vers enveloppes » (RG30). */
  envelopeTransfers: number;
  /** Lines that only added their trace to a transfer already imported (« Complète le virement », RG13): no new entry. */
  completedFaces: number;
  importedIds: string[];
  failedIds: string[];
}

export interface ImportSummary {
  /** Imported lines whose bank date is outside the balances. */
  outsideBalances: number;
  expenses: number;
  revenues: number;
  withdrawals: number;
  internalTransfers: number;
  linkedTransfers: number;
  envelopeTransfers: number;
  completedFaces: number;
  /** Lines already imported before, not imported again (« Déjà importées », RG87). */
  duplicatesSkipped: number;
  /** Lines of accounts matched to « Ne pas importer » (RG32). */
  accountsSkipped: number;
  /** Lines unchecked by the user, or checked but still incomplete; locked lines are not in it (RG87). */
  leftOut: number;
  /** Unreadable records, and lines the budget refused to record. */
  errors: number;
}

export interface SessionTotals {
  /** Written lines outside the balances (optional: absent = 0). */
  outsideBalances?: number;
  expenses: number;
  revenues: number;
  withdrawals: number;
  internalTransfers: number;
  linkedTransfers?: number;
  envelopeTransfers?: number;
  completedFaces?: number;
}

/**
 * Summary of the whole session (RG80): what the batches wrote, then what is left aside at the time of finishing. A line imported
 * is counted once; a line the budget refused and that is still not imported counts as an error.
 */
export function sessionSummary(preview: ImportPreview, totals: SessionTotals, done: ReadonlySet<string>, failed: ReadonlySet<string> = new Set()): ImportSummary {
  const open = preview.lines.filter(l => !done.has(l.id));
  return {
    outsideBalances: totals.outsideBalances ?? 0,
    expenses: totals.expenses,
    revenues: totals.revenues,
    withdrawals: totals.withdrawals,
    internalTransfers: totals.internalTransfers,
    linkedTransfers: totals.linkedTransfers ?? 0,
    envelopeTransfers: totals.envelopeTransfers ?? 0,
    completedFaces: totals.completedFaces ?? 0,
    duplicatesSkipped: open.filter(isLocked).length,
    accountsSkipped: preview.skipped,
    leftOut: open.filter(l => !isLocked(l)).length,
    errors: preview.errors.length + open.filter(l => failed.has(l.id)).length,
  };
}

export interface ImportOptions {
  /** Only these lines are written (the lines shown, for example, RG68). Absent = every checked, complete line. */
  ids?: ReadonlySet<string>;
  /** Lines already imported during the session: never written again (RG77). */
  done?: ReadonlySet<string>;
  /** Accounts marked « traité »: their lines are left alone (RG72). */
  marked?: ReadonlySet<string>;
}

/**
 * Writes the chosen lines: `Transaction`s for expenses and external transfers, `AccountMovement`s for withdrawals and internal
 * transfers (RG26), the remembered rules of the lines written (RG18, RG74) and the account matches of the pairs that had a line
 * written (RG74). A line already imported in the session, or whose (account, fingerprint, rank) is already stored,
 * is skipped, so a replayed batch writes nothing more (RG77). A line already imported (`duplicate`) is never written, even
 * when it arrives checked: there is no forced duplicate any more (RG85), so the uniqueness (account, fingerprint, rank)
 * holds (ADR 0010). A `var` expense goes on the account assigned to its
 * box when there is one (spec 0006), else on the account of its line (ADR 0012).
 */
export function validateImport(d: BudgetData, preview: ImportPreview, newId: (prefix: string) => string, options: ImportOptions = {}): ImportBatch {
  // (account, fingerprint, rank) already stored, on either face of a transfer: a line with the same key is skipped (RG77; spec 0016, RG16).
  const usedKey = (accountId: string, fingerprint: string, rank: number) => `${accountId}\u0001${fingerprint}\u0001${rank}`;
  const used = new Set<string>();
  for (const x of d.transactions) if (x.importAccountId && x.fingerprint && x.rank) used.add(usedKey(x.importAccountId, x.fingerprint, x.rank));
  for (const mv of d.accountMovements ?? []) for (const t of tracesOf(mv)) used.add(usedKey(t.importAccountId, t.fingerprint, t.rank));

  // A face asked for brings its linked partner, even one the caller left out (hidden by a filter, for example).
  const wanted = options.ids && withLinkedPartners(preview.lines, options.ids);
  const chosen = preview.lines.filter(
    l =>
      l.checked && !isLocked(l) && !lineProblem(d, l) && (!wanted || wanted.has(l.id)) && !options.done?.has(l.id) && !options.marked?.has(l.pairKey) &&
      !used.has(usedKey(l.accountId!, l.fingerprint, l.rank)),
  );
  const chosenIds = new Set(chosen.map(l => l.id));
  const batch: ImportBatch = { outsideBalances: 0, expenses: 0, revenues: 0, withdrawals: 0, internalTransfers: 0, linkedTransfers: 0, envelopeTransfers: 0, completedFaces: 0, importedIds: [], failedIds: [] };
  const assignment = (l: PreviewLine) => (l.assignedAccountId ? { assignedAccountId: l.assignedAccountId } : l.offBudget ? { offBudget: true as const } : {});
  const traceOf = (l: PreviewLine): ImportTrace => ({ importAccountId: l.accountId!, fingerprint: l.fingerprint, rank: l.rank, bankDate: l.row.date });

  const imported: PreviewLine[] = [];
  const handled = new Set<string>();
  // Lines that complete an existing one-face transfer, known before the batch: two identical lines cannot complete the same transfer.
  const completing = new Set(chosen.filter(l => completionOf(d, l) !== null).map(l => l.id));
  for (const l of chosen) {
    if (handled.has(l.id)) continue;
    const sourceId = l.accountId!;
    const base = {
      month: l.month, day: Number(l.row.date.slice(8, 10)), label: l.row.label, amount: l.row.amount,
      importAccountId: sourceId, fingerprint: l.fingerprint, rank: l.rank, bankDate: l.row.date, ...(l.row.category ? { category: l.row.category } : {}),
    };
    const t = l.target!;
    const targetId = t.kind === 'var' || t.kind === 'line' ? t.key : t.id;
    if (l.nature === 'revenu') {
      // « Nouvelle ligne de revenu »: a revenue line at budget 0, in the month of attachment only, on the account of the line (spec 0015, RG9).
      let key = targetId;
      let created = false;
      if (targetId === NEW_REVENUE_LINE) {
        key = newId('l');
        if (!addLine(d, l.month, 'rev', key)) {
          batch.failedIds.push(l.id);
          continue;
        }
        const line = d.months[l.month].lines.find(x => x.key === key)!;
        Object.assign(line, { name: l.newLineName.trim() || l.row.label, accountId: sourceId });
        created = true;
      }
      // Who paid (spec 0016, RG3): the typed source, else the label of the line; information only.
      const source = (l.source ?? '').trim() || l.row.label;
      const tx: Transaction = { id: newId('t'), ...base, type: 'rev', target: key, accountId: sourceId, source, ...assignment(l) };
      if (addTransaction(d, tx)) {
        batch.revenues++;
        imported.push(l);
      } else {
        if (created) d.months[l.month].lines = d.months[l.month].lines.filter(x => x.key !== key);
        batch.failedIds.push(l.id);
      }
    } else if (isExpenseNature(l.nature)) {
      const tx: Transaction =
        t.kind === 'var'
          ? { id: newId('t'), ...base, type: 'var', target: targetId, accountId: fixedTransactionAccountId(d, { type: 'var', month: l.month, target: targetId }) ?? sourceId, ...assignment(l) }
          : t.kind === 'line'
            ? { id: newId('t'), ...base, type: 'fix', target: targetId, accountId: sourceId, ...assignment(l) }
            : { id: newId('t'), ...base, type: 'env', target: targetId };
      if (addTransaction(d, tx)) {
        batch.expenses++;
        imported.push(l);
      } else {
        // Defensive: a month that cannot take the line is already caught by `lineProblem` (« Choisir un mois ouvert », RG76), so the
        // budget refusing a complete line should not happen. If it does, the line is not marked imported and is counted as an error.
        batch.failedIds.push(l.id);
      }
    } else {
      // A transfer: withdrawal, internal transfer (debit face), received transfer (credit face).
      const partner = linkedPartner(preview.lines, l);
      if (partner) {
        // A linked pair is written whole or not at all (spec 0016, RG7): both faces must be chosen.
        if (!chosenIds.has(partner.id) || handled.has(partner.id)) continue;
        const [debit, credit] = isIncome(l) ? [partner, l] : [l, partner];
        const attach = transferAttachment(d, debit);
        const category = debit.row.category || credit.row.category;
        const mv: AccountMovement = {
          id: newId('m'), month: debit.month, day: Number(debit.row.date.slice(8, 10)), label: debit.row.label, amount: debit.row.amount,
          fromAccountId: debit.accountId!, toAccountId: credit.accountId!, ...traceOf(debit), creditTrace: traceOf(credit), ...(category ? { category } : {}), ...(attach ? { target: attach } : {}),
        };
        (d.accountMovements ??= []).push(mv);
        if (attach?.kind === 'line') syncLineActual(d, debit.month, attach.key);
        batch.internalTransfers++;
        batch.linkedTransfers++;
        handled.add(partner.id);
        imported.push(l, partner);
        continue;
      }
      const completes = completionOf(d, l);
      if (!completes && completing.has(l.id)) {
        // The transfer it should complete was completed by an identical line of this batch: no second, credit-only transfer.
        batch.failedIds.push(l.id);
        continue;
      }
      if (completes) {
        // The other face is already imported: this line only adds its trace, no new entry (spec 0016, RG13).
        if (l.nature === 'recu') completes.creditTrace = traceOf(l);
        else Object.assign(completes, traceOf(l));
        if (l.row.category && !completes.category) completes.category = l.row.category;
        batch.completedFaces++;
        imported.push(l);
        continue;
      }
      const attach = transferAttachment(d, l);
      const mv: AccountMovement =
        l.nature === 'recu'
          // Credit face alone: the movement has no debit trace; its date is that of the credit (RG12, RG14).
          ? { id: newId('m'), month: l.month, day: base.day, label: l.row.label, amount: l.row.amount, fromAccountId: targetId, toAccountId: sourceId, bankDate: l.row.date, creditTrace: traceOf(l), ...(l.row.category ? { category: l.row.category } : {}), ...(attach ? { target: attach } : {}) }
          : { id: newId('m'), ...base, fromAccountId: sourceId, toAccountId: targetId, ...(attach ? { target: attach } : {}) };
      (d.accountMovements ??= []).push(mv);
      if (attach?.kind === 'line') syncLineActual(d, l.month, attach.key);
      if (l.nature === 'retrait') batch.withdrawals++;
      else if (isEnvelopesPool(mv.toAccountId)) batch.envelopeTransfers++;
      else batch.internalTransfers++;
      imported.push(l);
    }
  }
  batch.importedIds = imported.map(l => l.id);
  batch.outsideBalances = imported.filter(l => lineBalanceWarning(d, l) !== null).length;

  for (const l of imported) if (l.remember !== null && !(l.target?.kind === 'line' && l.target.key === NEW_REVENUE_LINE)) rememberRule(d, l.remember, l.nature as ImportNature, l.target ?? undefined, newId);
  // A match with an account, chosen in the banner, is written only if a line of that pair was written (RG74).
  const importedPairs = new Set(imported.map(l => l.pairKey));
  for (const p of preview.pairs) {
    const choice = preview.choices[p.key];
    if (importedPairs.has(p.key) && typeof choice === 'string') setImportAccountLink(d, p.accountName, p.connectionName, choice, newId);
  }
  // A « Ne pas importer » choice has no line to import: it is remembered as soon as a batch wrote something (RG74).
  if (imported.length > 0) saveSkipChoices(d, preview, newId);
  return batch;
}

/** Remembers the « Ne pas importer » choices made in the banner (matches without an account). Done with the first batch and when finishing (RG74). */
export function saveSkipChoices(d: BudgetData, preview: ImportPreview, newId: (prefix: string) => string) {
  for (const p of preview.pairs) if (p.key in preview.choices && preview.choices[p.key] === null) setImportAccountLink(d, p.accountName, p.connectionName, null, newId);
}

/**
 * Whether the user has corrections that closing would lose (RG79): a line not imported whose nature, target, month, check or rule
 * differs from what the file proposes, or a choice of the banner that is not saved.
 */
export function hasPendingCorrections(d: BudgetData, reading: StatementReading, preview: ImportPreview, done: ReadonlySet<string> = new Set()): boolean {
  // A choice of the banner counts while it is not stored: an account choice is stored with the first line of its pair, a « Ne pas importer » with the first batch (RG74).
  const unsavedChoice = preview.pairs.some(p => p.key in preview.choices && findImportAccountLink(d, p.accountName, p.connectionName)?.accountId !== preview.choices[p.key]);
  if (unsavedChoice) return true;
  const fresh = new Map(prepareImport(d, reading, preview.choices).lines.map(l => [l.id, l]));
  return preview.lines.some(l => {
    if (done.has(l.id)) return false;
    const f = fresh.get(l.id);
    return !!f && (f.nature !== l.nature || f.month !== l.month || f.checked !== l.checked || l.remember !== null || f.link !== l.link || JSON.stringify(f.target) !== JSON.stringify(l.target));
  });
}

/** Adds the rule, or updates the one with the same pattern (RG18). An empty pattern remembers nothing. */
export function rememberRule(d: BudgetData, pattern: string, nature: ImportNature, target: ImportTarget | undefined, newId: (prefix: string) => string) {
  const p = normalizeLabel(pattern);
  if (!p) return;
  const rules = (d.importRules ??= []);
  const same = rules.find(r => r.pattern === p);
  if (same) {
    same.nature = nature;
    if (target) same.target = target;
    else delete same.target;
  } else rules.push({ id: newId('r'), pattern: p, nature, ...(target ? { target } : {}) });
}
