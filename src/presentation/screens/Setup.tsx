import type { CSSProperties } from 'react';
import { Icon, type IconName } from '../components/Icon';
import { BAD, GOOD, HUE, tone, toneVars } from '../components/tone';
import { createFirstMonth, isSetupMonthAllowed, setupMonths, willReplaceMonth } from '../../application/actions';
import {
  addRow,
  addSuggested,
  canRemoveRow,
  cashExceedsBalance,
  emptyDraft,
  exampleDraft,
  hasCashOverflow,
  removeRow,
  setMainRow,
  setupSummary,
  updateRow,
  type SetupDraft,
  type SetupKind,
  type SetupListId,
  type SetupRow,
} from '../../application/setup';
import { IN_BUDGET_HINT } from '../components/hints';
import { BANK_HUES, CASH_ACCOUNT_ID, kindForBlock, MAIN_ACCOUNT_ID } from '../../domain/bank';
import type { AccountKind } from '../../domain/types';
import { money, monthLabel, monthName, parseAmount, parseMonth, rawNumber, round2, sanitizeAmountInput } from '../../domain/format';
import { newId, useStore } from '../state/store';

type SetDraft = (fn: (d: SetupDraft) => SetupDraft) => void;
type Field = 'amount' | 'balance' | 'cash';

interface Column {
  label: string;
  /**
   * `name`: free text, `kind`: choice between chips, `account`: bank account of the line, `linked`: dedicated account of a savings line,
   * `color`, `main`, `inBudget` and `accountKind` (Courant, Épargne, Investissement): the accounts list, otherwise a money field.
   */
  field: 'name' | 'kind' | 'account' | 'linked' | 'color' | 'main' | 'inBudget' | 'accountKind' | Field;
  options?: { value: SetupKind; label: string }[];
}

interface ListConfig {
  label: string;
  hue: number;
  icon: IconName;
  help: string;
  emptyTitle: string;
  emptyText: string;
  add: string;
  cols: Column[];
  /** Field summed in the step's subtitle. */
  main: Field;
}

const NAME: Column = { label: 'Nom', field: 'name' };
const ACCOUNT: Column = { label: 'Compte', field: 'account' };
const LINKED: Column = { label: 'Compte dédié', field: 'linked' };

