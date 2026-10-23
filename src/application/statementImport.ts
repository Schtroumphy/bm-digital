import { CASH_ACCOUNT_ID, accountIdOf, activeBankAccounts, fixedTransactionAccountId, isEnvelopeAccount } from '../domain/bank';
import { compareMonths } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import { accountPairKey, fingerprintOf, fullLabelOf, normalizeLabel, suggestedPattern, type StatementError, type StatementReading, type StatementRow } from '../domain/statement';
import type { AccountMovement, BankAccount, BudgetData, ImportNature, ImportRule, ImportTarget, MonthKey, Transaction } from '../domain/types';
import { addTransaction } from './actions';
import { isLinkableAccount, linkedAccountOf, setImportAccountLink } from './accountLinks';

/*
 * Import of the bank's expenses (spec 0013). Pure functions: `prepareImport` turns a read statement into lines to
 * review, `validateImport` writes the chosen lines into the data (like the other use cases, on a copy handed in by the
 * store). Nothing here knows React, Supabase or the file format. Each line has its own account (RG32): the one its
 * (account name, connection name) pair is matched to.
 */

/** `a_qualifier` only exists in the preview: a transfer the user has not yet decided to be internal or external (RG35). It is never stored. */
export type LineNature = ImportNature | 'a_qualifier';

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
  nature: LineNature;
  target: ImportTarget | null;
  /** Month the line is attached to (RG11). */
  month: MonthKey;
  checked: boolean;
  /** Pattern of the rule to remember on validation (RG18); null = no rule. */
  remember: string | null;
  suggestedPattern: string;
}

/** An account of the file seen in the lines. */
export interface PairInfo {
  key: string;
  accountName: string;
  connectionName: string;
  /** Debit lines of the file for this pair. */
  lines: number;
  /** The pair already had a usable match when the file was opened. The others are listed in the « comptes à rattacher » banner (RG32). */
  known: boolean;
}

/** Match chosen in the preview: an account id, or null for « Ne pas importer ». A pair with no entry is not decided yet. */
export type PairChoices = Record<string, string | null>;

export interface ImportPreview {
  lines: PreviewLine[];
  /** Credits found in the file, never imported (RG8). */
  ignoredCredits: number;
  /** Debit lines of pairs matched to « Ne pas importer », left out of the preview (RG32). */
  skipped: number;
  pairs: PairInfo[];
  /** Matches chosen in this preview; saved with the import, not before (RG25, RG32). */
  choices: PairChoices;
  errors: StatementError[];
}

const NATURE_LABEL: Record<LineNature, string> = { depense: 'Dépense', retrait: 'Retrait', interne: 'Transfert interne', externe: 'Transfert externe', a_qualifier: 'À qualifier' };
export const natureLabel = (n: LineNature) => NATURE_LABEL[n];

const pad2 = (n: number) => String(n).padStart(2, '0');
const importKey = (accountId: string, fingerprint: string, rank: number) => `${accountId}\u0001${fingerprint}\u0001${rank}`;
const dayKey = (accountId: string, date: string, amount: number) => `${accountId}|${date}|${amount.toFixed(2)}`;

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
function targetIsValid(d: BudgetData, sourceId: string | null, nature: LineNature, target: ImportTarget | null, month: MonthKey): boolean {
  if (!target || sourceId === null) return false;
  if (isExpenseNature(nature)) {
    // A line of an envelope's account can only be spent from that envelope: no variable line on an envelope's account (spec 0011, RG2, RG10).
    const own = ownEnvelopeTarget(d, sourceId);
    if (own) return target.kind === 'env' && own.kind === 'env' && target.id === own.id;
    if (target.kind === 'var') return !!d.months[month]?.lines.some(l => l.block === 'var' && l.key === target.key);
    return target.kind === 'env' && d.envelopes.some(e => e.id === target.id);
  }
  if (nature === 'retrait' || nature === 'interne') {
    return target.kind === 'account' && destinationAccounts(d, nature, sourceId).some(a => a.id === target.id);
  }
  return false;
}

/** Why a line cannot be imported yet, or null when it is complete (RG12, RG17, RG32). */
export function lineProblem(d: BudgetData, l: PreviewLine): string | null {
  if (l.accountId === null) return 'Compte à rattacher';
  if (l.nature === 'a_qualifier') return 'À qualifier';
  if (!isImportMonth(d, l.month)) return 'Choisir un mois ouvert';
  if (!targetIsValid(d, l.accountId, l.nature, l.target, l.month)) return isExpenseNature(l.nature) ? 'À rattacher' : 'Choisir une destination';
  return null;
}

