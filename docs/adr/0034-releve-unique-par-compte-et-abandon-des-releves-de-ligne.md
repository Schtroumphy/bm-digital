# 0034 — Un seul stockage du relevé : `accountBalances` ; fin de la saisie par ligne `statements`

- Statut : acceptée (validée par le développeur)
- Date : 2026-11-03
- Spec liée : [0041-page-releve-et-cloture-du-mois](../specs/0041-page-releve-et-cloture-du-mois.md)

## Contexte
Deux mécanismes de relevé coexistaient : `MonthData.accountBalances` (par compte, avec écart et régularisation) et `BudgetData.statements` (par ligne `epa`/`inv`, sans écart).

## Décision
- Le relevé se saisit uniquement par compte (`accountBalances`). `setStatement` est supprimé.
- Au chargement, `migrateLineStatements` (pure, idempotente, sur le modèle de l'[ADR 0031](0031-conversion-des-anciennes-donnees-au-chargement.md)) convertit les relevés de ligne des mois gérés en relevés du compte dédié, daté de la fin de période. Sont abandonnés et comptés (bandeau unique) : ligne sans compte dédié, compte partagé par plusieurs lignes, relevé de compte déjà présent. Les `statements` des mois gérés sont ensuite vidés.
- `statements` reste en lecture pour les mois avant `firstMonth` (chaîne de départ du Ledger). Le Ledger garde un repli sur `statements` pour une ligne sans compte dédié (vide après chargement).
- Aucune migration SQL : la table `account_statements` n'est plus alimentée pour les mois gérés ; le diff supprime les lignes converties (test dans `supabaseRepository.test.ts`).

## Alternatives écartées
- Garder les deux stockages : deux vérités pour le même relevé.
- Script SQL de conversion : logique dupliquée hors du domaine, non testée.

## Conséquences
- Les relevés non convertibles sont définitivement supprimés ; une ligne d'épargne sans compte dédié perd son point de repart.
- Le chargement enregistre les données converties dès le premier chargement.
