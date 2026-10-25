import { describe, expect, it } from 'vitest';
import { deleteAccountMovement, unlinkMovementFace, updateAccountMovement } from './accountMovements';
import { checkEnvelope } from './checkoff';
import { setChecked } from './importFilters';
import { importableIds, withLinkedPartners, changeNature, completionOf, linkCandidates, linkLines, prepareImport, previewCounts, sessionSummary, syncLinked, targetIsValid, unlinkLine, validateImport, type ImportPreview, type PreviewLine } from './statementImport';
import { MAIN_ACCOUNT_ID, defaultBankAccounts, newEnvelopeAccount } from '../domain/bank';
import { estimatedMovements, realMovements } from '../domain/bankMovements';
import { emptyData } from '../domain/empty';
import { ENVELOPES_ID, envelopeSplit, findCompletable, linkStateOf, pairFaces } from '../domain/internalTransfers';
import { Ledger } from '../domain/ledger';
import { fingerprintOf, type StatementReading, type StatementRow } from '../domain/statement';
import type { BudgetData } from '../domain/types';

const M = '2026-10';
const SAV = 'acc-sav';
const SWILE = 'acc-swile';
const ENV = 'acc-env-sante';
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;

const MAIN_PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
const SAV_PAIR = ['Livret A (x1234)', 'Banque Test'] as const;
const SWILE_PAIR = ['Compte Swile (x9999)', 'Autre Banque'] as const;
const ENV_PAIR = ['Enveloppe Santé (x0002)', 'Lydia'] as const;

function row(date: string, label: string, amount: number, direction: 'debit' | 'credit', pair: readonly [string, string] = MAIN_PAIR, notes = ''): StatementRow {
  return { date, label, notes, category: '', accountName: pair[0], connectionName: pair[1], amount, direction };
}
const debit = (date: string, label: string, amount: number, pair: readonly [string, string] = MAIN_PAIR) => row(date, label, amount, 'debit', pair);
const credit = (date: string, label: string, amount: number, pair: readonly [string, string] = SAV_PAIR) => row(date, label, amount, 'credit', pair);
const reading = (rows: StatementRow[]): StatementReading => ({ rows, errors: [] });

