# 0033 — L'action de clôture du mois quitte l'écran Budget pour la page « Relevé »

- Statut : acceptée (validée par le développeur)
- Date : 2026-11-03
- Spec liée : [0041-page-releve-et-cloture-du-mois](../specs/0041-page-releve-et-cloture-du-mois.md)

## Contexte
« Clôturer le mois », « Rouvrir le mois » et le bandeau « Impossible de clôturer » étaient sur l'écran Budget ([ADR 0004](0004-cloture-d-un-mois-par-un-indicateur-sur-le-mois.md)). La clôture dépend maintenant des relevés de compte, saisis sur une nouvelle page « Relevé ».

## Décision
Les trois éléments sont déplacés sur la page Relevé (`presentation/components/CloseMonth.tsx`, `screens/Releve.tsx`), pour le seul mois affiché. L'écran Budget ne montre plus que la pastille « Mois clôturé ». `closeBlockers` reçoit un troisième motif (`statements`), évalué avec les deux autres. L'indicateur `MonthData.closed` et `isMonthLocked` ne changent pas. Le dialogue des lignes en espèces (spec 0037) suit le bouton.

## Alternatives écartées
- Garder le bouton sur le Budget et n'y afficher que le blocage : l'utilisateur aurait dû changer d'écran pour corriger chaque écart.
- Dupliquer le bouton sur les deux écrans : deux endroits à maintenir et une explication de refus à synchroniser.

## Conséquences
- Un seul endroit où l'on voit pourquoi on ne peut pas clôturer, et où on le corrige.
- Le Budget ne permet plus de clôturer directement ; la carte « Pointage par compte » renvoie vers la page.
- Aucun changement de schéma ni de modèle.
