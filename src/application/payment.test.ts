import { describe, expect, it } from 'vitest';
import { addTransaction, applyTemplate, createFirstMonth, duplicatePrevious, saveAsTemplate } from './actions';
import { addBankAccount, archiveBankAccount, setBankAccountInBudget, setMainBankAccount } from './bankAccounts';
import { setEnvelopePayment, setLinePayment } from './payment';
import { emptyDraft, exampleDraft, updateRow, type IdFactory } from './setup';
import { CASH_ACCOUNT_ID, defaultBankAccounts, defaultTransactionAccountId, MAIN_ACCOUNT_ID, resolveBoxAccountId } from '../domain/bank';
import { monthSummary } from '../domain/budget';
import { emptyData } from '../domain/empty';
import { Ledger } from '../domain/ledger';
import { migrateBankAccounts } from '../domain/migrate';
import { seedData } from '../domain/seed';
import type { BudgetData, Line, Transaction } from '../domain/types';

const M = '2027-01';
const NEXT = '2027-02';

const ln = (key: string, block: Line['block'], budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });

/** A started budget: main account (100 €), Espèces (50 €), Boursorama (200 €), Swile (120 €, out of the budget). Variable box « courses » + envelope « sante ». */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 100;
  d.accounts[1].openingBalance = 50;
  addBankAccount(d, 'bourso', 'Boursorama');
  addBankAccount(d, 'swile', 'Swile');
  d.accounts.find(a => a.id === 'bourso')!.openingBalance = 200;
  const swile = d.accounts.find(a => a.id === 'swile')!;
  swile.openingBalance = 120;
  swile.inBudget = false;
  const lines = [ln('rev', 'rev', 2000), ln('courses', 'var', 400), ln('marche', 'var', 80)];
  d.months[M] = { initialized: true, lines, alloc: { sante: 50 }, transfersDone: {} };
  d.template = { lines: lines.map(({ actual: _a, ...l }) => l), envAlloc: { sante: 50 } };
  d.envelopes = [{ id: 'sante', name: 'Santé', hue: 170, cash: 0 }];
  return d;
}

const tx = (over: Partial<Transaction> = {}): Transaction => ({ id: 't1', month: M, day: 3, label: 'Courses', amount: 40, type: 'var', target: 'courses', ...over });
const balance = (d: BudgetData, id: string) => new Ledger(d, M).bankMonth(id, M)!.balance;
const box = (d: BudgetData, key: string) => d.months[M].lines.find(l => l.key === key)!;

describe('résolution du compte d’une box', () => {
  it('CA1: une box en Espèces résout vers le compte Espèces', () => {
    const d = started();
    expect(resolveBoxAccountId(d, { payMode: 'especes', accountId: 'bourso' })).toBe(CASH_ACCOUNT_ID);
  });

  it('CA2: une box en Virtuel avec un compte attribué résout vers ce compte', () => {
    const d = started();
    expect(resolveBoxAccountId(d, { payMode: 'virtuel', accountId: 'bourso' })).toBe('bourso');
    expect(resolveBoxAccountId(d, { accountId: 'bourso' })).toBe('bourso');
  });

  it('CA3: une box en Virtuel sans compte attribué résout vers le principal', () => {
    const d = started();
    expect(resolveBoxAccountId(d, {})).toBe(MAIN_ACCOUNT_ID);
    expect(resolveBoxAccountId(d, { payMode: 'virtuel' })).toBe(MAIN_ACCOUNT_ID);
    // « sans compte attribué » suit un changement de compte principal
    setMainBankAccount(d, 'bourso');
    expect(resolveBoxAccountId(d, {})).toBe('bourso');
  });

  it('CA4: un compte attribué archivé retombe sur le principal', () => {
    const d = started();
    d.accounts.find(a => a.id === 'bourso')!.archived = true;
    expect(resolveBoxAccountId(d, { accountId: 'bourso' })).toBe(MAIN_ACCOUNT_ID);
    expect(resolveBoxAccountId(d, { accountId: 'inconnu' })).toBe(MAIN_ACCOUNT_ID);
  });

  it('le compte proposé pour une saisie suit la box (ligne, enveloppe) ou le principal (sortie d’épargne)', () => {
    const d = started();
    setLinePayment(d, M, 'courses', { accountId: 'bourso' });
    setEnvelopePayment(d, M, 'sante', { payMode: 'especes' });
    expect(defaultTransactionAccountId(d, tx())).toBe('bourso');
    expect(defaultTransactionAccountId(d, tx({ type: 'env', target: 'sante' }))).toBe(CASH_ACCOUNT_ID);
    expect(defaultTransactionAccountId(d, tx({ type: 'epa', target: 'livret' }))).toBe(MAIN_ACCOUNT_ID);
  });
});