/** October open, a savings account, a second account, an envelope « Santé » with its own account; the four accounts of the file are matched. */
function budget(): BudgetData {
  const d = emptyData();
  d.firstMonth = '2026-09';
  d.months['2026-09'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  d.accounts = [
    ...defaultBankAccounts('2026-09'),
    { id: SAV, name: 'Livret A', hue: 20, isDefault: false, openingBalance: 0, openingMonth: '2026-09', inBudget: true, archived: false, kind: 'epargne' },
    { id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2026-09', inBudget: true, archived: false },
    newEnvelopeAccount(ENV, 'sante', 'Santé', 200, 0, '2026-09'),
  ];
  d.accounts[0].openingBalance = 1000;
  d.envelopes = [{ id: 'sante', name: 'Santé', hue: 200, openingCash: 0, accountId: ENV }];
  d.months[M] = { initialized: true, lines: [], alloc: { sante: 50 }, transfersDone: {} };
  d.months['2026-11'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: MAIN_PAIR[0], connectionName: MAIN_PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l2', accountName: SAV_PAIR[0], connectionName: SAV_PAIR[1], accountId: SAV },
    { id: 'l3', accountName: SWILE_PAIR[0], connectionName: SWILE_PAIR[1], accountId: SWILE },
    { id: 'l4', accountName: ENV_PAIR[0], connectionName: ENV_PAIR[1], accountId: ENV },
  ];
  return d;
}

const prepare = (d: BudgetData, rows: StatementRow[]) => prepareImport(d, reading(rows));
const byLabel = (p: ImportPreview, s: string) => p.lines.find(l => l.row.label.includes(s))!;
const edit = (p: ImportPreview, id: string, fn: (l: PreviewLine) => PreviewLine): ImportPreview => ({ ...p, lines: p.lines.map(l => (l.id === id ? fn(l) : l)) });
const checkAll = (p: ImportPreview): ImportPreview => ({ ...p, lines: setChecked(p.lines, new Set(p.lines.map(l => l.id)), true) });

const PAIR_ROWS = [debit('2026-09-28', 'VIREMENT EMIS LIVRET', 300), credit('2026-09-29', 'VIREMENT EN VOTRE FAVEUR', 300)];

describe('appariement des deux faces (domaine)', () => {
  const face = (id: string, accountId: string, amount: number, date: string, credit: boolean) => ({ id, accountId, amount, date, credit });
  it('RG6: apparie un débit et un crédit de même montant, de comptes différents, à au plus 3 jours', () => {
    const r = pairFaces([face('d', 'a', 300, '2026-09-28', false), face('c', 'b', 300, '2026-10-01', true)]);
    expect(r.pairs).toEqual([['d', 'c']]);
    expect(pairFaces([face('d', 'a', 300, '2026-09-28', false), face('c', 'b', 300, '2026-10-02', true)]).pairs).toEqual([]);
  });
  it('CA4 / RG10: montants différents ou même compte : jamais d’appariement', () => {
    expect(pairFaces([face('d', 'a', 300, '2026-09-28', false), face('c', 'b', 299, '2026-09-28', true)]).pairs).toEqual([]);
    expect(pairFaces([face('d', 'a', 300, '2026-09-28', false), face('c', 'a', 300, '2026-09-28', true)]).pairs).toEqual([]);
  });
  it('CA5: plusieurs candidats : aucun appariement, les lignes sont ambiguës', () => {
    const r = pairFaces([face('d1', 'a', 100, '2026-09-30', false), face('d2', 'a', 100, '2026-09-30', false), face('c1', 'b', 100, '2026-09-30', true), face('c2', 'b', 100, '2026-09-30', true)]);
    expect(r.pairs).toEqual([]);
    expect([...r.ambiguous].sort()).toEqual(['c1', 'c2', 'd1', 'd2']);
  });
});

describe('aperçu : une paire en deux lignes liées (RG6, RG7)', () => {
  it('CA1: la paire est proposée liée, décochée ; cocher une ligne coche l’autre', () => {
    const d = budget();
    const p = prepare(d, PAIR_ROWS);
    const [deb, cre] = [byLabel(p, 'EMIS'), byLabel(p, 'FAVEUR')];
    expect(deb).toMatchObject({ nature: 'interne', checked: false, link: cre.id, target: { kind: 'account', id: SAV } });
    expect(cre).toMatchObject({ nature: 'recu', checked: false, link: deb.id, target: { kind: 'account', id: MAIN_ACCOUNT_ID } });
    const checked = setChecked(p.lines, new Set([deb.id]), true);
    expect(checked.every(l => l.checked)).toBe(true);
    // Via l'édition d'une seule ligne (la case de la ligne), l'autre suit.
    const viaRow = syncLinked(d, p.lines.map(l => (l.id === cre.id ? { ...l, checked: true } : l)), cre.id);
    expect(viaRow.every(l => l.checked)).toBe(true);
  });

  it('RG7: la paire n’est importée que si les deux lignes sont cochées', () => {
    const d = budget();
    const p = prepare(d, PAIR_ROWS);
    const half = edit(p, byLabel(p, 'EMIS').id, l => ({ ...l, checked: true }));
    expect(validateImport(d, half, newId).internalTransfers).toBe(0);
    expect(d.accountMovements ?? []).toHaveLength(0);
  });

  it('CA2 / CA3: un seul mouvement avec les deux traces ; chaque compte bouge à la date de sa face ; budget intact', () => {
    const d = budget();
    const batch = validateImport(d, checkAll(prepare(d, PAIR_ROWS)), newId);
    expect(batch).toMatchObject({ internalTransfers: 1, linkedTransfers: 1, revenues: 0, expenses: 0 });
    expect(d.transactions).toEqual([]);
    expect(d.accountMovements).toHaveLength(1);
    const mv = d.accountMovements![0];
    expect(mv).toMatchObject({ fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SAV, amount: 300, label: 'VIREMENT EMIS LIVRET', bankDate: '2026-09-28' });
    expect(mv.importAccountId).toBe(MAIN_ACCOUNT_ID);
    expect(mv.creditTrace).toMatchObject({ importAccountId: SAV, bankDate: '2026-09-29', rank: 1 });
    expect(linkStateOf(mv)).toBe('lie');
    // Septembre: le principal est débité le 28, le livret crédité le 29 (RG14).
    expect(realMovements(d, MAIN_ACCOUNT_ID, '2026-09')).toEqual([expect.objectContaining({ amount: -300, date: '2026-09-28' })]);
    expect(realMovements(d, SAV, '2026-09')).toEqual([expect.objectContaining({ amount: 300, date: '2026-09-29' })]);
    expect(d.months[M].alloc).toEqual({ sante: 50 });
  });

  it('CA4 : deux lignes de montants différents ne se relient pas, même à la main', () => {
    const d = budget();
    const p = prepare(d, [debit('2026-09-28', 'VIREMENT EMIS', 300), credit('2026-09-29', 'VIREMENT EN VOTRE FAVEUR', 299)]);
    expect(byLabel(p, 'EMIS').link).toBeUndefined();
    expect(linkCandidates(p.lines, byLabel(p, 'EMIS').id)).toEqual([]);
    expect(linkLines(d, p.lines, byLabel(p, 'EMIS').id, byLabel(p, 'FAVEUR').id)).toBeNull();
  });

  it('CA5 : deux virements de 100 € le même jour entre les mêmes comptes : ambigu, relié à la main, chaque crédit une seule fois', () => {
    const d = budget();
    const p = prepare(d, [debit('2026-09-30', 'VIREMENT EMIS A', 100), debit('2026-09-30', 'VIREMENT EMIS B', 100), credit('2026-09-30', 'VIREMENT EN VOTRE FAVEUR A', 100), credit('2026-09-30', 'VIREMENT EN VOTRE FAVEUR B', 100)]);
    expect(p.lines.every(l => l.ambiguous && l.link === undefined)).toBe(true);
    const [a, b] = [byLabel(p, 'EMIS A'), byLabel(p, 'EMIS B')];
    const [x, y] = [byLabel(p, 'FAVEUR A'), byLabel(p, 'FAVEUR B')];
    const linked = linkLines(d, p.lines, a.id, x.id)!;
    expect(linked.find(l => l.id === a.id)!.link).toBe(x.id);
    // Le crédit relié n'est plus proposé à l'autre débit, et on ne peut pas le relier une seconde fois.
    expect(linkCandidates(linked, b.id).map(l => l.id)).toEqual([y.id]);
    expect(linkLines(d, linked, b.id, x.id)).toBeNull();
  });

  it('CA6 : « Délier » rend deux lignes indépendantes, qui ne sont plus appariées d’office', () => {
    const d = budget();
    const p = prepare(d, PAIR_ROWS);
    const unlinked = unlinkLine(p.lines, byLabel(p, 'EMIS').id);
    expect(unlinked.map(l => l.link)).toEqual([null, null]);
    expect(unlinked.every(l => !l.checked)).toBe(true);
    // Un changement de nature à la main coupe aussi la paire.
    const cut = syncLinked(d, p.lines.map(l => (l.id === byLabel(p, 'FAVEUR').id ? changeNature(d, l, 'revenu') : l)), byLabel(p, 'FAVEUR').id);
    expect(cut.map(l => l.link)).toEqual([null, null]);
  });

  it('une dépense ordinaire du même montant n’est pas appariée à un salaire (rien ne ressemble à un virement)', () => {
    const d = budget();
    const p = prepare(d, [debit('2026-09-28', 'CARREFOUR', 300), credit('2026-09-28', 'SALAIRE ACME', 300)]);
    expect(p.lines.every(l => l.link === undefined && !l.ambiguous)).toBe(true);
  });

  it('un virement vers un compte non importé (ou la paire changée) : le mouvement porte la cible par défaut du compte de l’enveloppe (RG10 de la 0019)', () => {
    const d = budget();
    const p = checkAll(prepare(d, [debit('2026-10-02', 'VIREMENT EMIS SANTE', 50), credit('2026-10-03', 'VIREMENT EN VOTRE FAVEUR', 50, ENV_PAIR)]));
    validateImport(d, p, newId);
    // Pointée l'allocation d'octobre ne compte plus dans l'estimé : le virement la remplace (une seule fois).
    expect(d.accountMovements![0].target).toEqual({ kind: 'env', id: 'sante' });
    expect(linkStateOf(d.accountMovements![0])).toBe('lie');
  });
});

describe('import des seules lignes affichées (filtre qui masque une face)', () => {
  it('la face masquée suit la face affichée ; importableIds ne compte pas une moitié de paire', () => {
    const d = budget();
    const p = checkAll(prepare(d, PAIR_ROWS));
    const deb = byLabel(p, 'EMIS');
    const cre = byLabel(p, 'FAVEUR');
    expect(withLinkedPartners(p.lines, new Set([deb.id]))).toEqual(new Set([deb.id, cre.id]));
    // Seule la face débit est demandée (le filtre masque le crédit) : la paire est quand même écrite.
    expect(validateImport(d, p, newId, { ids: new Set([deb.id]) })).toMatchObject({ internalTransfers: 1, linkedTransfers: 1, importedIds: expect.arrayContaining([deb.id, cre.id]) });
    expect(d.accountMovements).toHaveLength(1);
    // Une face dont le partenaire n'est pas prêt n'est pas « prête ».
    const e = budget();
    const q = edit(checkAll(prepare(e, PAIR_ROWS)), byLabel(prepare(e, PAIR_ROWS), 'FAVEUR').id, l => ({ ...l, month: '2027-01' }));
    expect(importableIds(e, q).size).toBe(0);
  });
});

describe('virement à une seule face (RG12) et liaison tardive (RG13)', () => {
  it('CA8 : un crédit « virement » sans contrepartie reste « Revenu » décoché ; qualifié « Virement interne », il demande un compte source', () => {
    const d = budget();
    const p = prepare(d, [credit('2026-10-22', 'VIREMENT EN VOTRE FAVEUR cagnotte', 1600, MAIN_PAIR)]);
    const l = p.lines[0];
    expect(l).toMatchObject({ nature: 'revenu', checked: false, receivedHint: true });
    const recu = changeNature(d, l, 'recu');
    expect(previewCounts(d, { ...p, lines: [recu] }).incomplete).toBe(1);
    expect(targetIsValid(d, MAIN_ACCOUNT_ID, 'recu', { kind: 'account', id: MAIN_ACCOUNT_ID }, M)).toBe(false);
    expect(targetIsValid(d, MAIN_ACCOUNT_ID, 'recu', { kind: 'account', id: SAV }, M)).toBe(true);
  });

  it('CA9 : un crédit seul avec compte source : mouvement « une face (crédit) », source = compte choisi, destination = compte de la ligne', () => {
    const d = budget();
    let p = prepare(d, [credit('2026-10-22', 'VIREMENT EN VOTRE FAVEUR cagnotte', 1600, MAIN_PAIR)]);
    p = edit(p, p.lines[0].id, l => ({ ...changeNature(d, l, 'recu'), target: { kind: 'account', id: SAV }, checked: true }));
    expect(validateImport(d, p, newId)).toMatchObject({ internalTransfers: 1, linkedTransfers: 0, revenues: 0 });
    const mv = d.accountMovements![0];
    expect(mv).toMatchObject({ fromAccountId: SAV, toAccountId: MAIN_ACCOUNT_ID, amount: 1600, bankDate: '2026-10-22' });
    expect(mv.fingerprint).toBeUndefined();
    expect(mv.creditTrace).toMatchObject({ importAccountId: MAIN_ACCOUNT_ID, bankDate: '2026-10-22' });
    expect(linkStateOf(mv)).toBe('credit');
    // Les deux comptes bougent à la date du crédit (face absente = date de l'autre, RG14).
    expect(realMovements(d, SAV, M)).toEqual([expect.objectContaining({ amount: -1600, date: '2026-10-22' })]);
    expect(realMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([expect.objectContaining({ amount: 1600, date: '2026-10-22' })]);
  });

  it('CA10 : le crédit arrivé plus tard complète le mouvement « une face (débit) » sans nouvelle écriture', () => {
    const d = budget();
    let first = prepare(d, [debit('2026-09-28', 'VIREMENT EMIS LIVRET', 300)]);
    first = edit(first, first.lines[0].id, l => ({ ...changeNature(d, l, 'interne'), target: { kind: 'account', id: SAV }, checked: true }));
    validateImport(d, first, newId);
    expect(linkStateOf(d.accountMovements![0])).toBe('debit');

    const later = prepare(d, [credit('2026-09-30', 'VIREMENT EN VOTRE FAVEUR', 300)]);
    const l = later.lines[0];
    // Proposée d'office « Complète le virement », décochée, sans choisir quoi que ce soit.
    expect(l).toMatchObject({ nature: 'recu', checked: false, target: { kind: 'account', id: MAIN_ACCOUNT_ID } });
    expect(completionOf(d, l)).toBe(d.accountMovements![0]);
    const batch = validateImport(d, { ...later, lines: [{ ...l, checked: true }] }, newId);
    expect(batch).toMatchObject({ completedFaces: 1, internalTransfers: 0, revenues: 0 });
    expect(d.accountMovements).toHaveLength(1);
    expect(d.accountMovements![0].creditTrace).toMatchObject({ importAccountId: SAV, bankDate: '2026-09-30' });
    expect(linkStateOf(d.accountMovements![0])).toBe('lie');
    // Le livret est crédité à la date bancaire de sa face.
    expect(realMovements(d, SAV, '2026-09')).toEqual([expect.objectContaining({ date: '2026-09-30', amount: 300 })]);
  });

  it('deux crédits identiques dans un lot ne complètent le même mouvement qu’une fois (pas de second mouvement crédit seul)', () => {
    const d = budget();
    d.accountMovements = [{ id: 'm', month: M, day: 5, label: 'V', amount: 300, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SAV, importAccountId: MAIN_ACCOUNT_ID, fingerprint: 'f', rank: 1, bankDate: '2026-10-05' }];
    const p = checkAll(prepare(d, [credit('2026-10-06', 'VIREMENT EN VOTRE FAVEUR', 300), credit('2026-10-06', 'VIREMENT EN VOTRE FAVEUR', 300)]));
    const batch = validateImport(d, p, newId);
    expect(batch).toMatchObject({ completedFaces: 1, internalTransfers: 0 });
    expect(batch.failedIds).toHaveLength(1);
    expect(d.accountMovements).toHaveLength(1);
  });

  it('RG13 : refusé sur un mois verrouillé, et aucune complétion hors tolérance ou de montant différent', () => {
    const d = budget();
    d.accountMovements = [{ id: 'm', month: M, day: 5, label: 'V', amount: 300, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: SAV, importAccountId: MAIN_ACCOUNT_ID, fingerprint: 'f', rank: 1, bankDate: '2026-10-05' }];
    const near = { accountId: SAV, credit: true, amount: 300, date: '2026-10-08' };
    expect(findCompletable(d, near)).toBe(d.accountMovements[0]);
    expect(findCompletable(d, { ...near, date: '2026-10-09' })).toBeNull();
    expect(findCompletable(d, { ...near, amount: 299 })).toBeNull();
    expect(findCompletable(d, { ...near, accountId: SWILE })).toBeNull();
    d.months[M].closed = true;
    const p = prepare(d, [credit('2026-10-08', 'VIREMENT EN VOTRE FAVEUR', 300)]);
    expect(validateImport(d, checkAll(p), newId).completedFaces).toBe(0);
    expect(d.accountMovements[0].creditTrace).toBeUndefined();
  });

  it('CA11 : réimport d’un virement complet : les deux lignes sont des doublons ; une face seule : l’autre est « Complète le virement »', () => {
    const d = budget();
    validateImport(d, checkAll(prepare(d, PAIR_ROWS)), newId);
    const again = prepare(d, PAIR_ROWS);
    expect(again.lines.map(l => l.duplicate)).toEqual([true, true]);
    expect(previewCounts(d, again).toImport).toBe(0);
    // Une face seule importée : l'autre ligne du même fichier se présente comme complément.
    const e = budget();
    let p = prepare(e, [debit('2026-09-28', 'VIREMENT EMIS LIVRET', 300)]);
    p = edit(p, p.lines[0].id, l => ({ ...l, nature: 'interne', target: { kind: 'account', id: SAV }, checked: true }));
    validateImport(e, p, newId);
    const both = prepare(e, PAIR_ROWS);
    expect(both.lines.find(l => l.row.direction === 'debit')!.duplicate).toBe(true);
    expect(completionOf(e, both.lines.find(l => l.row.direction === 'credit')!)).toBe(e.accountMovements![0]);
  });
});

describe('déduplication des deux faces (RG16)', () => {
  it('CA12 : le sens est dans l’empreinte ; une clé ne sert qu’une fois, la trace crédit comprise', () => {
    const base = { date: '2026-09-28', label: 'X', notes: '', amount: 300 };
    expect(fingerprintOf({ ...base, direction: 'debit' })).not.toBe(fingerprintOf({ ...base, direction: 'credit' }));
    const d = budget();
    validateImport(d, checkAll(prepare(d, PAIR_ROWS)), newId);
    // Le crédit déjà tracé est un doublon, même si on le force coché.
    const again = prepare(d, [PAIR_ROWS[1]]);
    expect(again.lines[0].duplicate).toBe(true);
    expect(validateImport(d, { ...again, lines: again.lines.map(l => ({ ...l, checked: true, nature: 'recu', target: { kind: 'account', id: SWILE } })) }, newId).internalTransfers).toBe(0);
    expect(d.accountMovements).toHaveLength(1);
  });
});

describe('gestion après import (RG15, RG18, RG19)', () => {
  const linked = () => {
    const d = budget();
    validateImport(d, checkAll(prepare(d, PAIR_ROWS)), newId);
    return d;
  };

  it('CA13 : supprimer un virement lié libère les deux clés ; mois verrouillé : suppression et déliage refusés', () => {
    const d = linked();
    const id = d.accountMovements![0].id;
    d.months[M].closed = true;
    d.months['2026-09'] = { initialized: true, lines: [], alloc: {}, transfersDone: {}, closed: true };
    expect(deleteAccountMovement(d, id)).toBe(false);
    expect(unlinkMovementFace(d, id, 'credit')).toBe(false);
    delete d.months['2026-09'].closed;
    expect(deleteAccountMovement(d, id)).toBe(true);
    const again = prepare(d, PAIR_ROWS);
    expect(again.lines.map(l => l.duplicate)).toEqual([false, false]);
    expect(again.lines.every(l => l.link)).toBe(true);
  });

  it('RG19 : délier une face retire sa trace ; le mouvement reste « une face » et la ligne libérée est importable seule', () => {
    const d = budget();
    validateImport(d, checkAll(prepare(d, PAIR_ROWS)), newId);
    const mv = d.accountMovements![0];
    expect(unlinkMovementFace(d, mv.id, 'credit')).toBe(true);
    expect(linkStateOf(mv)).toBe('debit');
    expect(unlinkMovementFace(d, mv.id, 'credit')).toBe(false);
    const p = prepare(d, PAIR_ROWS);
    expect(p.lines.map(l => l.duplicate)).toEqual([true, false]);
    // L'autre côté : on remet le crédit puis on retire le débit ; la date du virement devient celle du crédit.
    mv.creditTrace = { importAccountId: SAV, fingerprint: 'c', rank: 1, bankDate: '2026-09-29' };
    expect(unlinkMovementFace(d, mv.id, 'debit')).toBe(true);
    expect(linkStateOf(mv)).toBe('credit');
    expect(mv.bankDate).toBe('2026-09-29');
    expect(mv.fingerprint).toBeUndefined();
  });

  it('CA14 : le montant d’un virement lié ne se modifie pas ; le libellé oui, sans toucher aux traces', () => {
    const d = linked();
    const mv = d.accountMovements![0];
    const traces = JSON.stringify([mv.importAccountId, mv.fingerprint, mv.rank, mv.creditTrace]);
    expect(updateAccountMovement(d, mv.id, { label: 'VIREMENT EMIS LIVRET', amount: 250 })).toBe(false);
    expect(updateAccountMovement(d, mv.id, { label: 'Épargne du mois', amount: 300 })).toBe(true);
    expect(mv.label).toBe('Épargne du mois');
    expect(JSON.stringify([mv.importAccountId, mv.fingerprint, mv.rank, mv.creditTrace])).toBe(traces);
    // Une face seule garde un montant modifiable.
    unlinkMovementFace(d, mv.id, 'credit');
    expect(updateAccountMovement(d, mv.id, { label: 'x', amount: 250 })).toBe(true);
  });
});

describe('règles mémorisées et source du revenu (RG3, RG20)', () => {
  it('CA15 : une règle « Virement interne depuis Livret A » préremplit nature et compte source ; compte archivé : non appliquée', () => {
    const d = budget();
    d.importRules = [{ id: 'r', pattern: 'cagnotte', nature: 'recu', target: { kind: 'account', id: SAV } }];
    const row1 = credit('2026-10-22', 'VIREMENT EN VOTRE FAVEUR cagnotte', 1600, MAIN_PAIR);
    expect(prepare(d, [row1]).lines[0]).toMatchObject({ nature: 'recu', target: { kind: 'account', id: SAV }, checked: true });
    d.accounts.find(a => a.id === SAV)!.archived = true;
    expect(prepare(d, [row1]).lines[0]).toMatchObject({ nature: 'revenu', target: null });
  });

  it('une règle peut être mémorisée sur un virement reçu importé', () => {
    const d = budget();
    let p = prepare(d, [credit('2026-10-22', 'VIREMENT EN VOTRE FAVEUR cagnotte', 1600, MAIN_PAIR)]);
    p = edit(p, p.lines[0].id, l => ({ ...changeNature(d, l, 'recu'), target: { kind: 'account', id: SAV }, checked: true, remember: 'cagnotte' }));
    validateImport(d, p, newId);
    expect(d.importRules).toEqual([expect.objectContaining({ pattern: 'cagnotte', nature: 'recu', target: { kind: 'account', id: SAV } })]);
  });

  it('RG31 : « Enveloppes (global) » se mémorise comme destination d’une règle et se repropose', () => {
    const d = budget();
    let p = prepare(d, [debit('2026-10-02', 'VIREMENT LYDIA', 300)]);
    p = edit(p, p.lines[0].id, l => ({ ...changeNature(d, l, 'interne'), target: { kind: 'account', id: ENVELOPES_ID }, checked: true, remember: 'virement lydia' }));
    validateImport(d, p, newId);
    expect(d.importRules).toEqual([expect.objectContaining({ nature: 'interne', target: { kind: 'account', id: ENVELOPES_ID } })]);
    expect(prepare(d, [debit('2026-11-02', 'VIREMENT LYDIA', 300)]).lines[0]).toMatchObject({ nature: 'interne', target: { kind: 'account', id: ENVELOPES_ID }, checked: true });
  });

  it('RG3 : la source d’un revenu est enregistrée (libellé par défaut) et ne change aucun calcul', () => {
    const d = budget();
    d.months[M].lines = [{ key: 'salaire', block: 'rev', section: '', name: 'Salaire', budget: 2400, actual: null }];
    const p = prepare(d, [credit('2026-10-01', 'SALAIRE ACME', 2480, MAIN_PAIR), credit('2026-10-02', 'PRIME', 100, MAIN_PAIR)]);
    p.lines.forEach((l, i) => Object.assign(l, { target: { kind: 'line', key: 'salaire' }, checked: true, source: i === 0 ? 'ACME' : '' }));
    expect(validateImport(d, p, newId).revenues).toBe(2);
    expect(d.transactions.map(t => t.source)).toEqual(['ACME', 'PRIME']);
  });
});

describe('Enveloppes (global) (RG24 à RG32)', () => {
  const globalDebit = (d: BudgetData) => {
    let p = prepare(d, [debit('2026-10-02', 'VIREMENT LYDIA', 300)]);
    p = edit(p, p.lines[0].id, l => ({ ...changeNature(d, l, 'interne'), target: { kind: 'account', id: ENVELOPES_ID }, checked: true }));
    return p;
  };

  it('CA22 : un débit « vers enveloppes » : une face (débit), le principal baisse, aucun compte créé ni crédité, budget intact', () => {
    const d = budget();
    const accounts = d.accounts.length;
    const p = globalDebit(d);
    expect(p.lines[0].target).toEqual({ kind: 'account', id: ENVELOPES_ID });
    expect(validateImport(d, p, newId)).toMatchObject({ envelopeTransfers: 1, internalTransfers: 0 });
    const mv = d.accountMovements![0];
    expect(mv).toMatchObject({ fromAccountId: MAIN_ACCOUNT_ID, toAccountId: ENVELOPES_ID, amount: 300 });
    expect(mv).not.toHaveProperty('target');
    expect(linkStateOf(mv)).toBe('debit');
    expect(d.accounts).toHaveLength(accounts);
    expect(new Ledger(d, M).bankMonth(MAIN_ACCOUNT_ID, M)!.balance).toBe(700);
    expect(d.transactions).toEqual([]);
    expect(d.months[M].alloc).toEqual({ sante: 50 });
  });

  it('RG25 : « Enveloppes (global) » n’est pas offert depuis le compte d’une enveloppe, ni comme source d’un crédit hors enveloppe', () => {
    const d = budget();
    expect(targetIsValid(d, ENV, 'interne', { kind: 'account', id: ENVELOPES_ID }, M)).toBe(false);
    expect(targetIsValid(d, MAIN_ACCOUNT_ID, 'interne', { kind: 'account', id: ENVELOPES_ID }, M)).toBe(true);
    expect(targetIsValid(d, MAIN_ACCOUNT_ID, 'recu', { kind: 'account', id: ENVELOPES_ID }, M)).toBe(false);
    expect(targetIsValid(d, ENV, 'recu', { kind: 'account', id: ENVELOPES_ID }, M)).toBe(true);
  });

  it('CA23 / RG28 : avec un débit « vers enveloppes », l’allocation pointée du mois n’est plus comptée ; supprimé, elle revient', () => {
    const d = budget();
    expect(checkEnvelope(d, M, 'sante', '2026-10-01')).toBe(true);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M).map(x => x.amount)).toEqual([-50]);
    validateImport(d, globalDebit(d), newId);
    // Le principal n'est débité qu'une fois (le virement global), en estimé comme en réel.
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M).map(x => x.amount)).toEqual([-300]);
    expect(estimatedMovements(d, ENV, M)).toEqual([]);
    expect(realMovements(d, MAIN_ACCOUNT_ID, M).map(x => x.amount)).toEqual([-300]);
    // Un autre mois n'est pas touché.
    checkEnvelope(d, '2026-11', 'sante', '2026-11-01');
    expect(deleteAccountMovement(d, d.accountMovements![0].id)).toBe(true);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M).map(x => x.amount)).toEqual([-50]);
    expect(estimatedMovements(d, ENV, M).map(x => x.amount)).toEqual([50]);
  });

  it('CA24 : un crédit sur le compte d’une enveloppe vient de « Enveloppes (global) » : l’enveloppe est créditée, aucun compte réel débité, allocation inchangée', () => {
    const d = budget();
    const p = checkAll(prepare(d, [credit('2026-10-03', 'ALIMENTATION SANTE', 50, ENV_PAIR)]));
    expect(p.lines[0]).toMatchObject({ nature: 'recu', target: { kind: 'account', id: ENVELOPES_ID }, checked: true });
    expect(validateImport(d, p, newId)).toMatchObject({ internalTransfers: 1, revenues: 0 });
    const mv = d.accountMovements![0];
    expect(mv).toMatchObject({ fromAccountId: ENVELOPES_ID, toAccountId: ENV, amount: 50 });
    expect(mv).not.toHaveProperty('target');
    const ledger = new Ledger(d, M);
    expect(ledger.bankMonth(ENV, M)!.balance).toBe(50);
    expect(ledger.bankMonth(MAIN_ACCOUNT_ID, M)!.balance).toBe(1000);
    expect(d.months[M].alloc).toEqual({ sante: 50 });
    expect(d.transactions).toEqual([]);
  });

  it('CA25 : « Réparti X sur Y » est la somme des crédits individuels du mois sur le débit global, calculé et sans écart bloquant', () => {
    const d = budget();
    validateImport(d, globalDebit(d), newId);
    expect(envelopeSplit(d, M)).toEqual({ sent: 300, distributed: 0 });
    validateImport(d, checkAll(prepare(d, [credit('2026-10-03', 'ALIMENTATION SANTE', 50, ENV_PAIR), credit('2026-10-03', 'ALIMENTATION AUTRE', 200, ENV_PAIR)])), newId);
    expect(envelopeSplit(d, M)).toEqual({ sent: 300, distributed: 250 });
    expect(envelopeSplit(d, '2026-11')).toEqual({ sent: 0, distributed: 0 });
  });

  it('RG26 : un débit « vers enveloppes » n’est jamais proposé comme une moitié de paire', () => {
    const d = budget();
    const p = prepare(d, [debit('2026-10-02', 'VIREMENT LYDIA', 50), credit('2026-10-03', 'ALIMENTATION SANTE', 50, ENV_PAIR)]);
    // Les deux lignes sont de même montant : la paire (principal → enveloppe) est proposée, jamais une paire avec le global.
    const deb = byLabel(p, 'LYDIA');
    expect(deb.target === null || (deb.target.kind === 'account' && deb.target.id !== ENVELOPES_ID)).toBe(true);
    const completed = completionOf(d, { ...byLabel(p, 'ALIMENTATION'), link: undefined });
    expect(completed).toBeNull();
  });

  it('CA27 : mois verrouillé : suppression du débit « vers enveloppes » refusée, les allocations restent écartées', () => {
    const d = budget();
    validateImport(d, globalDebit(d), newId);
    d.months[M].closed = true;
    expect(deleteAccountMovement(d, d.accountMovements![0].id)).toBe(false);
    expect(d.accountMovements).toHaveLength(1);
    expect(sessionSummary(globalDebit(d), { expenses: 0, revenues: 0, withdrawals: 0, internalTransfers: 0, envelopeTransfers: 1 }, new Set()).envelopeTransfers).toBe(1);
  });
});
