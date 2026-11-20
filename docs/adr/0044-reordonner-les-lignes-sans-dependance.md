# 0044 — Réordonner les lignes : glisser-déposer natif, hook partagé, ordre reporté dans le modèle

- Statut : acceptée (décision du développeur, spec 0055)
- Date : 2026-11-20
- Spec liée : [0055-reordonner-les-lignes](../specs/0055-reordonner-les-lignes.md)

## Contexte
Le Budget et la Simulation doivent permettre d'ordonner les lignes d'un bloc, à la souris et au clavier. L'ordre est déjà porté par une position en base : aucun changement de schéma n'est nécessaire.

## Décision
- Glisser-déposer avec l'API native du navigateur (`draggable`, `dragover`, `drop`), sans nouvelle dépendance. Le refus hors zone vient de l'absence de `preventDefault` sur `dragover`.
- Un hook `useRowReorder` (présentation) partagé par le Budget et la Simulation : glisser-déposer, clavier ▲ ▼, repère d'insertion, annonce vocale, retour du focus.
- Le calcul est pur et vit dans le domaine : `domain/ordering.ts` (`moveInZone`, `followOrder`, `dropIndex`), réutilisé par `application/lineOrder.ts` (mois et modèle) et `domain/simulation.ts` (brouillon).
- Au Budget, un déplacement validé est reporté dans le modèle de budget (RG8) : les lignes du modèle de la même zone suivent le même ordre relatif, les autres gardent leur place, aucune ligne n'est ajoutée au modèle. Ainsi « Appliquer le modèle » reprend l'ordre choisi.
- Pendant le mode, la ligne est `inert` : l'édition et les menus sont suspendus sans toucher à chaque champ.

## Alternatives écartées
- Bibliothèque de glisser-déposer (dnd-kit, etc.) : dépendance non justifiée pour des listes courtes (KISS).
- Ne changer que le mois, sans le modèle : les mois créés ensuite perdraient l'ordre.
- Une logique de déplacement par écran : duplication de la gestion du clavier et du focus.

## Conséquences
- Pas de glisser-déposer tactile (le produit est desktop uniquement) ; le clavier couvre l'accessibilité.
- Le déplacement de la zone dépend de l'affichage (sections, groupe « Hors budget ») : `lineZone` doit rester aligné sur `BlockCard`.
- Aucun changement de schéma ni de migration.
