import { describe, expect, it } from 'vitest';
import { emptyData } from './empty';
import { addDays, budgetStart, budgetStartBounds, deducedDate, defaultEntryDate, inPeriod, isBeforeBudget, monthOfDate, nextDefaultEnd, periodEndBounds, periodOf, validateBudgetStart, validatePeriodEnd, validatePeriodEndCleared } from './periods';
import type { BudgetData } from './types';

/** Budget from octobre 2026, début le 29/09, fin d'octobre le 29/10 (spec 0039, exemple de référence). */
function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2026-10';
  d.settings.startDate = '2026-09-29';
  d.months['2026-10'] = { initialized: true, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-10-29' };
  return d;
}

describe('fin par défaut d’un mois (RG5, CA12a)', () => {
  it('même numéro de jour que la fin du mois précédent', () => {
    expect(nextDefaultEnd('2026-10-29')).toBe('2026-11-29');
    expect(nextDefaultEnd('2026-11-29')).toBe('2026-12-29');
    expect(nextDefaultEnd('2026-12-29')).toBe('2027-01-29');
  });
  it('plafonnée à la longueur du mois : 31/01 donne 28/02 (ou 29/02)', () => {
    expect(nextDefaultEnd('2026-01-31')).toBe('2026-02-28');
    expect(nextDefaultEnd('2027-12-31')).toBe('2028-01-31');
    expect(nextDefaultEnd('2027-01-29')).toBe('2027-02-28');
    expect(nextDefaultEnd('2027-01-30')).toBe('2027-02-28');
    expect(nextDefaultEnd('2028-01-30')).toBe('2028-02-29');
  });
  it('une fin au dernier jour du mois civil reste le dernier jour du mois civil', () => {
    expect(nextDefaultEnd('2026-02-28')).toBe('2026-03-31');
    expect(nextDefaultEnd('2026-04-30')).toBe('2026-05-31');
    expect(nextDefaultEnd('2026-10-31')).toBe('2026-11-30');
  });
});

