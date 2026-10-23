# 0018 — Le transfert est un `AccountMovement` avec cible facultative ; il remplace la contrepartie fictive d'un poste

- Statut : acceptée (décisions du développeur, spec 0019)
- Date : 2026-10-23
- Spec liée : [0019-pointage-fictif-et-soldes-reels](../specs/0019-pointage-fictif-et-soldes-reels.md)

## Contexte
Un retrait, un virement entre ses comptes, un versement d'épargne ou l'alimentation d'une enveloppe sont des mouvements réels entre deux comptes. Le pointage d'une ligne d'épargne, d'une allocation ou d'une ligne `var` vers un compte dédié est un débit fictif du même mouvement : sans règle, le solde estimé le compterait deux fois. Un `AccountMovement` (spec 0013) n'existait que par l'import.

## Décision
- Un seul concept : `AccountMovement`, enrichi d'une `target?: MovementTarget` (`{ kind: 'line', key }` ou `{ kind: 'env', id }`), saisi sur l'écran Saisie (type « Transfert », `application/accountMovements.addTransfer`) ou créé par l'import (champ `attach` de l'aperçu, défaut = l'enveloppe ou la ligne du compte de destination, `transferAttachment`).
- Un transfert est réel : il débite la source et crédite la destination à sa date, dans les deux soldes, hors budget ou non.
- Anti-double-compte (RG10) : quand au moins un transfert du même mois est rattaché à un poste (`domain/movementTargets.isItemTransferred`), le mouvement fictif du poste (les deux faces du pointage) n'est plus compté par `estimatedMovements` ; le transfert le remplace. Sans transfert rattaché, rien ne change. Un transfert sans cible, de mêmes comptes et de même montant qu'un poste pointé, est signalé « Semblable à un pointage » avec l'action « Rattacher » (`domain/transfers.similarPointedItem`).
- L'isolation des comptes hors budget (spec 0009, RG92) ne s'applique plus qu'aux contreparties fictives et à la liste grise.
- Persistance : colonnes `target_kind` / `target_key` sur `account_movements` (nullables, contrainte de cohérence). Les règles mémorisées de l'import ne portent pas la cible (la cible est proposée selon la destination).

## Alternatives écartées
- Un nouveau type d'écriture « Transfert » séparé de `AccountMovement` : deux modèles pour la même réalité.
- Une cible portée par le pointage (lien pointage → écriture) : c'est la spec 0018.

## Conséquences
- Le rattachement ne vaut que dans le mois de rattachement du transfert : un transfert d'un autre mois ne remplace pas le pointage.
- Les specs 0016 et 0017 devront parler de « transfert » et de la cible (amendements non faits ici, les fichiers étant hors périmètre de cette implémentation).
