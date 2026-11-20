# 0055 — Réordonner les lignes (Budget et Simulation)

- Statut : validée
- Date : 2026-11-20
- Branche prévue : feat/reordonner_lignes (à confirmer)

## Contexte et objectif
Le développeur veut pouvoir ordonner à sa convenance les lignes d'un bloc, dans l'écran Budget et dans l'écran Simulation. Besoin d'origine : « permet de déplacer les lignes pour les ordonner », via un mode de déplacement activé au niveau de la feuille. Aujourd'hui l'ordre est celui de création, sans moyen de le changer.

## Périmètre
Inclus :
- Un interrupteur « Réordonner les lignes » par feuille (écran Budget, écran Simulation) qui active le mode déplacement de tous les blocs de la feuille.
- Déplacement d'une ligne à la souris (glisser-déposer) et au clavier (▲ ▼).
- Budget : l'ordre est enregistré immédiatement dans le mois affiché et reporté dans le modèle de budget.
- Simulation : l'ordre fait partie du brouillon et est enregistré avec « Enregistrer ».

Exclus :
- Bouton de déplacement par encart (une seule commande globale par feuille).
- Réordonner les blocs eux-mêmes, les enveloppes (tuiles), les objectifs, la carte « Transferts entre comptes », l'écran Modèle (`Template.tsx`) pris isolément.
- Déplacer une ligne vers un autre bloc ou une autre section.
- Historique annuler / rétablir.
- Nouvelle dépendance (KISS : glisser-déposer natif du navigateur).

## Règles de gestion
- RG1. Écran Budget : un interrupteur « Réordonner les lignes » (même style `switch` que « Masquer le réel »), placé à côté des deux interrupteurs existants. Écran Simulation : le même interrupteur dans la carte du haut. L'état de l'interrupteur est de l'affichage seul : non persisté, désactivé au changement d'écran ou de mois.
- RG2. Interrupteur activé : chaque ligne des blocs concernés affiche une poignée « ⋮⋮ » à gauche. Les actions de la ligne (édition du nom et du montant, saisie rapide, menu contextuel, croix « Retirer », sélecteurs de compte, boutons « Ajouter ») sont désactivées. Interrupteur désactivé : l'affichage et les actions redeviennent ceux d'aujourd'hui.
- RG3. Budget : les 6 blocs de lignes (revenus, crédits, fixes, variables, épargnes, investissements) sont réordonnables. Enveloppes, objectifs, « Transferts entre comptes » et « À venir » ne le sont pas. Simulation : les lignes des 7 blocs sont réordonnables, pas les blocs.
- RG4. Une ligne ne se déplace que dans son bloc ET, au Budget, dans sa section (ex. épargnes Long terme / Moyen terme). Elle ne change jamais de bloc ni de section. Les lignes du groupe « Hors budget » du bloc variables se déplacent uniquement entre elles. Une position d'insertion hors de la zone autorisée est refusée sans effet.
- RG5. Glisser-déposer : la ligne saisie est atténuée, un repère d'insertion indique la position visée dans la zone autorisée. Lâcher place la ligne à cet endroit. Échap pendant le geste l'annule : l'ordre n'est pas modifié.
- RG6. Clavier : la poignée est focalisable. Sur la poignée, ▲ monte la ligne d'un rang et ▼ la descend d'un rang, dans sa zone autorisée (RG4). Sur la première ou la dernière ligne de la zone, la flèche vers l'extérieur ne fait rien. Le focus reste sur la ligne déplacée. L'annonce vocale indique la nouvelle position (« position 2 sur 5 »).
- RG7. Budget, enregistrement : chaque déplacement validé est enregistré immédiatement dans l'ordre des lignes du mois affiché, sans bouton de validation. Seul l'ordre change : aucune clé, aucun montant, aucun réel, aucune section n'est modifié.
- RG8. Budget, modèle : le même déplacement est reporté dans le modèle de budget. Les lignes du modèle présentes dans le mois et dans la même section sont replacées dans le même ordre relatif ; les autres lignes du modèle gardent leur place. Une ligne du mois absente du modèle n'est pas ajoutée au modèle. L'ordre du modèle est donc celui des mois créés ensuite par « Appliquer le modèle » ; « Dupliquer le mois précédent » reprend l'ordre du mois précédent (comportement existant).
- RG9. Budget : refusé (aucun changement, aucune poignée proposée, interrupteur désactivé avec explication) sur un mois non initialisé, un mois clôturé et une année clôturée. Les mois déjà créés ne sont pas modifiés par un déplacement fait sur un autre mois.
- RG10. Simulation : le déplacement modifie l'ordre des lignes du brouillon (même mécanisme d'édition que les autres modifications : efface le message d'enregistrement). Il est persisté seulement par « Enregistrer », dans l'ordre existant des lignes de la simulation. Une simulation non enregistrée perd son ordre au rechargement (RG19 de la spec 0034).
- RG11. Un bloc avec zéro ou une seule ligne n'a rien à déplacer : pas de poignée active (la ligne unique affiche sa poignée désactivée).
- RG12. Les totaux, écarts, restes à placer et tout autre chiffre sont inchangés par un déplacement.

