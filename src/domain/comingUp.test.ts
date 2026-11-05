import { describe, expect, it } from 'vitest';
import { addBankAccount } from '../application/bankAccounts';
import { addEnvelope } from '../application/envelopes';
import { addTransaction, applyTemplate } from '../application/actions';
import { addTransfer } from '../application/accountMovements';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from './bank';
import { CASH_ID } from './internalTransfers';
import { accountComingUp, comingUpAccounts, leftLineKeys, groupOfMode, isLate, lateCount, leftOfAllocation, leftOfLine, lineTooltip } from './comingUp';
import { round2 } from './format';
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
    expect(leftOfLine(d, d.months[M].lines[0])).toBe(62);
    expect(main(d).total).toBe(62);
    fixWithEntry(d, 'edf', 62);
    expect(leftOfLine(d, d.months[M].lines[0])).toBe(0);
    expect(main(d).total).toBe(0);
  });

  it('CA4 (amendé 2026-11-05) : une ligne fixe de 100 € avec 40 € d’écritures a un reste de 0 (le surplus budgété est un bonus) ; avec 130 € aussi, sans changer les autres lignes', () => {
    const d = started([ln('a', 'fix', 100), ln('b', 'fix', 50)]);
    fixWithEntry(d, 'a', 40);
    expect(leftOfLine(d, d.months[M].lines[0])).toBe(0);
    expect(main(d).total).toBe(50);
    fixWithEntry(d, 'a', 90, 6);
    expect(leftOfLine(d, d.months[M].lines[0])).toBe(0);
    expect(main(d).total).toBe(50);
  });

  it('CA4b : fixe et crédit : budget entier sans écriture, 0 dès une écriture', () => {
    const d = started([ln('f', 'fix', 100), ln('c', 'cre', 30)]);
    for (const l of d.months[M].lines) expect(leftOfLine(d, l)).toBe(l.budget);
    d.months[M].lines.forEach(l => { l.actual = 1; });
    for (const l of d.months[M].lines) expect(leftOfLine(d, l)).toBe(0);
  });

  it('CA4d : revenu, épargne et investissement gardent budget − réel (plancher 0)', () => {
    const d = started([ln('r', 'rev', 100), ln('e', 'epa', 80), ln('i', 'inv', 50)]);
    d.months[M].lines.forEach(l => { l.actual = 20; });
    expect(d.months[M].lines.map(l => leftOfLine(d, l))).toEqual([80, 60, 30]);
    d.months[M].lines.forEach(l => { l.actual = 500; });
    expect(d.months[M].lines.map(l => leftOfLine(d, l))).toEqual([0, 0, 0]);
  });

  it('CA4c : une ligne var du compte principal garde budget − réel ; une ligne var à compte dédié suit la nouvelle règle', () => {
    const d = started([ln('ali', 'var', 200), ln('sw', 'var', 100, { accountId: SWILE })]);
    const [ali, sw] = d.months[M].lines;
    expect(leftOfLine(d, ali)).toBe(200);
    expect(leftOfLine(d, sw)).toBe(100);
    ali.actual = 150;
    sw.actual = 20;
    expect(leftOfLine(d, ali)).toBe(50);
    expect(leftOfLine(d, sw)).toBe(0);
    ali.actual = 260;
    expect(leftOfLine(d, ali)).toBe(0);
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
    addTransfer(d, { id: 't1', month: M, day: 2, label: 'Alloc', amount: 60, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: d.envelopes[0].accountId, targets: [{ kind: 'env', id: 'vac' }] });
    expect(leftOfAllocation(d, M, 'vac')).toBe(0);
    expect(main(d).total).toBe(0);
  });

  it('un transfert partiel laisse la différence', () => {
    const d = withEnvelope();
    addTransfer(d, { id: 't1', month: M, day: 2, label: 'Alloc', amount: 25, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: d.envelopes[0].accountId, targets: [{ kind: 'env', id: 'vac' }] });
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
    expect(main(d)).toMatchObject({ reference: 1000, total: 1200, margin: -200, marginWithExpected: -200 });
  });

  it('le solde de référence suit la date : jour J pour le mois en cours, fin pour un mois passé, début pour un mois futur', () => {
    const d = started([ln('a', 'fix', 100)]);
    addTransaction(d, { id: 'e1', month: M, day: 3, label: 'x', amount: 10, type: 'fix', target: 'a' });
    addTransaction(d, { id: 'e2', month: M, day: 20, label: 'y', amount: 30, type: 'fix', target: 'a' });
    expect(main(d, '2027-01-10').reference).toBe(990);
    expect(main(d, '2027-02-05').reference).toBe(960);
    expect(main(d, '2026-12-15').reference).toBe(1000);
  });

  it('CA7 (amendé 2026-11-05) : un revenu attendu de 50 € sans entrée est affiché à part ; la marge reste 900 € et la marge après revenus attendus vaut 950 €', () => {
    const d = started([ln('a', 'fix', 100), ln('prime', 'rev', 50)]);
    expect(main(d)).toMatchObject({ expected: 50, margin: 900, marginWithExpected: 950 });
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

describe('espèces : « À retirer en espèces » (RG5 à RG7, amendés 2026-11-05)', () => {
  /** Alimentation en espèces 100 €, Snacks en espèces 40 €, Vacances 60 € dont 25 € en espèces, et un retrait de `withdrawn` €. */
  const cashMonth = (withdrawn = 0) => {
    const d = started([ln('snk', 'var', 100, { payMode: 'especes' }), ln('dej', 'var', 40, { payMode: 'especes', execMode: 'prelevement' }), ln('ali', 'var', 200)], { vac: 60 });
    addEnvelope(d, 'vac', 'Vacances');
    d.months[M].alloc = { [d.envelopes[0].id]: 60 };
    d.months[M].cashPart = { [d.envelopes[0].id]: 25 };
    if (withdrawn > 0) d.accountMovements = [{ id: 'ret', month: M, day: 3, label: 'Retrait DAB', amount: withdrawn, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ID }];
    return d;
  };
  const retrait = (d: BudgetData) => main(d).groups.find(g => g.id === 'retrait')!;

  it('regroupe les lignes variables en espèces et la part espèces des enveloppes, marqués espèces', () => {
    const g = retrait(cashMonth());
    expect(g.items.map(x => [x.name, x.amount, x.cash])).toEqual(expect.arrayContaining([['snk', 100, true], ['dej', 40, true], ['Alloc. espèces ' + 'Vacances', 25, true]]));
    expect(g.items).toHaveLength(3);
    expect(g.total).toBe(165);
    expect(g.withdrawn).toBeUndefined();
  });

  it('les lignes en espèces ne sont plus dans les autres rubriques (pas de doublon) ; la part virtuelle de l’allocation reste ailleurs', () => {
    const d = cashMonth();
    const others = main(d).groups.filter(g => g.id !== 'retrait').flatMap(g => g.items.map(x => x.id));
    expect(others).not.toContain('snk');
    expect(others).not.toContain('dej');
    expect(others).toContain('ali');
    expect(group(d, 'autres')!.items.find(x => x.kind === 'allocation')!.amount).toBe(35);
  });

  it('le retrait déjà fait est déduit du total de la rubrique, jamais en dessous de 0', () => {
    expect(retrait(cashMonth(100))).toMatchObject({ total: 65, withdrawn: 100 });
    expect(retrait(cashMonth(500))).toMatchObject({ total: 0, withdrawn: 165 });
  });

  it('une ligne en espèces dépensée voit son reste baisser (budget − réel)', () => {
    const d = cashMonth();
    addTransaction(d, { id: 'v', month: M, day: 3, label: 'Kiosque', amount: 30, type: 'var', target: 'snk' });
    expect(retrait(d).items.find(x => x.id === 'snk')!.amount).toBe(70);
  });

  it('le surlignage du Budget garde les lignes en espèces qui ont un reste, pas la part d’enveloppe', () => {
    const keys = leftLineKeys(cashMonth(500), M, TODAY);
    expect(keys.has('snk')).toBe(true);
    expect(keys.has('dej')).toBe(true);
    expect([...keys].some(k => k.startsWith('cash:'))).toBe(false);
  });

  it('seul le compte principal porte la rubrique', () => {
    const d = cashMonth(50);
    d.months[M].lines.push(ln('sw', 'fix', 20, { accountId: SWILE }));
    expect(accountComingUp(d, M, SWILE, TODAY)!.groups.find(g => g.id === 'retrait')).toBeUndefined();
  });
});

describe('solde de départ (RG20, CA19)', () => {
  it('CA19 : le solde de départ est le solde réel au premier jour de la période, avec sa date', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(main(d).start).toEqual({ amount: 1000, date: '2027-01-01' });
  });

  it('un compte pas encore ouvert n’a pas de solde de départ', () => {
    const d = started([ln('s', 'fix', 20, { accountId: SWILE })]);
    d.accounts.find(a => a.id === SWILE)!.openingMonth = '2027-03';
    expect(accountComingUp(d, M, SWILE, TODAY)!.start).toBeNull();
  });
});

describe('mouvements déjà passés (RG21, CA20)', () => {
  it('CA20 : départ + mouvements déjà passés = solde réel de référence', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, { id: 'e', month: M, day: 4, label: 'Courses', amount: 80, type: 'fix', target: 'edf' });
    const p = main(d);
    expect(p.start!.amount).toBe(1000);
    expect(p.passed).toBe(-80);
    expect(round2(p.start!.amount + p.passed!)).toBe(p.reference);
  });

  it('sans mouvement, rien n’a passé ; sans solde de départ, la valeur est absente', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(main(d).passed).toBe(0);
    d.accounts.find(a => a.id === SWILE)!.openingMonth = '2027-03';
    d.months[M].lines.push(ln('s', 'fix', 20, { accountId: SWILE }));
    expect(accountComingUp(d, M, SWILE, TODAY)!.passed).toBeNull();
  });
});

