import { useState } from 'react';
import { daysInMonth } from '../../domain/checkoff';
import { currentMonthKey, parseAmount, parseMonth, sanitizeAmountInput } from '../../domain/format';
import type { MonthKey } from '../../domain/types';

/** Day proposed for an entry: today in the current month, else the last day of a past month or the first of a future one. */
function defaultDay(month: MonthKey) {
  const now = currentMonthKey();
  if (month === now) return new Date().getDate();
  if (month > now) return 1;
  const { year, month: m } = parseMonth(month);
  return new Date(year, m + 1, 0).getDate();
}

export interface QuickEntryInput {
  amount: number;
  day: number;
  label: string;
}

/**
 * Small form « Nouvelle écriture · <name> » (amount, day, label), shared by the « + » of a budget line (spec 0019, RG21) and the « + » of the
 * dashboard (spec 0027, RG6, RG8). It only collects and validates the input; the caller records the entry. The form is mounted when opened, so it starts empty each time.
 */
export function QuickEntryPopup({ month, name, onSave, onClose }: { month: MonthKey; name: string; onSave: (input: QuickEntryInput) => void; onClose: () => void }) {
  const [form, setForm] = useState({ amount: '', day: String(defaultDay(month)), label: '' });
  const amount = parseAmount(form.amount) ?? 0;
  const day = Number(form.day);
  const valid = amount > 0 && Number.isInteger(day) && day >= 1 && day <= daysInMonth(month);
  const save = () => {
    if (valid) onSave({ amount, day, label: form.label });
  };
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="popmenu check-menu line-add-menu" onClick={e => e.stopPropagation()}>
        <div className="popmenu-label">Nouvelle écriture · {name}</div>
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
          <input value={form.label} placeholder={name} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} onKeyDown={e => e.key === 'Enter' && save()} />
        </label>
        <div className={`popmenu-item${valid ? '' : ' is-disabled'}`} onClick={valid ? save : undefined}>Enregistrer</div>
        <div className="popmenu-item" onClick={onClose}>Fermer</div>
      </div>
    </>
  );
}
