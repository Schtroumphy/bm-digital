# 0023 — Notes du mois par mois dans une table `month_notes`

- Statut : acceptée
- Date : 2026-10-25
- Spec liée : [0027-tableau-de-bord](../specs/0027-tableau-de-bord.md)

## Contexte
Le tableau de bord affiche des notes personnelles propres à chaque mois (texte, case cochée, suppression). C'est une nouvelle donnée à persister dans Supabase. Le repository sauvegarde par diff table par table ([ADR 0007](0007-supabase-source-de-verite-et-sauvegarde-par-diff.md)).

## Décision
Les notes appartiennent à un mois et vivent dans une table `month_notes` (`user_id`, `month`, `id`, `text`, `done`, `position`), avec clé étrangère vers `months` et RLS « own rows ». Dans le domaine : `MonthData.notes?: MonthNote[]`, absent quand il n'y a pas de note. Une note ajoutée sur un mois sans enregistrement crée celui-ci sans l'initialiser. Texte normalisé comme `normalizeDetail`, une note de plus de 200 caractères est refusée.

## Alternatives écartées
- Colonne `notes` en `jsonb` sur `months` : une modification renverrait toute la liste, et ce serait le seul endroit du schéma à stocker des objets imbriqués en JSON.
- Une seule liste reportée d'un mois à l'autre : la maquette parle de « Notes du mois », chaque mois a les siennes.

## Conséquences
- Une table de plus (21), une migration additive `20261025160000_month_notes.sql` à appliquer, et `database.types.ts` à régénérer ensuite.
- L'ordre est porté par `position` ; sauvegarde par diff comme les autres tables, anciennes données lues sans notes.
