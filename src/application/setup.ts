import { round2 } from '../domain/format';
import type { MonthKey } from '../domain/types';

/*
 * Draft of the « Démarrage » assistant: what the user typed so far, before
 * the first month exists. Everything here is a pure function over plain data,
 * so it can be saved as JSON and tested without React.
 */

/** The six editable lists of the assistant (steps 2 to 7). */
export type SetupListId = 'rev' | 'cre' | 'dep' | 'epa' | 'env' | 'inv';
export const SETUP_LISTS: SetupListId[] = ['rev', 'cre', 'dep', 'epa', 'env', 'inv'];

/** `fix`/`var` for expenses, `LT`/`MT` (long / moyen terme) for savings. */
export type SetupKind = 'fix' | 'var' | 'LT' | 'MT';

/** One typed line. Which fields are used depends on the list (see the columns of each step). */
export interface SetupRow {
  id: string;
  name: string;
  kind?: SetupKind;
  /** Monthly amount: income, payment, budget, transfer or allocation. */
  amount: number;
  /** Balance on the first day of the first month (savings, envelopes, investments). */
  balance: number;
  /** Envelopes only: part of the balance held in cash. */
  cash: number;
}

export interface SetupDraft {
  /** Index of the current step, 0 to 7. */
  step: number;
  /** First month of the budget. */
  month: MonthKey;
  rows: Record<SetupListId, SetupRow[]>;
}

/** Builds ids for new rows; injected so this file does not depend on the UI. */
export type IdFactory = (prefix: string) => string;

export const emptyDraft = (month: MonthKey): SetupDraft => ({
  step: 0,
  month,
  rows: { rev: [], cre: [], dep: [], epa: [], env: [], inv: [] },
});

const DEFAULT_KIND: Partial<Record<SetupListId, SetupKind>> = { dep: 'fix', epa: 'LT' };

const newRow = (list: SetupListId, id: string, name = '', kind = DEFAULT_KIND[list]): SetupRow => ({
  id,
  name,
  ...(kind ? { kind } : {}),
  amount: 0,
  balance: 0,
  cash: 0,
});

const withRows = (d: SetupDraft, list: SetupListId, rows: SetupRow[]): SetupDraft => ({ ...d, rows: { ...d.rows, [list]: rows } });

export const addRow = (d: SetupDraft, list: SetupListId, mkId: IdFactory): SetupDraft =>
  withRows(d, list, [...d.rows[list], newRow(list, mkId('s'))]);

export const updateRow = (d: SetupDraft, list: SetupListId, id: string, patch: Partial<Omit<SetupRow, 'id'>>): SetupDraft =>
  withRows(d, list, d.rows[list].map(r => (r.id === id ? { ...r, ...patch } : r)));

export const removeRow = (d: SetupDraft, list: SetupListId, id: string): SetupDraft =>
  withRows(d, list, d.rows[list].filter(r => r.id !== id));

/** Suggested lines of each step (names only, amounts are left to fill in). */
export const SUGGESTIONS: Record<SetupListId, { name: string; kind?: SetupKind }[]> = {
  rev: ['Salaire', 'Prêt Manioune', 'Remboursement', 'Prime', 'Autres'].map(name => ({ name })),
  cre: ['CRN …108', 'CRN …109', 'CRN …110', 'Assurance de prêt', 'Ass. habitation', 'Ass. protection juridique'].map(name => ({ name })),
  dep: [
    ...['Compte joint', 'Netflix', 'TAN', 'Spliit', 'Salle de sport', 'Frais bancaires'].map(name => ({ name, kind: 'fix' as const })),
    ...['Alimentation', 'Loisirs', 'Snacks', 'Déjeuners', 'Carburant', 'Swile'].map(name => ({ name, kind: 'var' as const })),
  ],
  epa: [
    { name: 'Livret A', kind: 'LT' },
    { name: 'LDDS Travaux', kind: 'LT' },
    { name: 'Lydia Holidays', kind: 'MT' },
    { name: 'Vacances Mada', kind: 'MT' },
    { name: 'Vacances copines', kind: 'MT' },
  ],
  env: ['Perso', 'Santé', 'Love ones', 'Voiture', 'Impôts', 'Projets'].map(name => ({ name })),
  inv: ['Assurance Vie', 'PEA', 'Trade Republic', 'PERCOL', 'PEG'].map(name => ({ name })),
};

