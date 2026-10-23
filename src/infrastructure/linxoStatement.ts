import type { StatementSource } from '../application/ports';
import { normalizeLabel, type StatementError, type StatementReading, type StatementRow } from '../domain/statement';

/*
 * Reader of the Linxo export (spec 0013, amendment 1). One fixed format: a header on the first line, then one record
 * per operation, columns separated by a tab (`;` as a fallback). The amount is signed in a single column. Fields may be
 * between quotes and hold line breaks. Handwritten (no dependency); pure: text in, `StatementReading` out.
 */

/** Names of the columns in the file, normalized (RG6, RG29). Another export would be another table here, and nowhere else. */
const COLUMNS = {
  date: ['date'],
  label: ['libelle'],
  amount: ['montant'],
  accountName: ['nom du compte'],
  connectionName: ['nom de la connexion'],
  category: ['categorie'],
  notes: ['notes'],
} as const;

type Column = keyof typeof COLUMNS;
/** Columns that must be in the header; the others are read when present. */
const REQUIRED: readonly Column[] = ['date', 'label', 'amount', 'accountName', 'connectionName'];
type ColumnIndexes = Partial<Record<Column, number>>;

const cellsOf = (line: string, separator: string) => line.replace(/^\uFEFF/, '').split(separator).map(c => c.replace(/"/g, '').trim());

/** Separator and columns of the header line, or null when it is not the header. Tab first, `;` as a fallback (RG29); names compared without accents, case or spaces around. */
function readHeader(line: string): { separator: string; columns: ColumnIndexes } | null {
  for (const separator of ['\t', ';']) {
    const cells = cellsOf(line, separator).map(normalizeLabel);
    const columns: ColumnIndexes = {};
    for (const column of Object.keys(COLUMNS) as Column[]) {
      const i = cells.findIndex(c => (COLUMNS[column] as readonly string[]).includes(c));
      if (i >= 0) columns[column] = i;
    }
    if (REQUIRED.every(c => columns[c] !== undefined)) return { separator, columns };
  }
  return null;
}

/** What the first line of the file holds, for the error message: the cells found with the separator that gives the most. */
function describeFirstLine(line: string): string {
  const best = ['\t', ';'].map(sep => cellsOf(line, sep)).sort((a, b) => b.length - a.length)[0];
  const shown = best.slice(0, 12).map(c => (c.length > 30 ? `${c.slice(0, 30)}…` : c || '(vide)'));
  return best.length < 2 ? `une seule colonne trouvée, ni tabulation ni « ; » : « ${shown[0] ?? ''} »` : `${best.length} colonnes trouvées : ${shown.join(' | ')}`;
}

interface RawRecord {
  fields: string[];
  /** The text ended inside quotes: the record is cut (RG5). */
  unterminated: boolean;
}

/** Splits text into records of fields: quoted fields may hold line breaks and doubled quotes. Blank records are dropped. */
function tokenize(text: string, separator: string): RawRecord[] {
  const records: RawRecord[] = [];
  let fields: string[] = [];
  let cur = '';
  let inQuotes = false;
  const endRecord = (unterminated: boolean) => {
    fields.push(cur);
    if (unterminated || fields.some(f => f.trim() !== '')) records.push({ fields, unterminated });
    fields = [];
    cur = '';
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c !== '"') cur += c;
      else if (text[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = false;
    } else if (c === '"' && cur === '') inQuotes = true;
    else if (c === separator) {
      fields.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord(false);
    } else cur += c;
  }
  if (inQuotes) endRecord(true);
  else if (cur !== '' || fields.length) endRecord(false);
  return records;
}

/** « -2,95 », « 217,8 », « 1600 », « 12.5 » → signed number. Null when the text is not an amount; no thousands separator is handled (RG30). */
function parseSignedAmount(raw: string): number | null {
  const s = raw.trim().replace('−', '-').replace('.', ',');
  if (!/^[+-]?\d+(,\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s.replace(',', '.')) * 100) / 100;
}

/** « 28/03/2026 » → « 2026-03-28 ». Null for a date that does not exist. */
function parseDate(raw: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const [day, month, year] = [+m[1], +m[2], +m[3]];
  const real = new Date(Date.UTC(year, month - 1, day));
  if (real.getUTCFullYear() !== year || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function parseLinxoStatement(text: string): StatementReading {
  const clean = text.replace(/^﻿/, '');
  if (clean.trim() === '') return { rows: [], errors: [], fileError: 'Le fichier est vide.' };

  // The header is the first line that has the required columns; a few lines before it are tolerated (RG29).
  let header: ReturnType<typeof readHeader> = null;
  let bodyStart = 0;
  let firstLine = '';
  for (let pos = 0, seen = 0; pos <= clean.length && !header && seen < 10; ) {
    const eol = clean.indexOf('\n', pos);
    const line = clean.slice(pos, eol < 0 ? clean.length : eol).trim();
    if (line !== '') {
      if (seen++ === 0) firstLine = line;
      header = readHeader(line);
    }
    bodyStart = eol < 0 ? clean.length : eol + 1;
    pos = eol < 0 ? clean.length + 1 : eol + 1;
  }
  if (!header) {
    return {
      rows: [], errors: [],
      fileError: `Format non reconnu : la ligne d’en-tête doit contenir au moins les colonnes Date, Libellé, Montant, Nom du compte et Nom de la connexion. Première ligne du fichier : ${describeFirstLine(firstLine)}.`,
    };
  }
  const { separator, columns } = header;
  const lastRequired = Math.max(...REQUIRED.map(c => columns[c]!));

  const rows: StatementRow[] = [];
  const errors: StatementError[] = [];
  tokenize(clean.slice(bodyStart), separator).forEach((r, i) => {
    const record = i + 1;
    const fail = (reason: string) => errors.push({ record, reason });
    if (r.unterminated) return fail('enregistrement tronqué (guillemet non fermé) : les lignes suivantes du fichier sont perdues, vérifiez le fichier');
    if (r.fields.length <= lastRequired) return fail('enregistrement tronqué (colonnes manquantes)');
    const cell = (c: Column) => (columns[c] === undefined ? '' : (r.fields[columns[c]!] ?? '').trim());
    const date = parseDate(cell('date'));
    if (!date) return fail('date invalide');
    const label = cell('label');
    if (!label) return fail('libellé vide');
    const [accountName, connectionName] = [cell('accountName'), cell('connectionName')];
    if (!accountName || !connectionName) return fail('nom de compte ou de connexion manquant');
    const signed = parseSignedAmount(cell('amount'));
    if (signed === null || signed === 0) return fail('montant invalide');
    rows.push({
      date, label, notes: cell('notes'), category: cell('category'), accountName, connectionName,
      amount: Math.abs(signed), direction: signed < 0 ? 'debit' : 'credit',
    });
  });
  return { rows, errors };
}

/** UTF-16 when the file starts with its byte order mark, or looks like it (every other byte is zero: Excel's « Texte Unicode »). */
function utf16Encoding(bytes: Uint8Array): 'utf-16le' | 'utf-16be' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  const head = bytes.subarray(0, 64);
  const zeros = (from: number) => head.filter((b, i) => i % 2 === from && b === 0).length;
  if (head.length >= 8 && zeros(1) > head.length / 4) return 'utf-16le';
  if (head.length >= 8 && zeros(0) > head.length / 4) return 'utf-16be';
  return null;
}

/** UTF-16 (BOM or detected), else UTF-8 (a BOM is dropped) when the bytes are valid UTF-8, else Windows-1252 (RG30). */
export function decodeStatement(bytes: Uint8Array): string {
  const utf16 = utf16Encoding(bytes);
  if (utf16) return new TextDecoder(utf16).decode(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** The Linxo export as a `StatementSource`. */
export const createLinxoStatementSource = (): StatementSource => ({ read: bytes => parseLinxoStatement(decodeStatement(bytes)) });
