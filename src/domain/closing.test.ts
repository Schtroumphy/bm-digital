import { describe, expect, it } from 'vitest';
import { addBankAccount, archiveBankAccount } from '../application/bankAccounts';
import { closingView } from './closing';
import { defaultBankAccounts, kindOf } from './bank';
import { emptyData } from './empty';
import { Ledger } from './ledger';
import type { AccountKind, BankAccount, BlockKey, BudgetData, Line } from './types';

/*
 * Spec 0010: each amount appears once in the year closing.
 * Single month, December 2026, so the balances at 31 December are easy to read.
 */

const DEC = '2026-12';
const line = (key: string, block: BlockKey, name: string, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name, budget: 0, actual: null, ...extra });

function base(lines: Line[], statements: Record<string, number> = {}): BudgetData {
  const d = emptyData();
  d.firstMonth = DEC;
  d.accounts = defaultBankAccounts(DEC);
  d.months[DEC] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  d.template.lines = lines.map(({ actual: _a, ...l }) => l);
  d.statements[DEC] = statements;
  return d;
}

const open = (d: BudgetData, id: string, name: string, kind: AccountKind | undefined, balance: number) => {
  addBankAccount(d, id, name, kind ?? 'courant');
  const a = d.accounts.find(x => x.id === id)!;
  if (kind === undefined) delete a.kind;
  a.openingBalance = balance;
  a.openingMonth = DEC;
};

const view = (d: BudgetData, year = 2026) => closingView(d, new Ledger(d, DEC), year);
const group = (d: BudgetData, id: AccountKind) => view(d).groups.find(g => g.id === id);
const namesOf = (d: BudgetData, id: AccountKind) => group(d, id)?.rows.map(r => r.name) ?? [];

describe('type de compte', () => {
  it('CA1: un compte sans type est courant', () => {
    const a = { id: 'x' } as BankAccount;
    expect(kindOf(a)).toBe('courant');
    expect(kindOf({ ...a, kind: 'invest' })).toBe('invest');
  });
});

