import { describe, expect, it } from 'vitest';
import { addTransaction, applyTemplate, deleteTransaction } from './actions';
import { addEnvelope } from './envelopes';
import { setBankAccountInBudget, setTransactionAccount } from './bankAccounts';
import { availableReal, lineRemaining, monthSummary } from '../domain/budget';
import { CASH_ACCOUNT_ID, defaultBankAccounts, MAIN_ACCOUNT_ID } from '../domain/bank';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import type { BudgetData, Line, Transaction } from '../domain/types';

/*
 * Spec 0008: the actual of a variable line counts every `var` expense on it, whatever the
 * paying account; envelopes and savings withdrawals keep leaving out an out-of-budget account.
 */

const M = '2027-01';
const ln = (key: string, block: Line['block'], budget: number, actual: number | null = null): Line => ({ key, block, section: '', name: key, budget, actual });
const tx = (over: Partial<Transaction> = {}): Transaction => ({ id: 't1', month: M, day: 3, label: 'x', amount: 40, type: 'var', target: 'ali', accountId: CASH_ACCOUNT_ID, ...over });
const real = (d: BudgetData, key = 'ali', m = M) => d.months[m].lines.find(l => l.key === key)!.actual;
const balance = (d: BudgetData, id: string) => new Ledger(d, M).bankMonth(id, M)!.balance;

/** Main account (100 €), Espèces (50 €, out of the budget), one month with a variable line « ali » (400 €), an envelope and a savings line. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 100;
  d.accounts[1].openingBalance = 50;
  d.accounts[1].inBudget = false;
  d.months[M] = { initialized: true, lines: [ln('rev', 'rev', 2000), ln('ali', 'var', 400), ln('liv', 'epa', 0)], alloc: { e: 0 }, transfersDone: {} };
  d.template = { lines: d.months[M].lines.map(({ actual: _a, ...l }) => l), envAlloc: { e: 0 } };
  addEnvelope(d, 'e', 'Env', M);
  return d;
}

describe('réel d’une ligne variable (0008)', () => {
  it('CA1: une dépense payée en Espèces (hors budget) donne un réel de 40 € et baisse le solde Espèces', () => {
    const d = started();
    addTransaction(d, tx());
    expect(real(d)).toBe(40);
    expect(balance(d, CASH_ACCOUNT_ID)).toBe(10);
  });

  it('CA2: supprimer la dépense restaure le réel (vide s’il n’y a plus de dépense, sinon la somme des autres)', () => {
    const d = started();
    addTransaction(d, tx());
    deleteTransaction(d, 't1');
    expect(real(d)).toBeNull();
    // Réel vide : le restant égale le budget.
    expect(lineRemaining(d.months[M].lines[1])).toBe(400);
    addTransaction(d, tx({ id: 'a', amount: 10, accountId: MAIN_ACCOUNT_ID }));
    addTransaction(d, tx({ id: 'b' }));
    deleteTransaction(d, 'b');
    expect(real(d)).toBe(10);
  });

  it('CA3: deux dépenses (principal et hors budget) : réel = somme, chaque dépense comptée une fois dans les soldes', () => {
    const d = started();
    addTransaction(d, tx({ id: 'a', amount: 25, accountId: MAIN_ACCOUNT_ID }));
    addTransaction(d, tx({ id: 'b', amount: 40 }));
    expect(real(d)).toBe(65);
    expect(balance(d, MAIN_ACCOUNT_ID)).toBe(75);
    expect(balance(d, CASH_ACCOUNT_ID)).toBe(10);
  });

  it('CA4: changer le réglage « Dans le budget » du compte ne change pas le réel', () => {
    const d = started();
    addTransaction(d, tx());
    setBankAccountInBudget(d, CASH_ACCOUNT_ID, true);
    expect(real(d)).toBe(40);
    setBankAccountInBudget(d, CASH_ACCOUNT_ID, false);
    expect(real(d)).toBe(40);
  });

  it('CA5: changer le compte d’une dépense ne change pas le réel et met à jour les deux soldes', () => {
    const d = started();
    addTransaction(d, tx({ accountId: MAIN_ACCOUNT_ID }));
    setTransactionAccount(d, 't1', CASH_ACCOUNT_ID);
    expect(real(d)).toBe(40);
    expect(balance(d, MAIN_ACCOUNT_ID)).toBe(100);
    expect(balance(d, CASH_ACCOUNT_ID)).toBe(10);
  });

  it('CA6: « Reste à placer » et « Disponible (réel) » ne bougent pas', () => {
    const d = started();
    const before = [monthSummary(d, new Ledger(d, M), M).remaining, availableReal(d, M)];
    addTransaction(d, tx());
    expect([monthSummary(d, new Ledger(d, M), M).remaining, availableReal(d, M)]).toEqual(before);
  });

  it('CA7: une sortie d’épargne sur un compte hors budget reste exclue du budget, le solde monte ; une dépense d’enveloppe reste sur son compte, dans le budget (0011, RG10)', () => {
    const d = started();
    const before = monthSummary(d, new Ledger(d, M), M);
    addTransaction(d, tx({ id: 'e1', type: 'env', target: 'e', amount: 15, accountId: CASH_ACCOUNT_ID }));
    addTransaction(d, tx({ id: 'p1', type: 'epa', target: 'liv', amount: 20 }));
    const after = monthSummary(d, new Ledger(d, M), M);
    expect(after.envelopeSpent).toBe(before.envelopeSpent + 15);
    expect(after.savingsOut).toBe(before.savingsOut);
    expect(new Ledger(d, M).envMonth('e', M)!.spent).toBe(15);
    expect(balance(d, CASH_ACCOUNT_ID)).toBe(50 + 20);
  });

  it('un mois créé ensuite avec des dépenses déjà saisies reprend toutes les dépenses', () => {
    const d = started();
    addTransaction(d, tx({ month: '2027-02' }));
    applyTemplate(d, '2027-02');
    expect(real(d, 'ali', '2027-02')).toBe(40);
  });
});

describe('restant d’une ligne variable (0008)', () => {
  it('CA8: budget 400 / réel 450 → −50 ; réel 40 → 360', () => {
    expect(lineRemaining(ln('a', 'var', 400, 450))).toBe(-50);
    expect(lineRemaining(ln('a', 'var', 400, 40))).toBe(360);
  });

  it('CA9: sans réel, le restant est le budget entier', () => {
    expect(lineRemaining(ln('a', 'var', 400))).toBe(400);
  });
});
