import { kindOf } from './bank';
import { isLineLinked, savingsLines } from './accountKind';
import { monthKey, round2 } from './format';
import { closeKey, Ledger } from './ledger';
import type { AccountKind, BankAccount, BudgetData } from './types';

/*
 * Rows of the year closing (spec 0010). Each amount appears in one group only:
 * a bank account is in the group of its kind, and a savings/investment line tied to
 * an account is represented by that account.
 */

export type ClosingGroupId = AccountKind;

export interface ClosingRow {
  /** Key of the adjustment (`bank:`, `acc:` or `env:`): never renamed, so saved closings stay valid (RG13). */
  id: string;
  name: string;
  /** Balance at 31 December, as computed. */
  calc: number;
  /** Base of 1 January: the computed balance, or the saved adjustment. */
  val: number;
  adj: number;
  /** The row is a bank account (dot shown). */
  account?: BankAccount;
  /** A savings/investment line that is tied to no account (RG11, Q7). */
  unlinked?: boolean;
}

export interface ClosingGroup {
  id: ClosingGroupId;
  title: string;
  rows: ClosingRow[];
  tcalc: number;
  tval: number;
  tadj: number;
}

export interface ClosingView {
  groups: ClosingGroup[];
  total: number;
  /** Number of balances adjusted compared to the calculation. */
  nAdj: number;
}

/** Display order of the groups (spec 0010, Design). */
export const CLOSING_TITLES: Record<ClosingGroupId, string> = {
  courant: 'Comptes bancaires',
  epargne: 'Épargnes',
  enveloppe: 'Enveloppes',
  invest: 'Investissements',
};
const ORDER: ClosingGroupId[] = ['courant', 'epargne', 'enveloppe', 'invest'];

type RawRow = Pick<ClosingRow, 'id' | 'name' | 'calc' | 'account' | 'unlinked'>;

/** Groups of the closing of `year`, empty groups left out (RG9 to RG14). */
export function closingView(d: BudgetData, ledger: Ledger, year: number): ClosingView {
  const dec = monthKey(year, 11);
  const overrides = d.closes[year]?.overrides ?? {};
  const raw: Record<ClosingGroupId, RawRow[]> = { courant: [], epargne: [], enveloppe: [], invest: [] };

  // Bank accounts: archived ones stay while they have a balance to carry over (RG12).
  for (const a of d.accounts) {
    const r = ledger.bankMonth(a.id, dec);
    if (!r || (a.archived && r.balance === 0)) continue;
    raw[kindOf(a)].push({ id: closeKey('bank', a.id), name: a.name, calc: r.balance, account: a });
  }
  // Savings/investment lines: a linked one is represented by its account (RG10); the others keep their own row (RG11).
  for (const l of savingsLines(d)) {
    if (isLineLinked(d, l)) continue;
    raw[l.block === 'epa' ? 'epargne' : 'invest'].push({ id: closeKey('acc', l.key), name: l.name, calc: ledger.accMonth(l.key, dec)?.balance ?? 0, unlinked: true });
  }
  for (const e of d.envelopes) raw.enveloppe.push({ id: closeKey('env', e.id), name: e.name, calc: ledger.envMonth(e.id, dec)?.balance ?? 0 });

  let nAdj = 0;
  const groups = ORDER.map((id): ClosingGroup => {
    const rows = raw[id].map((r): ClosingRow => {
      const val = overrides[r.id] ?? r.calc;
      const adj = round2(val - r.calc);
      if (adj) nAdj++;
      return { ...r, val, adj };
    });
    const tcalc = round2(rows.reduce((s, r) => s + r.calc, 0));
    const tval = round2(rows.reduce((s, r) => s + r.val, 0));
    return { id, title: CLOSING_TITLES[id], rows, tcalc, tval, tadj: round2(tval - tcalc) };
  }).filter(g => g.rows.length > 0);
  return { groups, total: round2(groups.reduce((s, g) => s + g.tval, 0)), nAdj };
}
