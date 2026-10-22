import { accountIdOf, isKindFixed, kindForBlock } from '../domain/bank';
import { savingsLines, isLineLinked } from '../domain/accountKind';
import { isMonthLocked } from '../domain/ledger';
import type { AccountKind, BudgetData } from '../domain/types';
import { setBankAccountKind } from './bankAccounts';

/*
 * Use cases of spec 0010: tie a savings/investment line to the account that represents it, and settle the
 * kind of an account proposed by the deduction. Each one changes the data it is given and returns false
 * (changing nothing) when a rule forbids it. No balance, transaction or amount is ever touched (RG4).
 */

/**
 * Ties the line `lineKey` to the account `accountId` and gives the account the kind of the line's block
 * (`epargne` for `epa`, `invest` for `inv`). The tie is written on the budget model and on every open month
 * (not closed, not locked) so that the next months take it again (RG21). Locked months are left as they are (RG26).
 * Refused when the line is unknown, already tied to another account, or when the account cannot be tied
 * (main, « Espèces », archived, unknown, or the account the line is paid from; RG2, RG25).
 */
export function linkLineToAccount(d: BudgetData, lineKey: string, accountId: string): boolean {
  const line = savingsLines(d).find(l => l.key === lineKey);
  const account = d.accounts.find(a => a.id === accountId);
  const kind = line && kindForBlock(line.block);
  if (!line || !account || !kind) return false;
  if (isLineLinked(d, line) && line.linkedAccountId !== accountId) return false;
  // Everything is checked before the first write, so a refusal changes nothing.
  if (isKindFixed(account) || account.archived || accountIdOf(d, line.accountId) === accountId) return false;
  setBankAccountKind(d, accountId, kind);
  const tie = (l: { linkedAccountId?: string }) => void (l.linkedAccountId = accountId);
  const model = d.template.lines.find(l => l.key === lineKey);
  if (model) tie(model);
  for (const [m, md] of Object.entries(d.months)) {
    if (!md.initialized || isMonthLocked(d, m)) continue;
    const l = md.lines.find(x => x.key === lineKey);
    if (l && accountIdOf(d, l.accountId) !== accountId) tie(l);
  }
  return true;
}

/**
 * The user decides a candidate without tying it: the kind becomes explicit (« Garder courant », or another kind without a link)
 * and the account stops being proposed (RG18, RG22).
 */
export const decideAccountKind = (d: BudgetData, accountId: string, kind: AccountKind): boolean => setBankAccountKind(d, accountId, kind);
