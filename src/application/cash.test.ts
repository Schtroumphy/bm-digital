import { describe, expect, it } from 'vitest';
import { addTransfer, deleteAccountMovement } from './accountMovements';
import { addTransaction, setEnvelopeAllocation } from './actions';
import { cashPartRefusal, closeBlockersAfterReconcile, closeMonthReconciling, reconcileCashLines, RECONCILE_LABEL, setEnvelopeCashPart } from './cash';
import { loadBudget } from './loadBudget';
import { addEnvelope } from './envelopes';
import { setLinePayment } from './payment';
import type { BudgetRepository } from './ports';
import { settleStatements } from '../domain/releve.fixture';
import { CASH_ACCOUNT_ID, defaultBankAccounts, MAIN_ACCOUNT_ID } from '../domain/bank';
import { estimatedMovements, realMovements } from '../domain/bankMovements';
import { monthSummary } from '../domain/budget';
import { cashLines, cashWithdrawalSummary, reconcilableLines } from '../domain/cash';
import { emptyData } from '../domain/empty';
import { CASH_ID } from '../domain/internalTransfers';
import { envelopeCash } from '../domain/envelopeCash';
import { Ledger } from '../domain/ledger';
import { migrateCashWithdrawals } from '../domain/migrate';
import type { BudgetData, Line } from '../domain/types';

const M = '2026-10';
const ln = (key: string, block: Line['block'], budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });
const ledger = (d: BudgetData) => new Ledger(d, M);
const cashOfShop = (d: BudgetData) => envelopeCash(d, 'shop', M);
const mainBalance = (d: BudgetData) => ledger(d).bankMonth(MAIN_ACCOUNT_ID, M)!.balance;

/**
 * October 2026: « Alimentation » (100) and « Snack » (40) are managed in cash, « Sport » (50) is not, the envelope « Shopping » receives 100 €.
 * The main account opens at 1 000 €.
 */
function october(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  const lines = [ln('alim', 'var', 100, { name: 'Alimentation' }), ln('snack', 'var', 40, { name: 'Snack' }), ln('sport', 'var', 50, { name: 'Sport' })];
  d.months[M] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  d.template = { lines: lines.map(({ actual: _a, ...l }) => l), envAlloc: {} };
  addEnvelope(d, 'shop', 'Shopping', M);
  d.months[M].alloc = { shop: 100 };
  setLinePayment(d, M, 'alim', { payMode: 'especes' });
  setLinePayment(d, M, 'snack', { payMode: 'especes' });
  return d;
}
const line = (d: BudgetData, key: string) => d.months[M].lines.find(l => l.key === key)!;
const withdraw = (d: BudgetData, amount: number, id = 'w1', from = MAIN_ACCOUNT_ID, day = 6) =>
  addTransfer(d, { id, month: M, day, label: 'Retrait DAB', amount, fromAccountId: from, toAccountId: CASH_ID });
const spend = (d: BudgetData, key: string, amount: number, id: string) =>
  addTransaction(d, { id, month: M, day: 5, label: key, amount, type: 'var', target: key });

