import { describe, expect, it } from 'vitest';
import { linkLineToAccount, decideAccountKind } from './accountKinds';
import { addBankAccount, setBankAccountKind, setLineLinkedAccount } from './bankAccounts';
import { collidingLine, kindCandidates, kindMismatches, normalizeName } from '../domain/accountKind';
import { CASH_ACCOUNT_ID, defaultBankAccounts, MAIN_ACCOUNT_ID } from '../domain/bank';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { migrateBankAccounts } from '../domain/migrate';
import type { BlockKey, BudgetData, Line } from '../domain/types';

/* Spec 0010: deduction of the kind from the names, tie of a line to its account, rules on the kind. */

const M1 = '2027-01';
const M2 = '2027-02';
const line = (key: string, block: BlockKey, name: string, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name, budget: 100, actual: null, ...extra });

function started(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = M1;
  d.accounts = defaultBankAccounts(M1);
  d.template.lines = lines.map(({ actual: _a, ...l }) => l);
  for (const m of [M1, M2]) d.months[m] = { initialized: true, lines: structuredClone(lines), alloc: {}, transfersDone: {} };
  return d;
}

/** An account whose kind was never decided, as loaded from data saved before this spec. */
function addUndecided(d: BudgetData, id: string, name: string) {
  addBankAccount(d, id, name);
  delete d.accounts.find(a => a.id === id)!.kind;
}

describe('candidats à la déduction du type', () => {
  it('CA9: le nom sans casse ni accents correspond à une ligne epa/inv', () => {
    const d = started([line('livret', 'epa', 'Livret A'), line('pea', 'inv', 'PEA')]);
    addUndecided(d, 'a', '  livret   a ');
    addUndecided(d, 'b', 'Pèa');
    expect(kindCandidates(d)).toMatchObject([
      { accountId: 'a', lineKey: 'livret', block: 'epa', taken: false, shared: false },
      { accountId: 'b', lineKey: 'pea', block: 'inv' },
    ]);
  });

  it('CA9: un nom proche n’est pas proposé', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    addUndecided(d, 'a', 'Livret A+');
    addUndecided(d, 'b', 'Livret');
    expect(kindCandidates(d)).toEqual([]);
  });

  it('CA9: le principal et Espèces ne sont jamais proposés', () => {
    const d = started([line('p', 'epa', 'Compte principal'), line('e', 'epa', 'Espèces')]);
    d.accounts.forEach(a => delete a.kind);
    expect(kindCandidates(d)).toEqual([]);
  });

  it('une ligne autre que epa/inv ne propose rien', () => {
    const d = started([line('loyer', 'fix', 'Loyer')]);
    addUndecided(d, 'a', 'Loyer');
    expect(kindCandidates(d)).toEqual([]);
  });

  it('RG22: un compte dont le type est connu n’est plus candidat', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    addBankAccount(d, 'a', 'Livret A', 'courant');
    expect(kindCandidates(d)).toEqual([]);
  });

  it('RG20: deux comptes de même nom : les deux sont proposés comme partagés', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    addUndecided(d, 'a', 'Livret A');
    addUndecided(d, 'b', 'livret a');
    expect(kindCandidates(d).map(c => [c.accountId, c.shared])).toEqual([['a', true], ['b', true]]);
    linkLineToAccount(d, 'livret', 'b');
    // Once one is tied, the other can only be typed without a link.
    expect(kindCandidates(d).map(c => [c.accountId, c.taken])).toEqual([['a', true]]);
  });

  it('CA12: la migration au chargement ne change rien et n’écrit aucun type', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    addUndecided(d, 'a', 'Livret A');
    const before = structuredClone(d);
    const once = migrateBankAccounts(d);
    const twice = migrateBankAccounts(once);
    expect(twice).toEqual(before);
    kindCandidates(twice);
    expect(twice).toEqual(before);
    expect(twice.accounts.find(a => a.id === 'a')!.kind).toBeUndefined();
  });

  it('normalizeName ignore casse, accents et espaces en trop', () => {
    expect(normalizeName('  Épargne   Été ')).toBe('epargne ete');
  });
});

