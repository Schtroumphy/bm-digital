import { describe, expect, it } from 'vitest';
import { MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { accountTransfersView } from '../domain/accountTransfers';
import { blockTotals, budgetLines } from '../domain/budget';
import { dashboardView } from '../domain/dashboard';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { fromRows, toRows } from '../infrastructure/supabaseRows';
import { TABLE_ORDER } from '../infrastructure/supabaseSchema';
import type { BudgetData } from '../domain/types';
import { addTransfer, updateAccountMovement } from './accountMovements';
import { addTransaction, applyTemplate, duplicatePrevious, saveAsTemplate, updateTransaction, type TransactionPatch } from './actions';
import { createAccountTransfer, deleteAccountTransfer, updateAccountTransfer, type TransferInput } from './accountTransfers';
import { addBankAccount } from './bankAccounts';

/* Spec 0050 (amendement) : création, édition, suppression et reconduction d'un transfert entre comptes. */

const M = '2027-01';
const NEXT = '2027-02';
const TODAY = '2027-01-03';

function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  addBankAccount(d, 'ldds', 'LDDS Travaux', 'epargne');
  addBankAccount(d, 'trav', 'Travaux', 'epargne');
  addBankAccount(d, 'liv', 'Livret A', 'epargne');
  d.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  return d;
}

const input = (extra: Partial<TransferInput> = {}): TransferInput => ({ fromAccountId: 'ldds', toAccountId: 'trav', amount: 800, dueDay: 5, ...extra });
const withTransfer = (extra: Partial<TransferInput> = {}) => {
  const d = started();
  expect(createAccountTransfer(d, M, 't1', input(extra))).toBeNull();
  return d;
};
const line = (d: BudgetData, m = M) => d.months[m].lines.find(l => l.key === 't1')!;
/** `var` expense assigned to « Travaux » and associated with the line `t1` (spec 0050, RG36). */
const attach = (d: BudgetData, amount: number, link = true) =>
  addTransaction(d, { id: 'x1', month: M, day: 3, label: 'Peintre', amount, type: 'var', target: 'v', accountId: MAIN_ACCOUNT_ID, assignedAccountId: 'trav', ...(link ? { transferLineKey: 't1' } : {}) });
const tx = (d: BudgetData) => d.transactions.find(t => t.id === 'x1')!;
const patchOf = (_d: BudgetData, extra: Partial<TransactionPatch> = {}): TransactionPatch => ({ label: 'Peintre', amount: 300, date: '2027-01-03', type: 'var', target: 'v', ...extra });
const send = (d: BudgetData, amount: number) =>
  addTransfer(d, { id: 'm1', month: M, day: 4, label: 'Virement', amount, fromAccountId: 'ldds', toAccountId: 'trav', targets: [{ kind: 'line', key: 't1' }] });

describe('création (RG23 à RG25, CA22, CA24)', () => {
  it('CA22 : crée une ligne epa avec payeur, cible, budget, jour et libellé ; l’encart la montre « À faire »', () => {
    const d = withTransfer({ label: ' Travaux salle de bain ' });
    expect(line(d)).toMatchObject({ block: 'epa', accountId: 'ldds', linkedAccountId: 'trav', budget: 800, dueDay: 5, name: 'Travaux salle de bain' });
    expect(accountTransfersView(d, M, TODAY)!.items[0]).toMatchObject({ key: 't1', title: 'Travaux salle de bain', route: 'LDDS Travaux → Travaux', left: 800, status: 'todo', day: 5 });
  });

  it('sans libellé ni jour : nom vide, pas de jour', () => {
    const d = withTransfer({ dueDay: undefined });
    expect(line(d).name).toBe('');
    expect(line(d)).not.toHaveProperty('dueDay');
  });

  it.each([
    ['montant 0', { amount: 0 }],
    ['montant négatif', { amount: -5 }],
    ['comptes identiques', { toAccountId: 'ldds' }],
    ['compte débité manquant', { fromAccountId: '' }],
    ['compte cible manquant', { toAccountId: '' }],
    ['principal comme cible', { toAccountId: MAIN_ACCOUNT_ID }],
    ['principal comme débité', { fromAccountId: MAIN_ACCOUNT_ID }],
    ['Espèces comme cible', { toAccountId: 'acc-cash' }],
    ['jour 0', { dueDay: 0 }],
    ['jour 32', { dueDay: 32 }],
    ['jour décimal', { dueDay: 2.5 }],
  ] as [string, Partial<TransferInput>][])('CA24 : refus (%s), aucune ligne créée', (_, extra) => {
    const d = started();
    expect(createAccountTransfer(d, M, 't1', input(extra))).toEqual(expect.any(String));
    expect(d.months[M].lines).toHaveLength(0);
  });

  it('refuse un compte archivé, un mois non initialisé', () => {
    const d = started();
    d.accounts.find(a => a.id === 'liv')!.archived = true;
    expect(createAccountTransfer(d, M, 't1', input({ fromAccountId: 'liv' }))).not.toBeNull();
    expect(createAccountTransfer(d, NEXT, 't1', input())).not.toBeNull();
  });
});

