import { useState } from 'react';
import { closeBlockersAfterReconcile, closeMonthReconciling } from '../../application/cash';
import { closeBlockers, closeMonth, overPlacedAmount, reopenBlocker, reopenMonth, type CloseBlocker } from '../../application/monthClosing';
import { reconcilableLines, type ReconcilableLine } from '../../domain/cash';
import { money, monthLabel, parseMonth } from '../../domain/format';
import { isMonthClosed, isYearClosed } from '../../domain/ledger';
import type { MonthKey } from '../../domain/types';
import { newId, useStore } from '../state/store';
import { Icon } from './Icon';

/** One line of the explanation of a refused closing. `accountId`: the account at fault, to find its row on the page « Relevé ». `link`: where the user can fix it. */
export interface BlockerItem {
  text: string;
  accountId?: string;
  link?: { kind: 'budget' } | { kind: 'month'; month: MonthKey };
}

/** The lines explaining why « Clôturer le mois » is refused (spec 0005, RG28, RG35; spec 0041, RG15, RG16). */
export function blockerItems(b: CloseBlocker): BlockerItem[] {
  if (b.kind === 'unavailable') return [];
  if (b.kind === 'previous') return [{ text: `Clôture d’abord ${monthLabel(b.month)}.`, link: { kind: 'month', month: b.month } }];
  if (b.kind === 'statements') {
    return b.accounts.map(a => ({ accountId: a.accountId, text: `${a.name} : ${a.reason === 'missing' ? 'relevé à saisir' : `écart de ${money(a.gap, true)} à régulariser`}` }));
  }
  if (b.amount > 0) return [{ link: { kind: 'budget' }, text: `Il reste ${money(b.amount)} à placer. Place-les (versement sur une épargne ou un placement, allocation d’une enveloppe) ou baisse le budget des revenus concernés pour revenir à 0 € avant de clôturer.` }];
  return [];
}

/**
 * « Clôturer le mois » / « Rouvrir le mois » (spec 0005, moved to the page « Relevé » by spec 0041, RG12). A refused closing does not explain itself
 * here: it tells the page (`onRefused`), which shows why. The button always stays clickable (RG16).
 */
export function MonthCloseControl({ month, onRefused, onDone }: { month: MonthKey; onRefused: () => void; onDone: () => void }) {
  const { data, update } = useStore();
  const [reconciling, setReconciling] = useState(false);
  if (!data.months[month]?.initialized || isYearClosed(data, parseMonth(month).year)) return null;
  if (isMonthClosed(data, month)) {
    const blocker = reopenBlocker(data, month);
    const hint = blocker?.kind === 'later' ? (blocker.byYear ? `Rouvre d’abord l’année ${parseMonth(blocker.month).year} (écran Clôture)` : `Rouvre d’abord ${monthLabel(blocker.month)}`) : undefined;
    return (
      <>
        <span className="month-closed">
          <Icon name="lock" size={14} />
          Mois clôturé
        </span>
        <div className={`btn-outline${blocker ? ' is-disabled' : ''}`} title={hint} onClick={blocker ? undefined : () => update(d => void reopenMonth(d, month))}>
          Rouvrir le mois
        </div>
      </>
    );
  }
  const close = () => {
    // Cash lines not fully entered: the closing offers to regularise them first (spec 0037, RG19).
    if (reconcilableLines(data, month).length) return setReconciling(true);
    if (closeBlockers(data, month).length) return onRefused();
    const over = overPlacedAmount(data, month);
    const warning = over > 0 ? `\n\nAttention : tu as placé ${money(over)} de plus que disponible.` : '';
    if (!window.confirm(`Clôturer ${monthLabel(month)} ? Le mois deviendra en lecture seule.${warning}`)) return;
    update(d => void closeMonth(d, month));
    onDone();
  };
  return (
    <>
      <div className="btn-outline" onClick={close}>
        <Icon name="lock" size={14} />
        Clôturer le mois
      </div>
      {reconciling && <CashReconcileDialog month={month} lines={reconcilableLines(data, month)} onClose={() => setReconciling(false)} onDone={() => { setReconciling(false); onDone(); }} />}
    </>
  );
}

/**
 * « Clôturer <mois> — lignes en espèces non entièrement dépensées » (spec 0037, RG19): each line is proposed on its own, nothing is ticked by default.
 * A confirmed line gets a cash expense « Reste non saisi » for the rest of its budget; a refused one stays as it is. The closing can be refused after the
 * regularisation (it changes the actuals, hence the amount still available) or because of the statements: the reasons are shown and the buttons disabled.
 */
function CashReconcileDialog({ month, lines, onClose, onDone }: { month: MonthKey; lines: ReconcilableLine[]; onClose: () => void; onDone: () => void }) {
  const { data, update } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (key: string) => setPicked(p => (p.includes(key) ? p.filter(k => k !== key) : [...p, key]));
  const withPicked = closeBlockersAfterReconcile(data, month, picked);
  const without = closeBlockersAfterReconcile(data, month, []);
  const reasons = (picked.length ? withPicked : without).flatMap(blockerItems).map(i => i.text);
  const finish = (keys: string[]) => {
    update(d => void closeMonthReconciling(d, month, keys, () => newId('t')));
    onDone();
  };
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="cash-dialog">
        <div className="form-title">Clôturer {monthLabel(month)} · lignes en espèces non entièrement dépensées</div>
        <div className="muted">Pour chaque ligne cochée, une dépense en espèces « Reste non saisi » est ajoutée : le réel de la ligne devient son budget. Aucun compte n’est débité.</div>
        {lines.map(l => (
          <label key={l.key} className="cash-dialog-row">
            <input type="checkbox" checked={picked.includes(l.key)} onChange={() => toggle(l.key)} />
            <span>{l.name}</span>
            <span className="muted">budget {money(l.budget)} · saisi {money(l.spent)}</span>
            <b>Ajouter {money(l.rest)} ?</b>
          </label>
        ))}
        {reasons.map(t => (
          <div key={t} className="alert-box" style={{ margin: 0 }}>{t}</div>
        ))}
        <div className="cash-dialog-actions">
          <div className="btn-quiet" onClick={onClose}>Annuler</div>
          <div className={`btn-outline${without.length ? ' is-disabled' : ''}`} onClick={without.length ? undefined : () => finish([])}>Clôturer sans régulariser</div>
          <div className={`btn-dark${!picked.length || withPicked.length ? ' is-disabled' : ''}`} onClick={!picked.length || withPicked.length ? undefined : () => finish(picked)}>Confirmer et clôturer</div>
        </div>
      </div>
    </>
  );
}
