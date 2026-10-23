import { accountPairKey } from '../domain/statement';
import type { BankAccount, BudgetData, ImportAccountLink } from '../domain/types';

/*
 * Matches between the accounts of the imported file and the accounts of the app (spec 0013, RG32). A match says
 * where the lines of one (account name, connection name) pair go, or that they are left out (`accountId: null`).
 */

/** Accounts a file account can be matched to: every active account, an envelope's account included (RG32; amendment: expenses also happen from envelopes). */
export const linkableAccounts = (d: BudgetData): BankAccount[] => d.accounts.filter(a => !a.archived);

export const isLinkableAccount = (d: BudgetData, accountId: string): boolean => linkableAccounts(d).some(a => a.id === accountId);

const keyOf = (l: Pick<ImportAccountLink, 'accountName' | 'connectionName'>) => accountPairKey(l.accountName, l.connectionName);

export const findImportAccountLink = (d: BudgetData, accountName: string, connectionName: string): ImportAccountLink | undefined =>
  (d.importAccountLinks ?? []).find(l => keyOf(l) === accountPairKey(accountName, connectionName));

/**
 * What a pair is matched to: an account id, `null` for « Ne pas importer », or `undefined` when there is no usable match
 * (none yet, or its account is archived or gone: the pair is asked again, RG32).
 */
export function linkedAccountOf(d: BudgetData, accountName: string, connectionName: string): string | null | undefined {
  const link = findImportAccountLink(d, accountName, connectionName);
  if (!link) return undefined;
  if (link.accountId === null) return null;
  return isLinkableAccount(d, link.accountId) ? link.accountId : undefined;
}

/** Creates the match of a pair, or changes it. Refused (false) for an account that cannot be matched. Already imported lines are untouched (RG32). */
export function setImportAccountLink(d: BudgetData, accountName: string, connectionName: string, accountId: string | null, newId: (prefix: string) => string): boolean {
  if (accountId !== null && !isLinkableAccount(d, accountId)) return false;
  const links = (d.importAccountLinks ??= []);
  const existing = findImportAccountLink(d, accountName, connectionName);
  if (existing) existing.accountId = accountId;
  else links.push({ id: newId('l'), accountName: accountName.trim(), connectionName: connectionName.trim(), accountId });
  return true;
}

/** Deletes a match: its pair will be asked again at the next import. */
export function removeImportAccountLink(d: BudgetData, id: string): boolean {
  if (!d.importAccountLinks?.some(l => l.id === id)) return false;
  d.importAccountLinks = d.importAccountLinks.filter(l => l.id !== id);
  return true;
}
