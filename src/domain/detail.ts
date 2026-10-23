/** Longest detail an entry can carry (spec 0020, RG2). */
export const DETAIL_MAX = 200;

/**
 * Shared rule of the optional « Détail » field (specs 0020 to 0023, RG1, RG2): surrounding spaces are removed, the text is cut to
 * 200 characters, and an empty text means « no detail » (`undefined`). Information only: it never enters a calculation (RG4).
 */
export function normalizeDetail(raw: string | null | undefined): string | undefined {
  const text = (raw ?? '').trim().slice(0, DETAIL_MAX).trimEnd();
  return text === '' ? undefined : text;
}

/** Search of the Saisie screen (spec 0020, RG9): the text is looked for in the label and in the detail, ignoring case. An empty search matches everything. */
export function matchesEntrySearch(entry: { label: string; detail?: string }, search: string): boolean {
  const q = search.trim().toLowerCase();
  return q === '' || entry.label.toLowerCase().includes(q) || (entry.detail ?? '').toLowerCase().includes(q);
}

/** Sets the normalized detail on an entry, or removes the property when the text is empty, so the entry looks like one saved before the detail existed. */
export function applyDetail(entry: { detail?: string }, raw: string): void {
  const detail = normalizeDetail(raw);
  if (detail === undefined) delete entry.detail;
  else entry.detail = detail;
}
