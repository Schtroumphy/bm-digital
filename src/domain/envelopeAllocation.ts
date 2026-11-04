import { envelopeAccountAt, isTransactionInBudget } from './bank';
import { envelopeCashPart } from './cash';
import { round2 } from './format';
import type { Ledger } from './ledger';
import type { BudgetData, MonthKey } from './types';

/*
 * What an envelope was allocated for a month, in virtual and in cash, and how much of it was spent (spec 0040). The Budget tile reads these figures:
 * allocations and spending of the month ALONE, never the balances (carried balance included), which stay in the Enveloppes and Comptes screens.
 * Always derived, never stored.
 */

/** Allocation, spending and bar of an envelope for a month. */
export interface EnvelopeAllocationFigures {
  /** Allocation of the month (virtual + cash). */
  allocation: number;
  /** Cash part of the allocation (spec 0037, RG11). */
  cashAllocation: number;
  /** allocation − cash part, never negative (spec 0037, RG11). */
  virtualAllocation: number;
  /** Spent in the month, net of the money that came back (= `spent` of the envelope). */
  spent: number;
  /** Spent in the month with the cash of the envelope. */
  cashSpent: number;
  /** spent − cash spent: the expenses paid in virtual. */
  virtualSpent: number;
  /** Width of the virtual segment of the bar, in % of the bar (0 to 100). */
  virtualPct: number;
  /** Width of the cash segment of the bar, in % of the bar, placed right after the virtual one. virtualPct + cashPct never exceeds 100. */
  cashPct: number;
  /** spent − allocation when the month's spending goes past the allocation, else 0. Measured on the total, never per colour (RG7). */
  overrun: number;
  /** False when there is nothing to draw: allocation 0 without spending (RG8). */
  showBar: boolean;
}

/** Figures of an envelope for a month. Null for an unknown envelope or a month before it opens (RG9: no bar). */
export function envelopeAllocationFigures(d: BudgetData, ledger: Ledger, envelopeId: string, m: MonthKey): EnvelopeAllocationFigures | null {
  const em = ledger.envMonth(envelopeId, m);
  const e = d.envelopes.find(x => x.id === envelopeId);
  if (!em || !e) return null;
  const allocation = em.alloc;
  const cashAllocation = envelopeCashPart(d, m, envelopeId);
  // Same perimeter as the `spent` of the ledger: before the envelope has its own account, an expense out of the budget does not count.
  const counted = envelopeAccountAt(d, e, m) ? () => true : (t: (typeof d.transactions)[number]) => isTransactionInBudget(d, t);
  const cashSpent = round2(d.transactions.filter(t => t.month === m && t.type === 'env' && t.target === envelopeId && t.payMode === 'especes' && counted(t)).reduce((s, t) => s + t.amount, 0));
  const spent = em.spent;
  const virtualSpent = round2(spent - cashSpent);
  // The bar is the allocation. Past it, the bar stays full and the two segments keep their proportion of what was spent.
  const v = Math.max(0, virtualSpent);
  const c = Math.max(0, cashSpent);
  const base = Math.max(allocation, v + c);
  const pct = (x: number) => (base > 0 ? (x / base) * 100 : 0);
  return {
    allocation,
    cashAllocation,
    virtualAllocation: Math.max(0, round2(allocation - cashAllocation)),
    spent,
    cashSpent,
    virtualSpent,
    virtualPct: pct(v),
    cashPct: pct(c),
    overrun: Math.max(0, round2(spent - allocation)),
    showBar: allocation > 0 || spent > 0,
  };
}
