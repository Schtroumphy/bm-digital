# 0030 — La part en espèces d'une enveloppe est stockée dans sa ligne d'allocation du mois

- Statut : acceptée (confirmée par le développeur)
- Date : 2026-11-03
- Spec liée : [0037-retrait-especes-comme-virement-sortant](../specs/0037-retrait-especes-comme-virement-sortant.md)

## Contexte
Chaque mois, une enveloppe peut garder une part de son allocation en espèces (informative, ≤ allocation). Il faut la stocker par mois et par enveloppe.

## Décision
`MonthData.cashPart?: Record<idEnveloppe, montant>` côté domaine ; côté Supabase, colonne nullable `envelope_allocations.cash_part` (migration additive `20261103120000_cash_part.sql`). Le solde virtuel et le virement d'allocation baissent de la part ; le solde espèces cumule ouverture + parts − dépenses en espèces (`envelopeCash`, `cashHistory`). Une part sans allocation garde une ligne d'allocation à 0.

## Alternatives écartées
- Table dédiée `envelope_cash_parts` : une table de plus pour une donnée qui a la même clé que l'allocation.

## Conséquences
- Aucune colonne supprimée. Tant que la migration n'est pas appliquée, la sauvegarde d'une part échoue.
- Baisser l'allocation sous la part est refusé (`setEnvelopeAllocation`).