/** Longest rule whose pattern is in the label and whose target still exists (RG16, RG18). */
function matchingRule(d: BudgetData, sourceId: string, row: StatementRow, month: MonthKey): ImportRule | null {
  const text = normalizeLabel(fullLabelOf(row));
  const found = (d.importRules ?? [])
    .filter(r => r.pattern !== '' && text.includes(r.pattern) && targetIsValid(d, sourceId, r.nature, r.target, month))
    .sort((a, b) => b.pattern.length - a.pattern.length);
  return found[0] ?? null;
}

/** Nature and target proposed for a line (RG35, RG16): a remembered rule first, then the keywords, else a plain expense. */
function proposal(d: BudgetData, sourceId: string, row: StatementRow, month: MonthKey): { nature: LineNature; target: ImportTarget | null } {
  const rule = matchingRule(d, sourceId, row, month);
  if (rule) return { nature: rule.nature, target: rule.target };
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
    const k = dayKey(x.importAccountId!, `${x.month}-${pad2(x.day)}`, x.amount);
    byDay.set(k, [...(byDay.get(k) ?? []), { fingerprint: x.fingerprint!, category: x.category }]);
  }
  const manual = new Set(d.transactions.filter(t => !t.fingerprint).map(t => dayKey(accountIdOf(d, t.accountId), `${t.month}-${pad2(t.day)}`, t.amount)));
  const before = new Map(previous.map(l => [l.id, l]));

  const seen = new Map<string, number>();
  const lines: PreviewLine[] = [];
  const pairs = new Map<string, PairInfo>();
  let skipped = 0;
  let ignoredCredits = 0;

  reading.rows.forEach((row, index) => {
    if (row.direction === 'credit') {
      ignoredCredits++;
      return;
    }
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
    const base = { id: String(index), row, pairKey, accountId, fingerprint, rank, month, remember: null, suggestedPattern: suggestedPattern(row) };

    if (accountId === null) {
      lines.push({ ...base, duplicate: false, similarManual: false, similarImported: null, transferHint: false, nature: 'depense', target: null, checked: false });
      return;
    }
    const { nature, target } = proposal(d, accountId, row, month);
    const duplicate = known.has(importKey(accountId, fingerprint, rank));
    const near = (byDay.get(dayKey(accountId, row.date, row.amount)) ?? []).filter(x => x.fingerprint !== fingerprint);
    const fresh: PreviewLine = {
      ...base, duplicate, nature, target,
      similarManual: manual.has(dayKey(accountId, row.date, row.amount)),
      similarImported: near.length === 0 ? null : row.category !== '' && near.some(x => x.category === row.category) ? 'probable' : 'semblable',
      transferHint: nature === 'a_qualifier',
      checked: !duplicate && nature !== 'a_qualifier',
    };
    const old = before.get(fresh.id);
    // The corrections already made on an unchanged line (same account, same rank) are kept.
    lines.push(old && old.accountId === accountId && old.rank === rank ? { ...fresh, nature: old.nature, target: old.target, month: old.month, checked: old.checked, remember: old.remember } : fresh);
  });
  return { lines, ignoredCredits, skipped, pairs: [...pairs.values()], choices, errors: reading.errors };
}

/** The same file with the match of one pair chosen (an account id, or null for « Ne pas importer »): lines are redone, other corrections kept. */
export function choosePairAccount(d: BudgetData, reading: StatementReading, preview: ImportPreview, pairKey: string, accountId: string | null): ImportPreview {
  return prepareImport(d, reading, { ...preview.choices, [pairKey]: accountId }, preview.lines);
}

/** The line with another nature: the target is kept only if it still fits, a withdrawal goes to cash by default (RG35), an expense of an envelope's account goes to that envelope. */
export function changeNature(d: BudgetData, l: PreviewLine, nature: LineNature): PreviewLine {
  let target = targetIsValid(d, l.accountId, nature, l.target, l.month) ? l.target : null;
  if (!target && (nature === 'depense' || nature === 'externe')) target = ownEnvelopeTarget(d, l.accountId);
  if (nature === 'retrait' && !target && l.accountId !== null) {
    const cash = destinationAccounts(d, nature, l.accountId).find(a => a.id === CASH_ACCOUNT_ID);
    target = cash ? { kind: 'account', id: cash.id } : null;
  }
  return { ...l, nature, target, remember: target ? l.remember : null };
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
}

