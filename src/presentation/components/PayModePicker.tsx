import { useState } from 'react';
import { CASH_ACCOUNT_ID, activeBankAccounts, bankAccount, isOnMainAccount, resolveBoxAccountId } from '../../domain/bank';
import type { BudgetData, PaymentSetting } from '../../domain/types';
import type { PaymentPatch } from '../../application/payment';
import { AccountDot } from './AccountPicker';
import { Icon } from './Icon';

interface Props {
  data: BudgetData;
  /** The variable line whose payment mode is shown. */
  box: PaymentSetting;
  disabled?: boolean;
  onChange: (patch: PaymentPatch) => void;
}

/**
 * Chip of a box: the dot of the account its expenses go to (a banknote in cash
 * mode), hidden while it is the main account. Clicking it opens a menu with the payment mode and the assigned account.
 */
export function PayModePicker({ data, box, disabled, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const cash = box.payMode === 'especes';
  const resolved = bankAccount(data, resolveBoxAccountId(data, box));
  const quiet = !cash && isOnMainAccount(data, resolved?.id);
  // What « Virtuel » means for this box, whatever the current mode.
  const virtual = bankAccount(data, resolveBoxAccountId(data, { ...box, payMode: 'virtuel' }));
  const assigned = box.accountId ? data.accounts.find(a => a.id === box.accountId) : undefined;
  const pick = (patch: PaymentPatch) => {
    setOpen(false);
    onChange(patch);
  };
  // The assigned account stays listed when archived, but cannot be picked again.
  const choices = [...activeBankAccounts(data).filter(a => a.id !== CASH_ACCOUNT_ID), ...(assigned?.archived ? [assigned] : [])];

  return (
    <span className="acc-picker" onClick={e => e.stopPropagation()}>
      <span className={`acc-trigger${disabled ? ' is-disabled' : ''}${quiet ? ' is-quiet' : ''}`} title={`Mode de paiement : ${cash ? 'Espèces' : resolved?.name ?? 'Inconnu'}`} onClick={disabled ? undefined : () => setOpen(o => !o)}>
        {cash ? <Icon name="cash" size={13} stroke={2.2} /> : <AccountDot account={resolved} />}
      </span>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popmenu acc-menu pay-menu">
            <div className="popmenu-label">Mode de paiement</div>
            <div className={`popmenu-item${!cash ? ' is-active' : ''}`} onClick={() => pick({ payMode: 'virtuel' })}>
              Virtuel · {virtual?.name}
            </div>
            <div className={`popmenu-item${cash ? ' is-active' : ''}`} onClick={() => pick({ payMode: 'especes' })}>
              Espèces
            </div>
            <div className="popmenu-sep" />
            <div className="popmenu-label">Compte attribué</div>
            <div>
              <div className={`popmenu-item${!assigned ? ' is-active' : ''}${cash ? ' is-disabled' : ''}`} onClick={cash ? undefined : () => pick({ accountId: null })}>
                <span className="acc-item">
                  <AccountDot account={bankAccount(data)} />
                  {bankAccount(data)?.name ?? 'Compte principal'} <span className="popmenu-tag">défaut</span>
                </span>
              </div>
              {choices.map(a => (
                <div
                  key={a.id}
                  className={`popmenu-item${a.id === box.accountId ? ' is-active' : ''}${cash ? ' is-disabled' : ''}`}
                  onClick={cash || a.archived ? undefined : () => pick({ accountId: a.id })}
                >
                  <span className="acc-item">
                    <AccountDot account={a} />
                    {a.name}
                    {a.archived && <span className="popmenu-tag">archivé</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </span>
  );
}
