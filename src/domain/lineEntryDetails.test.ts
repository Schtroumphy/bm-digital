import { describe, expect, it } from 'vitest';
import { emptyData } from './empty';
import { lineEntryDetails } from './lineActuals';
import type { BudgetData, Transaction } from './types';

const M = '2027-03';
const tx = (id: string, day: number, target: string, detail?: string): Transaction => ({ id, month: M, day, label: `Op ${id}`, amount: 45, type: 'fix', target, detail }) as Transaction;

describe('Détails d’une ligne : champs détails des écritures du réel', () => {
  const base = (): BudgetData => emptyData();
  const line = { key: 'rb', block: 'fix' as const };

  it('liste le détail de chaque écriture de la ligne, par jour', () => {
    const d = base();
    d.transactions = [tx('b', 12, 'rb', 'Mars'), tx('a', 3, 'rb', 'Début'), tx('c', 5, 'rb'), tx('x', 4, 'autre', 'Autre ligne')];
    const text = lineEntryDetails(d, M, line);
    expect(text.indexOf('Début')).toBeLessThan(text.indexOf('Mars'));
    expect(text).not.toContain('Autre ligne');
    expect(text).toContain('Op c');
  });

  it('une écriture sans détail est listée quand même', () => {
    const d = base();
    d.transactions = [tx('c', 5, 'rb')];
    expect(lineEntryDetails(d, M, line)).toBe('05 · Op c · 45,00 €');
  });

  it('vide quand la ligne n’a aucune écriture', () => {
    expect(lineEntryDetails(base(), M, line)).toBe('');
  });
});
