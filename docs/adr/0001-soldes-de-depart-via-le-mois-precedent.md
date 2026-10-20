# 0001 — Soldes de départ stockés comme soldes de fin du mois précédent

- Statut : acceptée
- Date : 2026-10-20
- Spec liée : [0001-initialisation-budget](../specs/0001-initialisation-budget.md)

## Contexte
L'assistant « Démarrage » demande les soldes des comptes d'épargne, des investissements et des enveloppes au 1er jour du premier mois. `BudgetData` n'a pas de champ « solde de départ ». Le `Ledger` lit déjà, pour les mois antérieurs à `firstMonth`, `statements` (comptes) et `envHistory` (enveloppes) comme soldes d'ouverture. La spec exclut tout historique antérieur au premier mois.

## Décision
Les soldes du 1er jour du mois M sont écrits comme soldes de fin du mois M−1 :
- `statements[M−1][clé de la ligne] = solde` pour les épargnes et investissements ;
- `envHistory[M−1][id] = { alloc: 0, spent: 0, balance: solde }` pour les enveloppes.

Le solde de fin de M−1 est égal au solde du 1er jour de M, donc les chiffres sont exacts. Aucun champ ni changement de schéma Supabase : les tables `account_statements` et `envelope_history` existent déjà.

Pour un mois futur (postérieur à `firstMonth`), `statements` fonctionne déjà comme un relevé qui remplace le solde calculé. Le `Ledger` applique maintenant la même règle à `envHistory` d'un mois postérieur à `firstMonth` (le solde saisi remplace le solde calculé).

## Alternatives écartées
- Champ dédié `openingBalances` dans `BudgetData` : modèle plus lisible, mais nouveau champ, migration Supabase, adaptation du `Ledger`. Disproportionné pour ce besoin.

## Conséquences
- Le mois M−1 contient une entrée qui n'est pas un vrai historique importé. Un commentaire dans `createFirstMonth` le dit.
- Recréer un mois remplace entièrement `statements[M−1]` et `envHistory[M−1]`.
- Si un vrai historique devient nécessaire pour M−1, cette décision devra être revue.
