import { CASH_ACCOUNT_ID, isKindFixed, isSavingsBlock, kindForBlock, kindOf } from './bank';
import type { BankAccount, BudgetData, Line } from './types';

/*
 * Kind of bank accounts and their tie to the savings/investment lines (spec 0010).
 * Pure functions: the Closing screen and the use cases read them, nothing here writes.
 */

/** Name compared without case, accents nor extra spaces (RG17). Used only to propose, never to decide. */
export const normalizeName = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/** A savings/investment line as the budget knows it now: the most recent version of the line across the model and the months. */
export type SavingsLine = Pick<Line, 'key' | 'name' | 'accountId' | 'linkedAccountId'> & { block: 'epa' | 'inv' };

export function savingsLines(d: BudgetData): SavingsLine[] {
  const seen = new Map<string, SavingsLine>();
  const add = (l: Pick<Line, 'key' | 'name' | 'block' | 'accountId' | 'linkedAccountId'>) => {
    if (l.block === 'epa' || l.block === 'inv') seen.set(l.key, { key: l.key, name: l.name, block: l.block, accountId: l.accountId, linkedAccountId: l.linkedAccountId });
  };
  d.template.lines.forEach(add);
  Object.keys(d.months).sort().forEach(m => d.months[m].lines.forEach(add));
  return [...seen.values()];
}

/** A line is « linked » when its `linkedAccountId` designates an existing account, active or archived (RG6). Never by name. */
export const isLineLinked = (d: BudgetData, l: Pick<Line, 'linkedAccountId'>): boolean =>
  !!l.linkedAccountId && d.accounts.some(a => a.id === l.linkedAccountId);

/** An account proposed as the account of a line, from the name only (RG17, RG18). */
export interface KindCandidate {
  accountId: string;
  lineKey: string;
  lineName: string;
  block: 'epa' | 'inv';
  /** The line is already tied to another account: this account can only be typed without a link. */
  taken: boolean;
  /** Another undecided account has the same name: the user chooses which one to link (RG20). */
  shared: boolean;
}

/** Accounts whose kind was never decided, not the main one nor « Espèces », and not archived (RG17, RG22). */
const undecided = (a: BankAccount): boolean => a.kind === undefined && !a.isDefault && a.id !== CASH_ACCOUNT_ID && !a.archived;

/** Candidates to the deduction: undecided accounts whose normalized name is the name of a savings/investment line. */
export function kindCandidates(d: BudgetData): KindCandidate[] {
  const lines = savingsLines(d);
  const matches = d.accounts.filter(undecided).flatMap(a => {
    const name = normalizeName(a.name);
    const line = name ? lines.find(l => normalizeName(l.name) === name) : undefined;
    return line ? [{ a, line }] : [];
  });
  return matches.map(({ a, line }) => ({
    accountId: a.id,
    lineKey: line.key,
    lineName: line.name,
    block: line.block,
    taken: isLineLinked(d, line) && line.linkedAccountId !== a.id,
    shared: matches.some(o => o.a.id !== a.id && o.line.key === line.key),
  }));
}

/**
 * The savings/investment line (not linked yet) that has the same name as `name`, if any (RG24).
 * `accountId` is left out when the account is already the one tied to the line.
 */
export function collidingLine(d: BudgetData, name: string, accountId: string): SavingsLine | undefined {
  const n = normalizeName(name);
  if (!n) return undefined;
  const a = d.accounts.find(x => x.id === accountId);
  if (!a || isKindFixed(a)) return undefined;
  return savingsLines(d).find(l => normalizeName(l.name) === n && !isLineLinked(d, l));
}

/** Accounts tied to a line whose block asks for another kind (« type à revoir », RG7), with the lines concerned. */
export function kindMismatches(d: BudgetData): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const l of savingsLines(d)) {
    const a = d.accounts.find(x => x.id === l.linkedAccountId);
    if (a && isSavingsBlock(l.block) && kindOf(a) !== kindForBlock(l.block)) (out[a.id] ??= []).push(l.name);
  }
  return out;
}
