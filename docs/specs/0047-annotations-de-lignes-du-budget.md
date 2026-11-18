# 0047 — Annotations du budget, portées par les opérations

- Statut : implémentée le 2026-11-18 (validée ; amendée le 2026-11-18 : l'annotation passe de la ligne à l'opération ; arbitrages des questions ouvertes intégrés le 2026-11-18)
- Date : 2026-11-13 (amendement : 2026-11-18)
- Branche prévue : feat/categories_depenses (branche courante, spec non commitée)
- Dépend de : 0020 (normalisation du texte), 0022 (détail permanent de ligne, jamais implémentée, obsolète depuis la spec 0051), 0027 (notes du mois, distinctes), 0028 (compte lié à une ligne d'épargne).

## Contexte et objectif

Certains chiffres d'une ligne, pour un mois donné, ne se comprennent pas d'un coup d'œil. Exemple : sur « LDDS Travaux » en novembre 2026, le réel est de +50 € car des virements sortants sont compensés par des opérations affectées au LDDS. Le développeur garde un résumé écrit de sa main, visible discrètement dans le Budget et rappelé sous les opérations dans l'écran Opérations.

Problème de la première version : l'annotation était portée par la ligne du mois. En ajouter une depuis le Budget la répercutait sur toutes les opérations de la ligne, sans distinction, et elle n'était pas modifiable pour une opération donnée. Nouveau principe : **une annotation par opération**, choisie opération par opération, avec son montant rappelé dans le Budget.

## Existant (non dupliqué)

- Détail de ligne (0022) : jamais implémenté (plus aucune colonne `detail` sur `budget_lines`), obsolète depuis la spec 0051. Le détail d'opération (0020) est fusionné dans l'annotation par la spec 0051.
- Notes du mois (0027) : liste libre du mois sur le tableau de bord. Inchangées.
- Menu clic droit d'une ligne du Budget et bulle `DetailsBubble` : étendus, pas remplacés.
- Version actuelle (non commitée) : `Line.annotation`, colonne `budget_lines.annotation` (migration 20261113120000, déjà appliquée, à ne pas modifier), ADR 0040, `setLineAnnotation`, `transactionAnnotations`, `movementAnnotations`, `AnnotationModal`. Remplacés par cette spec.

## Périmètre

Inclus :
- Une annotation facultative par opération, pour les deux familles d'opérations : les transactions (`Transaction`) et les virements/mouvements de compte (`AccountMovement`).
- Ajout depuis le Budget (clic droit d'une ligne) avec choix des opérations concernées, modification et suppression depuis le Budget et depuis Opérations.
- Affichage dans le Budget : annotation et montant de chaque opération annotée, par ligne.
- Rappel gris sous chaque opération annotée dans Opérations, devenu éditable.
- Migration des annotations de ligne existantes vers les opérations, puis retrait de l'ancien stockage.

Exclus :
- Annotation propre à une ligne sans opération, génération ou résumé automatique de texte.
- Copie vers un autre mois, historique des modifications, écran Modèle.
- Correctif de la règle RG26 (spec 0028), traité séparément.
- Saisie de l'annotation d'exemple « LDDS Travaux » : c'est une donnée, pas une fonction de l'app.

## Règles de gestion

- RG1. L'annotation est un texte facultatif saisi par le développeur, porté par **une opération** (transaction ou mouvement de compte). Une opération a au plus une annotation. Elle n'est plus liée à une ligne ni à un mois en propre : elle suit l'opération.
- RG2. Texte nettoyé des espaces en début et fin ; vide après nettoyage = pas d'annotation. 500 caractères maximum : au-delà, la saisie est refusée, pas tronquée. Plusieurs lignes autorisées (retours à la ligne conservés).
- RG3. L'annotation n'est jamais recopiée dans un mois existant ou créé plus tard, ni dans le modèle. Aucune copie d'opération entre mois ne la reprend, sauf si l'opération elle-même est déplacée (RG7).
- RG4. (Amendée par 0051) Elle est distincte des notes du mois (0027). Le détail d'opération (0020) a disparu : son texte est repris dans l'annotation (spec 0051). Le détail permanent de ligne (0022) n'a jamais été implémenté.
- RG5. Elle n'a aucun effet sur budget, réel, écart, pointage, soldes ou totaux, ni sur l'export éventuel des opérations.
- RG6. Elle reste modifiable sur un mois clos ou verrouillé, sans effet sur les chiffres.
- RG7. Cycle de vie : supprimer l'opération supprime son annotation. Modifier l'opération (libellé, montant, date, imputation, affectation) ou la déplacer vers une autre ligne ou un autre mois conserve son annotation.
- RG8. Menu clic droit d'une ligne du Budget : « Ajouter une annotation » ouvre la modale d'ajout (RG9). Il est toujours proposé, même si la ligne a déjà des opérations annotées. Les annotations existantes se modifient et se suppriment depuis la liste (RG10) ou depuis Opérations (RG12). Ces entrées s'ajoutent à celles existantes.
- RG9. Modale d'ajout du Budget : elle liste les opérations rattachées à la ligne (RG11) pour le mois affiché, chacune avec une case à cocher, sa date, son libellé et son montant. Un champ de texte multi-ligne (RG2, compteur de caractères) donne le texte à appliquer. « Enregistrer » applique le texte aux seules opérations cochées. Aucune opération cochée ou texte vide : Enregistrer désactivé. Validation par Entrée, retour à la ligne par Maj+Entrée, annulation par Échap ou « Annuler ». Si une opération cochée porte déjà une annotation, son texte actuel est affiché à côté de sa case et une confirmation explicite est demandée avant de l'écraser ; refuser la confirmation n'écrase rien.
- RG10. Affichage dans le Budget : une ligne qui a au moins une opération annotée (RG11) affiche une petite icône discrète à côté du nom. Au survol : la liste des opérations annotées, chacune avec son annotation suivie de son montant (ex. « −1 000,00 € — Réel = +50 € : … »). Au clic sur l'icône : ouverture de la même liste avec, pour chaque opération, les actions « Modifier » (modale d'édition de son seul texte, RG2) et « Supprimer ». Une même opération annotée apparaît sous chaque ligne à laquelle elle est rattachée (RG11).
- RG11. Une opération est « rattachée à une ligne » dans deux cas : (1) son imputation est cette ligne (dépense, entrée d'argent, ligne de crédit), ou c'est un mouvement dont une cible est cette ligne ; (2) elle est affectée au compte lié à cette ligne d'épargne (spec 0028). Une opération relevant de plusieurs lignes est listée et cochable depuis chacune ; son annotation unique s'affiche sous chacune. Une opération imputée à une enveloppe ou à un compte sans lien avec la ligne, ou hors budget, n'est pas proposée pour cette ligne. Seules les opérations du mois affiché sont concernées.
- RG12. Écran Opérations : sous chaque opération annotée, une ligne grise affiche son annotation (2 lignes visuelles max, texte complet en infobulle). Un clic sur cette ligne ouvre la modale d'édition (RG2, RG9 pour les touches) : texte vide validé = annotation supprimée. Une opération sans annotation n'affiche rien et propose, par une action discrète du même écran, d'en ajouter une.
- RG13. Migration des données existantes : pour chaque ligne portant une annotation, son texte est copié sur chaque opération rattachée à cette ligne dans le mois de la ligne (règle RG11). Si une opération est rattachée à plusieurs lignes annotées, les textes sont concaténés, séparés par un retour à la ligne (dans l'ordre des lignes). Si le texte concaténé d'une opération dépasse 500 caractères, la migration ÉCHOUE et liste les cas (opération, mois, longueur) : aucune troncature, rien n'est copié ni retiré. Puis l'ancien stockage de la ligne est retiré (RG14).
- RG14. L'ancien champ `Line.annotation`, la colonne `budget_lines.annotation` et les fonctions associées sont retirés. Une nouvelle migration réalise la copie (RG13) puis le retrait. La migration 20261113120000 n'est pas modifiée.
- RG15. Les données sans annotation restent valides ; aucun changement visible pour elles.
- RG16. Annotation de ligne existante sans aucune opération rattachée dans son mois : son texte est PERDU à la migration (risque accepté par le développeur). La migration émet un avertissement (NOTICE) qui liste ces lignes, sans bloquer.

## Parcours utilisateur

- Nominal : clic droit sur « LDDS Travaux » (novembre 2026) → « Ajouter une annotation » → je coche deux virements sur quatre, je saisis le résumé → Enregistrer. Seuls ces deux virements sont annotés. Une icône apparaît près du nom ; au survol, j'y lis chaque annotation avec le montant de son opération.
- Écrasement : je coche une opération déjà annotée → son texte actuel est montré → à l'enregistrement, une confirmation est demandée. « Annuler » dans la confirmation laisse tout intact.
- Modifier une seule : dans Opérations, je clique la ligne grise d'un virement → modale d'édition → je change le texte → Enregistrer. Les autres opérations de la ligne ne bougent pas.
- Supprimer : je vide le texte d'une opération annotée → son annotation disparaît ; l'icône du Budget disparaît s'il n'en reste aucune.
- Opération multi-lignes : un virement ciblant deux lignes annotées apparaît dans la modale et sous l'icône de chacune des deux lignes, avec la même annotation.
- Cas limites : 500 caractères exacts acceptés, 501 refusés ; texte d'espaces = rien ; mois clos = modifiable ; opération supprimée = annotation disparue ; opération déplacée = annotation conservée ; aucune opération rattachée = modale sans case, Enregistrer désactivé avec un message explicite ; Échap = aucune modification.

## Design

Design proposé, à valider (pas de maquette fournie). Réutilise les modales, `cell-input`, `panel`, `entry-detail` et `Icon` existants (`src/presentation/ds/organic.css`, `src/presentation/components/AnnotationModal.tsx` à adapter).

Modale d'ajout depuis le Budget :
```
┌ Annotation — LDDS Travaux · novembre 2026 ─────────────┐
│ Opérations concernées                  [Tout cocher]   │
│ [x] 12/11  Virement LDDS → principal      −1 000,00 €  │
│ [x] 14/11  Virement principal → LDDS         950,00 €  │
│ [ ] 20/11  Artisan (affecté LDDS)           −300,00 €  │
│     « Déjà annotée : Acompte versé… »  (gris)          │
│ [ zone de texte multi-ligne ......................... ] │
│                                            230 / 500   │
│                              [Annuler] [Enregistrer]   │
└────────────────────────────────────────────────────────┘
```
Confirmation d'écrasement : petite modale « 1 opération déjà annotée sera remplacée » avec [Annuler] [Remplacer].

Budget :
```
  LDDS Travaux  (i)                       500,00 €    50,00 €
     (i) survol : « −1 000,00 €  Réel = +50 € : les virements… »
                  « +950,00 €    … »
```
Clic sur (i) : même liste avec « Modifier » / « Supprimer » par opération.

Opérations :
```
 12/11  Virement LDDS → principal          −1 000,00 €   LDDS Travaux
        Réel = +50 € : les virements sortants… (gris, 2 lignes max, infobulle, cliquable)
```
États : aucune opération (message), sans annotation (rien), annotée (icône), édition (modale), erreur (> 500 : Enregistrer désactivé, compteur en alerte), confirmation d'écrasement, mois clos (identique).

## Impact technique

- Domaine : l'annotation devient un champ facultatif des deux familles d'opérations (`Transaction`, `AccountMovement`), plus de champ sur la ligne ; normalisation (0020) avec limite 500 conservée ; calcul des opérations rattachées à une ligne (règle RG11) et des annotations d'une ligne avec leur montant ; la suppression d'une opération supprime son annotation ; aucune copie entre mois.
- Application : actions pour appliquer un texte à plusieurs opérations (liste d'identifiants), modifier et supprimer l'annotation d'une opération, sans effet sur les calculs et sans contrôle de verrou ; détection des opérations déjà annotées pour la confirmation. Les fonctions `setLineAnnotation`, `transactionAnnotations`, `movementAnnotations` et leurs tests sont remplacés.
- Infrastructure / Supabase : nouvelle migration (colonne facultative sur les opérations et sur les mouvements, copie des annotations de ligne vers les opérations rattachées, puis retrait de `budget_lines.annotation`) ; aller-retour sauvegarde/relecture sans perte ; `database.types.ts` et `supabaseRows.ts` mis à jour ; migration 20261113120000 intacte. Nouvel ADR à écrire (remplace l'ADR 0040, à marquer remplacé) : annotation portée par l'opération.
- Présentation : `Budget.tsx` (menu, icône, liste au survol/clic), `Expenses.tsx` (ligne grise cliquable, ajout), `AnnotationModal.tsx` (liste cochable, confirmation), `AssignPicker.tsx` et `LineQuickEntry.tsx` si touchés par la version actuelle, `app.css`.

## Critères d'acceptation

- CA1. Given une ligne avec 4 opérations rattachées, When j'ajoute un texte en n'en cochant que 2, Then seules ces 2 opérations portent l'annotation. (Auto)
- CA2. Given une opération annotée, When je crée un nouveau mois ou copie un mois, Then aucune opération créée n'a d'annotation. (Auto)
- CA3. Given un texte de 500 caractères, When j'enregistre, Then il est accepté ; Given 501, Then il est refusé sans troncature. (Auto)
- CA4. Given un texte vide ou d'espaces sur une opération annotée, When je valide, Then l'annotation est supprimée ; à l'ajout depuis le Budget, Enregistrer est désactivé. (Auto pour la règle, manuel pour le bouton)
- CA5. Given un texte avec retours à la ligne, When je l'enregistre, Then il est restitué à l'identique. (Auto)
- CA6. Given des annotations, When je calcule budget, réel, écart, soldes, totaux, Then rien ne change. (Auto)
- CA7. Given un mois clos ou verrouillé, When j'ajoute, modifie ou supprime une annotation, Then c'est enregistré et aucun chiffre ne bouge. (Auto)
- CA8. Given une opération annotée, When je la supprime, Then son annotation disparaît ; When je la modifie ou la déplace vers une autre ligne ou un autre mois, Then l'annotation est conservée. (Auto)
- CA9. (Retiré par 0051 : le détail permanent de ligne n'existe pas.)
- CA10. Given un clic droit sur une ligne, When le menu s'ouvre, Then il propose « Ajouter une annotation » en plus des entrées existantes. (Manuel)
- CA11. Given la modale d'ajout, When je l'ouvre, Then elle liste exactement les opérations rattachées à la ligne pour le mois affiché (imputation, cible de mouvement, compte lié), chacune avec case, date, libellé, montant ; une opération hors budget, enveloppe sans lien ou d'un autre mois n'y figure pas. (Auto pour la sélection, manuel pour le rendu)
- CA12. Given une opération cochée déjà annotée, When j'enregistre, Then son texte actuel a été affiché et une confirmation est demandée ; si je refuse, rien n'est écrasé. (Manuel, règle d'écrasement Auto)
- CA13. Given une opération rattachée à deux lignes, When j'annote depuis l'une, Then l'annotation s'affiche dans le Budget sous les deux lignes ; Then elle est cochable depuis chacune. (Auto)
- CA14. Given une ligne avec des opérations annotées, When je regarde le Budget, Then une icône est visible, le survol affiche chaque annotation avec le montant de son opération, le clic permet de modifier ou supprimer chacune ; Given plus aucune annotation, Then l'icône disparaît. (Manuel, calcul des montants Auto)
- CA15. Given Opérations, When une opération (transaction ou mouvement) est annotée, Then sa ligne grise s'affiche sous elle (2 lignes, infobulle) et un clic l'ouvre en édition ; une opération non annotée n'affiche rien. (Manuel)
- CA16. Given Échap ou « Annuler » dans une modale, Then rien n'est modifié ; Given Entrée ou « Enregistrer », Then c'est enregistré ; Maj+Entrée ajoute un retour à la ligne. (Manuel)
- CA17. Given des annotations de ligne existantes, When la migration s'exécute, Then chaque opération rattachée (RG11, mois de la ligne) reçoit le texte ; une opération rattachée à plusieurs lignes annotées reçoit les textes concaténés ; Then `budget_lines.annotation` n'existe plus. (Auto pour la règle de copie, vérification manuelle de la migration sur une copie de la base)
- CA18. Given des données sans annotation, When je les charge, Then Budget et Opérations s'affichent comme avant. (Auto)
- CA19. Given une annotation sur une transaction et sur un mouvement, When je sauvegarde puis recharge (Supabase), Then elles sont identiques. (Auto)

## Questions ouvertes

Aucune. Arbitrages du développeur (2026-11-18) :
1. Annotation de ligne sans opération rattachée dans son mois : texte perdu à la migration, risque accepté (RG16).
2. Textes concaténés dépassant 500 caractères sur une même opération : la migration échoue et liste les cas, aucune troncature (RG13).
