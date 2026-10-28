# 0026 — Les objectifs deviennent des données : une table `goals`, migration marquée dans les réglages

- Statut : acceptée
- Date : 2026-10-28
- Spec liée : [0032-objectifs-par-annee](../specs/0032-objectifs-par-annee.md)

## Contexte
Les trois objectifs de la spec 0025 étaient écrits en dur (fonds de secours, « Investir », taux d'épargne) et stockés dans des colonnes de `settings`. La spec 0032 veut une liste libre d'objectifs, par année civile, de quatre types (montant sur comptes, taux d'épargne, plafond de dépenses, épargné dans l'année).

## Décision
- `BudgetData.goals?: Goal[]` (domaine) ; table Supabase `goals` : colonnes scalaires `id, year, kind, name, target, due, position` et une colonne `params jsonb` qui porte ce qui dépend du type (`{ accounts }` pour les types A et D, `{ scope }` pour le plafond). `kind` est contraint par un `check`. Clé primaire `(user_id, id)`, RLS « own rows ». Une table, un diff simple dans `supabaseRows.ts` ; un cinquième type n'exige pas de migration SQL.
- Migration des anciens réglages faite par l'application (`migrateGoals`, `domain/migrate.ts`), au chargement. Un marqueur `settings.goals_migrated` (colonne `boolean not null default false`, `Settings.goalsMigrated`) dit qu'elle a eu lieu : supprimer ensuite tous les objectifs ne les fait pas revenir. Les objectifs migrés ont des identifiants fixes (`goal-emergency`, `goal-invest`, `goal-savings`). `loadBudget` enregistre le résultat tout de suite.
- Les anciennes colonnes de `settings` sont conservées mais plus jamais lues après la migration.
- Les widgets qui lisaient ces réglages sont rebranchés sur les objectifs de l'année en cours : « Fond de secours » (Budget et carte Patrimoine) = premier objectif de type A, cible d'épargne du tableau de bord = premier objectif de type B (« — » ou masqué sans objectif), « Total global » des investissements = somme de toutes les lignes `inv`.
- Migration SQL `20261028120000_goals.sql` écrite, **non appliquée** ; `database.types.ts` mis à jour à la main en attendant.

## Alternatives écartées
- Colonnes dédiées (`accounts text[]`, `scope_*`) : beaucoup de colonnes nullables et une migration par nouveau type.
- Table enfant `goal_accounts` : plus normalisée mais deux tables, plus d'ordre de suppression et de diff, contraire à KISS.
- Remettre à 0 les anciens réglages après migration pour détecter qu'elle a eu lieu : casserait les widgets encore branchés dessus et ne distingue pas un budget à cibles nulles.
- Migrer sans marqueur quand `goals` est absent : les objectifs supprimés reviendraient.

## Conséquences
- Le `jsonb` n'est pas validé par la base : `fromRows` lit `params` de façon tolérante (un `accounts` ou un `scope` absent ou invalide est ignoré).
- Tant que la migration SQL n'est pas appliquée, l'écriture d'un objectif ou de `goals_migrated` échoue côté Supabase : à appliquer avant de déployer.
- Un second type de périmètre ou de paramètre s'ajoute dans `params` sans toucher au schéma.