const LISTS: Record<SetupListId, ListConfig> = {
  acc: {
    label: 'Comptes', hue: 200, icon: 'card', help: 'Tes comptes bancaires avec leur solde au premier jour. Choisis le compte principal, et sors du budget ceux qui n’y comptent pas (Swile).',
    emptyTitle: 'Aucun compte', emptyText: 'Le compte principal et Espèces existent toujours.',
    add: 'Ajouter un compte',
    cols: [
      NAME,
      { label: 'Type', field: 'accountKind' },
      { label: 'Couleur', field: 'color' },
      { label: 'Solde au départ', field: 'balance' },
      { label: 'Principal', field: 'main' },
      { label: 'Dans le budget', field: 'inBudget' },
    ],
    main: 'balance',
  },
  rev: {
    label: 'Revenus', hue: 150, icon: 'arrowDown', help: 'Les entrées d’argent attendues chaque mois.',
    emptyTitle: 'Aucun revenu pour le moment', emptyText: 'Ajoute ton salaire et les autres entrées récurrentes. Les montants se modifient chaque mois ensuite.',
    add: 'Ajouter un revenu', cols: [NAME, ACCOUNT, { label: 'Montant mensuel', field: 'amount' }], main: 'amount',
  },
  cre: {
    label: 'Crédits et dettes', hue: 38, icon: 'card', help: 'Les mensualités en cours.',
    emptyTitle: 'Aucun crédit ni dette', emptyText: 'Ajoute chaque mensualité (crédits, assurances de prêt ou d’habitation). Passe cette étape si tu n’en as pas.',
    add: 'Ajouter un crédit', cols: [NAME, ACCOUNT, { label: 'Mensualité', field: 'amount' }], main: 'amount',
  },
  dep: {
    label: 'Dépenses', hue: 38, icon: 'list', help: 'Budget mensuel de chaque dépense, fixe ou variable.',
    emptyTitle: 'Aucune dépense', emptyText: 'Les dépenses fixes sont identiques chaque mois. Les variables ont une enveloppe de budget dont on suit le restant.',
    add: 'Ajouter une dépense',
    cols: [NAME, { label: 'Type', field: 'kind', options: [{ value: 'fix', label: 'Fixe' }, { value: 'var', label: 'Variable' }] }, ACCOUNT, { label: 'Budget mensuel', field: 'amount' }],
    main: 'amount',
  },
  epa: {
    label: 'Épargnes', hue: 300, icon: 'bank', help: 'Comptes d’épargne avec leur solde au premier jour et le versement mensuel prévu.',
    emptyTitle: 'Aucun compte d’épargne', emptyText: 'Long terme (LT) pour le fond de secours et les travaux, moyen terme (MT) pour les projets et vacances.',
    add: 'Ajouter un compte',
    cols: [NAME, { label: 'Horizon', field: 'kind', options: [{ value: 'LT', label: 'LT' }, { value: 'MT', label: 'MT' }] }, { label: 'Solde au départ', field: 'balance' }, LINKED, { label: 'Versement mensuel', field: 'amount' }],
    main: 'balance',
  },
  env: {
    label: 'Enveloppes', hue: 280, icon: 'mail', help: 'Enveloppes semi virtuelles : une part en espèces, le reste sur le compte.',
    emptyTitle: 'Aucune enveloppe', emptyText: 'Chaque enveloppe démarre avec un solde, dont une part en espèces, et reçoit une allocation chaque mois.',
    add: 'Ajouter une enveloppe',
    cols: [NAME, { label: 'Solde au départ', field: 'balance' }, { label: 'dont espèces', field: 'cash' }, { label: 'Alloué par mois', field: 'amount' }],
    main: 'balance',
  },
  inv: {
    label: 'Investissements', hue: 250, icon: 'trend', help: 'Valeur de chaque placement au premier jour et versement mensuel.',
    emptyTitle: 'Aucun investissement', emptyText: 'Ajoute tes placements pour suivre leur évolution chaque mois.',
    add: 'Ajouter un placement', cols: [NAME, { label: 'Solde au départ', field: 'balance' }, LINKED, { label: 'Versement mensuel', field: 'amount' }], main: 'balance',
  },
};

/** The nine steps, in order. */
const STEPS: { id: 'start' | SetupListId | 'fin'; label: string; hue: number }[] = [
  { id: 'start', label: 'Période', hue: 90 },
  ...(['acc', 'rev', 'cre', 'dep', 'epa', 'env', 'inv'] as SetupListId[]).map(id => ({ id, label: LISTS[id].label, hue: LISTS[id].hue })),
  { id: 'fin', label: 'Récapitulatif', hue: 90 },
];
const LAST = STEPS.length - 1;

const INTRO = [
  { title: 'Lignes du budget', text: 'Revenus, crédits, dépenses fixes et variables avec leurs montants mensuels.', hue: HUE.rev },
  { title: 'Soldes de départ', text: 'Comptes, épargnes, enveloppes et investissements tels qu’ils sont au premier jour.', hue: HUE.epa },
  { title: 'Reste à placer', text: 'Calculé à la fin, avant de créer le budget du premier mois.', hue: 90 },
];

/** Kinds offered when an account is created (spec 0010, RG3, RG23). */
const ACCOUNT_KINDS: { value: AccountKind; label: string }[] = [
  { value: 'courant', label: 'Courant' },
  { value: 'epargne', label: 'Épargne' },
  { value: 'invest', label: 'Investissement' },
];

const COL_WIDTH: Partial<Record<Column['field'], string>> = { name: 'minmax(0, 1fr)', kind: '130px', account: '170px', linked: '170px', color: '150px', main: '90px', inBudget: '130px', accountKind: '280px' };

