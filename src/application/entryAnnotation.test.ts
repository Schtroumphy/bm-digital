import { describe, expect, it } from 'vitest';
import { addTransfer, updateAccountMovement } from './accountMovements';
import { addTransaction, transactionsCsv, updateTransaction } from './actions';
import { annotateOperations, setOperationAnnotation } from './operationAnnotations';
import { prepareImport, validateImport } from './statementImport';
import { Ledger } from '../domain/ledger';
import { ANNOTATION_MAX, matchesEntrySearch } from '../domain/annotation';
import { monthSummary } from '../domain/budget';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID } from '../domain/bank';
import { seedData } from '../domain/seed';
import type { StatementRow } from '../domain/statement';

/* Spec 0051 : le texte libre d'une opération est son annotation (le détail de la spec 0020 a disparu). */

const M = '2026-12';
const tx = (id: string, extra: { annotation?: string } = {}) => ({ id, month: M, day: 3, label: 'Pharmacie', amount: 23.4, type: 'var' as const, target: 'v-ali', ...extra });
const patch = { label: 'Pharmacie', amount: 23.4, date: '2026-12-03', type: 'var' as const, target: 'v-ali' };
const transfer = (id: string, extra: { annotation?: string } = {}) => ({ id, month: M, day: 8, label: 'Retrait', amount: 40, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID, ...extra });

describe('saisie de l’annotation à la création (RG6)', () => {
  it('addTransaction enregistre l’annotation nettoyée ; vide ou espaces : aucune propriété', () => {
    const d = seedData();
    addTransaction(d, tx('a', { annotation: '  Ordonnance du Dr Martin ' }));
    addTransaction(d, tx('blank', { annotation: '   ' }));
    addTransaction(d, tx('none'));
    expect(d.transactions.find(t => t.id === 'a')!.annotation).toBe('Ordonnance du Dr Martin');
    expect(d.transactions.find(t => t.id === 'blank')).not.toHaveProperty('annotation');
    expect(d.transactions.find(t => t.id === 'none')).not.toHaveProperty('annotation');
    expect(d.transactions.every(t => !('detail' in t))).toBe(true);
  });

  it('500 caractères acceptés, 501 refusés sans troncature (transaction et transfert)', () => {
    const d = seedData();
    expect(addTransaction(d, tx('ok', { annotation: 'x'.repeat(ANNOTATION_MAX) }))).toBe(true);
    expect(addTransaction(d, tx('ko', { annotation: 'x'.repeat(ANNOTATION_MAX + 1) }))).toBe(false);
    expect(d.transactions.find(t => t.id === 'ko')).toBeUndefined();
    expect(addTransfer(d, transfer('mok', { annotation: 'y'.repeat(ANNOTATION_MAX) }))).toBe(true);
    expect(addTransfer(d, transfer('mko', { annotation: 'y'.repeat(ANNOTATION_MAX + 1) }))).toBe(false);
    expect(d.accountMovements!.some(m => m.id === 'mok')).toBe(true);
    expect(d.accountMovements!.some(m => m.id === 'mko')).toBe(false);
  });
});

describe('modification de l’annotation (RG7)', () => {
  it('updateTransaction : sans annotation dans la modification, l’existante est conservée ; vide la retire ; trop long refuse tout', () => {
    const d = seedData();
    addTransaction(d, tx('a', { annotation: 'avant' }));
    expect(updateTransaction(d, 'a', { ...patch, label: 'Autre libellé' })).toBe(true);
    expect(d.transactions.find(t => t.id === 'a')).toMatchObject({ label: 'Autre libellé', annotation: 'avant' });
    expect(updateTransaction(d, 'a', { ...patch, annotation: ' après ' })).toBe(true);
    expect(d.transactions.find(t => t.id === 'a')!.annotation).toBe('après');
    expect(updateTransaction(d, 'a', { ...patch, annotation: 'z'.repeat(ANNOTATION_MAX + 1) })).toBe(false);
    expect(d.transactions.find(t => t.id === 'a')!.annotation).toBe('après');
    expect(updateTransaction(d, 'a', { ...patch, annotation: '  ' })).toBe(true);
    expect(d.transactions.find(t => t.id === 'a')).not.toHaveProperty('annotation');
  });

  it('updateAccountMovement : même règle pour un mouvement', () => {
    const d = seedData();
    d.accountMovements = [transfer('m1', { annotation: 'Pour le marché' }), transfer('m2', { annotation: 'Autre' })];
    expect(updateAccountMovement(d, 'm1', { label: 'Retrait DAB', amount: 45 })).toBe(true);
    expect(d.accountMovements[0]).toMatchObject({ label: 'Retrait DAB', annotation: 'Pour le marché' });
    expect(updateAccountMovement(d, 'm1', { label: 'Retrait DAB', amount: 45, annotation: 'Changé' })).toBe(true);
    expect(updateAccountMovement(d, 'm1', { label: 'x', amount: 45, annotation: 'k'.repeat(ANNOTATION_MAX + 1) })).toBe(false);
    expect(d.accountMovements[0].annotation).toBe('Changé');
    expect(updateAccountMovement(d, 'm1', { label: 'Retrait DAB', amount: 45, annotation: '' })).toBe(true);
    expect(d.accountMovements[0]).not.toHaveProperty('annotation');
  });

  it('CA15 : l’annotation d’un mouvement ne change pas celle d’un autre (écritures d’un virement lié comprises)', () => {
    const d = seedData();
    d.accountMovements = [transfer('m1', { annotation: 'A' }), transfer('m2', { annotation: 'B' })];
    setOperationAnnotation(d, { kind: 'mv', id: 'm1' }, 'Changé');
    expect(d.accountMovements[1].annotation).toBe('B');
  });
});

