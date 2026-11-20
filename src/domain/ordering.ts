/*
 * Reordering of a list of items inside a « zone » (spec 0055).
 * A zone is the subset of items that may be swapped with each other (e.g. the lines of one block and one section).
 * The items of the zone sit anywhere in the full list; moving one never changes where the other items stay.
 */

/**
 * Moves the item `isMoved` to position `toIndex` among the items of its zone (0 = first of the zone).
 * Returns a new list, or null when nothing can be done: unknown item, item out of the zone, position outside the zone, or no change.
 * The items out of the zone keep their exact place in the list; the slots of the zone are refilled in the new order.
 */
export function moveInZone<T>(items: readonly T[], inZone: (item: T) => boolean, isMoved: (item: T) => boolean, toIndex: number): T[] | null {
  const slots: number[] = [];
  items.forEach((item, i) => {
    if (inZone(item)) slots.push(i);
  });
  const from = slots.findIndex(i => isMoved(items[i]));
  if (from < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= slots.length || toIndex === from) return null;
  const zone = slots.map(i => items[i]);
  const [moved] = zone.splice(from, 1);
  zone.splice(toIndex, 0, moved);
  const next = [...items];
  slots.forEach((slot, i) => {
    next[slot] = zone[i];
  });
  return next;
}

/**
 * Final position (0 = first) of the item `movedId` of `zone` when it is dropped before or after the item `overId` (spec 0055, RG5).
 * The moved item leaves its place first, so a drop below its current place lands one rank higher than the insertion slot.
 */
export function dropIndex(zone: readonly string[], movedId: string, overId: string, after: boolean): number {
  const from = zone.indexOf(movedId);
  const slot = zone.indexOf(overId) + (after ? 1 : 0);
  return slot > from ? slot - 1 : slot;
}

/**
 * Places the items of `items` whose key is in `order` in the relative order given by `order`, leaving every other item in place.
 * Used to copy an order onto a list that holds the same items and more (the budget model, spec 0055, RG8).
 * Keys of `order` that `items` does not hold are ignored.
 */
export function followOrder<T>(items: readonly T[], keyOf: (item: T) => string, order: readonly string[]): T[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  const slots: number[] = [];
  items.forEach((item, i) => {
    if (rank.has(keyOf(item))) slots.push(i);
  });
  const sorted = slots.map(i => items[i]).sort((a, b) => rank.get(keyOf(a))! - rank.get(keyOf(b))!);
  const next = [...items];
  slots.forEach((slot, i) => {
    next[slot] = sorted[i];
  });
  return next;
}
