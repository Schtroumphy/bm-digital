import { describe, expect, it } from 'vitest';
import { addTransaction, createFirstMonth } from './actions';
import {
  addBankAccount,
  archiveBankAccount,
  needsOpeningBalances,
  confirmOpeningBalances,
  setBankAccountInBudget,
  setBankAccountOpening,
  setMainBankAccount,
  setTransactionAccount,
  setLineAccount,
  unarchiveBankAccount,
  renameBankAccount,
} from './bankAccounts';
import { canRemoveRow, emptyDraft, exampleDraft, removeRow, setMainRow, setupSummary, type IdFactory } from './setup';
import { CASH_ACCOUNT_ID, defaultBankAccounts, MAIN_ACCOUNT_ID, mainAccount } from '../domain/bank';
import { monthSummary } from '../domain/budget';
import { round2 } from '../domain/format';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { migrateBankAccounts } from '../domain/migrate';
import { seedData } from '../domain/seed';
import type { BlockKey, BudgetData, Line } from '../domain/types';

const TODAY = '2027-01';
const M = '2027-01';

const ln = (key: string, block: BlockKey, actual: number | null, accountId?: string, budget = 0): Line => ({
  key, block, section: '', name: key, budget, actual, ...(accountId ? { accountId } : {}),
});

/** A started budget with the main account (100 € at the start) and « Espèces », one month. */
function started(lines: Line[] = []): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 100;
  d.months[M] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  return d;
}

const bal = (d: BudgetData, id: string, m = M) => new Ledger(d, TODAY).bankMonth(id, m)?.balance;

describe('migration des comptes bancaires', () => {
  const legacy = () => {
    const d = seedData();
    const transactions = d.transactions.map((t, i) => ({ ...t, accountId: undefined, source: i % 2 ? ('esp' as const) : ('vir' as const) }));
    const transfers = d.transfers.map(({ fromAccountId: _f, ...t }) => t);
    const { accounts: _a, ...rest } = d;
    return { ...rest, transactions, transfers } as never;
  };

  it('CA1: crée le principal et Espèces, rattache les transactions, ne touche ni firstMonth ni les lignes', () => {
    const before = legacy() as BudgetData;
    const d = migrateBankAccounts(structuredClone(before));
    expect(d.accounts.map(a => [a.id, a.openingBalance, a.openingMonth, a.inBudget])).toEqual([
      [MAIN_ACCOUNT_ID, 0, d.firstMonth, true],
      [CASH_ACCOUNT_ID, 0, d.firstMonth, true],
    ]);
    expect(mainAccount(d).id).toBe(MAIN_ACCOUNT_ID);
    d.transactions.forEach((t, i) => {
      expect(t.accountId).toBe(i % 2 ? CASH_ACCOUNT_ID : MAIN_ACCOUNT_ID);
      expect('source' in t).toBe(false);
    });
    expect(d.transfers.every(t => t.fromAccountId === MAIN_ACCOUNT_ID && t.to === undefined)).toBe(true);
    expect(d.version).toBe(1);
    expect(d.firstMonth).toBe(before.firstMonth);
    expect(d.months).toEqual(before.months);
    expect(d.template).toEqual(before.template);
  });

  it('CA2: la migration est idempotente', () => {
    const once = migrateBankAccounts(legacy());
    expect(migrateBankAccounts(structuredClone(once))).toEqual(once);
  });

  it('migre aussi des données non démarrées (firstMonth null)', () => {
    const { accounts: _a, ...rest } = emptyData();
    const d = migrateBankAccounts(rest as never);
    expect(d.accounts).toHaveLength(2);
    expect(d.firstMonth).toBeNull();
  });
});

