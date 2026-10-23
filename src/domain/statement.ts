/*
 * A bank statement once read (spec 0013): the lines of a file, whatever its format. Pure helpers shared by the
 * reader (infrastructure) and the import use cases (application): label normalization and fingerprint.
 */

/** One debit or credit of the file. */
export interface StatementRow {
  /** `YYYY-MM-DD`. */
  date: string;
  /** « Libellé » column: what is shown in the preview and stored as the label of the transaction (RG31). */
  label: string;
  /** « Notes » column: the bank's raw text, often (RG31). Empty when absent. */
  notes: string;
  /** « Catégorie » column given by the aggregator; empty when absent. Information only (RG37). */
  category: string;
  /** « Nom du compte » and « Nom de la connexion »: which account of the file the line belongs to (RG32). */
  accountName: string;
  connectionName: string;
  /** Positive. */
  amount: number;
  direction: 'debit' | 'credit';
}

/** A record that could not be read; never imported (RG5). */
export interface StatementError {
  /** Number of the record in the file, starting at 1, the header not counted. */
  record: number;
  reason: string;
}

export interface StatementReading {
  rows: StatementRow[];
  errors: StatementError[];
  /** The whole file is refused (no recognised header, empty file...): nothing is proposed (RG29). */
  fileError?: string;
}

/** Lowercase, no accents, whitespace and line breaks reduced to one space (RG20). */
export function normalizeLabel(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Complete label of a row: « Libellé » followed by « Notes » (RG31). It feeds the fingerprint, the rules and the nature detection. */
export const fullLabelOf = (row: Pick<StatementRow, 'label' | 'notes'>): string => `${row.label}\n${row.notes}`.trim();

/** Key of the account of the file a row belongs to: the pair (account name, connection name), as written in the file (RG32). */
export const accountPairKey = (accountName: string, connectionName: string): string => `${accountName.trim()}\u0001${connectionName.trim()}`;

/** A purchase date (« 21/10 ») or a masked card number (« X2222 », « 1234XXXXXX5678 ») in a label: what changes from one purchase to the next. */
const VARYING_PART = /\s*\b(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|X\d{3,}|\d{4}[\dX*]{4,})\b/i;

/**
 * Text proposed for « Mémoriser la règle » (RG18): the « Libellé » (else the notes), cut before the first date or card
 * number so that the rule matches the next purchases too. The user can still edit it.
 */
export function suggestedPattern(row: Pick<StatementRow, 'label' | 'notes'>): string {
  const base = (row.label.trim() || row.notes.trim()).replace(/\s+/g, ' ');
  const at = base.search(VARYING_PART);
  return (at < 0 ? base : base.slice(0, at).trim()) || base;
}

/** Fingerprint of a line: date + amount + normalized complete label, notes included; the category is left out (RG34, CA33a). */
export const fingerprintOf = (row: Pick<StatementRow, 'date' | 'amount' | 'label' | 'notes'>): string => `${row.date}|${row.amount.toFixed(2)}|${normalizeLabel(fullLabelOf(row))}`;

/** An entry of money whose label or notes speak of a transfer (« virement », « vir »): only a hint, it qualifies nothing (spec 0013, RG62). */
export const isTransferReceived = (row: Pick<StatementRow, 'label' | 'notes'>): boolean => /\b(virement|vir)\b/.test(normalizeLabel(fullLabelOf(row)));
