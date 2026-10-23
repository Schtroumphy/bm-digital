import { beforeEach, describe, expect, it } from 'vitest';
import { defaultBankAccounts } from '../domain/bank';
import { emptyData } from '../domain/empty';
import { seedData } from '../domain/seed';
import type { BudgetData } from '../domain/types';
import type { BudgetRepository } from './ports';

/**
 * A budget that uses every part of the model: accounts of each kind, envelopes, a closed month, checks, statements,
 * adjustments (one cancelled), transfers to a bank account and to a saving line, a planning, year closes.
 */
export function completeData(): BudgetData {
  const d = seedData();
  d.accounts = [
    ...d.accounts,
    { id: 'acc-sav', name: 'Livret A', hue: 142.5, isDefault: false, openingBalance: 1200.5, openingMonth: '2026-10', inBudget: true, archived: false, kind: 'epargne', openingConfirmed: true },
    { id: 'acc-inv', name: 'PEA', hue: 30, isDefault: false, openingBalance: 0, openingMonth: '2026-10', inBudget: false, archived: true, kind: 'invest' },
    { id: 'acc-old', name: 'Ancien compte', hue: 10, isDefault: false, openingBalance: 5, openingMonth: '2026-10', inBudget: true, archived: false },
  ];
  d.months['2026-11'].closed = true;
  const dec = d.months['2026-12'];
  dec.lines[0] = { ...dec.lines[0], accountId: 'acc-sav', payMode: 'especes', linkedAccountId: 'acc-inv', dueDay: 5, execMode: 'prelevement' };
  d.template.lines[0] = { ...d.template.lines[0], accountId: 'acc-sav', payMode: 'virtuel', linkedAccountId: 'acc-inv', dueDay: 28, execMode: 'informatif', actual: 12.5 };
  dec.checks = { [dec.lines[0].key]: { doneOn: '2026-12-03' }, 'env:sante': { doneOn: '2026-12-01', accountId: 'acc-main' } };
  dec.accountBalances = { 'acc-main': { amount: 2345.67, on: '2026-12-15' } };
  dec.transfersDone = { bou: true, ce: false };
  d.transactions[0] = { ...d.transactions[0], accountId: 'acc-sav' };
  d.transfers = [
    { id: 't-bank', name: 'Vers livret', amount: 50, fromAccountId: 'acc-main', to: { kind: 'bank', id: 'acc-sav' } },
    { id: 't-save', name: 'Vers ligne', amount: 20, fromAccountId: 'acc-main', to: { kind: 'saving', key: 'line-key' } },
    { id: 't-none', name: 'Informatif', amount: 0, fromAccountId: 'acc-cash' },
  ];
  d.adjustments = [
    { id: 'adj1', accountId: 'acc-main', date: '2026-12-15', amount: -12.34, label: 'écart constaté', createdOn: '2026-12-15' },
    { id: 'adj2', accountId: 'acc-main', date: '2026-11-30', amount: 5, label: 'écart constaté', createdOn: '2026-11-30', cancelledOn: '2026-12-02' },
  ];
  // Spec 0013 : transaction importée, mouvement entre comptes et règle mémorisée.
  d.transactions.push({ id: 't-imp', month: '2026-12', day: 3, label: 'Paiement par carte CARREFOUR', amount: 12.5, type: 'var', target: 'inconnu', accountId: 'acc-main', importAccountId: 'acc-main', fingerprint: '2026-12-03|12.50|paiement par carte carrefour', rank: 1, category: 'Alimentation' });
  d.accountMovements = [{ id: 'm1', month: '2026-12', day: 8, label: 'Retrait au distributeur', amount: 40, fromAccountId: 'acc-main', toAccountId: 'acc-cash', importAccountId: 'acc-main', fingerprint: '2026-12-08|40.00|retrait', rank: 1, category: 'Retrait' }];
  d.importAccountLinks = [
    { id: 'l1', accountName: 'Compte Courant (x1111)', connectionName: 'Banque Test', accountId: 'acc-main' },
    { id: 'l2', accountName: 'Livret A (x1234)', connectionName: 'Banque Test', accountId: null },
  ];
  d.importRules = [
    { id: 'r1', pattern: 'carrefour', nature: 'depense', target: { kind: 'var', key: 'courses' } },
    { id: 'r2', pattern: 'retrait', nature: 'retrait', target: { kind: 'account', id: 'acc-cash' } },
  ];
  return d;
}

/**
 * Contract every `BudgetRepository` must keep (Liskov): the application works the same with any of them.
 * `create` returns a new repository over the same storage each time it is called, like reopening the app.
 */
export function describeBudgetRepositoryContract(name: string, makeStorage: () => () => BudgetRepository) {
  describe(`contrat BudgetRepository : ${name}`, () => {
    let open: () => BudgetRepository;
    beforeEach(() => {
      open = makeStorage();
    });

    it('load renvoie null quand rien n’est enregistré', async () => {
      expect(await open().load()).toBeNull();
    });

    it('sauvegarder puis recharger redonne les mêmes données (modèle complet)', async () => {
      const data = completeData();
      await open().save(data);
      expect(await open().load()).toEqual(data);
    });

    it('conserve firstMonth: null', async () => {
      const data = emptyData();
      await open().save(data);
      const loaded = await open().load();
      expect(loaded).toEqual(data);
      expect(loaded?.firstMonth).toBeNull();
    });

    it('enregistre les modifications et les suppressions', async () => {
      const repo = open();
      const data = completeData();
      await repo.save(data);
      const changed = structuredClone(data);
      changed.months['2026-12'].lines.splice(1, 1);
      changed.months['2026-12'].lines[0].budget += 10;
      changed.transactions.pop();
      delete changed.template.envAlloc[changed.envelopes.pop()!.id];
      delete changed.months['2026-12'].checks;
      changed.accounts = defaultBankAccounts('2026-10');
      await repo.save(changed);
      expect(await repo.load()).toEqual(changed);
      expect(await open().load()).toEqual(changed);
    });

    it('des sauvegardes rapprochées s’appliquent dans l’ordre : la dernière gagne', async () => {
      const repo = open();
      const a = completeData();
      const b = structuredClone(a);
      b.settings.emergencyTarget = 1;
      const c = structuredClone(a);
      c.settings.emergencyTarget = 2;
      c.transactions = [];
      await Promise.all([repo.save(a), repo.save(b), repo.save(c)]);
      expect(await open().load()).toEqual(c);
    });
  });
}
