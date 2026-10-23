import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, undoValidateMonth, updateLine, validateMonth } from './actions';
import { checkLine, uncheckLine } from './checkoff';
import { addBankAccount, archiveBankAccount, setLineAccount } from './bankAccounts';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { bankMovements } from '../domain/bankMovements';
import { accountPointage, lineTooltip, monthBalance } from '../domain/checkoff';
import { blockTotals } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { CARRIED_ACCOUNT_REFUSAL, actualReplacedBy, expenseLineBlocker } from '../domain/lineExpenses';
import type { BlockKey, BudgetData, Line, Transaction } from '../domain/types';

const M = '2027-01';
const SWILE = 'acc-swile';
const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

function started(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, SWILE, 'Swile');
  d.months[M] = { initialized: true, lines: structuredClone(lines), alloc: {}, transfersDone: {} };
  return d;
}
const fx = (id: string, day: number, amount: number, target: string, accountId?: string): Transaction => ({ id, month: M, day, label: id, amount, type: 'fix', target, ...(accountId ? { accountId } : {}) });
const main = (d: BudgetData) => new Ledger(d, M).bankMonth(MAIN_ACCOUNT_ID, M)!.balance;
const actual = (d: BudgetData, key: string) => d.months[M].lines.find(l => l.key === key)!.actual;

