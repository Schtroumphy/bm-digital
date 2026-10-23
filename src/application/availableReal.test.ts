import { describe, expect, it } from 'vitest';
import { setEnvelopeAllocation } from './actions';
import { addEnvelope } from './envelopes';
import { setLineAccount, setMainBankAccount, setBankAccountInBudget, archiveBankAccount } from './bankAccounts';
import { CASH_ACCOUNT_ID, defaultBankAccounts, MAIN_ACCOUNT_ID, accountIdOf } from '../domain/bank';
import { availableReal, monthSummary } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import type { BlockKey, BudgetData, Line } from '../domain/types';

const M = '2027-01';
const TODAY = '2027-01';
const DEDIE = 'acc-travaux';

const ln = (key: string, block: BlockKey, budget: number, actual: number | null, accountId?: string): Line => ({
  key, block, section: '', name: key, budget, actual, ...(accountId ? { accountId } : {}),
});

/** A started budget: main account (100 € at the start), « Espèces », a dedicated account « Travaux », one month. */
function started(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [...defaultBankAccounts(M), { id: DEDIE, name: 'Travaux', hue: 30, isDefault: false, openingBalance: 0, openingMonth: M, inBudget: true, archived: false }];
  d.accounts[0].openingBalance = 100;
  d.months[M] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  return d;
}

const avail = (d: BudgetData) => availableReal(d, M);
const remaining = (d: BudgetData) => monthSummary(d, new Ledger(d, TODAY), M).remaining;

