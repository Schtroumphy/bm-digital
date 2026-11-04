import { describe, expect, it } from 'vitest';
import { addTransaction, monthCsv } from './actions';
import { cancelAdjustment, createAdjustment, setAccountStatement, setLineSchedule } from './checkoff';
import { addBankAccount, setBankAccountInBudget } from './bankAccounts';
import { MAIN_ACCOUNT_ID, isLineInBudget, defaultBankAccounts } from '../domain/bank';
import { availableReal, blockTotals, budgetLines, monthSummary, variableRemaining } from '../domain/budget';
import { balanceDateBounds, effectiveDueDay, realMonthBalance, statementGap } from '../domain/checkoff';
import { accountComingUp, isLate, lateCount } from '../domain/comingUp';
import { flowOf, realMovements } from '../domain/bankMovements';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { seedData } from '../domain/seed';
import type { BlockKey, BudgetData, Line } from '../domain/types';

const M = '2027-01';
const SWILE = 'acc-swile';

const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

/** A started budget: main account (1 000 € at the start), « Espèces » and « Swile ». */
function started(lines: Line[], months: string[] = [M]): BudgetData {
  const d = emptyData();
  d.firstMonth = months[0];
  d.accounts = defaultBankAccounts(months[0]);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, SWILE, 'Swile');
  for (const m of months) d.months[m] = { initialized: true, lines: structuredClone(lines), alloc: {}, transfersDone: {} };
  return d;
}

const bank = (d: BudgetData, id: string) => new Ledger(d, M).bankMonth(id, M)!.balance;
const tx = (id: string, day: number, amount: number, target: string, accountId?: string) =>
  ({ id, month: M, day, label: id, amount, type: 'var' as const, target, ...(accountId ? { accountId } : {}) });



describe('jour prévu et retard', () => {
  it('CA10: jour 31 dans un mois de 30 jours donne le 30', () => {
    expect(effectiveDueDay(31, '2027-04')).toBe(30);
    expect(effectiveDueDay(31, '2028-02')).toBe(29);
    expect(effectiveDueDay(10, '2027-04')).toBe(10);
  });

  it('CA11: jamais de retard sans jour prévu, en mode informatif, sur un mois clôturé; toujours dans un mois passé ouvert', () => {
    const d = started([ln('a', 'fix', 100), ln('b', 'fix', 100, { dueDay: 5, execMode: 'informatif' }), ln('c', 'fix', 100, { dueDay: 25 })]);
    const [a, b, c] = d.months[M].lines;
    expect(isLate(d, M, a, '2027-01-30')).toBe(false);
    expect(isLate(d, M, b, '2027-01-30')).toBe(false);
    expect(isLate(d, M, c, '2027-01-20')).toBe(false);
    expect(isLate(d, M, c, '2027-02-01')).toBe(true); // past month, still open
    expect(isLate(d, M, c, '2026-12-01')).toBe(false); // future month
    d.months[M].closed = true;
    expect(isLate(d, M, c, '2027-02-01')).toBe(false);
  });

  it('un jour prévu hors 1 à 31 est refusé; on peut l’effacer', () => {
    const d = started([ln('a', 'fix', 100)]);
    expect(setLineSchedule(d, M, 'a', { dueDay: 32 })).toBe(false);
    expect(setLineSchedule(d, M, 'a', { dueDay: 0 })).toBe(false);
    expect(setLineSchedule(d, M, 'a', { dueDay: 10 })).toBe(true);
    expect(setLineSchedule(d, M, 'a', { dueDay: null })).toBe(true);
    expect(d.months[M].lines[0].dueDay).toBeUndefined();
  });
});

describe('modèle et récurrence', () => {
  it('RG17: jour prévu et mode vont au mois et au modèle, pas aux autres mois existants', () => {
    const d = started([ln('a', 'fix', 100)], ['2027-01', '2027-02']);
    d.template.lines = [{ key: 'a', block: 'fix', section: '', name: 'a', budget: 100 }];
    expect(setLineSchedule(d, '2027-01', 'a', { dueDay: 5, execMode: 'prelevement' })).toBe(true);
    expect(d.template.lines[0]).toMatchObject({ dueDay: 5, execMode: 'prelevement' });
    expect(d.months['2027-02'].lines[0].dueDay).toBeUndefined();
  });

});




