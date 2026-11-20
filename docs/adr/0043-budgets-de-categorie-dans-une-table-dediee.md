# 0043 — Budgets de catégorie : table dédiée `category_budgets`

- Statut : acceptée (décision du développeur, spec 0054)
- Date : 2026-11-19
- Spec liée : [0054-budget-par-categorie-et-switch-montants-budgetes](../specs/0054-budget-par-categorie-et-switch-montants-budgetes.md)

## Contexte
La spec 0054 ajoute un montant budgété par catégorie et par mois. Comme pour l'[ADR 0039](0039-categories-de-depenses-table-dediee.md), la spec supposait un stockage « en bloc » sans migration. C'est faux : `supabaseRows.ts` convertit `BudgetData` en lignes, table par table ; un champ sans table ni colonne serait perdu au rechargement.

## Décision
- Domaine : `BudgetData.categoryBudgets?: CategoryBudget[]` (`categoryId`, `month`, `amount` ≥ 0). Absent, ou pas d'entrée pour un couple (catégorie, mois) = aucun budget, ce qui est distinct d'un budget de 0.
- Base : table `category_budgets` (`user_id`, `category_id`, `month`, `amount`), clé primaire (`user_id`, `category_id`, `month`), RLS « own rows ».
- Clé étrangère composite (`user_id`, `category_id`) vers `categories` avec `on delete cascade` : les budgets d'une catégorie disparaissent avec elle (RG10). L'application les retire aussi de `BudgetData` (`deleteCategory`), pour que le diff reste cohérent.
- Dans `TABLE_ORDER`, la table vient après `categories` (écritures après la table référencée, suppressions en sens inverse).
- Migration `20261122120000_category_budgets.sql`, appliquée sur Supabase par le développeur. `database.types.ts` est mis à jour à la main.
- Le switch « Montants budgétés » (onglet Indicateurs de l'écran Catégories, spec 0054 révision 3) reste hors base : `localStorage`, clé `categories.showBudgets`.

## Alternatives écartées
- Colonne jsonb `budgets` sur `categories` : le diff réécrirait toute la catégorie à chaque saisie, schéma moins lisible.
- Colonne jsonb dans `settings` : fourre-tout, et la suppression d'une catégorie ne nettoierait rien côté base.

## Conséquences
- Un budget = une ligne ; le diff n'envoie que les budgets modifiés ou supprimés.
- Aucune migration de données : les données existantes n'ont simplement aucune ligne.
- Ordre au déploiement (fait) : migration appliquée avant la publication de l'application.
