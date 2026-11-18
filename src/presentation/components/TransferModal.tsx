import { useEffect, useRef, useState } from 'react';
import { transferAccountChoices, transferLocks, transferTargetChoices } from '../../domain/accountTransfers';
import { money, parseAmount } from '../../domain/format';
import type { BudgetData, Line, MonthKey } from '../../domain/types';
import { AccountDot } from './AccountPicker';
import { Menu } from './Menu';

/** The values the form hands back; the use case validates them again (RG24). */
export interface TransferFormValues {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  dueDay?: number;
  label: string;
}

/**
 * Form of a transfer between accounts (spec 0050, RG23, RG24, RG27): creation, or edition of `line` with « Supprimer ». `onSave` and `onDelete` return the
 * refusal message of the use case, or null when it is done (the modal then closes). Fields the line locks are greyed with their reason.
 */
export function TransferModal({ data, month, line, onSave, onDelete, onClose }: {
  data: BudgetData;
  month: MonthKey;
  line?: Line;
  onSave: (v: TransferFormValues) => string | null;
  onDelete?: () => string | null;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(line?.accountId ?? '');
  const [to, setTo] = useState(line?.linkedAccountId ?? '');
  const [amount, setAmount] = useState(line ? String(line.budget).replace('.', ',') : '');
  const [day, setDay] = useState(line?.dueDay !== undefined ? String(line.dueDay) : '');
  const [label, setLabel] = useState(line?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  // Focus goes to the first usable field on opening, and back to the opener on closing.
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.querySelector<HTMLElement>('[tabindex="0"]:not([aria-disabled="true"]), input:not(:disabled)')?.focus();
    return () => opener?.focus();
  }, []);
  const locks = line ? transferLocks(data, month, line) : null;
  // An account of the line stays offered as the current one, even archived since.
  const withCurrent = (list: ReturnType<typeof transferAccountChoices>, id?: string) => (id && !list.some(a => a.id === id) && data.accounts.some(a => a.id === id) ? [...list, data.accounts.find(a => a.id === id)!] : list);
  const fromChoices = withCurrent(transferAccountChoices(data), line?.accountId);
  const toChoices = withCurrent(transferTargetChoices(data, from), line?.linkedAccountId).filter(a => a.id !== from);

  // Same rendering as the account filter of the Operations screen: the account dot, then its name.
  const accountItem = (id: string, name: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <AccountDot account={data.accounts.find(a => a.id === id)} />
      {name}
    </span>
  );
  const save = () => {
    const parsedDay = day.trim() === '' ? undefined : Number(day);
    const parsed = parseAmount(amount);
    const error = onSave({ fromAccountId: from, toAccountId: to, amount: parsed ?? 0, ...(parsedDay !== undefined ? { dueDay: parsedDay } : {}), label });
    if (error) setError(error);
    else onClose();
  };
  const remove = () => {
    if (!onDelete || !window.confirm('Supprimer ce transfert ? Cette action est définitive pour ce mois.')) return;
    const error = onDelete();
    if (error) setError(error);
    else onClose();
  };
  const title = line ? 'Modifier le transfert' : 'Ajouter un transfert';
  return (
    <div className="annot-backdrop" onMouseDown={onClose} onContextMenu={e => e.stopPropagation()}>
      <div
        ref={dialog}
        className="panel annot-modal tr-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={e => {
          if (e.key === 'Escape') onClose();
          else if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.target instanceof HTMLInputElement) save();
        }}
      >
        <div className="annot-title">{title}</div>
        <div className="field-w">
          <span className="field-label">Compte débité</span>
          <Menu pill ariaLabel="Compte débité" placeholder="Choisir un compte" disabled={!!locks?.accounts} title={locks?.accounts ?? undefined} options={fromChoices.map(a => [a.id, a.name])} value={from} render={accountItem} onPick={id => { setFrom(id); if (id === to) setTo(''); }} />
        </div>
        <div className="field-w">
          <span className="field-label">Compte cible</span>
          <Menu pill ariaLabel="Compte cible" placeholder="Choisir un compte" disabled={!!locks?.accounts} title={locks?.accounts ?? undefined} options={toChoices.map(a => [a.id, a.name])} value={to} render={accountItem} onPick={setTo} />
        </div>
        {locks?.accounts && <div className="tr-hint">{locks.accounts}</div>}
        <label className="field-w">
          <span className="field-label">Montant prévu{line ? ` (actuellement ${money(line.budget)})` : ''}</span>
          <input className="tr-field" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
        </label>
        <label className="field-w">
          <span className="field-label">Avant le (jour du mois), facultatif</span>
          <input className="tr-field" inputMode="numeric" value={day} onChange={e => setDay(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="Ex. 5" />
        </label>
        <label className="field-w">
          <span className="field-label">Libellé, facultatif</span>
          <input className="tr-field" value={label} maxLength={80} onChange={e => setLabel(e.target.value)} placeholder="Ex. Travaux salle de bain" />
        </label>
        {error && <div className="tr-error" role="alert">{error}</div>}
        <div className="annot-actions">
          {onDelete && <button type="button" className="btn-outline" style={{ marginRight: 'auto' }} onClick={remove}>Supprimer</button>}
          <button type="button" className="btn-outline" onClick={onClose}>Annuler</button>
          <button type="button" className="btn-dark" onClick={save}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
