import { useState } from 'react';
import { isoDate } from '../../domain/checkoff';
import { parseAmount, sanitizeAmountInput } from '../../domain/format';
import { defaultEntryDate, isRealDate } from '../../domain/periods';
import type { MonthKey } from '../../domain/types';
import { useStore } from '../state/store';

export interface QuickEntryInput {
  amount: number;
  /** Real date of the entry, `YYYY-MM-DD` (spec 0039, RG11). */
  date: string;
  label: string;
}

/**
 * Small form « Nouvelle écriture · <name> » (amount, date, label), shared by the « + » of a budget line (spec 0019, RG21) and the « + » of the
 * dashboard (spec 0027, RG6, RG8). It only collects and validates the input; the caller records the entry. The form is mounted when opened, so it starts empty each time.
 */
export function QuickEntryPopup({ month, name, onSave, onClose }: { month: MonthKey; name: string; onSave: (input: QuickEntryInput) => void; onClose: () => void }) {
  const { data } = useStore();
  const [form, setForm] = useState({ amount: '', date: defaultEntryDate(data, month, isoDate()), label: '' });
  const amount = parseAmount(form.amount) ?? 0;
  const valid = amount > 0 && isRealDate(form.date);
  const save = () => {
    if (valid) onSave({ amount, date: form.date, label: form.label });
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
          <span>Date</span>
          <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} onKeyDown={e => e.key === 'Enter' && save()} />
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