describe('saisie d’une dépense sur une box', () => {
  it('CA5: passer la box en Espèces ne déplace pas les dépenses déjà saisies', () => {
    const d = started();
    setLinePayment(d, M, 'courses', { accountId: 'bourso' });
    addTransaction(d, tx());
    const before = [balance(d, 'bourso'), balance(d, CASH_ACCOUNT_ID)];
    expect(before).toEqual([160, 50]);
    setLinePayment(d, M, 'courses', { payMode: 'especes' });
    expect(d.transactions[0].accountId).toBe('bourso');
    expect([balance(d, 'bourso'), balance(d, CASH_ACCOUNT_ID)]).toEqual(before);
  });

  it('CA6: sans toucher à « Payé avec », la dépense d’une box Espèces baisse le solde Espèces', () => {
    const d = started();
    setLinePayment(d, M, 'marche', { payMode: 'especes' });
    addTransaction(d, tx({ target: 'marche', amount: 30 }));
    expect(d.transactions[0].accountId).toBe(CASH_ACCOUNT_ID);
    expect(balance(d, CASH_ACCOUNT_ID)).toBe(20);
    expect(balance(d, MAIN_ACCOUNT_ID)).toBe(100);
  });

  it('un compte choisi explicitement à la saisie l’emporte sur la box', () => {
    const d = started();
    setLinePayment(d, M, 'marche', { payMode: 'especes' });
    addTransaction(d, tx({ target: 'marche', amount: 30, accountId: 'bourso' }));
    expect(d.transactions[0].accountId).toBe('bourso');
  });

  it('une dépense d’enveloppe suit le mode de l’enveloppe', () => {
    const d = started();
    setEnvelopePayment(d, M, 'sante', { payMode: 'especes' });
    addTransaction(d, tx({ type: 'env', target: 'sante', amount: 15 }));
    expect(d.transactions[0].accountId).toBe(CASH_ACCOUNT_ID);
    expect(balance(d, CASH_ACCOUNT_ID)).toBe(35);
  });

  it('CA7 (amendé 0008): compte résolu « hors budget » : la dépense compte dans le réel de la ligne, pas dans le reste à placer, et le solde baisse', () => {
    const d = started();
    setLinePayment(d, M, 'courses', { accountId: 'swile' });
    const before = monthSummary(d, new Ledger(d, M), M);
    addTransaction(d, tx({ amount: 60 }));
    const after = monthSummary(d, new Ledger(d, M), M);
    expect(box(d, 'courses').actual).toBe(60);
    expect(after.remaining).toBe(before.remaining);
    expect(after.expenses).toBe(before.expenses);
    expect(balance(d, 'swile')).toBe(60);
    // Le réglage du compte n'a plus d'effet sur le réel de la ligne (0008, RG3).
    setBankAccountInBudget(d, 'swile', true);
    expect(box(d, 'courses').actual).toBe(60);
  });

  it('une dépense sur un compte attribué archivé tombe sur le principal', () => {
    const d = started();
    setLinePayment(d, M, 'courses', { accountId: 'bourso' });
    archiveBankAccount(d, 'bourso');
    addTransaction(d, tx());
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
  });
});

describe('migration des box (RG12)', () => {
  it('CA8: sans mode, chaque box est Virtuel sur le principal, aucune transaction ne change, relancer ne change rien', () => {
    const before = seedData();
    const { accounts: _a, ...legacy } = before;
    const migrated = migrateBankAccounts(structuredClone({ ...legacy, transfers: before.transfers }) as never);
    const boxes = [...migrated.template.lines.filter(l => l.block === 'var'), ...migrated.envelopes];
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) {
      expect(b.payMode).toBeUndefined();
      expect(b.accountId).toBeUndefined();
      expect(resolveBoxAccountId(migrated, b)).toBe(MAIN_ACCOUNT_ID);
    }
    expect(migrated.transactions.map(t => t.id)).toEqual(before.transactions.map(t => t.id));
    expect(migrateBankAccounts(structuredClone(migrated))).toEqual(migrated);
  });

  it('des données déjà migrées avec des box sans mode ne sont pas modifiées', () => {
    const d = seedData();
    expect(migrateBankAccounts(structuredClone(d))).toEqual(d);
  });
});

