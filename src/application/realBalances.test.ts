import { describe, expect, it } from 'vitest';
import * as actions from './actions';
import { addTransaction, applyTemplate, deleteTransaction } from './actions';
import { addTransfer, deleteAccountMovement, setTransferTarget } from './accountMovements';
import { checkEnvelope, checkLine, createAdjustment, setAccountStatement, uncheckLine } from './checkoff';
import { closeMonth } from './monthClosing';
import { addBankAccount, setBankAccountInBudget } from './bankAccounts';
import { addEnvelope } from './envelopes';
import { addLineEntry } from './quickEntry';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { blockTotals } from '../domain/budget';
import { accountPointage, lineTooltip, monthBalance, realMonthBalance } from '../domain/checkoff';
import { closingView } from '../domain/closing';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { clearManualActuals } from '../domain/migrate';
import { derivedActual, hasStaleActuals, manualActualCount, syncLineActuals } from '../domain/lineActuals';
import { defaultTransferTarget, similarPointedItem, transferItems } from '../domain/transfers';
import type { BlockKey, BudgetData, Line } from '../domain/types';

/*
 * Spec 0019 : pointage fictif et soldes réels. Les deux chaînes : le solde réel (écritures seulement) et le solde estimé (budget).
 */

const M = '2026-10';
const LIVRET = 'acc-livret';
const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

/** Compte principal à 1 000 €, Espèces, un livret d'épargne à 500 €, un mois. */
function started(lines: Line[] = [], alloc: Record<string, number> = {}): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, LIVRET, 'Livret', 'epargne');
  d.accounts.find(a => a.id === LIVRET)!.openingBalance = 500;
  d.months[M] = { initialized: true, lines: structuredClone(lines), alloc, transfersDone: {} };
  return d;
}
const real = (d: BudgetData, id = MAIN_ACCOUNT_ID, m = M) => new Ledger(d, M).bankMonth(id, m)!.balance;
const est = (d: BudgetData, id = MAIN_ACCOUNT_ID, m = M) => monthBalance(d, m, id)!.end;
const transfer = (d: BudgetData, amount: number, over: Partial<Parameters<typeof addTransfer>[1]> = {}) =>
  addTransfer(d, { id: `t${d.accountMovements?.length ?? 0}`, month: M, day: 8, label: 'Transfert', amount, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID, ...over });

