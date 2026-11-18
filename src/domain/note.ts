/** Longest month note (spec 0027). */
export const NOTE_MAX = 200;

/**
 * Rule of the free text of the month notes (spec 0027): surrounding spaces are removed, the text is cut to 200 characters, and an empty text
 * means « no text » (`undefined`). The free text of an operation is its annotation instead (spec 0051, `domain/annotation.ts`).
 */
export function normalizeNote(raw: string | null | undefined): string | undefined {
  const text = (raw ?? '').trim().slice(0, NOTE_MAX).trimEnd();
  return text === '' ? undefined : text;
}
