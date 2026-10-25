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

