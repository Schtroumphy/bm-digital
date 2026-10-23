import { checkEnvelope, uncheckEnvelope } from '../../application/checkoff';
import { envelopeCheck, envelopeTooltip, isEnvelopePointable } from '../../domain/checkoff';
import type { Envelope, MonthKey } from '../../domain/types';
import { useStore } from '../state/store';
import { Icon } from './Icon';

/**
 * Checkbox at the top right of an envelope tile (spec 0011, RG6); the date and the destination are in its tooltip only: « the allocation
 * was sent from the main account to the account of the envelope » (a FICTIVE debit, spec 0019, RG6). Only for an allocation above 0.
 * A checked one stays visible so it can be unchecked, even if its allocation fell to 0 since.
 */
export function EnvelopeCheckBox({ month, env, locked }: { month: MonthKey; env: Envelope; locked: boolean }) {
  const { data, update } = useStore();
  const check = envelopeCheck(data, month, env.id);
  if (!check && !isEnvelopePointable(data, month, env)) return null;
  const tip = envelopeTooltip(data, month, env);
  const toggle = () => update(d => void (check ? uncheckEnvelope(d, month, env.id) : checkEnvelope(d, month, env.id)));
  return (
    <span className="env-check" title={tip} onClick={e => e.stopPropagation()}>
      <span className={`check${check ? ' is-on' : ''}${locked ? ' is-locked' : ''}`} title={tip} onClick={locked ? undefined : toggle}>
        <Icon name="check" size={12} stroke={3.5} color="#fff" style={{ opacity: check ? 1 : 0 }} />
      </span>
    </span>
  );
}
