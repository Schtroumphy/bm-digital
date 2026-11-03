# 0035 — Entrée d'argent sur une enveloppe : un type d'écriture `envin`

- Statut : acceptée (choix laissé à l'implémenteur par la spec 0036, à confirmer par le développeur)
- Date : 2026-11-04
- Spec liée : [0036-saisir-une-entree-d-argent-pour-une-enveloppe](../specs/0036-saisir-une-entree-d-argent-pour-une-enveloppe.md)

## Contexte
Un remboursement ou une vente doit revenir sur une enveloppe : son dépensé baisse, son solde monte, et ce n'est jamais un revenu. Le modèle n'avait que des dépenses d'enveloppe (`env`) et des entrées sur ligne de revenu (`rev`, lues partout comme des revenus).

## Décision
Nouveau type de `Transaction` : `'envin'` (cible = id de l'enveloppe, compte = celui de l'enveloppe, `source` facultative). Aucune colonne ajoutée : la migration `20261103215845_envelope_entries.sql` élargit seulement la contrainte `transactions_type_check` (écrite, non appliquée).
- `addTransaction` délègue à `addEnvelopeInflow` (actions.ts) : refus mois verrouillé ou non initialisé, enveloppe sans compte actif (`envelopeEntryAccount`, bank.ts), montant ≤ 0, jour hors 1..31, affectation ou hors budget.
- Le dépensé d'une enveloppe est net : `Ledger` (`EnvMonth.spent`, `balance`) et `monthSummary.envelopeSpent` retranchent les `envin`, sans plancher.
- Les mouvements réels et estimés (`bankMovements.ts`) créditent le compte de l'enveloppe à la date bancaire (`isMoneyIn`).
- Import : nature `envin` dans `LineNature` (aperçu seulement, pas dans `ImportNature` : jamais mémorisée en règle).

## Alternatives écartées
- Réutiliser `rev` avec une cible enveloppe : tous les calculs de revenus (`blockTotals`, pointage, `lineExpenses`) lisent `rev` comme un revenu ; il aurait fallu les protéger un à un.
- Une dépense `env` de montant négatif : brouille les contrôles de montant > 0 et l'affichage « dépense ».
- Une colonne `direction` : même migration, mais chaque lecteur de `env` devait la tester.

## Conséquences
- Chaque lecteur de transactions `env` doit décider s'il lit aussi `envin` (liste faite dans la spec 0036 : ledger, budget, envelopeCash, bankMovements, Expenses, Envelopes, Accounts).
- Les données existantes se chargent sans changement (aucun `envin`).
- Le crédit n'atteint que l'enveloppe, même quand il vient du fichier d'un autre compte (décision B1 de la spec).
