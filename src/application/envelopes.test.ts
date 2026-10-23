import { describe, expect, it } from 'vitest';
import { addTransaction } from './actions';
import { addTransfer } from './accountMovements';
import { addBankAccount, archiveBankAccount, archiveBlocker, renameBankAccount, setBankAccountInBudget, setBankAccountKind, setLineAccount, setTransactionAccount, unarchiveBankAccount } from './bankAccounts';
import { checkEnvelope, uncheckEnvelope } from './checkoff';
import { addEnvelope, deleteEnvelope, renameEnvelope } from './envelopes';
import { activeBankAccounts, defaultBankAccounts, fixedTransactionAccountId, MAIN_ACCOUNT_ID } from '../domain/bank';
import { estimatedMovements, realMovements } from '../domain/bankMovements';
import { envelopeTooltip, isEnvelopePointable, monthBalance } from '../domain/checkoff';
import { closingView } from '../domain/closing';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { seedData } from '../domain/seed';
import type { BudgetData, Line, Transaction } from '../domain/types';

/*
 * Spec 0011: an envelope = a bank account. December 2026, so the balances at 31 December are the ones of the month.
 */

const M = '2026-12';
const PREV = '2026-11';

const line = (key: string, block: Line['block'], budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });
const ledger = (d: BudgetData, today = M) => new Ledger(d, today);
const bank = (d: BudgetData, id: string, m = M, today = M) => ledger(d, today).bankMonth(id, m)!.balance;
const total = (d: BudgetData, m = M) => d.accounts.reduce((s, a) => s + (ledger(d).bankMonth(a.id, m)?.balance ?? 0), 0);
const envTx = (over: Partial<Transaction> = {}): Transaction => ({ id: 't1', month: M, day: 3, label: 'Pharmacie', amount: 30, type: 'env', target: 'sante', ...over });

/** Main account at 1 000 €, one month, an envelope « sante » (account at 0 €). */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  d.months[M] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  addEnvelope(d, 'sante', 'Santé', M);
  return d;
}
const accountOf = (d: BudgetData, envelopeId: string) => d.envelopes.find(e => e.id === envelopeId)!.accountId;

/** Real funding of an envelope: a transfer from the main account to the envelope's account, attached to the envelope (spec 0019, RG10, RG14). */
const fund = (d: BudgetData, amount: number, id = 'fund', month = M) =>
  addTransfer(d, { id, month, day: 2, label: 'Alimentation', amount, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: accountOf(d, 'sante'), target: { kind: 'env', id: 'sante' } });

