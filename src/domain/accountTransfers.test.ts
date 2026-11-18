import { describe, expect, it } from 'vitest';
import { addBankAccount } from '../application/bankAccounts';
import { addTransaction } from '../application/actions';
import { addTransfer, updateAccountMovement } from '../application/accountMovements';
import { MAIN_ACCOUNT_ID, defaultBankAccounts } from './bank';
import { accountTransfersView, canAssociateTransfer, lineDisplayName, transferLinkHolds, transferAccountChoices, transferLocks, transferTargetChoices } from './accountTransfers';
import { isAccountTransfer, isLineInBudget } from './bank';
import { monthSummary, availableReal, budgetLines, blockTotals, templateSummary } from './budget';
import { goalView } from './goals';
import { modelRows, simulationTotals } from './simulation';
import { attachableItems, creationDefaultItem, defaultTransferTarget, editedTargets, targetValue, transferItems } from './transfers';
import { accounts } from './ledger';
import { assignedToSavingsNet, derivedActual, lineSpentNet, lineTransferredNet } from './lineActuals';
import { accountComingUp, comingUpAccounts, lateCount, leftLineKeys } from './comingUp';
import { dashboardView } from './dashboard';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import type { BlockKey, BudgetData, Line } from './types';

/* Spec 0050 : encart « Transferts entre comptes » (contenu, reste, statut, compteur, pied, exclusion de « À venir »). */

const M = '2027-01';
const TODAY = '2027-01-03';

const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

/** Main account at 1 000 €, savings accounts « Livret A » (payer) and « Travaux » (target), plus the main account's own savings target « Vacances ». */
function started(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, 'liv', 'Livret A', 'epargne');
  addBankAccount(d, 'trav', 'Travaux', 'epargne');
  addBankAccount(d, 'vac', 'Vacances', 'epargne');
  d.months[M] = { initialized: true, lines: structuredClone(lines), alloc: {}, transfersDone: {} };
  return d;
}

/** The Travaux transfer of the spec: 800 € from Livret A to Travaux, before the 5th. */
const travaux = (extra: Partial<Line> = {}) => ln('travaux', 'epa', 800, { accountId: 'liv', linkedAccountId: 'trav', dueDay: 5, ...extra });

const view = (d: BudgetData, today = TODAY) => accountTransfersView(d, M, today);
const only = (d: BudgetData, today = TODAY) => view(d, today)!.items[0];
/** A `var` expense of the main account assigned to « Travaux » and, by default, associated with the line `travaux` (spec 0050, RG36). `link` = null: assigned to the account only. */
const attach = (d: BudgetData, amount: number, id = 'x1', link: string | null = 'travaux') =>
  addTransaction(d, { id, month: M, day: 3, label: 'Peintre', amount, type: 'var', target: 'v', accountId: MAIN_ACCOUNT_ID, assignedAccountId: 'trav', ...(link ? { transferLineKey: link } : {}) });
const send = (d: BudgetData, amount: number, id = 'm1') =>
  addTransfer(d, { id, month: M, day: 4, label: 'Virement', amount, fromAccountId: 'liv', toAccountId: 'trav', targets: [{ kind: 'line', key: 'travaux' }] });