describe('détail des mouvements déjà passés (RG22, CA21)', () => {
  it('CA21 : la liste est triée par date et sa somme égale « mouvements déjà passés »', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, { id: 'b', month: M, day: 8, label: 'B', amount: 20, type: 'fix', target: 'edf' });
    addTransaction(d, { id: 'a', month: M, day: 4, label: 'A', amount: 30, type: 'fix', target: 'edf' });
    addTransaction(d, { id: 'f', month: M, day: 20, label: 'Futur', amount: 99, type: 'fix', target: 'edf' });
    const p = main(d);
    expect(p.passedMovements.map(x => [x.label.replace(/^\S+ /, ''), x.amount])).toEqual([['A', -30], ['B', -20]]);
    expect(round2(p.passedMovements.reduce((s, x) => s + x.amount, 0))).toBe(p.passed);
  });

  it('un mois passé compte tous ses mouvements, un mois futur aucun', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, { id: 'f', month: M, day: 20, label: 'Futur', amount: 99, type: 'fix', target: 'edf' });
    expect(accountComingUp(d, M, MAIN_ACCOUNT_ID, '2027-03-01')!.passedMovements).toHaveLength(1);
    expect(accountComingUp(d, M, MAIN_ACCOUNT_ID, '2026-12-01')!.passedMovements).toEqual([]);
  });
});
