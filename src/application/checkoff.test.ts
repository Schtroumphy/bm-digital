import { describe, expect, it } from 'vitest';
import { addTransfer } from './accountMovements';
import { addTransaction, applyTemplate, deleteLine, duplicatePrevious, saveAsTemplate, setStatement, updateLine, monthCsv } from './actions';
import { cancelAdjustment, checkEnvelope, checkLine, createAdjustment, setAccountStatement, setLineSchedule, uncheckLine, updateCheck } from './checkoff';
import { closeMonth } from './monthClosing';
import { addBankAccount, setBankAccountInBudget } from './bankAccounts';
import { addEnvelope } from './envelopes';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, isLineInBudget, defaultBankAccounts } from '../domain/bank';
import { availableReal, blockTotals, budgetLines, lineHistory, monthSummary, variableRemaining } from '../domain/budget';
import { FICTIVE_CREDIT, FICTIVE_DEBIT, IGNORED_REASON, hasNoAmount, accountPointage, balanceDateBounds, envelopeTooltip, ignoredMovements, lineTooltip, lineCounted, effectiveDueDay, isLate, isPointable, lateCount, monthBalance, pointageAccounts, realMonthBalance } from '../domain/checkoff';
import { countedAmount, estimatedMovements, flowOf, realMovements } from '../domain/bankMovements';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { clearManualActuals, migrateBankAccounts, migrateCheckAmounts } from '../domain/migrate';
import { seedData } from '../domain/seed';
import type { BlockKey, BudgetData, Line } from '../domain/types';

const M = '2027-01';
const SWILE = 'acc-swile';

const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

/** A started budget: main account (1 000 € at the start), « Espèces » and « Swile ». */
function started(lines: Line[], months: string[] = [M]): BudgetData {
  const d = emptyData();
  d.firstMonth = months[0];
  d.accounts = defaultBankAccounts(months[0]);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, SWILE, 'Swile');
  for (const m of months) d.months[m] = { initialized: true, lines: structuredClone(lines), alloc: {}, transfersDone: {} };
  return d;
}

const bank = (d: BudgetData, id: string) => new Ledger(d, M).bankMonth(id, M)!.balance;
const tx = (id: string, day: number, amount: number, target: string, accountId?: string) =>
  ({ id, month: M, day, label: id, amount, type: 'var' as const, target, ...(accountId ? { accountId } : {}) });

describe('pointer une ligne', () => {
  it('CA1: cocher enregistre la date du jour, sans montant, sans toucher au réel', () => {
    const d = started([ln('loyer', 'fix', 650)]);
    expect(checkLine(d, M, 'loyer', '2027-01-05')).toBe(true);
    expect(d.months[M].checks!.loyer).toEqual({ doneOn: '2027-01-05' });
    expect(d.months[M].lines[0].actual).toBeNull();
  });

  it('CA1: la date peut être donnée; une date invalide ou une ligne déjà pointée est refusée', () => {
    const d = started([ln('loyer', 'fix', 650)]);
    expect(checkLine(d, M, 'loyer', '2027-01-05', { doneOn: '2027-02-31' })).toBe(false);
    expect(checkLine(d, M, 'loyer', '2027-01-05', { doneOn: '2027-01-03' })).toBe(true);
    expect(d.months[M].checks!.loyer).toEqual({ doneOn: '2027-01-03' });
    expect(checkLine(d, M, 'loyer', '2027-01-06')).toBe(false);
    expect(updateCheck(d, M, 'loyer', { doneOn: 'nope' })).toBe(false);
    expect(updateCheck(d, M, 'loyer', { doneOn: '2027-01-04' })).toBe(true);
    expect(d.months[M].checks!.loyer.doneOn).toBe('2027-01-04');
  });

  it('CA2: décocher efface la date; la ligne revient dans le Reste à sortir à son budget (ou à son réel)', () => {
    const d = started([ln('loyer', 'fix', 650)]);
    checkLine(d, M, 'loyer', '2027-01-05');
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-06')!.remaining).toBe(0);
    expect(uncheckLine(d, M, 'loyer')).toBe(true);
    expect(d.months[M].checks!.loyer).toBeUndefined();
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-06')!.remaining).toBe(650);
  });

  it('CA4: une ligne variable du compte principal ne se pointe pas; reste = max(budget − réel, 0)', () => {
    const d = started([ln('ali', 'var', 400, { actual: 450 }), ln('sport', 'var', 100, { actual: 30 })]);
    expect(checkLine(d, M, 'ali')).toBe(false);
    const p = accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-06')!;
    expect(p.pending.map(x => [x.line.key, x.amount])).toEqual([['ali', 0], ['sport', 70]]);
    expect(p.remaining).toBe(70);
  });

  it('une ligne en mode informatif n’a pas de case et sort du Reste à sortir', () => {
    const d = started([ln('abo', 'fix', 10, { execMode: 'informatif' })]);
    expect(checkLine(d, M, 'abo')).toBe(false);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-06')!.remaining).toBe(0);
  });

  it('CA9: mois clôturé ou non initialisé: tout est refusé, les valeurs restent', () => {
    const d = started([ln('loyer', 'fix', 650)]);
    checkLine(d, M, 'loyer', '2027-01-05');
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 300, '2027-01-02', '2027-01-20');
    d.months[M].closed = true;
    expect(uncheckLine(d, M, 'loyer')).toBe(false);
    expect(updateCheck(d, M, 'loyer', { doneOn: '2027-01-06' })).toBe(false);
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 5, '2027-01-03', '2027-01-20')).toBe('locked');
    expect(setLineSchedule(d, M, 'loyer', { dueDay: 5 })).toBe(false);
    expect(d.months[M].checks!.loyer.doneOn).toBe('2027-01-05');
    expect(d.months[M].accountBalances![MAIN_ACCOUNT_ID].amount).toBe(300);
    expect(checkLine(d, '2027-02', 'loyer')).toBe(false);
    expect(setAccountStatement(d, '2027-02', MAIN_ACCOUNT_ID, 5, '2027-02-01', '2027-02-20')).toBe('locked');
  });
});

