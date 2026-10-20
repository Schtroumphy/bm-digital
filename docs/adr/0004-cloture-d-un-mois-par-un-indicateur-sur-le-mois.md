# 0004 — Clôture d'un mois par un indicateur sur `MonthData`

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-20
- Spec liée : [0005-revenus-imprevus-disponible-a-placer](../specs/0005-revenus-imprevus-disponible-a-placer.md)

## Contexte
Le verrouillage n'existait que par année (`closes[année].closed`). La spec 0005 ajoute « Clôturer le mois » : un seul mois devient en lecture seule, avec un ordre imposé (le mois précédent d'abord, le dernier clôturé se rouvre en premier).

## Décision
- `MonthData` reçoit `closed?: boolean` (absent = ouvert, aucune migration).
- `isMonthLocked` (domaine) renvoie vrai si l'année est clôturée OU si le mois l'est. Tous les garde-fous existants qui l'appellent s'étendent sans changement.
- Les actions de modification d'un mois (`updateLine`, `addLine`, `deleteLine`, `applyTemplate`, `duplicatePrevious`, `addTransaction`, `deleteTransaction`, nouvelle `setTransferDone`) appliquent elles aussi ce garde-fou et renvoient `false` : la règle est testée au niveau des cas d'usage, plus seulement par l'interface.
- Les règles de clôture et de réouverture sont des fonctions pures dans `application/monthClosing.ts`, qui renvoient aussi les raisons du refus (`closeBlockers`, `reopenBlocker`) pour que l'écran les explique.
- Le « disponible à placer (réel) » est calculé dans le domaine (`availableReal`), sans stockage.

## Alternatives écartées
- Un tableau `closedMonths` à la racine de `BudgetData` : deux sources de vérité pour un mois, plus difficile à rapprocher du futur schéma.
- Réutiliser `closes` (année) avec une clé par mois : mélange deux notions (la clôture d'année porte des soldes de base).
- Garder les garde-fous seulement dans l'interface : le critère CA22 exige que les actions refusent.

## Conséquences
- Schéma Supabase : une information de clôture par mois sera nécessaire (colonne sur `months`), repoussée à la spec Supabase.
- Les actions listées renvoient maintenant un booléen (les appelants existants l'ignorent).
- La clôture d'année n'est pas modifiée ; l'interaction avec des mois clôturés dans l'année est à surveiller (le réglage des soldes de l'année reste possible).
