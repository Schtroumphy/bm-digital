/** Month identifier, `YYYY-MM`. */
export type MonthKey = string;

export type BlockKey = 'rev' | 'cre' | 'fix' | 'var' | 'epa' | 'inv';

/** A budget line as it exists in one month. `key` is stable across months. */
export interface Line {
  key: string;
  block: BlockKey;
  section: string;
  name: string;
  budget: number;
  actual: number | null;
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
}

export interface Envelope {
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
export type PaymentSource = 'vir' | 'esp';

export interface Transaction {
  id: string;
  month: MonthKey;
  day: number;
  label: string;
  amount: number;
  type: TxType;
  target: string;
  source: PaymentSource;
}

export interface Transfer {
  id: string;
  name: string;
  amount: number;
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
  /** `acc:<lineKey>` or `env:<envelopeId>` → adjusted base for 1 January of the next year. */
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
  envHistory: Record<MonthKey, Record<string, EnvHistory>>;
  /** Statement balance entered for an account (epa/inv line key) at the end of a month. */
  statements: Record<MonthKey, Record<string, number>>;
  transactions: Transaction[];
  transfers: Transfer[];
  planned: PlannedItem[];
  closes: Record<string, YearClose>;
  settings: Settings;
}
