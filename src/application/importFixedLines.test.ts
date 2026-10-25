import { describe, expect, it } from 'vitest';
import { lineStates } from './importFilters';
import { lineProblem, prepareImport, validateImport, type PreviewLine } from './statementImport';
import { MAIN_ACCOUNT_ID, defaultBankAccounts, newEnvelopeAccount } from '../domain/bank';
import { emptyData } from '../domain/empty';
import type { StatementRow } from '../domain/statement';
import type { BudgetData, Line } from '../domain/types';

const M = '2026-10';
const SWILE = 'acc-swile';
const PAIR = ['Compte Courant (x1111)', 'Banque Test'] as const;
const ENV_PAIR = ['Compte Vacances (x0001)', 'Banque Test'] as const;
let seq = 0;
const newId = (p: string) => `${p}${++seq}`;
const ln = (key: string, block: Line['block'], extra: Partial<Line> = {}): Line => ({ key, block, section: '', name: key, budget: 60, actual: null, ...extra });
const row = (label: string, amount: number, extra: { date?: string; pair?: readonly [string, string] } = {}): StatementRow => {
  const pair = extra.pair ?? PAIR;
  return { date: extra.date ?? '2026-10-05', label, notes: '', category: '', accountName: pair[0], connectionName: pair[1], amount, direction: 'debit' };
};

function budget(lines: Line[]): BudgetData {
  const d = emptyData();
  d.firstMonth = M;
  d.accounts = [...defaultBankAccounts('2026-09'), { id: SWILE, name: 'Swile', hue: 10, isDefault: false, openingBalance: 0, openingMonth: '2026-09', inBudget: true, archived: false }, newEnvelopeAccount('acc-env-vac', 'vac', 'Vacances', 200, 0, '2026-09')];
  d.envelopes = [{ id: 'vac', name: 'Vacances', hue: 200, openingCash: 0, accountId: 'acc-env-vac' }];
  d.months[M] = { initialized: true, lines, alloc: {}, transfersDone: {} };
  d.importAccountLinks = [
    { id: 'l1', accountName: PAIR[0], connectionName: PAIR[1], accountId: MAIN_ACCOUNT_ID },
    { id: 'l2', accountName: ENV_PAIR[0], connectionName: ENV_PAIR[1], accountId: 'acc-env-vac' },
  ];
  return d;
}
const prep = (d: BudgetData, rows: StatementRow[]) => prepareImport(d, { rows, errors: [] });
const toLine = (key: string) => (l: PreviewLine): PreviewLine => ({ ...l, target: { kind: 'line', key } });