describe('édition (RG27, CA26 à CA28)', () => {
  it('CA26 : change montant, jour et libellé', () => {
    const d = withTransfer();
    expect(updateAccountTransfer(d, M, 't1', input({ amount: 900, dueDay: 12, label: 'Gros œuvre' }))).toBeNull();
    expect(line(d)).toMatchObject({ budget: 900, dueDay: 12, name: 'Gros œuvre' });
    expect(updateAccountTransfer(d, M, 't1', input({ amount: 900, dueDay: undefined }))).toBeNull();
    expect(line(d)).not.toHaveProperty('dueDay');
  });

  it('sans écriture, les comptes sont modifiables', () => {
    const d = withTransfer();
    expect(updateAccountTransfer(d, M, 't1', input({ fromAccountId: 'liv' }))).toBeNull();
    expect(line(d).accountId).toBe('liv');
  });

  it('CA28 : avec un virement ou une dépense associée à la ligne, les comptes sont figés, libellé et jour restent libres', () => {
    for (const make of [attach, send]) {
      const d = withTransfer();
      make(d, 100);
      const before = structuredClone(line(d));
      expect(updateAccountTransfer(d, M, 't1', input({ fromAccountId: 'liv' }))).toEqual(expect.any(String));
      expect(updateAccountTransfer(d, M, 't1', input({ toAccountId: 'liv' }))).toEqual(expect.any(String));
      expect(line(d).accountId).toBe(before.accountId);
      expect(updateAccountTransfer(d, M, 't1', input({ amount: 800, dueDay: 9, label: 'Ok' }))).toBeNull();
      expect(line(d)).toMatchObject({ dueDay: 9, name: 'Ok' });
    }
  });

  it('CA27 (amendé) : le montant d’un transfert reste toujours modifiable, même avec un virement et une dépense associés', () => {
    const d = withTransfer();
    send(d, 100);
    attach(d, 100);
    expect(updateAccountTransfer(d, M, 't1', input({ amount: 700 }))).toBeNull();
    expect(line(d).budget).toBe(700);
  });

  it('CA40 : le principal ne peut pas devenir la cible à l’édition ; une ligne existante qui l’a déjà reste éditable (libellé, jour, montant)', () => {
    const d = withTransfer();
    expect(updateAccountTransfer(d, M, 't1', input({ toAccountId: MAIN_ACCOUNT_ID }))).not.toBeNull();
    expect(line(d).linkedAccountId).toBe('trav');
    line(d).linkedAccountId = MAIN_ACCOUNT_ID;
    expect(accountTransfersView(d, M, TODAY)!.items).toHaveLength(1);
    expect(updateAccountTransfer(d, M, 't1', { fromAccountId: 'ldds', toAccountId: MAIN_ACCOUNT_ID, amount: 900, dueDay: 12, label: 'Nouveau' })).toBeNull();
    expect(line(d)).toMatchObject({ linkedAccountId: MAIN_ACCOUNT_ID, budget: 900, dueDay: 12, name: 'Nouveau' });
  });
});

