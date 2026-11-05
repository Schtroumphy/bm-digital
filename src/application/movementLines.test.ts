import { describe, expect, it } from 'vitest';
import { addBankAccount } from './bankAccounts';
import { addEnvelope } from './envelopes';
import { addTransaction, updateLine } from './actions';
import { addTransfer, setTransferTargets, updateAccountMovement, deleteAccountMovement } from './accountMovements';
import { loadBudget } from './loadBudget';
import { MAIN_ACCOUNT_ID, defaultBankAccounts } from '../domain/bank';
import { CASH_ID } from '../domain/internalTransfers';
import { accountComingUp } from '../domain/comingUp';
import { emptyData } from '../domain/empty';
import { budgetGap, budgetLockReason, isValidTransferTargets, proposableLines } from '../domain/movementLines';
import { migrateMovementTargets } from '../domain/migrate';
import { leftOfLine } from '../domain/comingUp';
import type { BlockKey, BudgetData, Line, MovementTarget } from '../domain/types';

/* Spec 0045 : virement associé à plusieurs lignes variables. */

const M = '2027-01';
const BOU = 'acc-bou';
const AUT = 'acc-aut';

const ln = (key: string, block: BlockKey, budget: number, extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget, actual: null, ...extra });
const lines = (...keys: string[]): MovementTarget[] => keys.map(key => ({ kind: 'line', key }));

/** Principal à 1 000 €, Boursorama (lignes ali 200, loi 80, car 80) et un autre compte dédié (aut 50) ; janvier créé. */
function started(): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = defaultBankAccounts(M);
  d.accounts[0].openingBalance = 1000;
  addBankAccount(d, BOU, 'Boursorama');
  addBankAccount(d, AUT, 'Autre');
  d.months[M] = {
    initialized: true, alloc: {}, transfersDone: {},
    lines: [ln('ali', 'var', 200, { accountId: BOU }), ln('loi', 'var', 80, { accountId: BOU }), ln('car', 'var', 80, { accountId: BOU }), ln('aut', 'var', 50, { accountId: AUT }), ln('edf', 'fix', 60)],
  };
  return d;
}

let n = 0;
const transfer = (d: BudgetData, targets: MovementTarget[], extra: { amount?: number; to?: string; day?: number; id?: string } = {}) => {
  const id = extra.id ?? `m${++n}`;
  expect(addTransfer(d, { id, month: M, day: extra.day ?? 2, label: 'Virement Boursorama', amount: extra.amount ?? 100, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: extra.to ?? BOU, targets })).toBe(true);
  return d.accountMovements!.find(m => m.id === id)!;
};
/** A transfer that comes from the bank file (it has an import trace). */
const imported = (d: BudgetData, amount = 360) => {
  d.accountMovements = [...(d.accountMovements ?? []), { id: 'imp', month: M, day: 3, label: 'VIR BOURSORAMA', amount, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: BOU, importAccountId: MAIN_ACCOUNT_ID, fingerprint: 'f', rank: 1 }];
  return d.accountMovements.find(m => m.id === 'imp')!;
};
const edit = (d: BudgetData, id: string, patch: Partial<Parameters<typeof updateAccountMovement>[2]> = {}) => {
  const mv = d.accountMovements!.find(m => m.id === id)!;
  return updateAccountMovement(d, id, { label: mv.label, amount: mv.amount, ...patch });
};

describe('lignes proposables (RG1, CA7)', () => {
  it('seules les lignes variables du compte de destination sont proposées', () => {
    const d = started();
    expect(proposableLines(d, M, BOU).map(l => l.key)).toEqual(['ali', 'loi', 'car']);
    expect(proposableLines(d, M, AUT).map(l => l.key)).toEqual(['aut']);
  });

  it('CA7 : une ligne d’un compte hors budget n’est ni proposée ni acceptée', () => {
    const d = started();
    d.accounts.find(a => a.id === AUT)!.inBudget = false;
    expect(proposableLines(d, M, AUT)).toEqual([]);
    expect(isValidTransferTargets(d, M, AUT, lines('aut'))).toBe(false);
    expect(addTransfer(d, { id: 'x', month: M, day: 2, label: 'V', amount: 10, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: AUT, targets: lines('aut') })).toBe(false);
  });

  it('une ligne d’un autre compte dédié est refusée pour ce virement', () => {
    const d = started();
    expect(isValidTransferTargets(d, M, BOU, lines('ali', 'aut'))).toBe(false);
  });

  it('RG2 : pas de mélange enveloppe + lignes, une seule cible enveloppe', () => {
    const d = started();
    addEnvelope(d, 'vac', 'Vacances');
    const env = d.envelopes[0];
    expect(isValidTransferTargets(d, M, env.accountId, [{ kind: 'env', id: env.id }])).toBe(true);
    expect(isValidTransferTargets(d, M, env.accountId, [{ kind: 'env', id: env.id }, { kind: 'env', id: env.id }])).toBe(false);
    expect(isValidTransferTargets(d, M, BOU, [...lines('ali'), { kind: 'env', id: env.id }])).toBe(false);
  });
});

