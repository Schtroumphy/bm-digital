import { useEffect, useRef, useState } from 'react';
import { AccountDot, AccountPicker } from '../components/AccountPicker';
import { LinkedAccountPicker } from '../components/LinkedAccountPicker';
import { PayModePicker } from '../components/PayModePicker';
import { EditableAmount, EditableText } from '../components/Editable';
import { goalHue, goalSummaryText } from '../components/goalStyle';
import { currentYear, firstGoalOfKind, goalView, summaryGoals } from '../../domain/goals';
import { DetailsBubble } from '../components/DetailsBubble';
import { Icon, type IconName } from '../components/Icon';
import { carriedAccountRefusal, isCarryingBlock, lineExpenses } from '../../domain/lineExpenses';
import type { OperationsFocus } from './Expenses';
import { lineEntriesNote, lineEntryDetails } from '../../domain/lineActuals';
import { LineQuickEntry } from '../components/LineQuickEntry';
import { LineScheduleMeta } from '../components/LineSchedule';
import { BAD, gapColor, GOOD, HUE, MUTED, tone, toneVars } from '../components/tone';
import { setLineAccount, setLineLinkedAccount } from '../../application/bankAccounts';
import { addEnvelope, renameEnvelope } from '../../application/envelopes';
import { setLinePayment } from '../../application/payment';
import { addLine, applyTemplate, deleteLine, duplicatePrevious, monthCsv, saveAsTemplate, SAVINGS_SECTIONS, updateLine } from '../../application/actions';
import { envelopeSplitRefusal, setEnvelopeSplit, type EnvelopeSplitRefusal } from '../../application/cash';
import { envelopeCashPart } from '../../domain/cash';
import { envelopeAllocationFigures } from '../../domain/envelopeAllocation';
import { CashMonthBlock } from '../components/CashMonthBlock';
import { accountIdOf, isLineInBudget, isOnMainAccount } from '../../domain/bank';
import { isoDate } from '../../domain/checkoff';
import { budgetLockReason } from '../../domain/movementLines';
import { leftLineKeys, lineTooltip } from '../../domain/comingUp';
import { envelopeCash } from '../../domain/envelopeCash';
import { availableRealBreakdown, blockTotals, budgetLines, envelopeAlerts, estimatedBalance, estimatedBalanceTotal, lineGap, lineRemaining, lineHistory, monthSummary } from '../../domain/budget';
import { addMonths, money, monthLabel, parseAmount, parseMonth, percent, rawNumber, round2 } from '../../domain/format';
import { isMonthLocked, isYearClosed, monthAlloc, monthLines } from '../../domain/ledger';
import type { BlockKey, BudgetData, Line, MonthKey } from '../../domain/types';
import { EnvelopesTotal } from './Envelopes';
import { ComingUpCard } from './ComingUpCard';
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


export const BLOCK_TITLES = Object.fromEntries(Object.entries(BLOCKS).map(([k, v]) => [k, v.title])) as Record<BlockKey, string>;

