import { CASH_ACCOUNT_ID, accountIdOf, activeBankAccounts, fixedTransactionAccountId, isEnvelopeAccount } from '../domain/bank';
import { compareMonths } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import { accountPairKey, fingerprintOf, fullLabelOf, isTransferReceived, normalizeLabel, suggestedPattern, type StatementError, type StatementReading, type StatementRow } from '../domain/statement';
import type { AccountMovement, BankAccount, BudgetData, ImportNature, ImportRule, ImportTarget, MonthKey, Transaction } from '../domain/types';
import { balanceDateWarning } from '../domain/balanceRange';
import { actualReplacedBy, bankDateOf, expenseLine, expenseLineAccountId, revenueLine } from '../domain/lineExpenses';
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
 * `recu` (in `ImportNature`) is a transfer received from another of the user's accounts: chosen by hand, never proposed by the
 * heuristic, never imported, only remembered as a rule (spec 0015, RG19).
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
  /** (account, fingerprint, rank) already imported (RG22). */
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

/** An entry of money (credit of the file). It is imported only as a « Revenu » on a revenue line (spec 0015); a received transfer is never imported. */
export const isIncome = (l: Pick<PreviewLine, 'row'>): boolean => l.row.direction === 'credit';

/** A line that can never be imported: a transfer received from another account (spec 0015, RG17, RG19). */
export const isReceivedTransfer = (l: Pick<PreviewLine, 'nature'>): boolean => l.nature === 'recu';

const NATURE_LABEL: Record<LineNature, string> = { depense: 'Dépense', retrait: 'Retrait', interne: 'Transfert interne', externe: 'Transfert externe', revenu: 'Revenu', a_qualifier: 'À qualifier', recu: 'Virement reçu' };
export const natureLabel = (n: LineNature) => NATURE_LABEL[n];

const importKey = (accountId: string, fingerprint: string, rank: number) => `${accountId}\u0001${fingerprint}\u0001${rank}`;
/** Key of « same account, day, amount and sense »: a credit and a debit of the same amount the same day are not alike (spec 0015). */
const dayKey = (accountId: string, date: string, amount: number, credit: boolean) => `${accountId}|${date}|${amount.toFixed(2)}|${credit ? '+' : '-'}`;

/** A month an import can attach a line to: created, not before the first month, not closed (RG13). */
export const isImportMonth = (d: BudgetData, m: MonthKey): boolean =>
  d.firstMonth !== null && compareMonths(m, d.firstMonth) >= 0 && !!d.months[m]?.initialized && !isMonthLocked(d, m);

export const importMonths = (d: BudgetData): MonthKey[] => Object.keys(d.months).filter(m => isImportMonth(d, m)).sort();