describe('l’allocation est un débit fictif ; l’alimentation réelle est un transfert (spec 0019)', () => {
  it('CA1: une allocation seule ne bouge aucun solde réel', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(1000);
    expect(bank(d, accountOf(d, 'sante'))).toBe(0);
  });

  it('CA1bis: le transfert d’alimentation fait baisser le principal et monter le compte de l’enveloppe, dans les deux soldes', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    expect(fund(d, 50)).toBe(true);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(950);
    expect(bank(d, accountOf(d, 'sante'))).toBe(50);
    expect([monthBalance(d, M, MAIN_ACCOUNT_ID)!.end, monthBalance(d, M, accountOf(d, 'sante'))!.end]).toEqual([950, 50]);
  });

  it('CA2: le total des comptes ne varie pas par une allocation ni par un transfert', () => {
    const d = started();
    const before = total(d);
    d.months[M].alloc = { sante: 50 };
    fund(d, 50);
    expect(total(d)).toBe(before);
  });

  it('CA3: une dépense d’enveloppe débite son compte, pas le principal', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    fund(d, 50);
    expect(addTransaction(d, envTx())).toBe(true);
    expect(bank(d, accountOf(d, 'sante'))).toBe(20);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(950);
  });

  it('CA4: le solde propre de l’enveloppe reste budgétaire (début + allocation − dépensé); le solde de son compte est réel et le rejoint avec le transfert', () => {
    const d = started();
    d.accounts.find(a => a.id === accountOf(d, 'sante'))!.openingBalance = 140;
    const l = ledger(d);
    expect(l.bankMonth(accountOf(d, 'sante'), M)!.balance).toBe(140);
    expect(l.envMonth('sante', M)!.balance).toBe(140);
    d.months[M].alloc = { sante: 50 };
    addTransaction(d, envTx());
    expect(ledger(d).envMonth('sante', M)).toMatchObject({ start: 140, alloc: 50, spent: 30, balance: 160 });
    expect(bank(d, accountOf(d, 'sante'))).toBe(110);
    fund(d, 50);
    expect(ledger(d).envMonth('sante', M)!.balance).toBe(bank(d, accountOf(d, 'sante')));
  });

  it('CA5: pointer l’allocation est fictif (estimé seulement), à la date du pointage; décocher annule', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    const e = accountOf(d, 'sante');
    const balances = () => [bank(d, MAIN_ACCOUNT_ID), bank(d, e), monthBalance(d, M, MAIN_ACCOUNT_ID)!.end, monthBalance(d, M, e)!.end];
    expect(balances()).toEqual([1000, 0, 1000, 0]);
    expect(isEnvelopePointable(d, M, d.envelopes[0])).toBe(true);
    expect(checkEnvelope(d, M, 'sante', '2026-12-05')).toBe(true);
    expect(balances()).toEqual([1000, 0, 950, 50]);
    expect(estimatedMovements(d, e, M).map(x => [x.date, x.amount])).toEqual([['2026-12-05', 50]]);
    expect(realMovements(d, e, M)).toEqual([]);
    expect(uncheckEnvelope(d, M, 'sante')).toBe(true);
    expect(balances()).toEqual([1000, 0, 1000, 0]);
  });

  it('CA6 (0019): allocation pointée puis transfert rattaché : le solde estimé baisse une seule fois, pointer ou dépointer ne le change pas', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    checkEnvelope(d, M, 'sante', '2026-12-05');
    fund(d, 50);
    const e = accountOf(d, 'sante');
    const estimated = () => [monthBalance(d, M, MAIN_ACCOUNT_ID)!.end, monthBalance(d, M, e)!.end];
    expect(estimated()).toEqual([950, 50]);
    uncheckEnvelope(d, M, 'sante');
    expect(estimated()).toEqual([950, 50]);
    checkEnvelope(d, M, 'sante', '2026-12-06');
    expect(estimated()).toEqual([950, 50]);
    expect([bank(d, MAIN_ACCOUNT_ID), bank(d, e)]).toEqual([950, 50]);
  });

  it('CA6bis: une allocation de 0 ne crée aucun mouvement fictif; elle suit l’allocation à la lecture', () => {
    const d = started();
    d.months[M].alloc = { sante: 0 };
    checkEnvelope(d, M, 'sante', '2026-12-05');
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
    d.months[M].alloc.sante = 80;
    checkEnvelope(d, M, 'sante', '2026-12-05');
    expect(estimatedMovements(d, accountOf(d, 'sante'), M).map(x => x.amount)).toEqual([80]);
    d.months[M].alloc.sante = 20;
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)!.end).toBe(980);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(1000);
  });

  it('sans pointage ni transfert, le solde estimé est le solde réel', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    for (const a of d.accounts) expect(monthBalance(d, M, a.id)?.end).toBe(bank(d, a.id));
  });
});

