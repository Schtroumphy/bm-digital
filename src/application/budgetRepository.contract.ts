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
  // Spec 0025 : lignes d'« Investir » choisies et échéances des objectifs.
  d.settings = { ...d.settings, investAccounts: ['l-ep'], emergencyDue: '2027-12-31', investDue: '2028-06-30' };
  const dec = d.months['2026-12'];
  dec.lines[0] = { ...dec.lines[0], accountId: 'acc-sav', payMode: 'especes', linkedAccountId: 'acc-inv', dueDay: 5, execMode: 'prelevement' };
  d.template.lines[0] = { ...d.template.lines[0], accountId: 'acc-sav', payMode: 'virtuel', linkedAccountId: 'acc-inv', dueDay: 28, execMode: 'informatif' };
  dec.checks = { [dec.lines[0].key]: { doneOn: '2026-12-03' }, 'env:sante': { doneOn: '2026-12-01', accountId: 'acc-main' } };
  // Spec 0027 : notes du mois (une faite), et une note sur un mois non initialisé.
  dec.notes = [{ id: 'n1', text: 'Appeler la banque', done: false }, { id: 'n2', text: 'Relire le contrat', done: true }];
  d.months['2027-03'] = { initialized: false, lines: [], alloc: {}, transfersDone: {}, notes: [{ id: 'n3', text: 'Préparer le mois', done: false }] };
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
  d.transactions.push({ id: 't-imp', month: '2026-12', day: 3, label: 'Paiement par carte CARREFOUR', amount: 12.5, type: 'var', target: 'inconnu', accountId: 'acc-main', importAccountId: 'acc-main', fingerprint: '2026-12-03|12.50|paiement par carte carrefour', rank: 1, category: 'Alimentation', detail: 'Courses de la semaine' });
  // Spec 0026 : dépense d'enveloppe payée en espèces, et espèces d'ouverture de l'enveloppe.
  d.transactions.push({ id: 't-esp', month: '2026-12', day: 6, label: 'Marché', amount: 8, type: 'env', target: d.envelopes[0].id, accountId: d.envelopes[0].accountId, payMode: 'especes' });
  d.envelopes[0].openingCash = 5;
  // Spec 0014 : dépense sur une ligne fixe et règle vers une ligne fixe.
  const fixLine = dec.lines.find(l => l.block === 'fix')!;
  d.transactions.push({ id: 't-fix', month: '2026-12', day: 5, label: 'Prélèvement', amount: 62, type: 'fix', target: fixLine.key, accountId: fixLine.accountId ?? 'acc-main' });
  // Spec 0015 : entrée sur une ligne de revenu, avec une date bancaire différente du mois de rattachement.
  const revLine = dec.lines.find(l => l.block === 'rev')!;
  d.transactions.push({ id: 't-rev', month: '2026-12', day: 1, label: 'Salaire', amount: 2480, type: 'rev', target: revLine.key, accountId: revLine.accountId ?? 'acc-main', bankDate: '2026-11-28' });
  d.accountMovements = [{ id: 'm1', month: '2026-12', day: 8, label: 'Retrait au distributeur', amount: 40, fromAccountId: 'acc-main', toAccountId: 'acc-cash', importAccountId: 'acc-main', fingerprint: '2026-12-08|40.00|retrait', rank: 1, category: 'Retrait', detail: 'Pour le marché', bankDate: '2026-12-08', target: { kind: 'env', id: 'e-vc' } }];
  d.importAccountLinks = [
    { id: 'l1', accountName: 'Compte Courant (x1111)', connectionName: 'Banque Test', accountId: 'acc-main' },
    { id: 'l2', accountName: 'Livret A (x1234)', connectionName: 'Banque Test', accountId: null },
  ];
  d.importRules = [
    { id: 'r1', pattern: 'carrefour', nature: 'depense', target: { kind: 'var', key: 'courses' } },
    { id: 'r2', pattern: 'retrait', nature: 'retrait', target: { kind: 'account', id: 'acc-cash' } },
    { id: 'r-fix', pattern: 'edf', nature: 'depense', target: { kind: 'line', key: fixLine.key } },
    { id: 'r-rev', pattern: 'acme', nature: 'revenu', target: { kind: 'line', key: revLine.key } },
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

    it('spec 0020 : le détail des écritures est conservé, puis vidé, et des écritures sans détail restent sans détail', async () => {
      const repo = open();
      const data = completeData();
      await repo.save(data);
      const loaded = (await repo.load())!;
      expect(loaded.transactions.find(t => t.id === 't-imp')!.detail).toBe('Courses de la semaine');
      expect(loaded.accountMovements![0].detail).toBe('Pour le marché');
      // Les autres écritures n'avaient pas de détail : elles n'en ont toujours pas (CA8).
      expect(loaded.transactions.filter(t => t.id !== 't-imp').every(t => !('detail' in t))).toBe(true);
      const cleared = structuredClone(loaded);
      delete cleared.transactions.find(t => t.id === 't-imp')!.detail;
      delete cleared.accountMovements![0].detail;
      await repo.save(cleared);
      expect(await open().load()).toEqual(cleared);
    });

    it('spec 0028 : l’affectation d’une opération à un compte d’épargne est conservée, puis retirée', async () => {
      const repo = open();
      const data = completeData();
      data.transactions.find(t => t.id === 't-imp')!.assignedAccountId = 'acc-sav';
      await repo.save(data);
      const loaded = (await repo.load())!;
      expect(loaded.transactions.find(t => t.id === 't-imp')!.assignedAccountId).toBe('acc-sav');
      // Les autres opérations n'ont pas d'affectation : elles n'en ont toujours pas.
      expect(loaded.transactions.filter(t => t.id !== 't-imp').every(t => !('assignedAccountId' in t))).toBe(true);
      const cleared = structuredClone(loaded);
      delete cleared.transactions.find(t => t.id === 't-imp')!.assignedAccountId;
      await repo.save(cleared);
      expect(await open().load()).toEqual(cleared);
    });

    it('spec 0031 : le marquage « hors budget » d’une opération est conservé, puis retiré', async () => {
      const repo = open();
      const data = completeData();
      data.transactions.find(t => t.id === 't-imp')!.offBudget = true;
      await repo.save(data);
      const loaded = (await repo.load())!;
      expect(loaded.transactions.find(t => t.id === 't-imp')!.offBudget).toBe(true);
      expect(loaded.transactions.filter(t => t.id !== 't-imp').every(t => !('offBudget' in t))).toBe(true);
      const cleared = structuredClone(loaded);
      delete cleared.transactions.find(t => t.id === 't-imp')!.offBudget;
      await repo.save(cleared);
      expect(await open().load()).toEqual(cleared);
    });

    it('spec 0016 : un virement lié (deux traces), un crédit seul, un débit « vers enveloppes » et la source d’un revenu sont conservés', async () => {
      const repo = open();
      const data = completeData();
      data.accountMovements!.push(
        { id: 'm-lie', month: '2026-12', day: 28, label: 'Virement livret', amount: 300, fromAccountId: 'acc-main', toAccountId: 'acc-sav', importAccountId: 'acc-main', fingerprint: '2026-12-28|300.00|virement', rank: 1, bankDate: '2026-12-28', creditTrace: { importAccountId: 'acc-sav', fingerprint: '+2026-12-29|300.00|virement', rank: 1, bankDate: '2026-12-29' } },
        { id: 'm-credit', month: '2026-12', day: 22, label: 'Cagnotte', amount: 50, fromAccountId: 'enveloppes', toAccountId: 'acc-sav', bankDate: '2026-12-22', creditTrace: { importAccountId: 'acc-sav', fingerprint: '+2026-12-22|50.00|cagnotte', rank: 1, bankDate: '2026-12-22' } },
        { id: 'm-pool', month: '2026-12', day: 2, label: 'Lydia', amount: 300, fromAccountId: 'acc-main', toAccountId: 'enveloppes', importAccountId: 'acc-main', fingerprint: '2026-12-02|300.00|lydia', rank: 1, bankDate: '2026-12-02' },
      );
      data.transactions.push({ id: 't-src', month: '2026-12', day: 1, label: 'Salaire', amount: 2480, type: 'rev', target: 'r-sal', source: 'ACME' });
      await repo.save(data);
      const loaded = (await repo.load())!;
      expect(loaded.accountMovements!.find(m => m.id === 'm-lie')!.creditTrace).toEqual({ importAccountId: 'acc-sav', fingerprint: '+2026-12-29|300.00|virement', rank: 1, bankDate: '2026-12-29' });
      expect(loaded.accountMovements!.find(m => m.id === 'm-credit')).not.toHaveProperty('fingerprint');
      expect(loaded.accountMovements!.find(m => m.id === 'm-pool')!.toAccountId).toBe('enveloppes');
      expect(loaded.accountMovements!.find(m => m.id === 'm1')).not.toHaveProperty('creditTrace');
      expect(loaded.transactions.find(t => t.id === 't-src')!.source).toBe('ACME');
      expect(loaded).toEqual(data);
    });

    it('spec 0019 : la cible d’un transfert est conservée, les transferts sans cible restent sans cible', async () => {
      const repo = open();
      const data = completeData();
      data.accountMovements!.push({ id: 'm2', month: '2026-12', day: 9, label: 'Virement libre', amount: 10, fromAccountId: 'acc-main', toAccountId: 'acc-cash' });
      data.accountMovements!.push({ id: 'm3', month: '2026-12', day: 10, label: 'Versement', amount: 20, fromAccountId: 'acc-main', toAccountId: 'acc-inv', target: { kind: 'line', key: 'l-ep' } });
      await repo.save(data);
      const loaded = (await repo.load())!;
      expect(loaded.accountMovements!.find(m => m.id === 'm1')!.target).toEqual({ kind: 'env', id: 'e-vc' });
      expect(loaded.accountMovements!.find(m => m.id === 'm2')).not.toHaveProperty('target');
      expect(loaded.accountMovements!.find(m => m.id === 'm3')!.target).toEqual({ kind: 'line', key: 'l-ep' });
      expect(loaded).toEqual(data);
    });

    it('spec 0025 : investAccounts et les échéances sont restitués ; absents, ils restent absents', async () => {
      const repo = open();
      const data = completeData();
      await repo.save(data);
      const loaded = (await repo.load())!;
      expect(loaded.settings.investAccounts).toEqual(['l-ep']);
      expect(loaded.settings.emergencyDue).toBe('2027-12-31');
      expect(loaded.settings.investDue).toBe('2028-06-30');
      const old = structuredClone(data);
      delete old.settings.investAccounts;
      delete old.settings.emergencyDue;
      delete old.settings.investDue;
      await repo.save(old);
      const reloaded = (await repo.load())!;
      expect(reloaded.settings).not.toHaveProperty('investAccounts');
      expect(reloaded.settings).not.toHaveProperty('emergencyDue');
      expect(reloaded.settings).not.toHaveProperty('investDue');
      expect(reloaded).toEqual(old);
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
