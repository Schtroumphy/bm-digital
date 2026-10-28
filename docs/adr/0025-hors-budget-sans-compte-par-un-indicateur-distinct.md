# 0025 — « Hors budget » sans compte : un indicateur distinct de l'affectation

- Statut : acceptée
- Date : 2026-10-27
- Spec liée : [0031-operation-hors-budget](../specs/0031-operation-hors-budget.md)

## Contexte
L'ADR 0024 fait sortir une opération du budget par son affectation à un compte d'épargne. Pour une cagnotte reçue puis reversée, aucun compte d'épargne n'a de sens : il faut sortir l'opération du budget sans compte.

## Décision
`Transaction.offBudget?: true` (colonne facultative `transactions.off_budget`, migration additive `20261027150000_off_budget.sql`). Le prédicat `isTransactionOffBudget` (`domain/bank.ts`) vaut vrai pour une opération affectée OU marquée ; `isTransactionInBudget`, `lineEntryAmounts` et `estimatedMovements` l'utilisent, de sorte que les deux mécanismes ont exactement les mêmes effets sur les chiffres et les soldes. Les deux états sont exclusifs (`addTransaction` refuse les deux ensemble ; `updateTransaction` retire le marquage quand un compte est choisi). Une seule phrase au tableau de bord cumule les deux (`AssignedSummary.offBudget` pour le détail). L'interface expose un sélecteur unique « Compté au budget / Hors budget / Affecter à… ».

## Alternatives écartées
- Valeur spéciale dans `assignedAccountId` : mélange un identifiant de compte et un état, et fausserait `assignedOperations` et la colonne existante.
- Compte « hors budget » : sort tout un compte, inadapté à quelques écritures.

## Conséquences
- Une colonne de plus en base (migration appliquée) : les sauvegardes l'écrivent.
- L'ADR 0024 n'est pas modifiée : le marquage s'ajoute à l'affectation sans la remplacer.