describe('solde réel (RG1, RG2)', () => {
  it('CA1: sans écriture, le solde réel est l’ouverture, quels que soient les réels de lignes et les pointages', () => {
    const d = started([ln('edf', 'fix', 62), ln('sal', 'rev', 2000), ln('ali', 'var', 300, { actual: 120 })]);
    expect(real(d)).toBe(1000);
    checkLine(d, M, 'edf', '2026-10-03');
    checkLine(d, M, 'sal', '2026-10-02');
    expect(real(d)).toBe(1000);
    expect(real(d, LIVRET)).toBe(500);
  });

  it('CA2: une dépense de 62 € le 05/10 : 938 € à partir du 05/10 et 1 000 € avant', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'EDF', amount: 62, type: 'fix', target: 'edf' });
    const today = '2026-10-20';
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 938, '2026-10-05', today);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, today)!.gap).toBe(0);
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 1000, '2026-10-04', today);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, today)!.gap).toBe(0);
  });

  it('CA3: une ligne fix pointée sans écriture : le solde réel ne change pas, le solde estimé baisse de 62 € à la date du pointage', () => {
    const d = started([ln('edf', 'fix', 62)]);
    checkLine(d, M, 'edf', '2026-10-03');
    expect(real(d)).toBe(1000);
    expect(est(d)).toBe(938);
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2026-10-30')!.estimatedMovements).toEqual([expect.objectContaining({ date: '2026-10-03', amount: -62, fictive: true })]);
  });

  it('CA5: un transfert de 40 € vers Espèces : le principal baisse et Espèces monte, dans le solde réel ET dans le solde estimé', () => {
    const d = started();
    expect(transfer(d, 40)).toBe(true);
    expect([real(d), real(d, CASH_ACCOUNT_ID), est(d), est(d, CASH_ACCOUNT_ID)]).toEqual([960, 40, 960, 40]);
  });

  it('CA9 : un transfert depuis le principal vers un compte hors budget compte ses deux faces dans les deux soldes', () => {
    const d = started();
    setBankAccountInBudget(d, CASH_ACCOUNT_ID, false);
    transfer(d, 40);
    expect([real(d), real(d, CASH_ACCOUNT_ID), est(d), est(d, CASH_ACCOUNT_ID)]).toEqual([960, 40, 960, 40]);
  });

  it('CA10 : une régularisation de +30 € augmente le solde réel de 30 € sans toucher l’estimé ; annulée, le réel revient', () => {
    const d = started();
    expect(createAdjustment(d, M, 'adj', MAIN_ACCOUNT_ID, '2026-10-10', 30, '2026-10-20')).toBe('ok');
    expect([real(d), est(d)]).toEqual([1030, 1000]);
  });

  it('CA11 : un relevé de 940 € au 30/10 contre un solde réel de 938 € donne un écart de 2 €', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'EDF', amount: 62, type: 'fix', target: 'edf' });
    setAccountStatement(d, M, MAIN_ACCOUNT_ID, 940, '2026-10-30', '2026-10-31');
    expect(accountPointage(d, M, MAIN_ACCOUNT_ID, '2026-10-31')!.gap).toBe(2);
  });

  it('CA12 : l’année clôturée reporte le solde réel (closingView lit le Ledger)', () => {
    const d = started([ln('edf', 'fix', 62)]);
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'EDF', amount: 62, type: 'fix', target: 'edf' });
    checkLine(d, M, 'edf', '2026-10-03');
    const row = closingView(d, new Ledger(d, '2026-12'), 2026).groups.flatMap(g => g.rows).find(r => r.id === `bank:${MAIN_ACCOUNT_ID}`)!;
    expect(row.calc).toBe(938);
    expect(realMonthBalance(d, M, MAIN_ACCOUNT_ID)!.end).toBe(938);
  });

  it('CA13 : une ligne var et ses dépenses : le réel, le restant et le solde estimé des dépenses sont inchangés, les dépenses sont dans le solde réel', () => {
    const d = started([ln('ali', 'var', 300)]);
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'Lidl', amount: 25, type: 'var', target: 'ali' });
    expect(d.months[M].lines[0].actual).toBe(25);
    expect([real(d), est(d)]).toEqual([975, 975]);
  });
});

