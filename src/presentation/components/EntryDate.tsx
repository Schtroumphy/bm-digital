import { dayLabel, monthLabel } from '../../domain/format';
import { bankDateOf, isDateDeduced } from '../../domain/lineExpenses';
import { budgetStart, fullDate, inPeriod, isBeforeBudget } from '../../domain/periods';
import { useStore } from '../state/store';

/** Why an entry dated before the start of the budget is in no balance (spec 0039, RG17). */
export function outOfPeriodReason(start: string): string {
  return `Hors période : datée avant le début du budget (${fullDate(start)}), cette écriture n’est comptée dans aucun solde. Elle garde sa date et son rattachement.`;
}

/**
 * Date of an entry in the lists of the Saisie screen: its bank date, with a tooltip for what the date does not say by itself (spec 0039): the month of
 * attachment when the date is in the period of another month (spec 0015, RG4; RG18), « date déduite du jour » for an entry with no recorded date (RG11a),
 * and the « Hors période » badge for a date before the start of the budget (RG17, RG21a).
 */
export function EntryDate({ entry, attachedWord }: { entry: { month: string; day: number; bankDate?: string }; attachedWord: 'Rattachée' | 'Rattaché' }) {
  const { data } = useStore();
  const date = bankDateOf(entry, data);
  const start = budgetStart(data);
  const before = isBeforeBudget(data, date);
  const tips = [
    !inPeriod(data, entry.month, date) ? `${attachedWord} à ${monthLabel(entry.month).toLowerCase()}` : null,
    isDateDeduced(entry) ? 'Date déduite du jour' : null,
    before && start ? outOfPeriodReason(start) : null,
  ].filter(Boolean);
  return (
    <>
      <span className="muted" title={tips.length ? tips.join('\n') : undefined}>{dayLabel(date.slice(0, 7), Number(date.slice(8, 10)))}</span>
      {before && <span className="cpt-tag" style={{ marginLeft: 6, opacity: 0.75 }} title={start ? outOfPeriodReason(start) : undefined}>Hors période</span>}
    </>
  );
}
