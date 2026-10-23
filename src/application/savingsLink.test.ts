import { describe, expect, it } from 'vitest';
import { addTransfer } from './accountMovements';
import { addTransaction, applyTemplate, createFirstMonth, duplicatePrevious, saveAsTemplate, setStatement } from './actions';
import { addBankAccount, archiveBankAccount, setBankAccountInBudget, setBankAccountOpening, setLineAccount, setLineLinkedAccount, setTransactionAccount } from './bankAccounts';
import { emptyDraft, type SetupRow } from './setup';
import { availableReal, estimatedBalance, estimatedBalanceTotal, monthSummary } from '../domain/budget';
import { defaultBankAccounts, MAIN_ACCOUNT_ID } from '../domain/bank';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import type { BlockKey, BudgetData, Line } from '../domain/types';

/*
 * Spec 0007: a savings/investment line tied to a dedicated bank account.
 * Livret A (1 000 € at the start) and PEA are bank accounts; « Livret A » and « PEA » are lines.
 */

const TODAY = '2027-01';
const M = '2027-01';
const LIVRET = 'acc-livret';
const PEA = 'acc-pea';

const line = (key: string, block: BlockKey, budget: number, actual: number | null, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual, ...extra });

function started(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 5000;
  addBankAccount(d, LIVRET, 'Livret A', 'epargne');
  addBankAccount(d, PEA, 'PEA', 'invest');
  d.accounts.find(a => a.id === LIVRET)!.openingBalance = 1000;
  d.months[M] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  d.template.lines = lines.map(({ actual: _a, ...l }) => l);
  // Since spec 0019 the actual of a savings line is the sum of the transfers attached to it (RG16): a line given with an actual and a dedicated
  // account gets the matching transfer, on the 1st. Without a dedicated account no transfer is possible, the actual moves no balance.
  d.accountMovements = lines
    .filter(l => (l.block === 'epa' || l.block === 'inv') && l.actual && l.linkedAccountId)
    .map(l => ({ id: `auto-${l.key}`, month: M, day: 1, label: l.name, amount: l.actual!, fromAccountId: l.accountId ?? MAIN_ACCOUNT_ID, toAccountId: l.linkedAccountId!, target: { kind: 'line' as const, key: l.key } }));
  return d;
}

const bal = (d: BudgetData, id: string, m = M) => new Ledger(d, TODAY).bankMonth(id, m)?.balance;
const est = (d: BudgetData, key: string, m = M) => {
  const l = d.months[m].lines.find(x => x.key === key)!;
  return estimatedBalance(d, new Ledger(d, TODAY), m, l)?.value ?? null;
};
const tx = (target: string, amount: number, accountId?: string, month = M) => ({ id: 't' + Math.random(), month, day: 5, label: 'sortie', amount, type: 'epa' as const, target, accountId });

