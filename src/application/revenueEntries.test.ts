import { describe, expect, it } from 'vitest';
import { addTransaction, deleteTransaction, updateLine } from './actions';
import { archiveBankAccount, setLineAccount } from './bankAccounts';
import { checkLine, uncheckLine } from './checkoff';
import { lineStates } from './importFilters';
import { lineEntriesNote } from '../domain/lineActuals';
import { NEW_REVENUE_LINE, changeNature, lineBalanceWarning, lineProblem, prepareImport, validateImport, type PreviewLine } from './statementImport';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID, defaultBankAccounts, newEnvelopeAccount } from '../domain/bank';
import { availableReal, blockTotals } from '../domain/budget';
import { estimatedMovements, realMovements } from '../domain/bankMovements';
import { accountPointage, monthBalance } from '../domain/checkoff';
import { emptyData } from '../domain/empty';
import { balanceDateWarning, balanceRangeEnd } from '../domain/balanceRange';
import { Ledger } from '../domain/ledger';
import { bankDateOf, carriedAccountRefusal, expenseLineBlocker } from '../domain/lineExpenses';
import { fingerprintOf, type StatementRow } from '../domain/statement';
import type { BlockKey, BudgetData, Line, Transaction } from '../domain/types';

const SEP = '2026-09';
const OCT = '2026-10';
const SWILE = 'acc-swile';
const PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
const ENV_PAIR = ['Compte Vacances (x0001)', 'Banque Test'] as const;
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;
const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

function budget(lines: Line[] = [ln('salaire', 'rev', 2400), ln('edf', 'fix', 62)]): BudgetData {
  const d = emptyData();
  d.firstMonth = SEP;
  d.accounts = [...defaultBankAccounts(SEP), { id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 0, openingMonth: SEP, inBudget: true, archived: false }, newEnvelopeAccount('acc-env-vac', 'vac', 'Vacances', 200, 0, SEP)];
  d.accounts[0].openingBalance = 1000;
  d.envelopes = [{ id: 'vac', name: 'Vacances', hue: 200, cash: 0, accountId: 'acc-env-vac' }];
  for (const m of [SEP, OCT]) d.months[m] = { initialized: true, lines: structuredClone(lines), alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: PAIR[0], connectionName: PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l2', accountName: ENV_PAIR[0], connectionName: ENV_PAIR[1], accountId: 'acc-env-vac' },
  ];
  return d;
}
const rv = (id: string, month: string, day: number, amount: number, target: string, extra: Partial<Transaction> = {}): Transaction => ({ id, month, day, label: id, amount, type: 'rev', target, ...extra });
const credit = (label: string, amount: number, extra: { date?: string; pair?: readonly [string, string]; notes?: string; category?: string } = {}): StatementRow => {
  const pair = extra.pair ?? PAIR;
  return { date: extra.date ?? '2026-09-28', label, notes: extra.notes ?? '', category: extra.category ?? '', accountName: pair[0], connectionName: pair[1], amount, direction: 'credit' };
};
const debit = (label: string, amount: number, date = '2026-10-05'): StatementRow => ({ ...credit(label, amount, { date }), direction: 'debit' });
const prep = (d: BudgetData, rows: StatementRow[]) => prepareImport(d, { rows, errors: [] });
const toRev = (key: string, month = OCT) => (l: PreviewLine): PreviewLine => ({ ...l, month, target: { kind: 'line', key }, checked: true });
const balance = (d: BudgetData, m: string, id = MAIN_ACCOUNT_ID) => new Ledger(d, OCT).bankMonth(id, m)!.balance;