describe('contenu de l’encart (RG1 à RG5, CA1, CA2, CA12, CA13)', () => {
  it('CA1 : une ligne epa payée par un compte autre que le principal est dans l’encart et plus dans « À venir »', () => {
    const d = started([travaux()]);
    expect(view(d)!.items.map(x => x.key)).toEqual(['travaux']);
    expect(comingUpAccounts(d, M).map(a => a.id)).not.toContain('liv');
    expect(leftLineKeys(d, M, TODAY).has('travaux')).toBe(false);
  });

  it('CA2 : une ligne epa payée par le principal reste dans « À venir » (À virer), pèse sur la marge, et n’est pas dans l’encart', () => {
    const d = started([ln('vac', 'epa', 300, { linkedAccountId: 'vac', execMode: 'virement_manuel' })]);
    expect(view(d)!.items).toEqual([]);
    const main = accountComingUp(d, M, MAIN_ACCOUNT_ID, TODAY)!;
    expect(main.groups.find(g => g.id === 'virement')!.items.map(i => i.id)).toEqual(['vac']);
    expect(main.margin).toBe(700);
  });

  it('une ligne inv suit la même règle que epa', () => {
    const d = started([ln('bourse', 'inv', 50, { accountId: 'liv', linkedAccountId: 'trav' })]);
    expect(view(d)!.items.map(x => x.key)).toEqual(['bourse']);
  });

  it('CA12 : sans compte cible ou payée par le principal : absente ; à budget 0 ou « informatif » : reste dans l’encart (RG1, amendé)', () => {
    const d = started([
      travaux({ key: 'a', execMode: 'informatif' }),
      travaux({ key: 'b', budget: 0 }),
      travaux({ key: 'c', linkedAccountId: undefined }),
      travaux({ key: 'p', accountId: MAIN_ACCOUNT_ID }),
    ]);
    expect(view(d)!.items.map(x => x.key)).toEqual(['a', 'b']);
  });

  it('CA13 : mois initialisé sans transfert : vue vide (encart avec « Ajouter ») ; mois non initialisé : null', () => {
    expect(accountTransfersView(started([]), M, TODAY)).toEqual({ items: [], done: 0, left: 0 });
    expect(accountTransfersView(started([travaux()]), '2027-02', TODAY)).toBeNull();
  });

  it('CA14 : un compte source qui n’avait que ces lignes à payer disparaît de « À venir »', () => {
    const d = started([travaux(), ln('f', 'fix', 10)]);
    expect(comingUpAccounts(d, M).map(a => a.id)).toEqual([MAIN_ACCOUNT_ID]);
    expect(comingUpAccounts(d, M).map(a => a.id)).not.toContain('liv');
    expect(accountComingUp(d, M, 'liv', TODAY)!.total).toBe(0);
  });

  it('CA3 : le virement du principal vers le compte dédié d’une ligne variable reste dans « À venir » (Déjà sorti)', () => {
    const d = started([ln('v', 'var', 200, { accountId: 'trav' }), travaux()]);
    addTransfer(d, { id: 'm9', month: M, day: 2, label: 'Dédié', amount: 200, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'trav', targets: [{ kind: 'line', key: 'v' }] });
    const main = accountComingUp(d, M, MAIN_ACCOUNT_ID, TODAY)!;
    expect(main.groups.flatMap(g => g.done).map(i => i.kind)).toContain('transfer');
    expect(view(d)!.items.map(x => x.key)).toEqual(['travaux']);
  });
});