describe('soldes des comptes bancaires', () => {
  it('CA5: un revenu réel de 2 950 € sur le principal (départ 100 €) donne 3 050 €', () => {
    const d = started([ln('sal', 'rev', 2950)]);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(3050);
  });

  it('CA7: une ligne fixe sans compte débite le principal une seule fois', () => {
    const d = started([ln('loyer', 'fix', 400)]);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(-300);
    expect(bal(d, CASH_ACCOUNT_ID)).toBe(0);
  });

  it('CA8: les versements réels vers une épargne ou un placement débitent le compte', () => {
    const d = started([ln('livret', 'epa', 300), ln('pea', 'inv', 50, CASH_ACCOUNT_ID)]);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(-200);
    expect(bal(d, CASH_ACCOUNT_ID)).toBe(-50);
  });

  it('CA9: une sortie d’épargne sans compte crédite le principal', () => {
    const d = started([ln('livret', 'epa', null)]);
    addTransaction(d, { id: 't', month: M, day: 3, label: 'Retrait', amount: 100, type: 'epa', target: 'livret' });
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(200);
  });

  it('RG14: une dépense variable est comptée une seule fois, par sa transaction', () => {
    const d = started([ln('ali', 'var', null)]);
    addTransaction(d, { id: 't', month: M, day: 3, label: 'Lidl', amount: 25, type: 'var', target: 'ali' });
    expect(d.months[M].lines[0].actual).toBe(25);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(75);
  });

  it('CA6: un virement entre deux comptes ne bouge les soldes qu’une fois « fait »', () => {
    const d = started();
    addBankAccount(d, 'swile');
    d.transfers.push({ id: 'v', name: 'Vers Swile', amount: 150, fromAccountId: MAIN_ACCOUNT_ID, to: { kind: 'bank', id: 'swile' } });
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(100);
    expect(bal(d, 'swile')).toBe(0);
    d.months[M].transfersDone.v = true;
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(-50);
    expect(bal(d, 'swile')).toBe(150);
  });

  it('CA6bis: un virement vers une épargne ou sans destination est informatif', () => {
    const d = started([ln('livret', 'epa', null)]);
    d.transfers.push(
      { id: 'a', name: 'Vers livret', amount: 150, fromAccountId: MAIN_ACCOUNT_ID, to: { kind: 'saving', key: 'livret' } },
      { id: 'b', name: 'Sans destination', amount: 80, fromAccountId: MAIN_ACCOUNT_ID },
    );
    d.months[M].transfersDone = { a: true, b: true };
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(100);
  });

  it('CA13: un nouveau compte part de firstMonth, les mois antérieurs ne comptent pas', () => {
    const d = seedData();
    addBankAccount(d, 'swile');
    expect(d.accounts.find(a => a.id === 'swile')!.openingMonth).toBe('2026-10');
    setBankAccountOpening(d, 'swile', { balance: 120, month: '2026-12' });
    const l = new Ledger(d, '2026-10');
    expect(l.bankMonth('swile', '2026-11')).toBeNull();
    expect(l.bankMonth('swile', '2026-12')!.start).toBe(120);
  });
});

describe('compte hors budget', () => {
  const swile = (d: BudgetData) => {
    addBankAccount(d, 'swile', 'Swile');
    setBankAccountOpening(d, 'swile', { balance: 120 });
    setBankAccountInBudget(d, 'swile', false);
  };

  it('CA3 (amendé 0008): une dépense variable sur un compte hors budget baisse son solde et compte dans le réel de la ligne, pas dans le reste à placer', () => {
    const d = seedData();
    swile(d);
    const l = new Ledger(d, '2026-10');
    const before = monthSummary(d, l, '2026-12');
    const sw = d.months['2026-12'].lines.find(x => x.key === 'v-sw')!.actual;
    addTransaction(d, { id: 'x', month: '2026-12', day: 5, label: 'Resto', amount: 60, type: 'var', target: 'v-sw', accountId: 'swile' });
    const l2 = new Ledger(d, '2026-10');
    expect(l2.bankMonth('swile', '2026-12')!.balance).toBe(60);
    expect(d.months['2026-12'].lines.find(x => x.key === 'v-sw')!.actual).toBe(round2((sw ?? 0) + 60));
    expect(monthSummary(d, l2, '2026-12').remaining).toBe(before.remaining);
  });

  it('CA4 (amendé 0008): changer le réglage recalcule enveloppes et budget, mais plus le réel des lignes variables', () => {
    const d = seedData();
    swile(d);
    addTransaction(d, { id: 'x', month: '2026-12', day: 5, label: 'Resto', amount: 60, type: 'var', target: 'v-sw', accountId: 'swile' });
    addTransaction(d, { id: 'y', month: '2026-12', day: 6, label: 'Livre', amount: 20, type: 'env', target: 'perso', accountId: 'swile' });
    const spent0 = monthSummary(d, new Ledger(d, '2026-10'), '2026-12').envelopeSpent;
    const persoBefore = new Ledger(d, '2026-10').envMonth('perso', '2026-12')!.spent;

    const swReal = d.months['2026-12'].lines.find(x => x.key === 'v-sw')!.actual;
    setBankAccountInBudget(d, 'swile', true);
    const l = new Ledger(d, '2026-10');
    expect(d.months['2026-12'].lines.find(x => x.key === 'v-sw')!.actual).toBe(swReal);
    expect(monthSummary(d, l, '2026-12').envelopeSpent).toBe(spent0 + 20);
    expect(l.envMonth('perso', '2026-12')!.spent).toBe(persoBefore + 20);

    setBankAccountInBudget(d, 'swile', false);
    expect(d.months['2026-12'].lines.find(x => x.key === 'v-sw')!.actual).toBe(swReal);
  });

  it('CA6ter: les revenus et lignes fixes d’un compte hors budget sont exclus des totaux', () => {
    const d = started([ln('sal', 'rev', 2000, undefined, 2000), ln('tr', 'rev', 150, 'swile', 150), ln('abo', 'fix', 20, 'swile', 20), ln('loyer', 'fix', 400, undefined, 400)]);
    addBankAccount(d, 'swile');
    setBankAccountInBudget(d, 'swile', false);
    const s = monthSummary(d, new Ledger(d, TODAY), M);
    expect(s.income).toBe(2000);
    expect(s.expenses).toBe(400);
    // Toujours comptés dans le solde du compte.
    expect(bal(d, 'swile')).toBe(130);
  });

  it('CA5 (0008): changer le compte d’une dépense variable ne change pas le réel de la ligne, mais déplace les soldes', () => {
    const d = started([ln('ali', 'var', null)]);
    addBankAccount(d, 'swile');
    setBankAccountInBudget(d, 'swile', false);
    addTransaction(d, { id: 't', month: M, day: 3, label: 'Lidl', amount: 25, type: 'var', target: 'ali' });
    expect(d.months[M].lines[0].actual).toBe(25);
    setTransactionAccount(d, 't', 'swile');
    expect(d.months[M].lines[0].actual).toBe(25);
    expect(bal(d, 'swile')).toBe(-25);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(100);
    setTransactionAccount(d, 't', MAIN_ACCOUNT_ID);
    expect(d.months[M].lines[0].actual).toBe(25);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(75);
  });
});