describe('date bancaire (spec 0015, RG1 à RG6)', () => {
  it('CA4 / RG2: sans date bancaire, repli sur le mois et le jour de rattachement', () => {
    expect(bankDateOf({ month: OCT, day: 5 })).toBe('2026-10-05');
    expect(bankDateOf({ month: OCT, day: 5, bankDate: '2026-09-30' })).toBe('2026-09-30');
  });

  it('CA3: une dépense du 30/09 rattachée à octobre pèse sur le solde de septembre et sur le budget d’octobre', () => {
    const d = budget([ln('courses', 'var', 100)]);
    addTransaction(d, { id: 't', month: OCT, day: 1, label: 'x', amount: 30, type: 'var', target: 'courses', bankDate: '2026-09-30' });
    expect(balance(d, SEP)).toBe(970);
    expect(balance(d, OCT)).toBe(970);
    expect(realMovements(d, MAIN_ACCOUNT_ID, OCT)).toEqual([]);
    expect(realMovements(d, MAIN_ACCOUNT_ID, SEP)[0]).toMatchObject({ date: '2026-09-30', attachedMonth: OCT });
    expect(d.months[OCT].lines[0].actual).toBe(30);
    expect(d.months[SEP].lines[0].actual).toBeNull();
  });

  it('RG2: une écriture sans date bancaire se range comme avant', () => {
    const d = budget([ln('courses', 'var', 100)]);
    addTransaction(d, { id: 't', month: OCT, day: 3, label: 'x', amount: 30, type: 'var', target: 'courses' });
    expect(balance(d, SEP)).toBe(1000);
    expect(realMovements(d, MAIN_ACCOUNT_ID, OCT)[0].date).toBe('2026-10-03');
  });

  it('un mouvement entre comptes suit aussi sa date bancaire', () => {
    const d = budget();
    d.accountMovements = [{ id: 'm', month: OCT, day: 2, label: 'Retrait', amount: 40, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID, bankDate: '2026-09-30' }];
    expect(realMovements(d, CASH_ACCOUNT_ID, SEP).map(m => m.amount)).toEqual([40]);
    expect(realMovements(d, CASH_ACCOUNT_ID, OCT)).toEqual([]);
  });
});