## Parcours utilisateur
Nominal Budget :
1. J'ouvre le Budget d'un mois ouvert, je clique « Réordonner les lignes » : les poignées apparaissent, l'édition est suspendue.
2. Je glisse « Internet » au-dessus de « Loyer » dans Dépenses fixes : le repère d'insertion s'affiche, je lâche, l'ordre change et est déjà enregistré.
3. Je désactive l'interrupteur : le mois s'affiche avec le nouvel ordre. Je crée le mois suivant avec « Appliquer le modèle » : il reprend ce même ordre.

Nominal Simulation :
1. J'active « Réordonner les lignes », je monte une ligne avec ▲ au clavier, je désactive.
2. J'enregistre : je rouvre la simulation plus tard, l'ordre est conservé.

Cas limites :
- Je glisse une ligne d'épargne « Long terme » vers « Moyen terme » : refusé, la ligne reste à sa place.
- Je glisse une ligne vers un autre bloc : refusé.
- Échap pendant le glissement : rien ne change.
- Mois clôturé, année clôturée ou non initialisé : interrupteur désactivé avec un titre explicatif.
- Je change de mois ou d'écran avec l'interrupteur actif : il est désactivé au retour.
- Simulation avec un seul bloc rempli et le reste vide : seules les lignes de ce bloc se déplacent.
- Erreur de sauvegarde Supabase : bannière habituelle « Réessayer ».

## Design
Design proposé, à valider (pas de maquette fournie).

Interrupteur (Budget, 1440 px), à droite des interrupteurs existants :
```
[ ○ Masquer le réel ] [ ○ Surligner le reste à sortir ] [ ○ Réordonner les lignes ]
```
Simulation : dans la carte du haut, sur la rangée du nom, juste avant le bouton « Dupliquer » (puis « Enregistrer »).

Mode déplacement d'un bloc (exemple Dépenses fixes) :
```
┌ Dépenses fixes ───────────────────── ┐
│ ⋮⋮  Loyer                    900 €   │
│ ⋮⋮  Internet                  30 €   │  ← ligne saisie (atténuée)
│ ─────────── repère d'insertion ───── │
│ ⋮⋮  Assurance                 45 €   │
└───────────────────────────────────── ┘
```
États : normal (poignées absentes), mode déplacement (poignées visibles, champs en lecture seule, curseur « main »), ligne saisie atténuée avec repère d'insertion (trait de teinte du bloc), zone refusée (curseur interdit, pas de repère), bloc d'une seule ligne (poignée grisée), verrouillé (interrupteur désactivé, `title` explicatif), poignée focalisée (anneau de focus existant).

Composants et tokens réutilisés : classe `switch` et `switch-track`, `icon-btn`, `organic.css` (teintes de bloc `toneVars`) ; nouvelle icône « poignée » dans `Icon.tsx`. Aucun nouveau token de couleur.

## Impact technique
Domaine :
- Fonction pure de déplacement d'une ligne dans une liste ordonnée, bornée à une zone (bloc + section), utilisée par le Budget (lignes du mois et du modèle) et par la Simulation (lignes du brouillon). Aucun changement de type.

