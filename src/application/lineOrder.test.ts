import { describe, expect, it } from 'vitest';
import { applyTemplate } from './actions';
import { lineZone, moveLine } from './lineOrder';
import { monthSummary } from '../domain/budget';
import { Ledger } from '../domain/ledger';
import { seedData } from '../domain/seed';
import type { BudgetData } from '../domain/types';

const M = '2026-12';
const keys = (d: BudgetData, m = M, block?: string) => d.months[m].lines.filter(l => !block || l.block === block).map(l => l.key);
const tplKeys = (d: BudgetData, block: string) => d.template.lines.filter(l => l.block === block).map(l => l.key);

describe('réordonner les lignes du mois', () => {
  it('CA1 : place une ligne en première position, les autres blocs sont inchangés', () => {
    const d = seedData();
    const others = keys(d).filter(k => !k.startsWith('f-'));
    expect(moveLine(d, M, 'f-fb', 0)).toBe(true);
    expect(keys(d, M, 'fix')).toEqual(['f-fb', 'f-cj', 'f-nf', 'f-tan', 'f-sp', 'f-sa']);
    expect(keys(d).filter(k => !k.startsWith('f-'))).toEqual(others);
  });

  it('CA2 : refuse une position hors de la section (épargne long terme vers moyen terme)', () => {
    const d = seedData();
    const before = structuredClone(d);
    // La zone « long terme » ne compte que 2 lignes : la position 2 serait dans l’autre section.
    expect(lineZone(d, M, 'e-la').map(l => l.key)).toEqual(['e-la', 'e-ld']);
    expect(moveLine(d, M, 'e-la', 2)).toBe(false);
    expect(d).toEqual(before);
  });

  it('un déplacement dans la section ne touche pas l’autre section', () => {
    const d = seedData();
    expect(moveLine(d, M, 'e-vc', 0)).toBe(true);
    expect(keys(d, M, 'epa')).toEqual(['e-la', 'e-ld', 'e-vc', 'e-ly', 'e-vm']);
  });

  it('CA3 : seul l’ordre change, les chiffres sont identiques', () => {
    const d = seedData();
    const sort = (l: { key: string }[]) => [...l].sort((a, b) => a.key.localeCompare(b.key));
    const before = structuredClone(d.months[M].lines);
    const summary = monthSummary(d, new Ledger(d, '2026-10'), M);
    expect(moveLine(d, M, 'v-sw', 0)).toBe(true);
    expect(d.months[M].lines).not.toEqual(before);
    expect(sort(d.months[M].lines)).toEqual(sort(before));
    expect(monthSummary(d, new Ledger(d, '2026-10'), M)).toEqual(summary);
  });

  it('CA4 : le modèle suit le même ordre relatif, les autres lignes du modèle gardent leur place', () => {
    const d = seedData();
    // Une ligne propre au modèle, entre deux lignes fixes.
    d.template.lines.splice(d.template.lines.findIndex(l => l.key === 'f-tan') + 1, 0, { key: 'only-model', block: 'fix', section: '', name: 'Seulement modèle', budget: 1 });
    const tplBefore = tplKeys(d, 'fix');
    expect(moveLine(d, M, 'f-sa', 0)).toBe(true);
    const after = tplKeys(d, 'fix');
    const index = tplBefore.indexOf('only-model');
    expect(after[index]).toBe('only-model');
    expect(after.filter(k => k !== 'only-model')).toEqual(['f-sa', 'f-cj', 'f-nf', 'f-tan', 'f-sp', 'f-fb']);
    // Les autres blocs du modèle sont inchangés.
    expect(tplKeys(d, 'var')).toEqual(['v-ali', 'v-loi', 'v-sn', 'v-de', 'v-ca', 'v-sw']);
  });

  it('CA5 : une ligne du mois absente du modèle n’est pas ajoutée au modèle', () => {
    const d = seedData();
    d.months[M].lines.push({ key: 'extra', block: 'fix', section: '', name: 'Extra', budget: 5, actual: null });
    const tplLen = d.template.lines.length;
    expect(moveLine(d, M, 'extra', 0)).toBe(true);
    expect(d.months[M].lines.find(l => l.block === 'fix')!.key).toBe('extra');
    expect(d.template.lines).toHaveLength(tplLen);
    expect(d.template.lines.some(l => l.key === 'extra')).toBe(false);
  });

  it('CA6 : refus sur un mois clôturé, une année clôturée et un mois non initialisé', () => {
    const closed = seedData();
    closed.months[M].closed = true;
    expect(moveLine(closed, M, 'f-fb', 0)).toBe(false);
    const year = seedData();
    year.closes[2026] = { closed: true, overrides: {} };
    expect(moveLine(year, M, 'f-fb', 0)).toBe(false);
    const empty = seedData();
    empty.months['2027-03'] = { initialized: false, lines: [], alloc: {}, transfersDone: {} };
    expect(moveLine(empty, '2027-03', 'f-fb', 0)).toBe(false);
    expect(keys(closed, M, 'fix')[0]).toBe('f-cj');
    expect(tplKeys(closed, 'fix')[0]).toBe('f-cj');
  });

  it('CA7 : un autre mois déjà créé n’est pas modifié', () => {
    const d = seedData();
    const nov = structuredClone(d.months['2026-11']);
    expect(moveLine(d, M, 'f-fb', 0)).toBe(true);
    expect(d.months['2026-11']).toEqual(nov);
  });

  it('CA8 : ligne inconnue ou position hors zone : refus sans effet', () => {
    const d = seedData();
    const before = structuredClone(d);
    expect(moveLine(d, M, 'nope', 0)).toBe(false);
    expect(moveLine(d, M, 'f-fb', 6)).toBe(false);
    expect(moveLine(d, M, 'f-fb', -1)).toBe(false);
    expect(moveLine(d, M, 'f-cj', 0)).toBe(false);
    expect(d).toEqual(before);
  });

  it('RG4 : les lignes « hors budget » se déplacent entre elles, sans mélange avec les autres', () => {
    const d = seedData();
    d.accounts.push({ id: 'acc-off', name: 'Swile', hue: 200, isDefault: false, openingBalance: 0, openingMonth: '2026-10', inBudget: false, archived: false });
    for (const k of ['v-sn', 'v-sw']) d.months[M].lines.find(l => l.key === k)!.accountId = 'acc-off';
    expect(lineZone(d, M, 'v-sn').map(l => l.key)).toEqual(['v-sn', 'v-sw']);
    expect(lineZone(d, M, 'v-ali').map(l => l.key)).toEqual(['v-ali', 'v-loi', 'v-de', 'v-ca']);
    expect(moveLine(d, M, 'v-sw', 0)).toBe(true);
    expect(keys(d, M, 'var')).toEqual(['v-ali', 'v-loi', 'v-sw', 'v-de', 'v-ca', 'v-sn']);
    expect(moveLine(d, M, 'v-ali', 4)).toBe(false);
  });

  it('CA16 : un mois créé ensuite avec le modèle reprend l’ordre', () => {
    const d = seedData();
    expect(moveLine(d, M, 'f-fb', 0)).toBe(true);
    expect(applyTemplate(d, '2027-01')).toBe(true);
    expect(keys(d, '2027-01', 'fix')).toEqual(['f-fb', 'f-cj', 'f-nf', 'f-tan', 'f-sp', 'f-sa']);
  });
});
