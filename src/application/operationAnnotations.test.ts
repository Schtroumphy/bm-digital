import { describe, expect, it } from 'vitest';
import { ANNOTATION_MAX, annotatedOperations, attachedOperations, type OperationRef } from '../domain/annotation';
import { MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { monthSummary } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { lineSpentNet } from '../domain/lineActuals';
import type { AccountMovement, BudgetData, Line, Transaction } from '../domain/types';
import { addTransaction, deleteTransaction, duplicatePrevious, saveAsTemplate, updateTransaction } from './actions';
import { addTransfer, deleteAccountMovement, updateAccountMovement } from './accountMovements';
import { alreadyAnnotated, annotateOperations, setOperationAnnotation } from './operationAnnotations';

/* Spec 0047 : annotation portée par l'opération (transaction ou mouvement de compte). */

const M = '2026-11';
const LDDS = 'acc-ldds';
const ln = (key: string, block: Line['block'], budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });
const tx = (id: string, extra: Partial<Transaction> = {}): Transaction => ({ id, month: M, day: 12, label: id, amount: 10, type: 'var', target: 'cou', ...extra });
const mv = (id: string, extra: Partial<AccountMovement> = {}): AccountMovement => ({ id, month: M, day: 14, label: id, amount: 950, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: LDDS, ...extra });
const T = (id: string): OperationRef => ({ kind: 'tx', id });
const V = (id: string): OperationRef => ({ kind: 'mv', id });
const noteOf = (d: BudgetData, ref: OperationRef) => (ref.kind === 'tx' ? d.transactions.find(t => t.id === ref.id) : d.accountMovements!.find(m => m.id === ref.id))?.annotation;

/** « LDDS Travaux » (épargne liée au compte LDDS), « Courses » (variable), 4 opérations rattachées à LDDS Travaux. */
function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [
    ...defaultBankAccounts(M),
    { id: LDDS, name: 'LDDS Travaux', hue: 40, isDefault: false, openingBalance: 100, openingMonth: M, inBudget: true, archived: false, kind: 'epargne', openingConfirmed: true },
  ];
  d.months[M] = { initialized: true, alloc: {}, transfersDone: {}, lines: [ln('ldds', 'epa', 500, { linkedAccountId: LDDS }), ln('cou', 'var', 300), ln('sal', 'rev', 2000)] };
  d.transactions.push(tx('t1', { target: 'ldds', type: 'epa', amount: 1000, label: 'Vir sortant' }), tx('t2', { target: 'cou', assignedAccountId: LDDS, amount: 300, label: 'Artisan' }));
  d.accountMovements = [mv('m1', { targets: [{ kind: 'line', key: 'ldds' }] }), mv('m2', { targets: [{ kind: 'line', key: 'ldds' }] })];
  return d;
}

describe('texte de l’annotation (RG2, CA3, CA4, CA5)', () => {
  it('CA3 : 500 caractères acceptés, 501 refusés sans troncature (transaction et mouvement)', () => {
    const d = budget();
    for (const ref of [T('t1'), V('m1')]) {
      expect(setOperationAnnotation(d, ref, 'x'.repeat(ANNOTATION_MAX))).toBe(true);
      expect(setOperationAnnotation(d, ref, 'y'.repeat(ANNOTATION_MAX + 1))).toBe(false);
      expect(noteOf(d, ref)).toBe('x'.repeat(ANNOTATION_MAX));
    }
  });

  it('CA4 : un texte vide ou d’espaces supprime l’annotation (la propriété disparaît)', () => {
    const d = budget();
    for (const ref of [T('t1'), V('m1')]) {
      setOperationAnnotation(d, ref, 'Résumé');
      expect(setOperationAnnotation(d, ref, '   \n ')).toBe(true);
      expect(noteOf(d, ref)).toBeUndefined();
    }
    expect('annotation' in d.transactions[0]).toBe(false);
    expect('annotation' in d.accountMovements![0]).toBe(false);
  });

  it('CA5 : retours à la ligne conservés, espaces autour retirés', () => {
    const d = budget();
    setOperationAnnotation(d, T('t1'), '  ligne 1\nligne 2\n\nligne 4  ');
    expect(noteOf(d, T('t1'))).toBe('ligne 1\nligne 2\n\nligne 4');
  });

  it('une opération inconnue est refusée', () => {
    const d = budget();
    expect(setOperationAnnotation(d, T('zz'), 'x')).toBe(false);
    expect(setOperationAnnotation(d, V('t1'), 'x')).toBe(false);
  });
});