export function BudgetActions({ month }: { month: MonthKey }) {
  const { data, update } = useStore();
  const [open, setOpen] = useState(false);
  const md = data.months[month];
  const locked = isMonthLocked(data, month);
  const prevReady = !!data.months[addMonths(month, -1)]?.initialized;
  const confirmReplace = () => !md?.initialized || window.confirm(`Remplacer les lignes de ${monthLabel(month)} ?`);

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

export function BudgetScreen({ month, onOpenGoals, onOpenOperations }: { month: MonthKey; onOpenGoals: () => void; onOpenOperations: (f: OperationsFocus) => void }) {
  const { data, ledger, update } = useStore();
  const uninit = !data.months[month]?.initialized;
  const locked = isMonthLocked(data, month);
  const today = isoDate();
  const s = monthSummary(data, ledger, month);
  const [availableInfo, setAvailableInfo] = useState<DOMRect | null>(null);
  // « Masquer le réel »: focus on the budget while planning; display only, remembered on this device.
  const [hideActual, setHideActual] = useState(() => localStorage.getItem('budget.hideActual') === '1');
  const toggleHideActual = () =>
    setHideActual(v => {
      localStorage.setItem('budget.hideActual', v ? '0' : '1');
      return !v;
    });
  // « Surligner le reste à sortir »: highlights the lines still to leave an account (« À venir ce mois-ci »); display only, remembered on this device.
  const [highlightLeft, setHighlightLeft] = useState(() => localStorage.getItem('budget.highlightLeft') === '1');
  const toggleHighlightLeft = () =>
    setHighlightLeft(v => {
      localStorage.setItem('budget.highlightLeft', v ? '0' : '1');
      return !v;
    });
  const leftKeys = highlightLeft && !uninit ? leftLineKeys(data, month, today) : undefined;
  // « Fond de secours »: the first `amount` goal of the current year (spec 0032, Q2); nothing to show without one.
  const emergencyGoal = firstGoalOfKind(data, 'amount');
  const emergency = emergencyGoal ? goalView(data, ledger, emergencyGoal) : null;
  const emergencyPct = emergency?.pct ?? 0;
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
      <div className={uninit ? 'is-preview' : undefined}>
        <CashMonthBlock month={month}>
          <button type="button" role="switch" aria-checked={hideActual} className={`switch${hideActual ? ' is-on' : ''}`} onClick={toggleHideActual}>
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
            Masquer le réel
          </button>
          <button type="button" role="switch" aria-checked={highlightLeft} className={`switch${highlightLeft ? ' is-on' : ''}`} onClick={toggleHighlightLeft}>
            <span className="switch-track">
              <span className="switch-thumb" />
            </span>
            Surligner le reste à sortir
          </button>
        </CashMonthBlock>
        <div className="summary">
          <div className="panel kpi kpi-hero">
            <div className="kpi-label">Reste à placer</div>
            <div className="kpi-hero-value">{money(s.remaining)}</div>
            {s.availableReal !== null && (
              <div
                className="kpi-sub"
                style={{ color: s.availableReal < 0 ? BAD : undefined, cursor: 'pointer' }}
                title="Cliquer pour voir le détail du calcul"
                onClick={e => setAvailableInfo(e.currentTarget.getBoundingClientRect())}
              >
                Disponible (réel) {money(s.availableReal)}
              </div>
            )}
            {availableInfo && (
              <DetailsBubble title="Disponible (réel)" text={availableRealText(data, month)} rect={availableInfo} onClose={() => setAvailableInfo(null)} />
            )}
          </div>
          <GapKpi
            label="Écart dépenses"
            text={`Budget − réel, sur les crédits, les dépenses fixes et les dépenses variables.\n\nUne ligne sans réel compte à son budget (écart nul), comme à la validation du mois. Les revenus ne sont pas concernés.\n\nPositif : vous dépensez moins que prévu. Négatif : vous dépensez plus que prévu.`}
            value={s.expenseGap}
            positive="Moins dépensé que prévu"
            negative="Plus dépensé que prévu"
          />
          <GapKpi
            label="Écart épargne"
            text={`Réel − budget, sur les épargnes et les placements.\n\nUne ligne sans réel compte à son budget (écart nul). Les allocations d’enveloppes comptent à leur budget : elles n’ajoutent aucun écart.\n\nPositif : vous épargnez plus que prévu. Négatif : vous épargnez moins que prévu.`}
            value={s.savingsGap}
            positive="Plus épargné que prévu"
            negative="Moins épargné que prévu"
          />
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
            <BlockCard block="rev" month={month} locked={locked || uninit} today={today} hideActual={hideActual} leftKeys={leftKeys} onOpenOperations={onOpenOperations} />
            <BlockCard block="cre" month={month} locked={locked || uninit} today={today} hideActual={hideActual} leftKeys={leftKeys} onOpenOperations={onOpenOperations} />
            <GoalsCard onOpenGoals={onOpenGoals} />
          </div>
          <div className="budget-col">
            <BlockCard block="fix" month={month} locked={locked || uninit} today={today} hideActual={hideActual} leftKeys={leftKeys} onOpenOperations={onOpenOperations} />
            <BlockCard block="var" month={month} locked={locked || uninit} today={today} hideActual={hideActual} leftKeys={leftKeys} onOpenOperations={onOpenOperations} />
          </div>
          <div className="budget-col">
            <BlockCard block="epa" month={month} locked={locked || uninit} today={today} hideActual={hideActual} leftKeys={leftKeys} onOpenOperations={onOpenOperations} />
            <BlockCard block="inv" month={month} locked={locked || uninit} today={today} hideActual={hideActual} leftKeys={leftKeys} onOpenOperations={onOpenOperations} strip={{ label: 'Total global', value: money(s.investTotal), color: 'oklch(0.4 0.1 250)' }} />
          </div>
          <div className="budget-col">
            <EnvelopesCompact month={month} locked={locked || !data.months[month]?.initialized} />
            <ComingUpCard month={month} today={today} />
          </div>
        </div>
      </div>
    </>
  );
}