const sumField = (rows: SetupRow[], f: Field) => round2(rows.reduce((s, r) => s + r[f], 0));

/** Header buttons of the screen: reset and example. */
export function SetupActions({ setDraft }: { setDraft: SetDraft }) {
  const reset = () => {
    if (window.confirm('Tout vider ? Les lignes saisies dans l’assistant seront effacées.')) setDraft(d => emptyDraft(d.month));
  };
  return (
    <>
      <div className="btn-quiet" onClick={reset}>Tout vider</div>
      <div className="btn-outline" onClick={() => setDraft(d => exampleDraft(d.month, newId))}>Remplir avec un exemple</div>
    </>
  );
}

/** Money field: typed with a French comma, saved when leaving the field. */
function MoneyInput({ value, onCommit, invalid }: { value: number; onCommit: (v: number) => void; invalid?: boolean }) {
  return (
    <div className="su-money">
      <input
        className={invalid ? 'is-invalid' : undefined}
        defaultValue={value ? rawNumber(value) : ''}
        key={value}
        placeholder="0"
        inputMode="decimal"
        onChange={e => (e.target.value = sanitizeAmountInput(e.target.value))}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={e => {
          const v = Math.max(0, parseAmount(e.target.value) ?? 0);
          e.target.value = v ? rawNumber(v) : '';
          onCommit(v);
        }}
      />
      <span>€</span>
    </div>
  );
}

