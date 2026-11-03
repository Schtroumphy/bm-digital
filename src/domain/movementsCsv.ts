/** One exported row: the date (`YYYY-MM-DD`), the label, its category and the signed amount. */
export interface ExportRow {
  date: string;
  label: string;
  category: string;
  amount: number;
  /** Listed but not counted in the balance of the month (dated outside it, or before the budget). */
  outside?: boolean;
}

const money = (n: number) => n.toFixed(2).replace('.', ',');
const cell = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * CSV of the movements of an account for a month, to be compared with a bank statement outside the app: oldest first, dates as `JJ/MM/AAAA`,
 * separator `;`, decimal comma, debit and credit in two columns, both positive (as French spreadsheets expect). The `Hors solde` column flags the rows the balance does not count.
 */
export function movementsToCsv(rows: ExportRow[]): string {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const lines = sorted.map(r => [`${r.date.slice(8, 10)}/${r.date.slice(5, 7)}/${r.date.slice(0, 4)}`, cell(r.label), r.amount < 0 ? money(-r.amount) : '', r.amount > 0 ? money(r.amount) : '', cell(r.category), r.outside ? 'oui' : ''].join(';'));
  return ['Date;Libellé;Débit;Crédit;Catégorie;Hors solde', ...lines].join('\n');
}