describe('gestion des comptes', () => {
  it('CA10: le principal et Espèces ne s’archivent pas, un autre compte non nul oui, et se désarchive', () => {
    const d = started([ln('x', 'rev', 50, 'swile')]);
    addBankAccount(d, 'swile');
    expect(archiveBankAccount(d, MAIN_ACCOUNT_ID)).toBe(false);
    expect(archiveBankAccount(d, CASH_ACCOUNT_ID)).toBe(false);
    expect(archiveBankAccount(d, 'swile')).toBe(true);
    expect(d.accounts.find(a => a.id === 'swile')!.archived).toBe(true);
    // L'historique reste calculé.
    expect(bal(d, 'swile')).toBe(50);
    unarchiveBankAccount(d, 'swile');
    expect(d.accounts.find(a => a.id === 'swile')!.archived).toBe(false);
  });

  it('CA11: changer de principal laisse un seul principal et les opérations sur l’ancien compte', () => {
    const d = started([ln('sal', 'rev', 1000)]);
    addBankAccount(d, 'swile');
    addTransaction(d, { id: 't', month: M, day: 3, label: 'Lidl', amount: 25, type: 'var', target: 'ali' });
    expect(setMainBankAccount(d, 'swile')).toBe(true);
    expect(d.accounts.filter(a => a.isDefault).map(a => a.id)).toEqual(['swile']);
    expect(d.months[M].lines[0].accountId).toBe(MAIN_ACCOUNT_ID);
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(1075);
    expect(bal(d, 'swile')).toBe(0);
  });

  it('un compte archivé ne peut pas devenir principal, un nom vide est refusé', () => {
    const d = started();
    addBankAccount(d, 'swile');
    archiveBankAccount(d, 'swile');
    expect(setMainBankAccount(d, 'swile')).toBe(false);
    expect(renameBankAccount(d, MAIN_ACCOUNT_ID, '  ')).toBe(false);
    expect(renameBankAccount(d, CASH_ACCOUNT_ID, 'Cash')).toBe(true);
    expect(d.accounts.find(a => a.id === CASH_ACCOUNT_ID)!.name).toBe('Cash');
  });

  it('RG6, RG16bis: un nouveau compte reçoit la prochaine teinte et est dans le budget', () => {
    const d = started();
    addBankAccount(d, 'a');
    addBankAccount(d, 'b');
    const [a, b] = d.accounts.slice(2);
    expect(a.hue).not.toBe(b.hue);
    expect(d.accounts.slice(0, 2).map(x => x.hue)).not.toContain(a.hue);
    expect(a.inBudget && b.inBudget).toBe(true);
  });

  it('RG29: le rappel des soldes de départ disparaît une fois saisis ou confirmés', () => {
    const d = migrateBankAccounts(seedData() as never);
    expect(needsOpeningBalances(d)).toBe(true);
    setBankAccountOpening(d, MAIN_ACCOUNT_ID, { balance: 500 });
    expect(needsOpeningBalances(d)).toBe(true);
    confirmOpeningBalances(d);
    expect(needsOpeningBalances(d)).toBe(false);
  });
});

