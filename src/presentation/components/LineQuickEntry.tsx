import { useState } from 'react';
import { addLineEntry } from '../../application/quickEntry';
import { currentMonthKey, parseAmount, parseMonth, sanitizeAmountInput } from '../../domain/format';
import { daysInMonth } from '../../domain/checkoff';
import type { Line, MonthKey } from '../../domain/types';
import { newId, useStore } from '../state/store';
import { Icon } from './Icon';

/** Day proposed for an entry: today in the current month, else the last day of a past month or the first of a future one. */
function defaultDay(month: MonthKey) {
  const now = currentMonthKey();
  if (month === now) return new Date().getDate();
  if (month > now) return 1;
  const { year, month: m } = parseMonth(month);
  return new Date(year, m + 1, 0).getDate();
}

/**
 * « + Écriture » on a line of the Budget screen (spec 0019, RG21): a small icon, visible only when the row is hovered or has the keyboard focus,
 * drawn over the end of the name so the row never changes height or alignment. It opens a small form (amount, day, label) that records a real
 * entry on the account imposed by the line. Hidden when the month is locked or when the line cannot take an entry (savings line with no dedicated account).
 */
export function LineQuickEntry({ month, line, locked }: { month: MonthKey; line: Line; locked: boolean }) {
  const { update } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ amount: '', day: String(defaultDay(month)), label: '' });
  const savings = line.block === 'epa' || line.block === 'inv';
  if (locked || (savings && !line.linkedAccountId)) return null;
  const amount = parseAmount(form.amount) ?? 0;
  const day = Number(form.day);
  const valid = amount > 0 && Number.isInteger(day) && day >= 1 && day <= daysInMonth(month);
  const save = () => {
    if (!valid) return;
    update(d => void addLineEntry(d, month, line.key, { id: newId('t'), amount, day, label: form.label }));
    setOpen(false);
    setForm({ amount: '', day: String(defaultDay(month)), label: '' });
  };
  return (
    <>
      <button type="button" className="line-add" title="Ajouter une écriture" aria-label={`Ajouter une écriture sur ${line.name}`} onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
        <Icon name="plus" size={11} stroke={3} />
      </button>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popmenu check-menu line-add-menu" onClick={e => e.stopPropagation()}>
            <div className="popmenu-label">Nouvelle écriture · {line.name}</div>
            <label className="check-field">
              <span>Montant</span>
              <input autoFocus inputMode="decimal" value={form.amount} placeholder="0,00" onChange={e => setForm(f => ({ ...f, amount: sanitizeAmountInput(e.target.value) }))} onKeyDown={e => e.key === 'Enter' && save()} />
            </label>
            <label className="check-field">
              <span>Jour</span>
              <input inputMode="numeric" value={form.day} onChange={e => setForm(f => ({ ...f, day: e.target.value.replace(/\D/g, '') }))} onKeyDown={e => e.key === 'Enter' && save()} />
            </label>
            <label className="check-field">
              <span>Libellé</span>
              <input value={form.label} placeholder={line.name} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} onKeyDown={e => e.key === 'Enter' && save()} />
            </label>
            <div className={`popmenu-item${valid ? '' : ' is-disabled'}`} onClick={valid ? save : undefined}>Enregistrer</div>
            <div className="popmenu-item" onClick={() => setOpen(false)}>Fermer</div>
          </div>
        </>
      )}
    </>
  );
}