describe('retrait : une sortie sans compte de destination (spec 0037, RG1 à RG3)', () => {
  it('CA1: un retrait de 200 € du principal le 06/10 le baisse de 200 € dans le solde réel ET estimé ; aucun réel, allocation ni « Reste à sortir » ne change', () => {
    const d = october();
    const before = monthSummary(d, ledger(d), M);
    const lines = structuredClone(d.months[M].lines);
    expect(withdraw(d, 200)).toBe(true);
    expect(mainBalance(d)).toBe(800);
    const real = realMovements(d, MAIN_ACCOUNT_ID, M);
    const estimated = estimatedMovements(d, MAIN_ACCOUNT_ID, M);
    for (const list of [real, estimated]) expect(list.filter(x => x.counterpart)).toEqual([expect.objectContaining({ amount: -200, date: '2026-10-06', label: expect.stringContaining('Espèces') })]);
    expect(monthSummary(d, ledger(d), M)).toEqual(before);
    expect(d.months[M].lines).toEqual(lines);
    expect(d.months[M].alloc).toEqual({ shop: 100 });
  });

  it('aucun compte n’est crédité, pas même le compte Espèces réservé', () => {
    const d = october();
    withdraw(d, 200);
    expect(realMovements(d, CASH_ACCOUNT_ID, M)).toEqual([]);
    expect(estimatedMovements(d, CASH_ACCOUNT_ID, M)).toEqual([]);
    expect(ledger(d).bankMonth(CASH_ACCOUNT_ID, M)!.balance).toBe(0);
  });

  it('un autre compte actif est accepté comme source ; le compte d’une enveloppe, un compte inconnu ou archivé, une cible sont refusés', () => {
    const d = october();
    d.accounts.push({ id: 'swile', name: 'Swile', hue: 10, isDefault: false, openingBalance: 100, openingMonth: M, inBudget: true, archived: false });
    expect(withdraw(d, 30, 'a', 'swile')).toBe(true);
    expect(ledger(d).bankMonth('swile', M)!.balance).toBe(70);
    expect(withdraw(d, 30, 'b', d.envelopes[0].accountId)).toBe(false);
    expect(withdraw(d, 30, 'c', 'inconnu')).toBe(false);
    d.accounts.find(a => a.id === 'swile')!.archived = true;
    expect(withdraw(d, 30, 'd', 'swile')).toBe(false);
    expect(addTransfer(d, { id: 'e', month: M, day: 2, label: 'Retrait', amount: 5, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ID, target: { kind: 'env', id: 'shop' } })).toBe(false);
    expect(d.accountMovements).toHaveLength(1);
  });

  it('RG3: mois verrouillé ou clos : création et suppression refusées', () => {
    const d = october();
    withdraw(d, 200);
    d.months[M].closed = true;
    expect(withdraw(d, 10, 'w2')).toBe(false);
    expect(deleteAccountMovement(d, 'w1')).toBe(false);
    expect(d.accountMovements).toHaveLength(1);
  });
});

describe('à retirer / retiré (spec 0037, RG16 à RG18)', () => {
  it('CA3: Alimentation 100 + Snack 40 + part de Shopping 60 = 200 à retirer ; 0 retiré, 200 manquants ; après un retrait de 200, plus rien à retirer', () => {
    const d = october();
    expect(setEnvelopeCashPart(d, M, 'shop', 60)).toBe('ok');
    expect(cashWithdrawalSummary(d, M)).toEqual({ toWithdraw: 200, withdrawn: 0, missing: 200, excess: 0 });
    withdraw(d, 200);
    expect(cashWithdrawalSummary(d, M)).toEqual({ toWithdraw: 200, withdrawn: 200, missing: 0, excess: 0 });
  });

  it('un retrait partiel laisse le reste ; un excédent est affiché comme tel ; plusieurs retraits s’additionnent', () => {
    const d = october();
    setEnvelopeCashPart(d, M, 'shop', 60);
    withdraw(d, 150, 'a');
    expect(cashWithdrawalSummary(d, M)).toMatchObject({ withdrawn: 150, missing: 50, excess: 0 });
    withdraw(d, 80, 'b');
    expect(cashWithdrawalSummary(d, M)).toMatchObject({ withdrawn: 230, missing: 0, excess: 30 });
  });

  it('seuls les retraits comptent : ni un virement interne ni une ligne d’exécution « retrait » (RG5), et un retrait d’un autre mois est ignoré', () => {
    const d = october();
    d.accounts.push({ id: 'swile', name: 'Swile', hue: 10, isDefault: false, openingBalance: 100, openingMonth: M, inBudget: true, archived: false });
    addTransfer(d, { id: 'i', month: M, day: 2, label: 'Virement', amount: 50, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: 'swile' });
    d.months[M].lines.push(ln('retrait', 'epa', 70, { execMode: 'retrait' }));
    d.months['2026-11'] = { initialized: true, lines: [], alloc: {}, transfersDone: {} };
    d.accountMovements!.push({ id: 'n', month: '2026-11', day: 2, label: 'Retrait', amount: 99, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ID });
    expect(cashWithdrawalSummary(d, M).withdrawn).toBe(0);
  });

  it('une ligne repassée en Virtuel sort de « à retirer » ; une enveloppe supprimée aussi ; un budget modifié recalcule', () => {
    const d = october();
    setEnvelopeCashPart(d, M, 'shop', 60);
    setLinePayment(d, M, 'snack', { payMode: 'virtuel' });
    expect(cashWithdrawalSummary(d, M).toWithdraw).toBe(160);
    line(d, 'alim').budget = 120;
    expect(cashWithdrawalSummary(d, M).toWithdraw).toBe(180);
    d.envelopes = [];
    expect(cashWithdrawalSummary(d, M).toWithdraw).toBe(120);
  });

  it('rien à retirer ni retiré : tout à zéro (le bloc est masqué à l’écran)', () => {
    const d = october();
    setLinePayment(d, M, 'alim', { payMode: 'virtuel' });
    setLinePayment(d, M, 'snack', { payMode: 'virtuel' });
    expect(cashWithdrawalSummary(d, M)).toEqual({ toWithdraw: 0, withdrawn: 0, missing: 0, excess: 0 });
    expect(cashLines(d, M)).toEqual([]);
  });

  it('RG18: le calcul n’entre dans aucun total budgétaire', () => {
    const d = october();
    const before = monthSummary(d, ledger(d), M);
    setEnvelopeCashPart(d, M, 'shop', 60);
    withdraw(d, 200);
    expect(monthSummary(d, ledger(d), M)).toEqual(before);
  });
});