describe('import vers une ligne fixe ou crédit (spec 0014)', () => {
  it('CA18/RG3: seules les lignes du compte résolu sont ciblables ; la cible d’un autre compte est refusée', () => {
    const d = budget([ln('edf', 'fix'), ln('cant', 'fix', { accountId: SWILE }), ln('pret', 'cre')]);
    const l = prep(d, [row('PRLV EDF', 62)]).lines[0];
    expect(lineProblem(d, toLine('edf')(l))).toBeNull();
    expect(lineProblem(d, toLine('pret')(l))).toBeNull();
    expect(lineProblem(d, toLine('cant')(l))).toBe('À rattacher');
    expect(lineProblem(d, toLine('inconnue')(l))).toBe('À rattacher');
  });

  it('CA19: une ligne d’un compte d’enveloppe n’accepte aucune ligne fixe ou crédit', () => {
    const d = budget([ln('edf', 'fix', { accountId: 'acc-env-vac' }), ln('pret', 'cre')]);
    const l = prep(d, [row('X', 5, { pair: ENV_PAIR })]).lines[0];
    expect(lineProblem(d, toLine('edf')(l))).toBe('À rattacher');
    expect(lineProblem(d, toLine('pret')(l))).toBe('À rattacher');
  });

  it('crée une transaction fix au compte de la ligne, importAccountId du fichier, et alimente le réel', () => {
    const d = budget([ln('edf', 'fix')]);
    const p = prep(d, [row('PRLV EDF', 62)]);
    const batch = validateImport(d, { ...p, lines: p.lines.map(toLine('edf')) }, newId);
    expect(batch.expenses).toBe(1);
    expect(d.transactions[0]).toMatchObject({ type: 'fix', target: 'edf', accountId: MAIN_ACCOUNT_ID, importAccountId: MAIN_ACCOUNT_ID, rank: 1 });
    expect(d.months[M].lines[0].actual).toBe(62);
  });

  it('CA23: deux lignes du fichier sur la même ligne s’additionnent', () => {
    const d = budget([ln('edf', 'fix')]);
    const p = prep(d, [row('PRLV EDF', 62), row('PRLV EDF 2', 10, { date: '2026-10-06' })]);
    validateImport(d, { ...p, lines: p.lines.map(toLine('edf')) }, newId);
    expect(d.transactions).toHaveLength(2);
    expect(d.months[M].lines[0].actual).toBe(72);
  });

  it('CA20 (0019) : plus de « Réel saisi à remplacer » ; le réel de chaque ligne est la somme de ses écritures importées', () => {
    const d = budget([ln('edf', 'fix', { actual: 60 }), ln('gaz', 'fix')]);
    const p0 = prep(d, [row('PRLV EDF', 62), row('PRLV EDF 2', 3, { date: '2026-10-06' }), row('PRLV GAZ', 41)]);
    const p = { ...p0, lines: p0.lines.map(l => toLine(l.row.label.includes('GAZ') ? 'gaz' : 'edf')(l)) };
    expect(lineStates(d, p.lines.find(l => l.row.label === 'PRLV EDF')!)).not.toContain('reel_remplace');
    const done = validateImport(d, p, newId);
    expect(done.expenses).toBe(3);
    expect(done.failedIds).toEqual([]);
    expect(d.months[M].lines[0].actual).toBe(65);
    expect(d.months[M].lines[1].actual).toBe(41);
  });

  it('CA21: une règle mémorisée préremplit la cible ; elle est ignorée si la ligne manque du mois ou est d’un autre compte', () => {
    const d = budget([ln('edf', 'fix'), ln('cant', 'fix', { accountId: SWILE })]);
    d.importRules = [{ id: 'r', pattern: 'edf', nature: 'depense', target: { kind: 'line', key: 'edf' } }];
    expect(prep(d, [row('PRLV EDF', 62)]).lines[0].target).toEqual({ kind: 'line', key: 'edf' });
    expect(prep(d, [row('PRLV EDF', 62, { date: '2026-11-05' })]).lines[0].target).toBeNull();
    d.importRules = [{ id: 'r', pattern: 'edf', nature: 'depense', target: { kind: 'line', key: 'cant' } }];
    expect(prep(d, [row('PRLV EDF', 62)]).lines[0].target).toBeNull();
  });

  it('CA17 import: une règle « Mémoriser » vers une ligne fixe est enregistrée', () => {
    const d = budget([ln('edf', 'fix')]);
    const p = prep(d, [row('PRLV EDF', 62)]);
    validateImport(d, { ...p, lines: p.lines.map(l => ({ ...toLine('edf')(l), remember: 'prlv edf' })) }, newId);
    expect(d.importRules).toEqual([expect.objectContaining({ pattern: 'prlv edf', target: { kind: 'line', key: 'edf' } })]);
  });

  it('CA24: au réimport, la dépense est un doublon', () => {
    const d = budget([ln('edf', 'fix')]);
    const p = prep(d, [row('PRLV EDF', 62)]);
    validateImport(d, { ...p, lines: p.lines.map(toLine('edf')) }, newId);
    expect(prep(d, [row('PRLV EDF', 62)]).lines[0]).toMatchObject({ duplicate: true, checked: false });
  });
});