/** KPI of a gap against the budget: signed amount, red when negative, neutral and without caption at 0 (spec 0038, RG8-RG9). */
function GapKpi({ label, text, value, positive, negative }: { label: string; text: string; value: number; positive: string; negative: string }) {
  const color = value > 0 ? GOOD : value < 0 ? BAD : undefined;
  const [info, setInfo] = useState<DOMRect | null>(null);
  return (
    <div className="panel kpi">
      <div className="kpi-label" style={{ cursor: 'pointer' }} title="Cliquer pour voir l’explication" onClick={e => setInfo(e.currentTarget.getBoundingClientRect())}>{label}</div>
      {info && <DetailsBubble title={label} text={text} rect={info} onClose={() => setInfo(null)} />}
      <div className="kpi-value" style={{ color }}>{money(value, true)}</div>
      {value !== 0 && <div className="kpi-sub" style={{ color }}>{value > 0 ? positive : negative}</div>}
    </div>
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

/** Explanation of the « Disponible (réel) » figure: the terms of its formula with the month's values. */
function availableRealText(d: BudgetData, m: MonthKey): string {
  const b = availableRealBreakdown(d, m);
  if (!b) return '';
  const lines = [`Reste à placer prévu : ${money(b.remaining)}`];
  if (b.elsewhere !== 0) lines.push(`− revenus budgétés hors compte principal : ${money(b.elsewhere)}`);
  lines.push(`+ écarts des revenus du compte principal (réel − budget) : ${money(b.mainGaps, true)}`);
  lines.push(`− écarts épargne et placements (réel − budget) : ${money(b.paidIn, true)}`);
  lines.push(`= Disponible (réel) : ${money(b.total)}`);
  lines.push('', b.total < 0 ? 'Négatif : vous avez placé plus que ce que le mois permet, ou perçu moins que prévu.' : 'C’est ce que vous pouvez encore placer maintenant.');
  return lines.join('\n');
}

function BlockCard({ block, month, locked, today, strip, hideActual, leftKeys, onOpenOperations }: { block: BlockKey; hideActual: boolean; leftKeys?: Set<string>; month: MonthKey; locked: boolean; today: string; onOpenOperations: (f: OperationsFocus) => void; strip?: { label: string; value: string; color: string } }) {
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
  const gridClass = `line-grid${isSavings ? ' is-balance' : ''}${hideActual ? ' no-actual' : ''}`;
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
        {!hideActual && <span className="num pad">Réel</span>}
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
                className={`${gridClass} line-row${block === 'var' ? ' is-roomy' : ''}${isLineInBudget(data, l) ? '' : ' is-off-budget'}${leftKeys?.has(l.key) ? ' is-left' : ''}`}
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
                  {budgetLockReason(data, month, l) && (
                    <span title={budgetLockReason(data, month, l) ?? undefined} style={{ display: 'inline-flex', alignItems: 'center', flex: 'none', marginLeft: 4, opacity: 0.6 }}>
                      <Icon name="lock" size={11} />
                    </span>
                  )}
                  {block !== 'var' && <LineScheduleMeta month={month} line={l} locked={locked} today={today} />}
                  <LineQuickEntry month={month} line={l} locked={locked || !data.months[month]?.initialized} />
                </div>
                <div className="rel">
                  {/* A line attached to a transfer has its budget locked until it is detached (spec 0045, RG9). */}
                  <EditableAmount id={`b:${l.key}`} value={l.budget} onCommit={v => set(l.key, { budget: v ?? 0 })} className="cell" inputClassName="cell-input" hint="right" disabled={locked || !!budgetLockReason(data, month, l)} title={budgetLockReason(data, month, l) ?? undefined}>
                    {money(l.budget)}
                  </EditableAmount>
                </div>
                {!hideActual && (
                <div className="rel">
                  {/* Read only (spec 0019, RG19, RG24): the actual is the sum of the entries of the line. Its count is in the tooltip of the row;
                      screen readers get the same text through a visually hidden span (no layout effect). */}
                  {/* Clicking an actual opens the Opérations tab filtered on the entries of the line (savings blocks are transfers, not operations). */}
                  <div
                    className={`cell is-readonly${l.actual !== null ? ' has-actual' : ''}`}
                    style={{ color: l.actual === null ? MUTED : undefined, cursor: l.actual !== null && !isSavings ? 'pointer' : undefined }}
                    aria-describedby={`entries:${l.key}`}
                    onClick={l.actual !== null && !isSavings ? () => onOpenOperations({ type: block === 'var' ? 'var' : block === 'rev' ? 'rev' : 'fix', target: l.key, label: l.name }) : undefined}
                  >
                    {l.actual === null ? '—' : money(l.actual)}
                  </div>
                  <span className="sr-only" id={`entries:${l.key}`}>{lineEntriesNote(data, month, l)}</span>
                </div>
                )}
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
                  <DetailsBubble title={l.name} text={[lineTooltip(data, month, l, today), lineEntryDetails(data, month, l)].filter(Boolean).join('\n\n')} rect={details.rect} onClose={() => setDetails(null)} />
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
        {!hideActual && <div className="num pad">{money(totals.actual)}</div>}
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

/** Why an editor submission is refused, and which field to put back in focus. */
interface SplitError {
  field: 'alloc' | 'part';
  message: string;
}

/**
 * Editor of the allocation of an envelope tile (spec 0040, RG15 à RG23): two fields, « alloué » and « dont espèces », prefilled with the current values,
 * and a read-only « virtuel » line that follows the typing. Entrée, or leaving BOTH fields, validates the pair; Tab between the two does not; Échap cancels.
 * `onSubmit` gets the amounts (null = field left empty = unchanged) and returns an error to display, or null when the pair was saved.
 */
function AllocEditor({ value, cashPart, onSubmit, onClose }: { value: number; cashPart: number; onSubmit: (allocation: number | null, part: number | null) => SplitError | null; onClose: () => void }) {
  const allocRef = useRef<HTMLInputElement>(null);
  const partRef = useRef<HTMLInputElement>(null);
  const [allocText, setAllocText] = useState(rawNumber(value));
  const [partText, setPartText] = useState(cashPart > 0 ? rawNumber(cashPart) : '');
  const [error, setError] = useState<SplitError | null>(null);
  const cancelled = useRef(false);
  useEffect(() => {
    allocRef.current?.focus();
    allocRef.current?.select();
  }, []);
  // Amount typed in a field: null when empty, NaN when it is not a number.
  const typed = (text: string) => (text.trim() ? parseAmount(text) ?? NaN : null);
  const virtual = round2((typed(allocText) ?? value) - (typed(partText) ?? cashPart));
  const submit = () => {
    if (cancelled.current) return;
    const allocation = typed(allocText);
    const part = typed(partText);
    // A negative or non-numeric amount never reaches the use case: same message for both fields.
    const bad: SplitError | null = Number.isNaN(allocation) || (allocation !== null && allocation < 0) ? { field: 'alloc', message: 'Montant positif ou nul requis' } : Number.isNaN(part) || (part !== null && part < 0) ? { field: 'part', message: 'Montant positif ou nul requis' } : null;
    // An untouched part is sent as « unchanged »: lowering the allocation alone is then refused as « below the part » (RG17, RG20).
    const refused = bad ?? onSubmit(allocation, part === cashPart ? null : part);
    if (!refused) return onClose();
    setError(refused);
    (refused.field === 'part' ? partRef : allocRef).current?.focus();
  };
  const field = (name: 'alloc' | 'part', label: string, ref: typeof allocRef, text: string, set: (t: string) => void) => (
    <div className="env-tile-add-row">
      <span>{label}</span>
      <input
        ref={ref}
        className={`cell-input is-alloc${error?.field === name ? ' is-invalid' : ''}`}
        inputMode="decimal"
        value={text}
        onChange={e => {
          set(e.target.value);
          setError(null);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') submit();
          else if (e.key === 'Escape') {
            cancelled.current = true;
            onClose();
          }
        }}
      />
    </div>
  );
  return (
    <div
      className="env-tile-add"
      onClick={e => e.stopPropagation()}
      // Focus moving from one field to the other stays inside the editor: nothing is validated.
      onBlur={e => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) submit();
      }}
    >
      {field('alloc', 'alloué', allocRef, allocText, setAllocText)}
      {field('part', 'dont espèces', partRef, partText, setPartText)}
      {virtual >= 0 && <div className="env-tile-alloc">virtuel <b>{money(virtual)}</b></div>}
      {error && <div className="env-tile-error">{error.message}</div>}
      <div className="env-tile-hint">Entrée = valider · Échap = annuler</div>
    </div>
  );
}

/** Message shown in the editor for a refusal of the pair (spec 0040, RG17). `allocation` and `part` are the amounts typed, null = unchanged. */
function splitRefusalError(refusal: EnvelopeSplitRefusal, allocation: number, currentPart: number): SplitError {
  switch (refusal) {
    case 'part-above-allocation': return { field: 'part', message: `La part en espèces ne peut pas dépasser l’allocation (${money(allocation)})` };
    case 'allocation-below-part': return { field: 'alloc', message: `L’allocation ne peut pas passer sous la part en espèces (${money(currentPart)})` };
    case 'invalid-part': return { field: 'part', message: 'Montant positif ou nul requis' };
    case 'invalid-allocation': return { field: 'alloc', message: 'Montant positif ou nul requis' };
    default: return { field: 'alloc', message: 'Modification impossible sur ce mois' };
  }
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
              style={{ background: vio.bg, borderColor: warn ? 'oklch(0.8 0.12 55)' : vio.line }}
              onClick={canEdit ? () => setEditing(`ea:${e.id}`) : undefined}
            >
              <div className="env-tile-head">
                <EditableText id={`en:${e.id}`} value={e.name} onCommit={name => update(d => void renameEnvelope(d, e.id, name))} className="env-tile-name" inputClassName="cell-input is-text">
                  {e.name}
                </EditableText>
                {warn && <span className="warn-dot" />}
                <AccountDot account={data.accounts.find(a => a.id === e.accountId)} />
              </div>
              {(() => {
                // Spec 0040: the tile shows what was ALLOCATED in the month (virtual, then cash) and the spending against it, not the balances.
                const f = envelopeAllocationFigures(data, ledger, e.id, month);
                const cash = f?.cashAllocation ?? 0;
                const virtualAlloc = f?.virtualAllocation ?? 0;
                const bank = ledger.envMonth(e.id, month)?.balance ?? 0;
                const tip = f
                  ? `Virtuel : dépensé ${money(f.virtualSpent)} sur ${money(f.virtualAllocation)}${f.cashAllocation > 0 || f.cashSpent !== 0 ? ` · Espèces : dépensé ${money(f.cashSpent)} sur ${money(f.cashAllocation)}` : ''} · Solde virtuel ${money(bank)}${cash > 0 || f.cashSpent !== 0 || envelopeCash(data, e.id, month) > 0 ? ` · Solde espèces ${money(envelopeCash(data, e.id, month))}` : ''}`
                  : '';
                return (
                  <>
                    <div className="env-tile-modes">
                      <div className="env-tile-mode">
                        <span className="env-tile-mode-label"><span aria-hidden>💳</span>Virtuel</span>
                        <span className="env-tile-solde">{money(virtualAlloc)}</span>
                      </div>
                      {cash > 0 && (
                        <div className="env-tile-mode">
                          <span className="env-tile-mode-label"><span aria-hidden>💵</span>Espèces</span>
                          <span className="env-tile-solde">{money(cash)}</span>
                        </div>
                      )}
                    </div>
                    {f?.showBar && (
                      <div className="has-tip" data-tip={tip}>
                        <div className={`progress dash-bar is-split${f.overrun > 0 ? ' is-over' : ''}`} style={{ background: vio.soft }}>
                          <div style={{ width: `${f.virtualPct}%`, background: f.overrun > 0 ? 'oklch(0.62 0.18 25)' : vio.base }} />
                          <div className="is-cash-spent" style={{ width: `${f.cashPct}%` }} />
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
              {canEdit && editing === `ea:${e.id}` ? (
                <AllocEditor
                  value={alloc[e.id] ?? 0}
                  cashPart={envelopeCashPart(data, month, e.id)}
                  onSubmit={(allocation, part) => {
                    const refusal = envelopeSplitRefusal(data, month, e.id, allocation, part);
                    if (refusal) return splitRefusalError(refusal, allocation ?? alloc[e.id] ?? 0, envelopeCashPart(data, month, e.id));
                    update(d => void setEnvelopeSplit(d, month, e.id, allocation, part));
                    setWarned(true);
                    return null;
                  }}
                  onClose={() => setEditing(null)}
                />
              ) : (
                (() => {
                  const f = envelopeAllocationFigures(data, ledger, e.id, month);
                  return (
                    <>
                      {f?.showBar && f.overrun > 0 && <div className="env-tile-over">dépassé de {money(f.overrun)}</div>}
                      <div className="env-tile-line">
                        {f?.showBar ? <div className="env-tile-alloc">dépensé <b>{money(f.spent)}</b></div> : <span />}
                        <div className="env-tile-alloc">
                          alloué <b>{money(alloc[e.id] ?? 0)}</b>
                        </div>
                      </div>
                    </>
                  );
                })()
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