Application :
- Nouveau cas d'usage « déplacer une ligne du mois » (mois, clé de la ligne, nouvelle position dans sa zone) : réordonne `months[m].lines` et reporte l'ordre dans `template.lines` (RG8) ; refuse mois verrouillé, non initialisé, ligne inconnue, position hors zone.
- Simulation : pas de cas d'usage d'enregistrement nouveau ; l'ordre passe par l'édition du brouillon (`rows`) et l'enregistrement existant.
- Aucun nouveau port.

Infrastructure et schéma Supabase :
- Aucune migration prévue : l'ordre des lignes du mois, du modèle et de `simulation_rows` est déjà porté par une position. L'implementer vérifie que le changement d'ordre seul est bien réécrit (test de contrat du repository).

Présentation :
- `Budget.tsx` (BlockCard) et `Simulation.tsx` / `SimulationBlock.tsx` : interrupteur, poignées, glisser-déposer natif, clavier ▲▼, repère d'insertion. État du mode local à l'écran.

## Critères d'acceptation
(Tests automatisés = domaine et application, Vitest ; l'UI est vérifiée par le reviewer.)
- CA1 (auto). Given un bloc de 3 lignes A, B, C, When on déplace C en première position, Then l'ordre est C, A, B et les autres blocs sont inchangés.
- CA2 (auto). Given deux sections d'un bloc, When on déplace une ligne vers une position de l'autre section, Then l'action est refusée et rien ne change.
- CA3 (auto). Given un mois ouvert, When on déplace une ligne, Then seul l'ordre de `months[m].lines` change (clés, montants, réels, sections identiques) et les totaux sont inchangés.
- CA4 (auto). Given un modèle contenant les mêmes lignes, When on déplace une ligne du mois, Then les lignes du modèle de sa zone suivent le même ordre relatif et les autres lignes du modèle gardent leur place.
- CA5 (auto). Given une ligne du mois absente du modèle, When on la déplace, Then le modèle n'est pas augmenté de cette ligne.
- CA6 (auto). Given un mois clôturé, une année clôturée ou un mois non initialisé, When on déplace une ligne, Then l'action est refusée et rien ne change.
- CA7 (auto). Given un autre mois déjà créé, When on déplace une ligne dans le mois affiché, Then l'autre mois est inchangé.
- CA8 (auto). Given une ligne inconnue ou une position hors de la zone, When on déplace, Then refus sans effet.
- CA9 (auto). Given une simulation de lignes réparties sur plusieurs blocs, When on déplace une ligne dans son bloc, Then l'ordre relatif des lignes des autres blocs est inchangé et les totaux sont identiques.
- CA10 (auto, contrat repository). Given une simulation, un mois et un modèle réordonnés, When on sauvegarde puis recharge, Then l'ordre est restitué.
- CA11. Given le Budget d'un mois ouvert, When j'active « Réordonner les lignes », Then les poignées apparaissent sur les lignes des 6 blocs, l'édition et les menus sont suspendus ; When je désactive, Then tout redevient normal.
- CA12. Given le mode actif, When je glisse une ligne dans sa section et je lâche, Then l'ordre change immédiatement ; When j'appuie sur Échap pendant le glissement, Then rien ne change.
- CA13. Given le mode actif, When je focalise une poignée et j'appuie sur ▲ ou ▼, Then la ligne monte ou descend d'un rang, le focus reste sur elle, rien ne se passe en bout de zone.
- CA14. Given une ligne d'épargne « Long terme », When je tente de la déposer dans « Moyen terme » ou dans un autre bloc, Then le dépôt est refusé visuellement et sans effet.
- CA15. Given un mois clôturé ou non initialisé, Then l'interrupteur est désactivé avec un titre explicatif.
- CA16. Given un déplacement fait au Budget, When je crée un mois avec « Appliquer le modèle », Then les lignes suivent le nouvel ordre.
- CA17. Given la Simulation, When j'active le mode, déplace une ligne, enregistre, recharge la page et rouvre la simulation, Then l'ordre est conservé ; Given une simulation non enregistrée, When je recharge, Then l'ordre est perdu.
- CA18. Given un bloc d'une seule ligne, Then sa poignée est grisée et inactive.

## Questions ouvertes
- Nom de branche `feat/reordonner_lignes` à confirmer.
