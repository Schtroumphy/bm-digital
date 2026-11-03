# 0028 — Un retrait d'espèces est un transfert vers la valeur réservée « especes », sans compte crédité

- Statut : acceptée (confirmée par le développeur)
- Date : 2026-11-03
- Spec liée : [0037-retrait-especes-comme-virement-sortant](../specs/0037-retrait-especes-comme-virement-sortant.md)

## Contexte
L'argent liquide passait par un compte « Espèces » alimenté par des transferts (spec 0026, [ADR 0022](0022-solde-especes-d-enveloppe-derive.md)). Le développeur ne veut qu'un retrait par mois, qui débite le compte principal sans créditer aucun compte.

## Décision
Un retrait est un `AccountMovement` dont `toAccountId` vaut `CASH_ID = 'especes'` (`domain/internalTransfers.ts`), comme `ENVELOPES_ID` ([ADR 0021](0021-enveloppes-global-valeur-reservee-et-remplacement-des-allocations.md)). Il débite sa source (tout compte actif hors compte d'enveloppe) dans le solde réel et estimé, ne crédite personne, n'a pas de cible et n'entre dans aucun total du budget. La saisie (`addTransfer`) et l'import (nature « Retrait », destination fixe) l'écrivent. Le suivi « à retirer / retiré » est dérivé (`domain/cash.ts`).

Cette ADR remplace en partie l'ADR 0022 : le solde espèces d'une enveloppe n'est plus alimenté par un transfert `Espèces → enveloppe` (voir [ADR 0030](0030-part-en-especes-dans-la-ligne-d-allocation.md)).

## Alternatives écartées
- Nouvelle colonne ou table `withdrawals` : un modèle de plus pour un mouvement qui existe déjà.
- Garder le compte « Espèces » crédité : c'est la complexité qu'on retire.

## Conséquences
- Aucun changement de schéma pour les retraits (`account_movements.to_account_id` est du texte).
- Il faut penser à la valeur réservée partout où l'on lit `toAccountId` (noms, soldes, import).