describe('dépense sur une ligne gérée en espèces (spec 0037, RG7 à RG10)', () => {
  it('CA4: 35 € sur Snack (40 €) : réel 35, restant 5, aucun compte ne bouge, la dépense n’a pas de compte', () => {
    const d = october();
    const balances = () => [mainBalance(d), ledger(d).bankMonth(CASH_ACCOUNT_ID, M)!.balance];
    expect(spend(d, 'snack', 35, 't1')).toBe(true);
    expect(line(d, 'snack').actual).toBe(35);
    expect(line(d, 'snack').budget - line(d, 'snack').actual!).toBe(5);
    expect(d.transactions[0]).toMatchObject({ payMode: 'especes' });
    expect(d.transactions[0]).not.toHaveProperty('accountId');
    expect(balances()).toEqual([1000, 0]);
    expect(estimatedMovements(d, MAIN_ACCOUNT_ID, M)).toEqual([]);
  });

  it('un dépassement du budget est accepté (restant négatif), jamais bloqué', () => {
    const d = october();
    expect(spend(d, 'snack', 55, 't1')).toBe(true);
    expect(line(d, 'snack').budget - line(d, 'snack').actual!).toBe(-15);
  });

  it('une dépense avec un compte choisi explicitement reste une dépense de ce compte (import)', () => {
    const d = october();
    expect(addTransaction(d, { id: 'x', month: M, day: 5, label: 'Snack', amount: 10, type: 'var', target: 'snack', accountId: MAIN_ACCOUNT_ID })).toBe(true);
    expect(d.transactions[0].accountId).toBe(MAIN_ACCOUNT_ID);
    expect(d.transactions[0].payMode).toBeUndefined();
    expect(mainBalance(d)).toBe(990);
  });

  it('une ligne non gérée en espèces débite toujours son compte', () => {
    const d = october();
    spend(d, 'sport', 20, 't1');
    expect(mainBalance(d)).toBe(980);
  });
});

