import { checkEnvelope, uncheckEnvelope } from '../../application/checkoff';
import { bankAccount, CASH_ACCOUNT_ID, resolveEnvelopeAccountId } from '../../domain/bank';
import { envelopeCheck, envelopeTooltip, isEnvelopePointable } from '../../domain/checkoff';
import type { Envelope, MonthKey } from '../../domain/types';
import { useStore } from '../state/store';
import { AccountDot } from './AccountPicker';
import { Icon } from './Icon';

/**
 * Checkbox at the top right of an envelope tile (spec 0009, RG90); the date and destination are in its tooltip only: « the allocation was sent to the account of the envelope ».
 * Only for an envelope whose account is not the main one and whose allocation is above 0. A checked one stays
 * visible so it can be unchecked, even if its allocation fell to 0 or its account changed since.
 */
export function EnvelopeCheckBox({ month, env, locked }: { month: MonthKey; env: Envelope; locked: boolean }) {
  const { data, update } = useStore();
  const check = envelopeCheck(data, month, env.id);
  if (!check && !isEnvelopePointable(data, month, env)) return null;
  const accountId = check?.accountId ?? resolveEnvelopeAccountId(data, env);
  const account = bankAccount(data, accountId);
  const tip = envelopeTooltip(data, month, env);
  const toggle = () => update(d => void (check ? uncheckEnvelope(d, month, env.id) : checkEnvelope(d, month, env.id)));
  return (
    <span className="env-check" title={tip} onClick={e => e.stopPropagation()}>
      <span className={`check${check ? ' is-on' : ''}${locked ? ' is-locked' : ''}`} title={tip} onClick={locked ? undefined : toggle}>
        <Icon name="check" size={12} stroke={3.5} color="#fff" style={{ opacity: check ? 1 : 0 }} />
      </span>
      {accountId === CASH_ACCOUNT_ID ? <Icon name="cash" size={13} stroke={2.2} /> : <AccountDot account={account} />}
    </span>
  );
}
