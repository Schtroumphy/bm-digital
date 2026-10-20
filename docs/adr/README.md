# Architecture Decision Records (ADR)

Une ADR trace une décision technique pertinente à long terme, prise d'un commun accord avec le développeur. Elles sont versionnées et écrites par l'agent `implementer`.

Fichier : `docs/adr/NNNN-<slug-kebab-case>.md` (numéro à 4 chiffres, croissant). Une ADR acceptée ne se modifie pas : on en écrit une nouvelle qui la remplace.

La décision de départ (clean architecture, contexte React, etc.) est dans la section 6 de [`../architecture.md`](../architecture.md).

## Gabarit

```markdown
# NNNN — <Décision en une phrase>

- Statut : proposée | acceptée | remplacée par NNNN
- Date : AAAA-MM-JJ
- Spec liée : [NNNN-slug](../specs/NNNN-slug.md)

## Contexte
Le problème et les contraintes.

## Décision
Ce qui est retenu, et pourquoi.

## Alternatives écartées
Option, raison du rejet.

## Conséquences
Positives, négatives, ce qu'il faudra surveiller.
```