describe('anti-double-compte du solde estimé (RG10, RG11)', () => {
  const withAllocation = () => {
    const d = started([], { vac: 60 });
    addEnvelope(d, 'vac', 'Vacances', M);
    return d;
  };
  const envAccount = (d: BudgetData) => d.envelopes[0].accountId;

  it('CA6 : allocation pointée de 60 € + transfert rattaché : le solde estimé baisse une seule fois ; pointer ou dépointer ne le change pas ; le réel baisse une fois', () => {
    const d = withAllocation();
    checkEnvelope(d, M, 'vac', '2026-10-02');
    expect(est(d)).toBe(940);
    expect(transfer(d, 60, { toAccountId: envAccount(d), target: { kind: 'env', id: 'vac' } })).toBe(true);
    expect([est(d), est(d, envAccount(d)), real(d), real(d, envAccount(d))]).toEqual([940, 60, 940, 60]);
    d.months[M].checks = {};
    expect([est(d), est(d, envAccount(d))]).toEqual([940, 60]);
  });

  it('CA7 : le même transfert sans cible est signalé « Semblable à un pointage » ; rattaché, la contrepartie fictive n’est plus comptée', () => {
    const d = withAllocation();
    checkEnvelope(d, M, 'vac', '2026-10-02');
    transfer(d, 60, { toAccountId: envAccount(d) });
    expect(est(d)).toBe(880); // double compte : le pointage + le transfert
    const similar = similarPointedItem(d, d.accountMovements![0]);
    expect(similar?.target).toEqual({ kind: 'env', id: 'vac' });
    expect(setTransferTarget(d, d.accountMovements![0].id, similar!.target)).toBe(true);
    expect(est(d)).toBe(940);
    expect(similarPointedItem(d, d.accountMovements![0])).toBeNull();
  });

  it('CA8 : ligne epa pointée vers son compte dédié + transfert rattaché à la ligne : le réel de la ligne est la somme des transferts, les soldes comptent une fois', () => {
    const d = started([ln('liv', 'epa', 100, { linkedAccountId: LIVRET })]);
    checkLine(d, M, 'liv', '2026-10-04');
    expect([est(d), est(d, LIVRET)]).toEqual([900, 600]);
    transfer(d, 100, { toAccountId: LIVRET, target: { kind: 'line', key: 'liv' } });
    expect(d.months[M].lines[0].actual).toBe(100);
    expect([est(d), est(d, LIVRET), real(d), real(d, LIVRET)]).toEqual([900, 600, 900, 600]);
    uncheckLine(d, M, 'liv');
    expect([est(d), est(d, LIVRET)]).toEqual([900, 600]);
  });

  it('RG10 : une ligne var vers compte dédié pointée est remplacée par son transfert rattaché', () => {
    const d = started([ln('cantine', 'var', 120, { accountId: CASH_ACCOUNT_ID })]);
    checkLine(d, M, 'cantine', '2026-10-03');
    expect(est(d)).toBe(880);
    transfer(d, 120, { target: { kind: 'line', key: 'cantine' }, toAccountId: CASH_ACCOUNT_ID });
    expect([est(d), est(d, CASH_ACCOUNT_ID)]).toEqual([880, 120]);
  });

  it('un transfert d’un mois différent ne remplace pas le pointage du mois', () => {
    const d = withAllocation();
    d.months['2026-11'] = { initialized: true, lines: [], alloc: { vac: 60 }, transfersDone: {} };
    checkEnvelope(d, M, 'vac', '2026-10-02');
    transfer(d, 60, { month: '2026-11', toAccountId: envAccount(d), target: { kind: 'env', id: 'vac' } });
    // Octobre garde son pointage fictif ; le transfert de novembre ne le remplace pas et compte en novembre.
    expect(est(d)).toBe(940);
    expect(est(d, MAIN_ACCOUNT_ID, '2026-11')).toBe(880);
  });

  it('la cible par défaut d’un transfert est l’enveloppe ou la ligne d’épargne de la destination (RG15)', () => {
    const d = withAllocation();
    d.months[M].lines = [ln('liv', 'epa', 100, { linkedAccountId: LIVRET })];
    expect(defaultTransferTarget(d, M, envAccount(d))).toEqual({ kind: 'env', id: 'vac' });
    expect(defaultTransferTarget(d, M, LIVRET)).toEqual({ kind: 'line', key: 'liv' });
    expect(defaultTransferTarget(d, M, CASH_ACCOUNT_ID)).toBeNull();
    expect(transferItems(d, M).map(i => i.label)).toEqual(['Allocation Vacances (enveloppe)', 'liv (épargne)']);
  });
});