describe('entrée sur une ligne de revenu (spec 0015, RG7 à RG16)', () => {
  it('CA1 / CA2: date bancaire en septembre, mois de rattachement octobre, solde de septembre augmenté même mois clos, budget de septembre inchangé', () => {
    const d = budget();
    d.months[SEP].closed = true;
    expect(addTransaction(d, rv('a', OCT, 1, 2480, 'salaire', { bankDate: '2026-09-28' }))).toBe(true);
    expect(d.months[OCT].lines[0].actual).toBe(2480);
    expect(d.months[SEP].lines[0].actual).toBeNull();
    expect(d.transactions[0]).toMatchObject({ accountId: MAIN_ACCOUNT_ID, bankDate: '2026-09-28', month: OCT });
    expect(balance(d, SEP)).toBe(3480);
    expect(blockTotals(d.months[SEP].lines, 'rev').actual).toBe(0);
  });

  it('CA4 (0019) : un revenu pointé « reçu » sans écriture ne change pas le solde réel ; l’entrée importée l’augmente à la date bancaire', () => {
    const d = budget();
    checkLine(d, OCT, 'salaire', '2026-10-02');
    expect(balance(d, OCT)).toBe(1000);
    expect(monthBalance(d, OCT, MAIN_ACCOUNT_ID)!.end).toBe(3400);
    addTransaction(d, rv('a', OCT, 5, 2480, 'salaire', { bankDate: '2026-09-28' }));
    expect(balance(d, SEP)).toBe(3480);
    expect(realMovements(d, MAIN_ACCOUNT_ID, SEP)[0]).toMatchObject({ date: '2026-09-28', amount: 2480 });
  });

  it('CA17 (0019) : une ligne rev et deux entrées rattachées : son réel est leur somme', () => {
    const d = budget();
    addTransaction(d, rv('a', OCT, 5, 2000, 'salaire'));
    addTransaction(d, rv('b', OCT, 6, 480, 'salaire'));
    expect(d.months[OCT].lines[0].actual).toBe(2480);
    expect(balance(d, OCT)).toBe(3480);
  });

  it('CA6 / CA7 (0019) : pointer ou dépointer ne change pas le solde réel ; l’estimé compte la ligne par son pointage (au montant compté), jamais l’entrée', () => {
    const d = budget();
    addTransaction(d, rv('a', OCT, 5, 2480, 'salaire'));
    const real = balance(d, OCT);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, OCT)).toEqual([]);
    checkLine(d, OCT, 'salaire', '2026-10-03');
    expect(balance(d, OCT)).toBe(real);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, OCT).map(m => [m.date, m.amount])).toEqual([['2026-10-03', 2480]]);
    uncheckLine(d, OCT, 'salaire');
    expect(balance(d, OCT)).toBe(real);
    expect(realMovements(d, MAIN_ACCOUNT_ID, OCT).map(m => [m.date, m.amount])).toEqual([['2026-10-05', 2480]]);
  });

  it('CA9: réel et compte non modifiables tant que la ligne est portée ; la dernière suppression remet le réel à vide', () => {
    const d = budget();
    addTransaction(d, rv('a', OCT, 5, 2480, 'salaire'));
    expect(updateLine(d, OCT, 'salaire', { name: 'Paie' })).toBe(true);
    expect(setLineAccount(d, OCT, 'salaire', SWILE)).toBe(false);
    expect(carriedAccountRefusal('rev')).toMatch(/porte des écritures/);
    expect(deleteTransaction(d, 'a')).toBe(true);
    expect(d.months[OCT].lines[0].actual).toBeNull();
    expect(setLineAccount(d, OCT, 'salaire', SWILE)).toBe(true);
  });

  it('plusieurs entrées s’additionnent ; en supprimer une garde la ligne portée', () => {
    const d = budget();
    addTransaction(d, rv('a', OCT, 5, 2000, 'salaire'));
    addTransaction(d, rv('b', OCT, 6, 480, 'salaire'));
    expect(d.months[OCT].lines[0].actual).toBe(2480);
    deleteTransaction(d, 'b');
    expect(d.months[OCT].lines[0].actual).toBe(2000);
    expect(lineEntriesNote(d, OCT, d.months[OCT].lines[0])).toBe('1 écriture, réel = somme des écritures');
  });

  it('CA11: refusée sur une ligne qui n’est pas rev, sur un autre compte, ou un compte archivé', () => {
    const d = budget([ln('salaire', 'rev', 2400), ln('edf', 'fix', 62), ln('cant', 'rev', 10, { accountId: SWILE })]);
    expect(addTransaction(d, rv('a', OCT, 5, 10, 'edf'))).toBe(false);
    expect(addTransaction(d, rv('b', OCT, 5, 10, 'salaire', { accountId: SWILE }))).toBe(false);
    expect(addTransaction(d, { ...rv('c', OCT, 5, 10, 'edf'), type: 'fix' })).toBe(true); // le type fix ne vise pas rev
    expect(addTransaction(d, { ...rv('e', OCT, 5, 10, 'salaire'), type: 'fix' })).toBe(false);
    archiveBankAccount(d, SWILE);
    expect(addTransaction(d, rv('f', OCT, 5, 10, 'cant'))).toBe(false);
    expect(expenseLineBlocker(d, OCT, 'cant')).toMatch(/archivé/);
  });

  it('CA17: mois clos, ajout et suppression refusés ; l’écriture existante garde son effet', () => {
    const d = budget();
    addTransaction(d, rv('a', OCT, 5, 100, 'salaire'));
    d.months[OCT].closed = true;
    expect(addTransaction(d, rv('b', OCT, 6, 5, 'salaire'))).toBe(false);
    expect(deleteTransaction(d, 'a')).toBe(false);
    expect(balance(d, OCT)).toBe(1100);
  });

  it('CA18: le Disponible à placer lit le réel alimenté par l’entrée', () => {
    const d = budget();
    const before = availableReal(d, OCT)!;
    addTransaction(d, rv('a', OCT, 5, 2480, 'salaire'));
    // Le réel (2 480) dépasse le budget (2 400) : l'écart de la ligne du compte principal s'ajoute.
    expect(availableReal(d, OCT)).toBe(before + 80);
  });

  it('CA19 (0019) : l’entrée est réelle seulement ; l’estimé la compte par le pointage de la ligne, une fois', () => {
    const d = budget([ln('salaire', 'rev', 2400), ln('edf', 'fix', 62)]);
    addTransaction(d, rv('a', OCT, 5, 2480, 'salaire', { bankDate: '2026-09-28' }));
    expect(balance(d, SEP)).toBe(3480);
    expect(monthBalance(d, SEP, MAIN_ACCOUNT_ID)!.end).toBe(1000);
    checkLine(d, OCT, 'salaire', '2026-10-02');
    const est = monthBalance(d, OCT, MAIN_ACCOUNT_ID)!.end;
    expect(est).toBe(1000 + 2480);
    uncheckLine(d, OCT, 'salaire');
    expect(monthBalance(d, OCT, MAIN_ACCOUNT_ID)!.end).toBe(1000);
  });

  it('CA20: « Revenus attendus » reste budgétaire : 2 400 € budgétés avec une entrée de 2 480 € comme avec un réel de 2 450 €, ligne pointée sortie', () => {
    const d = budget();
    addTransaction(d, rv('a', OCT, 5, 2480, 'salaire'));
    expect(accountPointage(d, OCT, MAIN_ACCOUNT_ID, '2026-10-10')!.expected).toBe(2400);
    const e = budget();
    e.months[OCT].lines[0].actual = 2450;
    expect(accountPointage(e, OCT, MAIN_ACCOUNT_ID, '2026-10-10')!.expected).toBe(2400); // budgétaire, quel que soit le réel
    checkLine(d, OCT, 'salaire', '2026-10-06');
    expect(accountPointage(d, OCT, MAIN_ACCOUNT_ID, '2026-10-10')!.expected).toBe(0);
  });

  it('une entrée n’est jamais additionnée comme une dépense (var restant, enveloppes)', () => {
    const d = budget([ln('salaire', 'rev', 2400), ln('courses', 'var', 100)]);
    addTransaction(d, rv('a', OCT, 5, 500, 'salaire'));
    expect(d.months[OCT].lines[1].actual).toBeNull();
    expect(new Ledger(d, OCT).envMonth('vac', OCT)!.spent).toBe(0);
  });
});