export function previewCounts(d: BudgetData, preview: ImportPreview): PreviewCounts {
  const { lines } = preview;
  return {
    toImport: lines.filter(l => l.checked && !lineProblem(d, l)).length,
    duplicates: lines.filter(l => l.duplicate).length,
    incomplete: lines.filter(l => lineProblem(d, l)).length,
    pairsToLink: preview.pairs.filter(p => !p.known && !(p.key in preview.choices)).length,
  };
}

export interface ImportSummary {
  expenses: number;
  withdrawals: number;
  internalTransfers: number;
  /** Duplicates left out (not forced). */
  duplicatesSkipped: number;
  creditsIgnored: number;
  /** Lines of accounts matched to « Ne pas importer » (RG32). */
  accountsSkipped: number;
  /** Lines unchecked by the user, or checked but still incomplete. */
  leftOut: number;
  /** Unreadable records, and lines the budget refused to record. */
  errors: number;
}

/**
 * Writes the checked, complete lines: `Transaction`s for expenses and external transfers, `AccountMovement`s for withdrawals and
 * internal transfers (RG26), the remembered rules (RG18) and the account matches chosen in the preview (RG32). A duplicate that the
 * user forced takes the next free rank of its fingerprint, so the uniqueness (account, fingerprint, rank) holds (ADR 0010). A `var`
 * expense goes on the account assigned to its box when there is one (spec 0006), else on the account of its line (ADR 0012).
 */
export function validateImport(d: BudgetData, preview: ImportPreview, newId: (prefix: string) => string): ImportSummary {
  const chosen = preview.lines.filter(l => l.checked && !lineProblem(d, l));
  const summary: ImportSummary = {
    expenses: 0, withdrawals: 0, internalTransfers: 0,
    duplicatesSkipped: preview.lines.filter(l => l.duplicate && !chosen.includes(l)).length,
    creditsIgnored: preview.ignoredCredits,
    accountsSkipped: preview.skipped,
    leftOut: preview.lines.filter(l => !l.duplicate && !chosen.includes(l)).length,
    errors: preview.errors.length,
  };

  // Ranks taken per (account, fingerprint): the stored ones, then the new ones. Forced duplicates come last and go after them.
  const used = new Map<string, Set<number>>();
  const usedKey = (accountId: string, fingerprint: string) => `${accountId}\u0001${fingerprint}`;
  const take = (accountId: string, fingerprint: string, rank: number) => {
    const k = usedKey(accountId, fingerprint);
    used.set(k, (used.get(k) ?? new Set()).add(rank));
  };
  for (const x of [...d.transactions, ...(d.accountMovements ?? [])]) if (x.importAccountId && x.fingerprint && x.rank) take(x.importAccountId, x.fingerprint, x.rank);
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
      importAccountId: sourceId, fingerprint: l.fingerprint, rank: ranks.get(l)!, ...(l.row.category ? { category: l.row.category } : {}),
    };
    const t = l.target!;
    const targetId = t.kind === 'var' ? t.key : t.id;
    if (isExpenseNature(l.nature)) {
      const tx: Transaction =
        t.kind === 'var'
          ? { id: newId('t'), ...base, type: 'var', target: targetId, accountId: fixedTransactionAccountId(d, { type: 'var', month: l.month, target: targetId }) ?? sourceId }
          : { id: newId('t'), ...base, type: 'env', target: targetId };
      if (addTransaction(d, tx)) {
        summary.expenses++;
        imported.push(l);
      } else summary.errors++;
    } else {
      const mv: AccountMovement = { id: newId('m'), ...base, fromAccountId: sourceId, toAccountId: targetId };
      (d.accountMovements ??= []).push(mv);
      if (l.nature === 'retrait') summary.withdrawals++;
      else summary.internalTransfers++;
      imported.push(l);
    }
  }

  for (const l of imported) if (l.remember !== null) rememberRule(d, l.remember, l.nature as ImportNature, l.target!, newId);
  for (const p of preview.pairs) if (p.key in preview.choices) setImportAccountLink(d, p.accountName, p.connectionName, preview.choices[p.key], newId);
  return summary;
}

/** Adds the rule, or updates the one with the same pattern (RG18). An empty pattern remembers nothing. */
export function rememberRule(d: BudgetData, pattern: string, nature: ImportNature, target: ImportTarget, newId: (prefix: string) => string) {
  const p = normalizeLabel(pattern);
  if (!p) return;
  const rules = (d.importRules ??= []);
  const same = rules.find(r => r.pattern === p);
  if (same) Object.assign(same, { nature, target });
  else rules.push({ id: newId('r'), pattern: p, nature, target });
}