describe('soldes des comptes bancaires avec un compte dédié', () => {
  it('CA1: le versement crédite le dédié et débite la source une seule fois', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    expect(bal(d, LIVRET)).toBe(1200);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(4800);
  });

  it('CA2: sans lien, le compte bancaire ne bouge pas', () => {
    const d = started([line('livret', 'epa', 200, 200)]);
    expect(bal(d, LIVRET)).toBe(1000);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(5000);
  });

  it('CA3: un investissement lié crédite le compte dédié', () => {
    const d = started([line('pea', 'inv', 300, 300, { linkedAccountId: PEA })]);
    expect(bal(d, PEA)).toBe(300);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(4700);
  });

  it('CA4: une sortie d’épargne sort du dédié et entre sur le compte choisi', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    expect(addTransaction(d, tx('livret', 150, MAIN_ACCOUNT_ID))).toBe(true);
    expect(bal(d, LIVRET)).toBe(1050);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(4950);
  });

  it('CA5: sans réel, rien n’est ajouté au dédié', () => {
    const d = started([line('livret', 'epa', 200, null, { linkedAccountId: LIVRET })]);
    expect(bal(d, LIVRET)).toBe(1000);
    expect(bal(d, MAIN_ACCOUNT_ID)).toBe(5000);
  });

  it('CA7: deux lignes liées au même dédié s’additionnent', () => {
    const d = started([line('a', 'epa', 100, 100, { linkedAccountId: LIVRET }), line('b', 'epa', 50, 50, { linkedAccountId: LIVRET })]);
    expect(bal(d, LIVRET)).toBe(1150);
  });

  it('CA8 (0019): retirer le lien ne défait pas les transferts réels déjà enregistrés; la ligne ne change pas', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    expect(setLineLinkedAccount(d, M, 'livret', undefined)).toBe(true);
    expect(bal(d, LIVRET)).toBe(1200);
    expect(d.months[M].lines[0]).toMatchObject({ budget: 200, actual: 200 });
    expect('linkedAccountId' in d.months[M].lines[0]).toBe(false);
  });

  it('CA8: lien retiré en M seulement : M+1 garde le sien, le modèle le perd', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    d.months['2027-02'] = { initialized: true, lines: [line('livret', 'epa', 200, 100, { linkedAccountId: LIVRET })], alloc: {}, transfersDone: {} };
    setLineLinkedAccount(d, M, 'livret', LIVRET); // also puts the link in the model
    expect(setLineLinkedAccount(d, M, 'livret', undefined)).toBe(true);
    expect('linkedAccountId' in d.template.lines[0]).toBe(false);
    expect(d.months['2027-02'].lines[0].linkedAccountId).toBe(LIVRET);
    const ledger = new Ledger(d, '2027-02');
    expect(ledger.bankMonth(LIVRET, M)?.balance).toBe(1200);
    expect(ledger.bankMonth(LIVRET, '2027-02')?.balance).toBe(1200); // février n'a aucun transfert : le réel saisi à la main ne compte plus
  });

  it('CA9: un transfert antérieur au mois de départ du dédié ne compte pas', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    setBankAccountOpening(d, LIVRET, { month: '2027-02' });
    d.months['2027-02'] = { initialized: true, lines: [line('livret', 'epa', 200, 100, { linkedAccountId: LIVRET })], alloc: {}, transfersDone: {} };
    const ledger = new Ledger(d, '2027-02');
    expect(ledger.bankMonth(LIVRET, M)).toBeNull();
    expect(ledger.bankMonth(LIVRET, '2027-02')?.balance).toBe(1000);
  });

  it('CA13: un relevé saisi sur la ligne ne modifie pas le dédié', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    setStatement(d, M, 'livret', 9999);
    expect(bal(d, LIVRET)).toBe(1200);
  });
});

describe('refus du lien (RG2, RG7)', () => {
  it('CA6: la source ne peut pas être le dédié', () => {
    const d = started([line('livret', 'epa', 200, 200, { accountId: LIVRET })]);
    expect(setLineLinkedAccount(d, M, 'livret', LIVRET)).toBe(false);
    expect(d.months[M].lines[0].linkedAccountId).toBeUndefined();
  });

  it('CA6: le compte principal par défaut (source implicite) est refusé aussi', () => {
    const d = started([line('livret', 'epa', 200, 200)]);
    expect(setLineLinkedAccount(d, M, 'livret', MAIN_ACCOUNT_ID)).toBe(false);
  });

  it('CA6: on ne peut pas non plus prendre le dédié comme source', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    expect(setLineAccount(d, M, 'livret', LIVRET)).toBe(false);
  });

  it('CA6: une sortie créditée au dédié est refusée', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    expect(addTransaction(d, tx('livret', 50, LIVRET))).toBe(false);
    expect(d.transactions).toHaveLength(0);
    addTransaction(d, tx('livret', 50, MAIN_ACCOUNT_ID));
    const id = d.transactions[0].id;
    expect(setTransactionAccount(d, id, LIVRET)).toBe(false);
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
  });

  it('refuse un compte inconnu, archivé ou une ligne qui n’est pas epa/inv', () => {
    const d = started([line('livret', 'epa', 200, 200), line('loyer', 'fix', 500, null)]);
    expect(setLineLinkedAccount(d, M, 'livret', 'inconnu')).toBe(false);
    expect(setLineLinkedAccount(d, M, 'loyer', LIVRET)).toBe(false);
    archiveBankAccount(d, LIVRET);
    expect(setLineLinkedAccount(d, M, 'livret', LIVRET)).toBe(false);
  });

  it('un dédié archivé garde son lien et ses soldes', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    archiveBankAccount(d, LIVRET);
    expect(d.months[M].lines[0].linkedAccountId).toBe(LIVRET);
    expect(bal(d, LIVRET)).toBe(1200);
  });

  it('CA12: refusé sur un mois verrouillé', () => {
    const d = started([line('livret', 'epa', 200, 200)]);
    d.months[M].closed = true;
    expect(setLineLinkedAccount(d, M, 'livret', LIVRET)).toBe(false);
    expect(d.months[M].lines[0].linkedAccountId).toBeUndefined();
  });
});