/** Accounts offered as the destination of a withdrawal (cash, an envelope's account) or of an internal transfer (any other active account) (RG10a). */
export function destinationAccounts(d: BudgetData, nature: LineNature, sourceId: string | null): BankAccount[] {
  if (nature === 'retrait') return d.accounts.filter(a => !a.archived && a.id !== sourceId && (a.id === CASH_ACCOUNT_ID || isEnvelopeAccount(a)));
  if (nature === 'interne') return activeBankAccounts(d).filter(a => a.id !== sourceId);
  return [];
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
  if (nature === 'retrait' || nature === 'interne') {
    return target.kind === 'account' && destinationAccounts(d, nature, sourceId).some(a => a.id === target.id);
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
  if (t.kind === 'account') return [l.accountId, t.id];
  return [l.accountId];
}

/** Why the bank date of a line would put it outside the balances (not blocking: the line stays importable), or null (spec 0015, RG6). */
export function lineBalanceWarning(d: BudgetData, l: PreviewLine): string | null {
  if (isReceivedTransfer(l)) return null;
  for (const id of balanceAccounts(d, l)) {
    const warning = balanceDateWarning(d, id, l.row.date);
    if (warning) return warning;
  }
  return null;
}

/** Why a line cannot be imported yet, or null when it is complete (RG12, RG17, RG32). */
export function lineProblem(d: BudgetData, l: PreviewLine): string | null {
  if (l.accountId === null) return 'Compte à rattacher';
  if (l.nature === 'recu') return 'Virement reçu'; // shown, never imported (spec 0015, RG17)
  if (l.nature === 'a_qualifier') return 'À qualifier';
  if (!isImportMonth(d, l.month)) return 'Choisir un mois ouvert';
  if (!targetIsValid(d, l.accountId, l.nature, l.target, l.month)) return isExpenseNature(l.nature) || l.nature === 'revenu' ? 'À rattacher' : 'Choisir une destination';
  return null;
}

/** Longest rule whose pattern is in the label and whose target still exists (RG16, RG18). */
function matchingRule(d: BudgetData, sourceId: string, row: StatementRow, month: MonthKey): ImportRule | null {
  const text = normalizeLabel(fullLabelOf(row));
  const credit = row.direction === 'credit';
  const found = (d.importRules ?? [])
    // A rule « Revenu » applies to entries of money only, the others to debits only; a rule cannot aim at a new revenue line (spec 0015, RG21).
    .filter(r => r.pattern !== '' && text.includes(r.pattern) && (r.nature === 'revenu' || r.nature === 'recu') === credit && (r.nature === 'recu' ? !r.target : !!r.target && !(r.target.kind === 'line' && r.target.key === NEW_REVENUE_LINE) && targetIsValid(d, sourceId, r.nature, r.target, month)))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  return found[0] ?? null;
}

/** Nature and target proposed for a line (RG35, RG16): a remembered rule first, then the keywords, else a plain expense. */
function proposal(d: BudgetData, sourceId: string, row: StatementRow, month: MonthKey): { nature: LineNature; target: ImportTarget | null } {
  const rule = matchingRule(d, sourceId, row, month);
  if (rule) return { nature: rule.nature, target: rule.target ?? null };
  // An entry of money is a « Revenu » by default, a transfer-like label only adds a hint (spec 0015, RG17, RG18).
  if (row.direction === 'credit') return { nature: 'revenu', target: null };
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
  const imported = [...d.transactions, ...(d.accountMovements ?? [])].filter(x => x.importAccountId && x.fingerprint);
  const known = new Set<string>();
  const byDay = new Map<string, { fingerprint: string; category?: string }[]>();
  for (const x of imported) {
    if (x.rank) known.add(importKey(x.importAccountId!, x.fingerprint!, x.rank));
    const k = dayKey(x.importAccountId!, bankDateOf(x), x.amount, 'type' in x && x.type === 'rev');
    byDay.set(k, [...(byDay.get(k) ?? []), { fingerprint: x.fingerprint!, category: x.category }]);
  }
  const manual = new Set(d.transactions.filter(t => !t.fingerprint).map(t => dayKey(accountIdOf(d, t.accountId), bankDateOf(t), t.amount, t.type === 'rev')));
  const before = new Map(previous.map(l => [l.id, l]));

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
      checked: credit ? !duplicate && nature === 'revenu' && target !== null : !duplicate && nature !== 'a_qualifier',
    };
    const old = before.get(fresh.id);
    // The corrections already made on an unchanged line (same account, same rank) are kept.
    lines.push(old && old.accountId === accountId && old.rank === rank ? { ...fresh, nature: old.nature, target: old.target, month: old.month, checked: old.checked, remember: old.remember, newLineName: old.newLineName } : fresh);
  });
  // Debits and entries of money are listed together, by date (RG59); the sort keeps the file's order for the same day.
  lines.sort((a, b) => a.row.date.localeCompare(b.row.date) || Number(a.id) - Number(b.id));
  return { lines, skipped, pairs: [...pairs.values()], choices, errors: reading.errors };
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