describe('import des entrées d’argent (spec 0015)', () => {
  it('CA13: le sens entre dans l’empreinte des crédits, pas dans celle des débits', () => {
    const c = { ...credit('VIREMENT X', 50), direction: 'credit' as const };
    const dr = { ...c, direction: 'debit' as const };
    expect(fingerprintOf(c)).not.toBe(fingerprintOf(dr));
    expect(fingerprintOf(dr)).toBe('2026-09-28|50.00|virement x');
    expect(fingerprintOf({ date: '2026-09-28', amount: 50, label: 'VIREMENT X', notes: '' })).toBe(fingerprintOf(dr));
  });

  it('CA1 / CA10 import: une entrée rattachée à une ligne rev garde sa date bancaire ; la nouvelle ligne est créée dans le mois seulement', () => {
    const d = budget();
    const before = structuredClone(d.template);
    const p = prep(d, [credit('VIREMENT SALAIRE ACME', 2480), credit('REMBOURSEMENT MUTUELLE', 42.1, { date: '2026-10-12' })]);
    const lines = p.lines.map(l => (l.row.label.startsWith('VIREMENT') ? toRev('salaire')(l) : { ...toRev(NEW_REVENUE_LINE)(l), newLineName: 'Remb. mutuelle' }));
    // « VIREMENT » évoque un virement : proposée « Revenu » avec l'indice « virement possible » (RG18), cochable une fois la ligne choisie.
    expect(p.lines[0]).toMatchObject({ nature: 'revenu', receivedHint: true });
    const batch = validateImport(d, { ...p, lines }, newId);
    expect(batch).toMatchObject({ revenues: 2, expenses: 0 });
    expect(d.transactions.find(t => t.target === 'salaire')).toMatchObject({ type: 'rev', month: OCT, bankDate: '2026-09-28', amount: 2480, importAccountId: MAIN_ACCOUNT_ID });
    const created = d.months[OCT].lines.find(l => l.name === 'Remb. mutuelle')!;
    expect(created).toMatchObject({ block: 'rev', budget: 0, actual: 42.1, accountId: MAIN_ACCOUNT_ID });
    expect(d.months[SEP].lines.some(l => l.name === 'Remb. mutuelle')).toBe(false);
    expect(d.template).toEqual(before);
    expect(d.months[OCT].lines.find(l => l.key === 'salaire')!.actual).toBe(2480);
  });

  it('une nouvelle ligne sans nom prend le libellé de la ligne importée', () => {
    const d = budget();
    const p = prep(d, [credit('REMBOURSEMENT MUTUELLE', 42.1)]);
    validateImport(d, { ...p, lines: p.lines.map(toRev(NEW_REVENUE_LINE)) }, newId);
    expect(d.months[OCT].lines.some(l => l.name === 'REMBOURSEMENT MUTUELLE' && l.block === 'rev')).toBe(true);
  });

  it('CA11: aucune ligne rev d’un autre compte, ni pour un compte d’enveloppe ; entrée sans cible non importable (CA12)', () => {
    const d = budget([ln('salaire', 'rev', 2400), ln('cant', 'rev', 10, { accountId: SWILE })]);
    const l = prep(d, [credit('REMBOURSEMENT', 5)]).lines[0];
    expect(lineProblem(d, l)).toBe('À rattacher');
    expect(lineProblem(d, toRev('salaire')(l))).toBeNull();
    expect(lineProblem(d, toRev('cant')(l))).toBe('À rattacher');
    expect(lineProblem(d, toRev(NEW_REVENUE_LINE)(l))).toBeNull();
    const env = prep(d, [credit('REMBOURSEMENT', 5, { pair: ENV_PAIR })]).lines[0];
    // Une entrée sur le compte d'une enveloppe est proposée « Virement interne » depuis « Enveloppes (global) » (spec 0016, RG27) ; en « Revenu », aucune ligne ne convient.
    expect(env).toMatchObject({ nature: 'recu', target: { kind: 'account', id: 'enveloppes' } });
    expect(lineProblem(d, { ...toRev('salaire')(env), nature: 'revenu' })).toBe('À rattacher');
    expect(lineProblem(d, { ...toRev(NEW_REVENUE_LINE)(env), nature: 'revenu' })).toBe('À rattacher');
    const none = validateImport(d, { ...prep(d, [credit('REMBOURSEMENT', 5)]) }, newId);
    expect(none.revenues).toBe(0);
  });

  it('CA20 (0019) : plus de « Réel saisi à remplacer » ; les entrées importées additionnent leur montant dans le réel de la ligne', () => {
    const d = budget();
    const p0 = prep(d, [credit('REMBOURSEMENT A', 5), credit('REMBOURSEMENT B', 7)]);
    const p = { ...p0, lines: p0.lines.map(toRev('salaire')) };
    expect(lineStates(d, p.lines[0])).not.toContain('reel_remplace');
    const done = validateImport(d, p, newId);
    expect(done.revenues).toBe(2);
    expect(d.months[OCT].lines[0].actual).toBe(12);
  });

  it('CA14: réimport, les entrées déjà importées sont des doublons décochés', () => {
    const d = budget();
    const rows = [credit('REMBOURSEMENT A', 5)];
    const p = prep(d, rows);
    validateImport(d, { ...p, lines: p.lines.map(toRev('salaire')) }, newId);
    expect(prep(d, rows).lines[0]).toMatchObject({ duplicate: true, checked: false });
    // Un débit de même date, montant et libellé n'est pas ce doublon.
    expect(prep(d, [debit('REMBOURSEMENT A', 5, '2026-09-28')]).lines[0].duplicate).toBe(false);
  });

  it('CA15: une règle « Revenu » préremplit nature et ligne ; ignorée si la ligne manque du mois ou est d’un autre compte ; jamais vers une nouvelle ligne', () => {
    const d = budget([ln('salaire', 'rev', 2400), ln('cant', 'rev', 10, { accountId: SWILE })]);
    d.importRules = [{ id: 'r', pattern: 'acme', nature: 'revenu', target: { kind: 'line', key: 'salaire' } }];
    expect(prep(d, [credit('PAIE ACME', 100)]).lines[0]).toMatchObject({ nature: 'revenu', target: { kind: 'line', key: 'salaire' }, checked: true });
    expect(prep(d, [credit('PAIE ACME', 100, { date: '2026-11-03' })]).lines[0]).toMatchObject({ target: null, checked: false });
    d.importRules = [{ id: 'r', pattern: 'acme', nature: 'revenu', target: { kind: 'line', key: 'cant' } }];
    expect(prep(d, [credit('PAIE ACME', 100)]).lines[0].target).toBeNull();
    d.importRules = [{ id: 'r', pattern: 'acme', nature: 'revenu', target: { kind: 'line', key: NEW_REVENUE_LINE } }];
    expect(prep(d, [credit('PAIE ACME', 100)]).lines[0].target).toBeNull();
    // Une règle « Revenu » ne s'applique pas à un débit.
    d.importRules = [{ id: 'r', pattern: 'acme', nature: 'revenu', target: { kind: 'line', key: 'salaire' } }];
    expect(prep(d, [debit('PRLV ACME', 10)]).lines[0].nature).toBe('depense');
  });

  it('CA17 import: la règle « Mémoriser » vers une ligne rev est enregistrée, pas vers une nouvelle ligne', () => {
    const d = budget();
    const p = prep(d, [credit('PAIE ACME', 100), credit('PRIME', 10, { date: '2026-09-29' })]);
    const lines = p.lines.map(l => ({ ...toRev(l.row.label === 'PRIME' ? NEW_REVENUE_LINE : 'salaire')(l), remember: l.row.label.toLowerCase() }));
    validateImport(d, { ...p, lines }, newId);
    expect(d.importRules?.map(r => [r.pattern, r.nature])).toEqual([['paie acme', 'revenu']]);
  });

  it('CA16 (amendé par la 0016) : un virement reçu est un « Virement interne » importable (compte source choisi) ; requalifié « Revenu » et rattaché, il devient un revenu', () => {
    const d = budget();
    const p = prep(d, [credit('VIREMENT EN VOTRE FAVEUR', 100)]);
    expect(p.lines[0]).toMatchObject({ nature: 'revenu', receivedHint: true });
    const recu = changeNature(d, p.lines[0], 'recu');
    expect(recu).toMatchObject({ nature: 'recu', checked: false, target: null });
    // Sans compte source, la ligne est incomplète ; avec un compte source et cochée, elle écrit un mouvement entre comptes, jamais un revenu.
    expect(lineProblem(d, recu)).toBe('Choisir le compte source');
    const ready = { ...recu, target: { kind: 'account', id: SWILE } as const, checked: true };
    expect(lineProblem(d, ready)).toBeNull();
    const batch = validateImport(d, { ...p, lines: [ready] }, newId);
    expect(batch).toMatchObject({ revenues: 0, internalTransfers: 1 });
    expect(d.transactions).toEqual([]);
    expect(d.accountMovements).toHaveLength(1);
    // Sur un budget neuf (la ligne du fichier n'est pas encore importée), la même entrée requalifiée « Revenu » est un revenu.
    const fresh = budget();
    const l = changeNature(fresh, recu, 'revenu');
    expect(validateImport(fresh, { ...p, lines: [toRev('salaire')(l)] }, newId).revenues).toBe(1);
  });

  it('un débit ne devient jamais « Revenu », une entrée jamais « Dépense »', () => {
    const d = budget();
    const dr = prep(d, [debit('ACHAT', 5)]).lines[0];
    expect(changeNature(d, dr, 'revenu')).toBe(dr);
    const cr = prep(d, [credit('REMBOURSEMENT', 5)]).lines[0];
    expect(changeNature(d, cr, 'depense')).toBe(cr);
  });

  it('les dépenses importées portent aussi la date bancaire', () => {
    const d = budget([ln('courses', 'var', 100)]);
    const p = prep(d, [debit('ACHAT', 5, '2026-09-30')]);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...l, month: OCT, target: { kind: 'var', key: 'courses' } as const })) }, newId);
    expect(d.transactions[0]).toMatchObject({ month: OCT, bankDate: '2026-09-30' });
  });
});

