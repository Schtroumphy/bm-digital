import { describe, expect, it } from 'vitest';
import { addManualTransaction, addManualTransfer } from './manualEntry';
import { addTransaction, createFirstMonth, updateTransaction } from './actions';
import { createAdjustment, setAccountStatement } from './checkoff';
import { addLineEntry } from './quickEntry';
import { lineBalanceWarning, prepareImport } from './statementImport';
import { lineStates as states } from './importFilters';
import { budgetStartNeedsConfirmation, isBudgetStartEditable, isPeriodEndEditable, setBudgetStart, setPeriodEnd } from './periods';
import { emptyDraft } from './setup';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { debitDateOf, debitTraceOf } from '../domain/internalTransfers';
import { beforeBudgetMovements, estimatedMovements, realMovements, attachedMovements } from '../domain/bankMovements';
import { accountPointage, monthBalance, realMonthBalance } from '../domain/checkoff';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { balanceDateWarning } from '../domain/balanceRange';
import { bankDateOf } from '../domain/lineExpenses';
import { periodOf } from '../domain/periods';
import { seedData } from '../domain/seed';
import type { StatementRow } from '../domain/statement';
import type { BlockKey, BudgetData, Line } from '../domain/types';

/*
 * Spec 0039 : périodes budgétaires à dates fixes. Budget de référence : premier mois octobre 2026, début le 29/09/2026, fin d'octobre le 29/10.
 */

const M = '2026-10';
const NOV = '2026-11';
const TODAY = '2026-12-31';
const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

function started(withDates = true): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  d.months[M] = { initialized: true, lines: [ln('edf', 'fix', 62), ln('sal', 'rev', 2000), ln('ali', 'var', 300)], alloc: {}, transfersDone: {} };
  d.months[NOV] = { initialized: true, lines: [ln('edf', 'fix', 62), ln('sal', 'rev', 2000), ln('ali', 'var', 300)], alloc: {}, transfersDone: {} };
  if (withDates) {
    d.settings.startDate = '2026-09-29';
    d.months[M].endDate = '2026-10-29';
  }
  return d;
}
const expense = (d: BudgetData, id: string, month: string, date: string, amount: number, extra: Partial<Parameters<typeof addTransaction>[1]> = {}) =>
  addTransaction(d, { id, month, day: Number(date.slice(8, 10)), bankDate: date, label: id, amount, type: 'fix', target: 'edf', ...extra });
/** Balance of the main account (the sums are normalized: a sum of nothing is 0, not -0). */
const real = (d: BudgetData, m: string) => {
  const b = new Ledger(d, M).bankMonth(MAIN_ACCOUNT_ID, m)!;
  return { start: b.start + 0, in: b.in + 0, out: b.out + 0, balance: b.balance + 0 };
};