describe('relevé, écart et régularisation', () => {
  const TODAY = '2027-01-25';
  /** Opening 1 000 €, a 12 € expense on 20/01 and one on 22/01: the real balance on the 21st is 988 €. */
  const base = () => {
    const d = started([ln('ali', 'var', 500)]);
    addTransaction(d, tx('t1', 20, 12, 'ali'));
    addTransaction(d, tx('t2', 22, 40, 'ali'));
    return d;
  };
  const real = (d: BudgetData) => realMonthBalance(d, M, MAIN_ACCOUNT_ID)!;
  const gap = (d: BudgetData) => statementGap(real(d), d.months[M].accountBalances?.[MAIN_ACCOUNT_ID] ?? null, realMovements(d, MAIN_ACCOUNT_ID, M));

  it('CA54: écart = relevé − solde réel à la date du relevé, ce jour compris; après cette date ne compte pas', () => {
    const d = base();
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2027-01-21', TODAY)).toBe('ok');
    expect(gap(d)).toBe(12);
    expect(real(d).end).toBe(948);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2027-01-22', TODAY);
    expect(gap(d)).toBe(52);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 988, '2027-01-20', TODAY);
    expect(gap(d)).toBe(0);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 988, '2027-01-19', TODAY);
    expect(gap(d)).toBe(-12);
  });

  it('un seul relevé par compte et par mois; il ne change jamais le solde réel', () => {
    const d = base();
    const est = real(d).end;
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 500, '2027-01-21', TODAY);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 700, '2027-01-23', TODAY);
    expect(d.months[M].accountBalances).toEqual({ [MAIN_ACCOUNT_ID]: { amount: 700, on: '2027-01-23' } });
    expect(real(d).end).toBe(est);
    expect(gap(d)).not.toBeNull();
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, null, '', TODAY);
    expect(gap(d)).toBeNull();
  });

  it('CA57: mois ou année clôturé: relevé, régularisation et annulation refusés, solde réel figé', () => {
    const d = base();
    createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-21', 12, TODAY);
    const est = real(d).end;
    d.months[M].closed = true;
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1, '2027-01-21', TODAY)).toBe('locked');
    expect(createAdjustment(d, M, 'adj2', MAIN_ACCOUNT_ID, '2027-01-21', 5, TODAY)).toBe('locked');
    expect(cancelAdjustment(d, 'adj1', TODAY)).toBe(false);
    expect(real(d).end).toBe(est);
    delete d.months[M].closed;
    d.closes[2027] = { closed: true, overrides: {} };
    expect(createAdjustment(d, M, 'adj3', MAIN_ACCOUNT_ID, '2027-01-21', 5, TODAY)).toBe('locked');
    expect(cancelAdjustment(d, 'adj1', TODAY)).toBe(false);
  });

  it('CA58: date hors du mois ou future refusée, montant 0 refusé, rien d’enregistré', () => {
    const d = base();
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 5, '2026-12-31', TODAY)).toBe('outside');
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 5, '2027-01-26', TODAY)).toBe('future');
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 5, '', TODAY)).toBe('invalid');
    expect(d.months[M].accountBalances).toBeUndefined();
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2027-02-01', 5, TODAY)).toBe('outside');
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2027-01-30', 5, TODAY)).toBe('future');
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2027-01-21', 0, TODAY)).toBe('zero');
    expect(d.adjustments).toBeUndefined();
    expect(balanceDateBounds(d, M, TODAY)).toEqual({ min: '2027-01-01', max: TODAY });
    expect(balanceDateBounds(d, '2026-12', TODAY)).toEqual({ min: '2026-12-01', max: '2026-12-31' });
    expect(balanceDateBounds(d, '2027-03', TODAY).min > balanceDateBounds(d, '2027-03', TODAY).max).toBe(true);
  });

  it('un identifiant de régularisation déjà utilisé est refusé', () => {
    const d = base();
    expect(createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-21', 12, TODAY)).toBe('ok');
    expect(createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-22', 30, TODAY)).toBe('none');
    expect(d.adjustments).toHaveLength(1);
  });

  it('CA59 (amendé, spec 0041, RG9) : une régularisation est possible sur un compte d’épargne', () => {
    const d = started([ln('liv', 'epa', 100)]);
    addBankAccount(d, 'liv', 'Livret', 'epargne');
    expect(createAdjustment(d, M, 'x', 'liv', '2027-01-21', 5, TODAY)).toBe('ok');
    expect(d.adjustments).toHaveLength(1);
  });

  it('CA60: une régularisation active change le solde de l’écran Comptes, pas le budget; annulée, plus d’effet', () => {
    const d = started([ln('sal', 'rev', 100, { actual: 100 }), ln('liv', 'epa', 100, { actual: 100 })]);
    const snap = (x: BudgetData) => ({ summary: monthSummary(x, new Ledger(x, M), M), avail: availableReal(x, M), actuals: x.months[M].lines.map(l => l.actual) });
    const before = { ...snap(d), main: bank(d, MAIN_ACCOUNT_ID), cash: bank(d, 'acc-cash') };
    createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-10', -30, TODAY);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(before.main - 30);
    expect(bank(d, 'acc-cash')).toBe(before.cash);
    expect(snap(d)).toEqual({ summary: before.summary, avail: before.avail, actuals: before.actuals });
    cancelAdjustment(d, 'adj1', TODAY);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(before.main);
  });
});