describe('ligne variable sur un compte dédié', () => {
  const swile = () => started([ln('cantine', 'var', 120, { accountId: SWILE })]);

  const est = (d: BudgetData, id: string) => accountPointage(d, M, id, '2027-01-30')!.estimated;

  it('CA5: pointer vire (en fictif) le montant du principal vers Swile dans le solde estimé; le solde réel ne bouge pas; une dépense Swile compte une seule fois', () => {
    const d = swile();
    expect(isPointable(d, d.months[M].lines[0])).toBe(true);
    expect(checkLine(d, M, 'cantine', '2027-01-01')).toBe(true);
    expect(est(d, MAIN_ACCOUNT_ID)).toBe(880);
    expect(est(d, SWILE)).toBe(120);
    expect([bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual([1000, 0]);
    addTransaction(d, tx('t1', 3, 20, 'cantine'));
    expect(est(d, SWILE)).toBe(100);
    expect(est(d, MAIN_ACCOUNT_ID)).toBe(880);
    // La dépense est réelle : elle baisse le solde réel de Swile, sans que le virement fictif l'ait alimenté.
    expect(bank(d, SWILE)).toBe(-20);
  });

  it('CA6: décocher rend les soldes d’avant', () => {
    const d = swile();
    const before = [est(d, MAIN_ACCOUNT_ID), est(d, SWILE), bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)];
    checkLine(d, M, 'cantine', '2027-01-01');
    uncheckLine(d, M, 'cantine');
    expect([est(d, MAIN_ACCOUNT_ID), est(d, SWILE), bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual(before);
  });

  it('RG12: non pointée, elle est au Reste à sortir du principal; pointée, elle en sort', () => {
    const d = swile();
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-02')!.remaining).toBe(120);
    expect(accountPointage(d, M, SWILE, '2027-01-02')!.remaining).toBe(0);
    checkLine(d, M, 'cantine', '2027-01-01');
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-02')!.remaining).toBe(0);
  });

  it('CA64: le principal baisse du budget viré, le compte dédié monte, la dépense compte une fois', () => {
    const d = swile();
    checkLine(d, M, 'cantine', '2027-01-20');
    addTransaction(d, tx('t1', 21, 20, 'cantine'));
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-22')!.estimated).toBe(880);
    const s = accountPointage(d, M, SWILE, '2027-01-22')!;
    expect(s.estimated).toBe(100);
    expect(s.estimatedMovements.map(x => x.amount)).toEqual([120, -20]);
    // Réel : seule la dépense (Swile −20), le pointage est fictif.
    expect(s.real!.end).toBe(-20);
    expect(s.realMovements.map(x => x.amount)).toEqual([-20]);
  });
});

describe('Solde estimé continu', () => {
  it('CA48: le début d’un mois est la fin du précédent, calculé; départ unique', () => {
    const d = started([ln('a', 'fix', 200)], ['2026-09', '2026-10']);
    d.months['2026-10'].lines[0].budget = 100;
    checkLine(d, '2026-09', 'a', '2026-09-05');
    checkLine(d, '2026-10', 'a', '2026-10-05');
    expect(monthBalance(d, '2026-09', MAIN_ACCOUNT_ID)).toEqual({ start: 1000, end: 800 });
    expect(monthBalance(d, '2026-10', MAIN_ACCOUNT_ID)).toEqual({ start: 800, end: 700 });
    expect(accountPointage(d, '2026-10', MAIN_ACCOUNT_ID, '2026-10-30')!.estimatedBalance!.start).toBe(800);
    // Le solde réel suit le même enchaînement, mais sans aucune écriture : l'ouverture.
    expect(realMonthBalance(d, '2026-10', MAIN_ACCOUNT_ID)).toEqual({ start: 1000, end: 1000 });
  });

  it('CA7: reste à sortir, solde estimé et marge', () => {
    const d = started([ln('a', 'fix', 100), ln('b', 'fix', 50)]);
    checkLine(d, M, 'a', '2027-01-20');
    const p = accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!;
    expect([p.remaining, p.estimated, p.margin]).toEqual([50, 900, 850]);
  });

  it('CA7bis: pointage puis dépense, puis décochage', () => {
    const d = started([ln('a', 'fix', 100), ln('ali', 'var', 200)]);
    checkLine(d, M, 'a', '2027-01-20');
    addTransaction(d, tx('t1', 21, 42, 'ali'));
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!.estimated).toBe(858);
    uncheckLine(d, M, 'a');
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!.estimated).toBe(958);
  });

  it('CA50: en mode pointage, la ligne pointée compte son réel (−640); une ligne non pointée ne compte pas', () => {
    const d = started([ln('a', 'fix', 650, { actual: 640 }), ln('b', 'fix', 100, { actual: 100 })]);
    checkLine(d, M, 'a', '2027-01-05');
    const p = accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!;
    expect(p.estimated).toBe(360);
    expect(p.pending.map(x => x.line.key)).toEqual(['b']);
    expect(p.remaining).toBe(100);
  });

  it('CA51: les dépenses comptent une fois dans les deux soldes, le réel d’une var est ignoré, un vieux virement « fait » est ignoré (spec 0019, RG1)', () => {
    const d = started([ln('ali', 'var', 300, { actual: 42 }), ln('a', 'fix', 10)]);
    checkLine(d, M, 'a', '2027-01-05');
    addTransaction(d, tx('t1', 3, 42, 'ali'));
    d.transfers.push({ id: 'v', name: 'vers swile', amount: 25, fromAccountId: MAIN_ACCOUNT_ID, to: { kind: 'bank', id: SWILE } });
    d.months[M].transfersDone.v = true;
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!.estimated).toBe(1000 - 10 - 42);
    expect(accountPointage(d, M, SWILE, '2027-01-25')!.estimated).toBe(0);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(1000 - 42);
    expect(bank(d, SWILE)).toBe(0);
  });

  it('CA7sexies: saisir un réel ne change pas le solde estimé d’un mois au pointage', () => {
    const d = started([ln('a', 'fix', 100)]);
    const before = accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!.estimated;
    d.months[M].lines[0].actual = 100;
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!.estimated).toBe(before);
  });

  it('CA53: avant son mois de départ le compte n’a pas de solde estimé', () => {
    const d = started([ln('a', 'fix', 100)]);
    d.accounts[0].openingMonth = '2027-02';
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)).toBeNull();
    const p = accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!;
    expect([p.estimated, p.real, p.margin]).toEqual([null, null, null]);
  });

  it('RG25: un retrait d’épargne crédite le compte', () => {
    const d = started([ln('liv', 'epa', 100)]);
    checkLine(d, M, 'liv', '2027-01-04');
    addTransaction(d, { id: 'w', month: M, day: 10, label: 'retrait', amount: 40, type: 'epa', target: 'liv' });
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-25')!.estimated).toBe(940);
  });

  it('les comptes affichés: le principal, ceux qui ont une ligne', () => {
    const d = started([ln('a', 'fix', 100, { accountId: SWILE })]);
    expect(pointageAccounts(d, M).map(a => a.id)).toEqual([MAIN_ACCOUNT_ID, SWILE]);
  });
});

describe('jour prévu et retard', () => {
  it('CA10: jour 31 dans un mois de 30 jours donne le 30', () => {
    expect(effectiveDueDay(31, '2027-04')).toBe(30);
    expect(effectiveDueDay(31, '2028-02')).toBe(29);
    expect(effectiveDueDay(10, '2027-04')).toBe(10);
  });

  it('CA11: en retard dès le lendemain du jour prévu', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 10 })]);
    const l = d.months[M].lines[0];
    expect(isLate(d, M, l, '2027-01-10')).toBe(false);
    expect(isLate(d, M, l, '2027-01-11')).toBe(true);
    expect(isLate(d, M, l, '2027-01-12')).toBe(true);
    expect(lateCount(d, M, '2027-01-12')).toBe(1);
    checkLine(d, M, 'a', '2027-01-12');
    expect(isLate(d, M, l, '2027-01-12')).toBe(false);
  });

  it('CA11: jamais de retard sans jour prévu, en mode informatif, sur un mois clôturé; toujours dans un mois passé ouvert', () => {
    const d = started([ln('a', 'fix', 100), ln('b', 'fix', 100, { dueDay: 5, execMode: 'informatif' }), ln('c', 'fix', 100, { dueDay: 25 })]);
    const [a, b, c] = d.months[M].lines;
    expect(isLate(d, M, a, '2027-01-30')).toBe(false);
    expect(isLate(d, M, b, '2027-01-30')).toBe(false);
    expect(isLate(d, M, c, '2027-01-20')).toBe(false);
    expect(isLate(d, M, c, '2027-02-01')).toBe(true); // past month, still open
    expect(isLate(d, M, c, '2026-12-01')).toBe(false); // future month
    d.months[M].closed = true;
    expect(isLate(d, M, c, '2027-02-01')).toBe(false);
  });

  it('un jour prévu hors 1 à 31 est refusé; on peut l’effacer', () => {
    const d = started([ln('a', 'fix', 100)]);
    expect(setLineSchedule(d, M, 'a', { dueDay: 32 })).toBe(false);
    expect(setLineSchedule(d, M, 'a', { dueDay: 0 })).toBe(false);
    expect(setLineSchedule(d, M, 'a', { dueDay: 10 })).toBe(true);
    expect(setLineSchedule(d, M, 'a', { dueDay: null })).toBe(true);
    expect(d.months[M].lines[0].dueDay).toBeUndefined();
  });
});

describe('modèle et récurrence', () => {
  it('RG17: jour prévu et mode vont au mois et au modèle, pas aux autres mois existants', () => {
    const d = started([ln('a', 'fix', 100)], ['2027-01', '2027-02']);
    d.template.lines = [{ key: 'a', block: 'fix', section: '', name: 'a', budget: 100 }];
    expect(setLineSchedule(d, '2027-01', 'a', { dueDay: 5, execMode: 'prelevement' })).toBe(true);
    expect(d.template.lines[0]).toMatchObject({ dueDay: 5, execMode: 'prelevement' });
    expect(d.months['2027-02'].lines[0].dueDay).toBeUndefined();
  });

  it('CA12: « Appliquer le modèle » reprend jour et mode, jamais le pointage', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 5, execMode: 'virement_auto' })]);
    checkLine(d, M, 'a', '2027-01-05');
    saveAsTemplate(d, M);
    expect(applyTemplate(d, '2027-02')).toBe(true);
    expect(d.months['2027-02'].lines[0]).toMatchObject({ dueDay: 5, execMode: 'virement_auto', actual: null });
    expect(d.months['2027-02'].checks).toBeUndefined();
  });

  it('CA12: dupliquer le mois précédent reprend jour et mode, sans pointage', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 5, execMode: 'retrait' })]);
    checkLine(d, M, 'a', '2027-01-05');
    expect(duplicatePrevious(d, '2027-02')).toBe(true);
    expect(d.months['2027-02'].lines[0]).toMatchObject({ dueDay: 5, execMode: 'retrait' });
    expect(d.months['2027-02'].checks).toBeUndefined();
  });
});

