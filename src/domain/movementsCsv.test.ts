import { describe, expect, it } from 'vitest';
import { movementsToCsv } from './movementsCsv';

describe('movementsToCsv', () => {
  it('writes a header, oldest first, French dates, decimal commas, quotes and the out-of-balance flag', () => {
    const csv = movementsToCsv([
      { date: '2026-11-03', label: 'Salaire', category: 'Entrée d’argent', amount: 1200 },
      { date: '2026-11-02', label: 'Café; "Chez Paul"', category: 'Écriture', amount: -3.5, outside: true },
    ]);
    expect(csv).toBe(
      ['Date;Libellé;Débit;Crédit;Catégorie;Hors solde', '02/11/2026;"Café; ""Chez Paul""";3,50;;Écriture;oui', '03/11/2026;Salaire;;1200,00;Entrée d’argent;'].join('\n'),
    );
  });
});
