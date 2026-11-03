import { describe, expect, it } from 'vitest';
import { addBankAccount, setBankAccountOpening } from '../application/bankAccounts';
import { cancelAdjustment, createAdjustment, setAccountStatement } from '../application/checkoff';
import { closeBlockers, closeMonth } from '../application/monthClosing';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from './bank';
import { emptyData } from './empty';
import { canRegularise, defaultStatementDate, releveCount, releveFailures, releveRows } from './releve';
import { settleStatements } from './releve.fixture';
import type { BudgetData } from './types';

const M = '2027-01';
const TODAY = '2027-02-10';
const LIVRET = 'liv';

/** January 2027, initialized, no line (nothing left to place). The main account opens at 1 000 €; a savings account « Livret A » at 5 000 €. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, LIVRET, 'Livret A', 'epargne');
  Object.assign(d.accounts.find(a => a.id === LIVRET)!, { openingBalance: 5000, openingMonth: M });
  d.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  return d;
}
const rowOf = (d: BudgetData, id: string, m = M) => releveRows(d, m, TODAY).find(r => r.account.id === id);
const statement = (d: BudgetData, id: string, amount: number, on = '2027-01-31') => setAccountStatement(d, M, id, amount, on, TODAY);

describe('page Relevé : statut d’un compte (spec 0041)', () => {
  it('CA1: sans relevé, le compte est « À saisir » et bloque la clôture en étant nommé', () => {
    const d = started();
    expect(rowOf(d, MAIN_ACCOUNT_ID)!.status).toBe('to-enter');
    expect(closeBlockers(d, M, TODAY)).toEqual([
      { kind: 'statements', accounts: [expect.objectContaining({ accountId: MAIN_ACCOUNT_ID, reason: 'missing' }), expect.objectContaining({ accountId: LIVRET, reason: 'missing', name: 'Livret A' })] },
    ]);
    expect(closeMonth(d, M)).toBe(false);
  });

  it('CA2: un relevé égal au solde réel donne un écart nul et le statut « Validé »', () => {
    const d = started();
    expect(statement(d, MAIN_ACCOUNT_ID, 1000)).toBe('ok');
    expect(rowOf(d, MAIN_ACCOUNT_ID)).toMatchObject({ gap: 0, status: 'validated' });
  });

  it('CA3: un écart de 0,01 € suffit (tolérance nulle) : statut « Écart » et clôture refusée', () => {
    const d = started();
    statement(d, MAIN_ACCOUNT_ID, 1000.01);
    statement(d, LIVRET, 5000);
    expect(rowOf(d, MAIN_ACCOUNT_ID)).toMatchObject({ gap: 0.01, status: 'gap' });
    expect(releveFailures(d, M, TODAY)).toEqual([{ accountId: MAIN_ACCOUNT_ID, name: 'Compte principal', reason: 'gap', gap: 0.01 }]);
    expect(closeMonth(d, M)).toBe(false);
  });

  it('CA4: un écart comblé par une régularisation vaut 0, statut « Régularisé », la clôture n’est plus bloquée par ce compte', () => {
    const d = started();
    statement(d, LIVRET, 5012.4);
    statement(d, MAIN_ACCOUNT_ID, 1000);
    expect(rowOf(d, LIVRET)).toMatchObject({ gap: 12.4, status: 'gap' });
    expect(createAdjustment(d, M, 'adj', LIVRET, '2027-01-31', 12.4, TODAY)).toBe('ok');
    expect(rowOf(d, LIVRET)).toMatchObject({ gap: 0, status: 'regularised' });
    expect(closeBlockers(d, M, TODAY)).toEqual([]);
  });

  it('CA5: la régularisation annulée fait revenir l’écart, le statut « Écart » et le refus de clôture', () => {
    const d = started();
    statement(d, LIVRET, 5012.4);
    statement(d, MAIN_ACCOUNT_ID, 1000);
    createAdjustment(d, M, 'adj', LIVRET, '2027-01-31', 12.4, TODAY);
    expect(cancelAdjustment(d, 'adj', TODAY)).toBe(true);
    expect(rowOf(d, LIVRET)).toMatchObject({ gap: 12.4, status: 'gap' });
    expect(closeBlockers(d, M, TODAY)).toHaveLength(1);
  });

  it('CA6: un compte sans mouvement et sans solde n’est pas concerné : listé « Aucun mouvement », jamais bloquant, toujours saisissable', () => {
    const d = started();
    addBankAccount(d, 'vide', 'Compte vide');
    expect(rowOf(d, 'vide')).toMatchObject({ status: 'no-movement', concerned: false });
    expect(releveFailures(d, M, TODAY).map(f => f.accountId)).not.toContain('vide');
    expect(statement(d, 'vide', 0)).toBe('ok');
    // Listed after the concerned accounts.
    expect(releveRows(d, M, TODAY).at(-1)!.account.id).toBe('vide');
  });

  it('CA7: un compte ouvert après le mois est absent de la page et ne bloque pas', () => {
    const d = started();
    setBankAccountOpening(d, LIVRET, { month: '2027-02' });
    expect(rowOf(d, LIVRET)).toBeUndefined();
    expect(releveFailures(d, M, TODAY).map(f => f.accountId)).toEqual([MAIN_ACCOUNT_ID]);
  });

  it('CA8: épargne, investissement, enveloppe et compte hors budget sont concernés et bloquent', () => {
    const d = started();
    addBankAccount(d, 'inv', 'PEA', 'invest');
    addBankAccount(d, 'hb', 'Joint');
    d.accounts.find(a => a.id === 'hb')!.inBudget = false;
    for (const id of ['inv', 'hb']) Object.assign(d.accounts.find(a => a.id === id)!, { openingBalance: 200, openingMonth: M });
    d.accounts.push({ id: 'acc-env', name: 'Loisirs', hue: 10, isDefault: false, openingBalance: 80, openingMonth: M, inBudget: true, archived: false, kind: 'enveloppe' });
    const ids = releveFailures(d, M, TODAY).map(f => f.accountId);
    expect(ids).toEqual(expect.arrayContaining([MAIN_ACCOUNT_ID, LIVRET, 'inv', 'hb', 'acc-env']));
    expect(rowOf(d, 'hb')!.inBudget).toBe(false);
    expect(rowOf(d, 'acc-env')!.kind).toBe('enveloppe');
  });

  it('CA9: le compte réservé Espèces n’apparaît pas et ne bloque jamais', () => {
    const d = started();
    d.accounts.find(a => a.id === CASH_ACCOUNT_ID)!.openingBalance = 300;
    expect(rowOf(d, CASH_ACCOUNT_ID)).toBeUndefined();
    expect(releveFailures(d, M, TODAY).map(f => f.accountId)).not.toContain(CASH_ACCOUNT_ID);
  });

  it('CA10: un compte archivé avec un solde reste concerné ; sans solde ni mouvement, il ne l’est pas', () => {
    const d = started();
    addBankAccount(d, 'old', 'Ancien');
    Object.assign(d.accounts.find(a => a.id === 'old')!, { openingBalance: 40, openingMonth: M, archived: true });
    expect(rowOf(d, 'old')).toMatchObject({ concerned: true, status: 'to-enter' });
    d.accounts.find(a => a.id === 'old')!.openingBalance = 0;
    expect(rowOf(d, 'old')).toMatchObject({ concerned: false, status: 'no-movement' });
  });

  it('CA11: le mois de démarrage est soumis à la règle comme tout autre mois', () => {
    const d = started();
    expect(d.firstMonth).toBe(M);
    expect(closeBlockers(d, M, TODAY)).toHaveLength(1);
    d.months['2027-02'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    settleStatements(d, M);
    expect(closeMonth(d, M)).toBe(true);
    expect(closeBlockers(d, '2027-02', TODAY).map(b => b.kind)).toEqual(['statements']);
  });

  it('CA14: une écriture ajoutée avant la clôture fait réapparaître l’écart et refuse la clôture', () => {
    const d = started();
    settleStatements(d, M);
    expect(closeBlockers(d, M, TODAY)).toEqual([]);
    d.accountMovements = [{ id: 'mv', month: M, day: 10, label: 'Virement', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: LIVRET }];
    expect(rowOf(d, MAIN_ACCOUNT_ID)).toMatchObject({ gap: 50, status: 'gap' });
    expect(closeMonth(d, M)).toBe(false);
  });

  it('CA15: mois clôturé, la saisie du relevé, de sa date, la régularisation et son annulation sont refusées', () => {
    const d = started();
    settleStatements(d, M);
    createAdjustment(d, M, 'adj', LIVRET, '2027-01-31', 0.01, TODAY);
    settleStatements(d, M);
    statement(d, LIVRET, 5000.01);
    d.months[M].closed = true;
    expect(setAccountStatement(d, M, LIVRET, 1, '2027-01-30', TODAY)).toBe('locked');
    expect(setAccountStatement(d, M, LIVRET, null, '2027-01-30', TODAY)).toBe('locked');
    expect(createAdjustment(d, M, 'adj2', LIVRET, '2027-01-31', 5, TODAY)).toBe('locked');
    expect(cancelAdjustment(d, 'adj', TODAY)).toBe(false);
  });

  it('un mois clôturé n’est jamais re-vérifié : plus de motif, l’indisponibilité remplace tout', () => {
    const d = started();
    d.months[M].closed = true;
    expect(closeBlockers(d, M, TODAY)).toEqual([{ kind: 'unavailable' }]);
  });
});

describe('régularisation et compte hors budget (spec 0041, RG9)', () => {
  it('CA27: un écart se régularise sur un compte du budget, pas sur un compte hors budget, dont la clôture reste bloquée', () => {
    const d = started();
    addBankAccount(d, 'hb', 'Joint');
    Object.assign(d.accounts.find(a => a.id === 'hb')!, { openingBalance: 200, openingMonth: M, inBudget: false });
    settleStatements(d, M);
    statement(d, 'hb', 205);
    statement(d, LIVRET, 5001);
    expect(canRegularise(rowOf(d, LIVRET)!)).toBe(true);
    expect(canRegularise(rowOf(d, 'hb')!)).toBe(false);
    createAdjustment(d, M, 'adj', LIVRET, '2027-01-31', 1, TODAY);
    expect(closeBlockers(d, M, TODAY)).toEqual([{ kind: 'statements', accounts: [expect.objectContaining({ accountId: 'hb', reason: 'gap', gap: 5 })] }]);
    expect(canRegularise(rowOf(d, MAIN_ACCOUNT_ID)!)).toBe(false); // already in order
  });

  it('CA27bis: createAdjustment refuse un compte hors budget en écart : adjustments inchangé, clôture toujours bloquée', () => {
    const d = started();
    addBankAccount(d, 'hb', 'Joint');
    Object.assign(d.accounts.find(a => a.id === 'hb')!, { openingBalance: 200, openingMonth: M, inBudget: false });
    settleStatements(d, M);
    statement(d, 'hb', 205);
    const before = structuredClone(d.adjustments);
    expect(createAdjustment(d, M, 'adj', 'hb', '2027-01-31', 5, TODAY)).toBe('off-budget');
    expect(d.adjustments).toEqual(before);
    expect(rowOf(d, 'hb')).toMatchObject({ gap: 5, status: 'gap' });
    expect(closeMonth(d, M)).toBe(false);
  });
});

describe('page Relevé : compteur, date par défaut, motifs ensemble', () => {
  it('RG11: « n / total » ne compte que les comptes concernés', () => {
    const d = started();
    addBankAccount(d, 'vide', 'Compte vide');
    statement(d, MAIN_ACCOUNT_ID, 1000);
    expect(releveCount(releveRows(d, M, TODAY))).toEqual({ ok: 1, total: 2 });
  });

  it('CA (aucun compte concerné): 0 / 0 et la clôture n’est bloquée par aucun relevé', () => {
    const d = started();
    d.accounts.forEach(a => (a.openingBalance = 0));
    expect(releveCount(releveRows(d, M, TODAY))).toEqual({ ok: 0, total: 0 });
    expect(closeBlockers(d, M, TODAY)).toEqual([]);
  });

  it('RG7: la date par défaut est la fin de période, ou le jour s’il est avant', () => {
    const d = started();
    expect(defaultStatementDate(d, M, TODAY)).toBe('2027-01-31');
    expect(defaultStatementDate(d, M, '2027-01-12')).toBe('2027-01-12');
    expect(defaultStatementDate(d, M, '2026-12-20')).toBeNull();
  });

  it('CA13: le motif relevé s’ajoute aux autres, tous évalués ensemble', () => {
    const d = started();
    d.months['2027-02'] = { initialized: true, lines: [{ key: 'sal', block: 'rev', section: '', name: 'sal', budget: 100, actual: 100 }], alloc: {}, transfersDone: {} };
    const kinds = closeBlockers(d, '2027-02', TODAY).map(b => b.kind);
    expect(kinds).toEqual(['previous', 'available', 'statements']);
  });
});
