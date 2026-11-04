import { describe, expect, it } from 'vitest';
import { addBankAccount } from '../application/bankAccounts';
import { addEnvelope } from '../application/envelopes';
import { addTransaction, applyTemplate } from '../application/actions';
import { addTransfer } from '../application/accountMovements';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from './bank';
import { accountComingUp, comingUpAccounts, groupOfMode, isLate, lateCount, leftOfAllocation, leftOfLine, lineTooltip } from './comingUp';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import { seedData } from './seed';
import type { BlockKey, BudgetData, ExecMode, Line } from './types';

/* Spec 0043 : « À venir ce mois-ci » (reste d'une ligne, regroupement par mode, marge, retard). */

const M = '2027-01';
const TODAY = '2027-01-10';
const SWILE = 'acc-swile';

const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

/** Main account at 1 000 €, Espèces, Swile; January initialized. */
function started(lines: Line[], alloc: Record<string, number> = {}): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, SWILE, 'Swile');
  d.months[M] = { initialized: true, lines: structuredClone(lines), alloc, transfersDone: {} };
  return d;
}

const main = (d: BudgetData, today = TODAY) => accountComingUp(d, M, MAIN_ACCOUNT_ID, today)!;
const group = (d: BudgetData, id: string) => main(d).groups.find(g => g.id === id);
const fixWithEntry = (d: BudgetData, key: string, amount: number, day = 5) =>
  addTransaction(d, { id: `t-${key}-${day}`, month: M, day, label: key, amount, type: 'fix', target: key });

describe('reste d’une ligne (RG5, CA3, CA4)', () => {
  it('CA3 : 62 € sans écriture = 62 € ; une écriture de 62 € le ramène à 0', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(leftOfLine(d.months[M].lines[0])).toBe(62);
    expect(main(d).total).toBe(62);
    fixWithEntry(d, 'edf', 62);
    expect(leftOfLine(d.months[M].lines[0])).toBe(0);
    expect(main(d).total).toBe(0);
  });

  it('CA4 : 100 € avec 40 € d’écritures = 60 € ; avec 130 € = 0 sans changer les autres lignes', () => {
    const d = started([ln('a', 'fix', 100), ln('b', 'fix', 50)]);
    fixWithEntry(d, 'a', 40);
    expect(main(d).total).toBe(110);
    fixWithEntry(d, 'a', 90, 6);
    expect(leftOfLine(d.months[M].lines[0])).toBe(0);
    expect(main(d).total).toBe(50);
  });

  it('CA8 : une ligne var du compte principal de 200 € avec 150 € de dépenses = 50 €', () => {
    const d = started([ln('ali', 'var', 200)]);
    addTransaction(d, { id: 'v', month: M, day: 3, label: 'Lidl', amount: 150, type: 'var', target: 'ali' });
    expect(main(d).total).toBe(50);
  });

  it('une ligne var hors budget (compte hors budget) n’est pas comptée', () => {
    const d = started([ln('sw', 'var', 100, { accountId: SWILE })]);
    d.accounts.find(a => a.id === SWILE)!.inBudget = false;
    expect(main(d).total).toBe(0);
  });
});

describe('allocation d’enveloppe (RG5, CA9)', () => {
  const withEnvelope = () => {
    const d = started([], { vac: 60 });
    addEnvelope(d, 'vac', 'Vacances', M);
    return d;
  };

  it('CA9 : 60 € sans transfert = 60 € ; avec un transfert rattaché de 60 € = 0', () => {
    const d = withEnvelope();
    expect(leftOfAllocation(d, M, 'vac')).toBe(60);
    expect(group(d, 'autres')!.items[0]).toMatchObject({ kind: 'allocation', amount: 60 });
    addTransfer(d, { id: 't1', month: M, day: 2, label: 'Alloc', amount: 60, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: d.envelopes[0].accountId, target: { kind: 'env', id: 'vac' } });
    expect(leftOfAllocation(d, M, 'vac')).toBe(0);
    expect(main(d).total).toBe(0);
  });

  it('un transfert partiel laisse la différence', () => {
    const d = withEnvelope();
    addTransfer(d, { id: 't1', month: M, day: 2, label: 'Alloc', amount: 25, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: d.envelopes[0].accountId, target: { kind: 'env', id: 'vac' } });
    expect(leftOfAllocation(d, M, 'vac')).toBe(35);
  });
});

