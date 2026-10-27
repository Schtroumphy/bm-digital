import { AccountDot } from './AccountPicker';
import type { BankAccount } from '../../domain/types';

/**
 * « Affecter à » (spec 0028): choice of the savings account an operation is assigned to, or « Aucun ». `value` is an account id, '' = none.
 * An archived account is shown (so it can be recognised and removed) but only when it is the current value (RG4).
 */
export function AssignPicker({ accounts, value, disabled, onChange }: { accounts: BankAccount[]; value: string; disabled?: boolean; onChange: (accountId: string) => void }) {
  return (
    <div>
      <div className="field-label is-gap">Affecter à un compte d’épargne</div>
      <div className="chips is-wrap">
        <div className={`chip${value === '' ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`} onClick={disabled ? undefined : () => onChange('')}>
          Aucun
        </div>
        {accounts.map(a => (
          <div key={a.id} className={`chip${value === a.id ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`} onClick={disabled ? undefined : () => onChange(a.id)}>
            <span className="acc-item">
              <AccountDot account={a} />
              {a.name}
              {a.archived ? ' (archivé)' : ''}
            </span>
          </div>
        ))}
      </div>
      {value !== '' && <div className="muted" style={{ fontSize: 12 }}>Hors budget : n’entre ni dans le réel de la ligne ni dans les revenus.</div>}
    </div>
  );
}
