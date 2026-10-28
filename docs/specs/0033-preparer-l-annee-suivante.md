# 0033 — Préparer les objectifs de l'année suivante

- Statut : validée
- Date : 2026-10-28
- Branche prévue : feat/objectifs_annee_suivante

## Contexte et objectif
Depuis la spec 0032, les objectifs appartiennent à une année. En fin d'année, le développeur veut préparer l'année N+1 sans tout ressaisir : partir d'une copie des objectifs de N, ajuster les cibles, supprimer ou ajouter des objectifs. Dépend de la 0032 (à implémenter après elle).

## Périmètre
Inclus :
- Action « Reprendre les objectifs de N » vers N+1 (copie modifiable).
- Bandeau « Préparer N+1 » à partir de novembre de l'année en cours.
- Valeur de départ des objectifs de type A en N+1 : solde réel au 1er janvier.
- Réutilisation de l'écran, du panneau de création et des modifications en place de la 0032.

Exclus :
- Copie vers une autre année que N+1, copie d'un sous-ensemble, copie partielle choisie objectif par objectif (tous ou rien, puis suppression à la main).
- Reprise automatique sans action de l'utilisateur.
- Nouveaux types d'objectifs.

## Règles de gestion
- RG1. Copier = créer, pour l'année N+1, un nouvel objectif par objectif de l'année N, avec : même type, même nom, même cible, mêmes paramètres (comptes, périmètre), même ordre. Les objectifs de N ne sont pas modifiés.
- RG2. Échéance du type A : si l'échéance de N tombe en N, elle est décalée d'un an (même jour et mois) ; si elle est déjà postérieure à N, elle est reprise telle quelle ; absente, elle reste absente.
- RG3. Valeur de départ du type A en N+1 = solde réel au 1er janvier de N+1 (solde de fin de décembre N, comme en 0032 RG2). Si le mois de décembre n'existe pas, comportement de la 0032 (première valeur de l'année).
- RG4. Disponibilité : l'action « Reprendre ceux de <N> » est proposée sur l'année N+1 quand elle est vide (état vide de la 0032, RG14) et que N a au moins un objectif. Sur N+1 déjà garnie, l'action n'est pas proposée (pas de doublons). N+1 doit être l'année en cours ou une année future.
- RG5. Bandeau : du 1er novembre au 31 décembre de l'année en cours, tant que N+1 n'a aucun objectif et que l'année en cours en a au moins un, l'écran Objectifs (année en cours affichée) montre « Préparer <N+1> » avec un bouton d'accès à N+1 (même écran, année N+1 affichée). Le bandeau disparaît dès que N+1 a un objectif.
- RG6. Après la copie, l'utilisateur reste sur N+1 : toutes les modifications (cible, échéance, comptes, nom, suppression, ajout) sont celles de la 0032.
- RG7. Objectif de N dont le périmètre n'existe plus (ligne ou compte supprimé) : copié, avec l'avertissement « Périmètre introuvable » de la 0032.
- RG8. La copie est une seule opération : tous les objectifs sont créés, ou aucun (en cas d'erreur de sauvegarde, rien n'est conservé de la copie et l'erreur habituelle s'affiche).
- RG9. Une année passée n'accepte pas la copie (lecture seule, 0032 RG9).

## Parcours utilisateur
Nominal :
1. En novembre 2026, j'ouvre Objectifs : bandeau « Préparer 2027 ».
2. Je clique : l'écran passe sur 2027, vide, avec « Reprendre ceux de 2026 » et « Créer un objectif ».
3. Je reprends : 4 objectifs apparaissent, mêmes noms et cibles ; échéance du fonds de secours 31 déc. 2026 décalée au 31 déc. 2027.
4. J'ajuste une cible en place, je supprime un objectif, j'en crée un nouveau.

Cas limites :
- 2026 sans objectif : pas de bandeau ni d'action de reprise.
- 2027 déjà garnie : pas d'action de reprise.
- Erreur de sauvegarde pendant la copie : message habituel, 2027 reste vide.
- Premier novembre : le bandeau apparaît ; au 1er janvier 2027 il n'a plus lieu d'être (l'année en cours devient 2027).

## Design
Design proposé et validé par le développeur, qui prolonge celui de la 0032.
```
Objectifs        [‹ 2026 ›]                         [+ Nouvel objectif]
┌──────────────────────────────────────────────────────────────┐
│ Préparer 2027 : reprenez vos objectifs 2026 et ajustez-les.  │
│                                          [Préparer 2027 →]   │
└──────────────────────────────────────────────────────────────┘
(cartes de l'année en cours)

Année 2027 vide :
   Aucun objectif pour 2027
   [Reprendre ceux de 2026]   [Créer un objectif]
```
Composants réutilisés : `panel` pour le bandeau, boutons existants, état vide de la 0032. États : bandeau visible / masqué, année vide avec ou sans reprise possible, copie en cours (boutons désactivés), copie réussie (cartes affichées), erreur de sauvegarde (bannière habituelle). Desktop 1440 px.

## Impact technique
- Domaine : fonction pure de copie des objectifs d'une année vers la suivante (décalage de l'échéance RG2) ; règle de disponibilité du bandeau et de l'action.
- Application : action « reprendre les objectifs de N » atomique (RG8), validant les règles RG4 et RG9.
- Infrastructure : aucune nouvelle table ; écriture via le repository de la 0032.
- Présentation : bandeau, bouton « Reprendre ceux de N » dans l'état vide, navigation vers N+1.

## Critères d'acceptation
Tests automatisés (T) pour le domaine et l'application ; le reste vérifié par le reviewer.
1. (T) Given 3 objectifs en 2026 et aucun en 2027, When je reprends, Then 2027 a 3 objectifs de même type, nom, cible, paramètres et ordre, et ceux de 2026 sont inchangés (RG1).
2. (T) Given une échéance au 31/12/2026, Then la copie a le 31/12/2027 ; Given une échéance au 30/06/2028, Then elle reste au 30/06/2028 ; Given pas d'échéance, Then pas d'échéance (RG2).
3. (T) Given 2027 avec au moins un objectif, When j'essaie de reprendre, Then refus, rien n'est créé (RG4).
4. (T) Given une année passée, When j'essaie de reprendre, Then refus (RG9).
5. (T) Given un solde de 12 400 € à fin décembre 2026 sur les comptes d'un objectif A copié, Then la valeur de départ de son plan 2027 est 12 400 (RG3).
6. (T) Given une erreur de sauvegarde pendant la copie, Then aucun objectif n'est créé en 2027 (RG8).
7. (T) Given la date du 28/10 puis du 02/11 de l'année en cours avec objectifs en 2026 et aucun en 2027, Then le bandeau est absent le 28/10 et présent le 02/11 ; Given 2027 garnie, Then absent (RG5).
8. Given le bandeau, When je clique « Préparer 2027 », Then l'écran affiche 2027 avec l'état vide et les deux boutons (RG5, 0032 RG14).
9. Given 2027 vide et 2026 avec objectifs, When je clique « Reprendre ceux de 2026 », Then les cartes apparaissent et sont modifiables en place (RG6).
10. Given 2026 sans objectif, Then ni bandeau ni bouton de reprise.
11. Given l'écran à 1440 px, Then rien ne déborde ; build, lint et tests passent.

## Questions ouvertes
Aucune.