describe('chargement et indépendance', () => {
  it('CA13 et CA14 (+ 0019 CA15): des données sans pointage, ou avec l’ancien réglage pointageStart, se chargent sans erreur, deux fois de suite', () => {
    const raw = seedData();
    for (const md of Object.values(raw.months)) delete md.checks; // data saved before the feature
    (raw.settings as unknown as Record<string, unknown>).pointageStart = '2026-12'; // réglage supprimé par la spec 0019 : ignoré
    const once = clearManualActuals(migrateBankAccounts(raw));
    const twice = clearManualActuals(migrateBankAccounts(once.data));
    expect(once.data.version).toBe(1);
    expect(twice.data).toBe(once.data);
    expect(twice.cleared).toBe(0);
    for (const md of Object.values(once.data.months)) {
      expect(md.checks).toBeUndefined();
      expect(md.accountBalances).toBeUndefined();
    }
    // Le solde estimé se calcule sans erreur : toujours au pointage, un mois sans pointage ne contient aucun mouvement de ligne.
    expect(accountPointage(once.data, '2026-12', MAIN_ACCOUNT_ID, '2026-12-30')).not.toBeNull();
  });

  it('CA13: un prélèvement automatique dont le jour est passé reste non pointé', () => {
    const d = started([ln('a', 'fix', 100, { dueDay: 5, execMode: 'prelevement' })]);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-20')!.remaining).toBe(100);
    expect(d.months[M].checks).toBeUndefined();
  });

  it('CA15: pointer une ligne qui n’est pas variable ne change ni soldes, ni réel, ni reste à placer, ni disponible', () => {
    const d = started([ln('sal', 'rev', 2000, { actual: 2000 }), ln('loyer', 'fix', 650, { actual: 650 }), ln('liv', 'epa', 100, { actual: 100 })]);
    const snap = (x: BudgetData) => ({
      main: bank(x, MAIN_ACCOUNT_ID),
      actuals: x.months[M].lines.map(l => l.actual),
      summary: monthSummary(x, new Ledger(x, M), M),
      avail: availableReal(x, M),
    });
    const before = snap(d);
    checkLine(d, M, 'loyer', '2027-01-05');
    checkLine(d, M, 'liv', '2027-01-06');
    expect(snap(d)).toEqual(before);
  });

  it('un pointage suit la ligne quand son compte change', () => {
    const d = started([ln('a', 'fix', 100)]);
    checkLine(d, M, 'a', '2027-01-05');
    d.months[M].lines[0].accountId = SWILE;
    expect(d.months[M].checks!.a.doneOn).toBe('2027-01-05');
    expect(accountPointage(d, M, SWILE, '2027-01-06')!.estimatedMovements.map(x => x.amount)).toEqual([-100]);
  });

  it('clôture: un mois pointé peut se clôturer, les pointages restent', () => {
    const d = started([ln('sal', 'rev', 100, { actual: 100 }), ln('liv', 'epa', 100)]);
    checkLine(d, M, 'liv', '2027-01-05');
    expect(closeMonth(d, M)).toBe(true);
    expect(d.months[M].checks!.liv.doneOn).toBe('2027-01-05');
  });
});

describe('suppression d’une ligne pointée', () => {
  it('le pointage de la ligne supprimée est supprimé avec elle', () => {
    const d = started([ln('a', 'fix', 100), ln('b', 'fix', 50)]);
    checkLine(d, M, 'a', '2027-01-05');
    checkLine(d, M, 'b', '2027-01-05');
    expect(deleteLine(d, M, 'a')).toBe(true);
    expect(Object.keys(d.months[M].checks!)).toEqual(['b']);
  });
});

describe('revenus pointables : « reçu » (amendement 3)', () => {
  const T = '2027-01-30';
  const OTHER = SWILE;
  const base = (extra: Partial<Line> = {}) => {
    const d = started([ln('sal', 'rev', 2400, extra), ln('loyer', 'fix', 600)]);
    return d;
  };
  const p = (d: BudgetData, id = MAIN_ACCOUNT_ID, today = T) => accountPointage(d, M, id, today)!;

  it('CA39: marquer reçu (date du jour, sans montant), le réel intact; marquer non reçu efface', () => {
    const d = base();
    expect(isPointable(d, d.months[M].lines[0])).toBe(true);
    expect(checkLine(d, M, 'sal', '2027-01-28')).toBe(true);
    expect(d.months[M].checks!.sal).toEqual({ doneOn: '2027-01-28' });
    expect(d.months[M].lines[0].actual).toBeNull();
    expect(uncheckLine(d, M, 'sal')).toBe(true);
    expect(d.months[M].checks!.sal).toBeUndefined();
  });

  it('CA40 et CA41: le reçu entre sur le compte de la ligne, à défaut le principal', () => {
    const d = base();
    checkLine(d, M, 'sal', '2027-01-28');
    expect(p(d).estimated).toBe(3400);
    d.months[M].lines[0].accountId = OTHER;
    expect(p(d).estimated).toBe(1000);
    expect(p(d, OTHER).estimated).toBe(2400);
  });

  it('CA63: un revenu reçu compte son réel (somme de ses entrées) sinon son budget; un mois sans pointage ne contient aucun mouvement de ligne', () => {
    const d = started([ln('sal', 'rev', 2400, { actual: 2350 })], ['2026-12', M]);
    d.months['2026-12'].lines[0].actual = 2300;
    checkLine(d, M, 'sal', '2027-01-28');
    expect(monthBalance(d, '2026-12', MAIN_ACCOUNT_ID)!.end).toBe(1000);
    expect(monthBalance(d, M, MAIN_ACCOUNT_ID)!.end).toBe(3350);
  });

  it('CA43: non reçu, ni Solde estimé, ni Marge, ni Reste à sortir; revenus attendus à part', () => {
    const d = base();
    const a = p(d);
    expect([a.estimated, a.margin, a.remaining, a.expected]).toEqual([1000, 400, 600, 2400]);
    checkLine(d, M, 'sal', '2027-01-28');
    const b = p(d);
    expect([b.estimated, b.remaining, b.expected, b.expectedLines.length]).toEqual([3400, 600, 0, 0]);
  });

  it('CA72: reçu au réel sinon au budget; attendu au réel sinon au budget', () => {
    const d = base();
    d.months[M].lines[0].actual = 2350;
    expect(p(d).expected).toBe(2400); // « Revenus attendus » reste budgétaire (spec 0019, RG7)
    checkLine(d, M, 'sal', '2027-01-28');
    expect(p(d).estimated).toBe(3350);
    expect(p(d).expected).toBe(0);
    d.months[M].lines[0].actual = null;
    expect(p(d).estimated).toBe(3400);
  });

  it('CA45: retard d’un revenu attendu; informatif jamais en retard ni attendu; reçu jamais en retard', () => {
    const d = base({ dueDay: 28, execMode: 'virement_auto' });
    const l = d.months[M].lines[0];
    expect(isLate(d, M, l, '2027-01-28')).toBe(false);
    expect(isLate(d, M, l, '2027-01-29')).toBe(true);
    expect(lateCount(d, M, '2027-01-29')).toBe(1);
    expect(p(d, MAIN_ACCOUNT_ID, '2027-01-29').expectedLines[0].late).toBe(true);
    checkLine(d, M, 'sal', '2027-01-29');
    expect(isLate(d, M, l, '2027-01-29')).toBe(false);
    uncheckLine(d, M, 'sal');
    l.execMode = 'informatif';
    expect(isLate(d, M, l, '2027-01-29')).toBe(false);
    expect(p(d).expected).toBe(0);
    expect(checkLine(d, M, 'sal')).toBe(false);
  });

  it('CA46: reçu ne change ni soldes des Comptes, ni réel, ni reste à placer, ni disponible; clôturé: refusé et compté', () => {
    const d = started([ln('sal', 'rev', 2400, { actual: 2400 }), ln('liv', 'epa', 2400, { actual: 2400 })]);
    const snap = (x: BudgetData) => ({ main: bank(x, MAIN_ACCOUNT_ID), actuals: x.months[M].lines.map(l => l.actual), summary: monthSummary(x, new Ledger(x, M), M), avail: availableReal(x, M) });
    const before = snap(d);
    checkLine(d, M, 'sal', '2027-01-05');
    expect(snap(d)).toEqual(before);
    expect(closeMonth(d, M)).toBe(true);
    expect(uncheckLine(d, M, 'sal')).toBe(false);
    expect(checkLine(d, M, 'liv', '2027-01-06')).toBe(false);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2027-01-30')!.estimated).toBe(3400);
  });

  it('RG54: jour et mode d’un revenu vont au modèle; le reçu n’est jamais repris', () => {
    const d = base();
    d.template.lines = [{ key: 'sal', block: 'rev', section: '', name: 'sal', budget: 2400 }];
    expect(setLineSchedule(d, M, 'sal', { dueDay: 28, execMode: 'virement_auto' })).toBe(true);
    checkLine(d, M, 'sal', '2027-01-28');
    expect(applyTemplate(d, '2027-02')).toBe(true);
    expect(d.months['2027-02'].lines[0]).toMatchObject({ dueDay: 28, execMode: 'virement_auto' });
    expect(d.months['2027-02'].checks).toBeUndefined();
  });
});

