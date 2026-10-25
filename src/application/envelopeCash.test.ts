import { describe, expect, it } from 'vitest';
import { addTransfer } from './accountMovements';
import { addTransaction, deleteTransaction, updateTransaction } from './actions';
import { checkEnvelope } from './checkoff';
import { addEnvelope, openingBalanceRefusal, openingCashRefusal, setEnvelopeOpeningBalance, setEnvelopeOpeningCash } from './envelopes';
import { loadBudget } from './loadBudget';
import type { BudgetRepository } from './ports';
import { availableReal, monthSummary } from '../domain/budget';
import { CASH_ACCOUNT_ID, defaultBankAccounts, MAIN_ACCOUNT_ID } from '../domain/bank';
import { estimatedMovements, realMovements } from '../domain/bankMovements';
import { emptyData } from '../domain/empty';
import { cashHistory, lowestCashBalance, virtualHistory } from '../domain/envelopeHistory';
import { envelopesGroupTotals, envelopeAccountTotal, envelopeCash, envelopeTotal, exceedsEnvelopeCash } from '../domain/envelopeCash';
import { Ledger } from '../domain/ledger';
import { migrateEnvelopeOpeningCash } from '../domain/migrate';
import type { BudgetData, Transaction } from '../domain/types';

const M = '2026-12';
const ledger = (d: BudgetData) => new Ledger(d, M);
const envAccount = (d: BudgetData) => d.envelopes[0].accountId;
/** Real balance of an account (for the envelope: its virtual balance). */
const bank = (d: BudgetData, id: string) => ledger(d).bankMonth(id, M)!.balance;
const virtual = (d: BudgetData) => ledger(d).envMonth('loisirs', M)!.balance;
const cashOf = (d: BudgetData) => envelopeCash(d, 'loisirs', M);
const net = (movements: { amount: number }[]) => movements.reduce((s, x) => s + x.amount, 0);
const spend = (d: BudgetData, amount: number, payMode?: 'especes' | 'virtuel', id = `t${d.transactions.length + 1}`): boolean => {
  const t: Transaction = { id, month: M, day: 10, label: 'Sortie', amount, type: 'env', target: 'loisirs', ...(payMode ? { payMode } : {}) };
  return addTransaction(d, t);
};
/** Transfer from `from` to the envelope « Loisirs » (attached to it). */
const feed = (d: BudgetData, amount: number, from: string, id = `m${(d.accountMovements?.length ?? 0) + 1}`) =>
  addTransfer(d, { id, month: M, day: 4, label: 'Alimentation', amount, fromAccountId: from, toAccountId: envAccount(d), target: { kind: 'env', id: 'loisirs' } });

