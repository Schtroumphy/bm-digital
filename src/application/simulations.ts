import { simulationNameKey, type SimulationDraft } from '../domain/simulation';
import type { BudgetData } from '../domain/types';

/*
 * Saved simulations (spec 0034): save and delete. Pure functions on a copy of the data, like the other use cases.
 * They only ever touch `BudgetData.simulations`: the model, the months, the transactions and the goals stay as they are (RG19).
 */

export const SIMULATION_NAME_REQUIRED = 'Donne un nom à la simulation.';
export const SIMULATION_NAME_TAKEN = 'Une simulation porte déjà ce nom.';

/**
 * Why the draft cannot be saved, or `null` when it can (RG12, RG22): the name must not be empty, and no OTHER saved simulation may carry it
 * (case and surrounding spaces ignored). A simulation can always be saved again under its own name.
 */
export function simulationSaveError(d: BudgetData, draft: SimulationDraft): string | null {
  const key = simulationNameKey(draft.name);
  if (!key) return SIMULATION_NAME_REQUIRED;
  if ((d.simulations ?? []).some(s => s.id !== draft.id && simulationNameKey(s.name) === key)) return SIMULATION_NAME_TAKEN;
  return null;
}

export type SaveSimulationResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Saves the draft (RG13): a new one is added at the head of the list under `newId`, a saved one is updated in place.
 * A draft whose simulation was deleted meanwhile is added as a new one. Refused (nothing changed) when `simulationSaveError` says so.
 */
export function saveSimulation(d: BudgetData, draft: SimulationDraft, newId: string): SaveSimulationResult {
  const error = simulationSaveError(d, draft);
  if (error) return { ok: false, error };
  const list = (d.simulations ??= []);
  const existing = draft.id === null ? undefined : list.find(s => s.id === draft.id);
  const saved = { id: existing ? existing.id : newId, name: draft.name.trim(), notes: draft.notes, rows: draft.rows.map(r => ({ ...r })) };
  if (existing) list[list.indexOf(existing)] = saved;
  else list.unshift(saved);
  return { ok: true, id: saved.id };
}

/** Removes a saved simulation. Returns false when it does not exist. The list disappears when it becomes empty, like the other optional lists. */
export function deleteSimulation(d: BudgetData, id: string): boolean {
  const list = d.simulations ?? [];
  if (!list.some(s => s.id === id)) return false;
  const rest = list.filter(s => s.id !== id);
  if (rest.length) d.simulations = rest;
  else delete d.simulations;
  return true;
}