describe('ajout sur plusieurs opérations (RG9, CA1, CA12)', () => {
  it('CA1 : seules les opérations cochées portent le texte', () => {
    const d = budget();
    expect(attachedOperations(d, M, d.months[M].lines[0])).toHaveLength(4);
    expect(annotateOperations(d, [T('t1'), V('m2')], 'Réel = +50 €')).toBe(true);
    expect([T('t1'), T('t2'), V('m1'), V('m2')].map(r => noteOf(d, r))).toEqual(['Réel = +50 €', undefined, undefined, 'Réel = +50 €']);
  });

  it('tout ou rien : une opération inconnue ou un texte trop long ne change rien', () => {
    const d = budget();
    expect(annotateOperations(d, [T('t1'), T('zz')], 'x')).toBe(false);
    expect(annotateOperations(d, [T('t1'), V('m1')], 'x'.repeat(ANNOTATION_MAX + 1))).toBe(false);
    expect(noteOf(d, T('t1'))).toBeUndefined();
    expect(noteOf(d, V('m1'))).toBeUndefined();
  });

  it('CA12 : les opérations déjà annotées sont détectées avant l’écrasement', () => {
    const d = budget();
    annotateOperations(d, [T('t2')], 'Acompte versé');
    expect(alreadyAnnotated(d, [T('t1'), T('t2'), V('m1')])).toEqual([T('t2')]);
    expect(alreadyAnnotated(d, [T('t1')])).toEqual([]);
    // Refuser la confirmation = ne pas appeler `annotateOperations` : rien n'est écrasé.
    expect(noteOf(d, T('t2'))).toBe('Acompte versé');
  });
});

describe('opérations rattachées à une ligne (RG11, CA11, CA13)', () => {
  const keys = (d: BudgetData, line: string) => attachedOperations(d, M, d.months[M].lines.find(l => l.key === line)!).map(o => `${o.kind}:${o.id}`).sort();

  it('CA11 : imputation, cible de mouvement et compte lié à une ligne d’épargne', () => {
    const d = budget();
    expect(keys(d, 'ldds')).toEqual(['mv:m1', 'mv:m2', 'tx:t1', 'tx:t2']);
    // « Courses » : seulement l'imputation, pas l'affectation au compte LDDS.
    expect(keys(d, 'cou')).toEqual(['tx:t2']);
  });

  it('CA11 : enveloppe, mois différent, hors budget, mouvement sans ligne et compte lié d’une ligne non épargne ne sont pas rattachés', () => {
    const d = budget();
    d.transactions.push(
      tx('env', { type: 'env', target: 'ldds' }),
      tx('autre-mois', { month: '2026-10', target: 'ldds', type: 'epa' }),
      tx('hb', { target: 'ldds', type: 'epa', offBudget: true }),
      tx('autre-compte', { target: 'sal', type: 'rev', assignedAccountId: 'acc-autre' }),
    );
    d.accountMovements!.push(mv('m-env', { targets: [{ kind: 'env', id: 'ldds' }] }), mv('m-nu'), mv('m-oct', { month: '2026-10', targets: [{ kind: 'line', key: 'ldds' }] }));
    expect(keys(d, 'ldds')).toEqual(['mv:m1', 'mv:m2', 'tx:t1', 'tx:t2']);
    d.months[M].lines[0].block = 'var';
    expect(keys(d, 'ldds')).toEqual(['mv:m1', 'mv:m2', 'tx:t1']);
  });

  it('chaque opération porte sa date, son libellé et son montant signé (dépense négative, versement ou entrée positif, virement positif)', () => {
    const d = budget();
    d.transactions.push(tx('t3', { target: 'ldds', type: 'epa', amount: 25, label: 'Entrée', day: 3 }));
    const ops = attachedOperations(d, M, d.months[M].lines[0]);
    expect(ops[0]).toMatchObject({ kind: 'tx', id: 't3', label: 'Entrée', date: '2026-11-03', amount: 25 });
    expect(ops.find(o => o.id === 't2')!.amount).toBe(-300);
    expect(ops.find(o => o.id === 'm1')!.amount).toBe(950);
  });

  it('CA13 : une opération rattachée à deux lignes partage une seule annotation, visible et cochable sous les deux', () => {
    const d = budget();
    // t2 : imputée à « Courses » ET affectée au compte lié de « LDDS Travaux ».
    expect(keys(d, 'cou')).toContain('tx:t2');
    expect(keys(d, 'ldds')).toContain('tx:t2');
    annotateOperations(d, [T('t2')], 'Acompte');
    const [cou, ldds] = ['cou', 'ldds'].map(k => annotatedOperations(d, M, d.months[M].lines.find(l => l.key === k)!));
    expect(cou.map(o => o.annotation)).toEqual(['Acompte']);
    expect(ldds.map(o => o.annotation)).toEqual(['Acompte']);
    // Modifier depuis l'une se voit sous l'autre : c'est la même annotation.
    setOperationAnnotation(d, T('t2'), 'Autre');
    expect(annotatedOperations(d, M, d.months[M].lines[0])[0].annotation).toBe('Autre');
  });

  it('CA14 : la liste d’une ligne ne contient que les opérations annotées, avec leur montant ; plus aucune annotation = liste vide', () => {
    const d = budget();
    annotateOperations(d, [T('t1'), V('m1')], 'Réel = +50 €');
    const list = annotatedOperations(d, M, d.months[M].lines[0]);
    // t1 est un versement d'épargne (type epa) : son montant est positif, comme dans l'écran Opérations.
    expect(list.map(o => [o.id, o.amount])).toEqual([['t1', 1000], ['m1', 950]]);
    annotateOperations(d, [T('t1'), V('m1')], '');
    expect(annotatedOperations(d, M, d.months[M].lines[0])).toEqual([]);
  });

  it('CA18 : sans aucune annotation, aucune opération n’en porte la trace', () => {
    const d = budget();
    expect(attachedOperations(d, M, d.months[M].lines[0]).every(o => !('annotation' in o))).toBe(true);
    expect(annotatedOperations(d, M, d.months[M].lines[0])).toEqual([]);
  });
});

