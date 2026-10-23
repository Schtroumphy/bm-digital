import { useState } from 'react';
import { accountIdOf, activeBankAccounts, bankAccount, mainAccount } from '../../domain/bank';
import type { BankAccount, BudgetData } from '../../domain/types';
import { tone } from './tone';

/** Round marker of a bank account, in its colour; the name is the tooltip. */
export function AccountDot({ account }: { account?: BankAccount }) {
  return <span className="dot is-10" title={account?.name} style={{ background: account ? tone(account.hue).base : 'rgba(32, 30, 29, 0.2)' }} />;
}

interface PickerProps {
  data: BudgetData;
  /** Account of the operation; absent = the main account. */
  accountId?: string;
  /** Keeps the dot visible even for the main account (default: hidden until hover). */
  alwaysVisible?: boolean;
  /** Also writes the account's name next to the dot. */
  showName?: boolean;
  disabled?: boolean;
  /** Tooltip on the dot, instead of the account's name. */
  hint?: string;
  /** Account left out of the menu (the line's other account, spec 0007). */
  exclude?: string;
  onPick: (accountId: string) => void;
}

/**
 * The account dot of a line or transaction. Clicking it opens a menu of the
 * active accounts (an archived account only shows up as the current one).
 */
export function AccountPicker({ data, accountId, alwaysVisible, showName, disabled, hint, exclude, onPick }: PickerProps) {
  const [open, setOpen] = useState(false);
  const current = bankAccount(data, accountId);
  const currentId = accountIdOf(data, accountId);
  // The main account is the default: its dot is hidden (shown on hover) to keep lines light.
  const quiet = !showName && !alwaysVisible && currentId === mainAccount(data).id;
  return (
    <span className="acc-picker" onClick={e => e.stopPropagation()}>
      <span className={`acc-trigger${disabled ? ' is-disabled' : ''}${quiet ? ' is-quiet' : ''}`} title={hint} onClick={disabled ? undefined : () => setOpen(o => !o)}>
        <AccountDot account={current} />
        {showName && <span className="ellipsis">{current?.name ?? 'Inconnu'}</span>}
      </span>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popmenu acc-menu">
            {activeBankAccounts(data).filter(a => a.id !== exclude).map(a => (
              <div
                key={a.id}
                className={`popmenu-item${a.id === currentId ? ' is-active' : ''}`}
                onClick={() => {
                  setOpen(false);
                  onPick(a.id);
                }}
              >
                <span className="acc-item">
                  <AccountDot account={a} />
                  {a.name}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
