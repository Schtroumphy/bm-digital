/** Month identifier, `YYYY-MM`. */
export type MonthKey = string;

export type BlockKey = 'rev' | 'cre' | 'fix' | 'var' | 'epa' | 'inv';

/** How a variable line is paid: with the bank card of an account, or in cash. Absent = `virtuel`. */
export type PayMode = 'virtuel' | 'especes';

/** What decides the account of an expense made on a variable line (an envelope has its own account, spec 0011). */
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
  /**
   * Sum of the entries recorded on the line in the month, null when there is none (spec 0019, RG20). Never typed: it is a cache
   * recomputed by `syncLineActuals` (domain/lineActuals) after every change of an entry.
   */
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

/** A line of the budget model. It carries no actual: the actual of a line is the sum of its entries, never typed (spec 0019, RG19). */
export type TemplateLine = Omit<Line, 'actual'>;

export interface Template {
  lines: TemplateLine[];
  /** Default monthly allocation per envelope id. */
  envAlloc: Record<string, number>;
}

/** « The money has moved » for one line in one month. The actual is never touched by it (spec 0009, RG2). */
export interface LineCheck {
  /** Day the money moved, `YYYY-MM-DD`. The amount counted is never stored: see `countedAmount` (spec 0009, RG76, RG77). */
  doneOn: string;
  /**
   * Pointage of an envelope's allocation only. Written before spec 0011 (the account it was sent to, spec 0009, RG90):
   * kept for the months before the envelope's own account exists, ignored from then on (spec 0011, RG18).
   */
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

export interface Envelope {
  id: string;
  name: string;
  /** OKLCH hue used for the envelope's accent. */
  hue: number;
  /** Part of the balance held in cash (the rest is "virtuel"). Informative only. */
  cash: number;
  /** Bank account of the envelope, of kind `enveloppe`: its balance is the envelope's balance (spec 0011, RG1). */
  accountId: string;
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
 * - `fix`: expense on a fixed or credit line (target = line key, spec 0014); on the account of the line
 * - `rev`: money coming in on a revenue line (target = line key, spec 0015); an ENTRY, never to be added up as an expense
 */
export type TxType = 'var' | 'env' | 'epa' | 'fix' | 'rev';

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
  /** Imported from a bank file (spec 0013): the bank account the file belongs to, which can differ from `accountId` (envelope, box account). */
  importAccountId?: string;
  /** Imported transactions only: fingerprint of the file line (date + amount + label) and its rank among identical lines (spec 0013, RG20, RG21). */
  fingerprint?: string;
  rank?: number;
  /** Category given by the bank aggregator (Linxo), kept as information only: not part of the fingerprint (spec 0013, RG37). */
  category?: string;
  /** Free context shown under the label (spec 0020): at most 200 characters, trimmed, absent when empty. Not part of the fingerprint. */
  detail?: string;
  /** Real date at the bank, `YYYY-MM-DD` (imported entries): balances rank and date the entry by it; the budget follows `month`. Absent = `month`/`day` (spec 0015, RG1, RG2). */
  bankDate?: string;
  /** `rev` entries only: who paid (free text, facultative). Information only: not part of the fingerprint nor of any figure (spec 0016, RG3). */
  source?: string;
}

/** The trace of one line of the bank file on a transfer: its import key and its date at the bank (spec 0016, RG11). */
export interface ImportTrace {
  importAccountId: string;
  fingerprint: string;
  rank: number;
  /** `YYYY-MM-DD`. */
  bankDate: string;
}

/**
 * The budget item a transfer stands for (spec 0019, RG10, RG14): a savings/investment line or a `var` line of a dedicated account
 * (`line`, by key), or an envelope (`env`, by id). Absent = a transfer with no budget item (cash withdrawal, plain transfer).
 */
export type MovementTarget = { kind: 'line'; key: string } | { kind: 'env'; id: string };

/**
 * « Transfert » (spec 0019): money that moves from one of the user's accounts to another (withdrawal, internal transfer, savings
 * payment, envelope funding), created by the CSV import (spec 0013, RG10a) or typed in the Saisie screen. A real entry: it debits
 * the source account and credits the destination on its day, in the real balance AND in the estimated one. Not a `Transaction`.
 */
export interface AccountMovement {
  id: string;
  month: MonthKey;
  day: number;
  label: string;
  /** Positive. */
  amount: number;
  /** Account debited, or `ENVELOPES_ID` (« Enveloppes (global) »): the credit of an envelope's account whose debit was the global one (spec 0016, RG27). */
  fromAccountId: string;
  /** Account credited, or `ENVELOPES_ID`: a debit « vers enveloppes », no account credited (spec 0016, RG25). */
  toAccountId: string;
  importAccountId?: string;
  fingerprint?: string;
  rank?: number;
  category?: string;
  /** Free context shown under the label (spec 0020), same rule as `Transaction.detail`. */
  detail?: string;
  /** Real date at the bank (spec 0015, RG1); absent = `month`/`day`. */
  bankDate?: string;
  /** Budget item this transfer stands for, in `month` (spec 0019, RG10): it then replaces the item's pointed counterpart in the estimated balance. */
  target?: MovementTarget;
  /**
   * Trace of the CREDIT face of an internal transfer imported from the file (spec 0016, RG11). The flat fields above (`importAccountId`, `fingerprint`,
   * `rank`, `bankDate`) are the trace of the DEBIT face; a movement made from a credit alone has no flat trace, only this one, and its `bankDate` is
   * that of the credit. Debit trace + credit trace = « Lié »; one of them = « Une face ».
   */
  creditTrace?: ImportTrace;
}

/**
 * Which account of the app an account of the bank file belongs to (spec 0013, RG32): the pair (account name, connection name)
 * of the file, as it is written there, is matched to a bank account; `accountId: null` means « Ne pas importer ».
 */
export interface ImportAccountLink {
  id: string;
  accountName: string;
  connectionName: string;
  accountId: string | null;
}

/** Where an imported line goes: a `var` line or a fixed/credit `line` (stable key), an envelope (id) or a bank account (id; withdrawals and internal transfers). */
export type ImportTarget = { kind: 'var'; key: string } | { kind: 'line'; key: string } | { kind: 'env'; id: string } | { kind: 'account'; id: string };

/** What an imported debit is: `depense` and `externe` become a `Transaction`, `retrait` and `interne` an `AccountMovement` (spec 0013, RG9). */
export type ImportNature = 'depense' | 'retrait' | 'interne' | 'externe' | 'revenu' | 'recu';

/** Remembered rule « label contains X → nature and target » (spec 0013, RG18). `pattern` is stored normalized. */
export interface ImportRule {
  id: string;
  pattern: string;
  nature: ImportNature;
  /** Absent for a rule « Virement reçu » (`recu`): it only presets the nature (spec 0015, RG19a). */
  target?: ImportTarget;
}

/**
 * Kind of a bank account (spec 0010). It decides the group of the account in the year closing.
 * `enveloppe` (spec 0011) is the account of one envelope: created and kept up to date with it, never chosen by hand.
 */
export type AccountKind = 'courant' | 'epargne' | 'invest' | 'enveloppe';

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
  /** Kind of account; absent = not decided yet, read as `courant` (spec 0010, RG1). */
  kind?: AccountKind;
  /** Account of kind `enveloppe` only: the envelope it belongs to. Kept after the envelope is deleted, so its past allocations stay in the history (spec 0011). */
  envelopeId?: string;
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
  /** Movements between the user's accounts (spec 0013). Absent = none. */
  accountMovements?: AccountMovement[];
  /** Remembered attachment rules of the CSV import (spec 0013). Absent = none. */
  importRules?: ImportRule[];
  /** Matches between the accounts of the imported file and the accounts of the app (spec 0013). Absent = none. */
  importAccountLinks?: ImportAccountLink[];
  /** Corrections of bank accounts (spec 0009). Absent = none. */
  adjustments?: Adjustment[];
  planned: PlannedItem[];
  closes: Record<string, YearClose>;
  settings: Settings;
}
