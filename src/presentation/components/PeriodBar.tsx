import { useState } from 'react';
import { budgetStartNeedsConfirmation, isBudgetStartEditable, isPeriodEndEditable, setBudgetStart, setPeriodEnd, LOCKED_END, LOCKED_START } from '../../application/periods';
import { addMonths, monthLabel } from '../../domain/format';
import { budgetStartBounds, fullDate, isRealDate, periodEndBounds, periodOf, validateBudgetStart, validatePeriodEnd } from '../../domain/periods';
import type { MonthKey } from '../../domain/types';
import { useStore } from '../state/store';

/**
 * Period of the month shown in the Comptes tab (spec 0039): « du 29/09/2026 au 29/10/2026 ». The start of a month is read-only (the day after the end of the
 * previous one), except the start of the first month, which is the start of the budget; the end is a date field checked on the spot (RG4) and locked on a
 * closed or locked month (RG8). With no date typed, the period is the calendar month.
 */
export function PeriodBar({ month }: { month: MonthKey }) {
  const { data, update } = useStore();
  const [error, setError] = useState<string | null>(null);
  if (data.firstMonth === null || month < data.firstMonth) return null;
  const period = periodOf(data, month);
  const isFirst = month === data.firstMonth;
  const endEditable = isPeriodEndEditable(data, month);
  const startEditable = isBudgetStartEditable(data);
  const hasTypedEnd = !!data.months[month]?.endDate;
  const bounds = periodEndBounds(data, month);
  const startBounds = budgetStartBounds(data);

  const changeEnd = (value: string) => {
    if (!isRealDate(value)) return;
    const refused = validatePeriodEnd(data, month, value);
    setError(refused);
    if (!refused) update(d => void setPeriodEnd(d, month, value));
  };
  const changeStart = (value: string) => {
    if (!isRealDate(value) || value === period.start) return;
    const refused = validateBudgetStart(data, value);
    setError(refused);
    if (refused) return;
    if (budgetStartNeedsConfirmation(data, value) && !window.confirm(`Les soldes de départ saisis seront désormais considérés au ${fullDate(value).slice(0, 5)}. Continuer ?`)) return;
    update(d => void setBudgetStart(d, value));
  };
  const resetEnd = () => {
    setError(null);
    update(d => void setPeriodEnd(d, month, null));
  };
  const resetStart = () => {
    setError(null);
    if (budgetStartNeedsConfirmation(data, null) && !window.confirm(`Les soldes de départ saisis seront désormais considérés au 1er ${monthLabel(month).toLowerCase().split(' ')[0]}. Continuer ?`)) return;
    update(d => void setBudgetStart(d, null));
  };

  return (
    <div className="panel kpi cpt-period" aria-label={`Période de ${monthLabel(month)}`}>
      <div className="kpi-label cpt-label-tip">
        Période de {monthLabel(month).toLowerCase()}
        <span className="cpt-tip" title="Le mois du budget court de la date de début à la date de fin. Les soldes et les mouvements de l’onglet Comptes sont calculés sur cette période. Le début d’un mois est le lendemain de la fin du précédent." aria-label="Voir l’explication">i</span>
      </div>
      <div className="cpt-period-row">
        <span>du</span>
        {isFirst ? (
          <>
            <input
              className="text-input"
              type="date"
              aria-label="Début du budget"
              title={startEditable ? 'Début du budget : date du solde de départ des comptes ouverts dès le début du budget' : LOCKED_START}
              value={period.start}
              min={startBounds?.min}
              max={startBounds?.max}
              disabled={!startEditable}
              onChange={e => changeStart(e.target.value)}
            />
            {data.settings.startDate && startEditable && <span className="btn-quiet" onClick={resetStart}>1er du mois</span>}
          </>
        ) : (
          <b title={`Lendemain de la fin de ${monthLabel(addMonths(month, -1)).toLowerCase()}`}>{fullDate(period.start)}</b>
        )}
        <span>au</span>
        <input
          className="text-input"
          type="date"
          aria-label="Fin de la période"
          title={endEditable ? undefined : LOCKED_END}
          value={period.end}
          min={bounds?.min}
          max={bounds?.max}
          disabled={!endEditable}
          onChange={e => changeEnd(e.target.value)}
        />
        {hasTypedEnd && endEditable && <span className="btn-quiet" onClick={resetEnd}>Par défaut</span>}
        {!endEditable && <span className="muted is-small">Mois clos</span>}
      </div>
      {error && <div className="env-tile-error">{error}</div>}
    </div>
  );
}