describe('suppression (RG28, CA28, CA29, CA52)', () => {
  it('CA52 : une dépense seulement affectée au compte cible (sans association) ne bloque ni les comptes ni la suppression', () => {
    const d = withTransfer();
    attach(d, 100, false);
    expect(updateAccountTransfer(d, M, 't1', input({ fromAccountId: 'liv' }))).toBeNull();
    expect(deleteAccountTransfer(d, M, 't1')).toBeNull();
  });

  it('CA29 : sans écriture, retire la ligne du mois affiché seulement', () => {
    const d = withTransfer();
    d.months[NEXT] = { initialized: true, lines: [structuredClone(line(d))], alloc: {}, transfersDone: {} };
    const balances = JSON.stringify(new Ledger(d, M).bankMonth('trav', M));
    expect(deleteAccountTransfer(d, M, 't1')).toBeNull();
    expect(d.months[M].lines).toHaveLength(0);
    expect(d.months[NEXT].lines).toHaveLength(1);
    expect(JSON.stringify(new Ledger(d, M).bankMonth('trav', M))).toBe(balances);
  });

  it('CA28 : refusée avec un virement ou une dépense rattachés', () => {
    for (const make of [attach, send]) {
      const d = withTransfer();
      make(d, 100);
      expect(deleteAccountTransfer(d, M, 't1')).toEqual(expect.any(String));
      expect(d.months[M].lines).toHaveLength(1);
    }
  });

  it('refuse une ligne qui n’est pas un transfert', () => {
    const d = withTransfer();
    d.months[M].lines.push({ key: 's', block: 'epa', section: '', name: 'Vacances', budget: 50, actual: null, linkedAccountId: 'liv' });
    expect(deleteAccountTransfer(d, M, 's')).not.toBeNull();
    expect(updateAccountTransfer(d, M, 's', input())).not.toBeNull();
  });
});

describe('mois clos ou verrouillé (RG19, CA18, CA30)', () => {
  it('création, modification et suppression refusées', () => {
    const d = withTransfer();
    d.months[M].closed = true;
    expect(createAccountTransfer(d, M, 't2', input())).not.toBeNull();
    expect(updateAccountTransfer(d, M, 't1', input({ amount: 1 }))).not.toBeNull();
    expect(deleteAccountTransfer(d, M, 't1')).not.toBeNull();
    expect(line(d).budget).toBe(800);
    expect(accountTransfersView(d, M, '2027-03-01')!.items[0].status).toBe('todo');
  });
});

describe('reconduction (RG25, RG34, CA31, CA38, CA39)', () => {
  it('CA39 / CA31 : « dupliquer le mois précédent » reprend le transfert avec comptes, montant, jour et libellé, et sans réel', () => {
    const d = withTransfer({ label: 'Travaux' });
    send(d, 300);
    expect(duplicatePrevious(d, NEXT)).toBe(true);
    expect(line(d, NEXT)).toMatchObject({ accountId: 'ldds', linkedAccountId: 'trav', budget: 800, dueDay: 5, name: 'Travaux', actual: null });
    expect(accountTransfersView(d, NEXT, '2027-02-01')!.items[0].left).toBe(800);
  });

  it('CA38 : enregistré comme modèle puis appliqué, le transfert est dans le nouveau mois', () => {
    const d = withTransfer({ label: 'Travaux' });
    saveAsTemplate(d, M);
    expect(d.template.lines.find(l => l.key === 't1')).toMatchObject({ accountId: 'ldds', linkedAccountId: 'trav', budget: 800, dueDay: 5, name: 'Travaux' });
    expect(applyTemplate(d, NEXT)).toBe(true);
    expect(line(d, NEXT)).toMatchObject({ accountId: 'ldds', budget: 800, name: 'Travaux' });
  });

  it('la création n’ajoute la ligne que dans le mois affiché', () => {
    const d = started();
    d.months[NEXT] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    createAccountTransfer(d, M, 't1', input());
    expect(d.months[NEXT].lines).toHaveLength(0);
    expect(d.template.lines).toHaveLength(0);
  });
});