describe('disponible à placer (réel)', () => {
  it('CA1: un revenu imprévu sur le principal augmente le disponible, pas le reste à placer', () => {
    const d = started([ln('sal', 'rev', 500, 500), ln('rembt', 'rev', 0, 120)]);
    expect(remaining(d)).toBe(500);
    expect(avail(d)).toBe(620);
  });

  it('CA2: un revenu inférieur au prévu fait baisser le disponible', () => {
    const d = started([ln('sal', 'rev', 2950, 2800)]);
    expect(avail(d)).toBe(remaining(d) - 150);
  });

  it('CA3: les écarts positifs et négatifs se compensent', () => {
    const d = started([ln('sal', 'rev', 2950, 2800), ln('rembt', 'rev', 0, 120)]);
    expect(avail(d)).toBe(remaining(d) - 30);
  });

  it('CA4: un revenu sans réel contribue pour 0', () => {
    const d = started([ln('sal', 'rev', 1000, null)]);
    expect(avail(d)).toBe(remaining(d));
  });

  it('CA5: un revenu direct sur un dédié ne change pas le disponible, mais crédite le dédié', () => {
    const d = started([ln('pret', 'rev', 0, 20000, DEDIE)]);
    expect(avail(d)).toBe(remaining(d));
  });

  it('CA6: le budget d’un revenu sur un dédié sort de la base du disponible', () => {
    const d = started([ln('sal', 'rev', 1000, 1200, DEDIE)]);
    expect(remaining(d)).toBe(1000);
    expect(avail(d)).toBe(remaining(d) - 1000);
  });

  it('CA7: déplacer une ligne du principal vers un dédié, et inversement', () => {
    const d = started([ln('rembt', 'rev', 0, 120)]);
    const before = avail(d)!;
    expect(setLineAccount(d, M, 'rembt', DEDIE)).toBe(true);
    expect(avail(d)).toBe(before - 120);
    setLineAccount(d, M, 'rembt', MAIN_ACCOUNT_ID);
    expect(avail(d)).toBe(before);
  });

  it('CA8: une ligne budgétée basculée sur un dédié n’est plus dans la base du principal', () => {
    const d = started([ln('sal', 'rev', 1000, null)]);
    expect(avail(d)).toBe(1000);
    setLineAccount(d, M, 'sal', DEDIE);
    expect(avail(d)).toBe(0);
    // Comme compte principal explicite, la ligne compte de nouveau.
    setLineAccount(d, M, 'sal', MAIN_ACCOUNT_ID);
    expect(avail(d)).toBe(1000);
  });

  it('CA9: un dédié archivé est exclu du disponible mais reste dans son solde', () => {
    const d = started([ln('x', 'rev', 0, 500, DEDIE)]);
    expect(archiveBankAccount(d, DEDIE)).toBe(true);
    expect(avail(d)).toBe(remaining(d));
  });

  it('CA10: un dédié hors budget est exclu du disponible et du reste, pas de son solde', () => {
    const d = started([ln('sal', 'rev', 1000, 1000), ln('x', 'rev', 300, 300, DEDIE)]);
    setBankAccountInBudget(d, DEDIE, false);
    expect(remaining(d)).toBe(1000);
    expect(avail(d)).toBe(1000);
  });

  it('CA11: placer l’argent sur une ligne d’investissement fait revenir le disponible', () => {
    const d = started([ln('pret', 'rev', 0, 20000), ln('ldds', 'inv', 0, null)]);
    const withIncome = avail(d)!;
    expect(withIncome).toBe(20000);
    d.months[M].lines[1].actual = 20000;
    expect(avail(d)).toBe(0);
    expect(new Ledger(d, TODAY).accMonth('ldds', M)!.balance).toBe(20000);
  });

  it('CA12: un versement inférieur au budget d’épargne fait monter le disponible ; sans réel, 0', () => {
    const d = started([ln('livret', 'epa', 300, 200)]);
    expect(avail(d)).toBe(remaining(d) + 100);
    d.months[M].lines[0].actual = null;
    expect(avail(d)).toBe(remaining(d));
  });

  it('CA14: modifier l’allocation d’une enveloppe fait varier le reste et le disponible du même montant', () => {
    const d = started([ln('sal', 'rev', 1000, 1000)]);
    addEnvelope(d, 'sante', 'Santé', M);
    const [r, a] = [remaining(d), avail(d)!];
    setEnvelopeAllocation(d, M, 'sante', 80);
    expect(remaining(d)).toBe(r - 80);
    expect(avail(d)).toBe(a - 80);
  });

  it('CA15: un virement « fait » du principal vers un autre compte ne change pas le disponible', () => {
    const d = started([ln('sal', 'rev', 1000, 1000)]);
    d.transfers.push({ id: 't1', name: 'Vers espèces', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, to: { kind: 'bank', id: CASH_ACCOUNT_ID } });
    const before = avail(d);
    d.months[M].transfersDone.t1 = true; // no screen marks it any more (spec 0009), old data may still hold it
    expect(avail(d)).toBe(before);
  });

  it('CA16: changer de compte principal ne modifie pas l’historique des mois', () => {
    const d = started([ln('sal', 'rev', 1000, 1000), ln('loyer', 'fix', 400, 400), ln('v', 'var', 50, 3)]);
    d.transactions.push({ id: 'x', month: M, day: 2, label: 'Café', amount: 3, type: 'var', target: 'v' });
    const bank = (x: BudgetData, id: string) => new Ledger(x, TODAY).bankMonth(id, M)!.balance;
    const effective = (x: BudgetData) => [...x.months[M].lines.map(l => accountIdOf(x, l.accountId)),...x.transactions.map(t => accountIdOf(x, t.accountId))];
    const balances = (x: BudgetData) => x.accounts.map(a => new Ledger(x, TODAY).bankMonth(a.id, M)?.balance ?? null);
    const ledgerBefore = balances(d);
    const before = { eff: effective(d), main: bank(d, MAIN_ACCOUNT_ID), other: bank(d, DEDIE), lines: structuredClone(d.months[M].lines.map(l => [l.budget, l.actual])), remaining: remaining(d) };
    expect(setMainBankAccount(d, DEDIE)).toBe(true);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(before.main);
    expect(bank(d, DEDIE)).toBe(before.other);
    expect(balances(d)).toEqual(ledgerBefore);
    expect(d.months[M].lines.map(l => [l.budget, l.actual])).toEqual(before.lines);
    expect(remaining(d)).toBe(before.remaining);
    // The available of a past month is out of scope (RG20). Every line, variable ones included, stays on the old main account.
    expect(effective(d)).toEqual(before.eff);
    expect(d.months[M].lines.find(l => l.key === 'v')!.accountId).toBe(MAIN_ACCOUNT_ID);
  });

  it('CA17: un mois non initialisé n’a pas de disponible', () => {
    const d = started([]);
    expect(availableReal(d, '2027-02')).toBeNull();
    expect(monthSummary(d, new Ledger(d, TODAY), '2027-02').availableReal).toBeNull();
  });
});