describe('transfert : création, modification, suppression (RG14 à RG18)', () => {
  it('CA22 : source et destination différentes, montant positif, jour du mois ; refusé sur un mois clos', () => {
    const d = started();
    expect(transfer(d, 40, { toAccountId: MAIN_ACCOUNT_ID })).toBe(false);
    expect(transfer(d, 0)).toBe(false);
    expect(transfer(d, 10, { day: 32 })).toBe(false);
    expect(transfer(d, 10, { label: '  ' })).toBe(false);
    expect(transfer(d, 10, { toAccountId: 'inconnu' })).toBe(false);
    expect(transfer(d, 10, { target: { kind: 'env', id: 'nope' } })).toBe(false);
    expect(d.accountMovements).toBeUndefined();
    expect(transfer(d, 40)).toBe(true);
    expect(closeMonth(d, M)).toBe(true);
    expect(transfer(d, 5, { id: 'late' })).toBe(false);
    expect(deleteAccountMovement(d, 't0')).toBe(false);
  });

  it('RG16 : le réel d’une ligne epa est la somme des transferts rattachés ; supprimer le dernier le vide', () => {
    const d = started([ln('liv', 'epa', 100, { linkedAccountId: LIVRET })]);
    transfer(d, 60, { toAccountId: LIVRET, target: { kind: 'line', key: 'liv' }, id: 'a' });
    transfer(d, 15, { toAccountId: LIVRET, target: { kind: 'line', key: 'liv' }, id: 'b' });
    expect(d.months[M].lines[0].actual).toBe(75);
    deleteAccountMovement(d, 'a');
    expect(d.months[M].lines[0].actual).toBe(15);
    deleteAccountMovement(d, 'b');
    expect(d.months[M].lines[0].actual).toBeNull();
  });

  it('CA8a : une ligne epa/inv sans compte dédié : réel 0, infobulle « Rattachez un compte dédié », aucun transfert possible', () => {
    const d = started([ln('liv', 'epa', 100)]);
    expect(derivedActual(d, M, d.months[M].lines[0])).toBeNull();
    expect(lineTooltip(d, M, d.months[M].lines[0], '2026-10-10')).toContain('Rattachez un compte dédié pour suivre le réel');
    expect(transfer(d, 10, { toAccountId: LIVRET, target: { kind: 'line', key: 'liv' } })).toBe(false);
    checkLine(d, M, 'liv', '2026-10-04'); // son pointage fonctionne comme avant
    expect(est(d)).toBe(900);
  });

  it('RG18 : un transfert libre ne change aucun chiffre du budget', () => {
    const d = started([ln('sal', 'rev', 2000), ln('liv', 'epa', 100, { linkedAccountId: LIVRET })]);
    const before = blockTotals(d.months[M].lines, 'epa');
    transfer(d, 40);
    expect(blockTotals(d.months[M].lines, 'epa')).toEqual(before);
  });
});