describe('date hors soldes (spec 0015, RG6)', () => {
  /** Budget starting in September 2026; the main account opens in September, Swile in October. */
  function ranged() {
    const d = budget();
    d.accounts.find(a => a.id === SWILE)!.openingMonth = OCT;
    return d;
  }

  it('avertit pour une date avant le premier mois, avant l’ouverture du compte, ou dans une année clôturée avec report ajusté ; pas dans la plage', () => {
    const d = ranged();
    expect(balanceDateWarning(d, MAIN_ACCOUNT_ID, '2026-08-31')).toMatch(/premier mois/);
    expect(balanceDateWarning(d, SWILE, '2026-09-15')).toMatch(/ouverture du compte/);
    expect(balanceDateWarning(d, MAIN_ACCOUNT_ID, '2026-09-01')).toBeNull();
    expect(balanceDateWarning(d, SWILE, '2026-10-01')).toBeNull();
    d.closes[2026] = { closed: true, overrides: {} };
    expect(balanceDateWarning(d, MAIN_ACCOUNT_ID, '2026-10-05')).toBeNull(); // clôturée sans report ajusté : l'écriture se reporte
    d.closes[2026].overrides[`bank:${MAIN_ACCOUNT_ID}`] = 500;
    expect(balanceDateWarning(d, MAIN_ACCOUNT_ID, '2026-10-05')).toMatch(/clôturée/);
    expect(balanceDateWarning(d, SWILE, '2026-10-05')).toBeNull();
  });

  it('l’avertissement suit exactement les soldes : une écriture avertie n’y paraît pas, une écriture sans alerte y paraît', () => {
    const d = budget([ln('courses', 'var', 100)]);
    d.firstMonth = OCT;
    delete d.months[SEP];
    for (const [date, warned] of [['2026-09-20', true], ['2026-10-02', false]] as const) {
      const e = structuredClone(d);
      addTransaction(e, { id: 't', month: OCT, day: 2, label: 'x', amount: 10, type: 'var', target: 'courses', bankDate: date });
      expect(balanceDateWarning(e, MAIN_ACCOUNT_ID, date) !== null).toBe(warned);
      const seen = new Ledger(e, OCT).bankMonth(MAIN_ACCOUNT_ID, OCT)!.balance !== 1000;
      expect(seen).toBe(!warned);
    }
  });

  it('dans l’aperçu : état « Date hors soldes », non bloquant ; le lot compte les lignes importées hors soldes', () => {
    const d = ranged();
    d.firstMonth = OCT;
    const rows = [debit('ACHAT', 5, '2026-09-30'), debit('AUTRE', 7, '2026-10-05')];
    const p = prep(d, rows);
    const lines = p.lines.map(l => ({ ...l, month: OCT, target: { kind: 'var', key: 'courses' } as const }));
    d.months[OCT].lines.push(ln('courses', 'var', 100));
    const [first, second] = lines;
    expect(lineStates(d, first)).toContain('date_hors_soldes');
    expect(lineStates(d, second)).not.toContain('date_hors_soldes');
    expect(lineBalanceWarning(d, first)).toMatch(/premier mois/);
    expect(lineProblem(d, first)).toBeNull();
    const batch = validateImport(d, { ...p, lines }, newId);
    expect(batch).toMatchObject({ expenses: 2, outsideBalances: 1 });
  });

  it('une écriture saisie hors import (sans date bancaire) reste dans la plage de son mois ouvert', () => {
    const d = budget([ln('courses', 'var', 100)]);
    addTransaction(d, { id: 't', month: OCT, day: 3, label: 'x', amount: 10, type: 'var', target: 'courses' });
    expect(balanceDateWarning(d, MAIN_ACCOUNT_ID, bankDateOf(d.transactions[0]))).toBeNull();
  });

  it('SUGGESTION 1: un crédit et un débit de même montant le même jour ne se signalent pas comme semblables', () => {
    const d = budget([ln('courses', 'var', 100)]);
    const first = prep(d, [debit('ACHAT', 50, '2026-10-05')]);
    validateImport(d, { ...first, lines: first.lines.map(l => ({ ...l, target: { kind: 'var', key: 'courses' } as const })) }, newId);
    const other = prep(d, [credit('REMBOURSEMENT', 50, { date: '2026-10-05' })]).lines[0];
    expect(d.transactions).toHaveLength(1);
    expect(other.similarImported).toBeNull();
    expect(prep(d, [debit('AUTRE LIBELLE', 50, '2026-10-05')]).lines[0].similarImported).toBe('semblable');
    const manual = budget([ln('courses', 'var', 100)]);
    manual.transactions.push({ id: 'm', month: OCT, day: 5, label: 'à la main', amount: 50, type: 'var', target: 'courses', accountId: MAIN_ACCOUNT_ID });
    expect(prep(manual, [credit('REMBOURSEMENT', 50, { date: '2026-10-05' })]).lines[0].similarManual).toBe(false);
    expect(prep(manual, [debit('ACHAT', 50, '2026-10-05')]).lines[0].similarManual).toBe(true);
  });
});

describe('date après la fin de la plage des soldes (spec 0015, RG6a)', () => {
  it('avertit au-delà de la plage du Ledger et reste muet jusqu’à sa fin', () => {
    const d = budget();
    const end = balanceRangeEnd(d, SEP)!;
    expect(end).toBe('2026-12');
    expect(balanceDateWarning(d, MAIN_ACCOUNT_ID, '2026-12-31', SEP)).toBeNull();
    expect(balanceDateWarning(d, MAIN_ACCOUNT_ID, '2027-01-01', SEP)).toMatch(/après la fin de la plage/);
    expect(new Ledger(d, SEP).months.at(-1)).toBe(end); // même borne que le calcul des soldes
  });
});