export function SetupScreen({ draft, setDraft, onOpenBudget }: { draft: SetupDraft; setDraft: SetDraft; onOpenBudget: () => void }) {
  const { data, update } = useStore();
  // « Budget créé » is read from the data, so it also holds after a reload.
  const created = !!data.months[draft.month]?.initialized;
  const step = STEPS[draft.step];
  const summary = setupSummary(draft);
  const allowed = isSetupMonthAllowed(data, draft.month);
  const goTo = (i: number) => setDraft(d => ({ ...d, step: Math.max(0, Math.min(LAST, i)) }));

  const create = () => {
    if (!allowed) return;
    if (willReplaceMonth(data, draft.month) && !window.confirm(`Remplacer les lignes de ${monthLabel(draft.month)} ? Les montants réels saisis seront effacés.`)) return;
    update(d => {
      createFirstMonth(d, draft);
    });
  };

  const subtitle = (i: number): string => {
    const s = STEPS[i];
    if (s.id === 'start') return monthLabel(draft.month);
    if (s.id === 'fin') return created ? 'Budget créé' : 'À valider';
    const rows = draft.rows[s.id];
    if (!rows.length) return 'Vide';
    return `${rows.length} ${rows.length > 1 ? 'lignes' : 'ligne'} · ${money(sumField(rows, LISTS[s.id].main))}`;
  };
  const isDone = (i: number) => {
    const s = STEPS[i];
    if (s.id === 'start') return draft.step > 0;
    if (s.id === 'fin') return created;
    // The accounts list is never empty: it counts as done once the user moved past it.
    if (s.id === 'acc') return draft.step > i;
    return draft.rows[s.id].length > 0;
  };

  const warn =
    step.id === 'env' && hasCashOverflow(draft)
      ? 'La part en espèces dépasse le solde sur une enveloppe.'
      : step.id === 'fin' && !allowed
        ? 'Ce mois n’est plus autorisé : choisis-en un autre à l’étape Période.'
        : step.id === 'fin' && summary.emptyLists.length
          ? `Étapes vides : ${summary.emptyLists.map(id => LISTS[id].label).join(', ')}.`
          : '';

  return (
    <div className="su-layout">
      <div className="panel-lg su-steps">
        <div className="su-steps-title">Mise en route</div>
        {STEPS.map((s, i) => (
          <div key={s.id} className={`su-step${i === draft.step ? ' is-current' : ''}`} style={toneVars(s.hue)} onClick={() => goTo(i)}>
            <div className={`su-dot${isDone(i) ? ' is-done' : ''}`}>{isDone(i) ? <Icon name="check" size={13} stroke={3.2} /> : i + 1}</div>
            <div className="su-step-text">
              <div className="su-step-label">{s.label}</div>
              <div className={`su-step-sub${subtitle(i) === 'Vide' ? ' is-empty' : ''}`}>{subtitle(i)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="su-main">
        {step.id === 'start' && <StartStep draft={draft} setDraft={setDraft} />}
        {step.id !== 'start' && step.id !== 'fin' && <ListStep list={step.id} draft={draft} setDraft={setDraft} />}
        {step.id === 'fin' && <RecapStep draft={draft} created={created} onOpenBudget={onOpenBudget} />}

        <div className="su-nav">
          <div className={`btn-outline is-block su-prev${draft.step === 0 ? ' is-disabled' : ''}`} onClick={() => draft.step > 0 && goTo(draft.step - 1)}>
            Précédent
          </div>
          <div className="su-warn">{warn}</div>
          {step.id === 'fin' ? (
            <div className={`btn-dark is-block${allowed ? '' : ' is-disabled'}`} onClick={create}>
              Créer le budget de {monthLabel(draft.month)}
            </div>
          ) : (
            <div className="btn-dark is-block" onClick={() => goTo(draft.step + 1)}>Continuer</div>
          )}
        </div>
      </div>
    </div>
  );
}

function StartStep({ draft, setDraft }: { draft: SetupDraft; setDraft: SetDraft }) {
  const { data } = useStore();
  const months = setupMonths(data);
  return (
    <div className="panel-lg">
      {data.firstMonth === null && (
        <div className="su-welcome">
          <div className="su-welcome-title">Bienvenue. Configurons ton budget.</div>
          <div>Aucune donnée pour le moment. Les étapes suivantes créent tes lignes et tes soldes de départ.</div>
        </div>
      )}
      <div className="su-body">
        <div>
          <div className="su-h">Premier mois du budget</div>
          <div className="muted">
            {data.firstMonth === null
              ? 'Les soldes que tu saisis sont ceux du 1er jour de ce mois.'
              : `Ton budget commence en ${monthLabel(data.firstMonth)} : tu peux initialiser ce mois ou un mois à venir.`}
          </div>
        </div>
        <div className="su-chips">
          {months.map(m => (
            <div key={m} className={`su-chip${m === draft.month ? ' is-on' : ''}`} onClick={() => setDraft(d => ({ ...d, month: m }))}>
              {monthLabel(m)}
            </div>
          ))}
        </div>
        <div className="su-intro">
          {INTRO.map(it => (
            <div key={it.title} className="su-intro-card" style={toneVars(it.hue)}>
              <div className="su-intro-title">{it.title}</div>
              <div className="muted">{it.text}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ListStep({ list, draft, setDraft }: { list: SetupListId; draft: SetupDraft; setDraft: SetDraft }) {
  const cfg = LISTS[list];
  const rows = draft.rows[list];
  const grid: CSSProperties = {
    gridTemplateColumns: `${cfg.cols.map(c => COL_WIDTH[c.field] ?? '150px').join(' ')} 30px`,
  };
  const textCols = ['name', 'kind', 'account', 'linked', 'color', 'main', 'inBudget', 'accountKind'];
  const moneyCols = cfg.cols.filter(c => !textCols.includes(c.field));
  const set = (id: string, patch: Partial<Omit<SetupRow, 'id'>>) => setDraft(d => updateRow(d, list, id, patch));
  const mainRowId = draft.rows.acc.find(a => a.isDefault)?.id ?? MAIN_ACCOUNT_ID;

  return (
    <div className="panel-lg" style={toneVars(cfg.hue)}>
      <div className="su-head">
        <div className="su-head-icon"><Icon name={cfg.icon} size={17} /></div>
        <div style={{ flex: 1 }}>
          <div className="su-head-title">{cfg.label}</div>
          <div className="muted">{cfg.help}</div>
        </div>
      </div>

      {rows.length > 0 && (
        <>
          <div className="su-row su-cols" style={grid}>
            {cfg.cols.map(c => <span key={c.label} className={textCols.includes(c.field) ? undefined : 'is-right'}>{c.label}</span>)}
            <span />
          </div>
          {rows.map(r => (
            <div key={r.id} className="su-row su-line" style={grid}>
              {cfg.cols.map(c => {
                if (c.field === 'name') return <input key={c.label} className="su-name" value={r.name} placeholder="Nom de la ligne" onChange={e => set(r.id, { name: e.target.value })} />;
                if (c.field === 'kind')
                  return (
                    <div key={c.label} className="su-kinds">
                      {c.options!.map(o => (
                        <div key={o.value} className={`su-kind${r.kind === o.value ? ' is-on' : ''}`} onClick={() => set(r.id, { kind: o.value })}>{o.label}</div>
                      ))}
                    </div>
                  );
                if (c.field === 'account')
                  return (
                    <select key={c.label} className="su-select" value={r.accountId ?? mainRowId} onChange={e => set(r.id, { accountId: e.target.value })}>
                      {draft.rows.acc.map(a => <option key={a.id} value={a.id}>{a.name.trim() || 'Sans nom'}</option>)}
                    </select>
                  );
                if (c.field === 'linked')
                  // Savings are paid from the main account, which therefore cannot be their dedicated one (spec 0007, RG2).
                  return (
                    <select key={c.label} className="su-select" value={r.linkedAccountId ?? ''} onChange={e => set(r.id, { linkedAccountId: e.target.value || undefined })}>
                      <option value="">Nouveau compte</option>
                      {draft.rows.acc.filter(a => a.id !== mainRowId && (a.accountKind ?? 'courant') === kindForBlock(list)).map(a => <option key={a.id} value={a.id}>{a.name.trim() || 'Sans nom'}</option>)}
                    </select>
                  );
                if (c.field === 'accountKind')
                  // The main account and « Espèces » are always « Courant » (spec 0010, RG2); « Enveloppe » is not offered (RG3).
                  return (
                    <div key={c.label} className="su-kinds">
                      {ACCOUNT_KINDS.map(o => {
                        const fixed = r.isDefault || r.id === CASH_ACCOUNT_ID;
                        const on = fixed ? o.value === 'courant' : (r.accountKind ?? 'courant') === o.value;
                        return (
                          <div key={o.value} className={`su-kind${on ? ' is-on' : ''}`} style={fixed ? { cursor: 'default', opacity: on ? 1 : 0.4 } : undefined} onClick={fixed ? undefined : () => set(r.id, { accountKind: o.value })}>{o.label}</div>
                        );
                      })}
                    </div>
                  );
                if (c.field === 'color')
                  return (
                    <div key={c.label} className="su-palette">
                      {BANK_HUES.map(h => (
                        <span key={h} className={`palette-dot${r.hue === h ? ' is-on' : ''}`} style={{ background: tone(h).base }} onClick={() => set(r.id, { hue: h })} />
                      ))}
                    </div>
                  );
                if (c.field === 'main') return <div key={c.label} className={`accounts-radio${r.isDefault ? ' is-on' : ''}`} title="Compte principal" onClick={() => setDraft(d => setMainRow(d, r.id))} />;
                if (c.field === 'inBudget')
                  return (
                    <div key={c.label} className="su-kinds" title={IN_BUDGET_HINT}>
                      {([[true, 'Oui'], [false, 'Non']] as const).map(([v, label]) => (
                        <div key={label} className={`su-kind${(r.inBudget ?? true) === v ? ' is-on' : ''}`} onClick={() => set(r.id, { inBudget: v })}>{label}</div>
                      ))}
                    </div>
                  );
                return <MoneyInput key={c.label} value={r[c.field]} invalid={c.field === 'cash' && cashExceedsBalance(r)} onCommit={v => set(r.id, { [c.field]: v })} />;
              })}
              {canRemoveRow(draft, list, r.id) ? (
                <span className="icon-btn" title="Supprimer" onClick={() => setDraft(d => removeRow(d, list, r.id))}><Icon name="close" size={14} /></span>
              ) : (
                <span />
              )}
            </div>
          ))}
          <div className="su-row su-total" style={grid}>
            <div className="su-add" onClick={() => setDraft(d => addRow(d, list, newId))}>
              <span className="su-add-icon"><Icon name="plus" size={12} stroke={3.2} /></span>
              {cfg.add}
            </div>
            {cfg.cols.slice(1).map(c => (
              <span key={c.label} className="is-right">{moneyCols.includes(c) ? `Total ${money(sumField(rows, c.field as Field))}` : ''}</span>
            ))}
            <span />
          </div>
        </>
      )}

      {rows.length === 0 && (
        <div className="su-empty">
          <div className="su-empty-icon"><Icon name={cfg.icon} size={20} /></div>
          <div className="su-empty-title">{cfg.emptyTitle}</div>
          <div className="muted su-empty-text">{cfg.emptyText}</div>
          <div className="su-empty-actions">
            <div className="btn-dark" onClick={() => setDraft(d => addSuggested(d, list, newId))}>Ajouter les lignes suggérées</div>
            <div className="btn-outline" onClick={() => setDraft(d => addRow(d, list, newId))}>Ligne vide</div>
          </div>
        </div>
      )}
    </div>
  );
}

function RecapStep({ draft, created, onOpenBudget }: { draft: SetupDraft; created: boolean; onOpenBudget: () => void }) {
  const s = setupSummary(draft);
  const first = monthName(parseMonth(draft.month).month).toLowerCase();
  interface RecapItem {
    label: string;
    value: string;
    total?: boolean;
    color?: string;
  }
  const groups: { title: string; hue: number; items: RecapItem[] }[] = [
    {
      title: 'Chaque mois',
      hue: 150,
      items: [
        { label: 'Revenus', value: money(s.income) },
        { label: 'Crédits et dettes', value: money(-s.credits) },
        { label: 'Dépenses fixes et variables', value: money(-s.expenses) },
        { label: 'Épargnes et investissements', value: money(-s.saved) },
        { label: 'Enveloppes allouées', value: money(-s.allocated) },
        { label: 'Reste à placer', value: money(s.remaining), total: true, color: s.remaining < 0 ? BAD : GOOD },
      ],
    },
    {
      title: `Soldes au 1er ${first}`,
      hue: 300,
      items: [
        { label: `Comptes bancaires (${draft.rows.acc.length})`, value: money(s.bankBalance) },
        { label: `Épargnes (${draft.rows.epa.length})`, value: money(s.savingsBalance) },
        { label: `Enveloppes (${draft.rows.env.length})`, value: money(s.envelopesBalance) },
        { label: `Investissements (${draft.rows.inv.length})`, value: money(s.investBalance) },
        { label: 'Total de départ', value: money(s.totalBalance), total: true },
      ],
    },
  ];
  return (
    <>
      <div className="su-fin">
        {groups.map(g => (
          <div key={g.title} className="panel-lg" style={toneVars(g.hue)}>
            <div className="su-fin-title">{g.title}</div>
            <div className="su-fin-items">
              {g.items.map(it => (
                <div key={it.label} className={`su-fin-item${it.total ? ' is-total' : ''}`}>
                  <span>{it.label}</span>
                  <span style={it.color ? { color: it.color } : undefined}>{it.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {created && (
        <div className="su-success">
          <Icon name="check" size={17} stroke={3} />
          <span style={{ flex: 1 }}>Budget créé. Les lignes et les soldes de départ sont enregistrés.</span>
          <span className="su-link" onClick={onOpenBudget}>Ouvrir le budget mensuel</span>
        </div>
      )}
    </>
  );
}