/** « Loisirs » opens at 100 € virtual and 40 € cash; the « Espèces » account holds 50 €; the main account 1 000 €. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  d.accounts.find(a => a.id === CASH_ACCOUNT_ID)!.openingBalance = 50;
  d.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  addEnvelope(d, 'loisirs', 'Loisirs', M);
  d.accounts.find(a => a.id === envAccount(d))!.openingBalance = 100;
  d.envelopes[0].openingCash = 40;
  return d;
}

describe('solde espèces d’une enveloppe, à part du virtuel (spec 0026)', () => {
  it('CA1: 100 € virtuels et 40 € d’espèces d’ouverture : deux soldes indépendants', () => {
    const d = started();
    expect([virtual(d), bank(d, envAccount(d)), cashOf(d)]).toEqual([100, 100, 40]);
  });

  it('CA2: un transfert Espèces → enveloppe ajoute aux espèces et débite « Espèces » (réel et estimé) ; le virtuel et le compte de l’enveloppe ne bougent pas', () => {
    const d = started();
    expect(feed(d, 20, CASH_ACCOUNT_ID)).toBe(true);
    expect(cashOf(d)).toBe(60);
    expect([bank(d, CASH_ACCOUNT_ID), bank(d, envAccount(d)), virtual(d)]).toEqual([30, 100, 100]);
    expect([net(estimatedMovements(d, CASH_ACCOUNT_ID, M)), net(estimatedMovements(d, envAccount(d), M))]).toEqual([-20, 0]);
    expect([net(realMovements(d, CASH_ACCOUNT_ID, M)), net(realMovements(d, envAccount(d), M))]).toEqual([-20, 0]);
  });

  it('CA3: un transfert du principal vers l’enveloppe augmente le virtuel, pas les espèces', () => {
    const d = started();
    expect(feed(d, 20, MAIN_ACCOUNT_ID)).toBe(true);
    expect([bank(d, envAccount(d)), cashOf(d)]).toEqual([120, 40]);
  });

  it('CA4: une dépense en espèces baisse les espèces seules ; en virtuel, le virtuel seul', () => {
    const d = started();
    expect(spend(d, 15, 'especes')).toBe(true);
    expect([cashOf(d), bank(d, envAccount(d)), virtual(d)]).toEqual([25, 100, 100]);
    expect(spend(d, 10, 'virtuel')).toBe(true);
    expect([cashOf(d), bank(d, envAccount(d)), virtual(d)]).toEqual([25, 90, 90]);
    expect(d.transactions.map(t => t.payMode)).toEqual(['especes', undefined]);
  });

  it('une dépense en espèces ne bouge aucun compte (ni l’enveloppe, ni Espèces, ni le principal), dans le réel comme dans l’estimé', () => {
    const d = started();
    spend(d, 15, 'especes');
    for (const id of [envAccount(d), CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID]) {
      expect(net(realMovements(d, id, M))).toBe(0);
      expect(net(estimatedMovements(d, id, M))).toBe(0);
    }
  });

  it('D4: une dépense en espèces compte dans le « dépensé » de l’enveloppe et du bilan, sans toucher à son virtuel', () => {
    const d = started();
    spend(d, 15, 'especes');
    spend(d, 10, 'virtuel');
    expect(ledger(d).envMonth('loisirs', M)!.spent).toBe(25);
    expect(monthSummary(d, ledger(d), M).envelopeSpent).toBe(25);
    expect(virtual(d)).toBe(90);
  });

  it('parcours nominal de la spec : +20 depuis Espèces, −15 en espèces, −10 en virtuel', () => {
    const d = started();
    feed(d, 20, CASH_ACCOUNT_ID);
    expect([cashOf(d), virtual(d)]).toEqual([60, 100]);
    spend(d, 15, 'especes');
    expect([cashOf(d), virtual(d)]).toEqual([45, 100]);
    spend(d, 10);
    expect([cashOf(d), virtual(d)]).toEqual([45, 90]);
  });

  it('CA5: une dépense en espèces supérieure aux espèces est refusée, quel que soit le virtuel ; rien n’est enregistré', () => {
    const d = started();
    d.accounts.find(a => a.id === envAccount(d))!.openingBalance = 100000;
    expect(spend(d, 40.01, 'especes')).toBe(false);
    expect(d.transactions).toEqual([]);
    expect(exceedsEnvelopeCash(d, 'loisirs', M, 40)).toBe(false);
    expect(exceedsEnvelopeCash(d, 'loisirs', M, 41)).toBe(true);
    expect(spend(d, 40, 'especes')).toBe(true);
    expect(cashOf(d)).toBe(0);
  });

  it('une dépense en virtuel n’est jamais refusée pour les espèces', () => {
    const d = started();
    expect(spend(d, 90, 'virtuel')).toBe(true);
  });

  it('CA6: un virtuel négatif ne change pas les espèces et ne les borne pas', () => {
    const d = started();
    expect(spend(d, 150, 'virtuel')).toBe(true);
    expect([virtual(d), cashOf(d)]).toEqual([-50, 40]);
    expect(spend(d, 40, 'especes')).toBe(true);
  });

  it('CA10 / CA10a: le total est virtuel + espèces ; avec un virtuel de −20 € et 60 € d’espèces, 40 €', () => {
    expect(envelopeTotal(100, 60)).toBe(160);
    expect(envelopeTotal(-20, 60)).toBe(40);
  });

  it('la suppression d’une dépense ou d’un transfert recalcule les espèces', () => {
    const d = started();
    feed(d, 20, CASH_ACCOUNT_ID);
    spend(d, 15, 'especes', 'x');
    deleteTransaction(d, 'x');
    expect(cashOf(d)).toBe(60);
    d.accountMovements = [];
    expect(cashOf(d)).toBe(40);
  });

  it('supprimer un transfert d’alimentation déjà dépensé plafonne l’affichage à 0 et ne refuse rien rétroactivement', () => {
    const d = started();
    feed(d, 20, CASH_ACCOUNT_ID);
    expect(spend(d, 55, 'especes')).toBe(true);
    expect(cashOf(d)).toBe(5);
    d.accountMovements = [];
    expect(cashHistory(d, 'loisirs', M).at(-1)!.balance).toBe(-15);
    expect(cashOf(d)).toBe(0);
    expect(d.transactions).toHaveLength(1);
  });

  it('modifier une dépense en espèces garde son mode et le contrôle des espèces', () => {
    const d = started();
    expect(spend(d, 15, 'especes', 'x')).toBe(true);
    expect(updateTransaction(d, 'x', { label: 'Sortie', amount: 40, date: '2026-12-10', type: 'env', target: 'loisirs' })).toBe(true);
    expect(d.transactions[0].payMode).toBe('especes');
    expect(updateTransaction(d, 'x', { label: 'Sortie', amount: 41, date: '2026-12-10', type: 'env', target: 'loisirs' })).toBe(false);
    expect(d.transactions[0].amount).toBe(40);
  });

  it('le mode de paiement n’existe que sur une dépense d’enveloppe', () => {
    const d = started();
    d.months[M].lines = [{ key: 'courses', block: 'var', section: '', name: 'Courses', budget: 100, actual: null }];
    expect(addTransaction(d, { id: 'v', month: M, day: 2, label: 'Courses', amount: 5, type: 'var', target: 'courses', payMode: 'especes' })).toBe(true);
    expect(d.transactions[0].payMode).toBeUndefined();
  });

  it('CA11: les espèces ne changent ni les totaux budgétaires, ni « Reste à placer », ni « Disponible »', () => {
    const d = started();
    d.months[M].lines = [{ key: 'sal', block: 'rev', section: '', name: 'Salaire', budget: 2000, actual: null }];
    const figures = () => {
      const s = monthSummary(d, ledger(d), M);
      return [s.income, s.expenses, s.savings, s.remaining, s.grossSavings, availableReal(d, M)];
    };
    const before = figures();
    d.envelopes[0].openingCash = 10;
    expect(figures()).toEqual(before);
    feed(d, 20, CASH_ACCOUNT_ID);
    expect(figures()).toEqual(before);
  });

  it('un transfert d’espèces ne remplace pas la contrepartie d’une allocation pointée (il n’alimente pas le virtuel)', () => {
    const d = started();
    d.months[M].alloc = { loisirs: 20 };
    checkEnvelope(d, M, 'loisirs', '2026-12-02');
    const mainBefore = net(estimatedMovements(d, MAIN_ACCOUNT_ID, M));
    expect(mainBefore).toBe(-20);
    feed(d, 20, CASH_ACCOUNT_ID);
    expect(net(estimatedMovements(d, MAIN_ACCOUNT_ID, M))).toBe(-20);
    expect(net(estimatedMovements(d, envAccount(d), M))).toBe(20);
  });

  it('les espèces sont hors « Envelope.cash » du mois d’avant l’ouverture du compte', () => {
    const d = started();
    expect(envelopeCash(d, 'loisirs', '2026-11')).toBe(0);
    expect(envelopeCash(d, 'inconnue', M)).toBe(0);
  });
});

describe('espèces d’ouverture (spec 0026, RG1, RG8)', () => {
  it('se règle sans plafond lié au virtuel', () => {
    const d = started();
    expect(setEnvelopeOpeningCash(d, 'loisirs', 5000)).toBe('ok');
    expect(d.envelopes[0].openingCash).toBe(5000);
    expect(setEnvelopeOpeningCash(d, 'loisirs', 0)).toBe('ok');
  });

  it('refuse un montant négatif ou invalide, une enveloppe inconnue', () => {
    const d = started();
    expect(setEnvelopeOpeningCash(d, 'loisirs', -1)).toBe('invalid');
    expect(setEnvelopeOpeningCash(d, 'loisirs', NaN)).toBe('invalid');
    expect(openingCashRefusal(d, 'zzz', 5)).toBe('unknown');
    expect(d.envelopes[0].openingCash).toBe(40);
  });

  it('RG8: sur un mois de départ clôturé ou verrouillé, l’ouverture n’est pas modifiable', () => {
    const d = started();
    d.months[M].closed = true;
    expect(setEnvelopeOpeningCash(d, 'loisirs', 10)).toBe('locked');
    const y = started();
    y.closes[2026] = { closed: true, overrides: {} };
    expect(setEnvelopeOpeningCash(y, 'loisirs', 10)).toBe('locked');
    expect(y.envelopes[0].openingCash).toBe(40);
  });

  it('une nouvelle enveloppe démarre sans espèces', () => {
    const d = started();
    addEnvelope(d, 'autre', 'Autre', M);
    expect(d.envelopes[1].openingCash).toBe(0);
  });
});

describe('départs virtuel et espèces (spec 0026, RG13 à RG15, D11)', () => {
  it('CA14: le départ virtuel change l’ouverture du compte de l’enveloppe, pas les espèces ; le départ espèces ne change pas le virtuel', () => {
    const d = started();
    expect(setEnvelopeOpeningBalance(d, 'loisirs', 80)).toBe('ok');
    expect([d.accounts.find(a => a.id === envAccount(d))!.openingBalance, bank(d, envAccount(d)), cashOf(d)]).toEqual([80, 80, 40]);
    expect(setEnvelopeOpeningCash(d, 'loisirs', 10)).toBe('ok');
    expect([bank(d, envAccount(d)), cashOf(d)]).toEqual([80, 10]);
    expect(setEnvelopeOpeningBalance(d, 'loisirs', -30)).toBe('ok');
    expect(bank(d, envAccount(d))).toBe(-30);
  });

  it('CA15: mois de départ clos ou verrouillé : les deux départs sont refusés', () => {
    const d = started();
    d.months[M].closed = true;
    expect(openingBalanceRefusal(d, 'loisirs', 10)).toBe('locked');
    expect(openingCashRefusal(d, 'loisirs', 10)).toBe('locked');
    expect(setEnvelopeOpeningBalance(d, 'loisirs', 10)).toBe('locked');
    expect(d.accounts.find(a => a.id === envAccount(d))!.openingBalance).toBe(100);
    expect(openingBalanceRefusal(started(), 'zzz', 1)).toBe('unknown');
    expect(openingBalanceRefusal(started(), 'loisirs', NaN)).toBe('invalid');
  });

  it('D11: un départ espèces qui rendrait le solde espèces négatif à une date est refusé', () => {
    const d = started();
    spend(d, 30, 'especes');
    expect(lowestCashBalance(d, 'loisirs', 40)).toBe(10);
    expect(openingCashRefusal(d, 'loisirs', 29)).toBe('negative');
    expect(setEnvelopeOpeningCash(d, 'loisirs', 29)).toBe('negative');
    expect(d.envelopes[0].openingCash).toBe(40);
    expect(setEnvelopeOpeningCash(d, 'loisirs', 30)).toBe('ok');
  });
});

describe('départ espèces modifiable (spec 0026, RG15, RG20 à RG22, CA20 à CA23)', () => {
  /** Real-like data: the envelope starts on 1 October, the budget goes on to December. */
  const october = () => {
    const d = emptyData();
    d.firstMonth = '2026-10';
    d.accounts = defaultBankAccounts('2026-10');
    for (const m of ['2026-10', '2026-11', '2026-12']) d.months[m] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    addEnvelope(d, 'loisirs', 'Loisirs', '2026-10');
    d.accounts.find(a => a.id === envAccount(d))!.openingBalance = 100;
    return d;
  };

  it('CA23: sur un mois de départ ouvert, le départ espèces est modifiable, même sans espèces préalables et après des écritures', () => {
    const d = october();
    expect(d.envelopes[0].openingCash).toBe(0);
    expect(openingCashRefusal(d, 'loisirs', 25)).toBeNull();
    expect(setEnvelopeOpeningCash(d, 'loisirs', 25)).toBe('ok');
    expect(envelopeCash(d, 'loisirs', '2026-12')).toBe(25);
    expect(setEnvelopeOpeningCash(d, 'loisirs', 60.5)).toBe('ok');
    expect(d.envelopes[0].openingCash).toBe(60.5);
  });

  it('le verrou est celui du mois de DÉPART : un mois affiché plus tard et clos ne bloque pas, un mois de départ clos bloque', () => {
    const d = october();
    d.months['2026-12'].closed = true;
    expect(openingCashRefusal(d, 'loisirs', 25)).toBeNull();
    d.months['2026-10'].closed = true;
    expect(openingCashRefusal(d, 'loisirs', 25)).toBe('locked');
  });

  it('CA20: la valeur est celle de l’action partout ; le solde réel du compte et le virtuel ne changent pas', () => {
    const d = october();
    const l = () => new Ledger(d, '2026-12');
    const before = [l().bankMonth(envAccount(d), '2026-12')!.balance, l().envMonth('loisirs', '2026-12')!.balance];
    setEnvelopeOpeningCash(d, 'loisirs', 40);
    expect([l().bankMonth(envAccount(d), '2026-12')!.balance, l().envMonth('loisirs', '2026-12')!.balance]).toEqual(before);
    expect(d.envelopes[0].openingCash).toBe(40);
  });

  it('CA21: négatif ou rendant les espèces négatives à une date : refusé, rien n’est modifié', () => {
    const d = october();
    setEnvelopeOpeningCash(d, 'loisirs', 40);
    addTransaction(d, { id: 'e', month: '2026-11', day: 5, label: 'Resto', amount: 35, type: 'env', target: 'loisirs', payMode: 'especes' });
    expect(setEnvelopeOpeningCash(d, 'loisirs', -5)).toBe('invalid');
    expect(setEnvelopeOpeningCash(d, 'loisirs', 34)).toBe('negative');
    expect(d.envelopes[0].openingCash).toBe(40);
  });

  it('CA22: les espèces n’entrent pas dans le solde réel du compte de l’enveloppe', () => {
    const d = october();
    setEnvelopeOpeningCash(d, 'loisirs', 40);
    expect(new Ledger(d, '2026-12').bankMonth(envAccount(d), '2026-12')!.balance).toBe(100);
  });
});