describe('le lien suit le modèle et les copies de mois (RG4)', () => {
  it('l’action met à jour le mois et le modèle', () => {
    const d = started([line('livret', 'epa', 200, 200)]);
    setLineLinkedAccount(d, M, 'livret', LIVRET);
    expect(d.template.lines[0].linkedAccountId).toBe(LIVRET);
  });

  it('CA11: « Appliquer le modèle » et « Dupliquer » gardent le lien', () => {
    const d = started([line('livret', 'epa', 200, 200)]);
    setLineLinkedAccount(d, M, 'livret', LIVRET);
    expect(applyTemplate(d, '2027-02')).toBe(true);
    expect(d.months['2027-02'].lines[0].linkedAccountId).toBe(LIVRET);
  });

  it('CA11: « Dupliquer » recopie le lien', () => {
    const d = started([line('livret', 'epa', 200, 200, { linkedAccountId: LIVRET })]);
    expect(duplicatePrevious(d, '2027-02')).toBe(true);
    expect(d.months['2027-02'].lines[0].linkedAccountId).toBe(LIVRET);
    saveAsTemplate(d, '2027-02');
    expect(d.template.lines[0].linkedAccountId).toBe(LIVRET);
  });
});

describe('hors budget (RG11, CA10)', () => {
  it('un dédié hors budget ne change ni le Reste à placer, ni le disponible, ni le taux d’épargne', () => {
    const lines = () => [line('salaire', 'rev', 3000, 3000), line('livret', 'epa', 200, 200)];
    const plain = started(lines());
    const linked = started(lines());
    setLineLinkedAccount(linked, M, 'livret', LIVRET);
    setBankAccountInBudget(linked, LIVRET, false);
    const sum = (d: BudgetData) => monthSummary(d, new Ledger(d, TODAY), M);
    expect(sum(linked).remaining).toBe(sum(plain).remaining);
    expect(sum(linked).savingsRate).toBe(sum(plain).savingsRate);
    expect(availableReal(linked, M)).toBe(availableReal(plain, M));
  });
});

describe('solde estimé (RG20 à RG24)', () => {
  it('CA18: le budget en attente du réel, puis le réel le remplace', () => {
    const d = started([line('livret', 'epa', 200, null, { linkedAccountId: LIVRET })]);
    expect(est(d, 'livret')).toBe(1200);
    // Le réel est la somme des transferts rattachés (spec 0019, RG16) : il remplace le budget du mois.
    expect(addTransfer(d, { id: 'v', month: M, day: 4, label: 'Versement', amount: 150, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: LIVRET, target: { kind: 'line', key: 'livret' } })).toBe(true);
    expect(d.months[M].lines[0].actual).toBe(150);
    expect(est(d, 'livret')).toBe(1150);
  });

  it('CA19: une sortie du mois fait baisser le solde estimé', () => {
    const d = started([line('livret', 'epa', 200, null, { linkedAccountId: LIVRET })]);
    addTransaction(d, tx('livret', 100, MAIN_ACCOUNT_ID));
    expect(est(d, 'livret')).toBe(1100);
  });

  it('CA20: deux lignes liées au même compte affichent le même solde, qui inclut les deux', () => {
    const d = started([line('a', 'epa', 200, null, { linkedAccountId: LIVRET }), line('b', 'epa', 100, null, { linkedAccountId: LIVRET })]);
    expect(est(d, 'a')).toBe(1300);
    expect(est(d, 'b')).toBe(1300);
    expect(estimatedBalanceTotal(d, new Ledger(d, TODAY), M, 'epa')).toBe(1300);
  });

  it('CA21: sans dédié, solde de la ligne : début + budget', () => {
    const d = started([line('pel', 'epa', 50, null)]);
    d.statements['2026-12'] = { pel: 3350 };
    expect(est(d, 'pel')).toBe(3400);
  });

  it('sans dédié, le relevé du mois est pris tel quel', () => {
    const d = started([line('pel', 'epa', 50, null)]);
    d.statements['2026-12'] = { pel: 3350 };
    setStatement(d, M, 'pel', 3500);
    expect(est(d, 'pel')).toBe(3500);
  });

  it('CA22: dédié non ouvert à ce mois, mois non initialisé : pas de solde', () => {
    const d = started([line('livret', 'epa', 200, null, { linkedAccountId: LIVRET })]);
    setBankAccountOpening(d, LIVRET, { month: '2027-02' });
    expect(est(d, 'livret')).toBeNull();
    const ledger = new Ledger(d, TODAY);
    expect(estimatedBalance(d, ledger, '2027-02', line('x', 'epa', 1, null))).toBeNull();
  });

  it('le total du pied de bloc compte une fois le dédié partagé et une fois chaque ligne sans dédié', () => {
    const d = started([
      line('a', 'epa', 200, null, { linkedAccountId: LIVRET }),
      line('b', 'epa', 100, null, { linkedAccountId: LIVRET }),
      line('pel', 'epa', 50, null),
    ]);
    d.statements['2026-12'] = { pel: 3350 };
    expect(estimatedBalanceTotal(d, new Ledger(d, TODAY), M, 'epa')).toBe(1300 + 3400);
  });
});