describe('assistant : étape Comptes', () => {
  let n = 0;
  const mkId: IdFactory = p => `${p}${++n}`;

  it('RG20: le brouillon démarre avec le principal et Espèces, non supprimables', () => {
    const draft = emptyDraft(M);
    expect(draft.rows.acc.map(r => r.id)).toEqual([MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID]);
    expect(canRemoveRow(draft, 'acc', CASH_ACCOUNT_ID)).toBe(false);
    expect(canRemoveRow(draft, 'acc', MAIN_ACCOUNT_ID)).toBe(false);
    expect(removeRow(draft, 'acc', CASH_ACCOUNT_ID)).toBe(draft);
  });

  it('RG20: le principal est un choix unique, et l’ancien principal devient supprimable', () => {
    let draft = emptyDraft(M);
    draft = { ...draft, rows: { ...draft.rows, acc: [...draft.rows.acc, { id: 'sw', name: 'Swile', amount: 0, balance: 0, cash: 0, hue: 30, isDefault: false, inBudget: true }] } };
    draft = setMainRow(draft, 'sw');
    expect(draft.rows.acc.filter(r => r.isDefault).map(r => r.id)).toEqual(['sw']);
    expect(canRemoveRow(draft, 'acc', MAIN_ACCOUNT_ID)).toBe(true);
  });

  it('RG22: le total de départ inclut les comptes bancaires', () => {
    const s = setupSummary(exampleDraft(M, mkId));
    expect(s.bankBalance).toBe(1840);
    expect(s.totalBalance).toBe(1840 + s.savingsBalance + s.envelopesBalance + s.investBalance);
    expect(setupSummary(emptyDraft(M)).emptyLists).toHaveLength(6);
  });

  it('RG114: une ligne variable d’un compte hors budget du brouillon est exclue des dépenses; principal et Espèces « oui » comptent', () => {
    const draft = emptyDraft(M);
    draft.rows.acc.push({ id: 'swile', name: 'Swile', amount: 0, balance: 0, cash: 0, inBudget: false });
    const dep = (id: string, amount: number, accountId?: string) => ({ id, name: id, amount, balance: 0, cash: 0, kind: 'var' as const, ...(accountId ? { accountId } : {}) });
    draft.rows.dep = [dep('principal', 100), dep('cash', 50, CASH_ACCOUNT_ID), dep('swile', 80, 'swile'), { ...dep('loyer', 600), kind: 'fix' as const }];
    expect(setupSummary(draft).expenses).toBe(750);
    draft.rows.acc.find(r => r.id === CASH_ACCOUNT_ID)!.inBudget = false;
    expect(setupSummary(draft).expenses).toBe(700);
  });

  it('crée les comptes du brouillon avec leur solde de départ au mois choisi', () => {
    const d = emptyData();
    const draft = exampleDraft(M, mkId);
    draft.rows.rev[0].accountId = CASH_ACCOUNT_ID;
    expect(createFirstMonth(d, draft, TODAY)).toBe(true);
    expect(d.accounts.map(a => [a.id, a.openingBalance, a.openingMonth, a.isDefault])).toEqual([
      [MAIN_ACCOUNT_ID, 1800, M, true],
      [CASH_ACCOUNT_ID, 40, M, false],
    ]);
    expect(d.months[M].lines.find(l => l.key === draft.rows.rev[0].id)!.accountId).toBe(CASH_ACCOUNT_ID);
    expect(d.template.lines.find(l => l.key === draft.rows.rev[0].id)!.accountId).toBe(CASH_ACCOUNT_ID);
    expect(needsOpeningBalances(d)).toBe(false);
  });
});

describe('mois verrouillé', () => {
  it('le compte d’une ligne ou d’une transaction n’est pas modifiable', () => {
    const d = started([ln('sal', 'rev', 100)]);
    addBankAccount(d, 'swile');
    addTransaction(d, { id: 't', month: M, day: 3, label: 'x', amount: 5, type: 'env', target: 'e' });
    d.closes[2027] = { closed: true, overrides: {} };
    expect(setLineAccount(d, M, 'sal', 'swile')).toBe(false);
    expect(setTransactionAccount(d, 't', 'swile')).toBe(false);
    expect(d.months[M].lines[0].accountId).toBeUndefined();
    // addTransaction wrote the resolved account (main): the refused change left it there.
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    d.closes[2027].closed = false;
    expect(setLineAccount(d, M, 'sal', 'swile')).toBe(true);
  });
});
