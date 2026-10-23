import { normalizeLabel, fullLabelOf } from '../domain/statement';
import type { BudgetData, ImportTarget, MonthKey } from '../domain/types';
import { changeMonth, changeNature, completionOf, isImportMonth, isIncome, isLocked, lineBalanceWarning, lineProblem, linkedPartner, reconcileLinks, targetIsValid, type LineNature, type PreviewLine } from './statementImport';

/*
 * States, filters and bulk actions of the import preview (spec 0013, amendments 3 and 4). Pure functions on the lines of
 * the preview: they never touch what `validateImport` writes. Filters hide lines, they do not exclude them from the import (RG52).
 */

/** States of a line, shown as chips and used as a filter (RG47). A line can have several. */
export type LineState =
  | 'nouveau' | 'a_rattacher' | 'a_qualifier' | 'compte_a_rattacher' | 'doublon' | 'doublon_probable'
  | 'semblable_importee' | 'saisie_manuelle' | 'mois_different' | 'decochee' | 'entree' | 'importee' | 'date_hors_soldes'
  | 'lie' | 'une_face' | 'complete_virement' | 'appariement_ambigu';

const NONE: ReadonlySet<string> = new Set();

export const STATE_LABEL: Record<LineState, string> = {
  nouveau: 'Nouveau',
  a_rattacher: 'À rattacher',
  a_qualifier: 'À qualifier',
  compte_a_rattacher: 'Compte à rattacher',
  doublon: 'Déjà importée',
  doublon_probable: 'Doublon probable',
  semblable_importee: 'Semblable déjà importée',
  saisie_manuelle: 'Saisie manuelle semblable',
  mois_different: 'Mois ≠ date',
  decochee: 'Décochée',
  entree: 'Entrée d’argent',
  importee: 'Importée',
  date_hors_soldes: 'Date hors soldes',
  lie: 'Lié',
  une_face: 'Une face',
  complete_virement: 'Complète le virement',
  appariement_ambigu: 'Appariement ambigu',
};

export const STATE_ORDER: LineState[] = ['nouveau', 'a_rattacher', 'a_qualifier', 'compte_a_rattacher', 'doublon', 'doublon_probable', 'semblable_importee', 'saisie_manuelle', 'mois_different', 'decochee', 'entree', 'importee', 'date_hors_soldes', 'lie', 'une_face', 'complete_virement', 'appariement_ambigu'];

/**
 * States of a line. « Nouveau » is a line with nothing left to do that is not already imported; « Décochée » is a debit unchecked by choice; « Déjà importée » (`doublon`) is a locked line, which has no other state (RG87);
 * « Importée » is a line written during this session (`done`), which has no other state (RG70).
 */
export function lineStates(d: BudgetData, l: PreviewLine, done: ReadonlySet<string> = NONE): LineState[] {
  if (done.has(l.id)) return ['importee'];
  // A line already imported before is « déjà traitée »: locked, with no other state, not even « Décochée » (RG83, RG87).
  if (isLocked(l)) return ['doublon'];
  const out: LineState[] = isIncome(l) ? ['entree'] : [];
  const problem = lineProblem(d, l);
  if (l.accountId === null) out.push('compte_a_rattacher');
  else if (l.nature === 'a_qualifier') out.push('a_qualifier');
  else if (problem) out.push('a_rattacher');
  else if (!isIncome(l)) out.push('nouveau');
  // The target is a fixed/credit line whose typed actual the first expense would replace (spec 0014, RG6): informative, not blocking.
  // The bank date is outside what the balances cover: informative, the line stays importable (spec 0015, RG6).
  if (lineBalanceWarning(d, l) !== null) out.push('date_hors_soldes');
  // Internal transfers (spec 0016): both faces linked, the other face missing, a face that completes an imported transfer, several possible halves.
  if (l.accountId !== null && (l.nature === 'interne' || l.nature === 'recu')) {
    if (l.link) out.push('lie');
    if (completionOf(d, l)) out.push('complete_virement');
    else if (!l.link) out.push('une_face');
  }
  if (l.ambiguous && !l.link) out.push('appariement_ambigu');
  if (l.similarImported === 'probable') out.push('doublon_probable');
  if (l.similarImported === 'semblable') out.push('semblable_importee');
  if (l.similarManual) out.push('saisie_manuelle');
  if (l.month !== l.row.date.slice(0, 7)) out.push('mois_different');
  if (!l.checked) out.push('decochee');
  return out;
}

export interface PreviewFilters {
  /** Words that must all be in the label or the notes, without accents or case (RG49). */
  text: string;
  /** Pair keys of the accounts of the file. */
  accounts: string[];
  states: LineState[];
  natures: LineNature[];
  months: MonthKey[];
  categories: string[];
}

export const emptyFilters = (): PreviewFilters => ({ text: '', accounts: [], states: [], natures: [], months: [], categories: [] });

export const isFilterActive = (f: PreviewFilters): boolean =>
  f.text.trim() !== '' || f.accounts.length > 0 || f.states.length > 0 || f.natures.length > 0 || f.months.length > 0 || f.categories.length > 0;

const inFamily = <T,>(values: T[], mine: T[]): boolean => values.length === 0 || mine.some(v => values.includes(v));

