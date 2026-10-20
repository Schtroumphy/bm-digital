import { describe, expect, it } from 'vitest';
import { lineHistory } from './budget';
import { defaultBankAccounts } from './bank';
import { emptyData } from './empty';
import type { Line } from './types';

const ln = (block: Line['block'], budget: number, actual: number | null): Line => ({ key: 'k', block, section: '', name: 'k', budget, actual });

function twoMonths(block: Line['block'], prev: Line | null) {
  const d = emptyData();
  d.firstMonth = '2027-01';
  d.accounts = defaultBankAccounts('2027-01');
  d.months['2027-01'] = { initialized: true, lines: prev ? [prev] : [], alloc: {}, transfersDone: {} };
  d.months['2027-02'] = { initialized: true, lines: [ln(block, 400, null)], alloc: {}, transfersDone: {} };
  return d;
}

describe('historique d’une ligne variable (0008, RG13)', () => {
  it('CA10: « Solde mois préc. » est le restant du mois précédent (+35 €)', () => {
    expect(lineHistory(twoMonths('var', ln('var', 400, 365)), '2027-02', 'k').prevGap).toBe(35);
  });

  it('CA10: réel vide le mois précédent : budget entier', () => {
    expect(lineHistory(twoMonths('var', ln('var', 400, null)), '2027-02', 'k').prevGap).toBe(400);
  });

  it('CA10: ligne absente le mois précédent : null', () => {
    expect(lineHistory(twoMonths('var', null), '2027-02', 'k').prevGap).toBeNull();
  });

  it('les autres blocs gardent l’écart (null tant que le réel est vide)', () => {
    expect(lineHistory(twoMonths('fix', ln('fix', 400, null)), '2027-02', 'k').prevGap).toBeNull();
  });
});