describe('changer le mode d’une box', () => {
  it('s’applique au mois affiché et au modèle, pas aux autres mois (RG10)', () => {
    const d = started();
    d.months[NEXT] = structuredClone(d.months[M]);
    expect(setLinePayment(d, M, 'courses', { payMode: 'especes', accountId: 'bourso' })).toBe(true);
    expect(box(d, 'courses')).toMatchObject({ payMode: 'especes', accountId: 'bourso' });
    expect(d.template.lines.find(l => l.key === 'courses')).toMatchObject({ payMode: 'especes', accountId: 'bourso' });
    expect(d.months[NEXT].lines.find(l => l.key === 'courses')!.payMode).toBeUndefined();
  });

  it('CA11: « Appliquer le modèle » et « Dupliquer » gardent le mode et le compte attribué', () => {
    const d = started();
    setLinePayment(d, M, 'courses', { payMode: 'especes', accountId: 'bourso' });
    applyTemplate(d, NEXT);
    expect(d.months[NEXT].lines.find(l => l.key === 'courses')).toMatchObject({ payMode: 'especes', accountId: 'bourso' });
    delete d.months[NEXT];
    duplicatePrevious(d, NEXT);
    expect(d.months[NEXT].lines.find(l => l.key === 'courses')).toMatchObject({ payMode: 'especes', accountId: 'bourso' });
    saveAsTemplate(d, NEXT);
    expect(d.template.lines.find(l => l.key === 'courses')).toMatchObject({ payMode: 'especes', accountId: 'bourso' });
  });

  it('repasser en Virtuel restaure le compte attribué conservé', () => {
    const d = started();
    setLinePayment(d, M, 'courses', { accountId: 'bourso' });
    setLinePayment(d, M, 'courses', { payMode: 'especes' });
    setLinePayment(d, M, 'courses', { payMode: 'virtuel' });
    expect(resolveBoxAccountId(d, box(d, 'courses'))).toBe('bourso');
  });

  it('accountId: null efface le compte attribué', () => {
    const d = started();
    setLinePayment(d, M, 'courses', { accountId: 'bourso' });
    setLinePayment(d, M, 'courses', { accountId: null });
    expect('accountId' in box(d, 'courses')).toBe(false);
  });

  it('RG13: Espèces n’est pas un compte attribué ; un compte inconnu est refusé', () => {
    const d = started();
    expect(setLinePayment(d, M, 'courses', { accountId: CASH_ACCOUNT_ID })).toBe(false);
    expect(setEnvelopePayment(d, M, 'sante', { accountId: 'inconnu' })).toBe(false);
    expect(box(d, 'courses').accountId).toBeUndefined();
  });

  it('RG11: refusé sur une année clôturée', () => {
    const d = started();
    d.closes[2027] = { closed: true, overrides: {} };
    expect(setLinePayment(d, M, 'courses', { payMode: 'especes' })).toBe(false);
    expect(setEnvelopePayment(d, M, 'sante', { payMode: 'especes' })).toBe(false);
    expect(box(d, 'courses').payMode).toBeUndefined();
  });

  it('ne s’applique qu’aux lignes variables existantes', () => {
    const d = started();
    expect(setLinePayment(d, M, 'rev', { payMode: 'especes' })).toBe(false);
    expect(setLinePayment(d, M, 'absente', { payMode: 'especes' })).toBe(false);
    expect(setEnvelopePayment(d, M, 'absente', { payMode: 'especes' })).toBe(false);
  });

  it('changer de compte principal fige aussi les lignes variables sans compte sur l’ancien principal', () => {
    const d = started();
    setMainBankAccount(d, 'bourso');
    expect(box(d, 'courses').accountId).toBe(MAIN_ACCOUNT_ID);
    expect(box(d, 'rev').accountId).toBe(MAIN_ACCOUNT_ID);
  });
});