describe('total de la carte de l’écran Comptes (spec 0026, RG23, D24, D25, CA22a)', () => {
  const totalOf = (d: BudgetData, m = M) => envelopeAccountTotal(d, ledger(d), 'loisirs', m);

  it('CA22a: 100 € de solde réel du compte et 60 € d’espèces : total 160 €', () => {
    const d = started();
    d.envelopes[0].openingCash = 60;
    expect(totalOf(d)).toEqual({ virtual: 100, cash: 60, total: 160 });
  });

  it('CA22a: un solde réel de −20 € et 60 € d’espèces : total 40 €', () => {
    const d = started();
    d.envelopes[0].openingCash = 60;
    d.accounts.find(a => a.id === envAccount(d))!.openingBalance = -20;
    expect(totalOf(d)).toEqual({ virtual: -20, cash: 60, total: 40 });
  });

  it('D24: le virtuel est le solde du compte (`bankMonth`), pas le solde budgétaire ; une allocation non transférée ne le change pas', () => {
    const d = started();
    d.months[M].alloc = { loisirs: 50 };
    expect(ledger(d).envMonth('loisirs', M)!.balance).toBe(150);
    expect(totalOf(d)!.virtual).toBe(100);
  });

  it('D25: affichage seulement : le solde du compte, le virtuel budgétaire et les chiffres du budget ne changent pas', () => {
    const d = started();
    const figures = () => [bank(d, envAccount(d)), virtual(d), bank(d, CASH_ACCOUNT_ID), monthSummary(d, ledger(d), M).remaining];
    const before = figures();
    totalOf(d);
    d.envelopes[0].openingCash = 70;
    expect(figures()).toEqual(before);
  });

  it('inconnu ou avant l’ouverture du compte : pas de total', () => {
    const d = started();
    expect(envelopeAccountTotal(d, ledger(d), 'zzz', M)).toBeNull();
    expect(totalOf(d, '2026-11')).toBeNull();
  });
});

