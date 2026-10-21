/** Month identifier, `YYYY-MM`. */
export type MonthKey = string;

export type BlockKey = 'rev' | 'cre' | 'fix' | 'var' | 'epa' | 'inv';

/** How a box (variable line or envelope) is paid: with the bank card of an account, or in cash. Absent = `virtuel`. */
export type PayMode = 'virtuel' | 'especes';

/** What decides the account of an expense made on a box. Lines and envelopes both fit this shape. */
export interface PaymentSetting {
  /** Account assigned to the box for `virtuel` payments; absent = the main account. */
  accountId?: string;
  payMode?: PayMode;
}

/** How an outgoing line is executed (spec 0009, RG18). Absent = not specified. `informatif`: no checkbox, no late badge, left out of « Reste à sortir ». */
export type ExecMode = 'prelevement' | 'virement_auto' | 'virement_manuel' | 'retrait' | 'informatif';

/** A budget line as it exists in one month. `key` is stable across months. */
export interface Line extends PaymentSetting {
  key: string;
  block: BlockKey;
  section: string;
  name: string;
  budget: number;
  actual: number | null;
  /** `epa`/`inv` lines only: bank account that receives the line's payments (spec 0007); absent = no dedicated account. */
  linkedAccountId?: string;
  /** Planned day of the month (1 to 31), optional. Part of the model: carried into the months created later (spec 0009, RG16, RG17). */
  dueDay?: number;
  /** Execution mode, optional. Also carried by the model. */
  execMode?: ExecMode;
  // `accountId` (from PaymentSetting): bank account the line goes through; absent = the main account.
  // For a `var` line it is the account assigned to the box, and `payMode` its mode (spec 0006).
}

/** A line of the budget model. `actual` is optional: when entered in the model, it is copied into a month created from it. */
export type TemplateLine = Omit<Line, 'actual'> & { actual?: number | null };

export interface Template {
  lines: TemplateLine[];
  /** Default monthly allocation per envelope id. */
  envAlloc: Record<string, number>;
}

/** « The money has moved » for one line in one month. The actual is never touched by it (spec 0009, RG2). */
export interface LineCheck {
  /** Day the money moved, `YYYY-MM-DD`. The amount counted is never stored: see `countedAmount` (spec 0009, RG76, RG77). */
  doneOn: string;
  /** Pointage of an envelope's allocation only: the account it was sent to, written when it was checked (spec 0009, RG90). */
  accountId?: string;
}

/** Bank statement of an account for a month: the balance its bank shows, at a date. Compared with the estimate, never part of it (spec 0009, RG62). */
export interface AccountBalanceEntry {
  amount: number;
  /** Date of the entry, `YYYY-MM-DD`. */
  on: string;
}

export interface MonthData {
  initialized: boolean;
  lines: Line[];
  /** Allocation per envelope id for this month. */
  alloc: Record<string, number>;
  /** Transfer id → done. */
  transfersDone: Record<string, boolean>;
  /** The month was closed by the user (« Clôturer le mois »): read-only. Absent = open. */
  closed?: boolean;
  /** Line key → check (pointage). Absent or missing key = not checked. Never copied to another month. */
  checks?: Record<string, LineCheck>;
  /** Bank account id → statement of this month (one per account and month; spec 0009, RG62). */
  accountBalances?: Record<string, AccountBalanceEntry>;
}

export interface Envelope extends PaymentSetting {
  id: string;
  name: string;
  /** OKLCH hue used for the envelope's accent. */
  hue: number;
  /** Part of the balance held in cash (the rest is "virtuel"). */
  cash: number;
}

/** Imported month for an envelope, before the app managed it. */
export interface EnvHistory {
  alloc: number;
  spent: number;
  balance: number;
}

/**
 * - `var`: variable expense, adds to the actual of a `var` line (target = line key)
 * - `env`: spent from an envelope (target = envelope id)
 * - `epa`: withdrawal from a savings/investment account (target = line key)
 */