describe('calcul d’un transfert (RG6 à RG9, CA4 à CA8)', () => {
  it('CA4 : 800 € sans écriture : reste 800, « À faire »', () => {
    const t = only(started([travaux()]));
    expect(t).toMatchObject({ planned: 800, transferred: 0, attached: 0, left: 800, status: 'todo', fromName: 'Livret A', toName: 'Travaux', day: 5 });
  });

  it('CA5 : 300 € de dépenses associées à la ligne : reste 500, « Partiel »', () => {
    const d = started([travaux()]);
    attach(d, 300);
    expect(only(d)).toMatchObject({ planned: 800, attached: 300, transferred: 0, left: 500, status: 'partial' });
  });

  it('CA6 : puis 500 € virés : reste 0, « Fait », compteur +1', () => {
    const d = started([travaux()]);
    attach(d, 300);
    send(d, 500);
    expect(only(d)).toMatchObject({ transferred: 500, attached: 300, left: 0, status: 'done' });
    expect(view(d)!.done).toBe(1);
  });

  it('CA7 : des dépenses non affectées, ou affectées au compte cible sans association à la ligne, ne réduisent rien', () => {
    const d = started([travaux()]);
    addTransaction(d, { id: 'x2', month: M, day: 3, label: 'Peintre', amount: 300, type: 'var', target: 'v', accountId: MAIN_ACCOUNT_ID });
    attach(d, 200, 'x3', null);
    expect(only(d)).toMatchObject({ left: 800, attached: 0, status: 'todo' });
  });

  it('CA42 : deux transferts vers le même compte : seule la ligne associée voit son reste baisser', () => {
    const d = started([travaux(), travaux({ key: 'autre', budget: 500 })]);
    attach(d, 300);
    const items = view(d)!.items;
    expect(items.find(x => x.key === 'travaux')).toMatchObject({ attached: 300, left: 500 });
    expect(items.find(x => x.key === 'autre')).toMatchObject({ attached: 0, left: 500, status: 'todo' });
    expect(d.months[M].lines.find(l => l.key === 'autre')!.actual).toBeNull();
    expect(d.months[M].lines.find(l => l.key === 'travaux')!.actual).toBe(300);
  });

  it('CA49 : une opération affectée au compte cible sans lien ne compte ni dans le reste ni dans le réel de la ligne, mais reste dans le détail du compte', () => {
    const d = started([travaux()]);
    attach(d, 300, 'x1', null);
    expect(only(d)).toMatchObject({ attached: 0, left: 800 });
    expect(d.months[M].lines[0].actual).toBeNull();
    expect(assignedToSavingsNet(d, M)).toBe(300);
  });

  it('CA50 : une ligne epa payée par le principal garde son réel dérivé par compte', () => {
    const d = started([ln('s', 'epa', 500, { linkedAccountId: 'trav' })]);
    attach(d, 300, 'x1', null);
    expect(d.months[M].lines[0].actual).toBe(300);
    expect(lineSpentNet(d, M, d.months[M].lines[0])).toBe(300);
  });

  it('RG36 : l’association est refusée hors du compte cible de la ligne, pour une ligne inconnue ou un type non affectable', () => {
    const d = started([travaux()]);
    const base = { month: M, day: 3, label: 'x', amount: 10, accountId: MAIN_ACCOUNT_ID };
    expect(addTransaction(d, { ...base, id: 'a', type: 'var', target: 'v', assignedAccountId: 'liv', transferLineKey: 'travaux' })).toBe(false);
    expect(addTransaction(d, { ...base, id: 'b', type: 'var', target: 'v', assignedAccountId: 'trav', transferLineKey: 'inconnue' })).toBe(false);
    expect(addTransaction(d, { ...base, id: 'c', type: 'var', target: 'v', transferLineKey: 'travaux' })).toBe(false);
    expect(addTransaction(d, { ...base, id: 'e', type: 'env', target: 'x', assignedAccountId: 'trav', transferLineKey: 'travaux' })).toBe(false);
    expect(d.transactions).toHaveLength(0);
  });

  it('CA8 : des dépenses rattachées supérieures au prévu : reste 0, jamais négatif', () => {
    const d = started([travaux()]);
    attach(d, 900);
    expect(only(d)).toMatchObject({ left: 0, status: 'done' });
  });

  it('une entrée d’argent associée à la ligne vient en déduction des dépenses rattachées', () => {
    const d = started([travaux(), ln('r', 'rev', 100)]);
    attach(d, 300);
    addTransaction(d, { id: 'r1', month: M, day: 3, label: 'Remboursement', amount: 100, type: 'rev', target: 'r', accountId: MAIN_ACCOUNT_ID, assignedAccountId: 'trav', transferLineKey: 'travaux' });
    expect(only(d)).toMatchObject({ attached: 200, left: 600 });
  });
});

describe('statut (RG10, RG11, CA9)', () => {
  it('CA9 : jour dépassé et reste > 0 : « En retard » ; le jour même, non', () => {
    const d = started([travaux()]);
    expect(only(d, '2027-01-05').status).toBe('todo');
    expect(only(d, '2027-01-06').status).toBe('late');
  });

  it('« En retard » prime sur « Partiel »', () => {
    const d = started([travaux()]);
    attach(d, 300);
    expect(only(d, '2027-01-20').status).toBe('late');
  });

  it('un transfert sans jour prévu n’est jamais en retard', () => {
    const d = started([travaux({ dueDay: undefined })]);
    expect(only(d, '2027-03-20').status).toBe('todo');
  });

  it('un mois futur n’a aucun retard ; un mois passé non clos, si', () => {
    const d = started([travaux()]);
    expect(only(d, '2026-12-20').status).toBe('todo');
    expect(only(d, '2027-02-01').status).toBe('late');
  });

  it('un mois clos n’a aucun retard', () => {
    const d = started([travaux()]);
    d.months[M].closed = true;
    expect(only(d, '2027-02-20').status).toBe('todo');
    expect(view(d)).not.toBeNull();
  });

  it('un jour 31 est ramené au dernier jour d’un mois court', () => {
    const d = emptyData();
    d.firstMonth = '2027-02';
    d.accounts = defaultBankAccounts('2027-02');
    addBankAccount(d, 'liv', 'Livret A', 'epargne');
    addBankAccount(d, 'trav', 'Travaux', 'epargne');
    d.months['2027-02'] = { initialized: true, lines: [travaux({ dueDay: 31 })], alloc: {}, transfersDone: {} };
    const t = accountTransfersView(d, '2027-02', '2027-02-28')!.items[0];
    expect(t.day).toBe(28);
    expect(t.status).toBe('todo');
  });
});