describe('assistant Démarrage (RG16)', () => {
  const row = (id: string, extra: Partial<SetupRow> = {}): SetupRow => ({ id, name: id, amount: 100, balance: 0, cash: 0, ...extra });

  it('le brouillon crée des lignes liées, et ignore un dédié égal au compte principal', () => {
    const d = emptyData();
    const draft = emptyDraft('2027-01');
    draft.rows.acc.push(row('livret-acc', { name: 'Livret A', hue: 150, inBudget: true, accountKind: 'epargne' }), row('pea-acc', { name: 'PEA', hue: 100, inBudget: true, accountKind: 'invest' }));
    draft.rows.epa = [row('e1', { kind: 'LT', linkedAccountId: 'livret-acc' }), row('e2', { kind: 'LT', linkedAccountId: MAIN_ACCOUNT_ID }), row('e3', { kind: 'LT' })];
    draft.rows.inv = [row('i1', { linkedAccountId: 'pea-acc' }), row('i2', { linkedAccountId: 'livret-acc' })];
    expect(createFirstMonth(d, draft, '2027-01')).toBe(true);
    const lines = d.months['2027-01'].lines;
    expect(lines.find(l => l.key === 'e1')?.linkedAccountId).toBe('livret-acc');
    // A row with no valid dedicated account gets an account of its own, of the kind of its block.
    expect(lines.find(l => l.key === 'e2')?.linkedAccountId).toBe('acc-sav-e2');
    expect(lines.find(l => l.key === 'e3')?.linkedAccountId).toBe('acc-sav-e3');
    expect(lines.find(l => l.key === 'i1')?.linkedAccountId).toBe('pea-acc');
    // RG7 (spec 0010): an investment line cannot be tied to an « épargne » account.
    expect(lines.find(l => l.key === 'i2')?.linkedAccountId).toBe('acc-sav-i2');
    expect(d.template.lines.find(l => l.key === 'e1')?.linkedAccountId).toBe('livret-acc');
  });

  it('crée un compte épargne ou investissement pour chaque ligne sans dédié, au solde saisi', () => {
    const d = emptyData();
    const draft = emptyDraft('2027-01');
    draft.rows.epa = [row('e1', { name: 'Livret A', kind: 'LT', balance: 900 })];
    draft.rows.inv = [row('i1', { name: 'PEA', balance: 300 })];
    expect(createFirstMonth(d, draft, '2027-01')).toBe(true);
    const acc = (id: string) => d.accounts.find(a => a.id === id)!;
    expect([acc('acc-sav-e1').kind, acc('acc-sav-e1').name, acc('acc-sav-e1').openingBalance, acc('acc-sav-e1').openingMonth]).toEqual(['epargne', 'Livret A', 900, '2027-01']);
    expect([acc('acc-sav-i1').kind, acc('acc-sav-i1').name, acc('acc-sav-i1').openingBalance]).toEqual(['invest', 'PEA', 300]);
    expect(d.template.lines.find(l => l.key === 'e1')?.linkedAccountId).toBe('acc-sav-e1');
    expect(d.months['2027-01'].lines.find(l => l.key === 'i1')?.linkedAccountId).toBe('acc-sav-i1');
  });
});

