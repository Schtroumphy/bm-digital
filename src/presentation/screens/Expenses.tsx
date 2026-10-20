import { useState } from 'react';
import { AccountDot, AccountPicker } from '../components/AccountPicker';
import { EditableAmount } from '../components/Editable';
import { Icon } from '../components/Icon';
import { HUE, MUTED, tone, toneVars } from '../components/tone';
import { addTransaction, deleteTransaction, setStatement } from '../../application/actions';
import { setTransactionAccount } from '../../application/bankAccounts';
import { activeBankAccounts, defaultTransactionAccountId, isAccountInBudget } from '../../domain/bank';
import { monthSummary } from '../../domain/budget';
import { addMonths, currentMonthKey, dayLabel, money, monthLabel, parseAmount, parseMonth, round2, sanitizeAmountInput } from '../../domain/format';
import { accounts, isMonthLocked, monthLines } from '../../domain/ledger';
import type { MonthKey, TxType } from '../../domain/types';
import { newId, useStore } from '../state/store';

const TYPE_LABEL: Record<TxType, string> = { var: 'Variable', env: 'Enveloppe', epa: 'Sortie épargne' };

export function ExpensesScreen({ month }: { month: MonthKey }) {
  const [tab, setTab] = useState<'saisie' | 'soldes'>('saisie');
  return (
    <>
      <div className="tabs">
        {(
          [
            ['saisie', 'Saisie des dépenses'],
            ['soldes', 'Soldes épargnes'],
          ] as const
        ).map(([id, label]) => (
          <div key={id} className={`tab${tab === id ? ' is-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </div>
        ))}
      </div>
      {tab === 'saisie' ? <EntryTab month={month} /> : <BalancesTab month={month} />}
    </>
  );
}

/** Day given to a new expense: today in the current month, else the month's last day (past) or first day (future). */
function defaultDay(month: MonthKey) {
  const now = currentMonthKey();
  if (month === now) return new Date().getDate();
  if (month > now) return 1;
  const { year, month: m } = parseMonth(month);
  return new Date(year, m + 1, 0).getDate();
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <div className={`chip${on ? ' is-on' : ''}`} onClick={onClick}>
      {children}
    </div>
  );
}

function EntryTab({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  const lines = monthLines(data, month);
  const locked = isMonthLocked(data, month);
  const [form, setForm] = useState<{ label: string; amount: string; type: TxType; target: string; accountId: string }>({ label: '', amount: '', type: 'var', target: '', accountId: '' });

  const targets: [string, string][] =
    form.type === 'var' ? lines.filter(l => l.block === 'var').map(l => [l.key, l.name]) : form.type === 'env' ? data.envelopes.map(e => [e.id, e.name]) : lines.filter(l => l.block === 'epa').map(l => [l.key, l.name]);
  const target = targets.some(t => t[0] === form.target) ? form.target : targets[0]?.[0] ?? '';
  // Until the user picks an account (form.accountId empty), « Payé avec » follows the payment mode of the chosen box (spec 0006, RG5).
  const accountId = data.accounts.some(a => a.id === form.accountId && !a.archived) ? form.accountId : defaultTransactionAccountId(data, { type: form.type, month, target });
  const amount = parseAmount(form.amount) ?? 0;
  // Paid from an account out of the budget: the budget figures do not move.
  const budgetAmount = isAccountInBudget(data, accountId) ? amount : 0;

  const s = monthSummary(data, ledger, month);
  const txs = data.transactions.filter(t => t.month === month);
  const targetName = (type: TxType, id: string) => (type === 'env' ? data.envelopes.find(e => e.id === id)?.name : lines.find(l => l.key === id)?.name) ?? 'Supprimé';
  const targetHue = (type: TxType, id: string) => (type === 'var' ? HUE.dep : type === 'env' ? data.envelopes.find(e => e.id === id)?.hue ?? HUE.epa : HUE.epa);

  let impact: [string, string][] = [];
  if (target && form.type === 'var') {
    const l = lines.find(x => x.key === target)!;
    const cur = l.actual ?? 0;
    const varB = lines.filter(x => x.block === 'var').reduce((a, x) => a + x.budget, 0);
    const varR = lines.filter(x => x.block === 'var').reduce((a, x) => a + (x.actual ?? 0), 0);
    impact = [
      [`${l.name} · réel`, `${money(cur)} → ${money(cur + budgetAmount)}`],
      ['Restant des variables', `${money(varB - varR)} → ${money(varB - varR - budgetAmount)}`],
    ];
  } else if (target && form.type === 'env') {
    const e = data.envelopes.find(x => x.id === target)!;
    const spent = ledger.envMonth(e.id, month)?.spent ?? 0;
    impact = [
      [`${e.name} · dépensé`, `${money(spent)} → ${money(spent + budgetAmount)}`],
      ['Épargne réelle', `${money(s.realSavings)} → ${money(s.realSavings - budgetAmount)}`],
    ];
  } else if (target) {
    const out = round2(txs.filter(t => t.type === 'epa' && t.target === target).reduce((a, t) => a + t.amount, 0));
    impact = [
      [`${targetName('epa', target)} · sorties`, `${money(out)} → ${money(out + amount)}`],
      ['Épargne réelle', `${money(s.realSavings)} → ${money(s.realSavings - budgetAmount)}`],
    ];
  }

  const add = () => {
    if (!amount || amount < 0 || !target || locked) return;
    update(d =>
      addTransaction(d, { id: newId('t'), month, day: defaultDay(month), label: form.label.trim() || targetName(form.type, target), amount, type: form.type, target, accountId }),
    );
    // Picking another account is a one-off: the next expense follows its box again.
    setForm(f => ({ ...f, label: '', amount: '', accountId: '' }));
  };

  const flow: { label: string; value: number; hero?: boolean }[] = [
    { label: 'Épargne budgétisée', value: s.savings },
    { label: '+ Allocations des enveloppes', value: round2(s.grossSavings - s.savings) },
    { label: '− Dépenses des enveloppes', value: s.envelopeSpent },
    { label: '− Sorties des comptes d’épargne', value: s.savingsOut },
    { label: 'Épargne réelle', value: s.realSavings, hero: true },
  ];

  return (
    <div className="dep-layout">
      <div className="panel-lg form-card">
        <div className="form-title">Nouvelle dépense</div>
        <div className="form-row">
          <label className="field-w">
            <span className="field-label">Libellé</span>
            <input className="text-input" value={form.label} placeholder="Ex. Pharmacie" onChange={e => setForm(f => ({ ...f, label: e.target.value }))} onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
          <label className="field-w">
            <span className="field-label">Montant</span>
            <input className="text-input is-amount" value={form.amount} placeholder="0,00 €" inputMode="decimal" onChange={e => setForm(f => ({ ...f, amount: sanitizeAmountInput(e.target.value) }))} onKeyDown={e => e.key === 'Enter' && add()} />
          </label>
        </div>
        <div>
          <div className="field-label is-gap">Type</div>
          <div className="chips">
            {(['var', 'env', 'epa'] as const).map(t => (
              <Chip key={t} on={form.type === t} onClick={() => setForm(f => ({ ...f, type: t, target: '' }))}>
                {{ var: 'Dépense variable', env: 'Enveloppe', epa: 'Sortie épargne' }[t]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="field-label is-gap">{form.type === 'var' ? 'Ligne de dépense variable' : form.type === 'env' ? 'Enveloppe' : 'Compte d’épargne débité'}</div>
          <div className="chips is-wrap">
            {targets.map(([id, name]) => (
              <Chip key={id} on={target === id} onClick={() => setForm(f => ({ ...f, target: id }))}>
                {name}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <div className="field-label is-gap">{form.type === 'epa' ? 'Reçu sur' : 'Payé avec'}</div>
          <div className="chips is-wrap">
            {activeBankAccounts(data).map(a => (
              <Chip key={a.id} on={accountId === a.id} onClick={() => setForm(f => ({ ...f, accountId: a.id }))}>
                <span className="acc-item">
                  <AccountDot account={a} />
                  {a.name}
                </span>
              </Chip>
            ))}
          </div>
        </div>
        <div className="impact">
          <div className="field-label">Impact sur le réel</div>
          {impact.map(([l, v]) => (
            <div key={l} className="impact-row">
              <span>{l}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>
        <div className={`btn-dark is-block${!amount || locked ? ' is-disabled' : ''}`} onClick={add}>
          <Icon name="plus" size={15} stroke={3} />
          Ajouter la dépense
        </div>
      </div>

      <div className="dep-side">
        <div className="panel-lg flow">
          {flow.map((c, i) => (
            <div key={c.label} className={`flow-cell${c.hero ? ' is-hero' : ''}${i === flow.length - 1 ? ' is-last' : ''}`}>
              <div className="flow-label">{c.label}</div>
              <div className="flow-value">{money(c.value)}</div>
            </div>
          ))}
        </div>
        <div className="panel-lg">
          <div className="tx-head">
            <div className="tx-title">Dépenses de {monthLabel(month)}</div>
            <b>{money(txs.reduce((a, t) => a + t.amount, 0))}</b>
          </div>
          <div className="tx-grid tx-cols">
            <span>Date</span>
            <span>Libellé</span>
            <span>Imputation</span>
            <span>Compte</span>
            <span className="num">Montant</span>
            <span />
          </div>
          {[...txs]
            .sort((a, b) => b.day - a.day)
            .map(t => (
              <div key={t.id} className="tx-grid tx-row">
                <span className="muted">{dayLabel(t.month, t.day)}</span>
                <span className="ellipsis" style={{ fontWeight: 500 }}>
                  {t.label}
                </span>
                <span className="tx-target">
                  <span className="dot is-9" style={{ background: tone(targetHue(t.type, t.target)).base }} />
                  <span className="ellipsis">{targetName(t.type, t.target)}</span>
                  <span className="tx-type">{TYPE_LABEL[t.type]}</span>
                </span>
                <AccountPicker data={data} accountId={t.accountId} showName disabled={locked} onPick={id => update(d => setTransactionAccount(d, t.id, id))} />
                <b className="num">{money(t.amount)}</b>
                {locked ? <span /> : (
                  <span className="icon-btn" title="Supprimer" onClick={() => update(d => deleteTransaction(d, t.id))}>
                    <Icon name="close" size={14} />
                  </span>
                )}
              </div>
            ))}
          {txs.length === 0 && <div className="empty">Aucune dépense saisie ce mois-ci.</div>}
          <div style={{ height: 8 }} />
        </div>
      </div>
    </div>
  );
}

function BalancesTab({ month }: { month: MonthKey }) {
  const { data, ledger, update } = useStore();
  // accounts() also lists lines deleted or replaced in other months: only the month's own lines are shown.
  const monthKeys = new Set(monthLines(data, month).map(l => l.key));
  const accs = accounts(data).filter(a => monthKeys.has(a.key));
  const locked = isMonthLocked(data, month);
  let nOk = 0;
  const groups = (
    [
      ['Épargnes', HUE.epa, 'epa'],
      ['Investissements', HUE.inv, 'inv'],
    ] as const
  ).map(([title, hue, block]) => ({
    title,
    hue,
    rows: accs
      .filter(a => a.block === block)
      .map(a => {
        const r = ledger.accMonth(a.key, month);
        if (!r) return null;
        const has = r.statement !== null;
        const gap = has ? round2(r.statement! - r.expected) : null;
        const ok = has && Math.abs(gap!) < 0.005;
        if (ok) nOk++;
        const series = [5, 4, 3, 2, 1].map(k => ledger.accMonth(a.key, addMonths(month, -k))?.balance).filter((v): v is number => v !== undefined);
        series.push(r.expected);
        return { a, r, has, gap, ok, series };
      })
      .filter(x => x !== null),
  }));
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <>
      <div className="soldes-intro">
        <div className="intro">Solde attendu = début de mois + versements réels − sorties. Saisis le solde relevé de chaque compte pour valider le mois.</div>
        <div className="pill is-lg" style={{ background: 'oklch(0.95 0.05 150)', color: 'oklch(0.35 0.09 150)' }}>
          {nOk} / {total} validés
        </div>
      </div>
      {groups.map(g => (
        <div key={g.title} className="panel-lg" style={toneVars(g.hue)}>
          <div className="group-head">{g.title}</div>
          <div className="acc-grid acc-cols">
            <span>Compte</span>
            <span>6 mois</span>
            <span className="num">Début</span>
            <span className="num">+ Versé</span>
            <span className="num">− Sorties</span>
            <span className="num">= Attendu</span>
            <span className="num" style={{ paddingRight: 8 }}>
              Solde relevé
            </span>
            <span className="num">Écart</span>
            <span className="num">Statut</span>
          </div>
          {g.rows.map(({ a, r, has, gap, ok, series }) => {
            const status = !has ? ['À saisir', 'rgba(32,30,29,.06)', 'rgba(32,30,29,.6)'] : ok ? ['Validé', 'oklch(0.95 0.05 150)', 'oklch(0.35 0.09 150)'] : ['À vérifier', 'oklch(0.95 0.06 85)', 'oklch(0.38 0.07 80)'];
            return (
              <div key={a.key} className="acc-grid acc-row">
                <span style={{ fontWeight: 600 }}>{a.name}</span>
                <Spark values={series} />
                <span className="num muted">{money(r.start)}</span>
                <span className="num muted">{r.paid ? money(r.paid) : '—'}</span>
                <span className="num muted">{r.out ? money(-r.out) : '—'}</span>
                <b className="num">{money(r.expected)}</b>
                <div className="rel">
                  <EditableAmount
                    id={`rel:${a.key}`}
                    value={r.statement}
                    allowEmpty
                    disabled={locked}
                    onCommit={v => update(d => setStatement(d, month, a.key, v))}
                    className="stmt-cell"
                    style={{ background: has && !ok ? 'oklch(0.96 0.04 90)' : undefined }}
                    inputClassName="cell-input is-stmt"
                  >
                    {has ? money(r.statement!) : 'Saisir…'}
                  </EditableAmount>
                </div>
                <span className="num" style={{ fontWeight: 600, color: has && !ok ? 'oklch(0.45 0.1 70)' : MUTED }}>
                  {has && !ok ? money(gap!, true) : '—'}
                </span>
                <span className="pill" style={{ justifySelf: 'end', background: status[1], color: status[2] }}>
                  {status[0]}
                </span>
              </div>
            );
          })}
          <div style={{ height: 8 }} />
        </div>
      ))}
    </>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <div />;
  const mn = Math.min(...values);
  const sp = Math.max(...values) - mn || 1;
  const pts = values.map((v, i) => [(i * 84) / (values.length - 1), 3 + 20 * (1 - (v - mn) / sp)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div>
      <svg viewBox="0 0 84 26" width="84" height="26" style={{ display: 'block', overflow: 'visible' }}>
        <path d={d} fill="none" stroke="var(--t-base)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="3" fill="#fff" stroke="var(--t-base)" strokeWidth="2" />
      </svg>
    </div>
  );
}