describe('montant d’un virement saisi à la main (RG4 à RG6, CA1 à CA3)', () => {
  it('CA1 : le montant devient la somme des budgets des lignes cochées', () => {
    const d = started();
    expect(transfer(d, lines('ali', 'loi', 'car'), { amount: 5 }).amount).toBe(360);
  });

  it('CA2 : retirer une ligne ne change pas le montant ; l’écart est calculé', () => {
    const d = started();
    const mv = transfer(d, lines('ali', 'loi', 'car'));
    expect(setTransferTargets(d, mv.id, lines('ali', 'loi'))).toBe(true);
    expect(mv.amount).toBe(360);
    expect(budgetGap(d, mv)).toEqual({ budget: 280, amount: 360 });
  });

  it('RG5 : ajouter une ligne recalcule sur l’ensemble des lignes cochées', () => {
    const d = started();
    const mv = transfer(d, lines('ali', 'loi'));
    expect(mv.amount).toBe(280);
    setTransferTargets(d, mv.id, lines('ali', 'loi', 'car'));
    expect(mv.amount).toBe(360);
    expect(budgetGap(d, mv)).toBeNull();
  });

  it('le montant demandé par l’édition est ignoré tant que des lignes sont associées', () => {
    const d = started();
    const mv = transfer(d, lines('ali'));
    expect(edit(d, mv.id, { amount: 999 })).toBe(true);
    expect(mv.amount).toBe(200);
  });

  it('CA3 : sans plus aucune ligne, le montant garde sa valeur et redevient modifiable', () => {
    const d = started();
    const mv = transfer(d, lines('ali', 'loi', 'car'));
    setTransferTargets(d, mv.id, []);
    expect(mv.amount).toBe(360);
    expect(mv.targets).toBeUndefined();
    expect(edit(d, mv.id, { amount: 300 })).toBe(true);
    expect(mv.amount).toBe(300);
  });
});

describe('virement importé (RG7, CA4)', () => {
  it('CA4 : l’association ne modifie pas le montant du relevé ; l’écart est signalé', () => {
    const d = started();
    d.months[M].lines[2].budget = 70;
    imported(d, 360);
    expect(setTransferTargets(d, 'imp', lines('ali', 'loi', 'car'))).toBe(true);
    const mv = d.accountMovements!.find(m => m.id === 'imp')!;
    expect(mv.amount).toBe(360);
    expect(budgetGap(d, mv)).toEqual({ budget: 350, amount: 360 });
  });

  it('une ligne ajoutée plus tard ne touche pas non plus au montant', () => {
    const d = started();
    imported(d, 360);
    setTransferTargets(d, 'imp', lines('ali'));
    setTransferTargets(d, 'imp', lines('ali', 'loi'));
    expect(d.accountMovements![0].amount).toBe(360);
  });
});

describe('budget verrouillé (RG9, RG10, CA5, CA6)', () => {
  it('CA5 : le budget d’une ligne associée est refusé, puis redevient modifiable une fois retirée', () => {
    const d = started();
    const mv = transfer(d, lines('ali', 'loi'));
    expect(budgetLockReason(d, M, d.months[M].lines[0])).toContain('Verrouillé : ligne associée au virement Virement Boursorama');
    expect(updateLine(d, M, 'ali', { budget: 210 })).toBe(false);
    expect(d.months[M].lines[0].budget).toBe(200);
    expect(updateLine(d, M, 'ali', { name: 'Alimentation' })).toBe(true);
    setTransferTargets(d, mv.id, lines('loi'));
    expect(updateLine(d, M, 'ali', { budget: 210 })).toBe(true);
  });

  it('CA5 : supprimer le virement déverrouille', () => {
    const d = started();
    const mv = transfer(d, lines('ali'));
    deleteAccountMovement(d, mv.id);
    expect(budgetLockReason(d, M, d.months[M].lines[0])).toBeNull();
  });

  it('CA6 / RG10 : une ligne associée à deux virements reste verrouillée quand on en retire un', () => {
    const d = started();
    const a = transfer(d, lines('ali'));
    transfer(d, lines('ali', 'loi'));
    setTransferTargets(d, a.id, []);
    expect(updateLine(d, M, 'ali', { budget: 210 })).toBe(false);
  });

  it('RG11 : une ligne supprimée du mois est ignorée', () => {
    const d = started();
    const mv = transfer(d, lines('ali', 'loi'));
    d.months[M].lines = d.months[M].lines.filter(l => l.key !== 'loi');
    expect(budgetGap(d, mv)).toEqual({ budget: 200, amount: 280 });
  });
});