describe('part en espèces d’une enveloppe (spec 0037, RG11 à RG13)', () => {
  it('CA6: une part supérieure à l’allocation est refusée, rien ne change', () => {
    const d = october();
    expect(setEnvelopeCashPart(d, M, 'shop', 100.01)).toBe('above-allocation');
    expect(d.months[M].cashPart).toBeUndefined();
    expect(setEnvelopeCashPart(d, M, 'shop', 100)).toBe('ok');
  });

  it('CA6: une part négative ou invalide, une enveloppe inconnue, un mois non initialisé sont refusés', () => {
    const d = october();
    expect(setEnvelopeCashPart(d, M, 'shop', -1)).toBe('invalid');
    expect(setEnvelopeCashPart(d, M, 'shop', NaN)).toBe('invalid');
    expect(setEnvelopeCashPart(d, M, 'zzz', 5)).toBe('unknown');
    expect(setEnvelopeCashPart(d, '2027-05', 'shop', 5)).toBe('unknown');
    expect(cashPartRefusal(d, M, 'shop', 5)).toBeNull();
  });

  it('CA6: sur un mois clos ou verrouillé, la part est refusée', () => {
    const d = october();
    setEnvelopeCashPart(d, M, 'shop', 30);
    d.months[M].closed = true;
    expect(setEnvelopeCashPart(d, M, 'shop', 40)).toBe('locked');
    expect(d.months[M].cashPart).toEqual({ shop: 30 });
  });

  it('CA6: baisser l’allocation sous la part déjà saisie est refusé ; réduire la part d’abord le permet', () => {
    const d = october();
    setEnvelopeCashPart(d, M, 'shop', 60);
    expect(setEnvelopeAllocation(d, M, 'shop', 50)).toBe(false);
    expect(d.months[M].alloc.shop).toBe(100);
    expect(setEnvelopeAllocation(d, M, 'shop', 60)).toBe(true);
    setEnvelopeCashPart(d, M, 'shop', 20);
    expect(setEnvelopeAllocation(d, M, 'shop', 30)).toBe(true);
  });

  it('une part de 0 efface la part ; elle est facultative', () => {
    const d = october();
    setEnvelopeCashPart(d, M, 'shop', 60);
    expect(setEnvelopeCashPart(d, M, 'shop', 0)).toBe('ok');
    expect(d.months[M]).not.toHaveProperty('cashPart');
  });
});

describe('réconciliation à la clôture (spec 0037, RG19, RG20)', () => {
  it('CA10: seules les lignes en espèces dont le restant est positif sont proposées (jamais une enveloppe, une ligne Virtuel, un restant nul ou négatif)', () => {
    const d = october();
    setEnvelopeCashPart(d, M, 'shop', 60);
    spend(d, 'alim', 60, 't1');
    spend(d, 'snack', 40, 't2');
    spend(d, 'sport', 10, 't3');
    expect(reconcilableLines(d, M)).toEqual([{ key: 'alim', name: 'Alimentation', budget: 100, spent: 60, rest: 40 }]);
    spend(d, 'alim', 50, 't4');
    expect(reconcilableLines(d, M)).toEqual([]);
  });

  it('une ligne sans aucune dépense est proposée pour tout son budget', () => {
    const d = october();
    expect(reconcilableLines(d, M).map(l => [l.key, l.spent, l.rest])).toEqual([['alim', 0, 100], ['snack', 0, 40]]);
  });

  it('CA10: confirmer ajoute « Reste non saisi » de budget − réel, sans débiter de compte ; le réel de la ligne vaut le budget ; refuser laisse la ligne telle quelle', () => {
    const d = october();
    spend(d, 'snack', 35, 't1');
    spend(d, 'alim', 60, 't2');
    const done = reconcileCashLines(d, M, ['snack'], () => 'r1');
    expect(done).toBe(1);
    expect(d.transactions.find(t => t.id === 'r1')).toMatchObject({ label: RECONCILE_LABEL, amount: 5, type: 'var', target: 'snack', payMode: 'especes', day: 31 });
    expect(d.transactions.find(t => t.id === 'r1')).not.toHaveProperty('accountId');
    expect(line(d, 'snack').actual).toBe(40);
    expect(line(d, 'alim').actual).toBe(60);
    expect(mainBalance(d)).toBe(1000);
  });

  it('CA10: aucune ligne concernée : rien à proposer', () => {
    const d = october();
    setLinePayment(d, M, 'alim', { payMode: 'virtuel' });
    setLinePayment(d, M, 'snack', { payMode: 'virtuel' });
    expect(reconcilableLines(d, M)).toEqual([]);
    expect(reconcileCashLines(d, M, ['alim', 'snack'], () => 'z')).toBe(0);
  });

  it('un mois clos ou dont l’année est close ne propose rien et ne peut plus être régularisé', () => {
    const d = october();
    expect(reconcilableLines(d, M)).toHaveLength(2);
    d.months[M].closed = true;
    expect(reconcilableLines(d, M)).toEqual([]);
    expect(reconcileCashLines(d, M, ['alim'], () => 'z')).toBe(0);
  });

  it('clôturer en régularisant est tout ou rien : refusé quand le disponible n’est pas à 0, sans rien modifier', () => {
    const d = october();
    d.months[M].lines.unshift(ln('sal', 'rev', 1000 + 100 + 40 + 50 + 100));
    expect(closeMonthReconciling(d, M, ['alim'], () => 'z')).toBe(false);
    expect(d.transactions).toEqual([]);
    expect(d.months[M].closed).toBeUndefined();
    expect(closeBlockersAfterReconcile(d, M, ['alim']).length).toBeGreaterThan(0);
  });
});