describe('réel de ligne dérivé et écriture rapide (RG19 à RG24)', () => {
  it('CA18 : « Valider le mois » n’existe plus, le modèle ne copie aucun réel', () => {
    expect('validateMonth' in actions).toBe(false);
    expect('undoValidateMonth' in actions).toBe(false);
    const d = started([ln('edf', 'fix', 62)]);
    d.template = { lines: [{ key: 'edf', block: 'fix', section: '', name: 'edf', budget: 62 }], envAlloc: {} };
    applyTemplate(d, '2026-11');
    expect(d.months['2026-11'].lines[0].actual).toBeNull();
    expect(d.template.lines.every(l => !('actual' in l))).toBe(true);
  });

  it('CA16 : une ligne sans écriture a un réel nul dans les totaux ; une écriture de 62 € donne 62 €', () => {
    const d = started([ln('edf', 'fix', 100)]);
    expect(blockTotals(d.months[M].lines, 'fix').actual).toBe(0);
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'EDF', amount: 62, type: 'fix', target: 'edf' });
    expect(blockTotals(d.months[M].lines, 'fix').actual).toBe(62);
  });

  it('CA19 : une écriture rapide de 30 € sur une ligne : le réel vaut 30 €, le solde réel du compte de la ligne varie de 30 € à sa date', () => {
    const d = started([ln('ali', 'var', 300), ln('cant', 'fix', 50, { accountId: CASH_ACCOUNT_ID })]);
    expect(addLineEntry(d, M, 'ali', { id: 'q1', amount: 30, day: 12, label: '' })).toBe(true);
    expect(d.months[M].lines[0].actual).toBe(30);
    expect(real(d)).toBe(970);
    expect(addLineEntry(d, M, 'cant', { id: 'q2', amount: 30, day: 12, label: 'Cantine' })).toBe(true);
    expect(real(d, CASH_ACCOUNT_ID)).toBe(-30);
    expect(d.transactions[0].label).toBe('ali');
  });

  it('CA19 : sur une ligne d’épargne, l’écriture rapide est un transfert vers le compte dédié ; refusée sans compte dédié, sur un mois clos ou pour un montant nul', () => {
    const d = started([ln('liv', 'epa', 100, { linkedAccountId: LIVRET }), ln('sans', 'epa', 100)]);
    expect(addLineEntry(d, M, 'liv', { id: 'q', amount: 30, day: 12, label: '' })).toBe(true);
    expect([real(d), real(d, LIVRET), d.months[M].lines[0].actual]).toEqual([970, 530, 30]);
    expect(addLineEntry(d, M, 'sans', { id: 'q2', amount: 30, day: 12, label: '' })).toBe(false);
    expect(addLineEntry(d, M, 'liv', { id: 'q3', amount: 0, day: 12, label: '' })).toBe(false);
    expect(addLineEntry(d, M, 'liv', { id: 'q4', amount: 5, day: 40, label: '' })).toBe(false);
    d.months[M].closed = true;
    expect(addLineEntry(d, M, 'liv', { id: 'q5', amount: 5, day: 12, label: '' })).toBe(false);
  });

  it('CA21 : un mois clos garde l’effet de ses écritures ; une ligne sans écriture y a un réel nul', () => {
    const d = started([ln('edf', 'fix', 62), ln('gaz', 'fix', 40)]);
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'EDF', amount: 62, type: 'fix', target: 'edf' });
    d.months[M].closed = true;
    expect(blockTotals(d.months[M].lines, 'fix')).toMatchObject({ actual: 62 });
    expect(real(d)).toBe(938);
    expect(deleteTransaction(d, 'a')).toBe(false);
  });

  it('CA20 : les réels saisis à la main sont mis à vide et comptés, aucune écriture n’est créée, idempotent', () => {
    const d = started([ln('edf', 'fix', 62, { actual: 60 }), ln('gaz', 'fix', 40, { actual: 0 }), ln('sal', 'rev', 100)]);
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'x', amount: 10, type: 'rev', target: 'sal' });
    expect(manualActualCount(d)).toBe(1); // le réel à 0 ne perd rien
    expect(hasStaleActuals(d)).toBe(true);
    const out = clearManualActuals(d);
    expect(out.cleared).toBe(1);
    expect(out.data.months[M].lines.map(l => l.actual)).toEqual([null, null, 10]);
    expect(out.data.transactions).toHaveLength(1);
    expect(d.months[M].lines[0].actual).toBe(60); // la donnée d'entrée n'est pas modifiée
    const again = clearManualActuals(out.data);
    expect(again.data).toBe(out.data);
    expect(again.cleared).toBe(0);
  });

  it('syncLineActuals recalcule tous les réels depuis les écritures', () => {
    const d = started([ln('edf', 'fix', 62, { actual: 999 })]);
    syncLineActuals(d);
    expect(d.months[M].lines[0].actual).toBeNull();
  });
});

describe('Reste à sortir et Revenus attendus restent budgétaires (RG7, CA14)', () => {
  it('ne changent pas quand des écritures sont enregistrées ou des transferts créés', () => {
    const d = started([ln('edf', 'fix', 62), ln('sal', 'rev', 2000), ln('liv', 'epa', 100, { linkedAccountId: LIVRET })]);
    const p = () => { const a = accountPointage(d, M, MAIN_ACCOUNT_ID, '2026-10-10')!; return [a.remaining, a.expected]; };
    const before = p();
    addTransaction(d, { id: 'a', month: M, day: 5, label: 'EDF', amount: 80, type: 'fix', target: 'edf' });
    addTransaction(d, { id: 'b', month: M, day: 6, label: 'Paie', amount: 2100, type: 'rev', target: 'sal' });
    transfer(d, 120, { toAccountId: LIVRET, target: { kind: 'line', key: 'liv' } });
    expect(p()).toEqual(before);
  });
});
