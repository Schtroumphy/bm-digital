# 0039 — Catégories de dépenses : table `categories` et colonnes `category_id`

- Statut : acceptée (décision du développeur, spec 0046)
- Date : 2026-11-05
- Spec liée : [0046-categories-de-depenses](../specs/0046-categories-de-depenses.md)

## Contexte
La spec 0046 ajoute une liste de catégories gérée par l'utilisateur et un champ « catégorie » sur les dépenses et les règles d'import. La spec supposait que le dépôt enregistrait `BudgetData` comme un document JSON (hypothèse H4). C'est faux : `supabaseRows.ts` convertit l'agrégat en lignes, table par table, et ce qui n'a ni table ni colonne est perdu au rechargement.

## Décision
- Le modèle porte `BudgetData.categories?: Category[]` (`id`, `name`, `hue`), `Transaction.categoryId?` et `ImportRule.categoryId?`.
- En base : table `categories` (`id`, `name`, `hue`, `position`, RLS « own rows »), colonnes `transactions.category_id` et `import_rules.category_id`, colonne `settings.categories_initialized`.
- `categories_initialized` distingue « liste jamais créée » (absente, la liste par défaut est créée au chargement) de « liste vidée par l'utilisateur » (présente et vide, jamais recréée).
- Migration additive `20261105180000_categories.sql`, appliquée par le développeur.
- Pas de clé étrangère : l'application refuse de supprimer une catégorie utilisée (RG5) et vide la catégorie des règles d'import quand elle disparaît (RG14).
- La liste par défaut est créée par l'application (`withDefaultCategories`, appelée par `loadBudget`), avec des identifiants fixes, pas en SQL.

## Alternatives écartées
- Liste en jsonb dans `settings` : une colonne de moins, mais pas de ligne par catégorie, incohérent avec le reste du schéma.
- Clé étrangère de `category_id` vers `categories` : elle obligerait à ordonner les suppressions et à gérer `on delete set null`, alors que la règle métier interdit déjà la suppression d'une catégorie utilisée.

## Conséquences
- Il faut mettre à jour `supabaseRows.ts`, `supabaseSchema.ts` et `database.types.ts` (fait à la main d'après la migration).
- Un champ du domaine ajouté plus tard devra, comme ici, avoir sa colonne : le test de contrat (`completeData`) couvre la relecture à l'identique.
- Le texte libre `Transaction.category` (fichier Linxo) reste distinct et inchangé.
