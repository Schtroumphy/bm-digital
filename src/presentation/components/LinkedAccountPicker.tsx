import { useState } from 'react';
import { activeBankAccounts } from '../../domain/bank';
import type { BudgetData } from '../../domain/types';
import { AccountDot } from './AccountPicker';

interface Props {
  data: BudgetData;
  /** Dedicated account of the line; absent = none. */
  linkedAccountId?: string;
  /** The account the line is paid from: it cannot also be the dedicated one (spec 0007, RG2). */
  sourceId: string;
  disabled?: boolean;
  /** `undefined` = « Aucun ». */
  onPick: (accountId: string | undefined) => void;
}

/**
 * Dedicated-account dot of a savings or investment line (spec 0007, RG13): the arrow and the account
 * that receives the payments. Clicking opens the active accounts except the source, plus « Aucun ».
 * An archived dedicated account keeps showing, greyed out.
 */
export function LinkedAccountPicker({ data, linkedAccountId, sourceId, disabled, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const current = data.accounts.find(a => a.id === linkedAccountId);
  return (
    <span className="acc-picker" onClick={e => e.stopPropagation()}>
      <span
        className={`acc-trigger${disabled ? ' is-disabled' : ''}${current?.archived ? ' is-archived' : ''}`}
        title={current ? `Reçoit les versements : ${current.name}${current.archived ? ' (archivé)' : ''}` : 'Aucun compte dédié'}
        onClick={disabled ? undefined : () => setOpen(o => !o)}
      >
        <span className="acc-arrow">→</span>
        {current ? <AccountDot account={current} /> : <span className="dot is-10 is-empty" />}
      </span>
      {open && (
        <>
          <div className="backdrop" onClick={() => setOpen(false)} />
          <div className="popmenu acc-menu">
            <div
              className={`popmenu-item${current ? '' : ' is-active'}`}
              onClick={() => {
                setOpen(false);
                onPick(undefined);
              }}
            >
              Aucun
            </div>
            {activeBankAccounts(data)
              .filter(a => a.id !== sourceId)
              .map(a => (
                <div
                  key={a.id}
                  className={`popmenu-item${a.id === linkedAccountId ? ' is-active' : ''}`}
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
