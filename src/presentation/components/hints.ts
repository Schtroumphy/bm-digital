import type { CashAdjustmentRefusal } from '../../application/cashAdjustments';
import type { OpeningCashResult } from '../../application/envelopes';
/** Tooltip of the « Dans le budget » setting of a bank account (Comptes screen and assistant). */
export const IN_BUDGET_HINT = 'Les revenus, charges, enveloppes et sorties d’épargne de ce compte ne comptent pas dans le budget. Les dépenses variables comptent dans le réel de leur ligne.';

/** What is said when a starting balance is refused (spec 0026, RG8, RG15); `negative` only concerns the cash. */
export const OPENING_MESSAGE: Record<Exclude<OpeningCashResult, 'ok'>, string> = {
  unknown: 'Enveloppe introuvable.',
  invalid: 'Montant invalide.',
  locked: 'Le mois de départ de cette enveloppe est clôturé : les soldes de départ ne sont plus modifiables.',
  negative: 'Ce départ rendrait le solde espèces négatif à une date.',
};

/** What is said when the cash balance of an envelope cannot be adjusted or an adjustment deleted (spec 0026, RG30, RG33). */
export const CASH_ADJUSTMENT_MESSAGE: Record<CashAdjustmentRefusal, string> = {
  unknown: 'Enveloppe introuvable.',
  invalid: 'Montant positif ou nul requis',
  locked: 'Mois clos ou verrouillé',
  before_opening: 'Avant le mois de départ',
  negative: 'Solde espèces négatif à une date postérieure',
};

/** Title and tooltip of the cash card of an envelope (spec 0026, RG34, D49). */
export const CASH_CARD_LABEL = 'Espèces (informatif, non tracé)';
export const CASH_CARD_HINT = 'Les dépenses en espèces ne sont pas suivies. Ce solde est informatif : ajustez-le à la main pour le remettre à jour. Il n’entre dans aucun total budgétaire.';
