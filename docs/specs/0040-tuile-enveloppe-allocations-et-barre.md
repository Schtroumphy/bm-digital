# 0040 — Tuile d'enveloppe du Budget : allocations virtuelle et espèces, et barre de dépensé en deux couleurs

- Statut : prêt à implémenter (périmètre validé par le développeur, aucune question ouverte)
- Date : 2026-11-03 (amendée le 2026-11-04 : réglage de la répartition depuis l'éditeur d'allocation)
- Branche prévue : feat/tuile_budget_allocations_barre
- Amende : 0026 (RG26, D37 à D41, CA10b : tuile du Budget), 0037 (RG11, RG12 lus pour l'affichage). Ne modifie pas la tuile du tableau de bord (0027).

## Contexte et objectif

Sur l'écran Budget, la tuile d'une enveloppe montre aujourd'hui : le solde virtuel en gros chiffre, une ligne « Espèces X » (solde espèces, report compris), une barre « dépensé X sur <solde de départ> » (solde reporté + argent du mois + espèces), puis « alloué X ». Le développeur veut, sur cet écran, voir ce qu'il a ALLOUÉ ce mois, en virtuel et en espèces, et la progression du dépensé par rapport à cette allocation, pas des soldes. Les soldes restent consultables dans l'écran Enveloppes et l'écran Comptes.

Décisions du développeur (intégrées) :
- Le gros chiffre du solde et la ligne « Espèces X » sont remplacés par les allocations : allocation virtuelle (= allocation du mois − part en espèces du mois) et allocation espèces (= part en espèces du mois, 0037 RG11 et RG12).
- Une SEULE barre de progression, en DEUX couleurs (virtuel / espèces), qui compare le dépensé du mois à l'allocation du mois seule : ni report, ni solde de départ dans la barre.
- Amendement : la RÉPARTITION de l'allocation (part en espèces contre virtuel) se règle directement depuis l'écran Budget, dans l'éditeur d'allocation de la tuile (`AllocEditor`), au lieu de devoir aller dans l'écran Enveloppes.

## Périmètre

Inclus :
- Tuile d'enveloppe de l'écran Budget : chiffres, barre, libellés, infobulle, états.
- Fonction de calcul du dépensé du mois par mode (virtuel / espèces).
- Éditeur d'allocation de la tuile (`AllocEditor`) : ajout de la saisie de la part en espèces du mois, à côté de l'allocation totale (RG15 à RG23).

Exclus :
- Tuile et barre des enveloppes du tableau de bord (0027) : inchangées.
- Écran Enveloppes (cartes, soldes, saisie de la part du mois, qui y reste possible et reste cohérente avec la tuile), écran Comptes, en-tête « Total alloué » du bloc Enveloppes, alertes d'enveloppe (« il manque ~X »), pointage de la tuile : inchangés.
- Aucun changement de donnée, de schéma ni de règle de calcul des soldes. Aucune action nouvelle : l'éditeur réutilise `setEnvelopeAllocation` et `setEnvelopeCashPart`.

## Définitions

- Allocation du mois : montant alloué à l'enveloppe pour le mois (celui de « alloué X »).
- Allocation espèces : part en espèces du mois (`cashPart`), comprise entre 0 et l'allocation (0037 RG11).
- Allocation virtuelle : allocation du mois − allocation espèces. Jamais négative (0037 RG11).
- Dépensé espèces du mois : somme des dépenses de l'enveloppe du mois payées en espèces (`payMode: 'especes'`).
- Dépensé virtuel du mois : dépensé du mois de l'enveloppe − dépensé espèces (les autres dépenses, payées en virtuel).
- Dépensé du mois : dépensé virtuel + dépensé espèces (= `spent` de l'enveloppe du mois). Le report des mois précédents n'y entre pas.

## Règles de gestion

Chiffres
- RG1. Le gros chiffre de la tuile (`env-tile-solde`) est l'allocation virtuelle du mois. Sous lui, une ligne « Espèces X € » donne l'allocation espèces ; elle est masquée quand l'allocation espèces vaut 0. Il n'y a plus de solde virtuel ni de solde espèces sur la tuile.
- RG2. La ligne « alloué X € » (total de l'allocation) est conservée et reste le point d'entrée de l'éditeur d'allocation, qui est étendu (RG15 à RG23). Son refus existant (allocation sous la part en espèces, 0037 RG11) est conservé.
- RG3. Les chiffres suivent le mois affiché et se recalculent à chaque changement d'allocation, de part en espèces ou de dépense.

Barre
- RG4. Une seule barre par tuile. Sa pleine largeur représente l'allocation du mois. Elle est remplie par deux segments successifs : à gauche le dépensé virtuel (couleur violette de l'enveloppe, comme aujourd'hui), à sa suite le dépensé espèces (teinte « espèces » `is-cash` avec une hachure ou un motif distinct). La largeur de chaque segment est son montant divisé par l'allocation du mois, en %, la somme étant plafonnée à 100 %. La barre n'est pas découpée en zones par allocation : les allocations virtuelle et espèces ne sont lues que dans les chiffres au-dessus.
- RG5. Libellé sous la barre : « dépensé <dépensé du mois> sur <allocation du mois> » (total). Le détail par couleur n'est que dans l'infobulle (RG11).
- RG6. Si la part en espèces vaut 0 et qu'aucune dépense en espèces n'a eu lieu dans le mois, la barre n'a qu'un segment (virtuel) : elle est identique à l'actuelle en dehors de la base de calcul. Si la part vaut 0 mais qu'une dépense en espèces a eu lieu (payée sur le report d'espèces), le segment espèces apparaît à sa suite.
- RG7. Dépassement : si le dépensé du mois dépasse l'allocation du mois, la barre est pleine, ses segments restent visibles en proportion du dépensé, et la tuile affiche en rouge « dépassé de X € » ; le contour de la barre devient rouge. Le dépassement se mesure sur le TOTAL (dépensé du mois contre allocation du mois), jamais par couleur : de l'espèces dépensée au-delà de la part du mois mais prise sur le report d'espèces n'est pas un dépassement tant que le total reste dans l'allocation.
- RG8. Allocation du mois à 0 : sans dépense, aucune barre (comme l'actuelle quand l'enveloppe est inconnue) ; avec une dépense, barre pleine en dépassement (RG7).
- RG9. Mois avant l'ouverture du compte de l'enveloppe : aucune barre (comportement actuel de `envelopeConsumption` conservé).
- RG10. Lecture seule : la barre n'est pas cliquable ; l'éditeur d'allocation s'ouvre comme aujourd'hui.

Infobulle (`has-tip` de la barre)
- RG11. Texte : « Virtuel : dépensé X sur Y · Espèces : dépensé X sur Y · Solde virtuel Z · Solde espèces Z ». Le report n'apparaît que dans l'infobulle, via les soldes (à jour des dépenses du mois). La partie « Espèces » est omise quand l'allocation et le dépensé espèces valent 0.
- RG12. Accessibilité : les deux segments se distinguent par la teinte ET par un motif (hachure sur le segment espèces), avec un contraste suffisant ; le libellé et l'infobulle portent la même information en texte.

Éditeur d'allocation : réglage de la répartition (amendement)
- RG15. Au clic sur « alloué X € » (mois non verrouillé), l'éditeur présente DEUX champs préremplis : « alloué » (allocation totale du mois, comme aujourd'hui) et « dont espèces » (part en espèces du mois, 0 par défaut). Sous les champs, une ligne en lecture seule « virtuel X € » = alloué − dont espèces, mise à jour à chaque frappe.
- RG16. La part en espèces est un montant ≥ 0 et ≤ à l'allocation du mois (0037 RG11). Le virtuel n'est donc jamais négatif. Part vide = pas de changement ; part à 0 = part supprimée.
- RG17. Mêmes refus que 0037 (`cashPartRefusal`, `cashPartAbove`), avec un message en ligne dans l'éditeur (pas de `window.alert` pour la part) et l'éditeur reste ouvert :
  - part négative ou non numérique : « Montant positif ou nul requis » ;
  - part supérieure à l'allocation saisie : « La part en espèces ne peut pas dépasser l'allocation (X € ) » ;
  - allocation saisie inférieure à la part en espèces (déjà enregistrée ou saisie dans le même éditeur) : « L'allocation ne peut pas passer sous la part en espèces (X €) ».
- RG18. Validation en une fois : Entrée, ou sortie de l'éditeur (le focus quitte les deux champs), valide allocation ET part ensemble. Passer d'un champ à l'autre (Tab, clic) ne valide pas. Échap annule tout, sans rien enregistrer. Si l'un des deux champs est refusé, rien n'est enregistré (tout ou rien).
- RG19. Ordre d'application, pour que l'état intermédiaire ne soit jamais refusé : si la nouvelle allocation est ≥ à la part actuelle, on enregistre l'allocation puis la part ; sinon on enregistre la part puis l'allocation. L'enregistrement est une seule mise à jour des données (un seul recalcul, une seule annulation possible si l'application en offre).
- RG20. Changer seulement l'allocation (part laissée telle quelle) garde le comportement actuel : refus si l'allocation passe sous la part. Changer seulement la part ne modifie pas l'allocation.
- RG21. Mois verrouillé ou clos : l'éditeur ne s'ouvre pas (lecture seule, comme aujourd'hui). Aucun champ de part n'est exposé.
- RG22. Recalcul immédiat dès la validation : allocation virtuelle (gros chiffre), ligne « Espèces X € » (apparue, modifiée ou masquée si 0), barre, libellé, infobulle, « à retirer » en tête du Budget (0037 RG16), total alloué et alertes, sans rechargement.
- RG23. La part saisie ici est la même donnée que celle de l'écran Enveloppes (`cashPart` du mois) : une modification d'un côté est vue immédiatement de l'autre. La règle 0037 RG12 s'applique (le virement d'allocation ne porte que allocation − part).

Cohérence
- RG13. Les calculs de solde, de report, de clôture et de disponible ne changent pas. Seul l'affichage de la tuile change.
- RG14. Aucune alerte d'enveloppe n'est ajoutée ou retirée par cette spec.

## Parcours utilisateur

Nominal : « Shopping » a 100 € d'allocation en octobre dont 40 € en espèces. La tuile affiche « 60,00 € » en gros, « Espèces 40,00 € » dessous, une barre, « dépensé 50,00 € sur 100,00 € » et « alloué 100,00 € ». J'ai dépensé 30 € en virtuel et 20 € en espèces : la barre est remplie à 50 % (30 % violet, 20 % espèces). Survol : détail et soldes.

Cas limites : part en espèces nulle (barre mono-couleur, ligne « Espèces » masquée) ; dépense en espèces sans part du mois (sur le report) ; dépense totale > allocation (dépassement) ; allocation à 0 ; enveloppe créée ce mois-ci ; mois verrouillé ou clos (lecture seule déjà en place) ; dépense importée sur l'enveloppe (payée en virtuel, 0026 D6).

Réglage de la répartition (RG15 à RG23) :
- Nominal : sur « Shopping » (alloué 100 €, part 0), je clique « alloué 100,00 € », je saisis 40 dans « dont espèces », la ligne « virtuel 60,00 € » s'affiche, j'appuie sur Entrée : la tuile montre « 60,00 € » et « Espèces 40,00 € », la barre et l'infobulle suivent.
- Retirer la part : je saisis 0 dans « dont espèces » : la ligne « Espèces » disparaît, tout l'allocation redevient virtuelle.
- Monter l'allocation et la part ensemble : alloué 100 → 150, dont espèces 40 → 70 : accepté (allocation enregistrée en premier).
- Baisser l'allocation et la part ensemble : alloué 100 → 50, dont espèces 40 → 20 : accepté (part enregistrée en premier).
- Refus : dont espèces 120 pour alloué 100 : message en ligne, rien d'enregistré, éditeur ouvert. Alloué 30 avec part 40 inchangée : message, rien d'enregistré.
- Annuler : Échap après avoir modifié les deux champs : aucune valeur n'est enregistrée.
- Part > 0 sur une enveloppe avec dépenses en espèces déjà faites : aucune restriction (la part est informative, 0037 RG11).
- Mois verrouillé ou clos : le clic sur la ligne « alloué » n'ouvre rien.
- Allocation à 0 : le champ « dont espèces » est limité à 0 (RG16).

## Design (proposé, à valider)

Réutilise `env-tile`, `env-tile-solde`, `env-tile-alloc` (`is-cash`), `progress dash-bar`, `has-tip`. Une seule teinte nouvelle : le segment espèces (variante de `is-cash`, avec hachure).

Cas nominal (allocation 100, dont espèces 40 ; dépensé 30 virtuel + 20 espèces) :
```
 +--------------------------+
 | ● Shopping          [x]  |
 | 60,00 €                  |   <- allocation virtuelle (gros)
 | Espèces 40,00 €          |   <- allocation espèces (masquée si 0)
 | [######////··········]   |   <- # virtuel dépensé (30 %), / espèces dépensé hachuré (20 %), · reste (50 %)
 | dépensé 50,00 € sur 100,00 € |
 | alloué 100,00 €          |   <- éditeur d'allocation au clic
 +--------------------------+
```
Sans part en espèces :
```
 | 100,00 €                  |
 | [######···············]   |  (un seul segment)
 | dépensé 30,00 € sur 100,00 € |
 | alloué 100,00 €           |
```
Dépassement (dépensé 120 sur 100) :
```
 | 60,00 €                   |
 | Espèces 40,00 €           |
 | [############////////]  (contour rouge ; pleine, 60 % du dépensé en virtuel, 40 % en espèces)
 | dépensé 120,00 € sur 100,00 €   dépassé de 20,00 € (rouge)
 | alloué 100,00 €           |
```
Infobulle (exemple du cas nominal, sans report) : « Virtuel : dépensé 30,00 € sur 60,00 € · Espèces : dépensé 20,00 € sur 40,00 € · Solde virtuel 30,00 € · Solde espèces 20,00 € ». Avec un report, les soldes l'incluent alors que dépensé et allocation restent ceux du mois.

Éditeur d'allocation (remplace la ligne « alloué » au clic ; réutilise `env-tile-add`, `env-tile-add-row`, `cell-input is-alloc`, `env-tile-error`). Il reste dans la tuile, sans fenêtre :
```
 | alloué      [ 100,00 ]    |   <- allocation totale, focus et sélection à l'ouverture
 | dont espèces [  40,00 ]   |   <- part en espèces (vide si 0 ; 0 = pas d'espèces)
 | virtuel 60,00 €           |   <- calculé, lecture seule, suit la frappe
 | Entrée = valider · Échap = annuler |  <- aide discrète (texte secondaire)
```
Erreur (reste ouvert, texte rouge `env-tile-error` sous les champs, champ fautif entouré en rouge) :
```
 | alloué      [ 100,00 ]    |
 | dont espèces [ 120,00 ]   |   <- contour rouge
 | La part en espèces ne peut pas dépasser l'allocation (100,00 €) |
```
États de l'éditeur : ouvert normal, ouvert avec erreur, fermé (affichage « alloué X € »), indisponible (mois verrouillé ou clos, aucun clic). Le champ « alloué » a le focus à l'ouverture. Entrée valide depuis l'un ou l'autre champ.

États : normal, sans espèces, dépassement, allocation 0 sans dépense (pas de barre), allocation 0 avec dépense (barre pleine rouge), avant l'ouverture (pas de barre), verrouillé.

## Impact technique (quoi)

- Attention : `src/presentation/screens/Budget.tsx` porte des modifications non commitées d'une autre session (spec 0038, écarts dépenses et épargne). L'implementer doit partir de l'état actuel de ce fichier et limiter son changement au bloc de la tuile d'enveloppe (`EnvelopeBalances`, ~l.717 à 775), sans écraser ni réécrire le reste.
- Domaine : nouvelle fonction pure donnant, pour une enveloppe et un mois, allocation, part en espèces, allocation virtuelle, dépensé virtuel et dépensé espèces ; elle lit `monthAlloc`, `cashPart` et les transactions `env` du mois. `envelopeConsumption` n'est pas modifiée (le tableau de bord, 0027, l'utilise).
- Application : aucune action nouvelle. L'éditeur appelle les actions existantes `setEnvelopeAllocation` (`actions.ts`) et `setEnvelopeCashPart` (`cash.ts`, qui s'appuie sur `cashPartRefusal`) dans une seule mise à jour des données (`update`), dans l'ordre de RG19. Les motifs de refus (`CashPartRefusal`, `cashPartAbove`) sont traduits en messages en ligne par la présentation.
- Domaine : `cashPartAbove` et les règles de `cashPartRefusal` inchangées. L'implementer vérifie que la validation de l'ensemble (allocation + part) peut se faire avant écriture pour garantir « tout ou rien » (RG18), sans modifier les règles.
- Infrastructure / Supabase : aucun changement de schéma (`cashPart` existe déjà par mois, 0037).
- Présentation : `Budget.tsx` (tuile et `AllocEditor`, qui reçoit la part actuelle et sa validation, et remplace le `window.alert` de refus par des messages en ligne) et `app.css` (segment espèces, contour de dépassement, champ en erreur) ; `EnvelopesTotal` inchangé. L'écran Enveloppes n'est pas modifié.
- Documentation : amendement de 0026 (RG26, D37 à D41, CA10b).

## Amendements aux specs liées

- 0026 : RG26, D37 à D41 et CA10b (tuile du Budget : solde virtuel en gros, « Espèces X » = solde espèces, barre sur le solde de départ) sont remplacés par la présente spec.
- 0037 : RG11/RG12 inchangées ; elles fournissent l'allocation espèces et l'allocation virtuelle. La phrase de RG11 « se saisit directement depuis l'écran Enveloppes » est complétée : la part se saisit aussi depuis l'éditeur d'allocation de la tuile du Budget (RG15 à RG23).
- 0027 : inchangée.

## Critères d'acceptation

(Auto = test automatisé ; Man = manuel.)

- CA1. Given une enveloppe de 100 € alloués dont 40 € en espèces, Then la fonction de calcul renvoie allocation virtuelle 60 € et allocation espèces 40 €. (Auto)
- CA2. Given 30 € dépensés en virtuel et 20 € en espèces dans le mois, Then dépensé virtuel 30 €, dépensé espèces 20 €, dépensé du mois 50 € ; les dépenses des autres mois n'y entrent pas. (Auto)
- CA3. Given ce cas, Then la tuile affiche « 60,00 € » en gros, « Espèces 40,00 € » dessous et plus aucun solde ; Given une part en espèces à 0, Then la ligne « Espèces » est masquée. (Man sur l'écran, Auto sur le calcul)
- CA4. Given ce cas, Then une seule barre remplie à 50 %, en deux segments de largeurs 30 % et 20 % de couleurs distinctes ; Given une part en espèces nulle et aucune dépense en espèces, Then un seul segment. (Man, Auto sur les pourcentages)
- CA5. Given un solde reporté de 200 € d'un mois précédent, Then la barre et son libellé ne changent pas (le report n'entre pas dans la base). (Auto)
- CA6. Given un dépensé de 120 € sur 100 € d'allocation, Then la barre est pleine, le contour est rouge et « dépassé de 20,00 € » s'affiche. (Man, Auto sur le calcul)
- CA7. Given une allocation à 0 sans dépense, Then aucune barre ; Given une dépense, Then barre pleine en dépassement. (Auto sur le calcul, Man sur l'écran)
- CA8. Given l'infobulle de la barre, Then elle donne dépensé et allocation par couleur, le solde virtuel et le solde espèces. (Man)
- CA9. Given la ligne « alloué X » et l'éditeur d'allocation sans toucher à la part, Then l'allocation se règle comme avant, avec le refus sous la part en espèces (RG17, RG20). (Man)
- CA12. Given un mois ouvert, When je clique « alloué » d'une enveloppe, Then l'éditeur affiche « alloué » et « dont espèces » préremplis et une ligne « virtuel » = alloué − espèces qui suit la frappe. (Man)
- CA13. Given alloué 100 et part 0, When je saisis 40 en espèces et valide par Entrée, Then la part du mois vaut 40, la tuile affiche « 60,00 € » et « Espèces 40,00 € », et l'écran Enveloppes montre la même part. (Auto sur l'enregistrement, Man sur l'écran)
- CA14. Given une part de 40, When je saisis 0 (ou vide la part puis valide avec une autre valeur de part à 0), Then la part est supprimée et la ligne « Espèces » est masquée. (Auto)
- CA15. Given une part saisie supérieure à l'allocation saisie, Then un message en ligne s'affiche, rien n'est enregistré (ni allocation ni part) et l'éditeur reste ouvert. (Auto sur le refus, Man sur le message)
- CA16. Given une part négative ou non numérique, Then « Montant positif ou nul requis », rien d'enregistré. (Auto sur le refus, Man sur le message)
- CA17. Given alloué 100 et part 40, When je mets alloué 150 et part 70, Then c'est accepté ; When je mets alloué 50 et part 20, Then c'est accepté ; When je mets seulement alloué 30, Then c'est refusé (sous la part). (Auto)
- CA18. Given l'éditeur ouvert avec des valeurs modifiées, When j'appuie sur Échap, Then rien n'est enregistré. Given un Tab entre les deux champs, Then rien n'est encore enregistré. (Man)
- CA19. Given un mois verrouillé ou clos, Then l'éditeur ne s'ouvre pas et aucune part ne peut être modifiée depuis le Budget. (Auto sur le refus `locked`, Man sur l'écran)
- CA20. Given une validation réussie, Then les chiffres de la tuile, la barre, l'infobulle et le « à retirer » en tête du Budget sont à jour sans rechargement. (Man)
- CA10. Given la tuile des enveloppes du tableau de bord, Then elle est inchangée. (Auto : tests existants de `envelopeConsumption`)
- CA11. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur : une barre de la largeur de l'allocation du mois, remplie par deux segments (dépensé virtuel puis dépensé espèces) ; teinte `is-cash` avec hachure ; libellé total, détail et soldes en infobulle ; dépassement mesuré sur le total, barre pleine, segments proportionnels, contour rouge et « dépassé de X € », l'espèces prise sur le report n'étant pas un dépassement ; tableau de bord (0027) inchangé. Réglage de la répartition (espèces contre virtuel) dans l'éditeur d'allocation du Budget : deux champs (alloué, dont espèces), validation commune, mêmes refus que 0037, actions existantes, pas de changement de schéma.
