import { describe, expect, it } from 'vitest';
import { applyDetail, DETAIL_MAX, matchesEntrySearch, normalizeDetail } from './detail';

describe('normalizeDetail (spec 0020, RG2)', () => {
  it('retire les espaces de début et de fin', () => {
    expect(normalizeDetail('  Ordonnance  ')).toBe('Ordonnance');
  });
  it('vide, espaces seuls ou absent : pas de détail', () => {
    expect(normalizeDetail('')).toBeUndefined();
    expect(normalizeDetail('   ')).toBeUndefined();
    expect(normalizeDetail(undefined)).toBeUndefined();
    expect(normalizeDetail(null)).toBeUndefined();
  });
  it('CA3 : limite à 200 caractères', () => {
    expect(normalizeDetail('a'.repeat(250))).toHaveLength(DETAIL_MAX);
    expect(normalizeDetail('b'.repeat(200))).toHaveLength(200);
  });
});

describe('matchesEntrySearch (spec 0020, RG9)', () => {
  const e = { label: 'Pharmacie', detail: 'Ordonnance du Dr Martin, mutuelle à demander' };
  it('CA9 : trouve dans le libellé ou dans le détail, sans tenir compte de la casse', () => {
    expect(matchesEntrySearch(e, 'pharma')).toBe(true);
    expect(matchesEntrySearch(e, 'MUTUELLE')).toBe(true);
    expect(matchesEntrySearch(e, 'courses')).toBe(false);
  });
  it('une écriture sans détail se cherche par son libellé ; recherche vide = tout', () => {
    expect(matchesEntrySearch({ label: 'Lidl' }, 'lidl')).toBe(true);
    expect(matchesEntrySearch({ label: 'Lidl' }, 'mutuelle')).toBe(false);
    expect(matchesEntrySearch({ label: 'Lidl' }, '  ')).toBe(true);
  });
});

describe('applyDetail', () => {
  it('pose le détail normalisé, ou retire la propriété quand il est vide', () => {
    const e: { label: string; detail?: string } = { label: 'x' };
    applyDetail(e, '  info ');
    expect(e).toEqual({ label: 'x', detail: 'info' });
    applyDetail(e, '   ');
    expect(e).toEqual({ label: 'x' });
    expect('detail' in e).toBe(false);
  });
});