/** Natures offered in the selector of a line: « Revenu » / « Virement reçu » for an entry of money, the debit natures otherwise (« À qualifier » only while the line is in that state). Always the same set, whatever the current nature, so a choice can be undone (spec 0015, RG19). */
export function natureOptions(l: Pick<PreviewLine, 'row' | 'nature'>): LineNature[] {
  if (isIncome(l)) return ['revenu', 'recu'];
  return (['depense', 'retrait', 'interne', 'externe', 'a_qualifier'] as const).filter(n => n !== 'a_qualifier' || l.nature === 'a_qualifier');
}

/** The line with another nature: the target is kept only if it still fits, a withdrawal goes to cash by default (RG35), an expense of an envelope's account goes to that envelope. */
export function changeNature(d: BudgetData, l: PreviewLine, nature: LineNature): PreviewLine {
  // An entry of money is a revenue or a received transfer, a debit never is (spec 0015, RG17).
  if (isIncome(l) ? nature !== 'revenu' && nature !== 'recu' : nature === 'revenu' || nature === 'recu') return l;
  let target = targetIsValid(d, l.accountId, nature, l.target, l.month) ? l.target : null;
  if (!target && (nature === 'depense' || nature === 'externe')) target = ownEnvelopeTarget(d, l.accountId);
  if (nature === 'retrait' && !target && l.accountId !== null) {
    const cash = destinationAccounts(d, nature, l.accountId).find(a => a.id === CASH_ACCOUNT_ID);
    target = cash ? { kind: 'account', id: cash.id } : null;
  }
  return { ...l, nature, target, remember: target || nature === 'recu' ? l.remember : null, checked: nature === 'recu' ? false : l.checked };
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
  /** Entries of money listed in the preview, never imported (RG65). */
  incomes: number;
}

/** What the session already did, and what it leaves aside: lines imported earlier, and accounts marked « traité » (spec 0013, RG71, RG72). */
export interface ImportScope {
  /** Ids of the lines imported during this session. */
  done?: ReadonlySet<string>;
  /** Pair keys of the accounts the user marked as handled: their lines are not imported nor counted as « à compléter » (RG72). */
  marked?: ReadonlySet<string>;
}

/** Ids of the lines an import would write: checked, complete, not already imported, not in a marked account (RG68, RG77). */
export function importableIds(d: BudgetData, preview: ImportPreview, scope: ImportScope = {}): Set<string> {
  return new Set(preview.lines.filter(l => l.checked && !lineProblem(d, l) && !scope.done?.has(l.id) && !scope.marked?.has(l.pairKey)).map(l => l.id));
}

export function previewCounts(d: BudgetData, preview: ImportPreview, scope: ImportScope = {}): PreviewCounts {
  const open = preview.lines.filter(l => !scope.done?.has(l.id));
  return {
    toImport: importableIds(d, preview, scope).size,
    duplicates: open.filter(l => l.duplicate).length,
    incomplete: open.filter(l => !isReceivedTransfer(l) && !scope.marked?.has(l.pairKey) && lineProblem(d, l)).length,
    incomes: preview.lines.filter(isIncome).length,
    pairsToLink: preview.pairs.filter(p => !p.known && !(p.key in preview.choices)).length,
  };
}

/** Progress of one account of the file: what is left to do on it (RG71). A received transfer, never imported, never keeps an account « à traiter ». */
export interface AccountProgress {
  imported: number;
  /** Already imported before (a duplicate that is not forced). */
  alreadyImported: number;
  remaining: number;
  /** Nothing left to do: every debit line is imported here or before. A file account with no debit line is not « traité ». */
  treated: boolean;
}