describe('assistant (RG9)', () => {
  const ids = (): IdFactory => {
    let n = 0;
    return p => `${p}${n++}`;
  };

  it('la colonne « Compte » d’une variable alimente le compte attribué et le mode', () => {
    const d = emptyData();
    let draft = exampleDraft(M, ids());
    const vars = draft.rows.dep.filter(r => r.kind === 'var');
    draft = updateRow(draft, 'dep', vars[0].id, { accountId: CASH_ACCOUNT_ID });
    draft = updateRow(draft, 'dep', vars[1].id, { accountId: MAIN_ACCOUNT_ID });
    expect(createFirstMonth(d, draft, M)).toBe(true);
    const [especes, compte] = d.months[M].lines.filter(l => l.block === 'var');
    expect(especes.payMode).toBe('especes');
    expect(especes.accountId).toBeUndefined();
    expect(compte.accountId).toBe(MAIN_ACCOUNT_ID);
    expect(compte.payMode).toBeUndefined();
    expect(d.template.lines.find(l => l.key === especes.key)!.payMode).toBe('especes');
  });

  it('une dépense fixe sur Espèces garde Espèces comme compte, sans mode', () => {
    const d = emptyData();
    let draft = emptyDraft(M);
    draft = { ...draft, rows: { ...draft.rows, dep: [{ id: 'f1', name: 'Loyer', kind: 'fix', amount: 500, balance: 0, cash: 0, accountId: CASH_ACCOUNT_ID }] } };
    createFirstMonth(d, draft, M);
    expect(d.months[M].lines[0]).toMatchObject({ accountId: CASH_ACCOUNT_ID });
    expect(d.months[M].lines[0].payMode).toBeUndefined();
  });
});

describe('diagnostic : réel d’une ligne variable payée en Espèces', () => {
  const withAlimentation = (cashInBudget: boolean) => {
    const d = started();
    d.months[M].lines.push(ln('alim', 'var', 300));
    d.accounts.find(a => a.id === CASH_ACCOUNT_ID)!.inBudget = cashInBudget;
    return d;
  };

  it('(a) mode Espèces, Espèces dans le budget : le réel passe de null à la somme', () => {
    const d = withAlimentation(true);
    setLinePayment(d, M, 'alim', { payMode: 'especes' });
    addTransaction(d, tx({ target: 'alim', amount: 25 }));
    addTransaction(d, tx({ id: 't2', target: 'alim', amount: 10.5 }));
    expect(box(d, 'alim').actual).toBe(35.5);
  });

  it('(a bis) compte Espèces choisi explicitement (formulaire), box sans mode : même résultat', () => {
    const d = withAlimentation(true);
    addTransaction(d, tx({ target: 'alim', amount: 25, accountId: CASH_ACCOUNT_ID }));
    expect(box(d, 'alim').actual).toBe(25);
  });

  it('(b) Espèces hors budget (0008, RG1) : le réel compte la dépense, le solde Espèces baisse', () => {
    const d = withAlimentation(false);
    setLinePayment(d, M, 'alim', { payMode: 'especes' });
    addTransaction(d, tx({ target: 'alim', amount: 25 }));
    expect(box(d, 'alim').actual).toBe(25);
    expect(balance(d, CASH_ACCOUNT_ID)).toBe(25);
  });

  it('(d) mois non créé : la dépense saisie sur la ligne du modèle alimente le réel à la création du mois', () => {
    const d = withAlimentation(true);
    d.template.lines.push({ key: 'alim', block: 'var', section: '', name: 'alim', budget: 300 });
    addTransaction(d, tx({ month: NEXT, target: 'alim', amount: 25 }));
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    applyTemplate(d, NEXT);
    expect(d.months[NEXT].lines.find(l => l.key === 'alim')!.actual).toBe(25);
  });

  it('(d bis) cible inconnue dans le mois : la transaction est gardée, aucun réel ne bouge', () => {
    const d = withAlimentation(true);
    addTransaction(d, tx({ target: 'inconnue', amount: 25 }));
    expect(d.transactions).toHaveLength(1);
    expect(d.months[M].lines.every(l => l.actual === null)).toBe(true);
  });
});
