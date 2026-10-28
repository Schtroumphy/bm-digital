import { isLineInBudget } from './bank';
import { templateSummary } from './budget';
import { parseAmount, rawNumber, round2 } from './format';
import type { BudgetData, SimBlockKey, Simulation, SimulationRow } from './types';

/*
 * Simulation tab (spec 0034): a sandbox month made of free lines. Pure functions only; nothing here writes into the real budget.
 */

/** The 7 blocks, in display order (RG1). */
export const SIM_BLOCKS: readonly SimBlockKey[] = ['rev', 'cre', 'fix', 'var', 'epa', 'inv', 'env'];
/** The blocks that are outgoings: everything but the revenues (RG5). */
export const SIM_OUTGOING_BLOCKS: readonly SimBlockKey[] = SIM_BLOCKS.filter(b => b !== 'rev');

/** Where the simulation being edited comes from (RG10). Absent (`null`) for a reopened or duplicated one. */
export type SimulationSource = 'model' | 'vide';

/** The simulation being edited: a saved one (`id`) or a new one (`id` null), not persisted until saved (RG19). */
export interface SimulationDraft {
  id: string | null;
  source: SimulationSource | null;
  name: string;
  notes: string;
  rows: SimulationRow[];
}

/** Monthly amount of a typed text: « 1 234,5 » → 1234.5. Empty or unreadable = 0 (RG2, RG3). */
export const simulationAmount = (text: string): number => parseAmount(text) ?? 0;

/** Annual amount of a line (× 12), `null` when its amount is empty (RG2). */
export const rowAnnual = (text: string): number | null => (text.trim() === '' ? null : round2(simulationAmount(text) * 12));

/** Keeps what an amount can contain: digits, space, comma and point (RG3). */
export const sanitizeSimulationAmount = (text: string): string => text.replace(/[^\d,.\s]/g, '');

export interface SimulationTotals {
  /** Monthly total of each block. */
  blocks: Record<SimBlockKey, number>;
  revenue: number;
  /** Credits + fixed + variable + envelopes + savings + investments (RG5). */
  outgoing: number;
  /** Revenues − outgoings. */
  remaining: number;
  /** `remaining` × 12. */
  remainingYear: number;
  /** Yearly figures (× 12, rounded), for the display. */
  annual: { blocks: Record<SimBlockKey, number>; revenue: number; outgoing: number };
}

export function simulationTotals(rows: readonly SimulationRow[]): SimulationTotals {
  const blocks = Object.fromEntries(SIM_BLOCKS.map(b => [b, 0])) as Record<SimBlockKey, number>;
  for (const r of rows) blocks[r.block] += simulationAmount(r.amount);
  for (const b of SIM_BLOCKS) blocks[b] = round2(blocks[b]);
  const revenue = blocks.rev;
  const outgoing = round2(SIM_OUTGOING_BLOCKS.reduce((s, b) => s + blocks[b], 0));
  const remaining = round2(revenue - outgoing);
  const annualBlocks = Object.fromEntries(SIM_BLOCKS.map(b => [b, round2(blocks[b] * 12)])) as Record<SimBlockKey, number>;
  return {
    blocks, revenue, outgoing, remaining, remainingYear: round2(remaining * 12),
    annual: { blocks: annualBlocks, revenue: round2(revenue * 12), outgoing: round2(outgoing * 12) },
  };
}

/** Share of the revenues taken by a block, 0 to 100; 0 when the revenues are not positive (RG7). */
export const blockShare = (t: SimulationTotals, block: SimBlockKey): number => (t.revenue > 0 ? Math.min(100, (t.blocks[block] / t.revenue) * 100) : 0);

/** Blocks of the savings indicator, in display order (spec 0034, RG23, RG25). */
export const SIM_SAVINGS_BLOCKS = ['env', 'epa', 'inv'] as const satisfies readonly SimBlockKey[];

export interface SimulationSavings {
  /** Envelopes + savings + investments, monthly (RG23). */
  monthly: number;
  /** `monthly` × 12. */
  annual: number;
  /** Share of the revenues, in %: 0 when the revenues are not positive; NOT capped, it can exceed 100 (RG24). */
  shareOfRevenue: number;
  /** One line per block, in the order envelopes, savings, investments; their sum is `monthly` (RG25). */
  details: { block: (typeof SIM_SAVINGS_BLOCKS)[number]; monthly: number; annual: number }[];
  /** Share of the investments in the savings total, in %: 0 when the total is 0 (RG26). */
  investShareOfSavings: number;
}

/** The savings indicator (RG23 to RG27). Read-only on the totals: outgoings and remaining are unchanged (RG5). */
export function simulationSavings(t: SimulationTotals): SimulationSavings {
  const details = SIM_SAVINGS_BLOCKS.map(block => ({ block, monthly: t.blocks[block], annual: t.annual.blocks[block] }));
  const monthly = round2(details.reduce((s, x) => s + x.monthly, 0));
  return {
    monthly,
    annual: round2(monthly * 12),
    shareOfRevenue: t.revenue > 0 ? round2((monthly / t.revenue) * 100) : 0,
    details,
    investShareOfSavings: monthly > 0 ? round2((t.blocks.inv / monthly) * 100) : 0,
  };
}

/** Gap with the budget model (RG8): remaining of the simulation − remaining of the model, signed. Both are computed now, with the current model. */
export const gapWithModel = (d: BudgetData, rows: readonly SimulationRow[]): number => round2(simulationTotals(rows).remaining - templateSummary(d).remaining);

/**
 * The lines of the budget model, in the perimeter of `templateSummary` (RG9): lines of an account « hors budget » left out,
 * every envelope becomes a free line of the « Enveloppes » block with its allocation in the model (0 when absent).
 */
export function modelRows(d: BudgetData, newId: () => string): SimulationRow[] {
  const lines = d.template.lines.filter(l => isLineInBudget(d, { ...l, actual: null }));
  return [
    ...lines.map((l): SimulationRow => ({ id: newId(), block: l.block, name: l.name, amount: rawNumber(l.budget) })),
    ...d.envelopes.map((e): SimulationRow => ({ id: newId(), block: 'env', name: e.name, amount: rawNumber(d.template.envAlloc[e.id] ?? 0) })),
  ];
}

/** A new unsaved simulation, without name nor notes: pre-filled with the model, or empty (RG9). */
export function newSimulation(source: SimulationSource, d: BudgetData, newId: () => string): SimulationDraft {
  return { id: null, source, name: '', notes: '', rows: source === 'model' ? modelRows(d, newId) : [] };
}

/** Opens a saved simulation: a copy, so editing it never touches the saved one before « Enregistrer » (RG15). */
export function openSimulation(s: Simulation): SimulationDraft {
  return { id: s.id, source: null, name: s.name, notes: s.notes, rows: s.rows.map(r => ({ ...r })) };
}

/** An unsaved copy « <nom> (copie) » (empty when the name is empty) with the same lines and notes (RG14). */
export function duplicateSimulation(draft: SimulationDraft, newId: () => string): SimulationDraft {
  const name = draft.name.trim();
  return { id: null, source: null, name: name ? `${name} (copie)` : '', notes: draft.notes, rows: draft.rows.map(r => ({ ...r, id: newId() })) };
}

/** Name used to compare two simulations: case and surrounding spaces ignored, accents kept (RG22). */
export const simulationNameKey = (name: string): string => name.trim().toLowerCase();