describe('confirmer un candidat', () => {
  it('CA10: le type devient epargne, le lien est écrit sur le modèle et les mois ouverts, les soldes ne bougent pas', () => {
    const d = started([line('livret', 'epa', 'Livret A', { actual: 100 })]);
    addUndecided(d, 'a', 'Livret A');
    d.accounts.find(a => a.id === 'a')!.openingBalance = 1000;
    d.accounts.find(a => a.id === 'a')!.openingMonth = M1;
    const unlinkedBefore = new Ledger(d, M2).bankMonth(MAIN_ACCOUNT_ID, M1)!.balance;
    expect(linkLineToAccount(d, 'livret', 'a')).toBe(true);
    expect(d.accounts.find(a => a.id === 'a')!.kind).toBe('epargne');
    expect(d.template.lines[0].linkedAccountId).toBe('a');
    expect(d.months[M1].lines[0].linkedAccountId).toBe('a');
    expect(d.months[M2].lines[0].linkedAccountId).toBe('a');
    // The main account is paying the line either way: its balance does not change.
    expect(new Ledger(d, M2).bankMonth(MAIN_ACCOUNT_ID, M1)!.balance).toBe(unlinkedBefore);
    expect(kindCandidates(d)).toEqual([]);
  });

  it('CA10: une ligne inv donne le type invest', () => {
    const d = started([line('pea', 'inv', 'PEA')]);
    addUndecided(d, 'a', 'PEA');
    expect(linkLineToAccount(d, 'pea', 'a')).toBe(true);
    expect(d.accounts.find(a => a.id === 'a')!.kind).toBe('invest');
  });

  it('RG21: un mois clôturé ou verrouillé n’est pas touché, et les mois suivants reprennent le lien', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    d.months[M1].closed = true;
    addUndecided(d, 'a', 'Livret A');
    linkLineToAccount(d, 'livret', 'a');
    expect(d.months[M1].lines[0].linkedAccountId).toBeUndefined();
    expect(d.months[M2].lines[0].linkedAccountId).toBe('a');
    expect(d.template.lines[0].linkedAccountId).toBe('a');
    const e = started([line('livret', 'epa', 'Livret A')]);
    e.closes[2027] = { closed: true, overrides: {} };
    addUndecided(e, 'a', 'Livret A');
    linkLineToAccount(e, 'livret', 'a');
    expect(e.months[M2].lines[0].linkedAccountId).toBeUndefined();
    expect(e.template.lines[0].linkedAccountId).toBe('a');
  });

  it('RG25: refusé si le compte est la source de la ligne, sans rien changer', () => {
    const d = started([line('livret', 'epa', 'Livret A', { accountId: 'a' })]);
    addUndecided(d, 'a', 'Livret A');
    const before = structuredClone(d);
    expect(linkLineToAccount(d, 'livret', 'a')).toBe(false);
    expect(d).toEqual(before);
  });

  it('refusé pour le principal, Espèces, un compte archivé, une ligne inconnue ou déjà liée à un autre compte', () => {
    const d = started([line('livret', 'epa', 'Livret A'), line('pris', 'epa', 'Pris', { linkedAccountId: 'x' })]);
    addBankAccount(d, 'x', 'X', 'epargne');
    addBankAccount(d, 'arch', 'Arch');
    d.accounts.find(a => a.id === 'arch')!.archived = true;
    addBankAccount(d, 'y', 'Y');
    expect(linkLineToAccount(d, 'livret', MAIN_ACCOUNT_ID)).toBe(false);
    expect(linkLineToAccount(d, 'livret', CASH_ACCOUNT_ID)).toBe(false);
    expect(linkLineToAccount(d, 'livret', 'arch')).toBe(false);
    expect(linkLineToAccount(d, 'inconnue', 'y')).toBe(false);
    expect(linkLineToAccount(d, 'pris', 'y')).toBe(false);
    expect(d.accounts.find(a => a.id === 'y')!.kind).toBe('courant');
  });

  it('CA11: « Garder courant » écrit courant explicitement et le compte n’est plus candidat', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    addUndecided(d, 'a', 'Livret A');
    expect(decideAccountKind(d, 'a', 'courant')).toBe(true);
    expect(d.accounts.find(a => a.id === 'a')!.kind).toBe('courant');
    expect(kindCandidates(d)).toEqual([]);
  });
});