export function accountProgress(preview: ImportPreview, pairKey: string, done: ReadonlySet<string> = new Set()): AccountProgress {
  const debits = preview.lines.filter(l => l.pairKey === pairKey && !isReceivedTransfer(l));
  const imported = debits.filter(l => done.has(l.id)).length;
  const alreadyImported = debits.filter(l => !done.has(l.id) && l.duplicate && !l.checked).length;
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
  internalTransfers: number;
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
  /** Duplicates left out (not forced). */
  duplicatesSkipped: number;
  /** Received transfers of the preview, shown and not imported (spec 0015, RG17). */
  incomes: number;
  /** Lines of accounts matched to « Ne pas importer » (RG32). */
  accountsSkipped: number;
  /** Lines unchecked by the user, or checked but still incomplete. */
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
    duplicatesSkipped: open.filter(l => l.duplicate).length,
    incomes: open.filter(isReceivedTransfer).length,
    accountsSkipped: preview.skipped,
    leftOut: open.filter(l => !isReceivedTransfer(l) && !l.duplicate).length,
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
  /** The user confirmed that the typed actuals of fixed/credit lines are replaced by their expenses (spec 0014, RG6). Without it such lines are refused. */
  replaceActual?: boolean;
}

/** A typed actual that importing the chosen lines would replace (spec 0014, RG6). */
export interface ReplacedActual {
  month: MonthKey;
  key: string;
  name: string;
  actual: number;
}

/** The actuals that the lines about to be imported would replace, one entry per fixed/credit line, for the single confirmation (RG6, RG20). */
export function replacedActuals(d: BudgetData, preview: ImportPreview, ids: ReadonlySet<string>, scope: ImportScope = {}): ReplacedActual[] {
  const out = new Map<string, ReplacedActual>();
  for (const l of preview.lines) {
    if (!ids.has(l.id) || !l.checked || lineProblem(d, l) || scope.done?.has(l.id) || scope.marked?.has(l.pairKey)) continue;
    if ((!isExpenseNature(l.nature) && l.nature !== 'revenu') || l.target?.kind !== 'line') continue;
    const actual = actualReplacedBy(d, l.month, l.target.key);
    const line = expenseLine(d, l.month, l.target.key) ?? revenueLine(d, l.month, l.target.key);
    if (actual !== null && line) out.set(`${l.month}|${line.key}`, { month: l.month, key: line.key, name: line.name, actual });
  }
  return [...out.values()];
}

/**
 * Writes the chosen lines: `Transaction`s for expenses and external transfers, `AccountMovement`s for withdrawals and internal
 * transfers (RG26), the remembered rules of the lines written (RG18, RG74) and the account matches of the pairs that had a line
 * written (RG74). A line already imported in the session, or not forced and whose (account, fingerprint, rank) is already stored,
 * is skipped, so a replayed batch writes nothing more (RG77). A duplicate that the user forced takes the next free rank of its
 * fingerprint, so the uniqueness (account, fingerprint, rank) holds (ADR 0010). A `var` expense goes on the account assigned to its
 * box when there is one (spec 0006), else on the account of its line (ADR 0012).
 */
