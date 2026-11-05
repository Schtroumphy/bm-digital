# 0038 — Un virement vise plusieurs lignes : `targets` en jsonb à la place de `target_kind` / `target_key`

- Statut : acceptée (décision du développeur, spec 0045)
- Date : 2026-11-05
- Spec liée : [0045-virement-plusieurs-lignes](../specs/0045-virement-plusieurs-lignes.md)

## Contexte
Un virement (`AccountMovement`) ne portait qu'une cible (`target`, stockée dans `account_movements.target_kind` et `target_key`). Un seul virement vers un compte dédié (Boursorama) alimente pourtant plusieurs lignes variables (Alimentation, Loisirs, Carburant). Il faut une liste de cibles.

## Décision
- Le modèle porte `AccountMovement.targets?: MovementTarget[]` (absent = aucune cible). `target` disparaît.
- En base, `account_movements.targets` est une colonne `jsonb not null default '[]'` (tableau d'objets `{kind, key}` ou `{kind, id}`) qui remplace `target_kind` et `target_key`.
- La migration `20261105120000_movement_targets.sql` est destructive : elle crée `targets`, reprend chaque ancienne cible en `[cible]`, puis supprime les deux anciennes colonnes et leur contrainte. Montants et soldes sont inchangés.
- Ordre de déploiement : appliquer la migration, puis publier l'application. L'ancienne version lit `target_kind` / `target_key` et ne fonctionnerait plus après la migration. La migration est appliquée.
- Les données locales anciennes sont converties au chargement par `migrateMovementTargets`.

## Alternatives écartées
- Table de liaison `account_movement_targets` : une table, un ordre d'écriture et des jointures de plus pour une petite liste toujours lue avec son virement.
- Garder `target_kind` / `target_key` et ajouter `targets` : deux sources de vérité à maintenir.
- Migration additive (ne rien supprimer) : plus sûre au déploiement, mais laisse des colonnes mortes.

## Conséquences
- Pas de contrainte relationnelle sur le contenu des cibles : la validité est vérifiée par l'application (`isValidTransferTargets`) ; la lecture ignore les formes inconnues.
- Retour arrière impossible sans reconstruire les anciennes colonnes.
- Il faut respecter l'ordre migration puis publication pour tout futur environnement.
