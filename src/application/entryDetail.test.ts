import { describe, expect, it } from 'vitest';
import { setAccountMovementDetail, updateAccountMovement } from './accountMovements';
import { addTransaction, setTransactionDetail } from './actions';
import { prepareImport, validateImport } from './statementImport';
import { Ledger } from '../domain/ledger';
import { monthSummary } from '../domain/budget';
import { CASH_ACCOUNT_ID, MAIN_ACCOUNT_ID } from '../domain/bank';
import { seedData } from '../domain/seed';
import type { StatementRow } from '../domain/statement';

const M = '2026-12';
const tx = (id: string, extra: { detail?: string } = {}) => ({ id, month: M, day: 3, label: 'Pharmacie', amount: 23.4, type: 'var' as const, target: 'v-ali', ...extra });
const movements = () => [
  { id: 'm1', month: M, day: 8, label: 'Retrait', amount: 40, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID, detail: 'Pour le marché' },
  { id: 'm2', month: M, day: 8, label: 'Retrait', amount: 40, fromAccountId: MAIN_ACCOUNT_ID, toAccountId: CASH_ACCOUNT_ID, detail: 'Autre' },
];

describe('détail des écritures (spec 0020)', () => {
  it('CA1 : addTransaction enregistre le détail', () => {
    const d = seedData();
    addTransaction(d, tx('a', { detail: 'Ordonnance du Dr Martin' }));
    expect(d.transactions.find(t => t.id === 'a')!.detail).toBe('Ordonnance du Dr Martin');
  });

  it('CA3 et CA4 : limité à 200, et un détail vide ou fait d’espaces n’est pas écrit', () => {
    const d = seedData();
    addTransaction(d, tx('long', { detail: 'x'.repeat(300) }));
    addTransaction(d, tx('blank', { detail: '   ' }));
    addTransaction(d, tx('none'));
    expect(d.transactions.find(t => t.id === 'long')!.detail).toHaveLength(200);
    expect(d.transactions.find(t => t.id === 'blank')).not.toHaveProperty('detail');
    expect(d.transactions.find(t => t.id === 'none')).not.toHaveProperty('detail');
  });

  it('CA5 : modifier ou vider le détail d’une transaction ne touche rien d’autre', () => {
    const d = seedData();
    addTransaction(d, tx('a', { detail: 'avant' }));
    const before = { ...d.transactions.find(t => t.id === 'a')! };
    expect(setTransactionDetail(d, 'a', ' après ')).toBe(true);
    expect(d.transactions.find(t => t.id === 'a')).toEqual({ ...before, detail: 'après' });
    expect(setTransactionDetail(d, 'a', '  ')).toBe(true);
    const cleared = d.transactions.find(t => t.id === 'a')!;
    expect(cleared).not.toHaveProperty('detail');
    expect(cleared).toEqual({ ...before, detail: undefined });
    expect(setTransactionDetail(d, 'inconnu', 'x')).toBe(false);
  });

  it('CA5 : idem pour un mouvement entre comptes, y compris par updateAccountMovement', () => {
    const d = seedData();
    d.accountMovements = movements();
    setAccountMovementDetail(d, 'm1', ' Nouveau ');
    expect(d.accountMovements[0]).toEqual({ ...movements()[0], detail: 'Nouveau' });
    expect(updateAccountMovement(d, 'm1', { label: 'Retrait DAB', amount: 45, detail: '' })).toBe(true);
    expect(d.accountMovements[0]).toMatchObject({ label: 'Retrait DAB', amount: 45 });
    expect(d.accountMovements[0]).not.toHaveProperty('detail');
    // Sans `detail` dans la modification, le détail existant est conservé.
    d.accountMovements[1].detail = 'Garde-moi';
    updateAccountMovement(d, 'm2', { label: 'Retrait', amount: 41 });
    expect(d.accountMovements[1].detail).toBe('Garde-moi');
  });

  it('CA6 : le détail d’un mouvement ne change pas celui d’un autre', () => {
    const d = seedData();
    d.accountMovements = movements();
    setAccountMovementDetail(d, 'm1', 'Changé');
    expect(d.accountMovements[1].detail).toBe('Autre');
  });

  it('RG11 : le détail reste modifiable sur un mois clôturé, mais pas le libellé ni le montant', () => {
    const d = seedData();
    addTransaction(d, tx('a'));
    d.accountMovements = movements();
    d.months[M].closed = true;
    expect(setTransactionDetail(d, 'a', 'info')).toBe(true);
    expect(setAccountMovementDetail(d, 'm1', 'info')).toBe(true);
    expect(updateAccountMovement(d, 'm1', { label: 'x', amount: 1, detail: 'y' })).toBe(false);
    expect(d.accountMovements[0].detail).toBe('info');
  });

  it('CA10 : le détail ne change aucun chiffre (soldes, budget)', () => {
    const plain = seedData();
    const detailed = seedData();
    for (const d of [plain, detailed]) {
      addTransaction(d, tx('a', d === detailed ? { detail: 'Ordonnance' } : {}));
      d.accountMovements = movements().map(m => (d === plain ? { id: m.id, month: m.month, day: m.day, label: m.label, amount: m.amount, fromAccountId: m.fromAccountId, toAccountId: m.toAccountId } : m));
    }
    const figures = (d: ReturnType<typeof seedData>) => {
      const l = new Ledger(d);
      return { summary: monthSummary(d, l, M), main: l.bankMonth(MAIN_ACCOUNT_ID, M), cash: l.bankMonth(CASH_ACCOUNT_ID, M) };
    };
    expect(figures(detailed)).toEqual(figures(plain));
  });

  it('CA7 : modifier le détail d’une écriture importée ne la rend pas « nouvelle » au réimport', () => {
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
    expect(setTransactionDetail(d, imported.id, 'Ajouté après coup')).toBe(true);
    expect(imported).toMatchObject({ fingerprint, rank, detail: 'Ajouté après coup' });
    const again = prepareImport(d, reading);
    expect(again.lines.map(l => l.duplicate)).toEqual([true]);
    expect(d.transactions.find(t => t.id === imported.id)!.detail).toBe('Ajouté après coup');
  });
});