describe('sous-titre « avec espèces » du groupe Enveloppes (spec 0026, RG24, CA24b à CA24d)', () => {
  /** Two active envelopes: « Loisirs » 100 € + 60 € cash, « Voyage » 200 € + 0 € cash. */
  const two = () => {
    const d = started();
    d.envelopes[0].openingCash = 60;
    addEnvelope(d, 'voyage', 'Voyage', M);
    d.accounts.find(a => a.id === d.envelopes[1].accountId)!.openingBalance = 200;
    return d;
  };
  const groups = (d: BudgetData) => envelopesGroupTotals(d, ledger(d), M);

  it('CA24b: 100 + 200 en principal (virtuel seul) et 360 avec espèces', () => {
    expect(groups(two())).toEqual({ virtual: 300, cash: 60, withCash: 360 });
  });

  it('CA24b: sans espèces, la somme des espèces vaut 0 (sous-titre masqué par l’écran)', () => {
    const d = two();
    d.envelopes[0].openingCash = 0;
    expect(groups(d)).toEqual({ virtual: 300, cash: 0, withCash: 300 });
  });

  it('CA24c: le sous-titre ne change aucun solde de compte ni chiffre du budget', () => {
    const d = two();
    const figures = () => [bank(d, MAIN_ACCOUNT_ID), bank(d, CASH_ACCOUNT_ID), bank(d, envAccount(d)), monthSummary(d, ledger(d), M).remaining];
    const before = figures();
    groups(d);
    d.envelopes[0].openingCash = 5;
    expect(figures()).toEqual(before);
  });

  it('CA24d: une enveloppe archivée (ni son virtuel ni ses espèces) n’entre pas dans les totaux', () => {
    const d = two();
    d.accounts.find(a => a.id === d.envelopes[0].accountId)!.archived = true;
    expect(groups(d)).toEqual({ virtual: 200, cash: 0, withCash: 200 });
  });
});

