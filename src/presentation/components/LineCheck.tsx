import { useState } from 'react';
import { checkLine, setLineSchedule, uncheckLine, updateCheck } from '../../application/checkoff';
import { EXEC_MODES, isLate, isPointable, lineCheck, lineCounted, lineTooltip } from '../../domain/checkoff';
import { money } from '../../domain/format';
import type { ExecMode, Line, MonthKey } from '../../domain/types';
import { useStore } from '../state/store';
import { Icon } from './Icon';

interface Props {
  month: MonthKey;
  line: Line;
  /** Month locked or not initialized: nothing can be changed (spec 0009, RG7). */
  locked: boolean;
  /** Today, `YYYY-MM-DD`. */
  today: string;
}

/** Checkbox « pointé » at the start of a line. Lines without a checkbox keep an empty slot so names stay aligned. */
export function LineCheckBox({ month, line, locked, today }: Props) {
  const { data, update } = useStore();
  if (!isPointable(data, line)) return <span className="check-slot" />;
  const done = !!lineCheck(data, month, line.key);
  const received = line.block === 'rev';
  const toggle = () => update(d => void (done ? uncheckLine(d, month, line.key) : checkLine(d, month, line.key)));
  return (
    <span
      className={`check${done ? ' is-on' : ''}${locked ? ' is-locked' : ''}`}
      title={[received ? (done ? 'Reçu : marquer non reçu' : 'Marquer reçu') : done ? 'Pointé : décocher' : 'Pointer : l’argent a bougé', lineTooltip(data, month, line, today)].filter(Boolean).join('\n')}
      onClick={locked ? undefined : toggle}
    >
      <Icon name="check" size={12} stroke={3.5} color="#fff" style={{ opacity: done ? 1 : 0 }} />
    </span>
  );
}

/**
 * After the name of a line: the « en retard » badge and a small calendar icon. The pointage information (checked date,
 * planned day, execution mode, amount counted) is in the tooltip of the whole row (`lineTooltip`, also on the checkbox and
 * the icon), so the narrow line never overflows onto the Budget / Réel columns (spec 0009, RG86).
 * Clicking opens the menu: date, amount counted (read only), planned day, execution mode, « Décocher ».
 */
export function LineCheckMeta({ month, line, locked, today }: Props) {
  const { data, update } = useStore();
  const [open, setOpen] = useState(false);
  const received = line.block === 'rev';
  const check = lineCheck(data, month, line.key);
  const late = isLate(data, month, line, today);
  const mode = EXEC_MODES.find(m => m.value === line.execMode);
  const hasInfo = !!check || line.dueDay !== undefined || !!mode;
  const tip = lineTooltip(data, month, line, today);
  const setSchedule = (patch: { dueDay?: number | null; execMode?: ExecMode | null }) => update(d => void setLineSchedule(d, month, line.key, patch));

  return (
    <>
      {late && <span className="late-badge">en retard</span>}
      <span className="acc-picker" onClick={e => e.stopPropagation()}>
        <span className={`check-meta${hasInfo ? '' : ' is-empty'}`} title={tip || 'Jour prévu, mode d’exécution'} onClick={() => setOpen(o => !o)}>
          <Icon name={check ? 'calendarCheck' : 'calendar'} size={12} stroke={2.2} />
        </span>
        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <div className="popmenu check-menu">
              <div className="popmenu-label">{line.name}</div>
              {check && (
                <>
                  <label className="check-field">
                    <span>{received ? 'Date de réception' : 'Date pointée'}</span>
                    <input type="date" disabled={locked} value={check.doneOn} onChange={e => e.target.value && update(d => void updateCheck(d, month, line.key, { doneOn: e.target.value }))} />
                  </label>
                  <div className="check-note">Montant compté : {money(lineCounted(data, line).amount)} ({lineCounted(data, line).source === 'actual' ? 'réel' : 'budget'})</div>
                </>
              )}
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
              {check && !locked && (
                <div
                  className="popmenu-item"
                  onClick={() => {
                    setOpen(false);
                    update(d => void uncheckLine(d, month, line.key));
                  }}
                >
                  {received ? 'Marquer non reçu' : 'Décocher'}
                </div>
              )}
            </div>
          </>
        )}
      </span>
    </>
  );
}