describe('totaux, tableau de bord et sauvegarde (CA19, CA32, CA35)', () => {
  it('CA32 : le total Épargne du budget ne bouge pas à la création', () => {
    const d = started();
    const before = blockTotals(budgetLines(d, M), 'epa');
    createAccountTransfer(d, M, 't1', input());
    expect(blockTotals(budgetLines(d, M), 'epa')).toEqual(before);
  });

  it('CA19 : le tableau de bord garde le transfert dans « virements à effectuer », avec son nom calculé', () => {
    const d = withTransfer();
    const t = dashboardView(d, new Ledger(d, M), M, TODAY).todo!.transfers.find(x => x.id === 't1')!;
    expect(t).toMatchObject({ name: 'LDDS Travaux → Travaux', amount: 800, done: false, day: 5 });
  });

  it('CA35 : sauvegarde puis rechargement, avec ou sans libellé', () => {
    const d = withTransfer({ label: 'Travaux' });
    createAccountTransfer(d, M, 't2', input({ fromAccountId: 'liv', dueDay: undefined }));
    const rows = toRows(d);
    const back = fromRows(Object.fromEntries(TABLE_ORDER.map(t => [t, rows[t].map(r => ({ user_id: 'u1', ...r }))])) as unknown as Parameters<typeof fromRows>[0])!;
    expect(back.months[M].lines.find(l => l.key === 't1')).toEqual(line(d));
    expect(back.months[M].lines.find(l => l.key === 't2')).toEqual(d.months[M].lines.find(l => l.key === 't2'));
    expect(back.months[M].lines.find(l => l.key === 't2')!.name).toBe('');
  });
});