describe('clôture', () => {
  it('CA14: sur les données d’exemple, la clôture compte chaque compte une fois, sans ligne d’enveloppe en plus', () => {
    const d = seedData();
    const l = new Ledger(d, '2026-12');
    const v = closingView(d, l, 2026);
    const envGroup = v.groups.find(g => g.id === 'enveloppe')!;
    expect(envGroup.rows.map(r => r.id)).toEqual(d.envelopes.map(e => `bank:${e.accountId}`));
    expect(envGroup.rows.map(r => r.calc)).toEqual(d.envelopes.map(e => l.envMonth(e.id, '2026-12')!.balance));
    expect(v.groups.flatMap(g => g.rows).some(r => r.id.startsWith('env:'))).toBe(false);
    const ids = v.groups.flatMap(g => g.rows.map(r => r.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('avant le mois d’ouverture du compte, l’ancien calcul reste en lecture', () => {
  it('CA10 (RG16): le solde d’un mois antérieur vient de l’historique; le compte prend le relais sans saut', () => {
    const d = emptyData();
    d.firstMonth = PREV;
    d.accounts = defaultBankAccounts(PREV);
    d.months[PREV] = { initialized: true, lines: [], alloc: { a: 50 }, transfersDone: {} };
    d.months[M] = { initialized: true, lines: [], alloc: { a: 50 }, transfersDone: {} };
    d.envHistory['2026-10'] = { a: { alloc: 0, spent: 0, balance: 120 } };
    addEnvelope(d, 'a', 'Santé', M);
    const l = ledger(d);
    // November: old calculation, nothing reaches the accounts. December: the account (opening at 0) takes over.
    expect(l.envMonth('a', PREV)).toMatchObject({ start: 120, alloc: 50, balance: 170 });
    expect(l.bankMonth(MAIN_ACCOUNT_ID, PREV)!.balance).toBe(0);
    expect(l.bankMonth(accountOf(d, 'a'), PREV)).toBeNull();
    // Spec 0019: the envelope's own balance stays budgetary (0 + 50), its account is real (0 until the funding is recorded).
    expect(l.envMonth('a', M)!.balance).toBe(50);
    expect(l.bankMonth(accountOf(d, 'a'), M)!.balance).toBe(0);
  });
});

describe('création, renommage, suppression', () => {
  it('CA11: créer une enveloppe crée son compte; la renommer renomme le compte; deux enveloppes, deux comptes', () => {
    const d = started();
    addEnvelope(d, 'voiture', 'Voiture', M);
    const [a, b] = d.envelopes.map(e => d.accounts.find(x => x.id === e.accountId)!);
    expect([a.name, a.kind, a.inBudget, a.openingBalance, a.openingMonth, a.hue]).toEqual(['Santé', 'enveloppe', true, 0, M, d.envelopes[0].hue]);
    expect(a.id).not.toBe(b.id);
    expect(renameEnvelope(d, 'sante', '  Santé+  ')).toBe(true);
    expect([d.envelopes[0].name, a.name]).toEqual(['Santé+', 'Santé+']);
    expect(renameEnvelope(d, 'sante', '  ')).toBe(false);
    expect(addEnvelope(d, 'sante')).toBe(false);
  });

  it('un compte d’enveloppe ne s’ouvre jamais avant le premier mois du budget', () => {
    const d = started();
    addEnvelope(d, 'x', 'X', '2020-01');
    expect(d.accounts.find(a => a.id === accountOf(d, 'x'))!.openingMonth).toBe(M);
  });

  it('CA12: supprimer une enveloppe vide archive son compte, jamais effacé, et il n’est plus dans la clôture', () => {
    const d = started();
    const id = accountOf(d, 'sante');
    expect(deleteEnvelope(d, 'sante')).toBe('ok');
    expect(d.envelopes).toEqual([]);
    expect(d.accounts.find(a => a.id === id)).toMatchObject({ archived: true, kind: 'enveloppe' });
    expect(closingView(d, ledger(d), 2026).groups.some(g => g.id === 'enveloppe')).toBe(false);
    expect(deleteEnvelope(d, 'sante')).toBe('unknown');
  });

  it('CA12: une enveloppe qui contient de l’argent ne se supprime pas (Q7); son compte archivé à solde non nul reste dans la clôture', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    fund(d, 50);
    const id = accountOf(d, 'sante');
    const snapshot = structuredClone(d);
    expect(deleteEnvelope(d, 'sante')).toBe('not_empty');
    expect(d).toEqual(snapshot);
    // an archived account with a balance stays in the closing (spec 0010, RG12)
    d.accounts.find(a => a.id === id)!.archived = true;
    d.accounts.find(a => a.id === id)!.openingBalance = 70;
    d.months[M].alloc = {};
    d.accountMovements = [];
    expect(closingView(d, ledger(d), 2026).groups.find(g => g.id === 'enveloppe')!.rows.map(r => [r.name, r.calc])).toEqual([['Santé', 70]]);
  });
});

describe('le compte d’une enveloppe n’est qu’à elle', () => {
  it('CA15: ni son nom, ni son type, ni « dans le budget » ne se changent depuis les comptes', () => {
    const d = started();
    const id = accountOf(d, 'sante');
    expect(renameBankAccount(d, id, 'Autre')).toBe(false);
    expect(setBankAccountKind(d, id, 'courant')).toBe(false);
    setBankAccountInBudget(d, id, false);
    expect(d.accounts.find(a => a.id === id)).toMatchObject({ name: 'Santé', kind: 'enveloppe', inBudget: true });
    // and no account can become an envelope's by hand
    addBankAccount(d, 'autre');
    expect(setBankAccountKind(d, 'autre', 'enveloppe')).toBe(false);
  });

  it('CA15: il n’est proposé ni comme compte d’une ligne, ni comme « Payé avec » d’une dépense variable ou d’une sortie d’épargne', () => {
    const d = started();
    const id = accountOf(d, 'sante');
    d.months[M].lines = [line('loyer', 'fix', 600), line('cantine', 'var', 100)];
    expect(activeBankAccounts(d).map(a => a.id)).not.toContain(id);
    expect(setLineAccount(d, M, 'loyer', id)).toBe(false);
    expect(addTransaction(d, envTx({ id: 'v', type: 'var', target: 'cantine', accountId: id }))).toBe(false);
    expect(addTransaction(d, envTx({ id: 'p', type: 'epa', target: 'liv', accountId: id }))).toBe(false);
    expect(d.transactions).toEqual([]);
  });

  it('une dépense d’enveloppe reste sur le compte de l’enveloppe: son compte ne se change pas', () => {
    const d = started();
    addBankAccount(d, 'swile');
    addTransaction(d, envTx());
    expect(setTransactionAccount(d, 't1', 'swile')).toBe(false);
    expect(d.transactions[0].accountId).toBe(accountOf(d, 'sante'));
    // another transaction cannot be moved onto it either
    addTransaction(d, envTx({ id: 'v', type: 'var', target: 'cantine', accountId: 'swile' }));
    expect(setTransactionAccount(d, 'v', accountOf(d, 'sante'))).toBe(false);
  });

  it('il s’archive avec son enveloppe seulement, et ne se désarchive pas', () => {
    const d = started();
    const id = accountOf(d, 'sante');
    expect(archiveBlocker(d, id)).toBe('envelope');
    expect(archiveBankAccount(d, id)).toBe(false);
    deleteEnvelope(d, 'sante');
    expect(archiveBlocker(d, id)).toBeNull();
    unarchiveBankAccount(d, id);
    expect(d.accounts.find(a => a.id === id)!.archived).toBe(true);
  });
});

describe('supprimer une enveloppe garde l’historique du principal', () => {
  it('une enveloppe vide mais déjà allouée: les soldes passés du principal ne changent pas', () => {
    const d = started();
    d.months[PREV] = { initialized: true, lines: [], alloc: { sante: 50 }, transfersDone: {} };
    d.firstMonth = PREV;
    d.accounts[0].openingMonth = PREV;
    d.accounts.find(a => a.id === accountOf(d, 'sante'))!.openingMonth = PREV;
    d.months[M].alloc = { sante: 50 };
    fund(d, 50, 'fund-prev', PREV);
    fund(d, 50, 'fund-m', M);
    d.transactions.push(envTx({ id: 'd1', month: M, amount: 100, accountId: accountOf(d, 'sante') })); // the envelope ends at 0
    const past = (x: BudgetData) => [bank(x, MAIN_ACCOUNT_ID, PREV), bank(x, MAIN_ACCOUNT_ID, M)];
    const before = past(d);
    expect(before).toEqual([950, 900]);
    expect(deleteEnvelope(d, 'sante', M)).toBe('ok');
    expect(d.envelopes).toEqual([]);
    expect(past(d)).toEqual(before);
    // The archived account keeps its history and the allocation of the months after today stops.
    expect(bank(d, d.accounts.find(a => a.envelopeId === 'sante')!.id, PREV)).toBe(50);
    d.months['2027-01'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    expect(bank(d, MAIN_ACCOUNT_ID, '2027-01', '2027-01')).toBe(900);
  });

  it('les mois créés après la suppression n’allouent plus l’enveloppe', () => {
    const d = started();
    d.template.envAlloc = { sante: 50 };
    d.months['2027-01'] = { initialized: true, lines: [], alloc: { sante: 50 }, transfersDone: {} };
    fund(d, 50, 'fund-jan', '2027-01');
    d.transactions.push(envTx({ month: '2027-01', amount: 50, accountId: accountOf(d, 'sante') })); // empty again
    expect(deleteEnvelope(d, 'sante', M)).toBe('ok');
    expect(d.template.envAlloc).toEqual({});
    expect(d.months['2027-01'].alloc).toEqual({});
  });
});

describe('infobulle de la case de pointage de l’allocation', () => {
  it('elle existe avant et après le pointage, et dit que le débit est fictif', () => {
    const d = started();
    d.months[M].alloc = { sante: 50 };
    expect(envelopeTooltip(d, M, d.envelopes[0])).toContain('Débit fictif');
    checkEnvelope(d, M, 'sante', '2026-12-05');
    expect(envelopeTooltip(d, M, d.envelopes[0])).toContain('Allocation pointée le 05/12');
    expect(envelopeTooltip(d, M, d.envelopes[0])).toContain('Débit fictif');
  });
});

describe('« Payé avec » figé sur le compte attribué à la ligne', () => {
  const varDepense = (accountId?: string): Transaction => ({ id: 'v1', month: M, day: 3, label: 'Courses', amount: 40, type: 'var', target: 'courses', ...(accountId ? { accountId } : {}) });
  function withAssigned() {
    const d = started();
    addBankAccount(d, 'bourso', 'Boursorama');
    addBankAccount(d, 'swile', 'Swile');
    d.months[M].lines = [line('courses', 'var', 400, { accountId: 'bourso' }), line('marche', 'var', 80), line('cash', 'var', 50, { accountId: 'bourso', payMode: 'especes' })];
    return d;
  }

  it('la saisie sans compte prend le compte attribué; un autre compte est refusé', () => {
    const d = withAssigned();
    expect(fixedTransactionAccountId(d, varDepense())).toBe('bourso');
    expect(addTransaction(d, varDepense('swile'))).toBe(false);
    expect(addTransaction(d, varDepense())).toBe(true);
    expect(addTransaction(d, { ...varDepense('bourso'), id: 'v2' })).toBe(true);
    expect(d.transactions.map(t => t.accountId)).toEqual(['bourso', 'bourso']);
  });

  it('le compte d’une dépense déjà saisie ne se change pas vers un autre compte', () => {
    const d = withAssigned();
    addTransaction(d, varDepense());
    expect(setTransactionAccount(d, 'v1', 'swile')).toBe(false);
    expect(setTransactionAccount(d, 'v1', 'bourso')).toBe(true);
  });

  it('une ligne sans compte attribué, ou en mode Espèces, laisse le choix', () => {
    const d = withAssigned();
    expect(fixedTransactionAccountId(d, { ...varDepense(), target: 'marche' })).toBeUndefined();
    expect(fixedTransactionAccountId(d, { ...varDepense(), target: 'cash' })).toBeUndefined();
    expect(addTransaction(d, { ...varDepense('swile'), target: 'marche' })).toBe(true);
  });

  it('un compte attribué archivé ne fige rien (la ligne retombe sur le principal)', () => {
    const d = withAssigned();
    archiveBankAccount(d, 'bourso');
    expect(fixedTransactionAccountId(d, varDepense())).toBeUndefined();
  });
});
