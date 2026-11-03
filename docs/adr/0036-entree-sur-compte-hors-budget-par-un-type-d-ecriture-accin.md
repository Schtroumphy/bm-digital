# 0036 — Entrée d'argent sur un compte hors budget : un type d'écriture `accin`

- Statut : acceptée (choix laissé à l'implémenteur par la spec 0042, à confirmer par le développeur)
- Date : 2026-11-03
- Spec liée : [0042-entree-d-argent-sur-un-compte-hors-budget](../specs/0042-entree-d-argent-sur-un-compte-hors-budget.md)

## Contexte
Un crédit externe (titres-restaurant) doit arriver sur Swile, compte courant hors budget, sans ligne de revenu et sans toucher au budget. Le modèle avait `rev` (lu partout comme un revenu, lié à une ligne) et `envin` (cible = une enveloppe, ADR 0035).

## Décision
Nouveau type de `Transaction` : `'accin'` (cible = id du compte, compte = ce compte, `source` facultative). Aucune colonne ajoutée : la migration `20261103220829_account_entries.sql` élargit seulement `transactions_type_check` (écrite, non appliquée).
- `addTransaction` délègue à `addAccountInflow` (actions.ts) : refus mois verrouillé ou non initialisé, compte non éligible (`offBudgetEntryAccount`, bank.ts : courant, actif, hors budget, ni principal, ni espèces, ni enveloppe), montant ≤ 0, jour hors 1..31, affectation ou hors budget. Aucune ligne de revenu n'est lue ni créée.
- Les mouvements réels et estimés créditent le compte à la date bancaire (`isMoneyIn`). Aucun calcul de budget ne lit `accin`.
- Import : nature `accin` dans `LineNature` (aperçu seulement, jamais mémorisée), cible `{ kind: 'account', id }`, préremplie par le compte du fichier s'il est éligible.

## Alternatives écartées
- Généraliser `envin` (cible = enveloppe ou compte) : tous les lecteurs d'`envin` (dépensé net des enveloppes, `monthSummary`, `ledger`) auraient dû distinguer les deux sens de la cible, au risque de faire baisser le dépensé d'une enveloppe par erreur.
- Réutiliser `rev` avec une ligne rattachée à Swile : impose une ligne de revenu, ce que le développeur refuse.

## Conséquences
- Un type de plus à traiter dans les libellés (Opérations, Comptes) et les déduplications d'import (`isCreditType`).
- Les données existantes se chargent sans changement (aucun `accin`).
- Si le compte est archivé ou repassé dans le budget, ses entrées restent comptées dans son solde.
