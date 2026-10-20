import { useState } from 'react';
import { setTransferSource, setTransferTarget } from '../../application/bankAccounts';
import { accountIdOf, activeBankAccounts, bankAccount } from '../../domain/bank';
import { accounts as savingsAccounts } from '../../domain/ledger';
import type { MonthKey, Transfer, TransferTarget } from '../../domain/types';
import { useStore } from '../state/store';
import { AccountDot, AccountPicker } from './AccountPicker';

/** « Compte source → destination » of a transfer. The destination is optional: without one the transfer is informative only. */
export function TransferRoute({ transfer, month, disabled }: { transfer: Transfer; month: MonthKey; disabled: boolean }) {
  const { data, update } = useStore();
  const [open, setOpen] = useState(false);
  const to = transfer.to;
  const fromId = accountIdOf(data, transfer.fromAccountId);
  const label = !to ? 'sans destination' : to.kind === 'bank' ? bankAccount(data, to.id)?.name : savingsAccounts(data).find(a => a.key === to.key)?.name;
  const pick = (target: TransferTarget | undefined) => {
    setOpen(false);
    update(d => setTransferTarget(d, month, transfer.id, target));
  };
  return (
    <span className="transfer-route" onClick={e => e.stopPropagation()}>
      <AccountPicker data={data} accountId={fromId} disabled={disabled} onPick={id => update(d => setTransferSource(d, month, transfer.id, id))} />
      <span className="rel">
        <span className={`transfer-dest${disabled ? ' is-disabled' : ''}${to ? '' : ' is-unset'}`} title="Destination du virement" onClick={disabled ? undefined : () => setOpen(o => !o)}>
          → {label ?? 'Supprimé'}
        </span>
        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <div className="popmenu dest-menu">
              <div className={`popmenu-item${to ? '' : ' is-active'}`} onClick={() => pick(undefined)}>Sans destination (informatif)</div>
              <div className="dest-group">Comptes bancaires</div>
              {activeBankAccounts(data)
                .filter(a => a.id !== fromId)
                .map(a => (
                  <div key={a.id} className={`popmenu-item${to?.kind === 'bank' && to.id === a.id ? ' is-active' : ''}`} onClick={() => pick({ kind: 'bank', id: a.id })}>
                    <span className="acc-item">
                      <AccountDot account={a} />
                      {a.name}
                    </span>
                  </div>
                ))}
              <div className="dest-group">Épargnes et placements</div>
              {savingsAccounts(data).map(a => (
                <div key={a.key} className={`popmenu-item${to?.kind === 'saving' && to.key === a.key ? ' is-active' : ''}`} onClick={() => pick({ kind: 'saving', key: a.key })}>
                  {a.name}
                </div>
              ))}
            </div>
          </>
        )}
      </span>
    </span>
  );
}
