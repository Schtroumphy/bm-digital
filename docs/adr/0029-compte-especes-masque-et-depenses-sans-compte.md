# 0029 — Le compte « Espèces » reste en base mais masqué ; une dépense en espèces n'a pas de compte

- Statut : acceptée (confirmée par le développeur)
- Date : 2026-11-03
- Spec liée : [0037-retrait-especes-comme-virement-sortant](../specs/0037-retrait-especes-comme-virement-sortant.md)

## Contexte
Avec les retraits sans destination, le compte « Espèces » ne porte plus d'argent. Le supprimer ou l'archiver casserait les anciennes données et la migration additive.

## Décision
Le compte `acc-cash` reste dans `BudgetData.accounts` comme compte réservé : masqué de Comptes, de la clôture, des listes « Payé avec », « De / Vers » et de l'import, jamais débité ni crédité. Une dépense `var` en espèces porte `payMode: 'especes'` et aucun `accountId` (`addTransaction`) : elle compte dans le réel de sa ligne et ne bouge aucun solde. `resolveBoxAccountId` renvoie, pour le mode Espèces, le compte de repli (principal) seulement pour classer la ligne dans le budget.

## Alternatives écartées
- Supprimer ou archiver le compte : perte de données, migration non additive.
- Garder un `accountId` cash : le compte resterait à masquer et à ne pas débiter, sans gain.

## Conséquences
- Les anciennes dépenses du compte Espèces sont converties au chargement ([ADR 0031](0031-conversion-des-anciennes-donnees-au-chargement.md)).
- Tout nouvel écran listant les comptes doit écarter `CASH_ACCOUNT_ID`.