describe('relevé, écart et régularisation', () => {
  const TODAY = '2027-01-25';
  /** Opening 1 000 €, a 12 € expense on 20/01 and one on 22/01: the estimate on the 21st is 988 €. */
  const base = () => {
    const d = started([ln('ali', 'var', 500)]);
    addTransaction(d, tx('t1', 20, 12, 'ali'));
    addTransaction(d, tx('t2', 22, 40, 'ali'));
    return d;
  };
  const p = (d: BudgetData) => accountPointage(d, M, MAIN_ACCOUNT_ID, TODAY)!;

  it('CA54: écart = relevé − estimé à la date du relevé, ce jour compris; après cette date ne compte pas', () => {
    const d = base();
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2027-01-21', TODAY)).toBe('ok');
    expect(p(d).gap).toBe(12);
    expect(p(d).estimated).toBe(948);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2027-01-22', TODAY);
    expect(p(d).gap).toBe(52);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 988, '2027-01-20', TODAY);
    expect(p(d).gap).toBe(0);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 988, '2027-01-19', TODAY);
    expect(p(d).gap).toBe(-12);
  });

  it('un seul relevé par compte et par mois; il ne change jamais le Solde estimé', () => {
    const d = base();
    const est = p(d).estimated;
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 500, '2027-01-21', TODAY);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 700, '2027-01-23', TODAY);
    expect(d.months[M].accountBalances).toEqual({ [MAIN_ACCOUNT_ID]: { amount: 700, on: '2027-01-23' } });
    expect(p(d).estimated).toBe(est);
    expect(p(d).gap).not.toBeNull();
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, null, '', TODAY);
    expect(p(d).gap).toBeNull();
  });

  it('CA55 / CA10 (0019): régulariser met l’écart à 0, monte le solde RÉEL du mois et le début du mois suivant, sans toucher le solde estimé', () => {
    const d = base();
    d.months['2027-02'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2027-01-21', TODAY);
    const end = p(d).real!.end;
    const est = p(d).estimated!;
    expect(createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-21', 12, TODAY)).toBe('ok');
    expect(d.adjustments![0]).toMatchObject({ date: '2027-01-21', amount: 12, label: 'écart constaté', createdOn: TODAY });
    expect(p(d).gap).toBe(0);
    expect(p(d).real!.end).toBe(end + 12);
    expect(p(d).estimated).toBe(est);
    const next = accountPointage(d, '2027-02', MAIN_ACCOUNT_ID, '2027-02-10')!;
    expect(next.real!.start).toBe(end + 12);
    expect(next.estimatedBalance!.start).toBe(est);
  });

  it('CA56: annuler garde la ligne, plus d’effet, l’écart revient; ni suppression, ni réactivation', () => {
    const d = base();
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2027-01-21', TODAY);
    createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-21', 12, TODAY);
    expect(cancelAdjustment(d, 'adj1', '2027-01-26')).toBe(true);
    expect(d.adjustments).toHaveLength(1);
    expect(d.adjustments![0].cancelledOn).toBe('2027-01-26');
    expect(p(d).gap).toBe(12);
    const struck = p(d).realMovements.find(x => x.adjustmentId === 'adj1')!;
    expect(p(d).estimatedMovements.some(x => x.adjustmentId === 'adj1')).toBe(false);
    expect(struck).toMatchObject({ counted: false, cancelledOn: '2027-01-26' });
    expect(cancelAdjustment(d, 'adj1', '2027-01-27')).toBe(false);
    expect(d.adjustments![0].cancelledOn).toBe('2027-01-26');
  });

  it('CA57: mois ou année clôturé: relevé, régularisation et annulation refusés, Solde estimé figé', () => {
    const d = base();
    createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-21', 12, TODAY);
    const est = p(d).estimated;
    d.months[M].closed = true;
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1, '2027-01-21', TODAY)).toBe('locked');
    expect(createAdjustment(d, M, 'adj2', MAIN_ACCOUNT_ID, '2027-01-21', 5, TODAY)).toBe('locked');
    expect(cancelAdjustment(d, 'adj1', TODAY)).toBe(false);
    expect(p(d).estimated).toBe(est);
    delete d.months[M].closed;
    d.closes[2027] = { closed: true, overrides: {} };
    expect(createAdjustment(d, M, 'adj3', MAIN_ACCOUNT_ID, '2027-01-21', 5, TODAY)).toBe('locked');
    expect(cancelAdjustment(d, 'adj1', TODAY)).toBe(false);
  });

  it('CA58: date hors du mois ou future refusée, montant 0 refusé, rien d’enregistré', () => {
    const d = base();
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 5, '2026-12-31', TODAY)).toBe('outside');
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 5, '2027-01-26', TODAY)).toBe('future');
    expect(setAccountStatement(d, M, MAIN_ACCOUNT_ID, 5, '', TODAY)).toBe('invalid');
    expect(d.months[M].accountBalances).toBeUndefined();
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2027-02-01', 5, TODAY)).toBe('outside');
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2027-01-30', 5, TODAY)).toBe('future');
    expect(createAdjustment(d, M, 'x', MAIN_ACCOUNT_ID, '2027-01-21', 0, TODAY)).toBe('zero');
    expect(d.adjustments).toBeUndefined();
    expect(balanceDateBounds(M, TODAY)).toEqual({ min: '2027-01-01', max: TODAY });
    expect(balanceDateBounds('2026-12', TODAY)).toEqual({ min: '2026-12-01', max: '2026-12-31' });
    expect(balanceDateBounds('2027-03', TODAY).min > balanceDateBounds('2027-03', TODAY).max).toBe(true);
  });

  it('un identifiant de régularisation déjà utilisé est refusé', () => {
    const d = base();
    expect(createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-21', 12, TODAY)).toBe('ok');
    expect(createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-22', 30, TODAY)).toBe('none');
    expect(d.adjustments).toHaveLength(1);
  });

  it('CA59: pas de régularisation sur un compte d’épargne; le rapprochement de l’épargne est inchangé', () => {
    const d = started([ln('liv', 'epa', 100)]);
    expect(createAdjustment(d, M, 'x', 'liv', '2027-01-21', 5, TODAY)).toBe('none');
    expect(d.adjustments).toBeUndefined();
    expect(setStatement(d, M, 'liv', 250)).toBe(true);
    expect(d.statements[M]).toEqual({ liv: 250 });
    expect(new Ledger(d, M).accMonth('liv', M)!.balance).toBe(250);
  });

  it('CA60: une régularisation active change le solde de l’écran Comptes, pas le budget; annulée, plus d’effet', () => {
    const d = started([ln('sal', 'rev', 100, { actual: 100 }), ln('liv', 'epa', 100, { actual: 100 })]);
    const snap = (x: BudgetData) => ({ summary: monthSummary(x, new Ledger(x, M), M), avail: availableReal(x, M), actuals: x.months[M].lines.map(l => l.actual) });
    const before = { ...snap(d), main: bank(d, MAIN_ACCOUNT_ID), cash: bank(d, 'acc-cash') };
    createAdjustment(d, M, 'adj1', MAIN_ACCOUNT_ID, '2027-01-10', -30, TODAY);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(before.main - 30);
    expect(bank(d, 'acc-cash')).toBe(before.cash);
    expect(snap(d)).toEqual({ summary: before.summary, avail: before.avail, actuals: before.actuals });
    cancelAdjustment(d, 'adj1', TODAY);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(before.main);
  });
});