describe('soldes sur la période (RG9, RG10)', () => {
  it('CA2 : une dépense du 30/09 est comptée dans octobre', () => {
    const d = started();
    expense(d, 'a', M, '2026-09-30', 40);
    expect(real(d, M)).toMatchObject({ start: 1000, out: 40, balance: 960 });
    expect(real(d, NOV)).toMatchObject({ start: 960, out: 0, balance: 960 });
  });

  it('CA3 : une écriture du 29/10 est dans octobre, celle du 30/10 dans novembre', () => {
    const d = started();
    expense(d, 'a', M, '2026-10-29', 10);
    expense(d, 'b', M, '2026-10-30', 20);
    expect(real(d, M).out).toBe(10);
    expect(real(d, NOV).out).toBe(20);
  });

  it('CA4 : début + entrées − sorties = fin, et le début d’un mois = la fin du précédent', () => {
    const d = started();
    expense(d, 'a', M, '2026-09-30', 40);
    addTransaction(d, { id: 'r', month: M, day: 29, bankDate: '2026-09-29', label: 'Salaire', amount: 2480, type: 'rev', target: 'sal' });
    expense(d, 'b', NOV, '2026-11-12', 15);
    const oct = real(d, M);
    const nov = real(d, NOV);
    expect(oct.balance).toBe(oct.start + oct.in - oct.out);
    expect(nov.balance).toBe(nov.start + nov.in - nov.out);
    expect(nov.start).toBe(oct.balance);
    expect(oct).toMatchObject({ in: 2480, out: 40, balance: 3440 });
    expect(realMonthBalance(d, M, MAIN_ACCOUNT_ID)).toEqual({ start: 1000, end: 3440 });
  });

  it('CA5 : un transfert est rangé selon ses deux dates, un ajustement selon sa date', () => {
    const d = started();
    d.accounts.push({ id: 'liv', name: 'Livret', hue: 10, isDefault: false, openingBalance: 0, openingMonth: M, inBudget: true, archived: false, kind: 'epargne' });
    d.accountMovements = [{ id: 'm1', month: M, day: 29, label: 'Épargne', amount: 100, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'liv', bankDate: '2026-10-29', creditTrace: { importAccountId: 'liv', fingerprint: 'f', rank: 1, bankDate: '2026-10-30' } }];
    d.adjustments = [{ id: 'adj', accountId: MAIN_ACCOUNT_ID, date: '2026-10-30', amount: -5, label: 'écart constaté', createdOn: '2026-10-30' }];
    const ledger = new Ledger(d, M);
    // Débit le 29/10 (octobre), crédit le 30/10 (novembre), ajustement du 30/10 (novembre)
    expect(ledger.bankMonth(MAIN_ACCOUNT_ID, M)!.out).toBe(100);
    expect(ledger.bankMonth('liv', M)!.in).toBe(0);
    expect(ledger.bankMonth('liv', NOV)!.in).toBe(100);
    expect(ledger.bankMonth(MAIN_ACCOUNT_ID, NOV)!.out).toBe(5);
    expect(realMovements(d, MAIN_ACCOUNT_ID, NOV).map(m => m.kind)).toEqual(['adjustment']);
  });

  it('CA6 : le solde de départ est lu au début du budget, les écritures du 29/09 sont comptées après lui', () => {
    const d = started();
    expense(d, 'a', M, '2026-09-29', 50);
    expect(periodOf(d, M).start).toBe('2026-09-29');
    expect(real(d, M)).toMatchObject({ start: 1000, out: 50, balance: 950 });
  });

  it('CA7 : un compte ouvert en novembre démarre au début de novembre (30/10)', () => {
    const d = started();
    d.accounts.push({ id: 'nov', name: 'Nouveau', hue: 10, isDefault: false, openingBalance: 200, openingMonth: NOV, inBudget: true, archived: false });
    d.transactions.push({ id: 'x', month: NOV, day: 29, bankDate: '2026-10-29', label: 'avant', amount: 1, type: 'var', target: 'ali', accountId: 'nov' }, { id: 'y', month: NOV, day: 30, bankDate: '2026-10-30', label: 'après', amount: 10, type: 'var', target: 'ali', accountId: 'nov' });
    const b = new Ledger(d, M).bankMonth('nov', NOV)!;
    expect(b).toMatchObject({ start: 200, out: 10, balance: 190 });
    expect(periodOf(d, NOV).start).toBe('2026-10-30');
  });

  it('CA8 : une écriture du 27/09 est hors période, dans aucun solde, et garde sa date', () => {
    const d = started();
    expense(d, 'a', M, '2026-09-27', 43.2);
    expect(real(d, M)).toMatchObject({ out: 0, balance: 1000 });
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
    const listed = beforeBudgetMovements(d, MAIN_ACCOUNT_ID);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ date: '2026-09-27', amount: -43.2, beforeBudget: true });
    expect(d.transactions[0].bankDate).toBe('2026-09-27');
  });

  it('une écriture rattachée à novembre mais datée dans octobre : signalée « rattachée », comptée dans octobre (RG18)', () => {
    const d = started();
    expense(d, 'a', NOV, '2026-10-12', 30);
    expect(real(d, M).out).toBe(30);
    expect(realMovements(d, MAIN_ACCOUNT_ID, M)[0].attachedMonth).toBe(NOV);
    expect(attachedMovements(d, MAIN_ACCOUNT_ID, NOV).map(m => m.date)).toEqual(['2026-10-12']);
    expect(attachedMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
  });

  it('une écriture du 30/09 rattachée à octobre est dans la période d’octobre : pas de mention « rattachée »', () => {
    const d = started();
    expense(d, 'a', M, '2026-09-30', 30);
    expect(realMovements(d, MAIN_ACCOUNT_ID, M)[0].attachedMonth).toBeUndefined();
    expect(attachedMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
  });

  it('le solde estimé suit la même période : un pointage du 30/09 est dans octobre (RG9)', () => {
    const d = started();
    d.months[M].checks = { edf: { doneOn: '2026-09-30' } };
    addTransaction(d, { id: 'v1', month: M, day: 29, bankDate: '2026-10-29', label: 'v1', amount: 7, type: 'var', target: 'ali' });
    addTransaction(d, { id: 'v2', month: M, day: 30, bankDate: '2026-10-30', label: 'v2', amount: 9, type: 'var', target: 'ali' });
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M).map(m => m.date).sort()).toEqual(['2026-09-30', '2026-10-29']);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, NOV).map(m => m.date)).toEqual(['2026-10-30']);
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)!.end).toBe(931);
    expect(monthBalance(d, NOV, MAIN_ACCOUNT_ID)!.end).toBe(922);
  });

  it('CA13 : décaler la fin d’octobre au 30/10 déplace l’écriture du 30/10 vers octobre sans la modifier', () => {
    const d = started();
    expense(d, 'b', M, '2026-10-30', 20);
    expect(real(d, M).out).toBe(0);
    expect(setPeriodEnd(d, M, '2026-10-30')).toEqual({ ok: true });
    expect(periodOf(d, NOV).start).toBe('2026-10-31');
    expect(real(d, M).out).toBe(20);
    expect(real(d, NOV).out).toBe(0);
    expect(d.transactions[0]).toMatchObject({ bankDate: '2026-10-30', month: M, amount: 20 });
  });
});