export function validateImport(d: BudgetData, preview: ImportPreview, newId: (prefix: string) => string, options: ImportOptions = {}): ImportBatch {
  // Ranks taken per (account, fingerprint): the stored ones, then the new ones. Forced duplicates come last and go after them.
  const used = new Map<string, Set<number>>();
  const usedKey = (accountId: string, fingerprint: string) => `${accountId}\u0001${fingerprint}`;
  const take = (accountId: string, fingerprint: string, rank: number) => {
    const k = usedKey(accountId, fingerprint);
    used.set(k, (used.get(k) ?? new Set()).add(rank));
  };
  for (const x of [...d.transactions, ...(d.accountMovements ?? [])]) if (x.importAccountId && x.fingerprint && x.rank) take(x.importAccountId, x.fingerprint, x.rank);

  const chosen = preview.lines.filter(
    l =>
      l.checked && !lineProblem(d, l) && (!options.ids || options.ids.has(l.id)) && !options.done?.has(l.id) && !options.marked?.has(l.pairKey) &&
      (l.duplicate || !used.get(usedKey(l.accountId!, l.fingerprint))?.has(l.rank)),
  );
  const batch: ImportBatch = { outsideBalances: 0, expenses: 0, revenues: 0, withdrawals: 0, internalTransfers: 0, importedIds: [], failedIds: [] };

  const ranks = new Map<PreviewLine, number>();
  for (const l of chosen.filter(l => !l.duplicate)) {
    take(l.accountId!, l.fingerprint, l.rank);
    ranks.set(l, l.rank);
  }
  for (const l of chosen.filter(l => l.duplicate)) {
    const rank = Math.max(0, ...(used.get(usedKey(l.accountId!, l.fingerprint)) ?? [])) + 1;
    take(l.accountId!, l.fingerprint, rank);
    ranks.set(l, rank);
  }

  const imported: PreviewLine[] = [];
  for (const l of chosen) {
    const sourceId = l.accountId!;
    const base = {
      month: l.month, day: Number(l.row.date.slice(8, 10)), label: l.row.label, amount: l.row.amount,
      importAccountId: sourceId, fingerprint: l.fingerprint, rank: ranks.get(l)!, bankDate: l.row.date, ...(l.row.category ? { category: l.row.category } : {}),
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
      const tx: Transaction = { id: newId('t'), ...base, type: 'rev', target: key, accountId: sourceId };
      if (addTransaction(d, tx, { replaceActual: options.replaceActual })) {
        batch.revenues++;
        imported.push(l);
      } else {
        if (created) d.months[l.month].lines = d.months[l.month].lines.filter(x => x.key !== key);
        batch.failedIds.push(l.id);
      }
    } else if (isExpenseNature(l.nature)) {
      const tx: Transaction =
        t.kind === 'var'
          ? { id: newId('t'), ...base, type: 'var', target: targetId, accountId: fixedTransactionAccountId(d, { type: 'var', month: l.month, target: targetId }) ?? sourceId }
          : t.kind === 'line'
            ? { id: newId('t'), ...base, type: 'fix', target: targetId, accountId: sourceId }
            : { id: newId('t'), ...base, type: 'env', target: targetId };
      if (addTransaction(d, tx, { replaceActual: options.replaceActual })) {
        batch.expenses++;
        imported.push(l);
      } else {
        // Defensive: a month that cannot take the line is already caught by `lineProblem` (« Choisir un mois ouvert », RG76), so the
        // budget refusing a complete line should not happen. If it does, the line is not marked imported and is counted as an error.
        batch.failedIds.push(l.id);
      }
    } else {
      const mv: AccountMovement = { id: newId('m'), ...base, fromAccountId: sourceId, toAccountId: targetId };
      (d.accountMovements ??= []).push(mv);
      if (l.nature === 'retrait') batch.withdrawals++;
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
  if (imported.length > 0) {
    saveSkipChoices(d, preview, newId);
    saveReceivedRules(d, preview, newId);
  }
  return batch;
}

/**
 * Remembers the rules « Virement reçu » asked on lines that are never written (spec 0015, RG19a). Like the « Ne pas importer » choices,
 * they are saved with the first batch and when finishing. A line of another nature is left to `validateImport`.
 */
export function saveReceivedRules(d: BudgetData, preview: ImportPreview, newId: (prefix: string) => string) {
  for (const l of preview.lines) if (l.nature === 'recu' && l.remember !== null) rememberRule(d, l.remember, 'recu', undefined, newId);
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
    // A rule « Virement reçu » already stored is not a pending correction.
    const stored = l.nature === 'recu' && l.remember !== null && (d.importRules ?? []).some(r => r.pattern === normalizeLabel(l.remember!) && r.nature === 'recu');
    return !!f && (f.nature !== l.nature || f.month !== l.month || f.checked !== l.checked || (l.remember !== null && !stored) || JSON.stringify(f.target) !== JSON.stringify(l.target));
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