describe('regroupement par mode (RG6, RG7, CA5)', () => {
  it('groupOfMode range chaque mode sous son titre', () => {
    const cases: [ExecMode | undefined, string][] = [['prelevement', 'prelevement'], ['virement_auto', 'virement'], ['virement_manuel', 'virement'], ['retrait', 'retrait'], ['informatif', 'autres'], [undefined, 'autres']];
    for (const [mode, expected] of cases) expect(groupOfMode(mode)).toBe(expected);
  });

  it('CA5 : prélèvement, virement, retrait, sans mode ; une ligne informatif n’est comptée nulle part', () => {
    const d = started([
      ln('edf', 'fix', 62, { execMode: 'prelevement' }),
      ln('loyer', 'fix', 600, { execMode: 'virement_manuel' }),
      ln('cash', 'fix', 80, { execMode: 'retrait' }),
      ln('div', 'fix', 15),
      ln('info', 'fix', 999, { execMode: 'informatif' }),
      ln('sal', 'rev', 2000),
    ]);
    expect(main(d).groups.map(g => [g.id, g.total])).toEqual([['prelevement', 62], ['virement', 600], ['retrait', 80], ['autres', 15]]);
    expect(main(d).total).toBe(757);
  });

  it('les lignes d’un groupe sont triées par jour prévu, sans jour en dernier', () => {
    const d = started([ln('b', 'fix', 10, { execMode: 'prelevement' }), ln('c', 'fix', 10, { execMode: 'prelevement', dueDay: 20 }), ln('a', 'fix', 10, { execMode: 'prelevement', dueDay: 5 })]);
    expect(group(d, 'prelevement')!.items.map(x => x.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('marge et revenus attendus (RG8, RG9, CA6, CA7)', () => {
  it('CA6 : solde réel 1 000 € et 1 200 € de restes = marge −200 €', () => {
    const d = started([ln('a', 'fix', 1200, { execMode: 'virement_manuel' })]);
    expect(main(d)).toMatchObject({ reference: 1000, total: 1200, margin: -200 });
  });

  it('le solde de référence suit la date : jour J pour le mois en cours, fin pour un mois passé, début pour un mois futur', () => {
    const d = started([ln('a', 'fix', 100)]);
    addTransaction(d, { id: 'e1', month: M, day: 3, label: 'x', amount: 10, type: 'fix', target: 'a' });
    addTransaction(d, { id: 'e2', month: M, day: 20, label: 'y', amount: 30, type: 'fix', target: 'a' });
    expect(main(d, '2027-01-10').reference).toBe(990);
    expect(main(d, '2027-02-05').reference).toBe(960);
    expect(main(d, '2026-12-15').reference).toBe(1000);
  });

  it('CA7 : un revenu attendu de 50 € sans entrée est affiché à part et ne change pas la marge', () => {
    const d = started([ln('a', 'fix', 100), ln('prime', 'rev', 50)]);
    expect(main(d)).toMatchObject({ expected: 50, margin: 900 });
    expect(main(d).expectedItems.map(x => x.id)).toEqual(['prime']);
    addTransaction(d, { id: 'r', month: M, day: 4, label: 'Prime', amount: 60, type: 'rev', target: 'prime' });
    expect(main(d).expected).toBe(0);
  });
});

describe('comptes affichés (RG10, CA14)', () => {
  it('ni compte d’enveloppe, ni Espèces, ni compte sans ligne à payer', () => {
    const d = started([ln('a', 'fix', 100)], { vac: 60 });
    addEnvelope(d, 'vac', 'Vacances', M);
    expect(comingUpAccounts(d, M).map(a => a.id)).toEqual([MAIN_ACCOUNT_ID]);
    d.months[M].lines.push(ln('s', 'fix', 20, { accountId: SWILE }));
    expect(comingUpAccounts(d, M).map(a => a.id)).toEqual([MAIN_ACCOUNT_ID, SWILE]);
    expect(comingUpAccounts(d, M).some(a => a.id === CASH_ACCOUNT_ID)).toBe(false);
  });

  it('un compte hors budget qui a des lignes à payer est affiché comme les autres', () => {
    const d = started([ln('s', 'fix', 20, { accountId: SWILE })]);
    d.accounts.find(a => a.id === SWILE)!.inBudget = false;
    expect(comingUpAccounts(d, M).map(a => a.id)).toContain(SWILE);
    expect(accountComingUp(d, M, SWILE, TODAY)!.total).toBe(20);
  });
});

describe('retard (RG11, RG18, CA10, CA16)', () => {
  const lineOf = (d: BudgetData) => d.months[M].lines[0];

  it('CA10 : jour passé avec un reste > 0 = en retard ; reste 0 = non', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 5 })]);
    expect(isLate(d, M, lineOf(d), '2027-01-05')).toBe(false);
    expect(isLate(d, M, lineOf(d), '2027-01-06')).toBe(true);
    expect(lateCount(d, M, '2027-01-06')).toBe(1);
    fixWithEntry(d, 'a', 100);
    expect(isLate(d, M, lineOf(d), '2027-01-06')).toBe(false);
  });

  it('un dépassement (réel au-dessus du budget) n’est pas en retard', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 5 })]);
    fixWithEntry(d, 'a', 130);
    expect(isLate(d, M, lineOf(d), '2027-01-20')).toBe(false);
  });

  it('jamais en retard : sans jour, informatif, mois à venir', () => {
    const d = started([ln('a', 'fix', 100), ln('b', 'fix', 100, { dueDay: 5, execMode: 'informatif' }), ln('c', 'fix', 100, { dueDay: 5 })]);
    const [a, b, c] = d.months[M].lines;
    expect([isLate(d, M, a, '2027-01-20'), isLate(d, M, b, '2027-01-20'), isLate(d, M, c, '2026-12-20')]).toEqual([false, false, false]);
  });

  it('CA16 : mois clos = aucune ligne en retard, l’encart reste calculable', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 5, execMode: 'prelevement' })]);
    expect(isLate(d, M, lineOf(d), '2027-02-10')).toBe(true);
    d.months[M].closed = true;
    expect(isLate(d, M, lineOf(d), '2027-02-10')).toBe(false);
    expect(lateCount(d, M, '2027-02-10')).toBe(0);
    expect(accountComingUp(d, M, MAIN_ACCOUNT_ID, '2027-02-10')!.groups[0].items[0].late).toBe(false);
  });

  it('le jour 31 est ramené au dernier jour d’un mois court', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 31 })]);
    expect(main(d).groups[0].items[0].day).toBe(31);
    d.months['2027-02'] = { initialized: true, lines: structuredClone(d.months[M].lines), alloc: {}, transfersDone: {} };
    expect(accountComingUp(d, '2027-02', MAIN_ACCOUNT_ID, '2027-02-10')!.groups[0].items[0].day).toBe(28);
  });

  it('l’infobulle d’une ligne ne parle plus de pointage', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 5, execMode: 'prelevement' })]);
    const tip = lineTooltip(d, M, lineOf(d), '2027-01-20');
    expect(tip).toContain('Prévu le 5 du mois');
    expect(tip).toContain('Prélèvement automatique');
    expect(tip).toContain('En retard');
    expect(tip.toLowerCase()).not.toContain('point');
  });
});