describe('solde estimé cumulé sur les mois (RG20 à RG22ter)', () => {
  const NOV = '2026-11';
  const DEC = '2026-12';
  const JAN = '2027-01';
  const month = (lines: Line[]) => ({ initialized: true, lines, alloc: {}, transfersDone: {} });
  const linked = (budget: number, actual: number | null, extra: Partial<Line> = {}) => line('livret', 'epa', budget, actual, { linkedAccountId: LIVRET, ...extra });

  /** Livret A open since November (1 000 €), main account open since November too. */
  function twoMonths(nov: Line[], dec: Line[]): BudgetData {
    const d = emptyData();
    d.firstMonth = NOV;
    d.accounts = defaultBankAccounts(NOV);
    addBankAccount(d, LIVRET, 'Livret A', 'epargne');
    d.accounts.find(a => a.id === LIVRET)!.openingBalance = 1000;
    d.months[NOV] = month(nov);
    d.months[DEC] = month(dec);
    // A line given with an actual and a dedicated account gets the matching transfer (spec 0019, RG16).
    d.accountMovements = [[NOV, nov] as const, [DEC, dec] as const].flatMap(([m, ls]) =>
      ls.filter(l => l.actual && l.linkedAccountId).map(l => ({ id: `auto-${m}-${l.key}`, month: m, day: 1, label: l.name, amount: l.actual!, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: l.linkedAccountId!, target: { kind: 'line' as const, key: l.key } })));
    return d;
  }
  const at = (d: BudgetData, m: string, key = 'livret') => {
    const l = d.months[m].lines.find(x => x.key === key)!;
    return estimatedBalance(d, new Ledger(d, DEC), m, l)?.value ?? null;
  };

  it('CA18bis: deux mois sans réel : 1 200 € puis 1 400 €', () => {
    const d = twoMonths([linked(200, null)], [linked(200, null)]);
    expect(at(d, NOV)).toBe(1200);
    expect(at(d, DEC)).toBe(1400);
  });

  it('CA18ter: le réel d’un mois remplace son budget, dans un sens ou dans l’autre', () => {
    expect(at(twoMonths([linked(200, 150)], [linked(200, null)]), DEC)).toBe(1350);
    expect(at(twoMonths([linked(200, null)], [linked(200, 200)]), DEC)).toBe(1400);
  });

  it('CA18quater: le solde réel du dédié et le disponible ne changent pas', () => {
    const d = twoMonths([linked(200, null)], [linked(200, null)]);
    expect(bal(d, LIVRET, DEC)).toBe(1000);
    const plain = twoMonths([line('livret', 'epa', 200, null)], [line('livret', 'epa', 200, null)]);
    expect(availableReal(d, DEC)).toBe(availableReal(plain, DEC));
  });

  it('CA18quinquies: un mois passé non initialisé compte 0', () => {
    const d = twoMonths([linked(200, null)], [linked(200, null)]);
    d.months['2027-01'] = month([linked(200, null)]);
    d.months[DEC].initialized = false;
    expect(estimatedBalance(d, new Ledger(d, JAN), JAN, d.months[JAN].lines[0])?.value).toBe(1400);
  });

  it('CA19: une sortie d’un mois passé fait baisser le solde estimé', () => {
    const d = twoMonths([linked(200, null)], [linked(200, null)]);
    addTransaction(d, tx('livret', 100, MAIN_ACCOUNT_ID, NOV));
    expect(at(d, DEC)).toBe(1300);
  });

  it('CA20: deux lignes liées au même compte, sur deux mois : même chiffre, 300 € par mois', () => {
    const two = () => [linked(200, null), line('b', 'epa', 100, null, { linkedAccountId: LIVRET })];
    const d = twoMonths(two(), two());
    expect(at(d, DEC, 'livret')).toBe(1600);
    expect(at(d, DEC, 'b')).toBe(1600);
  });

  it('CA21: sans dédié, cumul sur la ligne : 3 300 + 50 + 50, puis un réel de 40 € en novembre', () => {
    const d = twoMonths([line('pel', 'epa', 50, null)], [line('pel', 'epa', 50, null)]);
    d.statements['2026-10'] = { pel: 3300 };
    expect(at(d, DEC, 'pel')).toBe(3400);
    d.months[NOV].lines[0].actual = 40;
    expect(at(d, DEC, 'pel')).toBe(3390);
  });

  it('CA21bis: un relevé repart du relevé sans dédié, et ne change rien avec un dédié', () => {
    const d = twoMonths([line('pel', 'epa', 50, null)], [line('pel', 'epa', 50, null)]);
    d.statements['2026-10'] = { pel: 3300 };
    setStatement(d, NOV, 'pel', 4000);
    expect(at(d, DEC, 'pel')).toBe(4050);
    const withDedicated = twoMonths([linked(200, null)], [linked(200, null)]);
    setStatement(withDedicated, NOV, 'livret', 9999);
    expect(at(withDedicated, DEC)).toBe(1400);
  });

  it('CA22: les budgets antérieurs à l’ouverture du dédié ne comptent pas, et un dédié non ouvert n’a pas de solde', () => {
    const d = twoMonths([linked(200, null)], [linked(200, null)]);
    setBankAccountOpening(d, LIVRET, { month: DEC });
    expect(at(d, NOV)).toBeNull();
    expect(at(d, DEC)).toBe(1200);
  });

  it('CA22bis: après une année clôturée, le cumul repart du solde de clôture', () => {
    const d = twoMonths([linked(200, null)], [linked(200, null)]);
    d.months[JAN] = month([linked(200, null)]);
    d.closes[2026] = { closed: true, overrides: { [`bank:${LIVRET}`]: 2000 } };
    expect(estimatedBalance(d, new Ledger(d, JAN), JAN, d.months[JAN].lines[0])?.value).toBe(2200);
  });

  it('CA22ter: lien en novembre puis « Aucun » en décembre : seul le budget de novembre compte pour le dédié', () => {
    const watcher = line('b', 'epa', 0, null, { linkedAccountId: LIVRET });
    const d = twoMonths([linked(200, null), watcher], [line('livret', 'epa', 200, null), { ...watcher }]);
    expect(at(d, DEC, 'b')).toBe(1200);
  });

  it('CA22quater: un revenu budgété sans réel sur le dédié n’est pas compté', () => {
    const rev = line('prime', 'rev', 500, null, { accountId: LIVRET });
    const d = twoMonths([linked(200, null), rev], [linked(200, null), { ...rev }]);
    expect(at(d, DEC)).toBe(1400);
  });

  it('RG22ter: année clôturée sans solde de clôture : le solde continue, seuls les budgets repartent de janvier (avec dédié)', () => {
    const d = twoMonths([linked(200, null)], [linked(200, null)]);
    d.months[JAN] = month([linked(200, null)]);
    d.closes[2026] = { closed: true, overrides: {} };
    // Real balance 1 000 (nothing paid) + only January's budget.
    expect(estimatedBalance(d, new Ledger(d, JAN), JAN, d.months[JAN].lines[0])?.value).toBe(1200);
  });

  it('RG22ter: relevé avant une année clôturée sans dédié : les budgets de l’année clôturée ne comptent pas', () => {
    const d = emptyData();
    d.firstMonth = '2025-11';
    d.accounts = defaultBankAccounts('2025-11');
    for (const m of ['2025-11', '2025-12', '2026-01']) d.months[m] = month([line('pel', 'epa', 50, null)]);
    setStatement(d, '2025-11', 'pel', 4000);
    d.closes[2025] = { closed: true, overrides: {} };
    const l = d.months['2026-01'].lines[0];
    expect(estimatedBalance(d, new Ledger(d, '2026-01'), '2026-01', l)?.value).toBe(4050);
  });

  it('reste rapide sur 120 mois', () => {
    const d = emptyData();
    d.firstMonth = '2020-01';
    d.accounts = defaultBankAccounts('2020-01');
    addBankAccount(d, LIVRET, 'Livret A', 'epargne');
    let last = '2020-01';
    for (let i = 0; i < 120; i++) {
      last = `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
      d.months[last] = month([linked(100, null)]);
    }
    const start = Date.now();
    const ledger = new Ledger(d, last);
    expect(estimatedBalance(d, ledger, last, d.months[last].lines[0])?.value).toBe(12000);
    expect(estimatedBalanceTotal(d, ledger, last, 'epa')).toBe(12000);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
