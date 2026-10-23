import type {
  AccountBalanceEntry, AccountMovement, Adjustment, ImportAccountLink, ImportNature, ImportRule, ImportTarget, BankAccount, BlockKey, BudgetData, Envelope, EnvHistory, ExecMode, Line, LineCheck,
  MonthData, PayMode, PlannedItem, TemplateLine, Transaction, Transfer, TxType, YearClose, AccountKind,
} from '../domain/types';
import { emptyRows, type ReadRows, type SelectRow, type TableRows } from './supabaseSchema';

/*
 * Conversion between the BudgetData aggregate and the rows of the relational schema (spec 0012).
 * Pure functions: `toRows` then `fromRows` gives back the same data. Two things cannot be told apart
 * in the database and come back as « absent »: an empty optional record (`checks`, `accountBalances`,
 * `adjustments`) and a model line's `actual: null`.
 */

const orNull = <T>(v: T | undefined): T | null => v ?? null;
const orUndefined = <T>(v: T | null): T | undefined => v ?? undefined;

/** The object without its `undefined` fields, so an absent optional field is really absent. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

const byPosition = <R extends { position: number }>(rows: R[]): R[] => [...rows].sort((a, b) => a.position - b.position);

export function toRows(d: BudgetData): TableRows {
  const rows = emptyRows();

  rows.settings.push({
    first_month: d.firstMonth,
    emergency_accounts: d.settings.emergencyAccounts,
    emergency_target: d.settings.emergencyTarget,
    invest_target: d.settings.investTarget,
    savings_rate_target: d.settings.savingsRateTarget,
    pointage_start: orNull(d.settings.pointageStart),
  });

  d.accounts.forEach((a, position) =>
    rows.bank_accounts.push({
      id: a.id,
      name: a.name,
      hue: a.hue,
      is_default: a.isDefault,
      opening_balance: a.openingBalance,
      opening_month: a.openingMonth,
      in_budget: a.inBudget,
      archived: a.archived,
      kind: orNull(a.kind),
      envelope_id: orNull(a.envelopeId),
      opening_confirmed: orNull(a.openingConfirmed),
      position,
    }),
  );

  d.envelopes.forEach((e, position) =>
    rows.envelopes.push({
      id: e.id,
      name: e.name,
      hue: e.hue,
      cash: e.cash,
      account_id: e.accountId,
      template_alloc: orNull(d.template.envAlloc[e.id]),
      position,
    }),
  );

  d.template.lines.forEach((l, position) =>
    rows.template_lines.push({
      key: l.key,
      block: l.block,
      section: l.section,
      name: l.name,
      budget: l.budget,
      position,
      actual: orNull(l.actual),
      account_id: orNull(l.accountId),
      pay_mode: orNull(l.payMode),
      linked_account_id: orNull(l.linkedAccountId),
      due_day: orNull(l.dueDay),
      exec_mode: orNull(l.execMode),
    }),
  );

  for (const [month, md] of Object.entries(d.months)) {
    rows.months.push({ month, initialized: md.initialized, closed: orNull(md.closed) });
    md.lines.forEach((l, position) =>
      rows.budget_lines.push({
        month,
        key: l.key,
        block: l.block,
        section: l.section,
        name: l.name,
        budget: l.budget,
        actual: l.actual,
        position,
        account_id: orNull(l.accountId),
        pay_mode: orNull(l.payMode),
        linked_account_id: orNull(l.linkedAccountId),
        due_day: orNull(l.dueDay),
        exec_mode: orNull(l.execMode),
      }),
    );
    for (const [line_key, c] of Object.entries(md.checks ?? {})) {
      rows.line_checks.push({ month, line_key, done_on: c.doneOn, account_id: orNull(c.accountId) });
    }
    for (const [account_id, b] of Object.entries(md.accountBalances ?? {})) {
      rows.account_balances.push({ month, account_id, amount: b.amount, entered_on: b.on });
    }
    for (const [envelope_id, amount] of Object.entries(md.alloc)) {
      rows.envelope_allocations.push({ month, envelope_id, amount });
    }
    for (const [transfer_id, done] of Object.entries(md.transfersDone)) {
      rows.transfers_done.push({ month, transfer_id, done });
    }
  }

  for (const [month, byEnvelope] of Object.entries(d.envHistory)) {
    for (const [envelope_id, h] of Object.entries(byEnvelope)) {
      rows.envelope_history.push({ month, envelope_id, alloc: h.alloc, spent: h.spent, balance: h.balance });
    }
  }
  for (const [month, byAccount] of Object.entries(d.statements)) {
    for (const [account_key, amount] of Object.entries(byAccount)) {
      rows.account_statements.push({ month, account_key, amount });
    }
  }

  d.transactions.forEach((t, position) =>
    rows.transactions.push({
      id: t.id,
      month: t.month,
      day: t.day,
      label: t.label,
      amount: t.amount,
      type: t.type,
      target: t.target,
      account_id: orNull(t.accountId),
      import_account_id: orNull(t.importAccountId),
      fingerprint: orNull(t.fingerprint),
      rank: orNull(t.rank),
      category: orNull(t.category),
      detail: orNull(t.detail),
      position,
    }),
  );

  (d.accountMovements ?? []).forEach((m, position) =>
    rows.account_movements.push({
      id: m.id,
      month: m.month,
      day: m.day,
      label: m.label,
      amount: m.amount,
      from_account_id: m.fromAccountId,
      to_account_id: m.toAccountId,
      import_account_id: orNull(m.importAccountId),
      fingerprint: orNull(m.fingerprint),
      rank: orNull(m.rank),
      category: orNull(m.category),
      detail: orNull(m.detail),
      position,
    }),
  );

  (d.importRules ?? []).forEach((r, position) =>
    rows.import_rules.push({
      id: r.id,
      pattern: r.pattern,
      nature: r.nature,
      target_kind: r.target.kind,
      target_id: r.target.kind === 'var' || r.target.kind === 'line' ? r.target.key : r.target.id,
      position,
    }),
  );

  (d.importAccountLinks ?? []).forEach((l, position) =>
    rows.import_account_links.push({ id: l.id, account_name: l.accountName, connection_name: l.connectionName, account_id: orNull(l.accountId), position }),
  );

  d.transfers.forEach((t, position) =>
    rows.transfers.push({
      id: t.id,
      name: t.name,
      amount: t.amount,
      position,
      from_account_id: t.fromAccountId,
      to_kind: t.to?.kind ?? null,
      to_id: t.to ? (t.to.kind === 'bank' ? t.to.id : t.to.key) : null,
    }),
  );

  (d.adjustments ?? []).forEach((a, position) =>
    rows.adjustments.push({
      id: a.id,
      account_id: a.accountId,
      date: a.date,
      amount: a.amount,
      label: a.label,
      created_on: a.createdOn,
      cancelled_on: orNull(a.cancelledOn),
      position,
    }),
  );

  d.planned.forEach((p, position) =>
    rows.planned_items.push({ id: p.id, year: p.year, month: p.month, label: p.label, amount: p.amount, envelope_id: p.envelopeId, position }),
  );

  for (const [year, c] of Object.entries(d.closes)) {
    rows.year_closes.push({ year: Number(year), closed: c.closed, overrides: c.overrides });
  }

  return rows;
}

/** Back to the aggregate. `null` when the user has no `settings` row yet: nothing has ever been saved. */
export function fromRows(rows: ReadRows): BudgetData | null {
  const s = rows.settings[0];
  if (!s) return null;

  const envAlloc: Record<string, number> = {};
  const envelopes: Envelope[] = byPosition(rows.envelopes).map(e => {
    if (e.template_alloc !== null) envAlloc[e.id] = e.template_alloc;
    return { id: e.id, name: e.name, hue: e.hue, cash: e.cash, accountId: e.account_id ?? '' };
  });

  const lineOf = (r: SelectRow<'budget_lines'>): Line =>
    compact({
      key: r.key,
      block: r.block as BlockKey,
      section: r.section,
      name: r.name,
      budget: r.budget,
      actual: r.actual,
      accountId: orUndefined(r.account_id),
      payMode: orUndefined(r.pay_mode) as PayMode | undefined,
      linkedAccountId: orUndefined(r.linked_account_id),
      dueDay: orUndefined(r.due_day),
      execMode: orUndefined(r.exec_mode) as ExecMode | undefined,
    });

  const templateLines: TemplateLine[] = byPosition(rows.template_lines).map(r =>
    compact({
      key: r.key,
      block: r.block as BlockKey,
      section: r.section,
      name: r.name,
      budget: r.budget,
      actual: orUndefined(r.actual),
      accountId: orUndefined(r.account_id),
      payMode: orUndefined(r.pay_mode) as PayMode | undefined,
      linkedAccountId: orUndefined(r.linked_account_id),
      dueDay: orUndefined(r.due_day),
      execMode: orUndefined(r.exec_mode) as ExecMode | undefined,
    }),
  );

  const months: Record<string, MonthData> = {};
  for (const m of rows.months) {
    months[m.month] = compact({
      initialized: m.initialized,
      lines: [],
      alloc: {},
      transfersDone: {},
      closed: orUndefined(m.closed),
    });
  }
  for (const r of byPosition(rows.budget_lines)) months[r.month]?.lines.push(lineOf(r));
  for (const r of rows.envelope_allocations) {
    if (months[r.month]) months[r.month].alloc[r.envelope_id] = r.amount;
  }
  for (const r of rows.transfers_done) {
    if (months[r.month]) months[r.month].transfersDone[r.transfer_id] = r.done;
  }
  for (const r of rows.line_checks) {
    const md = months[r.month];
    if (!md) continue;
    const check: LineCheck = compact({ doneOn: r.done_on, accountId: orUndefined(r.account_id) });
    (md.checks ??= {})[r.line_key] = check;
  }
  for (const r of rows.account_balances) {
    const md = months[r.month];
    if (!md) continue;
    const entry: AccountBalanceEntry = { amount: r.amount, on: r.entered_on };
    (md.accountBalances ??= {})[r.account_id] = entry;
  }

  const envHistory: Record<string, Record<string, EnvHistory>> = {};
  for (const r of rows.envelope_history) {
    (envHistory[r.month] ??= {})[r.envelope_id] = { alloc: r.alloc, spent: r.spent, balance: r.balance };
  }
  const statements: Record<string, Record<string, number>> = {};
  for (const r of rows.account_statements) (statements[r.month] ??= {})[r.account_key] = r.amount;

  const accounts: BankAccount[] = byPosition(rows.bank_accounts).map(r =>
    compact({
      id: r.id,
      name: r.name,
      hue: r.hue,
      isDefault: r.is_default,
      openingBalance: r.opening_balance,
      openingMonth: r.opening_month,
      inBudget: r.in_budget,
      archived: r.archived,
      kind: orUndefined(r.kind) as AccountKind | undefined,
      envelopeId: orUndefined(r.envelope_id),
      openingConfirmed: orUndefined(r.opening_confirmed),
    }),
  );

  const transactions: Transaction[] = byPosition(rows.transactions).map(r =>
    compact({
      id: r.id,
      month: r.month,
      day: r.day,
      label: r.label,
      amount: r.amount,
      type: r.type as TxType,
      target: r.target,
      accountId: orUndefined(r.account_id),
      importAccountId: orUndefined(r.import_account_id),
      fingerprint: orUndefined(r.fingerprint),
      rank: orUndefined(r.rank),
      category: orUndefined(r.category),
      detail: orUndefined(r.detail),
    }),
  );

  const accountMovements: AccountMovement[] = byPosition(rows.account_movements).map(r =>
    compact({
      id: r.id,
      month: r.month,
      day: r.day,
      label: r.label,
      amount: r.amount,
      fromAccountId: r.from_account_id,
      toAccountId: r.to_account_id,
      importAccountId: orUndefined(r.import_account_id),
      fingerprint: orUndefined(r.fingerprint),
      rank: orUndefined(r.rank),
      category: orUndefined(r.category),
      detail: orUndefined(r.detail),
    }),
  );

  const importRules: ImportRule[] = byPosition(rows.import_rules).map(r => {
    const target: ImportTarget = r.target_kind === 'var' ? { kind: 'var', key: r.target_id } : r.target_kind === 'line' ? { kind: 'line', key: r.target_id } : r.target_kind === 'env' ? { kind: 'env', id: r.target_id } : { kind: 'account', id: r.target_id };
    return { id: r.id, pattern: r.pattern, nature: r.nature as ImportNature, target };
  });

  const importAccountLinks: ImportAccountLink[] = byPosition(rows.import_account_links).map(r => ({
    id: r.id, accountName: r.account_name, connectionName: r.connection_name, accountId: r.account_id,
  }));

  const transfers: Transfer[] = byPosition(rows.transfers).map(r => {
    const t: Transfer = { id: r.id, name: r.name, amount: r.amount, fromAccountId: r.from_account_id };
    if (r.to_kind === 'bank' && r.to_id !== null) t.to = { kind: 'bank', id: r.to_id };
    if (r.to_kind === 'saving' && r.to_id !== null) t.to = { kind: 'saving', key: r.to_id };
    return t;
  });

  const adjustments: Adjustment[] = byPosition(rows.adjustments).map(r =>
    compact({
      id: r.id,
      accountId: r.account_id,
      date: r.date,
      amount: r.amount,
      label: r.label,
      createdOn: r.created_on,
      cancelledOn: orUndefined(r.cancelled_on),
    }),
  );

  const planned: PlannedItem[] = byPosition(rows.planned_items).map(r => ({
    id: r.id,
    year: r.year,
    month: r.month,
    label: r.label,
    amount: r.amount,
    envelopeId: r.envelope_id,
  }));

  const closes: Record<string, YearClose> = {};
  for (const r of rows.year_closes) closes[String(r.year)] = { closed: r.closed, overrides: r.overrides as Record<string, number> };

  return {
    version: 1,
    firstMonth: s.first_month,
    template: { lines: templateLines, envAlloc },
    months,
    envelopes,
    accounts,
    envHistory,
    statements,
    transactions,
    transfers,
    ...(accountMovements.length ? { accountMovements } : {}),
    ...(importRules.length ? { importRules } : {}),
    ...(importAccountLinks.length ? { importAccountLinks } : {}),
    ...(adjustments.length ? { adjustments } : {}),
    planned,
    closes,
    settings: compact({
      pointageStart: orUndefined(s.pointage_start),
      emergencyAccounts: s.emergency_accounts,
      emergencyTarget: s.emergency_target,
      investTarget: s.invest_target,
      savingsRateTarget: s.savings_rate_target,
    }),
  };
}
