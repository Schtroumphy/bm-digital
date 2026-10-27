import { AccountDot } from './AccountPicker';
import type { BankAccount } from '../../domain/types';

/** Choice « Hors budget » (spec 0031) in the single selector: not an account id, so it can sit next to them. '' = « Compté au budget ». */
export const OFF_BUDGET_CHOICE = 'hors-budget';

/**
 * « Budget » (specs 0028 and 0031): one selector for the three exclusive states of an operation: counted in the budget (''), « Hors budget » (no account),
 * or assigned to a savings account (its id). An archived account is shown (so it can be recognised and removed) but only when it is the current value (spec 0028, RG4).
 */
export function AssignPicker({ accounts, value, disabled, onChange }: { accounts: BankAccount[]; value: string; disabled?: boolean; onChange: (choice: string) => void }) {
  const chip = (choice: string, content: React.ReactNode) => (
    <div key={choice} className={`chip${value === choice ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`} onClick={disabled ? undefined : () => onChange(choice)}>
      {content}
    </div>
  );
  return (
    <div>
      <div className="field-label is-gap">Budget</div>
      <div className="chips is-wrap">
        {chip('', 'Compté au budget')}
        {chip(OFF_BUDGET_CHOICE, 'Hors budget')}
      </div>
      {accounts.length > 0 && (
        <>
          <div className="field-label is-gap is-spaced">Affecter à</div>
          <div className="chips is-wrap">
            {accounts.map(a =>
              chip(
                a.id,
                <span className="acc-item">
                  <AccountDot account={a} />
                  {a.name}
                  {a.archived ? ' (archivé)' : ''}
                </span>,
              ),
            )}
          </div>
        </>
      )}
      {value !== '' && <div className="muted" style={{ fontSize: 12 }}>Hors budget : n’entre ni dans le réel de la ligne ni dans les revenus. Les soldes bancaires ne changent pas.</div>}
    </div>
  );
}
