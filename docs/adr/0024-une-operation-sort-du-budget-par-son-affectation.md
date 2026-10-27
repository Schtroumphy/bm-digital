# 0024 — Une opération sort du budget par son affectation, pas par son compte

- Statut : acceptée
- Date : 2026-10-27
- Spec liée : [0028-operations-affectees-a-un-compte-d-epargne](../specs/0028-operations-affectees-a-un-compte-d-epargne.md)

## Contexte
Jusqu'ici une opération ne sortait des chiffres du budget que si SON COMPTE était « hors budget » (`isTransactionInBudget`, specs 0002 et 0009). Sortir une opération du budget et la rattacher à un autre compte était donc la même chose, et changer son compte aurait faussé les soldes réels. Il faut pouvoir sortir de petites opérations (travaux d'octobre) du budget, les relire sur un compte d'épargne, sans toucher aux soldes.

## Décision
Une `Transaction` de type `var`, `fix` ou `rev` porte un champ facultatif `assignedAccountId` (compte d'épargne actif, différent de son compte propre). Cette affectation est indépendante du compte :
- `isTransactionInBudget` renvoie faux pour une opération affectée ; `lineEntryAmounts` (réel dérivé des écritures, ADR 0019) l'ignore ;
- les soldes réels ne changent pas (`realMovements` lit toujours l'opération sur son compte propre, aucun mouvement n'est créé sur le compte d'affectation) ;
- le solde estimé reste identique : `estimatedMovements` lit à sa date une opération `fix`/`rev` affectée dont la ligne est pointée, puisqu'elle ne fait plus partie du montant compté de la ligne (si toutes les écritures de la ligne pointée sont affectées, la ligne ne compte aucun montant, pas même son budget, pour éviter un double compte) ;
- le panneau du compte d'affectation la liste à part (`domain/assignedOperations.ts`), sans jamais la sommer dans un solde ou un flux.
Persistance : colonne facultative `transactions.assigned_account_id` (migration additive `20261027120000_assigned_account.sql`).

## Alternatives écartées
- Changer le compte de l'opération vers le compte d'épargne : fausse les soldes réels et la déduplication d'import.
- Créer des mouvements fictifs ou un virement : invente de l'argent qui n'a pas bougé.
- Fractionner une opération sur plusieurs comptes : hors besoin, plus complexe.

## Conséquences
- Une colonne de plus, à appliquer en base avant d'utiliser l'application avec cette version (les sauvegardes écrivent la colonne).
- Le réel d'une ligne n'est plus la somme de toutes ses écritures, mais de celles qui ne sont pas affectées (amende les specs 0002 RG17/RG18, 0009 RG92/RG110, 0019 RG19/RG20).
- Un compte d'affectation archivé garde ses opérations affectées.
