import { useState } from 'react';
import { setLineSchedule } from '../../application/checkoff';
import { EXEC_MODES } from '../../domain/checkoff';
import { isLate, lineTooltip } from '../../domain/comingUp';
import type { ExecMode, Line, MonthKey } from '../../domain/types';
import { useStore } from '../state/store';
import { Icon } from './Icon';

interface Props {
  month: MonthKey;
  line: Line;
  /** Month locked or not initialized: nothing can be changed. */
  locked: boolean;
  /** Today, `YYYY-MM-DD`. */
  today: string;
}

/**
 * After the name of a line: the « en retard » badge and a small calendar icon. The planned day, the execution mode and the
 * late state are in the tooltip of the whole row (`lineTooltip`), so the narrow line never overflows onto the Budget / Réel columns.
 * Clicking the icon opens the menu: planned day and execution mode (spec 0009, RG12 of spec 0043).
 */
export function LineScheduleMeta({ month, line, locked, today }: Props) {
  const { data, update } = useStore();
  const [open, setOpen] = useState(false);
  const late = isLate(data, month, line, today);
  const mode = EXEC_MODES.find(m => m.value === line.execMode);
  const hasInfo = line.dueDay !== undefined || !!mode;
  const tip = lineTooltip(data, month, line, today);
  const setSchedule = (patch: { dueDay?: number | null; execMode?: ExecMode | null }) => update(d => void setLineSchedule(d, month, line.key, patch));

  return (
    <>
      {late && <span className="late-badge">en retard</span>}
      <span className="acc-picker" onClick={e => e.stopPropagation()}>
        <span className={`check-meta${hasInfo ? '' : ' is-empty'}`} title={tip || 'Jour prévu, mode d’exécution'} onClick={() => setOpen(o => !o)}>
          <Icon name="calendar" size={12} stroke={2.2} />
        </span>
        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <div className="popmenu check-menu">
              <div className="popmenu-label">{line.name}</div>
              <label className="check-field">
                <span>Jour prévu (1 à 31)</span>
                <input
                  key={line.dueDay ?? ''}
                  disabled={locked}
                  inputMode="numeric"
                  defaultValue={line.dueDay ?? ''}
                  onBlur={e => {
                    const t = e.target.value.trim();
                    const v = t === '' ? null : Number(t);
                    if (v === (line.dueDay ?? null)) return;
                    if (v === null || (Number.isInteger(v) && v >= 1 && v <= 31)) setSchedule({ dueDay: v });
                    else e.target.value = String(line.dueDay ?? '');
                  }}
                />
              </label>
              <label className="check-field">
                <span>Mode</span>
                <select disabled={locked} value={line.execMode ?? ''} onChange={e => setSchedule({ execMode: e.target.value === '' ? null : (e.target.value as ExecMode) })}>
                  <option value="">Non précisé</option>
                  {EXEC_MODES.map(m => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
      </span>
    </>
  );
}
