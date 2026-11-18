# 0040 — Annotation de ligne : un champ de la ligne du mois

- Statut : remplacée par [0041](0041-annotation-portee-par-l-operation.md)
- Date : 2026-11-13
- Spec liée : [0047-annotations-de-lignes-du-budget](../specs/0047-annotations-de-lignes-du-budget.md)

## Contexte
La spec 0047 ajoute un texte facultatif (500 caractères), propre à une ligne et à un mois. Il fallait choisir où le stocker. Une base qui ne connaît pas un champ le perd au rechargement ([ADR 0039](0039-categories-de-depenses-table-dediee.md)).

## Décision
- Le modèle porte `Line.annotation?: string`. Une ligne appartient déjà à un seul mois (`MonthData.lines`), donc l'annotation est propre au mois sans clé supplémentaire.
- En base : une colonne `annotation` (text, nullable) sur `budget_lines` (migration `20261113120000_line_annotations.sql`, appliquée).
- Les lignes du modèle n'ont pas d'annotation : `TemplateLine = Omit<Line, 'actual' | 'annotation'>`. `initMonth` (copie d'un mois ou du modèle) et `saveAsTemplate` retirent le champ, pour qu'elle ne soit jamais recopiée (RG3).
- Un mois non initialisé n'a aucune ligne (`lines: []`) : il n'y a rien à annoter (RG6 amendée).

## Alternatives écartées
- Table `line_annotations` (mois, clé de ligne, texte) : permettrait d'annoter sans ligne, mais ajoute une table, une clé étrangère et un nettoyage à la suppression d'une ligne, pour un cas d'usage inexistant.
- Colonne jsonb sur `months` : renvoie tout l'objet à chaque modification et casse la convention table par table ([ADR 0023](0023-notes-du-mois-dans-une-table-month-notes.md)).

## Conséquences
- Supprimer la ligne supprime l'annotation (RG7) ; renommer la conserve, sans code en plus.
- Migration additive d'une colonne : les anciennes données restent valides (RG14). `database.types.ts` mis à jour à la main.
- Toute nouvelle copie de lignes entre mois doit retirer `annotation` (garde-fou : tests CA2).