describe('le réel prend le pas sur le budget (amendement 5)', () => {
  const T = '2027-01-25';
  const one = (actual: number | null, extra: Partial<Line> = {}) => started([ln('loyer', 'fix', 650, { actual, ...extra })]);
  const p = (d: BudgetData) => accountPointage(d, M, MAIN_ACCOUNT_ID, T)!;

  it('CA67: le pointage ne contient qu’une date; le montant compté est le réel, sinon le budget', () => {
    const d = one(640);
    checkLine(d, M, 'loyer', '2027-01-05');
    expect(d.months[M].checks!.loyer).toEqual({ doneOn: '2027-01-05' });
    expect(countedAmount(d.months[M].lines[0])).toEqual({ amount: 640, source: 'actual' });
    expect(countedAmount(one(null).months[M].lines[0])).toEqual({ amount: 650, source: 'budget' });
    const rev = started([ln('sal', 'rev', 2400, { actual: 2350 })]);
    expect(countedAmount(rev.months[M].lines[0])).toEqual({ amount: 2350, source: 'actual' });
  });

  it('CA68: ligne pointée au réel: −640; réel vidé: −650; réel changé: −645 à l’instant, pointage intact', () => {
    const d = one(640);
    checkLine(d, M, 'loyer', '2027-01-05');
    expect(p(d).estimated).toBe(1000 - 640);
    const check = structuredClone(d.months[M].checks);
    d.months[M].lines[0].actual = null;
    expect(p(d).estimated).toBe(1000 - 650);
    d.months[M].lines[0].actual = 645;
    expect(p(d).estimated).toBe(1000 - 645);
    expect(d.months[M].checks).toEqual(check);
  });

  it('CA69: un réel à 0 saisi compte 0; un réel vide compte le budget', () => {
    const d = one(0);
    checkLine(d, M, 'loyer', '2027-01-05');
    expect(p(d).estimated).toBe(1000);
    d.months[M].lines[0].actual = null;
    expect(p(d).estimated).toBe(350);
  });

  it('CA70 / CA14 (0019): Reste à sortir d’une ligne non pointée: toujours son budget, quel que soit son réel (RG7)', () => {
    expect(p(one(640)).pending[0]).toMatchObject({ amount: 650, source: 'budget' });
    expect(p(one(null)).pending[0]).toMatchObject({ amount: 650, source: 'budget' });
    expect(p(one(0)).pending[0]).toMatchObject({ amount: 650, source: 'budget' });
  });

  it('CA71: Marge = Solde estimé (montant compté des lignes pointées) − Reste à sortir (budgets)', () => {
    const d = started([ln('a', 'fix', 650, { actual: 640 }), ln('b', 'fix', 100, { actual: 90 })]);
    checkLine(d, M, 'a', '2027-01-05');
    const r = p(d);
    expect([r.estimated, r.remaining, r.margin]).toEqual([360, 100, 260]);
  });

  it('CA73: var vers compte dédié: le budget est viré, le réel ne le remplace pas; non pointée: budget au Reste à sortir du principal', () => {
    const d = started([ln('cantine', 'var', 120, { accountId: SWILE })]);
    expect(p(d).remaining).toBe(120);
    checkLine(d, M, 'cantine', '2027-01-01');
    addTransaction(d, tx('t1', 3, 45, 'cantine'));
    expect(d.months[M].lines[0].actual).toBe(45);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, T)!.estimated).toBe(880);
    expect(accountPointage(d, M, SWILE, T)!.estimated).toBe(75);
    expect(lineCounted(d, d.months[M].lines[0])).toEqual({ amount: 120, source: 'budget' });
    // Le virement du budget est fictif : le solde réel du principal ne bouge pas, celui de Swile ne porte que la dépense.
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(1000);
    expect(bank(d, SWILE)).toBe(-45);
  });

  it('CA74: var du principal inchangée: max(budget − réel, 0)', () => {
    const d = started([ln('ali', 'var', 400, { actual: 450 })]);
    expect(p(d).pending[0].amount).toBe(0);
  });

  it('CA75 / CA15 (0019): un mois sans pointage ne contient aucun mouvement de ligne; un pointage le fait apparaître (toujours au pointage)', () => {
    const d = started([ln('a', 'fix', 100, { actual: 90 })], ['2026-12', M]);
    checkLine(d, M, 'a', '2027-01-05');
    const ledger = new Ledger(d, M);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, '2026-12')).toEqual([]);
    expect(monthBalance(d, '2026-12', MAIN_ACCOUNT_ID)!.end).toBe(ledger.bankMonth(MAIN_ACCOUNT_ID, '2026-12')!.balance);
    checkLine(d, '2026-12', 'a', '2026-12-05');
    expect(monthBalance(d, '2026-12', MAIN_ACCOUNT_ID)!.end).toBe(910);
    // Le solde réel, lui, n'a bougé nulle part.
    expect(ledger.bankMonth(MAIN_ACCOUNT_ID, '2026-12')!.balance).toBe(1000);
  });

  it('CA76 (0019, RG1): la ligne pointée est un mouvement fictif du solde estimé, au montant compté et à la date du pointage; le solde réel n’en contient aucun', () => {
    const d = one(640);
    checkLine(d, M, 'loyer', '2027-01-20');
    const mine = p(d).estimatedMovements.find(x => x.lineKey === 'loyer')!;
    expect(mine).toMatchObject({ amount: -640, date: '2027-01-20', fictive: true });
    expect(realMovements(d, MAIN_ACCOUNT_ID, M).some(x => x.lineKey === 'loyer')).toBe(false);
  });

  it('CA76bis: les anciens pointages avec `amount` perdent le champ, gardent la date; idempotent; le réel prime', () => {
    const d = one(640);
    (d.months[M] as { checks: Record<string, unknown> }).checks = { loyer: { doneOn: '2027-01-05', amount: 700 } };
    const once = migrateCheckAmounts(d);
    expect(once.months[M].checks).toEqual({ loyer: { doneOn: '2027-01-05' } });
    expect(d.months[M].checks!.loyer).toHaveProperty('amount'); // not mutated (a copy is returned)
    expect(once.version).toBe(1);
    expect(migrateCheckAmounts(once)).toBe(once);
    expect(accountPointage(once, M, MAIN_ACCOUNT_ID, T)!.estimated).toBe(360);
  });

  it('CA77: mois clôturé: ni réel ni pointage modifiables, Solde estimé inchangé', () => {
    const d = started([ln('sal', 'rev', 100, { actual: 100 }), ln('liv', 'epa', 100, { actual: 100 })]);
    checkLine(d, M, 'liv', '2027-01-05');
    expect(closeMonth(d, M)).toBe(true);
    const est = p(d).estimated;
    expect(updateLine(d, M, 'liv', { budget: 5 })).toBe(false);
    expect(uncheckLine(d, M, 'liv')).toBe(false);
    expect(p(d).estimated).toBe(est);
  });

  it('CA78: cocher ne crée ni ne modifie le réel; une écriture ne coche rien', () => {
    const d = one(null);
    checkLine(d, M, 'loyer', '2027-01-05');
    expect(d.months[M].lines[0].actual).toBeNull();
    const e = one(null);
    addTransaction(e, { id: 'x', month: M, day: 3, label: 'EDF', amount: 600, type: 'fix', target: 'loyer' });
    expect(e.months[M].lines[0].actual).toBe(600);
    expect(e.months[M].checks).toBeUndefined();
  });
});

describe('migration: montants retirés, destinations gardées', () => {
  it('un check hérité avec amount et un pointage d’allocation avec accountId dans le même mois: la destination survit', () => {
    const d = started([ln('loyer', 'fix', 650)]);
    (d.months[M] as { checks: Record<string, unknown> }).checks = {
      loyer: { doneOn: '2027-01-05', amount: 650 },
      'env:sante': { doneOn: '2027-01-06', accountId: CASH_ACCOUNT_ID },
    };
    const once = migrateCheckAmounts(d);
    expect(once.months[M].checks).toEqual({ loyer: { doneOn: '2027-01-05' }, 'env:sante': { doneOn: '2027-01-06', accountId: CASH_ACCOUNT_ID } });
    expect(migrateCheckAmounts(once)).toBe(once);
  });
});