describe('clôture avec relevés manquants (spec 0041, RG13, RG18, CA24)', () => {
  it('CA24: un relevé manquant refuse la clôture avec régularisation : rien n’est créé, tout ou rien', () => {
    const d = october();
    expect(closeBlockersAfterReconcile(d, M, ['alim']).map(b => b.kind)).toContain('statements');
    expect(closeMonthReconciling(d, M, ['alim'], () => 'z')).toBe(false);
    expect(d.transactions).toEqual([]);
    expect(d.months[M].closed).toBeUndefined();
  });

  it('une fois les relevés en règle, le motif relevé disparaît du dialogue (la régularisation en espèces ne change aucun solde réel)', () => {
    const d = october();
    settleStatements(d, M);
    expect(closeBlockersAfterReconcile(d, M, ['alim']).map(b => b.kind)).not.toContain('statements');
  });
});

describe('conversion des données existantes (spec 0037, « Sort des données », CA12)', () => {
  /** An old budget: a withdrawal main → Espèces, a funding Espèces → Shopping, an expense on the Espèces account, a rule « retrait → Espèces ». */
  function legacy(): BudgetData {
    const d = october();
    d.accountMovements = [
      { id: 'ret', month: M, day: 4, label: 'Retrait DAB', amount: 200, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID, target: undefined },
      { id: 'fund', month: M, day: 5, label: 'Alimentation', amount: 20, fromAccountId: CASH_ACCOUNT_ID, toAccountId: d.envelopes[0].accountId, target: { kind: 'env', id: 'shop' } },
    ];
    delete d.accountMovements[0].target;
    d.transactions = [{ id: 'old', month: M, day: 8, label: 'Marché', amount: 12, type: 'var', target: 'sport', accountId: CASH_ACCOUNT_ID }];
    d.importRules = [{ id: 'r', pattern: 'retrait', nature: 'retrait', target: { kind: 'account', id: CASH_ACCOUNT_ID } }];
    d.envelopes[0].openingCash = 10;
    return d;
  }

  it('un retrait vers l’ancien compte Espèces devient un retrait sans compte : le débit du principal et le mois sont conservés', () => {
    const d = legacy();
    const mainBefore = mainBalance(d);
    expect(mainBefore).toBe(800);
    const migrated = migrateCashWithdrawals(d);
    expect(migrated.accountMovements!.find(m => m.id === 'ret')).toMatchObject({ toAccountId: CASH_ID, month: M, day: 4, amount: 200 });
    expect(mainBalance(migrated)).toBe(800);
    expect(ledger(migrated).bankMonth(CASH_ACCOUNT_ID, M)!.balance).toBe(0);
  });

  it('un transfert Espèces → enveloppe est supprimé et devient la part du mois ; le solde espèces de l’enveloppe est inchangé', () => {
    // 10 € of opening cash + the 20 € funding, now carried by the part of the month.
    const d = legacy();
    const migrated = migrateCashWithdrawals(d);
    expect(migrated.accountMovements!.map(m => m.id)).toEqual(['ret']);
    expect(migrated.months[M].cashPart).toEqual({ shop: 20 });
    expect(cashOfShop(migrated)).toBe(30);
  });

  it('une dépense variable sur l’ancien compte Espèces est conservée, en espèces et sans compte, dans le réel de sa ligne', () => {
    const migrated = migrateCashWithdrawals(legacy());
    expect(migrated.transactions[0]).toMatchObject({ id: 'old', payMode: 'especes', amount: 12 });
    expect(migrated.transactions[0]).not.toHaveProperty('accountId');
  });

  it('une règle d’import « Retrait → Espèces » vise désormais « Retrait » (CASH_ID)', () => {
    expect(migrateCashWithdrawals(legacy()).importRules![0].target).toEqual({ kind: 'account', id: CASH_ID });
  });

  it('le compte Espèces reste en base, masqué, jamais supprimé ni archivé', () => {
    const migrated = migrateCashWithdrawals(legacy());
    expect(migrated.accounts.find(a => a.id === CASH_ACCOUNT_ID)).toMatchObject({ archived: false });
  });

  it('idempotente, pure : des données déjà converties sont rendues telles quelles, les données données ne sont jamais modifiées', () => {
    const d = legacy();
    const before = structuredClone(d);
    const once = migrateCashWithdrawals(d);
    expect(d).toEqual(before);
    expect(migrateCashWithdrawals(once)).toBe(once);
    expect(migrateCashWithdrawals(october())).toEqual(october());
  });

  it('un transfert d’alimentation d’un mois non créé crée un mois non initialisé qui porte la part', () => {
    const d = legacy();
    d.accountMovements![1].month = '2026-09';
    const migrated = migrateCashWithdrawals(d);
    expect(migrated.months['2026-09']).toMatchObject({ initialized: false, cashPart: { shop: 20 } });
  });

  it('un transfert d’alimentation dans un mois sans allocation, ou à l’allocation plus petite : la part reste entière et l’allocation est relevée à la part (idempotent)', () => {
    const d = legacy();
    // Month with no allocation row at all.
    d.accountMovements![1].month = '2026-09';
    // October: smaller allocation than the part (a second funding of 150 on top of the allocation of 100).
    d.accountMovements!.push({ id: 'fund2', month: M, day: 9, label: 'Alimentation', amount: 150, fromAccountId: CASH_ACCOUNT_ID, toAccountId: d.envelopes[0].accountId });
    const migrated = migrateCashWithdrawals(d);
    expect(migrated.months['2026-09'].cashPart).toEqual({ shop: 20 });
    expect(migrated.months['2026-09'].alloc).toEqual({ shop: 20 });
    expect(migrated.months[M].cashPart).toEqual({ shop: 150 });
    expect(migrated.months[M].alloc).toEqual({ shop: 150 });
    // No negative amount: the allocation transfer (allocation − part) is 0 and the virtual balance is not lowered below its start.
    expect(migrated.months[M].alloc.shop - migrated.months[M].cashPart!.shop).toBe(0);
    expect(ledger(migrated).envMonth('shop', M)!.balance).toBe(0);
    // A larger allocation is kept.
    const big = legacy();
    expect(migrateCashWithdrawals(big).months[M].alloc).toEqual({ shop: 100 });
    expect(migrateCashWithdrawals(migrated)).toBe(migrated);
  });

  it('au chargement, les données converties sont enregistrées tout de suite', async () => {
    const saved: BudgetData[] = [];
    const repository: BudgetRepository = { load: async () => legacy(), save: async data => void saved.push(data) };
    const { data } = await loadBudget(repository, emptyData);
    expect(data.accountMovements!.map(m => m.toAccountId)).toEqual([CASH_ID]);
    expect(saved).toHaveLength(1);
    expect(saved[0].accountMovements!.map(m => m.toAccountId)).toEqual([CASH_ID]);
  });
});