describe('groupes de la clôture', () => {
  it('CA2: chaque compte est dans un seul groupe, celui de son type', () => {
    const d = base([]);
    open(d, 'cc', 'Compte joint', 'courant', 100);
    open(d, 'ep', 'Livret A', 'epargne', 1000);
    open(d, 'iv', 'PEA', 'invest', 5000);
    open(d, 'sans', 'Sans type', undefined, 7);
    expect(namesOf(d, 'courant')).toEqual(['Compte principal', 'Espèces', 'Compte joint', 'Sans type']);
    expect(namesOf(d, 'epargne')).toEqual(['Livret A']);
    expect(namesOf(d, 'invest')).toEqual(['PEA']);
    const all = view(d).groups.flatMap(g => g.rows.map(r => r.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('CA3: une ligne epa liée est représentée par son compte, au solde du compte', () => {
    const d = base([line('livret', 'epa', 'Livret A', { actual: 200, linkedAccountId: 'ep' })], { livret: 9999 });
    open(d, 'ep', 'Livret A', 'epargne', 1000);
    // Spec 0019 : le versement de 200 est un transfert réel (le réel d'une ligne n'est plus saisi).
    d.accountMovements = [{ id: 'm', month: DEC, day: 5, label: 'Versement', amount: 200, fromAccountId: 'acc-main', toAccountId: 'ep', target: { kind: 'line', key: 'livret' } }];
    const g = group(d, 'epargne')!;
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0].account?.id).toBe('ep');
    expect(g.rows[0].calc).toBe(1200);
    expect(g.tcalc).toBe(1200);
    // The line balance (statement 9 999) is not counted anywhere.
    expect(view(d).groups.flatMap(g => g.rows).some(r => r.id === 'acc:livret')).toBe(false);
  });

  it('CA4: une ligne epa non liée garde sa ligne propre dans Épargnes', () => {
    const d = base([line('livret', 'epa', 'Livret A', { actual: 200 })], { livret: 800 });
    const g = group(d, 'epargne')!;
    expect(g.rows).toMatchObject([{ id: 'acc:livret', name: 'Livret A', calc: 800, unlinked: true }]);
  });

  it('RG11: comptes d’épargne et lignes non liées cohabitent dans le même groupe, chacun une fois', () => {
    const d = base([line('livret', 'epa', 'Livret A', { linkedAccountId: 'ep' }), line('ldd', 'epa', 'LDD')], { ldd: 300 });
    open(d, 'ep', 'Livret A', 'epargne', 1000);
    expect(namesOf(d, 'epargne')).toEqual(['Livret A', 'LDD']);
    expect(group(d, 'epargne')!.tcalc).toBe(1300);
  });

  it('CA5: deux lignes liées au même compte : le compte une seule fois, aucune ligne', () => {
    const d = base([line('a', 'epa', 'Vacances', { linkedAccountId: 'ep' }), line('b', 'epa', 'Cadeaux', { linkedAccountId: 'ep' })], { a: 10, b: 20 });
    open(d, 'ep', 'Pot commun', 'epargne', 500);
    expect(group(d, 'epargne')!.rows.map(r => r.id)).toEqual(['bank:ep']);
  });

  it('CA6: un compte invest lié à une ligne inv est dans Investissements, sans ligne propre', () => {
    const d = base([line('pea', 'inv', 'PEA', { linkedAccountId: 'iv' })], { pea: 4000 });
    open(d, 'iv', 'PEA', 'invest', 5000);
    expect(group(d, 'invest')!.rows.map(r => r.id)).toEqual(['bank:iv']);
    expect(group(d, 'epargne')).toBeUndefined();
  });

  it('RG7: une ligne liée à un compte d’un autre type n’a toujours pas de ligne propre, le compte suit son type', () => {
    const d = base([line('livret', 'epa', 'Livret A', { linkedAccountId: 'cc' })], { livret: 800 });
    open(d, 'cc', 'Livret A', 'courant', 1000);
    expect(namesOf(d, 'courant')).toContain('Livret A');
    expect(group(d, 'epargne')).toBeUndefined();
  });

  it('RG6: le lien se fait par identifiant, jamais par le nom', () => {
    const d = base([line('livret', 'epa', 'Livret A')], { livret: 800 });
    open(d, 'ep', 'Livret A', 'epargne', 1000);
    expect(group(d, 'epargne')!.rows.map(r => r.id)).toEqual(['bank:ep', 'acc:livret']);
  });

  it('CA7: un compte archivé à zéro est absent, avec un solde il reste', () => {
    const d = base([]);
    open(d, 'vide', 'Vide', 'courant', 0);
    open(d, 'plein', 'Plein', 'courant', 50);
    archiveBankAccount(d, 'vide');
    archiveBankAccount(d, 'plein');
    expect(namesOf(d, 'courant')).not.toContain('Vide');
    expect(namesOf(d, 'courant')).toContain('Plein');
  });

  it('une ligne liée à un compte archivé soldé à zéro : ni compte ni ligne', () => {
    const d = base([line('livret', 'epa', 'Livret A', { linkedAccountId: 'ep' })], { livret: 800 });
    open(d, 'ep', 'Livret A', 'epargne', 0);
    archiveBankAccount(d, 'ep');
    expect(group(d, 'epargne')).toBeUndefined();
  });

  it('un compte ouvert après décembre n’apparaît pas', () => {
    const d = base([]);
    open(d, 'tard', 'Tard', 'epargne', 10);
    d.accounts.find(a => a.id === 'tard')!.openingMonth = '2027-01';
    expect(group(d, 'epargne')).toBeUndefined();
  });

  it('CA8: données d’exemple, le total compte chaque euro une fois', () => {
    const d = base(
      [
        line('livret', 'epa', 'Livret A', { linkedAccountId: 'livret' }),
        line('ldd', 'epa', 'LDD', { linkedAccountId: 'ldd' }),
        line('mada', 'epa', 'Vacances Mada', { linkedAccountId: 'mada' }),
        line('pea', 'inv', 'PEA', { linkedAccountId: 'pea' }),
        line('amundi', 'inv', 'Amundi', { linkedAccountId: 'amundi' }),
        line('tr', 'inv', 'Trade Republik'),
      ],
      { livret: 1, ldd: 1, mada: 1, pea: 1, amundi: 1, tr: 700 },
    );
    open(d, 'livret', 'Livret A', 'epargne', 1000);
    open(d, 'ldd', 'LDD', 'epargne', 2000);
    open(d, 'mada', 'Vacances Mada', 'epargne', 300);
    open(d, 'pea', 'PEA', 'invest', 4000);
    open(d, 'amundi', 'Amundi', 'invest', 500);
    // Principal and Espèces are at 0: the total is each account once + the unlinked line.
    expect(view(d).total).toBe(1000 + 2000 + 300 + 4000 + 500 + 700);
  });

  it('CA16: une année clôturée garde ses bases ajustées', () => {
    const d = base([line('livret', 'epa', 'Livret A', { linkedAccountId: 'ep' })]);
    open(d, 'ep', 'Livret A', 'epargne', 1000);
    d.closes[2026] = { closed: true, overrides: { 'bank:ep': 1111, 'acc:livret': 42 } };
    const row = group(d, 'epargne')!.rows[0];
    expect(row).toMatchObject({ calc: 1000, val: 1111, adj: 111 });
    expect(view(d).nAdj).toBe(1);
    // The saved closing is not rewritten.
    expect(d.closes[2026].overrides).toEqual({ 'bank:ep': 1111, 'acc:livret': 42 });
  });
});