describe('période d’un mois (RG1, RG3, CA1)', () => {
  it('CA1 : octobre court du 29/09 au 29/10, novembre commence le 30/10', () => {
    const d = budget();
    expect(periodOf(d, '2026-10')).toEqual({ start: '2026-09-29', end: '2026-10-29' });
    expect(periodOf(d, '2026-11')).toEqual({ start: '2026-10-30', end: '2026-11-29' });
    expect(periodOf(d, '2026-12')).toEqual({ start: '2026-11-30', end: '2026-12-29' });
  });

  it('les périodes sont contiguës : sans trou ni chevauchement', () => {
    const d = budget();
    d.months['2026-12'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-12-18' };
    for (let k = 0; k < 8; k++) {
      const m = (n: number) => `${2026 + Math.floor((9 + n) / 12)}-${String(((9 + n) % 12) + 1).padStart(2, '0')}`;
      expect(periodOf(d, m(k + 1)).start).toBe(addDays(periodOf(d, m(k)).end, 1));
    }
  });

  it('RG6 : sans aucune date, chaque période est le mois civil', () => {
    const d = emptyData();
    d.firstMonth = '2026-10';
    expect(periodOf(d, '2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(periodOf(d, '2026-11')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(periodOf(d, '2027-02')).toEqual({ start: '2027-02-01', end: '2027-02-28' });
    expect(periodOf(d, '2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('sans premier mois ou avant lui : le mois civil', () => {
    expect(periodOf(emptyData(), '2026-10')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(periodOf(budget(), '2026-08')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('modifier une fin déplace les fins par défaut suivantes (CA13)', () => {
    const d = budget();
    d.months['2026-10'].endDate = '2026-10-30';
    expect(periodOf(d, '2026-11')).toEqual({ start: '2026-10-31', end: '2026-11-30' });
  });

  it('une fin explicite remplace la valeur par défaut (CA12a)', () => {
    const d = budget();
    d.months['2026-11'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-11-25' };
    expect(periodOf(d, '2026-11').end).toBe('2026-11-25');
    expect(periodOf(d, '2026-12')).toEqual({ start: '2026-11-26', end: '2026-12-25' });
  });

  it('sans fin saisie pour le premier mois, il finit à la fin du mois civil', () => {
    const d = emptyData();
    d.firstMonth = '2026-10';
    d.settings.startDate = '2026-09-29';
    expect(periodOf(d, '2026-10')).toEqual({ start: '2026-09-29', end: '2026-10-31' });
  });

  it('le calcul suit les modifications des données (cache)', () => {
    const d = budget();
    expect(periodOf(d, '2026-11').start).toBe('2026-10-30');
    d.months['2026-10'].endDate = '2026-10-27';
    expect(periodOf(d, '2026-11').start).toBe('2026-10-28');
    d.settings.startDate = '2026-09-20';
    expect(periodOf(d, '2026-10').start).toBe('2026-09-20');
  });
});

describe('date dans une période', () => {
  it('CA3 : le 29/10 est dans octobre, le 30/10 dans novembre', () => {
    const d = budget();
    expect(inPeriod(d, '2026-10', '2026-10-29')).toBe(true);
    expect(inPeriod(d, '2026-10', '2026-10-30')).toBe(false);
    expect(inPeriod(d, '2026-11', '2026-10-30')).toBe(true);
    expect(monthOfDate(d, '2026-10-29')).toBe('2026-10');
    expect(monthOfDate(d, '2026-10-30')).toBe('2026-11');
    expect(monthOfDate(d, '2026-09-30')).toBe('2026-10');
  });

  it('avant le début du budget : aucun mois (RG17)', () => {
    const d = budget();
    expect(monthOfDate(d, '2026-09-27')).toBeNull();
    expect(isBeforeBudget(d, '2026-09-27')).toBe(true);
    expect(isBeforeBudget(d, '2026-09-29')).toBe(false);
    expect(budgetStart(d)).toBe('2026-09-29');
  });

  it('sans début saisi, le budget débute le 1er du premier mois', () => {
    const d = emptyData();
    d.firstMonth = '2026-10';
    expect(budgetStart(d)).toBe('2026-10-01');
    expect(isBeforeBudget(d, '2026-09-30')).toBe(true);
    expect(budgetStart(emptyData())).toBeNull();
  });
});

describe('date déduite d’une écriture sans date bancaire (RG11a, CA12c)', () => {
  it('le 29 existe deux fois dans 29/09-29/10 : le plus tardif, le 29/10', () => {
    expect(deducedDate(budget(), '2026-10', 29)).toBe('2026-10-29');
  });
  it('un numéro de jour qui n’existe qu’une fois : cette date', () => {
    const d = budget();
    expect(deducedDate(d, '2026-10', 30)).toBe('2026-09-30');
    expect(deducedDate(d, '2026-10', 15)).toBe('2026-10-15');
  });
  it('mois civil : le mois et le jour, comme avant', () => {
    const d = emptyData();
    d.firstMonth = '2026-10';
    expect(deducedDate(d, '2026-10', 7)).toBe('2026-10-07');
  });
  it('un jour absent de la période garde l’ancienne lecture, ou la fin de période si la date n’existe pas', () => {
    const d = budget();
    expect(deducedDate(d, '2026-10', 31)).toBe('2026-10-31');
    // Novembre du 01/11 au 29/11 : pas de 31, et le 31/11 n'existe pas
    const civil = emptyData();
    civil.firstMonth = '2026-10';
    civil.months['2026-10'] = { initialized: true, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-10-31' };
    civil.months['2026-11'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-11-29' };
    civil.settings.startDate = '2026-09-29';
    expect(deducedDate(civil, '2026-11', 31)).toBe('2026-11-29');
  });
});

describe('bornes et validation (RG4, CA11)', () => {
  it('fin : au plus tôt le début du mois, au plus tard la veille de la fin du mois suivant', () => {
    const d = budget();
    expect(periodEndBounds(d, '2026-10')).toEqual({ min: '2026-09-29', max: '2026-11-28' });
    expect(validatePeriodEnd(d, '2026-10', '2026-09-29')).toBeNull();
    expect(validatePeriodEnd(d, '2026-10', '2026-11-28')).toBeNull();
    expect(validatePeriodEnd(d, '2026-10', '2026-09-28')).toMatch(/précéder le début de la période \(29\/09\/2026\)/);
    expect(validatePeriodEnd(d, '2026-10', '2026-11-29')).toMatch(/au plus tard le 28\/11\/2026/);
  });
  it('la borne haute suit la fin explicite du mois suivant', () => {
    const d = budget();
    d.months['2026-11'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-11-10' };
    expect(periodEndBounds(d, '2026-10')!.max).toBe('2026-11-09');
  });
  it('une date qui viderait la période d’un mois suivant est refusée', () => {
    const d = budget();
    d.months['2026-12'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-11-30' };
    // avec octobre au 31/10, novembre finirait par défaut le 30/11 : décembre (explicite jusqu'au 30/11) serait vide
    expect(validatePeriodEnd(d, '2026-10', '2026-10-31')).toMatch(/viderait/);
    expect(validatePeriodEnd(d, '2026-10', '2026-10-29')).toBeNull();
  });
  it('une date invalide ou un mois sans période propre sont refusés', () => {
    const d = budget();
    expect(validatePeriodEnd(d, '2026-10', '2026-02-30')).toBe('Date invalide.');
    expect(validatePeriodEnd(d, '2026-08', '2026-08-31')).toMatch(/pas de période/);
  });
  it('effacer une fin explicite est refusé quand la fin par défaut viderait un mois suivant', () => {
    const d = budget();
    d.months['2026-11'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-10-31' };
    d.months['2026-10'].endDate = '2026-10-03';
    expect(validatePeriodEndCleared(d, '2026-10')).toMatch(/viderait/);
  });
  it('début du budget : du 1er du mois civil précédant le premier mois au dernier jour du premier mois', () => {
    const d = budget();
    expect(budgetStartBounds(d)).toEqual({ min: '2026-09-01', max: '2026-10-31' });
    expect(validateBudgetStart(d, '2026-09-01')).toBeNull();
    expect(validateBudgetStart(d, '2026-08-31')).toMatch(/ne peut pas précéder le 01\/09\/2026/);
    expect(validateBudgetStart(d, '2026-11-01')).toMatch(/ne peut pas dépasser le 31\/10\/2026/);
    expect(validateBudgetStart(d, 'abc')).toBe('Date invalide.');
  });
  it('un début après la fin saisie du premier mois est refusé', () => {
    expect(validateBudgetStart(budget(), '2026-10-30')).toMatch(/dépasserait la fin/);
  });
});

describe('date proposée pour une nouvelle écriture (RG11)', () => {
  it('aujourd’hui dans la période, sinon la borne la plus proche', () => {
    const d = budget();
    expect(defaultEntryDate(d, '2026-10', '2026-10-05')).toBe('2026-10-05');
    expect(defaultEntryDate(d, '2026-10', '2026-12-01')).toBe('2026-10-29');
    expect(defaultEntryDate(d, '2026-11', '2026-10-05')).toBe('2026-10-30');
  });
});