describe('recherche (RG9, CA9)', () => {
  const e = { label: 'Pharmacie', annotation: 'Ordonnance du Dr Martin, mutuelle à demander' };
  it('CA9 : trouve dans le libellé ou dans l’annotation, sans tenir compte de la casse', () => {
    expect(matchesEntrySearch(e, 'pharma')).toBe(true);
    expect(matchesEntrySearch(e, 'MUTUELLE')).toBe(true);
    expect(matchesEntrySearch(e, 'courses')).toBe(false);
  });
  it('une écriture sans annotation se cherche par son libellé ; recherche vide = tout', () => {
    expect(matchesEntrySearch({ label: 'Lidl' }, 'lidl')).toBe(true);
    expect(matchesEntrySearch({ label: 'Lidl' }, 'mutuelle')).toBe(false);
    expect(matchesEntrySearch({ label: 'Lidl' }, '  ')).toBe(true);
  });
});

describe('export CSV (RG11, CA11)', () => {
  it('la colonne « Annotation » remplace « Détail » et contient le texte de l’annotation', () => {
    const row = { date: '2026-12-03', label: 'Pharmacie', annotation: 'Ordonnance; "urgente"', type: 'Dépense', imputation: 'Santé', account: 'Compte principal', assignedTo: '', offBudget: false, amount: -23.4 };
    const [head, line] = transactionsCsv([row]).replace('﻿', '').split('\r\n');
    expect(head).toBe('Date;Libellé;Annotation;Nature;Imputation;Compte;Affectée à;Hors budget;Montant');
    expect(head).not.toContain('Détail');
    expect(line).toContain('"Ordonnance; ""urgente"""');
  });
});

describe('chiffres, mois clos, réimport (RG13, CA12, CA13)', () => {
  it('CA13 : l’annotation reste modifiable sur un mois clos et ne change aucun chiffre', () => {
    const plain = seedData();
    const annotated = seedData();
    for (const d of [plain, annotated]) {
      addTransaction(d, tx('a'));
      d.accountMovements = [transfer('m1')];
    }
    annotated.months[M].closed = true;
    plain.months[M].closed = true;
    expect(annotateOperations(annotated, [{ kind: 'tx', id: 'a' }, { kind: 'mv', id: 'm1' }], 'info')).toBe(true);
    expect(updateAccountMovement(annotated, 'm1', { label: 'x', amount: 1, annotation: 'y' })).toBe(false);
    const figures = (d: ReturnType<typeof seedData>) => {
      const l = new Ledger(d);
      return { summary: monthSummary(d, l, M), main: l.bankMonth(MAIN_ACCOUNT_ID, M), cash: l.bankMonth(CASH_ACCOUNT_ID, M) };
    };
    expect(figures(annotated)).toEqual(figures(plain));
  });

  it('CA12 : modifier l’annotation d’une écriture importée ne la rend pas « nouvelle » au réimport', () => {
    const d = seedData();
    const row: StatementRow = { date: '2026-12-03', label: 'ACHAT TEST', notes: '', category: '', accountName: 'Compte', connectionName: 'Banque', amount: 12, direction: 'debit' };
    const reading = { rows: [row], errors: [] };
    d.importAccountLinks = [{ id: 'l1', accountName: 'Compte', connectionName: 'Banque', accountId: MAIN_ACCOUNT_ID }];
    let seq = 0;
    const newId = (p: string) => `imp-${p}${++seq}`;
    const first = prepareImport(d, reading);
    validateImport(d, { ...first, lines: first.lines.map(l => ({ ...l, target: { kind: 'var' as const, key: 'v-ali' } })) }, newId);
    const imported = d.transactions.find(t => t.fingerprint)!;
    const { fingerprint, rank } = imported;
    expect(setOperationAnnotation(d, { kind: 'tx', id: imported.id }, 'Ajouté après coup')).toBe(true);
    expect(imported).toMatchObject({ fingerprint, rank, annotation: 'Ajouté après coup' });
    expect(prepareImport(d, reading).lines.map(l => l.duplicate)).toEqual([true]);
    expect(d.transactions.find(t => t.id === imported.id)!.annotation).toBe('Ajouté après coup');
  });
});