describe('lignes var hors budget informatives (amendement 8)', () => {
  const T = '2027-01-25';
  const swile = (extra: Partial<Line> = {}) => ln('swile', 'var', 100, { accountId: SWILE, actual: 1.58, ...extra });
  const other = () => [ln('sal', 'rev', 2000, { actual: 2000 }), ln('ali', 'var', 400, { actual: 100 })];
  /** A month with the Swile line (Swile out of the budget) and the same month without it. */
  const pair = () => {
    const withLine = started([...other(), swile()]);
    setBankAccountInBudget(withLine, SWILE, false);
    return { withLine, without: started(other()) };
  };
  const figures = (d: BudgetData) => ({
    summary: monthSummary(d, new Ledger(d, M), M),
    avail: availableReal(d, M),
    totals: blockTotals(budgetLines(d, M), 'var'),
    rest: variableRemaining(d, M),
  });
  const main = (d: BudgetData) => accountComingUp(d, M, MAIN_ACCOUNT_ID, T)!;
  const itemsOf = (d: BudgetData) => main(d).groups.flatMap(g => g.items);

  it('une ligne var hors budget n’est jamais en retard et ne compte pas dans l’en-tête', () => {
    const d = started([swile({ dueDay: 5 }), ln('f', 'fix', 10, { dueDay: 5 })]);
    expect(lateCount(d, M, '2027-01-20')).toBe(2);
    setBankAccountInBudget(d, SWILE, false);
    expect(isLate(d, M, d.months[M].lines[0], '2027-01-20')).toBe(false);
    expect(lateCount(d, M, '2027-01-20')).toBe(1);
    expect(itemsOf(d).every(x => !x.id.startsWith('swile'))).toBe(true);
  });

  it('CA105: aucun total du budget ne la compte (comme si la ligne n’existait pas)', () => {
    const { withLine, without } = pair();
    expect(isLineInBudget(withLine, withLine.months[M].lines[2])).toBe(false);
    expect(figures(withLine)).toEqual(figures(without));
  });

  it('CA107: une ligne var du principal reste inchangée', () => {
    const d = started([ln('ali', 'var', 400, { actual: 450 })]);
    expect(main(d).total).toBe(0);
    expect(blockTotals(budgetLines(d, M), 'var')).toMatchObject({ budget: 400, actual: 450 });
  });

  it('CA110: dépense payée avec Swile: réel affiché, solde de Swile baisse, principal et totaux inchangés; un autre compte est refusé (« Payé avec » figé)', () => {
    const { withLine, without } = pair();
    withLine.months[M].lines[2].actual = null;
    addTransaction(withLine, tx('t1', 3, 1.58, 'swile', SWILE));
    expect(withLine.months[M].lines[2].actual).toBe(1.58);
    expect(bank(withLine, SWILE)).toBe(-1.58);
    expect(bank(withLine, MAIN_ACCOUNT_ID)).toBe(bank(without, MAIN_ACCOUNT_ID));
    expect(figures(withLine)).toEqual(figures(without));
    expect(addTransaction(withLine, tx('t2', 4, 5, 'swile', MAIN_ACCOUNT_ID))).toBe(false);
    expect(bank(withLine, MAIN_ACCOUNT_ID)).toBe(bank(without, MAIN_ACCOUNT_ID));
    expect(figures(withLine)).toEqual(figures(without));
  });

  it('CA111: « Restant des variables » inchangé pour une ligne hors budget, mis à jour pour une ligne dans le budget', () => {
    const { withLine } = pair();
    addTransaction(withLine, tx('t0', 2, 100, 'ali'));
    const before = variableRemaining(withLine, M);
    addTransaction(withLine, tx('t1', 3, 30, 'swile', SWILE));
    expect(variableRemaining(withLine, M)).toBe(before);
    addTransaction(withLine, tx('t2', 4, 30, 'ali'));
    expect(variableRemaining(withLine, M)).toBe(before - 30);
  });

  it('CA112: mêmes résultats sur un mois clôturé', () => {
    const { withLine, without } = pair();
    const check = () => [main(withLine).total === main(without).total, isLineInBudget(withLine, withLine.months[M].lines[2]), itemsOf(withLine).length];
    expect(check()).toEqual([true, false, 1]);
    withLine.months[M].closed = true;
    expect(check()).toEqual([true, false, 1]);
    // a month not created yet (model preview) follows the same rule
    withLine.template.lines = withLine.months[M].lines.map(({ actual: _a, ...l }) => l);
    expect(budgetLines(withLine, '2027-02').map(l => l.key)).toEqual(['sal', 'ali']);
  });

  it('CA114: sans compte hors budget, toutes les lignes comptent et rien n’est écrit', () => {
    const d = seedData();
    const before = structuredClone(d);
    for (const m of Object.keys(d.months)) expect(budgetLines(d, m)).toHaveLength(d.months[m].lines.length);
    expect(d).toEqual(before);
    expect(d.version).toBe(1);
  });

  it('CA117 et CA118: export CSV avec la colonne « Hors budget »; bascule rétroactive; même prédicat que les totaux', () => {
    const d = started([
      ln('v1', 'var', 100, { accountId: SWILE, actual: 1.58 }),
      ln('v2', 'var', 50, { payMode: 'especes' }),
      ln('f1', 'fix', 30, { accountId: SWILE }),
      ln('f2', 'fix', 20),
      ln('e1', 'epa', 10),
      ln('i1', 'inv', 5),
    ]);
    setBankAccountInBudget(d, SWILE, false);
    const csv = () => monthCsv(d.months[M].lines, { rev: 'Revenus', cre: 'Crédits', fix: 'Fixes', var: 'Variables', epa: 'Épargnes', inv: 'Placements' }, l => !isLineInBudget(d, l)).split('\r\n');
    const rows = csv();
    expect(rows[0]).toBe('\uFEFFBloc;Section;Nom;Budget;Réel;Hors budget');
    expect(rows.slice(1).map(r => r.split(';')[5])).toEqual(['oui', 'non', 'oui', 'non', 'non', 'non']);
    expect(rows[1]).toBe('Variables;;v1;100;1,58;oui');
    expect(rows).toHaveLength(7);
    setBankAccountInBudget(d, SWILE, true);
    expect(csv().slice(1).map(r => r.split(';')[5])).toEqual(['non', 'non', 'non', 'non', 'non', 'non']);
    setBankAccountInBudget(d, SWILE, false);
    d.months[M].closed = true;
    expect(csv().slice(1).map(r => r.split(';')[5])).toEqual(['oui', 'non', 'oui', 'non', 'non', 'non']);
    const out = d.months[M].lines.filter(l => !isLineInBudget(d, l)).map(l => l.key);
    expect(budgetLines(d, M).map(l => l.key).filter(k => out.includes(k))).toEqual([]);
  });
});


