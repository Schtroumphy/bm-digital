import { describe, expect, it } from 'vitest';
import { NOTE_MAX, normalizeNote } from './note';

describe('normalizeNote (notes du mois, spec 0027)', () => {
  it('retire les espaces de début et de fin', () => {
    expect(normalizeNote('  Ordonnance  ')).toBe('Ordonnance');
  });
  it('vide, espaces seuls ou absent : pas de texte', () => {
    expect(normalizeNote('')).toBeUndefined();
    expect(normalizeNote('   ')).toBeUndefined();
    expect(normalizeNote(undefined)).toBeUndefined();
    expect(normalizeNote(null)).toBeUndefined();
  });
  it('limite à 200 caractères', () => {
    expect(normalizeNote('a'.repeat(250))).toHaveLength(NOTE_MAX);
    expect(normalizeNote('b'.repeat(200))).toHaveLength(200);
  });
});