describe('dépense sur ligne fixe ou crédit (spec 0014)', () => {
  it('CA1/CA2: le réel est la somme des dépenses, au compte de la ligne', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(addTransaction(d, fx('a', 5, 62, 'edf'))).toBe(true);
    expect(actual(d, 'edf')).toBe(62);
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    addTransaction(d, fx('b', 6, 10, 'edf'));
    expect(actual(d, 'edf')).toBe(72);
  });

  it('CA3: une ligne crédit est acceptée', () => {
    const d = started([ln('pret', 'cre', 300)]);
    expect(addTransaction(d, fx('a', 5, 300, 'pret'))).toBe(true);
  });

  it('CA4: refusée sur rev, epa, inv, var, ligne inconnue ou mois non créé', () => {
    const d = started([ln('sal', 'rev', 1), ln('liv', 'epa', 1), ln('pea', 'inv', 1), ln('co', 'var', 1)]);
    for (const k of ['sal', 'liv', 'pea', 'co', 'inconnue']) expect(addTransaction(d, fx(k, 5, 10, k))).toBe(false);
    expect(addTransaction(d, { ...fx('x', 5, 10, 'sal'), month: '2027-03' })).toBe(false);
    expect(d.transactions).toEqual([]);
  });

  it('CA5 / RG2: refusée sur un autre compte que celui de la ligne ; sans compte, elle prend celui de la ligne', () => {
    const d = started([ln('edf', 'fix', 62), ln('cant', 'fix', 20, { accountId: SWILE })]);
    expect(addTransaction(d, fx('a', 5, 62, 'edf', SWILE))).toBe(false);
    expect(addTransaction(d, fx('b', 5, 20, 'cant', MAIN_ACCOUNT_ID))).toBe(false);
    expect(addTransaction(d, fx('c', 5, 20, 'cant'))).toBe(true);
    expect(d.transactions[0].accountId).toBe(SWILE);
  });

  it('CA6 / RG6: un réel saisi n’est remplacé qu’avec la confirmation (replaceActual)', () => {
    const d = started([ln('edf', 'fix', 62, { actual: 60 })]);
    expect(actualReplacedBy(d, M, 'edf')).toBe(60);
    expect(addTransaction(d, fx('a', 5, 62, 'edf'))).toBe(false);
    expect(d.transactions).toEqual([]);
    expect(actual(d, 'edf')).toBe(60);
    expect(addTransaction(d, fx('a', 5, 62, 'edf'), { replaceActual: true })).toBe(true);
    expect(actual(d, 'edf')).toBe(62);
    // Une fois la ligne portée, plus de remplacement à confirmer.
    expect(actualReplacedBy(d, M, 'edf')).toBeNull();
    expect(addTransaction(d, fx('b', 6, 5, 'edf'))).toBe(true);
    expect(actual(d, 'edf')).toBe(67);
  });

  it('un réel saisi à 0 est aussi remplacé après confirmation', () => {
    const d = started([ln('edf', 'fix', 62, { actual: 0 })]);
    expect(actualReplacedBy(d, M, 'edf')).toBe(0);
  });

  it('CA7: le réel d’une ligne qui porte des dépenses ne peut pas être modifié à la main, le reste oui', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(updateLine(d, M, 'edf', { actual: 10 })).toBe(true);
    d.months[M].lines[0].actual = null;
    addTransaction(d, fx('a', 5, 62, 'edf'));
    expect(updateLine(d, M, 'edf', { actual: 10 })).toBe(false);
    expect(updateLine(d, M, 'edf', { budget: 70 })).toBe(true);
    expect(actual(d, 'edf')).toBe(62);
  });

  it('CA8: non pointée, seule la dépense baisse le compte, à sa date', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    expect(main(d)).toBe(940);
    expect(bankMovements(d, MAIN_ACCOUNT_ID, M, 'actual').map(m => [m.date, m.amount])).toEqual([['2027-01-05', -60]]);
  });

  it('CA9 / RG11: pointée et dépensée, une seule sortie ; pointer ou dépointer ne change aucun solde', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    const before = main(d);
    checkLine(d, M, 'edf', '2027-01-03');
    expect(main(d)).toBe(before);
    expect(bankMovements(d, MAIN_ACCOUNT_ID, M, 'checks').map(m => [m.date, m.amount])).toEqual([['2027-01-05', -60]]);
    uncheckLine(d, M, 'edf');
    expect(main(d)).toBe(before);
  });

  it('CA10: les deux modes comptent la dépense et pas le mouvement propre de la ligne', () => {
    for (const pointage of [false, true]) {
      const d = started([ln('edf', 'fix', 62)]);
      if (pointage) d.settings.pointageStart = M;
      checkLine(d, M, 'edf', '2027-01-03');
      addTransaction(d, fx('a', 5, 60, 'edf'));
      const movements = bankMovements(d, MAIN_ACCOUNT_ID, M, pointage ? 'checks' : 'actual');
      expect(movements.map(m => m.amount)).toEqual([-60]);
      expect(movements[0].date).toBe('2027-01-05');
    }
  });

  it('CA11 / RG12: supprimer la dernière dépense vide le réel (non restauré) et rend son mouvement à la ligne', () => {
    const d = started([ln('edf', 'fix', 62, { actual: 60 })]);
    addTransaction(d, fx('a', 5, 62, 'edf'), { replaceActual: true });
    checkLine(d, M, 'edf', '2027-01-03');
    expect(deleteTransaction(d, 'a')).toBe(true);
    expect(actual(d, 'edf')).toBeNull();
    // Pointée sans réel : son budget à la date du pointage (mode pointage).
    d.settings.pointageStart = M;
    expect(bankMovements(d, MAIN_ACCOUNT_ID, M, 'checks').map(m => [m.date, m.amount])).toEqual([['2027-01-03', -62]]);
  });

  it('CA11: sans pointage, plus rien n’est compté après la suppression', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    deleteTransaction(d, 'a');
    expect(main(d)).toBe(1000);
  });

  it('CA12: avec deux dépenses, en supprimer une fait baisser le réel et la ligne reste portée', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    addTransaction(d, fx('b', 6, 10, 'edf'));
    deleteTransaction(d, 'b');
    expect(actual(d, 'edf')).toBe(60);
    expect(main(d)).toBe(940);
  });

  it('CA13 / CA13a: « Reste à sortir » est inchangé par la dépense, seul le solde baisse ; pointer fait sortir la ligne', () => {
    const d = started([ln('edf', 'fix', 62)]);
    const rest = () => accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-10')!;
    const before = rest();
    expect(before.remaining).toBe(62);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    const after = rest();
    expect(after.remaining).toBe(62);
    expect(d.months[M].checks).toBeUndefined();
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)!.end).toBe(938);
    // Risque accepté : la marge compte la sortie deux fois jusqu'au pointage.
    expect(after.margin).toBe(938 - 62);
    checkLine(d, M, 'edf', '2027-01-06');
    expect(rest().remaining).toBe(0);
    expect(rest().margin).toBe(938);
  });

  it('CA15: mois clos, ajout et suppression refusés ; la dépense existante garde son effet', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    d.months[M].closed = true;
    expect(addTransaction(d, fx('b', 6, 5, 'edf'))).toBe(false);
    expect(deleteTransaction(d, 'a')).toBe(false);
    expect(main(d)).toBe(938);
  });

  it('CA16: l’écran Comptes et le solde estimé du pointage restent égaux', () => {
    // Égalité garantie sur un mois au réel (spec 0009) ; le mois au pointage lit les cases, pas le Ledger.
    {
      const d = started([ln('edf', 'fix', 62, { actual: null }), ln('pret', 'cre', 300), ln('sal', 'rev', 2000, { actual: 2000 })]);
      checkLine(d, M, 'edf', '2027-01-03');
      checkLine(d, M, 'sal', '2027-01-02');
      addTransaction(d, fx('a', 5, 60, 'edf'));
      addTransaction(d, fx('b', 7, 300, 'pret'));
      expect(monthBalance(d, M, MAIN_ACCOUNT_ID)!.end).toBe(new Ledger(d, M).bankMonth(MAIN_ACCOUNT_ID, M)!.balance);
    }
  });

  it('CA17: les totaux du Budget lisent le réel alimenté par les dépenses', () => {
    const d = started([ln('edf', 'fix', 62), ln('gaz', 'fix', 40)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    expect(blockTotals(d.months[M].lines, 'fix')).toMatchObject({ budget: 102, actual: 60, gap: 42 });
  });

  it('une dépense sur la ligne d’un autre compte n’affecte que ce compte', () => {
    const d = started([ln('cant', 'fix', 20, { accountId: SWILE })]);
    addTransaction(d, fx('a', 5, 20, 'cant'));
    expect(main(d)).toBe(1000);
    expect(new Ledger(d, M).bankMonth(SWILE, M)!.balance).toBe(-20);
    expect(new Ledger(d, M).bankMonth(CASH_ACCOUNT_ID, M)!.balance).toBe(0);
  });

  it('RG13: « Reste à sortir » ne pèse que le budget, quel que soit le montant des dépenses (60 ou 80 sur 62)', () => {
    for (const amount of [60, 80]) {
      const d = started([ln('edf', 'fix', 62)]);
      addTransaction(d, fx('a', 5, amount, 'edf'));
      const p = accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-10')!;
      expect(p.remaining).toBe(62);
      expect(p.pending[0]).toMatchObject({ amount: 62, source: 'budget' });
    }
    // Une ligne non portée garde sa règle (réel saisi compté).
    const d = started([ln('edf', 'fix', 62, { actual: 70 })]);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-10')!.remaining).toBe(70);
  });

  it('RG2: le compte d’une ligne qui porte des dépenses ne peut pas changer ; sans dépense il peut', () => {
    const d = started([ln('edf', 'fix', 62)]);
    expect(setLineAccount(d, M, 'edf', SWILE)).toBe(true);
    expect(setLineAccount(d, M, 'edf', MAIN_ACCOUNT_ID)).toBe(true);
    addTransaction(d, fx('a', 5, 62, 'edf'));
    expect(setLineAccount(d, M, 'edf', SWILE)).toBe(false);
    expect(d.months[M].lines[0].accountId).toBe(MAIN_ACCOUNT_ID);
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    expect(CARRIED_ACCOUNT_REFUSAL).toMatch(/supprimez-les ou déplacez-les/);
    deleteTransaction(d, 'a');
    expect(setLineAccount(d, M, 'edf', SWILE)).toBe(true);
  });

  it('« Valider le mois » annulé ne vide pas le réel d’une ligne portée', () => {
    const d = started([ln('edf', 'fix', 62), ln('gaz', 'fix', 40)]);
    const filled = validateMonth(d, M);
    expect(filled.map(f => f.key)).toEqual(['edf', 'gaz']);
    d.months[M].lines[0].actual = null;
    addTransaction(d, fx('a', 5, 62, 'edf'));
    undoValidateMonth(d, M, [{ key: 'edf', value: 62 }, { key: 'gaz', value: 40 }]);
    expect(actual(d, 'edf')).toBe(62);
    expect(actual(d, 'gaz')).toBeNull();
  });

  it('une dépense sur une ligne dont le compte est archivé est refusée, avec un message', () => {
    const d = started([ln('cant', 'fix', 20, { accountId: SWILE })]);
    archiveBankAccount(d, SWILE);
    expect(d.accounts.find(a => a.id === SWILE)!.archived).toBe(true);
    expect(addTransaction(d, fx('a', 5, 20, 'cant'))).toBe(false);
    expect(expenseLineBlocker(d, M, 'cant')).toMatch(/Swile.*archivé/);
    expect(expenseLineBlocker(d, M, 'inconnue')).toBeNull();
  });

  it('CA16 au pointage : la dépense compte une fois ; pointer ou dépointer la ligne ne change pas le solde estimé', () => {
    const d = started([ln('edf', 'fix', 62), ln('sal', 'rev', 2000, { actual: 2000 })]);
    d.settings.pointageStart = M;
    checkLine(d, M, 'sal', '2027-01-02');
    checkLine(d, M, 'edf', '2027-01-03');
    addTransaction(d, fx('a', 5, 60, 'edf'));
    const est = monthBalance(d, M, MAIN_ACCOUNT_ID)!.end;
    expect(est).toBe(1000 + 2000 - 60);
    uncheckLine(d, M, 'edf');
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)!.end).toBe(est);
    expect(bankMovements(d, MAIN_ACCOUNT_ID, M, 'actual').filter(m => m.amount === -60)).toHaveLength(1);
  });

  it('l’information d’une ligne portée est dans l’infobulle de la ligne (nombre, réel, compte, pointage sans effet)', () => {
    const d = started([ln('edf', 'fix', 62), ln('gaz', 'fix', 40)]);
    addTransaction(d, fx('a', 5, 60, 'edf'));
    addTransaction(d, fx('b', 6, 2, 'edf'));
    const tip = lineTooltip(d, M, d.months[M].lines[0], '2027-01-10');
    expect(tip).toMatch(/2 dépenses : le réel est leur somme/);
    expect(tip).toMatch(/Pointage sans effet/);
    expect(lineTooltip(d, M, d.months[M].lines[1], '2027-01-10')).not.toMatch(/dépense/);
  });
});