export type TxType = 'var' | 'env' | 'epa';

export interface Transaction {
  id: string;
  month: MonthKey;
  day: number;
  label: string;
  amount: number;
  type: TxType;
  target: string;
  /** Bank account the money comes from (`var`, `env`) or goes to (`epa`); absent = the main account. */
  accountId?: string;
}

/** A bank account (principal, Espèces, Swile…). Not to be confused with savings/investment lines. */
export interface BankAccount {
  id: string;
  name: string;
  /** OKLCH hue of the account's dot. */
  hue: number;
  /** Exactly one account is the main one. */
  isDefault: boolean;
  /** Amount on the 1st day of `openingMonth`. */
  openingBalance: number;
  openingMonth: MonthKey;
  /** False: the account's operations are left out of the monthly budget figures (still counted in its balance). */
  inBudget: boolean;
  archived: boolean;
  /** The user has entered (or dismissed) the opening balance; drives the reminder banner. */
  openingConfirmed?: boolean;
}

/** Where a transfer goes: another bank account, or a savings/investment line. Absent = informative only. */
export type TransferTarget = { kind: 'bank'; id: string } | { kind: 'saving'; key: string };

export interface Transfer {
  id: string;
  name: string;
  amount: number;
  /** Bank account the transfer leaves. */
  fromAccountId: string;
  to?: TransferTarget;
}

export interface PlannedItem {
  id: string;
  year: number;
  /** 0 = janvier … 11 = décembre */
  month: number;
  label: string;
  amount: number;
  envelopeId: string;
}

export interface YearClose {
  closed: boolean;
  /** `acc:<lineKey>`, `env:<envelopeId>` or `bank:<accountId>` → adjusted base for 1 January of the next year. */
  overrides: Record<string, number>;
}

/**
 * A traced correction of a bank account: « écart constaté » between its bank statement and the estimated balance
 * (spec 0009, RG65, RG66). Never deleted nor edited: it is cancelled (`cancelledOn`) and a cancelled one never counts again.
 */
export interface Adjustment {
  id: string;
  accountId: string;
  /** Day of the statement it corrects, `YYYY-MM-DD`; the month it belongs to is its first 7 characters. */
  date: string;
  /** Signed: positive adds money to the account, negative removes some. Never 0. */
  amount: number;
  label: string;
  /** Day it was created, `YYYY-MM-DD`. */
  createdOn: string;
  /** Day it was cancelled; absent = active. */
  cancelledOn?: string;
}

export interface Settings {
  /** Bank account receiving the envelopes that have no account of their own. Absent = the main account (spec 0009, RG98). */
  envelopeAccountId?: string;
  /** First month counted from the checks instead of the actuals (spec 0009, RG61). Absent = every month is counted from the actuals. */
  pointageStart?: MonthKey;
  emergencyAccounts: string[];
  emergencyTarget: number;
  investTarget: number;
  savingsRateTarget: number;
}

export interface BudgetData {
  version: 1;
  /**
   * First month managed in the app; earlier months only exist as imported history.
   * `null` until the « Démarrage » assistant has created the first month.
   */
  firstMonth: MonthKey | null;
  template: Template;
  months: Record<MonthKey, MonthData>;
  envelopes: Envelope[];
  /** Bank accounts: always one main account and the « Espèces » account. */
  accounts: BankAccount[];
  envHistory: Record<MonthKey, Record<string, EnvHistory>>;
  /** Statement balance entered for an account (epa/inv line key) at the end of a month. */
  statements: Record<MonthKey, Record<string, number>>;
  transactions: Transaction[];
  transfers: Transfer[];
  /** Corrections of bank accounts (spec 0009). Absent = none. */
  adjustments?: Adjustment[];
  planned: PlannedItem[];
  closes: Record<string, YearClose>;
  settings: Settings;
}
