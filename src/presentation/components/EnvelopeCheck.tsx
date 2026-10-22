import { checkEnvelope, uncheckEnvelope } from '../../application/checkoff';
import { envelopeCheck, envelopeTooltip, isEnvelopePointable, monthMode } from '../../domain/checkoff';
import type { Envelope, MonthKey } from '../../domain/types';
import { useStore } from '../state/store';
import { AccountDot } from './AccountPicker';
import { Icon } from './Icon';

/**
 * Checkbox at the top right of an envelope tile (spec 0011, RG6); the date and the destination are in its tooltip only: « the allocation
 * was sent from the main account to the account of the envelope ». Only in a month counted at the checks, for an allocation above 0.
 * A checked one stays visible so it can be unchecked, even if its allocation fell to 0 since (but never in a month at the actuals).
 */
export function EnvelopeCheckBox({ month, env, locked }: { month: MonthKey; env: Envelope; locked: boolean }) {
  const { data, update } = useStore();
  const check = envelopeCheck(data, month, env.id);
  // Never in a month counted at the actuals, even for a box checked earlier (spec 0011, RG6).
  if (monthMode(data, month) === 'real') return null;
  if (!check && !isEnvelopePointable(data, month, env)) return null;
  const account = data.accounts.find(a => a.id === env.accountId);
  const tip = envelopeTooltip(data, month, env);
  const toggle = () => update(d => void (check ? uncheckEnvelope(d, month, env.id) : checkEnvelope(d, month, env.id)));
  return (
    <span className="env-check" title={tip} onClick={e => e.stopPropagation()}>
      <span className={`check${check ? ' is-on' : ''}${locked ? ' is-locked' : ''}`} title={tip} onClick={locked ? undefined : toggle}>
        <Icon name="check" size={12} stroke={3.5} color="#fff" style={{ opacity: check ? 1 : 0 }} />
      </span>
      <AccountDot account={account} />
    </span>
  );
}
