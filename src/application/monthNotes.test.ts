import { describe, expect, it } from 'vitest';
import { emptyData } from '../domain/empty';
import { seedData } from '../domain/seed';
import { addNote, deleteNote, monthNotes, toggleNote } from './monthNotes';

const M = '2026-12';

describe('notes du mois (spec 0027, CA9)', () => {
  it('ajoute en fin de liste, coche, décoche, supprime', () => {
    const d = seedData();
    expect(addNote(d, M, 'a', 'Appeler la banque')).toBe(true);
    expect(addNote(d, M, 'b', 'Envoyer la facture')).toBe(true);
    expect(monthNotes(d, M).map(n => [n.id, n.done])).toEqual([['a', false], ['b', false]]);
    expect(toggleNote(d, M, 'a')).toBe(true);
    expect(monthNotes(d, M)[0].done).toBe(true);
    expect(toggleNote(d, M, 'a')).toBe(true);
    expect(monthNotes(d, M)[0].done).toBe(false);
    expect(deleteNote(d, M, 'a')).toBe(true);
    expect(monthNotes(d, M).map(n => n.id)).toEqual(['b']);
  });

  it('refuse un texte vide, fait d’espaces ou de plus de 200 caractères (sans le tronquer), retire les espaces autour', () => {
    const d = seedData();
    expect(addNote(d, M, 'a', '')).toBe(false);
    expect(addNote(d, M, 'b', '   ')).toBe(false);
    expect(monthNotes(d, M)).toEqual([]);
    expect(addNote(d, M, 'c', 'x'.repeat(201))).toBe(false);
    expect(monthNotes(d, M)).toEqual([]);
    expect(addNote(d, M, 'e', `  ${'x'.repeat(200)}  `)).toBe(true);
    expect(monthNotes(d, M)[0].text).toHaveLength(200);
    expect(addNote(d, M, 'd', '  Salut  ')).toBe(true);
    expect(monthNotes(d, M)[1].text).toBe('Salut');
  });

  it('refuse un identifiant déjà pris, une note inconnue', () => {
    const d = seedData();
    addNote(d, M, 'a', 'x');
    expect(addNote(d, M, 'a', 'y')).toBe(false);
    expect(toggleNote(d, M, 'zz')).toBe(false);
    expect(deleteNote(d, M, 'zz')).toBe(false);
  });

  it('les notes d’un mois ne se retrouvent pas dans un autre', () => {
    const d = seedData();
    addNote(d, M, 'a', 'x');
    expect(monthNotes(d, '2026-11')).toEqual([]);
  });

  it('modifiables sur un mois clôturé', () => {
    const d = seedData();
    d.months[M].closed = true;
    expect(addNote(d, M, 'a', 'x')).toBe(true);
    expect(toggleNote(d, M, 'a')).toBe(true);
    expect(deleteNote(d, M, 'a')).toBe(true);
  });

  it('sur un mois sans enregistrement : le crée sans l’initialiser', () => {
    const d = emptyData();
    expect(addNote(d, '2027-05', 'a', 'x')).toBe(true);
    expect(d.months['2027-05']).toMatchObject({ initialized: false, lines: [], notes: [{ id: 'a', text: 'x', done: false }] });
  });

  it('la dernière suppression retire la liste (le mois ressemble à un mois d’avant les notes)', () => {
    const d = seedData();
    addNote(d, M, 'a', 'x');
    deleteNote(d, M, 'a');
    expect('notes' in d.months[M]).toBe(false);
  });
});