export const addSuggested = (d: SetupDraft, list: SetupListId, mkId: IdFactory): SetupDraft =>
  withRows(d, list, [...d.rows[list], ...SUGGESTIONS[list].map(s => newRow(list, mkId('s'), s.name, s.kind ?? DEFAULT_KIND[list]))]);

/** « Remplir avec un exemple »: a small complete budget, then step 2. */
export function exampleDraft(month: MonthKey, mkId: IdFactory): SetupDraft {
  const r = (name: string, o: Partial<SetupRow> = {}): SetupRow => ({ id: mkId('s'), name, amount: 0, balance: 0, cash: 0, ...o });
  return {
    step: 1,
    month,
    rows: {
      rev: [r('Salaire', { amount: 6500 }), r('Prêt Manioune', { amount: 800 }), r('Remboursement', { amount: 350 })],
      cre: [r('CRN …108', { amount: 612 }), r('CRN …109', { amount: 485 }), r('Assurance de prêt', { amount: 58 })],
      dep: [
        r('Compte joint', { kind: 'fix', amount: 400 }),
        r('Netflix', { kind: 'fix', amount: 17.99 }),
        r('Alimentation', { kind: 'var', amount: 380 }),
        r('Loisirs', { kind: 'var', amount: 120 }),
      ],
      epa: [
        r('Livret A', { kind: 'LT', balance: 9800, amount: 400 }),
        r('LDDS Travaux', { kind: 'LT', balance: 4150, amount: 100 }),
        r('Lydia Holidays', { kind: 'MT', balance: 640, amount: 100 }),
      ],
      env: [
        r('Perso', { balance: 342, cash: 120, amount: 100 }),
        r('Santé', { balance: 40, cash: 40, amount: 100 }),
        r('Love ones', { balance: 185, cash: 85, amount: 100 }),
        r('Voiture', { balance: 520, cash: 0, amount: 100 }),
        r('Impôts', { balance: 1240, cash: 0, amount: 100 }),
        r('Projets', { balance: 275, cash: 75, amount: 100 }),
      ],
      inv: [r('Assurance Vie', { balance: 4820, amount: 100 }), r('PEA', { balance: 5310, amount: 150 })],
    },
  };
}

const sum = (rows: SetupRow[], f: (r: SetupRow) => number) => round2(rows.reduce((s, r) => s + f(r), 0));

export interface SetupSummary {
  income: number;
  credits: number;
  expenses: number;
  /** Monthly transfers to savings and investments. */
  saved: number;
  allocated: number;
  /** Reste à placer. */
  remaining: number;
  savingsBalance: number;
  envelopesBalance: number;
  investBalance: number;
  totalBalance: number;
  /** Lists left without any line. */
  emptyLists: SetupListId[];
}

/** Figures of the recap step. Reste à placer = revenus − crédits − dépenses − (épargnes + investissements) − enveloppes. */
export function setupSummary(d: SetupDraft): SetupSummary {
  const amount = (id: SetupListId) => sum(d.rows[id], r => r.amount);
  const income = amount('rev');
  const credits = amount('cre');
  const expenses = amount('dep');
  const saved = round2(amount('epa') + amount('inv'));
  const allocated = amount('env');
  const savingsBalance = sum(d.rows.epa, r => r.balance);
  const envelopesBalance = sum(d.rows.env, r => r.balance);
  const investBalance = sum(d.rows.inv, r => r.balance);
  return {
    income,
    credits,
    expenses,
    saved,
    allocated,
    remaining: round2(income - credits - expenses - saved - allocated),
    savingsBalance,
    envelopesBalance,
    investBalance,
    totalBalance: round2(savingsBalance + envelopesBalance + investBalance),
    emptyLists: SETUP_LISTS.filter(id => d.rows[id].length === 0),
  };
}

/** Envelopes whose cash part exceeds their starting balance (warning only, never blocking). */
export const cashExceedsBalance = (r: SetupRow) => r.cash > r.balance;
export const hasCashOverflow = (d: SetupDraft) => d.rows.env.some(cashExceedsBalance);

/** Reads a draft back from storage; anything malformed gives `null` so the caller starts clean. */
export function parseDraft(raw: unknown): SetupDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Partial<SetupDraft>;
  if (typeof o.step !== 'number' || !Number.isInteger(o.step) || o.step < 0 || o.step > 7 || typeof o.month !== 'string' || typeof o.rows !== 'object' || o.rows === null) return null;
  const rows = o.rows as Partial<Record<SetupListId, SetupRow[]>>;
  if (!SETUP_LISTS.every(id => Array.isArray(rows[id]))) return null;
  return o as SetupDraft;
}