describe('association d’une opération à une ligne de transfert (RG36 à RG45, CA43 à CA55)', () => {
  it('CA43 : l’affectation au compte et le lien sont posés par une seule écriture ; l’opération sort du budget (CA46)', () => {
    const d = withTransfer();
    expect(attach(d, 300)).toBe(true);
    expect(tx(d)).toMatchObject({ assignedAccountId: 'trav', transferLineKey: 't1' });
    expect(line(d).actual).toBe(300);
    expect(accountTransfersView(d, M, TODAY)!.items[0]).toMatchObject({ attached: 300, left: 500, status: 'partial' });
  });

  it('CA45 : « Aucune ligne » retire le lien et garde l’affectation ; retirer l’affectation ou passer hors budget retire aussi le lien', () => {
    const d = withTransfer();
    attach(d, 300);
    expect(updateTransaction(d, 'x1', patchOf(d, { transferLineKey: null }))).toBe(true);
    expect(tx(d)).toMatchObject({ assignedAccountId: 'trav' });
    expect(tx(d)).not.toHaveProperty('transferLineKey');
    expect(line(d).actual).toBeNull();
    for (const change of [{ assignedAccountId: null }, { assignedAccountId: null, offBudget: true }] as Partial<TransactionPatch>[]) {
      const e = withTransfer();
      attach(e, 300);
      expect(updateTransaction(e, 'x1', patchOf(e, change))).toBe(true);
      expect(tx(e)).not.toHaveProperty('transferLineKey');
      expect(e.months[M].lines.find(l => l.key === 't1')!.actual).toBeNull();
    }
  });

  it('CA55 : un libellé, un montant ou une date modifiés gardent le lien ; un type non affectable ou un autre compte le retirent', () => {
    const d = withTransfer();
    attach(d, 300);
    expect(updateTransaction(d, 'x1', patchOf(d, { label: 'Autre', amount: 120 }))).toBe(true);
    expect(tx(d)).toMatchObject({ transferLineKey: 't1', amount: 120 });
    expect(line(d).actual).toBe(120);
    // Une date modifiée dans le mois garde le lien.
    expect(updateTransaction(d, 'x1', patchOf(d, { amount: 120, date: '2027-01-20' }))).toBe(true);
    expect(tx(d)).toMatchObject({ transferLineKey: 't1', day: 20 });
    // Un type non affectable est refusé tant que l'opération reste affectée : rien ne change, le lien reste.
    const before = JSON.stringify(d);
    expect(updateTransaction(d, 'x1', patchOf(d, { type: 'env', target: 'inconnue' }))).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
    addBankAccount(d, 'autre', 'Autre épargne', 'epargne');
    expect(updateTransaction(d, 'x1', patchOf(d, { assignedAccountId: 'autre' }))).toBe(true);
    expect(tx(d)).toMatchObject({ assignedAccountId: 'autre' });
    expect(tx(d)).not.toHaveProperty('transferLineKey');
  });

  it('une association donnée à la modification doit viser le compte d’affectation, sinon la modification est refusée sans rien changer', () => {
    const d = withTransfer();
    attach(d, 300, false);
    const before = JSON.stringify(d);
    expect(updateTransaction(d, 'x1', patchOf(d, { transferLineKey: 'inconnue' }))).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
    expect(updateTransaction(d, 'x1', patchOf(d, { transferLineKey: 't1' }))).toBe(true);
    expect(tx(d).transferLineKey).toBe('t1');
  });

  it('CA47 : mois clos, association et changement refusés, lien inchangé', () => {
    const d = withTransfer();
    attach(d, 300);
    d.months[M].closed = true;
    expect(updateTransaction(d, 'x1', patchOf(d, { transferLineKey: null }))).toBe(false);
    expect(tx(d).transferLineKey).toBe('t1');
    expect(attach(d, 10, true)).toBe(false);
  });

  it('CA53 : ligne supprimée (ici, mois écrasé par le modèle) : le lien reste inerte sans erreur, et reprend effet si la ligne réapparaît', () => {
    const d = withTransfer();
    attach(d, 300);
    d.months[M].lines = d.months[M].lines.filter(l => l.key !== 't1');
    expect(tx(d)).toMatchObject({ assignedAccountId: 'trav', transferLineKey: 't1' });
    expect(accountTransfersView(d, M, TODAY)!.items).toHaveLength(0);
    // Une modification de l’opération garde le lien inerte, avec ou sans lien dans le patch.
    expect(updateTransaction(d, 'x1', patchOf(d, { label: 'Autre' }))).toBe(true);
    expect(tx(d).transferLineKey).toBe('t1');
    // Ce que envoie l’écran Opérations : le lien recopié tel quel dans le patch d’une modification de libellé, ligne supprimée.
    expect(updateTransaction(d, 'x1', patchOf(d, { label: 'Encore', assignedAccountId: 'trav', transferLineKey: 't1' }))).toBe(true);
    expect(tx(d)).toMatchObject({ label: 'Encore', transferLineKey: 't1', assignedAccountId: 'trav' });
    // Un lien NOUVEAU vers une ligne qui n'existe pas reste refusé.
    expect(updateTransaction(d, 'x1', patchOf(d, { transferLineKey: 'autre' }))).toBe(false);
    createAccountTransfer(d, M, 't1', input());
    expect(accountTransfersView(d, M, TODAY)!.items[0]).toMatchObject({ attached: 300, left: 500 });
  });

  it('CA48 : modèle et « dupliquer le mois précédent » ne reprennent aucun lien ; la ligne reconduite a un reste égal à son prévu', () => {
    const d = withTransfer();
    attach(d, 300);
    saveAsTemplate(d, M);
    duplicatePrevious(d, NEXT);
    applyTemplate(d, '2027-03');
    for (const m of [NEXT, '2027-03']) {
      expect(accountTransfersView(d, m, '2027-01-03')!.items[0]).toMatchObject({ attached: 0, left: 800 });
      expect(d.transactions.filter(t => t.month === m)).toHaveLength(0);
    }
  });
});