describe('mois clos (RG12, CA8)', () => {
  it('toute association, dissociation et modification de montant est refusée', () => {
    const d = started();
    const mv = transfer(d, lines('ali'));
    imported(d, 360);
    d.months[M].closed = true;
    expect(setTransferTargets(d, mv.id, lines('ali', 'loi'))).toBe(false);
    expect(setTransferTargets(d, mv.id, [])).toBe(false);
    expect(setTransferTargets(d, 'imp', lines('ali'))).toBe(false);
    expect(edit(d, mv.id, { amount: 10 })).toBe(false);
    expect(mv.targets).toEqual(lines('ali'));
    expect(addTransfer(d, { id: 'z', month: M, day: 2, label: 'V', amount: 10, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: BOU, targets: lines('ali') })).toBe(false);
  });
});

describe('changement de destination (RG13, CA15)', () => {
  it('retire les lignes qui ne correspondent plus et recalcule le montant d’un virement à la main', () => {
    const d = started();
    d.months[M].lines.push(ln('ali2', 'var', 30, { accountId: AUT }));
    const mv = transfer(d, lines('ali', 'loi'));
    expect(edit(d, mv.id, { toAccountId: AUT })).toBe(true);
    expect(mv.targets).toBeUndefined();
    expect(mv.toAccountId).toBe(AUT);
    expect(mv.amount).toBe(280);
  });

  it('vers Espèces, plus aucune cible', () => {
    const d = started();
    const mv = transfer(d, lines('ali'));
    expect(edit(d, mv.id, { toAccountId: CASH_ID })).toBe(true);
    expect(mv.targets).toBeUndefined();
  });
});

describe('enveloppes et épargne : une seule cible, comme avant (RG2, CA14)', () => {
  it('un virement vers une enveloppe garde sa cible unique', () => {
    const d = started();
    addEnvelope(d, 'vac', 'Vacances');
    const env = d.envelopes[0];
    const mv = transfer(d, [{ kind: 'env', id: env.id }], { to: env.accountId, amount: 40 });
    expect(mv.targets).toEqual([{ kind: 'env', id: env.id }]);
    expect(mv.amount).toBe(40);
    expect(setTransferTargets(d, mv.id, lines('ali'))).toBe(false);
  });
});

describe('« À venir ce mois-ci > Déjà sorti » (RG14 à RG17, CA9 à CA12)', () => {
  const principal = (d: BudgetData) => accountComingUp(d, M, MAIN_ACCOUNT_ID, '2027-01-10')!;
  const spend = (d: BudgetData, id: string, key: string, amount: number, day = 4) => addTransaction(d, { id, month: M, day, label: id, amount, type: 'var', target: key });

  it('CA9 : une ligne « Virement → Boursorama » dans À virer, et le total compté une seule fois', () => {
    const d = started();
    transfer(d, lines('ali', 'loi', 'car'));
    const g = principal(d).groups.find(x => x.id === 'virement')!;
    expect(g.done).toHaveLength(1);
    expect(g.done[0]).toMatchObject({ kind: 'transfer', name: 'Virement → Boursorama', amount: 360 });
    expect(g.done.reduce((t, x) => t + x.amount, 0)).toBe(360);
    expect(g.total).toBe(0);
    expect(g.items).toEqual([]);
  });

  it('un virement sans ligne variable n’apparaît pas', () => {
    const d = started();
    transfer(d, []);
    expect(principal(d).groups.flatMap(g => g.done)).toEqual([]);
  });

  it('CA10 : dépliée, chaque ligne montre ses dépenses réelles, sans effet sur les totaux (reste : edf 60 + aut 50)', () => {
    const d = started();
    spend(d, 'a1', 'ali', 100);
    spend(d, 'a2', 'ali', 112, 6);
    spend(d, 'l1', 'loi', 80);
    transfer(d, lines('ali', 'loi', 'car'));
    const before = principal(d);
    const item = before.groups.find(x => x.id === 'virement')!.done[0];
    expect(item.lines!.map(l => [l.key, l.spent, l.expenses.length])).toEqual([['ali', 212, 2], ['loi', 80, 1], ['car', 0, 0]]);
    expect(before.total).toBe(110);
    expect(item.amount).toBe(360);
  });

  it('CA11 / RG16 : une ligne liée à deux virements montre ses dépenses sous le premier (par jour)', () => {
    const d = started();
    transfer(d, lines('ali'), { day: 9, id: 'late' });
    transfer(d, lines('ali', 'loi'), { day: 2, id: 'early' });
    spend(d, 'a1', 'ali', 50);
    const done = principal(d).groups.find(x => x.id === 'virement')!.done;
    const byId = Object.fromEntries(done.map(x => [x.id, x]));
    expect(byId.early.lines!.find(l => l.key === 'ali')!.expenses).toHaveLength(1);
    expect(byId.late.lines!.find(l => l.key === 'ali')!.expenses).toHaveLength(0);
    expect(byId.late.lines!.find(l => l.key === 'ali')!.spent).toBe(50);
  });

  it('CA12 : le reste d’une ligne variable associée ne change pas', () => {
    const d = started();
    spend(d, 'a1', 'ali', 150);
    const before = leftOfLine(d, d.months[M].lines[0]);
    transfer(d, lines('ali', 'loi', 'car'));
    expect(leftOfLine(d, d.months[M].lines[0])).toBe(before);
    expect(d.months[M].lines[0].budget).toBe(200);
  });
});

