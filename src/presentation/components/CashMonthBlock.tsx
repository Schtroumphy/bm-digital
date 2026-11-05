import type { ReactNode } from 'react';
import { cashWithdrawalSummary } from '../../domain/cash';
import { money } from '../../domain/format';
import { Icon } from './Icon';
import { useStore } from '../state/store';

/**
 * « Espèces du mois » (spec 0037, RG16, RG17), at the top of the Budget screen: what the cash parts of the month ask to withdraw, what was withdrawn,
 * and an alert while the withdrawals fall short. Read-only and derived: nothing is typed here and nothing enters a budget total (RG18).
 * The cash figures are hidden when there is nothing to withdraw and nothing withdrawn; `children` sit at the right of the row (Budget screen switch).
 */
export function CashMonthBlock({ month, children }: { month: string; children?: ReactNode }) {
  const { data } = useStore();
  const s = cashWithdrawalSummary(data, month);
  const empty = s.toWithdraw === 0 && s.withdrawn === 0;
  if (empty && !children) return null;
  return (
    <div className="panel cash-month">
      {!empty && (
        <>
        <span className="kpi-label">
          <Icon name="cash" size={13} stroke={2} />
          Espèces du mois
        </span>
        <span>
          à retirer <b>{money(s.toWithdraw)}</b> · retiré <b>{money(s.withdrawn)}</b>
        </span>
        {s.missing > 0 && (
          <span className="alert-pill">
            <Icon name="alert" size={12} stroke={2.8} />
            Il reste {money(s.missing)} à retirer
          </span>
        )}
        {s.excess > 0 && <span className="muted">Excédent retiré : {money(s.excess)}</span>}
        </>
      )}
      {children && <div className="cash-month-extra">{children}</div>}
    </div>
  );
}