describe('rattachement d’un virement à une ligne de transfert en édition (D18, CA57 à CA61)', () => {
  const free = (d: BudgetData, from = MAIN_ACCOUNT_ID, to = 'trav', amount = 300, id = 'v1') =>
    addTransfer(d, { id, month: M, day: 8, label: 'Virement importé', amount, fromAccountId: from, toAccountId: to });
  const mv = (d: BudgetData, id = 'v1') => d.accountMovements!.find(m => m.id === id)!;
  const edit = (d: BudgetData, targets?: { kind: 'line'; key: string }[], extra: object = {}, id = 'v1') =>
    updateAccountMovement(d, id, { label: 'Virement importé', amount: mv(d, id).amount, ...(targets ? { targets } : {}), ...extra });
  const view = (d: BudgetData) => accountTransfersView(d, M, TODAY)!.items[0];

  it('CA57 / CA58 : un virement Principal → Travaux se rattache à « LDDS Travaux → Travaux » (source non contrôlée), puis « Aucune » annule l’effet', () => {
    const d = withTransfer();
    free(d);
    expect(view(d)).toMatchObject({ transferred: 0, left: 800 });
    expect(edit(d, [{ kind: 'line', key: 't1' }])).toBe(true);
    expect(mv(d).targets).toEqual([{ kind: 'line', key: 't1' }]);
    expect(view(d)).toMatchObject({ transferred: 300, left: 500, status: 'partial' });
    expect(line(d).actual).toBe(300);
    expect(edit(d, [])).toBe(true);
    expect(mv(d)).not.toHaveProperty('targets');
    expect(view(d)).toMatchObject({ transferred: 0, left: 800, status: 'todo' });
    expect(line(d).actual).toBeNull();
  });

  it('CA58 : un virement vers un autre compte que la cible de la ligne ne peut pas s’y rattacher', () => {
    const d = withTransfer();
    free(d, MAIN_ACCOUNT_ID, 'liv');
    const before = JSON.stringify(d);
    expect(edit(d, [{ kind: 'line', key: 't1' }])).toBe(false);
    expect(JSON.stringify(d)).toBe(before);
  });

  it('CA59 : un seul choix par virement (deux lignes, ou ligne de transfert avec une autre cible) est refusé ; deux virements peuvent viser la même ligne', () => {
    const d = withTransfer();
    createAccountTransfer(d, M, 't2', input({ fromAccountId: 'liv' }));
    free(d);
    free(d, MAIN_ACCOUNT_ID, 'trav', 100, 'v2');
    expect(edit(d, [{ kind: 'line', key: 't1' }, { kind: 'line', key: 't2' }])).toBe(false);
    expect(edit(d, [{ kind: 'line', key: 't1' }])).toBe(true);
    expect(edit(d, [{ kind: 'line', key: 't1' }], {}, 'v2')).toBe(true);
    expect(view(d)).toMatchObject({ transferred: 400, left: 400 });
  });

  it('CA60 : mois clos, le rattachement et son retrait sont refusés', () => {
    const d = withTransfer();
    free(d);
    edit(d, [{ kind: 'line', key: 't1' }]);
    d.months[M].closed = true;
    expect(edit(d, [])).toBe(false);
    expect(mv(d).targets).toEqual([{ kind: 'line', key: 't1' }]);
    const e = withTransfer();
    free(e);
    e.months[M].closed = true;
    expect(edit(e, [{ kind: 'line', key: 't1' }])).toBe(false);
  });

  it('CA61 : avec un virement rattaché, le montant de la ligne reste modifiable, ses comptes sont figés et sa suppression refusée', () => {
    const d = withTransfer();
    free(d);
    edit(d, [{ kind: 'line', key: 't1' }]);
    expect(updateAccountTransfer(d, M, 't1', input({ amount: 900 }))).toBeNull();
    expect(updateAccountTransfer(d, M, 't1', input({ amount: 900, fromAccountId: 'liv' }))).toEqual(expect.any(String));
    expect(deleteAccountTransfer(d, M, 't1')).toEqual(expect.any(String));
    // Retiré, la ligne est de nouveau libre.
    edit(d, []);
    expect(deleteAccountTransfer(d, M, 't1')).toBeNull();
  });

  it('un virement libre n’est rattaché à rien tant qu’on ne le fait pas (aucun rattachement automatique)', () => {
    const d = withTransfer();
    free(d);
    expect(mv(d)).not.toHaveProperty('targets');
    expect(view(d).transferred).toBe(0);
  });
});

