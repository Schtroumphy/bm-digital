import { describe, expect, it } from 'vitest';
import { dropIndex, followOrder, moveInZone } from './ordering';

type Item = { id: string; zone: string };
const items: Item[] = [{ id: 'a', zone: 'x' }, { id: 'y1', zone: 'y' }, { id: 'b', zone: 'x' }, { id: 'c', zone: 'x' }, { id: 'y2', zone: 'y' }];
const ids = (l: Item[]) => l.map(i => i.id);
const inX = (i: Item) => i.zone === 'x';

describe('ordering : moveInZone', () => {
  it('déplace un élément dans sa zone sans bouger les autres', () => {
    expect(ids(moveInZone(items, inX, i => i.id === 'c', 0)!)).toEqual(['c', 'y1', 'a', 'b', 'y2']);
    expect(ids(moveInZone(items, inX, i => i.id === 'a', 2)!)).toEqual(['b', 'y1', 'c', 'a', 'y2']);
  });

  it('refuse une position hors zone, un élément inconnu ou hors zone, et l’absence de changement', () => {
    expect(moveInZone(items, inX, i => i.id === 'a', 3)).toBeNull();
    expect(moveInZone(items, inX, i => i.id === 'a', -1)).toBeNull();
    expect(moveInZone(items, inX, i => i.id === 'a', 0.5)).toBeNull();
    expect(moveInZone(items, inX, i => i.id === 'zz', 0)).toBeNull();
    expect(moveInZone(items, inX, i => i.id === 'y1', 0)).toBeNull();
    expect(moveInZone(items, inX, i => i.id === 'a', 0)).toBeNull();
  });

  it('ne modifie pas la liste d’origine', () => {
    moveInZone(items, inX, i => i.id === 'c', 0);
    expect(ids(items)).toEqual(['a', 'y1', 'b', 'c', 'y2']);
  });
});

describe('ordering : followOrder', () => {
  it('replace les éléments cités dans l’ordre donné, les autres restent en place', () => {
    const out = followOrder(items, i => i.id, ['c', 'a']);
    expect(ids(out)).toEqual(['c', 'y1', 'b', 'a', 'y2']);
  });

  it('ignore les clés absentes de la liste', () => {
    expect(ids(followOrder(items, i => i.id, ['zz', 'b', 'a']))).toEqual(['b', 'y1', 'a', 'c', 'y2']);
  });
});

describe('ordering : dropIndex', () => {
  const zone = ['a', 'b', 'c', 'd'];

  it('dépose avant ou après une ligne située plus haut que la ligne déplacée', () => {
    expect(dropIndex(zone, 'd', 'b', false)).toBe(1);
    expect(dropIndex(zone, 'd', 'b', true)).toBe(2);
    expect(dropIndex(zone, 'c', 'a', false)).toBe(0);
  });

  it('dépose avant ou après une ligne située plus bas : la ligne déplacée libère d’abord sa place', () => {
    expect(dropIndex(zone, 'a', 'c', false)).toBe(1);
    expect(dropIndex(zone, 'a', 'c', true)).toBe(2);
    expect(dropIndex(zone, 'a', 'd', true)).toBe(3);
  });

  it('un dépôt juste à côté de sa place ne change pas la position', () => {
    expect(dropIndex(zone, 'b', 'a', true)).toBe(1);
    expect(dropIndex(zone, 'b', 'c', false)).toBe(1);
  });
});