/** Soldes de seedData() calculés avec le code de la base f258715 (avant la spec 0039) : [bankMonth début, entrées, sorties, fin], [estimé début, fin], [réel début, fin]. */
const BASELINE: Record<string, unknown> = {
  '2026-10|acc-main': [[0,0,916,-916],[0,-916],[0,-916]],
  '2026-10|acc-cash': [[0,0,0,0],[0,0],[0,0]],
  '2026-10|acc-env-perso': [[260,120,70,310],[260,310],[260,310]],
  '2026-10|acc-env-sante': [[100,60,90,70],[100,70],[100,70]],
  '2026-10|acc-env-love': [[150,100,155,95],[150,95],[150,95]],
  '2026-10|acc-env-voiture': [[360,150,90,420],[360,420],[360,420]],
  '2026-10|acc-env-impots': [[540,436,196,780],[540,780],[540,780]],
  '2026-10|acc-env-projets': [[280,50,0,330],[280,330],[280,330]],
  '2026-11|acc-main': [[-916,30,866,-1752],[-916,-1752],[-916,-1752]],
  '2026-11|acc-cash': [[0,0,0,0],[0,0],[0,0]],
  '2026-11|acc-env-perso': [[310,120,160,270],[310,270],[310,270]],
  '2026-11|acc-env-sante': [[70,60,150,-20],[70,-20],[70,-20]],
  '2026-11|acc-env-love': [[95,100,75,120],[95,120],[95,120]],
  '2026-11|acc-env-voiture': [[420,150,138,432],[420,432],[420,432]],
  '2026-11|acc-env-impots': [[780,436,412,804],[780,804],[780,804]],
  '2026-11|acc-env-projets': [[330,0,55,275],[330,275],[330,275]],
  '2026-12|acc-main': [[-1752,300,1443.5,-2895.5],[-1752,-4207.5],[-1752,-2895.5]],
  '2026-12|acc-cash': [[0,0,131.5,-131.5],[0,-131.5],[0,-131.5]],
  '2026-12|acc-env-perso': [[270,120,48,342],[270,342],[270,342]],
  '2026-12|acc-env-sante': [[-20,60,0,40],[-20,40],[-20,40]],
  '2026-12|acc-env-love': [[120,100,35,185],[120,185],[120,185]],
  '2026-12|acc-env-voiture': [[432,150,62,520],[432,520],[432,520]],
  '2026-12|acc-env-impots': [[804,436,0,1240],[804,1240],[804,1240]],
  '2026-12|acc-env-projets': [[275,0,0,275],[275,275],[275,275]],
  '2027-01|acc-main': [[-2895.5,0,0,-2895.5],[-4207.5,-4207.5],[-2895.5,-2895.5]],
  '2027-01|acc-cash': [[-131.5,0,0,-131.5],[-131.5,-131.5],[-131.5,-131.5]],
  '2027-01|acc-env-perso': [[342,0,0,342],[342,342],[342,342]],
  '2027-01|acc-env-sante': [[40,0,0,40],[40,40],[40,40]],
  '2027-01|acc-env-love': [[185,0,0,185],[185,185],[185,185]],
  '2027-01|acc-env-voiture': [[520,0,0,520],[520,520],[520,520]],
  '2027-01|acc-env-impots': [[1240,0,0,1240],[1240,1240],[1240,1240]],
  '2027-01|acc-env-projets': [[275,0,0,275],[275,275],[275,275]],
  '2027-02|acc-main': [[-2895.5,0,0,-2895.5],[-4207.5,-4207.5],[-2895.5,-2895.5]],
  '2027-02|acc-cash': [[-131.5,0,0,-131.5],[-131.5,-131.5],[-131.5,-131.5]],
  '2027-02|acc-env-perso': [[342,0,0,342],[342,342],[342,342]],
  '2027-02|acc-env-sante': [[40,0,0,40],[40,40],[40,40]],
  '2027-02|acc-env-love': [[185,0,0,185],[185,185],[185,185]],
  '2027-02|acc-env-voiture': [[520,0,0,520],[520,520],[520,520]],
  '2027-02|acc-env-impots': [[1240,0,0,1240],[1240,1240],[1240,1240]],
  '2027-02|acc-env-projets': [[275,0,0,275],[275,275],[275,275]]
};