describe('historique par enveloppe (spec 0026, RG16 à RG19)', () => {
  const shape = (rows: { label: string; amount: number; balance: number }[]) => rows.map(r => [r.label, r.amount, r.balance]);

  it('CA16: Virtuel = ouverture, transfert reçu, dépense en virtuel, avec le solde après chaque ligne ; le dernier égale le virtuel', () => {
    const d = started();
    feed(d, 150, MAIN_ACCOUNT_ID);
    spend(d, 130, 'virtuel');
    const rows = virtualHistory(d, 'loisirs', M);
    expect(shape(rows)).toEqual([['Ouverture', 100, 100], [expect.stringContaining('Alimentation'), 150, 250], ['Sortie (dépense)', -130, 120]]);
    expect(rows.at(-1)!.balance).toBe(bank(d, envAccount(d)));
    expect(rows.map(r => r.kind)).toEqual(['opening', 'movement', 'expense']);
  });

  it('CA17: Espèces = ouverture, alimentation depuis Espèces, dépense en espèces ; le dernier égale le solde espèces', () => {
    const d = started();
    feed(d, 20, CASH_ACCOUNT_ID);
    spend(d, 15, 'especes');
    const rows = cashHistory(d, 'loisirs', M);
    expect(shape(rows)).toEqual([['Ouverture', 40, 40], [expect.stringContaining('Alimentation'), 20, 60], ['Sortie', -15, 45]]);
    expect(rows.at(-1)!.balance).toBe(cashOf(d));
  });

  it('CA18: une dépense en espèces n’est que dans Espèces, une dépense en virtuel que dans Virtuel ; un transfert d’espèces n’est pas dans Virtuel', () => {
    const d = started();
    spend(d, 15, 'especes');
    spend(d, 10, 'virtuel');
    feed(d, 20, CASH_ACCOUNT_ID);
    expect(virtualHistory(d, 'loisirs', M).map(r => r.amount)).toEqual([100, -10]);
    expect(cashHistory(d, 'loisirs', M).map(r => r.amount)).toEqual([40, 20, -15]);
  });

  it('D14, D12: ordre chronologique croissant, jusqu’au mois demandé seulement', () => {
    const d = started();
    d.months['2027-01'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    spend(d, 5, 'virtuel', 'b');
    d.transactions[0].day = 20;
    addTransaction(d, { id: 'a', month: M, day: 3, label: 'Tôt', amount: 1, type: 'env', target: 'loisirs' });
    addTransaction(d, { id: 'c', month: '2027-01', day: 2, label: 'Plus tard', amount: 2, type: 'env', target: 'loisirs' });
    expect(virtualHistory(d, 'loisirs', M).map(r => r.label)).toEqual(['Ouverture', 'Tôt (dépense)', 'Sortie (dépense)']);
    expect(virtualHistory(d, 'loisirs', '2027-01').map(r => r.label)).toEqual(['Ouverture', 'Tôt (dépense)', 'Sortie (dépense)', 'Plus tard (dépense)']);
    expect(virtualHistory(d, 'loisirs', '2026-11')).toEqual([]);
  });

  it('D16: une allocation pointée (fictive) n’est pas dans la liste Virtuel', () => {
    const d = started();
    d.months[M].alloc = { loisirs: 50 };
    checkEnvelope(d, M, 'loisirs', '2026-12-02');
    expect(virtualHistory(d, 'loisirs', M).map(r => r.label)).toEqual(['Ouverture']);
  });

  it('CA19: supprimer un transfert ou une dépense le retire des listes ; enveloppe inconnue : listes vides', () => {
    const d = started();
    feed(d, 20, CASH_ACCOUNT_ID);
    spend(d, 15, 'especes', 'x');
    expect(cashHistory(d, 'loisirs', M)).toHaveLength(3);
    deleteTransaction(d, 'x');
    d.accountMovements = [];
    expect(cashHistory(d, 'loisirs', M)).toHaveLength(1);
    expect(cashHistory(d, 'zzz', M)).toEqual([]);
    expect(virtualHistory(d, 'zzz', M)).toEqual([]);
  });
});

describe('conversion des `cash` existants (spec 0026, RG10, D5, CA8)', () => {
  const legacy = (cash = 70) => {
    const d = started();
    const [e] = d.envelopes;
    delete (e as { openingCash?: number }).openingCash;
    (e as unknown as { cash: number }).cash = cash;
    return d;
  };

  it('`cash` devient l’ouverture espèces ; le virtuel est inchangé, aucune écriture n’est créée, les dépenses existantes restent en virtuel', () => {
    const d = legacy();
    d.transactions.push({ id: 'old', month: M, day: 2, label: 'Ancienne', amount: 5, type: 'env', target: 'loisirs' });
    const before = virtual(d);
    const m = migrateEnvelopeOpeningCash(d);
    expect(m.envelopes[0]).toEqual({ id: 'loisirs', name: 'Loisirs', hue: d.envelopes[0].hue, openingCash: 70, accountId: envAccount(d) });
    expect(m.transactions).toEqual(d.transactions);
    expect(m.transactions[0].payMode).toBeUndefined();
    expect(m.accountMovements ?? []).toEqual([]);
    expect(virtual(m)).toBe(before);
    expect(envelopeCash(m, 'loisirs', M)).toBe(70);
  });

  it('n’est pas borné par le solde virtuel, est idempotent, et ne modifie pas ses entrées', () => {
    const d = legacy(5000);
    const once = migrateEnvelopeOpeningCash(d);
    expect(once.envelopes[0].openingCash).toBe(5000);
    expect(migrateEnvelopeOpeningCash(once)).toBe(once);
    expect(d.envelopes[0]).toHaveProperty('cash', 5000);
  });

  it('s’applique au chargement', async () => {
    const stored = legacy();
    const repo: BudgetRepository = { load: async () => structuredClone(stored), save: async () => undefined };
    const { data } = await loadBudget(repo, emptyData);
    expect(data.envelopes[0].openingCash).toBe(70);
    expect('cash' in data.envelopes[0]).toBe(false);
  });
});
