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
  // `accountId` (from PaymentSetting): bank account the line goes through; absent = the main account.
  // For a `var` line it is the account assigned to the box, and `payMode` its mode (spec 0006).
}

export type TemplateLine = Omit<Line, 'actual'>;

export interface Template {
  lines: TemplateLine[];
  /** Default monthly allocation per envelope id. */
  envAlloc: Record<string, number>;
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

export interface Settings {
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
  planned: PlannedItem[];
  closes: Record<string, YearClose>;
  settings: Settings;
}