describe('aucun effet sur les chiffres ni sur les mois (RG3, RG5, RG6)', () => {
  const figures = (d: BudgetData) => {
    const ledger = new Ledger(d, M);
    return JSON.stringify([monthSummary(d, ledger, M), ledger.bankMonth(MAIN_ACCOUNT_ID, M), ledger.bankMonth(LDDS, M), lineSpentNet(d, M, d.months[M].lines[0]), d.months[M].lines]);
  };

  it('CA6 : budget, réel, écart, soldes et totaux inchangés', () => {
    const d = budget();
    const before = figures(d);
    annotateOperations(d, [T('t1'), T('t2'), V('m1'), V('m2')], 'Résumé');
    expect(figures(d)).toBe(before);
  });

  it('CA7 : modifiable, puis supprimable, sur un mois clos, sans changer un chiffre', () => {
    const d = budget();
    d.months[M].closed = true;
    const before = figures(d);
    expect(annotateOperations(d, [T('t1'), V('m1')], 'Résumé')).toBe(true);
    expect(figures(d)).toBe(before);
    expect(setOperationAnnotation(d, T('t1'), '')).toBe(true);
    expect(noteOf(d, T('t1'))).toBeUndefined();
  });

  it('CA2 : créer ou copier un mois ne crée aucune opération, donc aucune annotation, ni dans le modèle', () => {
    const d = budget();
    annotateOperations(d, [T('t1'), V('m1')], 'Résumé');
    saveAsTemplate(d, M);
    expect(JSON.stringify(d.template)).not.toContain('Résumé');
    d.months['2026-12'] = { initialized: false, lines: [], alloc: {}, transfersDone: {} };
    const before = d.transactions.length + d.accountMovements!.length;
    expect(duplicatePrevious(d, '2026-12')).toBe(true);
    expect(d.transactions.length + d.accountMovements!.length).toBe(before);
    expect(JSON.stringify(d.months['2026-12'])).not.toContain('Résumé');
    expect(d.transactions.filter(t => t.month === '2026-12')).toEqual([]);
  });
});

describe('cycle de vie (RG7, CA8)', () => {
  it('CA8 : supprimer l’opération supprime son annotation', () => {
    const d = budget();
    annotateOperations(d, [T('t1'), V('m1')], 'Résumé');
    expect(deleteTransaction(d, 't1')).toBe(true);
    expect(deleteAccountMovement(d, 'm1')).toBe(true);
    expect(JSON.stringify(d)).not.toContain('Résumé');
  });

  it('CA8 : modifier l’opération (libellé, montant, date, imputation) conserve son annotation', () => {
    const d = budget();
    annotateOperations(d, [T('t2'), V('m1')], 'Résumé');
    const t = d.transactions.find(x => x.id === 't2')!;
    expect(updateTransaction(d, 't2', { label: 'Plombier', amount: 120, date: '2026-11-20', type: 'var', target: 'cou' })).toBe(true);
    expect(d.transactions.find(x => x.id === 't2')).toMatchObject({ label: 'Plombier', amount: 120, annotation: 'Résumé' });
    expect(t.id).toBe('t2');
    expect(updateAccountMovement(d, 'm1', { label: 'Autre', amount: 400, date: '2026-11-20', targets: [] })).toBe(true);
    expect(noteOf(d, V('m1'))).toBe('Résumé');
    // L'opération n'est plus rattachée à « LDDS Travaux » : elle y disparaît, mais son annotation est intacte.
    expect(attachedOperations(d, M, d.months[M].lines[0]).some(o => o.id === 'm1')).toBe(false);
  });

  it('CA8 : une opération recréée par addTransaction avec une annotation la garde', () => {
    const d = budget();
    expect(addTransaction(d, tx('t9', { annotation: 'Déjà là' }))).toBe(true);
    expect(noteOf(d, T('t9'))).toBe('Déjà là');
  });

  it('un virement créé par addTransfer n’a pas d’annotation', () => {
    const d = budget();
    expect(addTransfer(d, { id: 'm9', month: M, day: 2, label: 'Nouveau', amount: 10, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: LDDS, targets: [] })).toBe(true);
    expect(noteOf(d, V('m9'))).toBeUndefined();
  });
});