describe('comptes hors budget (amendement 6, spec 0019 RG12)', () => {
  const transfer = (id: string, amount: number, fromAccountId: string, toAccountId: string) => ({ id, month: M, day: 1, label: id, amount, fromAccountId, toAccountId });

  it('CA9 (0019): un transfert est réel, il débite et crédite ses deux comptes hors budget ou non', () => {
    const d = started([ln('a', 'fix', 1)]);
    d.accountMovements = [transfer('v1', 50, MAIN_ACCOUNT_ID, SWILE)];
    for (const inBudget of [true, false]) {
      setBankAccountInBudget(d, SWILE, inBudget);
      expect([bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual([950, 50]);
    }
    // et dans l'autre sens : un transfert depuis un compte hors budget débite ce compte et crédite le principal
    d.accountMovements = [transfer('v2', 20, SWILE, MAIN_ACCOUNT_ID)];
    expect([bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual([1020, -20]);
  });

  it('RG1: un ancien virement « fait » est ignoré', () => {
    const d = started([ln('a', 'fix', 1)]);
    d.transfers.push({ id: 'v1', name: 'v1', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, to: { kind: 'bank', id: SWILE } });
    d.months[M].transfersDone.v1 = true;
    expect([bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual([1000, 0]);
  });
});


describe('flux', () => {
  it('flowOf ventile par signe: un réel négatif apparaît dans l’autre colonne, le net est identique', () => {
    const m = (amount: number) => ({ date: '2027-01-01', label: 'x', amount, kind: 'line' as const });
    expect(flowOf([m(100), m(-30)])).toEqual({ in: 100, out: 30 });
    const f = flowOf([m(100), m(-30)]);
    expect(f.in - f.out).toBe(70); // the net balance is the sum of the signed amounts
  });
});