describe('reprise des données (RG18, CA13)', () => {
  it('un virement avec target devient targets: [target], montants inchangés, idempotent', () => {
    const d = started();
    const legacy = { id: 'old', month: M, day: 2, label: 'Versement', amount: 25, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: BOU, target: { kind: 'line', key: 'ali' } };
    d.accountMovements = [legacy as never, { id: 'free', month: M, day: 3, label: 'Libre', amount: 5, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: BOU }];
    const out = migrateMovementTargets(d);
    expect(out.accountMovements![0]).toEqual({ id: 'old', month: M, day: 2, label: 'Versement', amount: 25, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: BOU, targets: [{ kind: 'line', key: 'ali' }] });
    expect(out.accountMovements![1]).not.toHaveProperty('targets');
    expect(d.accountMovements[0]).toHaveProperty('target');
    expect(migrateMovementTargets(out)).toBe(out);
  });

  it('le chargement convertit et enregistre', async () => {
    const d = started();
    d.accountMovements = [{ id: 'old', month: M, day: 2, label: 'Versement', amount: 25, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: BOU, target: { kind: 'line', key: 'ali' } } as never];
    let saved: BudgetData | null = null;
    const repo = { load: async () => d, save: async (x: BudgetData) => { saved = x; } };
    const { data } = await loadBudget(repo as never, () => emptyData());
    expect(data.accountMovements![0].targets).toEqual(lines('ali'));
    expect(saved).not.toBeNull();
  });
});

describe('lignes associées exclues du « à sortir » (RG17, CA17)', () => {
  const principal = (d: BudgetData) => accountComingUp(d, M, MAIN_ACCOUNT_ID, '2027-01-10')!;
  const keys = (d: BudgetData) => principal(d).groups.flatMap(g => g.items.map(x => x.id)).sort();

  it('une ligne associée n’est ni dans les éléments, ni dans le total, ni dans la marge', () => {
    const d = started();
    const before = principal(d);
    expect(keys(d)).toEqual(['ali', 'aut', 'car', 'edf', 'loi']);
    transfer(d, lines('ali', 'loi'));
    const after = principal(d);
    expect(keys(d)).toEqual(['aut', 'car', 'edf']);
    expect(after.total).toBe(before.total - 280);
    // The transfer leaves the real balance (−280) and the lines leave the rests (−280): no double count, so the margin does not move.
    expect(after.reference).toBe(before.reference! - 280);
    expect(after.margin).toBe(before.margin);
    expect(after.groups.find(g => g.id === 'virement')!.done).toHaveLength(1);
  });

  it('retirée du virement, elle redevient à sortir', () => {
    const d = started();
    const mv = transfer(d, lines('ali', 'loi'));
    setTransferTargets(d, mv.id, lines('ali'));
    expect(keys(d)).toContain('loi');
    expect(keys(d)).not.toContain('ali');
  });

  it('RG11 : une ligne supprimée du mois n’a plus d’effet (le lien est ignoré)', () => {
    const d = started();
    transfer(d, lines('ali'));
    d.months[M].lines = d.months[M].lines.filter(l => l.key !== 'ali');
    expect(keys(d)).toEqual(['aut', 'car', 'edf', 'loi']);
  });

  it('le reste de la ligne (écran Budget) ne change pas', () => {
    const d = started();
    transfer(d, lines('ali'));
    expect(leftOfLine(d, d.months[M].lines[0])).toBe(200);
  });
});