describe('comptes hors budget (amendement 6, spec 0019 RG12)', () => {
  const T = '2027-01-25';
  const est = (d: BudgetData, id: string) => accountPointage(d, M, id, T)!.estimated;
  const transfer = (id: string, amount: number, fromAccountId: string, toAccountId: string) => ({ id, month: M, day: 1, label: id, amount, fromAccountId, toAccountId });

  it('CA85: ligne var pointée vers un compte hors budget: le principal n’est pas touché, le compte reçoit son budget (fictif, estimé seulement)', () => {
    const d = started([ln('cantine', 'var', 120, { accountId: SWILE })]);
    setBankAccountInBudget(d, SWILE, false);
    checkLine(d, M, 'cantine', '2027-01-01');
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(1000);
    expect(bank(d, SWILE)).toBe(0);
    expect(est(d, MAIN_ACCOUNT_ID)).toBe(1000);
    expect(est(d, SWILE)).toBe(120);
  });

  it('CA9 (0019): un transfert est réel, il débite et crédite ses deux comptes dans les deux soldes, hors budget ou non', () => {
    const d = started([ln('a', 'fix', 1)]);
    d.accountMovements = [transfer('v1', 50, MAIN_ACCOUNT_ID, SWILE)];
    for (const inBudget of [true, false]) {
      setBankAccountInBudget(d, SWILE, inBudget);
      expect([bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual([950, 50]);
      expect([est(d, MAIN_ACCOUNT_ID), est(d, SWILE)]).toEqual([950, 50]);
    }
    // et dans l'autre sens : un transfert depuis un compte hors budget débite ce compte et crédite le principal
    d.accountMovements = [transfer('v2', 20, SWILE, MAIN_ACCOUNT_ID)];
    expect([bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual([1020, -20]);
    expect([est(d, MAIN_ACCOUNT_ID), est(d, SWILE)]).toEqual([1020, -20]);
  });

  it('RG1: un ancien virement « fait » est ignoré par les deux soldes', () => {
    const d = started([ln('a', 'fix', 1)]);
    d.transfers.push({ id: 'v1', name: 'v1', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, to: { kind: 'bank', id: SWILE } });
    d.months[M].transfersDone.v1 = true;
    expect([bank(d, MAIN_ACCOUNT_ID), bank(d, SWILE)]).toEqual([1000, 0]);
    expect([est(d, MAIN_ACCOUNT_ID), est(d, SWILE)]).toEqual([1000, 0]);
  });
});

describe('mouvements ignorés en gris (amendement 7, limités aux contreparties fictives)', () => {
  const T = '2027-01-25';
  /** Opening 1 000 €. A variable line checked on the 8th, and a real transfer of 50 €, both sent to `target`. */
  function sendTo(target: 'cash' | 'swile', inBudget: boolean) {
    const id = target === 'cash' ? CASH_ACCOUNT_ID : SWILE;
    const d = started([ln('cantine', 'var', 120, target === 'cash' ? { payMode: 'especes' } : { accountId: SWILE })]);
    d.accountMovements = [{ id: 'v1', month: M, day: 1, label: 'Virement', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: id }];
    setBankAccountInBudget(d, id, inBudget);
    checkLine(d, M, 'cantine', '2027-01-08');
    return { d, id };
  }
  const main = (d: BudgetData) => accountPointage(d, M, MAIN_ACCOUNT_ID, T)!;

  it('CA96: vers Espèces « oui »: le virement fictif et le transfert réel comptent dans l’estimé (principal −170, Espèces +170), aucune ligne grise; le réel ne porte que le transfert', () => {
    const { d } = sendTo('cash', true);
    expect(main(d).ignored).toEqual([]);
    expect(main(d).estimated).toBe(1000 - 120 - 50);
    expect(accountPointage(d, M, CASH_ACCOUNT_ID, T)!.estimated).toBe(170);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(950);
    expect(bank(d, CASH_ACCOUNT_ID)).toBe(50);
  });

  it('CA97: vers Swile « non »: la contrepartie fictive n’atteint pas le principal (liste grise), le transfert réel compte ses deux faces', () => {
    const { d } = sendTo('swile', false);
    expect(main(d).estimated).toBe(950);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(950);
    expect(accountPointage(d, M, SWILE, T)!.estimated).toBe(170);
    expect(bank(d, SWILE)).toBe(50);
    expect(main(d).ignored).toEqual([{ date: '2027-01-08', label: 'cantine → Swile (pointé)', amount: -120, reason: IGNORED_REASON }]);
  });

  it('CA98 et CA103: la liste grise n’entre dans aucune somme; le solde estimé est celui de la chaîne', () => {
    const { d } = sendTo('swile', false);
    d.accounts.find(a => a.id === CASH_ACCOUNT_ID)!.inBudget = true;
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2027-01-20', T);
    createAdjustment(d, M, 'adj', MAIN_ACCOUNT_ID, '2027-01-20', 5, T);
    const p = main(d);
    expect(p.ignored).toHaveLength(1);
    // everything the card sums comes from the counted movements and the chain, never from the grey list
    expect(p.estimated).toBe(monthBalance(d, M, MAIN_ACCOUNT_ID)!.end);
    const counted = flowOf(p.realMovements.filter(x => x.counted));
    expect([p.inflow, p.outflow]).toEqual([counted.in, counted.out]);
    expect(p.estimatedMovements.some(x => x.label === 'cantine → Swile (pointé)')).toBe(false);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M).some(x => x.label === 'cantine → Swile (pointé)')).toBe(false);
    // Relevé 1 000 € au 20/01 contre le solde réel (1 000 − 50 + 5 de régularisation) : l'écart est -5 (le transfert est du 01/01).
    expect(p.gap).toBe(1000 - (1000 - 50 + 5));
    expect(p.real!.end).toBe(bank(d, MAIN_ACCOUNT_ID));
  });

  it('CA99: Espèces « non » → « oui » → « non »: la contrepartie fictive est grise, puis comptée, puis grise; le transfert réel compte toujours', () => {
    const { d } = sendTo('cash', false);
    expect(main(d).ignored).toHaveLength(1);
    expect(main(d).estimated).toBe(950);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(950);
    setBankAccountInBudget(d, CASH_ACCOUNT_ID, true);
    expect(main(d).ignored).toEqual([]);
    expect(main(d).estimated).toBe(830);
    expect(bank(d, MAIN_ACCOUNT_ID)).toBe(950);
    setBankAccountInBudget(d, CASH_ACCOUNT_ID, false);
    expect(main(d).ignored).toHaveLength(1);
    expect(main(d).estimated).toBe(950);
  });

  it('CA100: la liste existe sur un mois clôturé, une année clôturée; pas de ligne grise sur le compte hors budget', () => {
    const { d } = sendTo('swile', false);
    expect(main(d).ignored).toHaveLength(1);
    d.months[M].closed = true;
    expect(main(d).ignored).toHaveLength(1);
    delete d.months[M].closed;
    d.closes[2027] = { closed: true, overrides: {} };
    expect(main(d).ignored).toHaveLength(1);
    expect(accountPointage(d, M, SWILE, T)!.ignored).toEqual([]);
    expect(ignoredMovements(d, CASH_ACCOUNT_ID, M)).toEqual([]);
  });

  it('cohérence: estimatedMovements et ignoredMovements partitionnent exactement les contreparties fictives du principal; les transferts comptent toujours', () => {
    for (const inBudget of [true, false]) {
      const d = started([ln('cantine', 'var', 120, { accountId: SWILE }), ln('vide', 'var', 0, { accountId: SWILE })]);
      d.accountMovements = [
        { id: 'sortant', month: M, day: 1, label: 'Sortant', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SWILE },
        { id: 'entrant', month: M, day: 1, label: 'Entrant', amount: 30, fromAccountId: SWILE, toAccountId: MAIN_ACCOUNT_ID },
      ];
      setBankAccountInBudget(d, SWILE, inBudget);
      checkLine(d, M, 'cantine', '2027-01-08');
      checkLine(d, M, 'vide', '2027-01-08');

      const counted = new Set(estimatedMovements(d, MAIN_ACCOUNT_ID, M).map(x => x.label));
      const ignored = new Set(ignoredMovements(d, MAIN_ACCOUNT_ID, M).map(x => x.label));
      const fictive = 'cantine → Swile (pointé)';
      expect(counted.has(fictive) !== ignored.has(fictive)).toBe(true); // exactly one of the two
      expect((inBudget ? counted : ignored).has(fictive)).toBe(true);
      // the transfers are real: counted whatever the budget status, never grey
      for (const label of ['Sortant → Swile (transfert)', 'Entrant depuis Swile (transfert)']) {
        expect([label, counted.has(label), ignored.has(label)]).toEqual([label, true, false]);
      }
      // a 0 € counterpart is in neither list (RG108)
      expect(['vide', counted.has('vide → Swile (pointé)'), ignored.has('vide → Swile (pointé)')]).toEqual(['vide', false, false]);
    }
  });

  it('CA101: sans mouvement vers un compte hors budget, aucune ligne grise et rien n’est écrit', () => {
    const d = seedData();
    const before = structuredClone(d);
    for (const m of Object.keys(d.months)) for (const a of d.accounts) expect(ignoredMovements(d, a.id, m)).toEqual([]);
    expect(d).toEqual(before);
    expect(d.version).toBe(1);
  });
});

describe('lignes var hors budget informatives (amendement 8)', () => {
  const T = '2027-01-25';
  const swile = (extra: Partial<Line> = {}) => ln('swile', 'var', 100, { accountId: SWILE, actual: 1.58, ...extra });
  const other = () => [ln('sal', 'rev', 2000, { actual: 2000 }), ln('ali', 'var', 400, { actual: 100 })];
  /** A month with the Swile line (Swile out of the budget) and the same month without it. */
  const pair = () => {
    const withLine = started([...other(), swile()]);
    setBankAccountInBudget(withLine, SWILE, false);
    return { withLine, without: started(other()) };
  };
  const figures = (d: BudgetData) => ({
    summary: monthSummary(d, new Ledger(d, M), M),
    avail: availableReal(d, M),
    totals: blockTotals(budgetLines(d, M), 'var'),
    rest: variableRemaining(d, M),
  });
  const main = (d: BudgetData) => accountPointage(d, M, MAIN_ACCOUNT_ID, T)!;

  it('CA104: poids nul au Reste à sortir et à la Marge du principal, cochée ou non', () => {
    const { withLine, without } = pair();
    expect(main(withLine).pending.map(x => x.line.key)).toEqual(['ali']);
    expect(main(withLine).remaining).toBe(main(without).remaining);
    expect(main(withLine).margin).toBe(main(without).margin);
    expect(isPointable(withLine, withLine.months[M].lines[2])).toBe(true);
    checkLine(withLine, M, 'swile', '2027-01-08');
    expect(main(withLine).pending.map(x => x.line.key)).toEqual(['ali']);
    expect(main(withLine).remaining).toBe(main(without).remaining);
  });

  it('une ligne var hors budget n’est jamais en retard et ne compte pas dans l’en-tête', () => {
    const d = started([swile({ dueDay: 5 }), ln('f', 'fix', 10, { dueDay: 5 })]);
    expect(lateCount(d, M, '2027-01-20')).toBe(2);
    setBankAccountInBudget(d, SWILE, false);
    expect(isLate(d, M, d.months[M].lines[0], '2027-01-20')).toBe(false);
    expect(lateCount(d, M, '2027-01-20')).toBe(1);
    expect(main(d).pending.every(x => !x.line.key.startsWith('swile'))).toBe(true);
  });

  it('CA105: aucun total du budget ne la compte (comme si la ligne n’existait pas)', () => {
    const { withLine, without } = pair();
    expect(isLineInBudget(withLine, withLine.months[M].lines[2])).toBe(false);
    expect(figures(withLine)).toEqual(figures(without));
  });

  it('CA106: vers Espèces « oui » la ligne compte et pèse 100 €; cochée elle sort du Reste à sortir mais reste dans les totaux; Espèces « non »: elle sort de tout', () => {
    const d = started([...other(), ln('cash', 'var', 100, { payMode: 'especes' })]);
    expect(main(d).pending.map(x => [x.line.key, x.amount])).toContainEqual(['cash', 100]);
    expect(blockTotals(budgetLines(d, M), 'var').budget).toBe(500);
    checkLine(d, M, 'cash', '2027-01-08');
    expect(main(d).pending.map(x => x.line.key)).not.toContain('cash');
    expect(blockTotals(budgetLines(d, M), 'var').budget).toBe(500);
    setBankAccountInBudget(d, CASH_ACCOUNT_ID, false);
    expect(blockTotals(budgetLines(d, M), 'var').budget).toBe(400);
    uncheckLine(d, M, 'cash');
    expect(main(d).pending.map(x => x.line.key)).not.toContain('cash');
  });

  it('CA107: une ligne var du principal reste inchangée', () => {
    const d = started([ln('ali', 'var', 400, { actual: 450 })]);
    expect(main(d).pending[0].amount).toBe(0);
    expect(blockTotals(budgetLines(d, M), 'var')).toMatchObject({ budget: 400, actual: 450 });
  });

  it('CA108: cochée, la case reste active, la ligne grise s’affiche et le Solde estimé du principal est inchangé', () => {
    const { withLine } = pair();
    const before = main(withLine).estimated;
    expect(checkLine(withLine, M, 'swile', '2027-01-08')).toBe(true);
    expect(main(withLine).ignored.map(x => x.label)).toEqual(['swile → Swile (pointé)']);
    expect(main(withLine).estimated).toBe(before);
  });

  it('CA109 (RG108): un transfert à 0 € n’apparaît nulle part; non nul, il compte ses deux faces dans les deux soldes, budget ou non (RG12)', () => {
    for (const inBudget of [true, false]) {
      const d = started([ln('a', 'fix', 1)]);
      setBankAccountInBudget(d, SWILE, inBudget);
      d.accountMovements = [
        { id: 'z', month: M, day: 1, label: 'Zéro', amount: 0, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SWILE },
        { id: 'n', month: M, day: 1, label: 'Non nul', amount: 10, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SWILE },
      ];
      for (const labels of [realMovements(d, MAIN_ACCOUNT_ID, M), estimatedMovements(d, MAIN_ACCOUNT_ID, M)].map(l => l.map(x => x.label))) {
        expect(labels.filter(l => l.startsWith('Zéro'))).toEqual([]);
        expect(labels).toContain('Non nul → Swile (transfert)');
      }
      expect(ignoredMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
    }
  });

  it('CA110: dépense payée avec Swile: réel affiché, solde de Swile baisse, principal et totaux inchangés; un autre compte est refusé (« Payé avec » figé)', () => {
    const { withLine, without } = pair();
    withLine.months[M].lines[2].actual = null;
    addTransaction(withLine, tx('t1', 3, 1.58, 'swile', SWILE));
    expect(withLine.months[M].lines[2].actual).toBe(1.58);
    expect(bank(withLine, SWILE)).toBe(-1.58);
    expect(bank(withLine, MAIN_ACCOUNT_ID)).toBe(bank(without, MAIN_ACCOUNT_ID));
    expect(figures(withLine)).toEqual(figures(without));
    expect(addTransaction(withLine, tx('t2', 4, 5, 'swile', MAIN_ACCOUNT_ID))).toBe(false);
    expect(bank(withLine, MAIN_ACCOUNT_ID)).toBe(bank(without, MAIN_ACCOUNT_ID));
    expect(figures(withLine)).toEqual(figures(without));
  });

  it('CA111: « Restant des variables » inchangé pour une ligne hors budget, mis à jour pour une ligne dans le budget', () => {
    const { withLine } = pair();
    addTransaction(withLine, tx('t0', 2, 100, 'ali'));
    const before = variableRemaining(withLine, M);
    addTransaction(withLine, tx('t1', 3, 30, 'swile', SWILE));
    expect(variableRemaining(withLine, M)).toBe(before);
    addTransaction(withLine, tx('t2', 4, 30, 'ali'));
    expect(variableRemaining(withLine, M)).toBe(before - 30);
  });

  it('CA112: mêmes résultats sur un mois clôturé, au réel et au pointage', () => {
    const { withLine, without } = pair();
    const check = () => [main(withLine).remaining === main(without).remaining, isLineInBudget(withLine, withLine.months[M].lines[2]), main(withLine).pending.length];
    expect(check()).toEqual([true, false, 1]);
    withLine.months[M].closed = true;
    expect(check()).toEqual([true, false, 1]);
    // a month not created yet (model preview) follows the same rule
    withLine.template.lines = withLine.months[M].lines.map(({ actual: _a, ...l }) => l);
    expect(budgetLines(withLine, '2027-02').map(l => l.key)).toEqual(['sal', 'ali']);
  });

  it('CA113: Espèces « oui », Swile « non », lignes vers chacun, transfert à 0 €: l’estimé suit les pointages (RG92), le réel ne bouge pas', () => {
    const d = started([ln('c', 'var', 50, { payMode: 'especes' }), swile()]);
    setBankAccountInBudget(d, SWILE, false);
    d.accountMovements = [{ id: 'z', month: M, day: 1, label: 'Zéro', amount: 0, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SWILE }];
    checkLine(d, M, 'c', '2027-01-05');
    checkLine(d, M, 'swile', '2027-01-06');
    const ledger = new Ledger(d, M);
    expect([MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID, SWILE].map(id => monthBalance(d, M, id)!.end)).toEqual([950, 50, 100]);
    expect([MAIN_ACCOUNT_ID, CASH_ACCOUNT_ID, SWILE].map(id => ledger.bankMonth(id, M)!.balance)).toEqual([1000, 0, 0]);
    expect(main(d).ignored).toHaveLength(1);
  });

  it('CA114: sans compte hors budget, toutes les lignes comptent et rien n’est écrit', () => {
    const d = seedData();
    const before = structuredClone(d);
    for (const m of Object.keys(d.months)) expect(budgetLines(d, m)).toHaveLength(d.months[m].lines.length);
    expect(d).toEqual(before);
    expect(d.version).toBe(1);
  });

  it('CA116: la dépense reste listée, le réel et le cumul de la ligne sont calculés, le compte la compte', () => {
    const { withLine } = pair();
    withLine.months[M].lines[2].actual = null;
    addTransaction(withLine, tx('t1', 3, 1.58, 'swile', SWILE));
    expect(withLine.transactions.map(t => t.id)).toEqual(['t1']);
    expect(withLine.months[M].lines[2].actual).toBe(1.58);
    expect(lineHistory(withLine, M, 'swile').cumul).toBe(1.58);
    const s = accountPointage(withLine, M, SWILE, T)!;
    expect(s.estimatedMovements.map(x => x.amount)).toEqual([-1.58]);
  });

  it('CA117 et CA118: export CSV avec la colonne « Hors budget »; bascule rétroactive; même prédicat que les totaux', () => {
    const d = started([
      ln('v1', 'var', 100, { accountId: SWILE, actual: 1.58 }),
      ln('v2', 'var', 50, { payMode: 'especes' }),
      ln('f1', 'fix', 30, { accountId: SWILE }),
      ln('f2', 'fix', 20),
      ln('e1', 'epa', 10),
      ln('i1', 'inv', 5),
    ]);
    setBankAccountInBudget(d, SWILE, false);
    const csv = () => monthCsv(d.months[M].lines, { rev: 'Revenus', cre: 'Crédits', fix: 'Fixes', var: 'Variables', epa: 'Épargnes', inv: 'Placements' }, l => !isLineInBudget(d, l)).split('\r\n');
    const rows = csv();
    expect(rows[0]).toBe('\uFEFFBloc;Section;Nom;Budget;Réel;Hors budget');
    expect(rows.slice(1).map(r => r.split(';')[5])).toEqual(['oui', 'non', 'oui', 'non', 'non', 'non']);
    expect(rows[1]).toBe('Variables;;v1;100;1,58;oui');
    expect(rows).toHaveLength(7);
    setBankAccountInBudget(d, SWILE, true);
    expect(csv().slice(1).map(r => r.split(';')[5])).toEqual(['non', 'non', 'non', 'non', 'non', 'non']);
    setBankAccountInBudget(d, SWILE, false);
    d.months[M].closed = true;
    expect(csv().slice(1).map(r => r.split(';')[5])).toEqual(['oui', 'non', 'oui', 'non', 'non', 'non']);
    const out = d.months[M].lines.filter(l => !isLineInBudget(d, l)).map(l => l.key);
    expect(budgetLines(d, M).map(l => l.key).filter(k => out.includes(k))).toEqual([]);
  });
});

describe('infobulles des lignes et des tuiles', () => {
  const T = '2027-01-20';
  /** `money` writes non-breaking spaces. */
  const plain = (t: string) => t.replace(/[\u00a0\u202f]/g, ' ');
  it('ligne pointée: date, montant compté et provenance, jour prévu, mode complet, retard', () => {
    const d = started([ln('loyer', 'fix', 650, { actual: 640, dueDay: 5, execMode: 'prelevement' })]);
    checkLine(d, M, 'loyer', '2027-01-05');
    expect(plain(lineTooltip(d, M, d.months[M].lines[0], T)).split('\n')).toEqual([
      plain(FICTIVE_DEBIT),
      'Pointé le 05/01',
      'Montant compté : 640 € (réel)',
      'Le réel (640 €) prime sur le budget (650 €).',
      'Prévu le 5 du mois',
      'Mode d’exécution : Prélèvement automatique',
    ]);
  });

  it('revenu reçu: « Reçu le », sans réel « Pas de réel : le budget est compté. »', () => {
    const d = started([ln('sal', 'rev', 2400, { execMode: 'virement_auto' })]);
    checkLine(d, M, 'sal', '2027-01-28');
    const t = lineTooltip(d, M, d.months[M].lines[0], T).split('\n');
    expect(t[0]).toBe(FICTIVE_CREDIT);
    expect(t).toContain('Reçu le 28/01');
    expect(t).toContain('Pas de réel : le budget est compté.');
    expect(t).toContain('Mode d’exécution : Virement automatique');
  });

  it('ligne non pointée: jour prévu et mode seuls, « En retard » après le jour; libellés complets des cinq modes', () => {
    const labels = ['Prélèvement automatique', 'Virement automatique', 'Virement manuel', 'Retrait d’espèces', 'Informatif'];
    const modes = ['prelevement', 'virement_auto', 'virement_manuel', 'retrait', 'informatif'] as const;
    modes.forEach((mode, i) => {
      const d = started([ln('a', 'fix', 10, { dueDay: 10, execMode: mode })]);
      const t = lineTooltip(d, M, d.months[M].lines[0], T).split('\n');
      expect(t.filter(x => !x.startsWith('Débit fictif')).slice(0, 2)).toEqual(['Prévu le 10 du mois', `Mode d’exécution : ${labels[i]}`]);
      expect(t.includes('En retard')).toBe(mode !== 'informatif');
    });
    const none = started([ln('a', 'fix', 10)]);
    expect(lineTooltip(none, M, none.months[M].lines[0], T)).toBe(FICTIVE_DEBIT);
  });

  it('ligne hors budget: l’avis hors budget puis les informations de pointage, jamais « En retard »', () => {
    const d = started([ln('s', 'var', 100, { accountId: SWILE, dueDay: 5, execMode: 'virement_manuel' })]);
    setBankAccountInBudget(d, SWILE, false);
    checkLine(d, M, 's', '2027-01-05');
    const t = lineTooltip(d, M, d.months[M].lines[0], T).split('\n');
    expect(t[0]).toBe('Ligne hors budget : elle ne compte dans aucun total ni dans le reste à placer.');
    expect(t).toContain('Pointé le 05/01');
    expect(t).toContain('Prévu le 5 du mois');
    expect(t).toContain('Mode d’exécution : Virement manuel');
    expect(t).not.toContain('En retard');
  });

  it('tuile d’enveloppe: destination, puis date une fois pointée, avec la mention du débit fictif', () => {
    const d = started([]);
    addEnvelope(d, 'sante', 'Santé', M);
    d.months[M].alloc = { sante: 120 };
    const fictive = 'Débit fictif : estimation de budget, n’affecte pas les soldes réels. Enregistrez un transfert pour le réel.';
    expect(plain(envelopeTooltip(d, M, d.envelopes[0])).split('\n')).toEqual(['Pointer l’allocation (120 €) vers Santé', fictive]);
    checkEnvelope(d, M, 'sante', '2027-01-05');
    expect(plain(envelopeTooltip(d, M, d.envelopes[0])).split('\n')).toEqual(['Allocation pointée le 05/01 vers Santé', 'Montant : 120 €', fictive]);
  });
});

describe('lignes sans montant', () => {
  it('un budget ou un réel à 0 n’a pas de case ni de retard', () => {
    expect(hasNoAmount({ key: 'a', block: 'fix', section: '', name: 'a', budget: 0, actual: null })).toBe(true);
    expect(hasNoAmount({ key: 'a', block: 'fix', section: '', name: 'a', budget: 50, actual: 0 })).toBe(true);
    expect(hasNoAmount({ key: 'a', block: 'fix', section: '', name: 'a', budget: 50, actual: null })).toBe(false);
  });
});

describe('compte dédié d’une ligne d’épargne et pointage (spec 0007 + 0009)', () => {
  const T = '2027-01-25';
  const linked = (extra: Partial<Line> = {}) => ln('livret', 'epa', 200, { linkedAccountId: SWILE, ...extra });
  const mv = (d: BudgetData, id: string, source: 'actual' | 'checks') => (source === 'actual' ? realMovements(d, id, M) : estimatedMovements(d, id, M)).map(x => [x.date, x.amount]);
  const end = (d: BudgetData, id: string) => monthBalance(d, M, id)!.end;
  const epaTx = (amount: number, day = 5) => ({ id: `w${day}`, month: M, day, label: 'retrait', amount, type: 'epa' as const, target: 'livret' });

  it('(a) pointée avec réel: le dédié reçoit le réel à la date de pointage, le principal est débité du même montant', () => {
    const d = started([linked({ actual: 150 })]);
    checkLine(d, M, 'livret', '2027-01-10');
    expect(mv(d, SWILE, 'checks')).toEqual([['2027-01-10', 150]]);
    expect(mv(d, MAIN_ACCOUNT_ID, 'checks')).toEqual([['2027-01-10', -150]]);
    expect([end(d, MAIN_ACCOUNT_ID), end(d, SWILE)]).toEqual([850, 150]);
  });

  it('(b) pointée sans réel: le budget est crédité sur le dédié et débité sur le principal', () => {
    const d = started([linked()]);
    checkLine(d, M, 'livret', '2027-01-10');
    expect([end(d, MAIN_ACCOUNT_ID), end(d, SWILE)]).toEqual([800, 200]);
  });

  it('(c) non pointée en mode pointage: rien ne bouge, même avec un réel', () => {
    const d = started([linked({ actual: 150 })]);
    expect(mv(d, SWILE, 'checks')).toEqual([]);
    expect([end(d, MAIN_ACCOUNT_ID), end(d, SWILE)]).toEqual([1000, 0]);
  });

  it('(d) dédié hors budget: crédité, le principal n’est débité que par la ligne elle-même, aucune ligne grise', () => {
    const d = started([linked({ actual: 150 })]);
    setBankAccountInBudget(d, SWILE, false);
    checkLine(d, M, 'livret', '2027-01-10');
    expect([end(d, MAIN_ACCOUNT_ID), end(d, SWILE)]).toEqual([850, 150]);
    expect(ignoredMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
  });

  it('(e) transaction epa sur la ligne liée en mode pointage: sort du dédié à son jour, entre sur le compte choisi', () => {
    const d = started([linked({ actual: 150 })]);
    checkLine(d, M, 'livret', '2027-01-10');
    addTransaction(d, epaTx(40));
    expect(mv(d, SWILE, 'checks')).toEqual([['2027-01-10', 150], ['2027-01-05', -40]]);
    expect([end(d, MAIN_ACCOUNT_ID), end(d, SWILE)]).toEqual([890, 110]);
  });

  it('(f) transferts rattachés à la ligne: le réel de la ligne est leur somme, le dédié reçoit à la date du transfert, retraits à leur jour; solde réel = solde estimé', () => {
    const d = started([linked()]);
    expect(addTransfer(d, { id: 'v', month: M, day: 3, label: 'Versement', amount: 150, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SWILE, target: { kind: 'line', key: 'livret' } })).toBe(true);
    addTransaction(d, epaTx(40));
    expect(d.months[M].lines[0].actual).toBe(150);
    expect(mv(d, SWILE, 'actual')).toEqual([['2027-01-05', -40], ['2027-01-03', 150]]);
    const ledger = new Ledger(d, M);
    for (const id of [MAIN_ACCOUNT_ID, SWILE, CASH_ACCOUNT_ID]) expect(end(d, id)).toBe(ledger.bankMonth(id, M)!.balance);
    expect(end(d, SWILE)).toBe(110);
  });

  it('pas de double comptage: une ligne liée à la fois avec réel et pointée compte une fois en mode pointage', () => {
    const d = started([linked({ actual: 150 })]);
    checkLine(d, M, 'livret', '2027-01-10');
    expect(accountPointage(d, M, SWILE, T)!.estimatedMovements.filter(x => x.counted)).toHaveLength(1);
    expect(end(d, MAIN_ACCOUNT_ID)).toBe(850);
  });

  it('flowOf ventile par signe: un réel négatif apparaît dans l’autre colonne, le net est identique', () => {
    const m = (amount: number) => ({ date: '2027-01-01', label: 'x', amount, kind: 'line' as const });
    expect(flowOf([m(100), m(-30)])).toEqual({ in: 100, out: 30 });
    const f = flowOf([m(100), m(-30)]);
    expect(f.in - f.out).toBe(70); // the net balance is the sum of the signed amounts
  });
});

