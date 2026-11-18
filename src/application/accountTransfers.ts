import { isAccountTransfer, mainAccount } from '../domain/bank';
import { transferAccountChoices, transferLocks, transferTargetChoices } from '../domain/accountTransfers';
import { isValidDueDay } from '../domain/checkoff';
import { round2 } from '../domain/format';
import { isMonthLocked } from '../domain/ledger';
import type { BudgetData, Line, MonthKey } from '../domain/types';
import { addLine, deleteLine } from './actions';

/*
 * Use cases of the « Transferts entre comptes » card (spec 0050, RG22 to RG28): a transfer is an `epa` line of the month (D6), so creating, editing and
 * deleting one reuses `addLine` and `deleteLine`. Each returns a message when it refuses, and null when it is done. Nothing here writes a bank entry.
 */

/** What the form of a transfer holds. `label` and `dueDay` are optional (RG23). */
export interface TransferInput {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  dueDay?: number;
  label?: string;
}

const LOCKED = 'Le mois est clos ou verrouillé : le transfert ne peut pas être modifié.';

/** Why the form is refused (RG24), or null. `current` is the line being edited: its own accounts stay valid even if one was archived since. */
export function transferInputRefusal(d: BudgetData, input: TransferInput, current?: Line): string | null {
  const from = transferAccountChoices(d).find(a => a.id === input.fromAccountId) ?? (current && current.accountId === input.fromAccountId ? d.accounts.find(a => a.id === input.fromAccountId) : undefined);
  if (!input.fromAccountId || !from) return 'Choisis un compte débité (ni le compte principal, ni une enveloppe, ni Espèces).';
  if (!input.toAccountId) return 'Choisis un compte cible.';
  if (input.toAccountId === input.fromAccountId) return 'Le compte débité et le compte cible doivent être différents.';
  // An existing line whose target is already the main account stays editable (label, day, amount): only a change of target is refused (RG1, CA40).
  if (input.toAccountId === mainAccount(d).id && current?.linkedAccountId !== input.toAccountId) return 'Le compte principal ne peut pas être le compte cible.';
  const to = transferTargetChoices(d, input.fromAccountId).find(a => a.id === input.toAccountId) ?? (current && current.linkedAccountId === input.toAccountId ? d.accounts.find(a => a.id === input.toAccountId) : undefined);
  if (!to) return 'Ce compte ne peut pas être le compte cible (ni une enveloppe, ni Espèces).';
  if (!(input.amount > 0)) return 'Le montant prévu doit être supérieur à 0.';
  if (input.dueDay !== undefined && !isValidDueDay(input.dueDay)) return 'Le jour doit être un entier de 1 à 31.';
  return null;
}

const apply = (l: Line, input: TransferInput) => {
  l.accountId = input.fromAccountId;
  l.linkedAccountId = input.toAccountId;
  l.budget = round2(input.amount);
  l.name = (input.label ?? '').trim();
  if (input.dueDay === undefined) delete l.dueDay;
  else l.dueDay = input.dueDay;
};

/** Creates a transfer: an `epa` line of the month `m` with its payer, target, budget, planned day and label (RG25). Refused on a month not initialized, closed or locked (RG19). */
export function createAccountTransfer(d: BudgetData, m: MonthKey, key: string, input: TransferInput): string | null {
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return LOCKED;
  const refusal = transferInputRefusal(d, input);
  if (refusal) return refusal;
  if (!addLine(d, m, 'epa', key)) return LOCKED;
  apply(d.months[m].lines.find(l => l.key === key) as Line, input);
  return null;
}

/**
 * Edits a transfer (RG27). The accounts stay as they are once the line has entries (a transfer aimed at it or an expense associated with it); the amount, the
 * label and the day are always editable. A change of a locked field is refused as a whole, nothing is written.
 */
export function updateAccountTransfer(d: BudgetData, m: MonthKey, key: string, input: TransferInput): string | null {
  if (isMonthLocked(d, m)) return LOCKED;
  const l = d.months[m]?.lines.find(x => x.key === key);
  if (!l || !isAccountTransfer(d, l)) return 'Ce transfert n’existe plus.';
  const refusal = transferInputRefusal(d, input, l);
  if (refusal) return refusal;
  const locks = transferLocks(d, m, l);
  if (locks.accounts && (input.fromAccountId !== l.accountId || input.toAccountId !== l.linkedAccountId)) return locks.accounts;
  apply(l, input);
  return null;
}

/** Deletes a transfer (RG28): refused when it has entries or on a month closed or locked. Other months are untouched. */
export function deleteAccountTransfer(d: BudgetData, m: MonthKey, key: string): string | null {
  if (!d.months[m]?.initialized || isMonthLocked(d, m)) return LOCKED;
  const l = d.months[m].lines.find(x => x.key === key);
  if (!l || !isAccountTransfer(d, l)) return 'Ce transfert n’existe plus.';
  const locks = transferLocks(d, m, l);
  if (locks.entries) return 'Des écritures sont rattachées à ce transfert : il ne peut pas être supprimé.';
  return deleteLine(d, m, key) ? null : LOCKED;
}