describe('aucune lecture des anciens pointages (RG2, RG3, RG16, CA2, CA15)', () => {
  const figures = (d: BudgetData) => {
    const ledger = new Ledger(d, '2026-12');
    return {
      banks: ledger.months.map(m => d.accounts.map(a => ledger.bankMonth(a.id, m))),
      coming: d.accounts.map(a => accountComingUp(d, '2026-12', a.id, '2026-12-10')),
      late: lateCount(d, '2026-12', '2026-12-10'),
    };
  };

  it('des données avec d’anciens pointages donnent les mêmes chiffres qu’en les retirant, et ils restent présents', () => {
    const withChecks = seedData();
    withChecks.months['2026-12'].checks = {
      [withChecks.months['2026-12'].lines[0].key]: { doneOn: '2026-12-03' },
      'env:perso': { doneOn: '2026-12-01', accountId: MAIN_ACCOUNT_ID },
    };
    const without = structuredClone(withChecks);
    delete without.months['2026-12'].checks;
    expect(figures(withChecks)).toEqual(figures(without));
    expect(Object.keys(withChecks.months['2026-12'].checks!)).toHaveLength(2);
  });

  it('CA17 : écraser les lignes d’un mois (modèle) ne supprime pas les anciens pointages inertes', () => {
    const d = seedData();
    d.months['2026-12'].checks = { x: { doneOn: '2026-12-03' } };
    expect(applyTemplate(d, '2026-12')).toBe(true);
    expect(d.months['2026-12'].checks).toEqual({ x: { doneOn: '2026-12-03' } });
  });
});