/** Whether a line passes the filters: AND between families, OR inside a family (RG48). An entry of money has no nature (RG63). */
export function matchesFilters(d: BudgetData, l: PreviewLine, f: PreviewFilters, done: ReadonlySet<string> = NONE): boolean {
  const words = normalizeLabel(f.text).split(' ').filter(Boolean);
  if (words.length > 0) {
    const text = normalizeLabel(fullLabelOf(l.row));
    if (!words.every(w => text.includes(w))) return false;
  }
  return (
    inFamily(f.accounts, [l.pairKey]) &&
    inFamily(f.states, lineStates(d, l, done)) &&
    inFamily(f.natures, [l.nature]) &&
    inFamily(f.months, [l.month]) &&
    inFamily(f.categories, [l.row.category])
  );
}

/**
 * The lines to show. `keep` are lines edited since the filters last changed: they stay shown even if they no longer match (RG55).
 * Lines imported during the session (`done`) are hidden unless the « Importée » state is asked for (RG70).
 */
export function filterLines(d: BudgetData, lines: PreviewLine[], f: PreviewFilters, keep: ReadonlySet<string> = new Set(), done: ReadonlySet<string> = NONE): PreviewLine[] {
  const withDone = f.states.includes('importee');
  const open = withDone ? lines : lines.filter(l => !done.has(l.id));
  return isFilterActive(f) ? open.filter(l => (keep.has(l.id) && !done.has(l.id)) || matchesFilters(d, l, f, done)) : open;
}

export interface FilterCounts {
  total: number;
  states: Record<LineState, number>;
  natures: Partial<Record<LineNature, number>>;
  months: Record<MonthKey, number>;
  accounts: Record<string, number>;
  categories: Record<string, number>;
}

/** Number of lines per filter value, over ALL the lines of the preview whatever the other filters are (RG50). */
export function filterCounts(d: BudgetData, lines: PreviewLine[], done: ReadonlySet<string> = NONE): FilterCounts {
  const c: FilterCounts = { total: lines.length, states: Object.fromEntries(STATE_ORDER.map(s => [s, 0])) as Record<LineState, number>, natures: {}, months: {}, accounts: {}, categories: {} };
  const add = (rec: Record<string, number>, key: string) => (rec[key] = (rec[key] ?? 0) + 1);
  for (const l of lines) {
    for (const s of lineStates(d, l, done)) c.states[s]++;
    add(c.natures as Record<string, number>, l.nature);
    add(c.months, l.month);
    add(c.accounts, l.pairKey);
    if (l.row.category) add(c.categories, l.row.category);
  }
  return c;
}

/** The filters without the values that no longer exist in the lines (an account removed by a match change, for example) (RG54). */
export function pruneFilters(f: PreviewFilters, lines: PreviewLine[]): PreviewFilters {
  const has = <T,>(values: T[], present: (l: PreviewLine) => T | null) => values.filter(v => lines.some(l => present(l) === v));
  return {
    ...f,
    accounts: has(f.accounts, l => l.pairKey),
    months: has(f.months, l => l.month),
    categories: has(f.categories, l => l.row.category),
    natures: has(f.natures, l => l.nature),
  };
}

/**
 * Checks or unchecks the given lines. A locked line is never touched; a checked incomplete line stays not importable (RG56, RG60). The two faces of a linked pair
 * are checked together: the other face of a line follows it (spec 0016, RG7).
 */
export function setChecked(lines: PreviewLine[], ids: ReadonlySet<string>, checked: boolean, done: ReadonlySet<string> = NONE): PreviewLine[] {
  const all = new Set(ids);
  for (const l of lines) if (ids.has(l.id)) {
    const partner = linkedPartner(lines, l);
    if (partner) all.add(partner.id);
  }
  return lines.map(l => (all.has(l.id) && !isLocked(l) && !done.has(l.id) ? { ...l, checked } : l));
}

export interface BulkChange {
  nature?: LineNature;
  target?: ImportTarget;
  month?: MonthKey;
}

export interface BulkResult {
  lines: PreviewLine[];
  changed: number;
  /** Lines of the selection left as they were: not eligible, or a requested value invalid for them (RG57). */
  unchanged: number;
}

/**
 * Applies a nature, a target and/or a month to the given lines. A line for which the result is not valid (target unusable for its
 * account or month, closed month, unqualified nature, account not matched) is left untouched; so are entries of money (RG57, RG60).
 */
export function applyBulk(d: BudgetData, lines: PreviewLine[], ids: ReadonlySet<string>, change: BulkChange, done: ReadonlySet<string> = NONE): BulkResult {
  let changed = 0;
  let unchanged = 0;
  const out = lines.map(l => {
    if (!ids.has(l.id)) return l;
    if (isLocked(l) || done.has(l.id) || l.accountId === null || change.nature === 'a_qualifier') {
      unchanged++;
      return l;
    }
    let next = l;
    if (change.month !== undefined) {
      if (!isImportMonth(d, change.month)) {
        unchanged++;
        return l;
      }
      next = changeMonth(d, next, change.month);
    }
    if (change.nature !== undefined) next = changeNature(d, next, change.nature);
    if (change.target !== undefined) {
      if (!targetIsValid(d, l.accountId, next.nature, change.target, next.month)) {
        unchanged++;
        return l;
      }
      next = { ...next, target: change.target };
    }
    if (next.nature === l.nature && next.month === l.month && JSON.stringify(next.target) === JSON.stringify(l.target)) {
      unchanged++;
      return l;
    }
    changed++;
    return next;
  });
  // A pair whose nature or account was changed is no longer a pair (spec 0016, RG9).
  return { lines: reconcileLinks(out), changed, unchanged };
}