describe('CA9 : sans date, rien ne change', () => {
  const sum = (d: BudgetData) => {
    const ledger = new Ledger(d, '2026-12');
    return ledger.months.map(m => d.accounts.map(a => [m, a.id, ledger.bankMonth(a.id, m), monthBalance(d, m, a.id), realMonthBalance(d, m, a.id)]));
  };

  it('des dates explicites égales au mois civil donnent exactement les mêmes soldes que l’absence de dates', () => {
    const plain = seedData();
    const explicit = seedData();
    explicit.settings.startDate = `${explicit.firstMonth}-01`;
    for (const m of Object.keys(explicit.months)) {
      const [y, mo] = m.split('-').map(Number);
      explicit.months[m].endDate = `${m}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
    }
    expect(sum(explicit)).toEqual(sum(plain));
    expect(sum(plain).flat().length).toBeGreaterThan(0);
  });

  it('les soldes de seedData() sont ceux calculés par le code d’avant la spec 0039 (valeurs figées)', () => {
    const d = seedData();
    const ledger = new Ledger(d, '2026-12');
    const got: Record<string, unknown> = {};
    for (const m of ledger.months) for (const a of d.accounts) {
      const b = ledger.bankMonth(a.id, m);
      const e = monthBalance(d, m, a.id);
      const r = realMonthBalance(d, m, a.id);
      got[`${m}|${a.id}`] = [b && [b.start, b.in + 0, b.out + 0, b.balance], e && [e.start, e.end], r && [r.start, r.end]];
    }
    expect(got).toEqual(BASELINE);
    expect(Object.keys(BASELINE).length).toBeGreaterThan(20);
  });

  it('chaque période est le mois civil et les dates déduites sont celles d’avant', () => {
    const d = seedData();
    for (const t of d.transactions) {
      expect(bankDateOf(t, d)).toBe(bankDateOf(t));
    }
    expect(periodOf(d, '2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
  });
});

describe('faces d’un transfert sans date bancaire (RG11a)', () => {
  it('jour 30 rattaché à octobre : les deux faces sont lues au 30/09, comme dans les soldes', () => {
    const d = started();
    d.accountMovements = [{ id: 'm', month: M, day: 30, label: 'Ancien', amount: 10, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID, importAccountId: MAIN_ACCOUNT_ID, fingerprint: 'f', rank: 1 }];
    expect(debitDateOf(d.accountMovements[0], d)).toBe('2026-09-30');
    expect(debitTraceOf(d.accountMovements[0], d)!.bankDate).toBe('2026-09-30');
    expect(real(d, M).out).toBe(10);
  });
});

describe('saisie manuelle avec date réelle (RG11, CA12b)', () => {
  it('refusée sans date, enregistrée comme date bancaire avec une date', () => {
    const d = started();
    const input = { id: 'a', month: M, label: 'Courses', amount: 20, type: 'var' as const, target: 'ali' };
    expect(addManualTransaction(d, input, undefined)).toBe(false);
    expect(addManualTransaction(d, input, '2026-02-30')).toBe(false);
    expect(d.transactions).toHaveLength(0);
    expect(addManualTransaction(d, input, '2026-09-30')).toBe(true);
    expect(d.transactions[0]).toMatchObject({ month: M, day: 30, bankDate: '2026-09-30' });
  });

  it('un transfert à la main porte sa date réelle, même hors du mois civil de rattachement', () => {
    const d = started();
    d.accounts.push({ id: 'liv', name: 'Livret', hue: 10, isDefault: false, openingBalance: 0, openingMonth: M, inBudget: true, archived: false, kind: 'epargne' });
    const t = { id: 'm', month: M, label: 'Épargne', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'liv' };
    expect(addManualTransfer(d, t, undefined)).toBe(false);
    expect(addManualTransfer(d, t, '2026-09-30')).toBe(true);
    expect(d.accountMovements![0]).toMatchObject({ day: 30, bankDate: '2026-09-30' });
    expect(real(d, M).out).toBe(50);
  });

  it('l’écriture rapide d’une ligne exige une date réelle et l’écrit comme date bancaire', () => {
    const d = started();
    expect(addLineEntry(d, M, 'ali', { id: 'q', amount: 5, date: '', label: '' })).toBe(false);
    expect(addLineEntry(d, M, 'ali', { id: 'q', amount: 5, date: '2026-09-30', label: '' })).toBe(true);
    expect(d.transactions[0].bankDate).toBe('2026-09-30');
  });
});

describe('écriture existante sans date bancaire (RG11a, CA12c)', () => {
  it('jour 29 rattaché à octobre : date déduite le 29/10, modifiable pour fixer la vraie date', () => {
    const d = started();
    d.transactions.push({ id: 'old', month: M, day: 29, label: 'Ancienne', amount: 10, type: 'fix', target: 'edf', accountId: MAIN_ACCOUNT_ID });
    expect(bankDateOf(d.transactions[0], d)).toBe('2026-10-29');
    expect(real(d, M).out).toBe(10);
    expect(updateTransaction(d, 'old', { label: 'Ancienne', amount: 10, date: '2026-09-29', type: 'fix', target: 'edf' })).toBe(true);
    expect(d.transactions[0].bankDate).toBe('2026-09-29');
    expect(bankDateOf(d.transactions[0], d)).toBe('2026-09-29');
  });

  it('modifier le libellé sans changer la date ne fixe pas de date bancaire', () => {
    const d = started();
    d.transactions.push({ id: 'old', month: M, day: 29, label: 'Ancienne', amount: 10, type: 'fix', target: 'edf', accountId: MAIN_ACCOUNT_ID });
    updateTransaction(d, 'old', { label: 'Renommée', amount: 10, date: '2026-10-29', type: 'fix', target: 'edf' });
    expect(d.transactions[0].bankDate).toBeUndefined();
  });

  it('jour 30 rattaché à octobre : le 30/09, dans la période d’octobre', () => {
    const d = started();
    d.transactions.push({ id: 'old', month: M, day: 30, label: 'Ancienne', amount: 10, type: 'fix', target: 'edf', accountId: MAIN_ACCOUNT_ID });
    expect(bankDateOf(d.transactions[0], d)).toBe('2026-09-30');
    expect(real(d, M).out).toBe(10);
  });
});

describe('saisie des dates (RG4, RG8, CA11, CA12)', () => {
  it('CA11 : une fin hors bornes est refusée avec un message, rien n’est enregistré', () => {
    const d = started();
    const before = structuredClone(d);
    const early = setPeriodEnd(d, M, '2026-09-28');
    const late = setPeriodEnd(d, M, '2026-11-29');
    expect(early.ok).toBe(false);
    expect(late.ok).toBe(false);
    if (!early.ok) expect(early.reason).toMatch(/précéder le début/);
    if (!late.ok) expect(late.reason).toMatch(/au plus tard/);
    expect(d).toEqual(before);
  });

  it('une fin valide pour un mois qui n’existe pas encore crée un enregistrement non initialisé, effacer le supprime', () => {
    const d = started();
    expect(setPeriodEnd(d, '2026-12', '2026-12-28')).toEqual({ ok: true });
    expect(d.months['2026-12']).toMatchObject({ initialized: false, endDate: '2026-12-28' });
    expect(setPeriodEnd(d, '2026-12', null)).toEqual({ ok: true });
    expect(d.months['2026-12']).toBeUndefined();
  });

  it('effacer une fin d’un mois initialisé la remet par défaut sans supprimer le mois', () => {
    const d = started();
    setPeriodEnd(d, M, null);
    expect(d.months[M].endDate).toBeUndefined();
    expect(d.months[M].initialized).toBe(true);
    expect(periodOf(d, M).end).toBe('2026-10-31');
  });

  it('CA12 : la fin d’un mois clos n’est pas modifiable, ni celle du mois qui le précède', () => {
    const d = started();
    d.months[M].closed = true;
    expect(isPeriodEndEditable(d, M)).toBe(false);
    expect(setPeriodEnd(d, M, '2026-10-28').ok).toBe(false);
    expect(isPeriodEndEditable(d, NOV)).toBe(true);
    const e = started();
    e.months[NOV].closed = true;
    expect(isPeriodEndEditable(e, M)).toBe(false);
    expect(setPeriodEnd(e, M, '2026-10-28').ok).toBe(false);
    expect(e.months[M].endDate).toBe('2026-10-29');
    const y = started();
    y.closes[2026] = { closed: true, overrides: {} };
    expect(isPeriodEndEditable(y, M)).toBe(false);
  });

  it('le début du budget n’est pas modifiable quand le premier mois est clos ou verrouillé (RG8)', () => {
    const d = started();
    d.months[M].closed = true;
    expect(isBudgetStartEditable(d)).toBe(false);
    expect(setBudgetStart(d, '2026-09-28').ok).toBe(false);
    expect(d.settings.startDate).toBe('2026-09-29');
  });

  it('le début du budget est validé, et le 1er du mois efface la date', () => {
    const d = started();
    expect(setBudgetStart(d, '2026-08-31').ok).toBe(false);
    expect(setBudgetStart(d, '2026-09-27')).toEqual({ ok: true });
    expect(d.settings.startDate).toBe('2026-09-27');
    expect(setBudgetStart(d, `${M}-01`)).toEqual({ ok: true });
    expect(d.settings.startDate).toBeUndefined();
    expect(setBudgetStart(emptyData(), '2026-09-27').ok).toBe(false);
  });

  it('CA14 : un solde de départ saisi demande une confirmation ; le montant est conservé', () => {
    const d = started();
    expect(budgetStartNeedsConfirmation(d, '2026-09-27')).toBe(true);
    expect(budgetStartNeedsConfirmation(d, '2026-09-29')).toBe(false);
    setBudgetStart(d, '2026-09-27');
    expect(d.accounts[0].openingBalance).toBe(1000);
    const none = started();
    none.accounts[0].openingBalance = 0;
    expect(budgetStartNeedsConfirmation(none, '2026-09-27')).toBe(false);
  });

  it('le début du budget saisi dans l’assistant est enregistré à la création du premier mois (RG2)', () => {
    const d = emptyData();
    const draft = { ...emptyDraft(M), startDate: '2026-09-29' };
    expect(createFirstMonth(d, draft, M)).toBe(true);
    expect(d.settings.startDate).toBe('2026-09-29');
    const e = emptyData();
    createFirstMonth(e, { ...emptyDraft(M), startDate: '2026-08-01' }, M);
    expect(e.settings.startDate).toBeUndefined();
    const f = emptyData();
    createFirstMonth(f, emptyDraft(M), M);
    expect(f.settings.startDate).toBeUndefined();
  });
});

describe('relevé et régularisation dans la période (RG15, RG22, CA17, CA18)', () => {
  it('CA17 : la date d’un relevé doit être dans la période du mois', () => {
    const d = started();
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2026-10-30', TODAY)).toBe('outside');
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2026-09-28', TODAY)).toBe('outside');
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2026-09-29', TODAY)).toBe('ok');
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2026-10-29', TODAY)).toBe('ok');
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2026-10-30', 5, TODAY)).toBe('outside');
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2026-09-30', 5, TODAY)).toBe('ok');
  });

  it('CA18 : un relevé d’octobre se compare au solde réel à sa date, dans la période', () => {
    const d = started();
    expense(d, 'a', M, '2026-09-30', 40);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 960, '2026-10-29', TODAY);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, TODAY)!.gap).toBe(0);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, TODAY)!.real).toEqual({ start: 1000, end: 960 });
  });

  it('une régularisation annulée reste listée dans la période de sa date', () => {
    const d = started();
    createAdjustment(d, M, 'adj', MAIN_ACCOUNT_ID, '2026-09-30', 5, TODAY);
    d.adjustments![0].cancelledOn = TODAY;
    const listed = accountPointage(d, M, MAIN_ACCOUNT_ID, TODAY)!.realMovements;
    expect(listed.map(x => [x.adjustmentId, x.counted])).toEqual([['adj', false]]);
    expect(real(d, M).out).toBe(0);
  });
});

describe('report d’une année clôturée (RG16, CA19)', () => {
  it('le report ajusté s’applique au début de la période de janvier', () => {
    const d = started();
    d.months['2026-12'] = { initialized: true, lines: [], alloc: {}, transfersDone: {}, endDate: '2026-12-28' };
    d.months['2027-01'] = { initialized: true, lines: [ln('edf', 'fix', 62)], alloc: {}, transfersDone: {} };
    d.closes[2026] = { closed: true, overrides: { 'bank:acc-main': 5000 } };
    addTransaction(d, { id: 'j', month: '2027-01', day: 5, bankDate: '2026-12-29', label: 'Prélèvement', amount: 62, type: 'fix', target: 'edf', accountId: MAIN_ACCOUNT_ID });
    const ledger = new Ledger(d, '2027-01');
    expect(periodOf(d, '2027-01').start).toBe('2026-12-29');
    expect(ledger.bankMonth(MAIN_ACCOUNT_ID, '2027-01')).toMatchObject({ start: 5000, out: 62, balance: 4938 });
  });
});

describe('import de relevés (RG20, RG21, CA15, CA16)', () => {
  const row = (date: string, label = 'COURSES'): StatementRow => ({ date, label, notes: '', category: '', accountName: 'Compte', connectionName: 'Banque', amount: 12, direction: 'debit' });
  function importable(): BudgetData {
    const d = started();
    d.importAccountLinks = [{ id: 'l1', accountName: 'Compte', connectionName: 'Banque', accountId: MAIN_ACCOUNT_ID }];
    return d;
  }

  it('CA15 : une ligne du 30/09 est proposée pour octobre, sans état « Mois différent »', () => {
    const d = importable();
    const line = prepareImport(d, { rows: [row('2026-09-30')], errors: [] }).lines[0];
    expect(line.month).toBe(M);
    expect(states(d, line)).not.toContain('mois_different');
    expect(states(d, line)).not.toContain('date_hors_soldes');
  });

  it('un mois choisi autre que celui de la période de la date donne « Mois différent »', () => {
    const d = importable();
    const line = prepareImport(d, { rows: [row('2026-10-30')], errors: [] }).lines[0];
    expect(line.month).toBe(NOV);
    expect(states(d, line)).not.toContain('mois_different');
    expect(states(d, { ...line, month: M })).toContain('mois_different');
  });

  it('CA15 : une ligne du 27/09 a l’état « Date hors soldes » et la raison avec le début du budget, et reste importable', () => {
    const d = importable();
    const line = prepareImport(d, { rows: [row('2026-09-27')], errors: [] }).lines[0];
    expect(states(d, line)).toContain('date_hors_soldes');
    expect(lineBalanceWarning(d, line)).toBe('Date avant le début du budget (29/09/2026) : hors soldes.');
    expect(states(d, line)).not.toContain('mois_different');
  });

  it('CA16 : l’avertissement et le calcul des soldes sont d’accord juste avant et juste après le début', () => {
    const d = started();
    for (const [date, warned] of [['2026-09-28', true], ['2026-09-29', false]] as const) {
      const e = structuredClone(d);
      expense(e, 'a', M, date, 10);
      expect(balanceDateWarning(e, MAIN_ACCOUNT_ID, date) !== null).toBe(warned);
      expect(real(e, M).out).toBe(warned ? 0 : 10);
    }
  });
});
