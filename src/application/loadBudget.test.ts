import { describe, expect, it } from 'vitest';
import { loadBudget } from './loadBudget';
import type { BudgetRepository } from './ports';
import { defaultBankAccounts } from '../domain/bank';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { realMonthBalance } from '../domain/checkoff';
import type { BudgetData } from '../domain/types';

const M = '2026-10';
function withTypedActual(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.months[M] = { initialized: true, lines: [{ key: 'edf', block: 'fix', section: '', name: 'EDF', budget: 62, actual: 60 }], alloc: {}, transfersDone: {} };
  return d;
}
const memory = (initial: BudgetData) => {
  let stored = initial;
  const repo: BudgetRepository = { load: async () => structuredClone(stored), save: async d => { stored = structuredClone(d); } };
  return repo;
};

describe('chargement (spec 0019, RG22, CA20)', () => {
  it('les réels saisis sont vidés et enregistrés dès le chargement : le second chargement ne trouve plus rien à nettoyer', async () => {
    const repo = memory(withTypedActual());
    const first = await loadBudget(repo, emptyData);
    expect(first.cleared).toBe(1);
    expect(first.data.months[M].lines[0].actual).toBeNull();
    const second = await loadBudget(repo, emptyData);
    expect(second.cleared).toBe(0);
    expect(second.data.months[M].lines[0].actual).toBeNull();
  });

  it('un échec d’enregistrement n’empêche pas le chargement', async () => {
    const repo: BudgetRepository = { load: async () => withTypedActual(), save: async () => { throw new Error('hors ligne'); } };
    expect((await loadBudget(repo, emptyData)).cleared).toBe(1);
  });

  it('CA12 : le solde réel de checkoff égale Ledger.bankMonth, mois par mois et compte par compte', () => {
    const d = withTypedActual();
    d.accounts[0].openingBalance = 1000;
    d.months['2026-11'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    d.transactions.push({ id: 't', month: M, day: 5, label: 'EDF', amount: 62, type: 'fix', target: 'edf' });
    d.accountMovements = [{ id: 'm', month: '2026-11', day: 3, label: 'Retrait', amount: 40, fromAccountId: 'acc-main', toAccountId: 'acc-cash' }];
    d.adjustments = [{ id: 'a', accountId: 'acc-main', date: '2026-10-20', amount: 5, label: 'écart constaté', createdOn: '2026-10-20' }];
    const ledger = new Ledger(d, '2026-11');
    for (const m of [M, '2026-11']) for (const a of d.accounts) expect(realMonthBalance(d, m, a.id)?.end).toBe(ledger.bankMonth(a.id, m)?.balance);
  });
});

describe('objectifs (spec 0032, RG15)', () => {
  const legacyGoals = (): BudgetData => {
    const d = emptyData();
    d.firstMonth = M;
    d.accounts = defaultBankAccounts(M);
    d.settings = { emergencyAccounts: ['l'], emergencyTarget: 5000, investTarget: 0, savingsRateTarget: 30 };
    return d;
  };

  it('migre les réglages au chargement, les enregistre, et ne recommence pas au chargement suivant', async () => {
    const repo = memory(legacyGoals());
    const first = await loadBudget(repo, emptyData);
    expect(first.data.goals!.map(g => g.id)).toEqual(['goal-emergency', 'goal-savings']);
    const stored = (await repo.load())!;
    expect(stored.settings.goalsMigrated).toBe(true);
    // L'utilisateur supprime tout : rien ne revient.
    stored.goals = [];
    await repo.save(stored);
    expect((await loadBudget(repo, emptyData)).data.goals).toEqual([]);
  });

  it('un compte neuf n’enregistre rien au chargement', async () => {
    let saved = 0;
    const repo: BudgetRepository = { load: async () => null, save: async () => { saved++; } };
    await loadBudget(repo, emptyData);
    expect(saved).toBe(0);
  });
});
