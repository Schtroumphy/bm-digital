import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AccountDot, AccountPicker } from '../components/AccountPicker';
import { LinkedAccountPicker } from '../components/LinkedAccountPicker';
import { PayModePicker } from '../components/PayModePicker';
import { EditableAmount, EditableText } from '../components/Editable';
import { goalHue, goalSummaryText } from '../components/goalStyle';
import { currentYear, firstGoalOfKind, goalView, summaryGoals } from '../../domain/goals';
import { Icon, type IconName } from '../components/Icon';
import { EnvelopeCheckBox } from '../components/EnvelopeCheck';
import { carriedAccountRefusal, isCarryingBlock, lineExpenses } from '../../domain/lineExpenses';
import { lineEntriesNote } from '../../domain/lineActuals';
import { LineQuickEntry } from '../components/LineQuickEntry';
import { LineCheckBox, LineCheckMeta } from '../components/LineCheck';
import { BAD, gapColor, GOOD, HUE, MUTED, tone, toneVars } from '../components/tone';
import { setLineAccount, setLineLinkedAccount } from '../../application/bankAccounts';
import { addEnvelope, renameEnvelope } from '../../application/envelopes';
import { setLinePayment } from '../../application/payment';
import { addLine, applyTemplate, deleteLine, duplicatePrevious, monthCsv, saveAsTemplate, SAVINGS_SECTIONS, setEnvelopeAllocation, updateLine } from '../../application/actions';
import { closeBlockers, closeMonth, reopenBlocker, reopenMonth, type CloseBlocker } from '../../application/monthClosing';
import { accountIdOf, isLineInBudget, isOnMainAccount } from '../../domain/bank';
import { envelopeTooltip, isoDate, lineTooltip } from '../../domain/checkoff';
import { envelopeCash, envelopeConsumption } from '../../domain/envelopeCash';
import { blockTotals, budgetLines, envelopeAlerts, estimatedBalance, estimatedBalanceTotal, lineGap, lineRemaining, lineHistory, monthSummary } from '../../domain/budget';
import { addMonths, money, monthLabel, parseAmount, parseMonth, percent, rawNumber } from '../../domain/format';
import { isMonthClosed, isMonthLocked, isYearClosed, monthAlloc, monthLines } from '../../domain/ledger';
import type { BlockKey, Line, MonthKey } from '../../domain/types';
import { EnvelopesTotal } from './Envelopes';
import { PointageCard } from './PointageCard';
import { newId, useStore } from '../state/store';
import { useUi } from '../state/ui';

export const BLOCKS: Record<BlockKey, { title: string; icon: IconName; hue: number }> = {
  rev: { title: 'Revenus', icon: 'arrowDown', hue: HUE.rev },
  cre: { title: 'Crédits / Dettes', icon: 'card', hue: HUE.dep },
  fix: { title: 'Dépenses fixes', icon: 'home', hue: HUE.dep },
  var: { title: 'Dépenses variables', icon: 'basket', hue: HUE.dep },
  epa: { title: 'Épargnes', icon: 'bank', hue: HUE.epa },
  inv: { title: 'Investissements', icon: 'trend', hue: HUE.inv },
};

/** Yellow of the « bonus » star of the surplus KPI. */
const STAR = 'oklch(0.8 0.15 90)';

export const BLOCK_TITLES = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [k, v.title])) as Record<BlockKey, string>;

