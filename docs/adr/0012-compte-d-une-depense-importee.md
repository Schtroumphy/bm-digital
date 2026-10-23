# 0012 — Compte d'une dépense `var` importée

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-23
- Spec liée : [0013-import-csv-depenses](../specs/0013-import-csv-depenses.md)

## Contexte
La règle RG19 de la spec 0013 disait : une dépense vers une ligne `var` prend le compte résolu de la ligne (correspondance de comptes). Mais `addTransaction` refuse une dépense `var` sur un autre compte que celui attribué à sa box (spec 0006 amendée).

## Décision
Une dépense `var` importée prend le compte attribué de la box lorsqu'il y en a un (`fixedTransactionAccountId`), sinon le compte résolu de la ligne (correspondance de comptes). Une dépense vers une enveloppe suit le compte de l'enveloppe. Dans les deux cas `importAccountId` garde le compte du fichier pour la déduplication ([ADR 0010](0010-deduplication-de-l-import-par-compte-d-import-empreinte-et-rang.md)). L'aperçu affiche « Compte de la box : X » quand il diffère du compte d'import.

## Alternatives écartées
- N'offrir que les lignes `var` compatibles avec le compte d'import : certaines lignes disparaissent de la liste.
- Contourner `addTransaction` pour forcer le compte d'import : contredit la spec 0006.

## Conséquences
- Le compte de la transaction peut différer du compte du fichier : la dépense est comptée sur le compte de la box, comme une saisie manuelle.
