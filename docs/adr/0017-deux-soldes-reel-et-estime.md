# 0017 — Deux soldes par compte : réel (écritures) et estimé (budget, toujours au pointage)

- Statut : acceptée (décisions du développeur, spec 0019) ; amende l'[ADR 0005](0005-solde-estime-continu-et-regularisation.md)
- Date : 2026-10-23
- Spec liée : [0019-pointage-fictif-et-soldes-reels](../specs/0019-pointage-fictif-et-soldes-reels.md)

## Contexte
L'ADR 0005 voulait un seul chiffre : le solde de l'écran Comptes et le « solde estimé » étaient égaux au réel par construction, et un réglage `pointageStart` basculait chaque mois entre « au réel » (le réel saisi des lignes alimente les soldes) et « au pointage ». Le développeur veut l'inverse : le budget (réel de ligne, pointage) est une information ; le suivi réel d'un compte ne vient que des dépenses, entrées d'argent, transferts et régularisations.

## Décision
- `domain/bankMovements.ts` produit deux listes séparées : `realMovements` (écritures réelles seulement) et `estimatedMovements` (pointages fictifs au montant compté, contreparties entre comptes, dépenses `var`/`env`/`epa`, transferts). Une écriture n'est jamais lue deux fois dans une même chaîne.
- Le **solde réel** est la seule référence : `Ledger.bankMonth`, écran Comptes, comparaison avec le relevé, reports `bank:<id>` de la clôture d'année. La régularisation ne corrige que lui.
- Le **solde estimé** (`checkoff.monthBalance`) est toujours calculé « au pointage » : `settings.pointageStart`, `monthMode`, `canSetPointageStart` et `oldestCheckedMonth` disparaissent. Un mois sans pointage ne contient aucun mouvement de ligne.
- Les anciens virements « faits » (`transfers` / `transfersDone`) sont ignorés par les deux soldes. Les données restent chargées sans erreur ; la colonne `pointage_start` reste en base, inutilisée.
- « Reste à sortir » et « Revenus attendus » restent budgétaires : ils pèsent le budget des lignes.
- Le solde propre d'une enveloppe dans le `Ledger` (`envMonth`) reste budgétaire (début + allocation − dépensé) ; le solde réel de son compte est `bankMonth`.
- Tout est dérivé à la lecture : rien de nouveau n'est stocké pour les soldes.

## Alternatives écartées
- Garder les deux modes et ajouter un second solde : deux règles de bascule pour deux chiffres, `pointageStart` à expliquer.
- Un seul solde « mixte » : c'est la source du double compte et de l'écart inexplicable avec le relevé.

## Conséquences
- Les soldes affichés changent à la bascule (décision du développeur, budget neuf).
- L'égalité « écran Comptes = solde estimé » (spec 0009, CA49 et suivants) est remplacée par des propriétés de la spec 0019 (tests dans `realBalances.test.ts`).
- L'écart « réel moins estimé » devient un indicateur d'information (spec 0018 à venir).