export function BudgetActions({ month }: { month: MonthKey }) {
  const { data, update } = useStore();
  const [open, setOpen] = useState(false);
  const md = data.months[month];
  const locked = isMonthLocked(data, month);
  const prevReady = !!data.months[addMonths(month, -1)]?.initialized;
  const confirmReplace = () => !md?.initialized || window.confirm(`Remplacer les lignes de ${monthLabel(month)} ? Les pointages des lignes remplacées seront effacés.`);

  const exportCsv = () => {
    const blob = new Blob([monthCsv(monthLines(data, month), BLOCK_TITLES, l => !isLineInBudget(data, l))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `budget-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const items = [
    { label: 'Appliquer le modèle de budget', enabled: !locked, run: () => confirmReplace() && update(d => applyTemplate(d, month)) },
    { label: 'Dupliquer le mois précédent', enabled: !locked && prevReady, run: () => confirmReplace() && update(d => duplicatePrevious(d, month)) },
    { label: 'Enregistrer ce mois comme modèle', enabled: !!md?.initialized, run: () => update(d => saveAsTemplate(d, month)) },
  ];

  return (
    <>
      <div style={{ position: 'relative' }}>
        <div className="btn-quiet" onClick={() => setOpen(o => !o)}>
          <Icon name="copy" size={15} />
          Dupliquer / appliquer le modèle
        </div>
        {open && (
          <>
            <div className="backdrop" onClick={() => setOpen(false)} />
            <div className="popmenu model-menu">
              {items.map(it => (
                <div
                  key={it.label}
                  className={`popmenu-item${it.enabled ? '' : ' is-disabled'}`}
                  onClick={() => {
                    if (!it.enabled) return;
                    setOpen(false);
                    it.run();
                  }}
                >
                  {it.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="btn-outline" onClick={exportCsv}>
        <Icon name="download" size={15} />
        Exporter CSV
      </div>
    </>
  );
}

/** Text shown when « Clôturer le mois » is refused (RG28, RG35). */
function closeBlockerText(b: CloseBlocker): string | null {
  if (b.kind === 'unavailable') return null;
  if (b.kind === 'previous') return `Clôture d’abord ${monthLabel(b.month)}.`;
  if (b.amount > 0) return `Il reste ${money(b.amount)} à placer. Place-les (versement sur une épargne ou un placement, allocation d’une enveloppe) ou baisse le budget des revenus concernés pour revenir à 0 € avant de clôturer.`;
  return `Tu as placé ${money(-b.amount)} de plus que disponible. Réduis un versement ou une allocation d’enveloppe, ou saisis le revenu manquant, pour revenir à 0 € avant de clôturer.`;
}

/**
 * « Clôturer le mois » / « Rouvrir le mois », next to the month picker. A refused
 * closing does not explain itself here: it tells the screen (`onRefused`), which shows why.
 */
export function MonthCloseControl({ month, onRefused, onDone }: { month: MonthKey; onRefused: () => void; onDone: () => void }) {
  const { data, update } = useStore();
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
        <div
          className={`btn-outline${blocker ? ' is-disabled' : ''}`}
          title={hint}
          onClick={blocker ? undefined : () => update(d => void reopenMonth(d, month))}
        >
          Rouvrir le mois
        </div>
      </>
    );
  }
  const close = () => {
    if (closeBlockers(data, month).length) return onRefused();
    if (!window.confirm(`Clôturer ${monthLabel(month)} ? Le mois deviendra en lecture seule.`)) return;
    update(d => void closeMonth(d, month));
    onDone();
  };
  return (
    <div className="btn-outline" onClick={close}>
      <Icon name="lock" size={14} />
      Clôturer le mois
    </div>
  );
}

export function BudgetScreen({ month, closeAttempt, onDismissClose, onOpenGoals }: { month: MonthKey; closeAttempt: boolean; onDismissClose: () => void; onOpenGoals: () => void }) {
  const { data, ledger, update } = useStore();
  const uninit = !data.months[month]?.initialized;
  const locked = isMonthLocked(data, month);
  const today = isoDate();
  const s = monthSummary(data, ledger, month);
  // « Fond de secours »: the first `amount` goal of the current year (spec 0032, Q2); nothing to show without one.
  const emergencyGoal = firstGoalOfKind(data, 'amount');
  const emergency = emergencyGoal ? goalView(data, ledger, emergencyGoal) : null;
  const emergencyPct = emergency?.pct ?? 0;
  // Why « Clôturer le mois » was refused, recomputed live: it disappears once the month can be closed (RG28).
  const closeTexts = closeAttempt ? closeBlockers(data, month).map(closeBlockerText).filter((t): t is string => t !== null) : [];
  return (
    <>
      {uninit && (
        <div className="banner">
          <div className="banner-icon">
            <Icon name="calendar" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">{monthLabel(month)} n’est pas encore initialisé</div>
            <div className="banner-text">Appliquez le modèle de budget pour créer les lignes du mois avec les montants prévus.</div>
          </div>
          <div className="btn-dark" onClick={() => update(d => applyTemplate(d, month))}>
            Appliquer le modèle de budget
          </div>
        </div>
      )}
      {locked && !uninit && (
        <div className="banner is-locked">
          <Icon name="lock" size={16} />
          {isYearClosed(data, parseMonth(month).year) ? `L’année ${parseMonth(month).year} est clôturée : ce mois est en lecture seule.` : 'Ce mois est clôturé : il est en lecture seule.'}
        </div>
      )}
      {closeTexts.length > 0 && (
        <div className="banner">
          <div className="banner-icon">
            <Icon name="alert" size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="banner-title">Impossible de clôturer {monthLabel(month)}</div>
            {closeTexts.map(t => (
              <div key={t} className="banner-text">{t}</div>
            ))}
          </div>
          <div className="btn-quiet" onClick={onDismissClose} title="Fermer">
            <Icon name="close" size={15} />
          </div>
        </div>
      )}
      <div className={uninit ? 'is-preview' : undefined}>
        <div className="summary">
          <div className="panel kpi kpi-hero">
            <div className="kpi-label">Reste à placer</div>
            <div className="kpi-hero-value">{money(s.remaining)}</div>
            {s.availableReal !== null && (
              <div className="kpi-sub" style={{ color: s.availableReal < 0 ? BAD : undefined }}>
                Disponible (réel) {money(s.availableReal)}
              </div>
            )}
          </div>
          <div className="panel kpi">
            <div className="kpi-label" title="Revenus réels − sorties réelles (crédits, dépenses, épargnes, placements, enveloppes). Une ligne sans réel compte à son budget.">
              <Icon name="star" size={12} stroke={2} color={s.surplus < 0 ? BAD : STAR} style={{ fill: s.surplus < 0 ? BAD : STAR }} />
              Surplus
            </div>
            <div className="kpi-value" style={{ color: s.surplus < 0 ? BAD : undefined }}>{money(s.surplus)}</div>
            {s.surplus < 0 && <div className="kpi-sub" style={{ color: BAD }}>Marge négative</div>}
          </div>
          <Kpi label="Revenus" hue={HUE.rev} value={money(s.income)} />
          <Kpi label="Dépenses" hue={HUE.dep} value={money(s.expenses)} sub={'Réelles : ' + money(s.expensesReal)} />
          <Kpi label="Épargne budgétisée" hue={HUE.epa} value={money(s.grossSavings)} sub={'Réelle : ' + money(s.realSavings)} />
          <Kpi label="Taux d’épargne" hue={HUE.obj} value={percent(s.savingsRate)} sub={'Brut : ' + percent(s.grossSavingsRate)} />
          <div className="panel kpi emergency">
            <div className="emergency-head">
              <span className="kpi-label">{emergency ? emergency.name : 'Fond de secours'}</span>
              <span className="emergency-pct">{emergency ? percent(emergencyPct) : '—'}</span>
            </div>
            <div className="emergency-value">
              {emergency ? (
                <>
                  {money(emergency.current)} <span>/ {money(emergency.target)}</span>
                </>
              ) : (
                '—'
              )}
            </div>
            <div className="progress is-obj">
              <div style={{ width: `${Math.min(100, emergencyPct)}%` }} />
            </div>
          </div>
        </div>

        <div className="budget-grid">
          <div className="budget-col">
            <BlockCard block="rev" month={month} locked={locked || uninit} today={today} />
            <BlockCard block="cre" month={month} locked={locked || uninit} today={today} />
            <GoalsCard onOpenGoals={onOpenGoals} />
          </div>
          <div className="budget-col">
            <BlockCard block="fix" month={month} locked={locked || uninit} today={today} />
            <BlockCard block="var" month={month} locked={locked || uninit} today={today} />
          </div>
          <div className="budget-col">
            <BlockCard block="epa" month={month} locked={locked || uninit} today={today} />
            <BlockCard block="inv" month={month} locked={locked || uninit} today={today} strip={{ label: 'Total global', value: money(s.investTotal), color: 'oklch(0.4 0.1 250)' }} />
          </div>
          <div className="budget-col">
            <EnvelopesCompact month={month} locked={locked || !data.months[month]?.initialized} />
            <PointageCard month={month} locked={locked || uninit} today={today} />
          </div>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, hue, value, sub }: { label: string; hue: number; value: string; sub?: string }) {
  return (
    <div className="panel kpi">
      <div className="kpi-label">
        <span className="dot" style={{ background: tone(hue).base }} />
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

const BUBBLE_WIDTH = 300;

/** Bubble of a line's details, beside the row (right if there is room, else left); closed by its cross, a click outside or Escape. */
function DetailsBubble({ title, text, rect, onClose }: { title: string; text: string; rect: DOMRect; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const room = window.innerWidth - rect.right;
  const left = room >= BUBBLE_WIDTH + 12 ? rect.right + 8 : Math.max(8, rect.left - BUBBLE_WIDTH - 8);
  return createPortal(
    <div ref={ref} className="details-bubble" style={{ left, top: Math.max(8, rect.top), width: BUBBLE_WIDTH }}>
      <div className="details-bubble-head">
        <div className="popover-title">{title}</div>
        <div className="icon-btn" onClick={onClose}>
          <Icon name="close" size={14} />
        </div>
      </div>
      <div className="details-bubble-text">{text}</div>
    </div>,
    document.body,
  );
}

function BlockCard({ block, month, locked, today, strip }: { block: BlockKey; month: MonthKey; locked: boolean; today: string; strip?: { label: string; value: string; color: string } }) {
  const { data, ledger, update } = useStore();
  const { editing, setEditing, openMenu } = useUi();
  const [hover, setHover] = useState<string | null>(null);
  const [details, setDetails] = useState<{ key: string; rect: DOMRect } | null>(null);
  const [horizonOpen, setHorizonOpen] = useState(false);
  useEffect(() => {
    if (!horizonOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setHorizonOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [horizonOpen]);
  const meta = BLOCKS[block];
  // Revenues, credits and fixed expenses go through a bank account.
  const hasAccount = block === 'rev' || block === 'cre' || block === 'fix';
  // Savings and investments show an estimated balance instead of the gap, and can be tied to a dedicated account (spec 0007).
  const isSavings = block === 'epa' || block === 'inv';
  const gridClass = `line-grid${isSavings ? ' is-balance' : ''}`;
  const all = monthLines(data, month);
  const lines = all.filter(l => l.block === block);
  // Lines of an out-of-budget account stay listed but are left out of the totals.
  const totals = blockTotals(budgetLines(data, month), block);
  const sections: { label: string; lines: Line[] }[] = [];
  // Variable lines paid from an account out of the budget are grouped under a « Hors budget » sub-title, after the others.
  // Display only: no section is written, the order of the lines in the data is unchanged (spec 0009, RG111).
  const offBudget = block === 'var' ? lines.filter(l => !isLineInBudget(data, l)) : [];
  for (const l of lines) {
    if (offBudget.includes(l)) continue;
    const sec = sections.find(x => x.label === l.section);
    if (sec) sec.lines.push(l);
    else sections.push({ label: l.section, lines: [l] });
  }
  const estimatedTotal = isSavings ? estimatedBalanceTotal(data, ledger, month, block) : 0;
  if (offBudget.length) sections.push({ label: 'Hors budget', lines: offBudget });
  if (block === 'var') {
    const rest = totals.budget - totals.actual;
    strip = { label: 'Restant', value: money(rest), color: rest >= 0 ? 'oklch(0.48 0.13 150)' : 'oklch(0.52 0.19 25)' };
  }
  // Number of entries on a fixed/credit/revenue line: with entries, the account of the line can no longer change (spec 0014, 0015).
  const carriedBy = (l: Line) => (isCarryingBlock(l.block) ? lineExpenses(data, month, l.key).length : 0);
  const set = (key: string, patch: Partial<Line>) => update(d => updateLine(d, month, key, patch));
  const add = (section?: string) => {
    const key = newId('l');
    update(d => addLine(d, month, block, key, section));
    setEditing(`n:${key}`);
  };

  return (
    <div className="panel block" style={toneVars(meta.hue)}>
      <div className="block-head">
        <div className="block-icon">
          <Icon name={meta.icon} size={14} />
        </div>
        <div className="block-title">{meta.title}</div>
        <div style={{ flex: 1 }} />
        {strip && (
          <div className="block-strip" style={{ color: strip.color }}>
            {strip.label} {strip.value}
          </div>
        )}
      </div>
      <div className={`${gridClass} line-head`}>
        <span>Nom</span>
        <span className="num pad">Budget</span>
        <span className="num pad">Réel</span>
        <span className="num">{block === 'var' ? 'Restant' : isSavings ? 'Solde estimé' : 'Écart'}</span>
      </div>
      {sections.map(sec => (
        <div key={sec.label}>
          {sec.label && <div className="block-section">{sec.label}</div>}
          {sec.lines.map(l => {
            // A variable line shows what is left to spend; an empty actual shows the whole budget in grey (spec 0008, RG9, RG11).
            const gap = block === 'var' ? lineRemaining(l) : lineGap(l);
            const est = isSavings ? estimatedBalance(data, ledger, month, l) : null;
            const rowEditing = !!editing?.endsWith(':' + l.key);
            const hist = hover === l.key && !rowEditing ? lineHistory(data, month, l.key) : null;
            return (
              <div
                key={l.key}
                className={`${gridClass} line-row${block === 'var' ? ' is-roomy' : ''}${isLineInBudget(data, l) ? '' : ' is-off-budget'}`}
                onMouseEnter={() => setHover(l.key)}
                onMouseLeave={() => setHover(null)}
                onContextMenu={e => {
                  setDetails(null);
                  setHover(null);
                  const rect = e.currentTarget.getBoundingClientRect();
                  openMenu(e, l.name, [
                    ...(lineTooltip(data, month, l, today) ? [{ label: 'Détails', onSelect: () => setDetails({ key: l.key, rect }) }] : []),
                    ...(locked ? [] : [{ label: 'Supprimer la ligne', danger: true, onSelect: () => update(d => deleteLine(d, month, l.key)) }]),
                  ]);
                }}
              >
                <div className="line-name-wrap">
                  <LineCheckBox month={month} line={l} locked={locked} today={today} />
                  {block === 'var' && <PayModePicker data={data} box={l} disabled={locked} onChange={patch => update(d => setLinePayment(d, month, l.key, patch))} />}
                  {isSavings && (
                    <span className="acc-stack">
                      <AccountPicker data={data} accountId={l.accountId} exclude={l.linkedAccountId} alwaysVisible disabled={locked} hint="Compte débité" onPick={id => update(d => void setLineAccount(d, month, l.key, id))} />
                      <LinkedAccountPicker data={data} linkedAccountId={l.linkedAccountId} block={l.block} sourceId={accountIdOf(data, l.accountId)} stacked disabled={locked} onPick={id => update(d => void setLineLinkedAccount(d, month, l.key, id))} />
                    </span>
                  )}
                  {hasAccount && <AccountPicker data={data} accountId={l.accountId} disabled={locked || carriedBy(l) > 0} hint={carriedBy(l) > 0 ? carriedAccountRefusal(l.block) : block === 'rev' && !isOnMainAccount(data, l.accountId) ? 'Ne compte pas dans le disponible à placer' : undefined} onPick={id => update(d => setLineAccount(d, month, l.key, id))} />}
                  <EditableText id={`n:${l.key}`} value={l.name} onCommit={name => set(l.key, { name })} className="line-name" inputClassName="cell-input is-text" title={[l.name, lineTooltip(data, month, l, today)].filter(Boolean).join('\n')} disabled={locked}>
                    {l.name}
                  </EditableText>
                  {block !== 'var' && <LineCheckMeta month={month} line={l} locked={locked} today={today} />}
                  <LineQuickEntry month={month} line={l} locked={locked || !data.months[month]?.initialized} />
                </div>
                <div className="rel">
                  <EditableAmount id={`b:${l.key}`} value={l.budget} onCommit={v => set(l.key, { budget: v ?? 0 })} className="cell" inputClassName="cell-input" hint="right" disabled={locked}>
                    {money(l.budget)}
                  </EditableAmount>
                </div>
                <div className="rel">
                  {/* Read only (spec 0019, RG19, RG24): the actual is the sum of the entries of the line. Its count is in the tooltip of the row;
                      screen readers get the same text through a visually hidden span (no layout effect). */}
                  <div className={`cell is-readonly${l.actual !== null ? ' has-actual' : ''}`} style={{ color: l.actual === null ? MUTED : undefined }} aria-describedby={`entries:${l.key}`}>
                    {l.actual === null ? '—' : money(l.actual)}
                  </div>
                  <span className="sr-only" id={`entries:${l.key}`}>{lineEntriesNote(data, month, l)}</span>
                </div>
                {isSavings ? (
                  <div className="num gap" style={{ color: est && est.value < 0 ? BAD : undefined }} title={gap === null ? undefined : `Écart : ${gap === 0 ? money(0) : money(gap, true)}`}>
                    {est ? money(est.value) : '—'}
                  </div>
                ) : (
                  <div className="num gap" style={{ color: gapColor(block === 'var' && l.actual === null ? null : gap) }}>
                    {gap === null ? '—' : gap === 0 ? money(0) : money(gap, true)}
                  </div>
                )}
                {details?.key === l.key && (
                  <DetailsBubble title={l.name} text={lineTooltip(data, month, l, today)} rect={details.rect} onClose={() => setDetails(null)} />
                )}
                {hist && (
                  <div className="popover">
                    <div className="popover-title">{l.name}</div>
                    <div className="popover-row">
                      <span>Budget cumulé {parseMonth(month).year}</span>
                      <b>{money(hist.cumulBudget)}</b>
                    </div>
                    <div className="popover-row">
                      <span>Réel cumulé {parseMonth(month).year}</span>
                      <b>{money(hist.cumul)}</b>
                    </div>
                    <div className="popover-row">
                      <span>Solde mois préc.</span>
                      <b>{hist.prevGap === null ? '—' : money(hist.prevGap, true)}</b>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className={`${gridClass} block-foot`}>
        <div className="rel">
          <div
            className={`add-btn${locked ? ' is-disabled' : ''}`}
            title="Ajouter une ligne"
            onClick={locked ? undefined : block === 'epa' ? () => setHorizonOpen(o => !o) : () => add()}
          >
            <span className="add-icon">
              <Icon name="plus" size={13} stroke={3} />
            </span>
            <span>Ajouter</span>
          </div>
          {horizonOpen && !locked && (
            <>
              <div className="backdrop" onClick={() => setHorizonOpen(false)} />
              <div className="popmenu horizon-menu">
                {([['Long terme', SAVINGS_SECTIONS.LT], ['Moyen terme', SAVINGS_SECTIONS.MT]] as const).map(([label, section]) => (
                  <div
                    key={section}
                    className="popmenu-item"
                    onClick={() => {
                      setHorizonOpen(false);
                      add(section);
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="num pad">{money(totals.budget)}</div>
        <div className="num pad">{money(totals.actual)}</div>
        {isSavings ? (
          <div className="num" style={{ color: estimatedTotal < 0 ? BAD : undefined }} title="Somme des soldes estimés (un compte dédié commun n’est compté qu’une fois)">
            {money(estimatedTotal)}
          </div>
        ) : (
          <div className="num" style={{ color: totals.gap >= 0 ? GOOD : BAD }}>
            {money(totals.gap, true)}
          </div>
        )}
      </div>
    </div>
  );
}

/** « Objectifs annuels » (spec 0032, RG16): the first 3 goals of the current year, by creation order, with the calculation of the Objectifs screen. */
function GoalsCard({ onOpenGoals }: { onOpenGoals: () => void }) {
  const { data, ledger } = useStore();
  const year = currentYear();
  const views = summaryGoals(data, ledger).map(view => ({ view, hue: goalHue(data, view.goal) }));
  return (
    <div className="panel block" style={toneVars(HUE.obj)}>
      <div className="block-head">
        <div className="block-icon">
          <Icon name="goals" size={14} />
        </div>
        <div className="block-title">Objectifs annuels</div>
        <div style={{ flex: 1 }} />
        <button type="button" className="btn-quiet is-discreet" onClick={onOpenGoals}>
          Voir les objectifs
        </button>
      </div>
      <div className="goals">
        {views.length === 0 && <div className="empty">Aucun objectif {year}</div>}
        {views.map(({ view, hue }) => {
          const t = tone(hue);
          const bad = view.status === 'Dépassé';
          return (
            <div key={view.id} className="goal">
              <div className="goal-head">
                <span className="goal-name">{view.name}</span>
                <span className="pill" style={{ background: bad ? tone(25).soft : t.soft, color: bad ? tone(25).ink : t.ink }}>
                  {view.status}
                </span>
              </div>
              <div className="goal-values">
                <span>{view.defined ? goalSummaryText(view) : '—'}</span>
                <b>{view.defined ? percent(view.pct) : 'À définir'}</b>
              </div>
              <div className="progress is-obj">
                <div style={{ width: `${view.pct}%`, background: bad ? BAD : view.kind === 'rate' ? 'oklch(0.82 0.13 90)' : undefined }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Allocation field of an envelope tile, prefilled with the current value: Entrée or leaving the field replaces it (0 is valid), Échap cancels, a negative amount stays open with an error. */
function AllocEditor({ value, onSet, onClose }: { value: number; onSet: (amount: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const submit = () => {
    if (cancelled.current) return;
    const text = ref.current?.value ?? '';
    const v = text.trim() ? parseAmount(text) : null;
    if (v !== null && v < 0) {
      setError('Montant positif ou nul requis');
      ref.current?.focus();
      return;
    }
    if (v !== null) onSet(v);
    onClose();
  };
  return (
    <div className="env-tile-add" onClick={e => e.stopPropagation()}>
      <div className="env-tile-add-row">
        <span>alloué</span>
        <input
          ref={ref}
          className="cell-input is-alloc"
          inputMode="decimal"
          defaultValue={rawNumber(value)}
          onChange={() => setError(null)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
            else if (e.key === 'Escape') {
              cancelled.current = true;
              onClose();
            }
          }}
          onBlur={submit}
        />
      </div>
      {error && <div className="env-tile-error">{error}</div>}
    </div>
  );
}

function EnvelopesCompact({ month, locked }: { month: MonthKey; locked: boolean }) {
  const { data, ledger, update } = useStore();
  const { editing, setEditing } = useUi();
  const [warned, setWarned] = useState(false);
  useEffect(() => setWarned(false), [month]);
  // The allocation warning compares with the money really available (spec 0005, RG24).
  const available = monthSummary(data, ledger, month).availableReal ?? 0;
  const canEdit = !locked && data.envelopes.length > 0;
  const { year, month: m0 } = parseMonth(month);
  const alerts = envelopeAlerts(data, ledger, year, m0);
  const alloc = monthAlloc(data, month);
  const vio = tone(HUE.epa);
  const alertText = alerts
    .map(a => {
      const env = data.envelopes.find(e => e.id === a.envelopeId)!;
      const what = a.labels.length === 1 ? a.labels[0] : env.name;
      return `${what} ${money(a.planned)} prévu, il manque ~${money(a.missing)}`;
    })
    .join(' · ');
  return (
    <div className="panel block" style={toneVars(HUE.epa)}>
      <div className="block-head">
        <div className="block-icon">
          <Icon name="mail" size={14} />
        </div>
        <div className="block-title">Enveloppes</div>
        <div style={{ flex: 1 }} />
        <EnvelopesTotal month={month} />
        {alerts.length > 0 && (
          <div className="alert-pill">
            <Icon name="alert" size={12} stroke={2.8} />
            {alerts.length} {alerts.length > 1 ? 'alertes' : 'alerte'}
          </div>
        )}
      </div>
      {alerts.length > 0 && <div className="alert-box">{alertText}</div>}
      {warned && available < 0 && <div className="alert-box">Dépasse le disponible de {money(-available)}</div>}
      {data.envelopes.length === 0 && <div className="env-empty">Aucune enveloppe. Créez-en une pour y allouer des sous.</div>}
      <div className="env-compact">
        {data.envelopes.map(e => {
          const warn = alerts.some(a => a.envelopeId === e.id);
          return (
            <div
              key={e.id}
              className={`env-tile${canEdit ? ' is-editable' : ''}`}
              title={envelopeTooltip(data, month, e) || undefined}
              style={{ background: vio.bg, borderColor: warn ? 'oklch(0.8 0.12 55)' : vio.line }}
              onClick={canEdit ? () => setEditing(`ea:${e.id}`) : undefined}
            >
              <div className="env-tile-head">
                <AccountDot account={data.accounts.find(a => a.id === e.accountId)} />
                <EditableText id={`en:${e.id}`} value={e.name} onCommit={name => update(d => void renameEnvelope(d, e.id, name))} className="env-tile-name" inputClassName="cell-input is-text">
                  {e.name}
                </EditableText>
                {warn && <span className="warn-dot" />}
                <EnvelopeCheckBox month={month} env={e} locked={locked} />
              </div>
              {/* Spec 0026, RG26: the budget virtual balance alone (not capped, a negative one shows), the cash balance right under it, none when 0. */}
              <div className="env-tile-solde">{money(ledger.envMonth(e.id, month)?.balance ?? 0)}</div>
              {envelopeCash(data, e.id, month) !== 0 && (
                <div className="env-tile-alloc is-cash">
                  Espèces <b>{money(envelopeCash(data, e.id, month))}</b>
                </div>
              )}
              {(() => {
                const c = envelopeConsumption(data, ledger, e.id, month);
                if (!c) return null;
                return (
                  <div className="has-tip" data-tip={`Solde de départ ${money(c.start)} · dépensé ${money(c.spent)} · reste ${money(c.remaining)}`}>
                    <div className="progress dash-bar" style={{ background: vio.soft }}>
                      <div style={{ width: `${c.consumed}%`, background: c.remaining < 0 ? 'oklch(0.62 0.18 25)' : vio.base }} />
                    </div>
                    <div className="env-tile-alloc">
                      dépensé <b>{money(c.spent)}</b> sur {money(c.start)}
                    </div>
                  </div>
                );
              })()}
              {canEdit && editing === `ea:${e.id}` ? (
                <AllocEditor
                  value={alloc[e.id] ?? 0}
                  onSet={amount => {
                    update(d => void setEnvelopeAllocation(d, month, e.id, amount));
                    setWarned(true);
                  }}
                  onClose={() => setEditing(null)}
                />
              ) : (
                <div className="env-tile-alloc">
                  alloué <b>{money(alloc[e.id] ?? 0)}</b>
                </div>
              )}
            </div>
          );
        })}
        <div
          className={`env-add${data.envelopes.length % 2 === 0 ? ' is-row' : ''}`}
          onClick={() => {
            const id = newId('env');
            update(d => void addEnvelope(d, id));
            setEditing(`en:${id}`);
          }}
        >
          <Icon name="plus" size={14} stroke={3} />
          Ajouter
        </div>
      </div>
    </div>
  );
}