describe('règles sur le type', () => {
  it('CA13: une ligne epa refuse un compte invest, accepte un compte epargne', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    addBankAccount(d, 'iv', 'PEA', 'invest');
    addBankAccount(d, 'ep', 'Livret', 'epargne');
    expect(setLineLinkedAccount(d, M1, 'livret', 'iv')).toBe(false);
    expect(d.months[M1].lines[0].linkedAccountId).toBeUndefined();
    expect(setLineLinkedAccount(d, M1, 'livret', 'ep')).toBe(true);
  });

  it('CA13: le compte source de la ligne est refusé', () => {
    const d = started([line('livret', 'epa', 'Livret A', { accountId: 'ep' })]);
    addBankAccount(d, 'ep', 'Livret', 'epargne');
    expect(setLineLinkedAccount(d, M1, 'livret', 'ep')).toBe(false);
  });

  it('CA14: le type du principal et d’Espèces ne change pas', () => {
    const d = started([]);
    expect(setBankAccountKind(d, MAIN_ACCOUNT_ID, 'epargne')).toBe(false);
    expect(setBankAccountKind(d, CASH_ACCOUNT_ID, 'invest')).toBe(false);
    expect(d.accounts.every(a => a.kind === undefined)).toBe(true);
  });

  it('CA15 et RG4: changer le type ne change aucun solde, aucun lien', () => {
    const d = started([line('livret', 'epa', 'Livret A', { actual: 100, linkedAccountId: 'a' })]);
    addBankAccount(d, 'a', 'Livret A', 'epargne');
    d.accounts.find(a => a.id === 'a')!.openingBalance = 500;
    const read = () => {
      const l = new Ledger(d, M2);
      return d.accounts.map(a => l.bankMonth(a.id, M2)?.balance);
    };
    const before = read();
    expect(setBankAccountKind(d, 'a', 'invest')).toBe(true);
    expect(read()).toEqual(before);
    expect(d.months[M1].lines[0].linkedAccountId).toBe('a');
  });

  it('RG5: un compte archivé garde son type', () => {
    const d = started([]);
    addBankAccount(d, 'a', 'A', 'epargne');
    d.accounts.find(a => a.id === 'a')!.archived = true;
    expect(d.accounts.find(a => a.id === 'a')!.kind).toBe('epargne');
  });

  it('RG23: la création écrit le type choisi, courant par défaut', () => {
    const d = started([]);
    addBankAccount(d, 'a', 'A');
    addBankAccount(d, 'b', 'B', 'epargne');
    expect(d.accounts.find(a => a.id === 'a')!.kind).toBe('courant');
    expect(d.accounts.find(a => a.id === 'b')!.kind).toBe('epargne');
  });

  it('RG7: un lien vers un autre type reste, signalé « type à revoir »', () => {
    const d = started([line('livret', 'epa', 'Livret A', { linkedAccountId: 'a' })]);
    addBankAccount(d, 'a', 'Livret A', 'courant');
    expect(kindMismatches(d)).toEqual({ a: ['Livret A'] });
    setBankAccountKind(d, 'a', 'epargne');
    expect(kindMismatches(d)).toEqual({});
  });
});

describe('avertissement de collision (RG24)', () => {
  it('une ligne non liée du même nom est signalée, une ligne liée non', () => {
    const d = started([line('livret', 'epa', 'Livret A'), line('pea', 'inv', 'PEA', { linkedAccountId: 'iv' })]);
    addBankAccount(d, 'a', 'livret a');
    addBankAccount(d, 'iv', 'PEA', 'invest');
    expect(collidingLine(d, 'livret a', 'a')?.key).toBe('livret');
    expect(collidingLine(d, 'PEA', 'iv')).toBeUndefined();
    expect(collidingLine(d, 'Autre', 'a')).toBeUndefined();
    expect(collidingLine(d, 'Livret A', MAIN_ACCOUNT_ID)).toBeUndefined();
  });

  it('lier à la ligne règle la collision', () => {
    const d = started([line('livret', 'epa', 'Livret A')]);
    addBankAccount(d, 'a', 'Livret A');
    expect(linkLineToAccount(d, 'livret', 'a')).toBe(true);
    expect(collidingLine(d, 'Livret A', 'a')).toBeUndefined();
  });
});