describe('compteur, pied et tri (RG13 à RG17, CA10, CA11, CA15)', () => {
  const four = () => started([
    travaux({ key: 'a', name: 'a', budget: 100, dueDay: 20 }),
    travaux({ key: 'b', name: 'b', budget: 100, dueDay: 5 }),
    travaux({ key: 'c', name: 'c', budget: 80, dueDay: undefined }),
    travaux({ key: 'd', name: 'd', budget: 50, dueDay: undefined }),
  ]);

  it('CA11 : restes 100, 100, 80 et 50 : pied 330 €', () => {
    expect(view(four())!.left).toBe(330);
  });

  it('CA15 : tri par jour croissant, puis les sans jour dans l’ordre du budget', () => {
    expect(view(four())!.items.map(x => x.key)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('CA10 : 1 transfert fait sur 4 : « 1 / 4 », le fait reste listé avec un reste de 0', () => {
    const d = four();
    // Un virement de 100 € vers la ligne « a » la solde.
    addTransfer(d, { id: 'ma', month: M, day: 4, label: 'Virement', amount: 100, fromAccountId: 'liv', toAccountId: 'trav', targets: [{ kind: 'line', key: 'a' }] });
    const v = view(d)!;
    expect(v.items).toHaveLength(4);
    expect(v.done).toBe(1);
    expect(v.items.find(x => x.key === 'a')).toMatchObject({ left: 0, status: 'done' });
    expect(v.left).toBe(230);
  });

  it('tout est fait : pied à 0 €', () => {
    const d = started([travaux()]);
    send(d, 800);
    expect(view(d)).toMatchObject({ done: 1, left: 0 });
  });
});

describe('« À venir » et le reste de l’application (RG3, RG18, RG21, CA18 à CA20)', () => {
  it('le retard d’un transfert ne compte pas dans « À venir » ; celui d’une autre ligne, si', () => {
    const d = started([travaux(), ln('f', 'fix', 10, { dueDay: 2 })]);
    expect(lateCount(d, M, '2027-01-20')).toBe(1);
  });

  it('CA19 : le tableau de bord garde le transfert dans ses virements à effectuer', () => {
    const d = started([travaux()]);
    const dv = dashboardView(d, new Ledger(d, M), M, TODAY);
    expect(dv.todo!.transfers.map(t => t.id)).toContain('travaux');
  });

  it('CA20 : le calcul ne modifie ni les données ni les soldes réels', () => {
    const d = started([travaux()]);
    attach(d, 300);
    send(d, 100);
    const before = JSON.stringify(d);
    const bal = new Ledger(d, M).bankMonth('trav', M);
    view(d);
    expect(JSON.stringify(d)).toBe(before);
    expect(new Ledger(d, M).bankMonth('trav', M)).toEqual(bal);
  });
});

describe('jeu de la maquette (diagnostic « encart non visible »)', () => {
  it('4 transferts payés par des comptes d’épargne : encart de 330 € ; les mêmes lignes payées par le principal : pas d’encart', () => {
    const lines = (payer: (id: string) => string | undefined) => [
      ln('t', 'epa', 100, { accountId: payer('ldds'), linkedAccountId: 'trav', dueDay: 5 }),
      ln('l', 'epa', 100, { accountId: payer('liv'), linkedAccountId: 'vac', dueDay: 10 }),
      ln('c', 'epa', 80, { accountId: payer('ce'), linkedAccountId: 'vac', dueDay: 15 }),
      ln('k', 'epa', 50, { accountId: payer('liv'), linkedAccountId: 'trav', dueDay: 20 }),
    ];
    const d = started(lines(id => id));
    addBankAccount(d, 'ldds', 'LDDS Travaux', 'epargne');
    addBankAccount(d, 'ce', 'Caisse d’épargne', 'epargne');
    expect(view(d)).toMatchObject({ left: 330, done: 0 });
    expect(view(d)!.items).toHaveLength(4);
    // Payeur absent ou égal au compte principal : le transfert reste dans « À venir » (RG2), l’encart n’existe pas.
    expect(view(started(lines(() => undefined)))!.items).toEqual([]);
    expect(view(started(lines(() => MAIN_ACCOUNT_ID)))!.items).toEqual([]);
  });
});

describe('transfert hors des totaux du budget (RG29 à RG34, CA25, CA32 à CA34, CA36, CA37, CA40)', () => {
  const withAndWithout = (extra: Partial<Line> = {}) => {
    const base = [ln('r', 'rev', 3000), ln('f', 'fix', 500), ln('s', 'epa', 200, { linkedAccountId: 'vac' })];
    return { withT: started([...base, travaux(extra)]), without: started(base) };
  };
  const figures = (d: BudgetData) => ({ epa: blockTotals(budgetLines(d, M), 'epa'), avail: availableReal(d, M), summary: monthSummary(d, new Ledger(d, M), M) });

  it('CA32 : total Épargne, reste à placer et résumé du mois identiques avec et sans transfert, même d’épargne vers épargne', () => {
    const { withT, without } = withAndWithout();
    expect(figures(withT)).toEqual(figures(without));
    const sav = started([travaux({ accountId: 'liv', linkedAccountId: 'vac' })]);
    expect(blockTotals(budgetLines(sav, M), 'epa').budget).toBe(0);
  });

  it('CA33 / CA34 : un transfert est détecté par le bloc, le compte cible et le payeur ; payée par le principal, la ligne reste dans son bloc et son total', () => {
    const d = started([travaux(), ln('s', 'epa', 200, { linkedAccountId: 'vac' }), travaux({ key: 'i', block: 'inv' })]);
    const [t, s, i] = d.months[M].lines;
    expect([isAccountTransfer(d, t), isAccountTransfer(d, s), isAccountTransfer(d, i)]).toEqual([true, false, true]);
    expect([isLineInBudget(d, t), isLineInBudget(d, s), isLineInBudget(d, i)]).toEqual([false, true, false]);
    expect(blockTotals(budgetLines(d, M), 'epa').budget).toBe(200);
  });

  it('CA40 : un payeur autre que le principal avec le principal pour cible reste un transfert affiché', () => {
    const d = started([travaux({ linkedAccountId: MAIN_ACCOUNT_ID })]);
    expect(view(d)!.items).toHaveLength(1);
    expect(transferTargetChoices(d).some(a => a.id === MAIN_ACCOUNT_ID)).toBe(false);
  });

  it('CA23 : les listes de comptes écartent le principal, les enveloppes, Espèces, les archivés et, pour la cible, le compte débité', () => {
    const d = started([]);
    addBankAccount(d, 'old', 'Vieux', 'epargne');
    d.accounts.find(a => a.id === 'old')!.archived = true;
    const ids = transferAccountChoices(d).map(a => a.id);
    expect(ids).toEqual(['liv', 'trav', 'vac']);
    expect(transferTargetChoices(d, 'liv').map(a => a.id)).toEqual(['trav', 'vac']);
  });

  it('CA25 : titre = libellé, route en sous-ligne ; sans libellé, le titre suit les comptes', () => {
    const d = started([travaux({ name: 'Travaux salle de bain' })]);
    expect(only(d)).toMatchObject({ title: 'Travaux salle de bain', route: 'Livret A → Travaux' });
    const l = d.months[M].lines[0];
    l.name = '';
    expect(only(d)).toMatchObject({ title: 'Livret A → Travaux' });
    expect(only(d).route).toBeUndefined();
    d.accounts.find(a => a.id === 'liv')!.name = 'Livret B';
    expect(only(d).title).toBe('Livret B → Travaux');
    expect(lineDisplayName(d, l)).toBe('Livret B → Travaux');
    expect(lineDisplayName(d, ln('s', 'epa', 1, { name: 'Vacances' }))).toBe('Vacances');
  });

  it('CA36 : un plafond dont le périmètre est la ligne du transfert compte son réel (500 € virés), alors que le total Épargne du budget ne le compte pas', () => {
    const d = started([travaux()]);
    send(d, 500);
    attach(d, 300);
    attach(d, 70, 'x9', null);
    // 500 € virés + 300 € associés ; les 70 € seulement affectés au compte « Travaux » ne comptent pas (RG40, CA36).
    expect(d.months[M].lines[0].actual).toBe(800);
    expect(blockTotals(budgetLines(d, M), 'epa').actual).toBe(0);
    const g = goalView(d, new Ledger(d, M), { id: 'g', year: 2027, kind: 'cap', name: 'Plafond', target: 1200, position: 0, scope: { kind: 'line', key: 'travaux' } }, M);
    expect(g.current).toBe(800);
  });

  it('CA37 : le résumé du modèle et la simulation (lignes du modèle) ne comptent pas le transfert', () => {
    const { withT, without } = withAndWithout();
    withT.template.lines = withT.months[M].lines.map(({ actual: _a, ...l }) => l);
    without.template.lines = without.months[M].lines.map(({ actual: _a, ...l }) => l);
    expect(templateSummary(withT)).toEqual(templateSummary(without));
    const ids = () => 'x';
    expect(simulationTotals(modelRows(withT, ids))).toEqual(simulationTotals(modelRows(without, ids)));
  });

  it('verrous : comptes figés par une écriture (virement ou dépense associée), pas par une dépense seulement affectée au compte cible', () => {
    const d = started([travaux()]);
    const l = () => d.months[M].lines[0];
    expect(transferLocks(d, M, l())).toMatchObject({ entries: false, accounts: null });
    attach(d, 100, 'x0', null);
    expect(transferLocks(d, M, l()).accounts).toBeNull();
    attach(d, 100);
    expect(transferLocks(d, M, l()).accounts).not.toBeNull();
  });
});

describe('patrimoine inchangé et nom affiché partout (RG35, RG26)', () => {
  it('RG35 : le patrimoine du tableau de bord compte encore la ligne d’un transfert (ses soldes ne changent pas)', () => {
    const d = started([travaux(), ln('s', 'epa', 200, { linkedAccountId: 'vac' })]);
    d.months[M].lines[0].accountId = 'liv';
    const wealth = dashboardView(d, new Ledger(d, M), M, TODAY).wealth!;
    const rowsKeys = accounts(d).map(a => a.key);
    expect(rowsKeys).toContain('travaux');
    // Avec le patrimoine d’avant l’amendement (toutes les lignes d’épargne), le total est le même.
    const all = accounts(d).filter(a => a.block === 'epa').reduce((t, a) => t + (new Ledger(d, M).accMonth(a.key, M)?.balance ?? 0), 0);
    expect(wealth.savings).toBe(Math.round(all * 100) / 100);
  });

  it('un transfert sans libellé garde son nom « Débité → Cible » dans la liste des comptes et des cibles de virement', () => {
    const d = started([travaux({ name: '' })]);
    expect(accounts(d).find(a => a.key === 'travaux')!.name).toBe('Livret A → Travaux'.replace('Livret A', 'Livret A'));
    expect(transferItems(d, M).find(i => i.target.kind === 'line' && i.target.key === 'travaux')!.label).toBe('Livret A → Travaux (épargne)');
  });
});

describe('le lien d’une opération tient-il encore ? (RG44, D15 à D17)', () => {
  const op = { type: 'var' as const, month: M, assignedAccountId: 'trav' };
  it('tient avec une affectation inchangée, même si la ligne a disparu ; tombe sans affectation, hors budget, type non affectable ou autre compte', () => {
    const d = started([travaux()]);
    expect(canAssociateTransfer(d, op, 'travaux')).toBe(true);
    expect(transferLinkHolds(d, op, 'travaux', true)).toBe(true);
    expect(transferLinkHolds(d, op, 'disparue', true)).toBe(true);
    expect(transferLinkHolds(d, op, 'travaux', false)).toBe(false);
    expect(transferLinkHolds(d, { ...op, assignedAccountId: undefined }, 'travaux', true)).toBe(false);
    expect(transferLinkHolds(d, { ...op, offBudget: true }, 'travaux', true)).toBe(false);
    expect(transferLinkHolds(d, { ...op, type: 'env' }, 'travaux', true)).toBe(false);
    expect(transferLinkHolds(d, { ...op, assignedAccountId: 'liv' }, 'travaux', true)).toBe(false);
  });
});

describe('les virements sortants du compte cible ne déduisent rien (RG46, CA56)', () => {
  const out = (d: BudgetData, amount: number, to = 'vac', targets?: { kind: 'line'; key: string }[]) =>
    addTransfer(d, { id: `o${amount}`, month: M, day: 6, label: 'Sortie', amount, fromAccountId: 'trav', toAccountId: to, ...(targets ? { targets } : {}) });

  it('CA56 : 800 €, un virement de 159,70 € de « Travaux » vers un autre compte, aucun virement entrant rattaché : viré 0, reste 800, « À faire »', () => {
    const d = started([travaux()]);
    expect(out(d, 159.7)).toBe(true);
    expect(only(d)).toMatchObject({ transferred: 0, attached: 0, left: 800, status: 'todo' });
    expect(view(d)).toMatchObject({ done: 0, left: 800 });
    expect(d.months[M].lines[0].actual).toBeNull();
    expect(lineTransferredNet(d, M, d.months[M].lines[0])).toBeNull();
  });

  it('un virement entrant rattaché compte, la sortie du compte cible ne le réduit pas ; un entrant non rattaché ne compte pas', () => {
    const d = started([travaux()]);
    send(d, 500);
    out(d, 159.7);
    addTransfer(d, { id: 'free', month: M, day: 7, label: 'Libre', amount: 90, fromAccountId: 'liv', toAccountId: 'trav' });
    expect(only(d)).toMatchObject({ transferred: 500, left: 300 });
    expect(d.months[M].lines[0].actual).toBe(500);
  });

  it('le réel d’un plafond sur la ligne (objectifs, RG33) n’est pas réduit par la sortie', () => {
    const d = started([travaux()]);
    send(d, 500);
    out(d, 159.7);
    const g = goalView(d, new Ledger(d, M), { id: 'g', year: 2027, kind: 'cap', name: 'P', target: 1200, position: 0, scope: { kind: 'line', key: 'travaux' } }, M);
    expect(g.current).toBe(500);
  });

  it('un virement « simple passage » sortant du compte d’une ligne epa n’est pas déduit de son réel (spec 0054)', () => {
    const d = started([ln('s', 'epa', 500, { linkedAccountId: 'trav' })]);
    addTransfer(d, { id: 'in', month: M, day: 4, label: 'Entrée', amount: 800, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'trav', targets: [{ kind: 'line', key: 's' }] });
    addTransfer(d, { id: 'out', month: M, day: 5, label: 'Passage', amount: 800, fromAccountId: 'trav', toAccountId: MAIN_ACCOUNT_ID, passThrough: true });
    const l = d.months[M].lines[0];
    expect(lineTransferredNet(d, M, l)).toBe(800);
    expect(lineSpentNet(d, M, l)).toBeNull();
    updateAccountMovement(d, 'out', { label: 'Passage', amount: 800, passThrough: false });
    // Not a passage any more: the outgoing transfer is spent, « Viré » only counts what was received.
    expect(lineTransferredNet(d, M, l)).toBe(800);
    expect(lineSpentNet(d, M, l)).toBe(800);
  });

  it('une sortie et son retour marqués « simple passage » s’annulent : ni viré ni dépensé (2026-11-21)', () => {
    const d = started([ln('s', 'epa', 500, { linkedAccountId: 'trav' })]);
    addTransfer(d, { id: 'out', month: M, day: 4, label: 'Sortie', amount: 100, fromAccountId: 'trav', toAccountId: MAIN_ACCOUNT_ID, passThrough: true });
    addTransfer(d, { id: 'back', month: M, day: 6, label: 'Retour', amount: 100, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'trav', targets: [{ kind: 'line', key: 's' }], passThrough: true });
    const l = d.months[M].lines[0];
    expect(lineTransferredNet(d, M, l)).toBeNull();
    expect(lineSpentNet(d, M, l)).toBeNull();
    expect(derivedActual(d, M, l)).toBeNull();
  });

  it('un compte de transit : ce qu’il répartit vers d’autres lignes d’épargne se retranche du viré, pas des dépenses (2026-11-21)', () => {
    const d = started([ln('t', 'epa', 0, { linkedAccountId: 'trav' }), ln('c', 'epa', 120, { linkedAccountId: 'vac' })]);
    addTransfer(d, { id: 'in', month: M, day: 4, label: 'Entrée', amount: 300, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'trav', targets: [{ kind: 'line', key: 't' }] });
    addTransfer(d, { id: 'split', month: M, day: 5, label: 'Répartition', amount: 120, fromAccountId: 'trav', toAccountId: 'vac', targets: [{ kind: 'line', key: 'c' }] });
    const [t, c] = d.months[M].lines;
    expect(lineTransferredNet(d, M, t)).toBe(180);
    expect(lineSpentNet(d, M, t)).toBeNull();
    expect(lineTransferredNet(d, M, c)).toBe(120);
  });

  it('une ligne epa payée par le principal : « Viré » ne compte que le reçu, les sorties de son compte sont des dépenses (2026-11-21)', () => {
    const d = started([ln('s', 'epa', 500, { linkedAccountId: 'trav' })]);
    addTransfer(d, { id: 'in', month: M, day: 4, label: 'Entrée', amount: 300, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'trav', targets: [{ kind: 'line', key: 's' }] });
    out(d, 100);
    expect(lineTransferredNet(d, M, d.months[M].lines[0])).toBe(300);
    expect(lineSpentNet(d, M, d.months[M].lines[0])).toBe(100);
    expect(derivedActual(d, M, d.months[M].lines[0])).toBe(200);
  });
});

describe('rattacher un virement à une ligne de transfert : logique pure (RG47 à RG51, CA57, CA58, CA62)', () => {
  const d = () => started([travaux(), ln('autre', 'epa', 50, { accountId: 'liv', linkedAccountId: 'vac' }), ln('v', 'var', 100, { accountId: 'trav' })]);

  it('RG48 : les lignes proposées visent la destination, sans lignes variables du compte dédié, quelle que soit la source', () => {
    const data = d();
    expect(attachableItems(data, M, 'trav').map(i => targetValue(i.target))).toEqual(['line:travaux']);
    expect(attachableItems(data, M, 'vac').map(i => targetValue(i.target))).toEqual(['line:autre']);
    expect(attachableItems(data, M, MAIN_ACCOUNT_ID)).toEqual([]);
    expect(transferItems(data, M).some(i => i.target.kind === 'line' && i.target.key === 'v')).toBe(true);
  });

  it('RG49, RG50 : le ciblage envoyé est la ligne choisie seule, sinon les lignes variables cochées, sinon rien (« Aucune ») ; une ligne qui ne vise pas la destination est ignorée', () => {
    const data = d();
    expect(editedTargets(data, M, 'trav', [], 'line:travaux')).toEqual([{ kind: 'line', key: 'travaux' }]);
    expect(editedTargets(data, M, 'trav', ['v'], 'line:travaux')).toEqual([{ kind: 'line', key: 'travaux' }]);
    expect(editedTargets(data, M, 'trav', ['v'], '')).toEqual([{ kind: 'line', key: 'v' }]);
    expect(editedTargets(data, M, 'trav', [], '')).toEqual([]);
    expect(editedTargets(data, M, 'trav', [], 'line:autre')).toEqual([]);
  });

  it('CA62 : à la création, la ligne dont le payeur est la source est proposée, sinon la première', () => {
    const data = started([travaux(), travaux({ key: 'deux', accountId: 'vac' })]);
    expect(creationDefaultItem(data, M, 'vac', 'trav')).toEqual({ kind: 'line', key: 'deux' });
    expect(creationDefaultItem(data, M, MAIN_ACCOUNT_ID, 'trav')).toEqual({ kind: 'line', key: 'travaux' });
    expect(creationDefaultItem(data, M, 'liv', 'liv')).toBeUndefined();
  });

  it('CA62 : un import ne propose jamais de lui-même une ligne de transfert (RG51) ; une ligne payée par le principal reste proposée', () => {
    const data = started([travaux(), ln('s', 'epa', 100, { linkedAccountId: 'trav' })]);
    expect(defaultTransferTarget(data, M, 'trav', 'ldds')).toEqual({ kind: 'line', key: 's' });
    const only = started([travaux()]);
    expect(defaultTransferTarget(only, M, 'trav', 'ldds')).toBeNull();
  });
});

