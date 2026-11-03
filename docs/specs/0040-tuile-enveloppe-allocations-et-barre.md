# 0040 — Tuile d'enveloppe du Budget : allocations virtuelle et espèces, et barre de dépensé en deux couleurs

- Statut : brouillon, à valider (aucune question ouverte)
- Date : 2026-11-03
- Branche prévue : feat/tuile_budget_allocations_barre
- Amende : 0026 (RG26, D37 à D41, CA10b : tuile du Budget), 0037 (RG11, RG12 lus pour l'affichage). Ne modifie pas la tuile du tableau de bord (0027).

## Contexte et objectif

Sur l'écran Budget, la tuile d'une enveloppe montre aujourd'hui : le solde virtuel en gros chiffre, une ligne « Espèces X » (solde espèces, report compris), une barre « dépensé X sur <solde de départ> » (solde reporté + argent du mois + espèces), puis « alloué X ». Le développeur veut, sur cet écran, voir ce qu'il a ALLOUÉ ce mois, en virtuel et en espèces, et la progression du dépensé par rapport à cette allocation, pas des soldes. Les soldes restent consultables dans l'écran Enveloppes et l'écran Comptes.

Décisions du développeur (intégrées) :
- Le gros chiffre du solde et la ligne « Espèces X » sont remplacés par les allocations : allocation virtuelle (= allocation du mois − part en espèces du mois) et allocation espèces (= part en espèces du mois, 0037 RG11 et RG12).
- Une SEULE barre de progression, en DEUX couleurs (virtuel / espèces), qui compare le dépensé du mois à l'allocation du mois seule : ni report, ni solde de départ dans la barre.

## Périmètre

Inclus :
- Tuile d'enveloppe de l'écran Budget : chiffres, barre, libellés, infobulle, états.
- Fonction de calcul du dépensé du mois par mode (virtuel / espèces).

Exclus :
- Tuile et barre des enveloppes du tableau de bord (0027) : inchangées.
- Écran Enveloppes (cartes, soldes, part du mois), écran Comptes, en-tête « Total alloué » du bloc Enveloppes, alertes d'enveloppe (« il manque ~X »), éditeur d'allocation, pointage de la tuile : inchangés.
- Aucun changement de donnée, de schéma ni de règle de calcul des soldes.

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
- RG2. La ligne « alloué X € » (total de l'allocation, point d'entrée de l'éditeur d'allocation) est conservée à l'identique, avec ses refus existants (allocation sous la part en espèces, 0037).
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

Cohérence
- RG13. Les calculs de solde, de report, de clôture et de disponible ne changent pas. Seul l'affichage de la tuile change.
- RG14. Aucune alerte d'enveloppe n'est ajoutée ou retirée par cette spec.

## Parcours utilisateur

Nominal : « Shopping » a 100 € d'allocation en octobre dont 40 € en espèces. La tuile affiche « 60,00 € » en gros, « Espèces 40,00 € » dessous, une barre, « dépensé 50,00 € sur 100,00 € » et « alloué 100,00 € ». J'ai dépensé 30 € en virtuel et 20 € en espèces : la barre est remplie à 50 % (30 % violet, 20 % espèces). Survol : détail et soldes.

Cas limites : part en espèces nulle (barre mono-couleur, ligne « Espèces » masquée) ; dépense en espèces sans part du mois (sur le report) ; dépense totale > allocation (dépassement) ; allocation à 0 ; enveloppe créée ce mois-ci ; mois verrouillé ou clos (lecture seule déjà en place) ; dépense importée sur l'enveloppe (payée en virtuel, 0026 D6).

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

États : normal, sans espèces, dépassement, allocation 0 sans dépense (pas de barre), allocation 0 avec dépense (barre pleine rouge), avant l'ouverture (pas de barre), verrouillé.

## Impact technique (quoi)

- Attention : `src/presentation/screens/Budget.tsx` porte des modifications non commitées d'une autre session (spec 0038, écarts dépenses et épargne). L'implementer doit partir de l'état actuel de ce fichier et limiter son changement au bloc de la tuile d'enveloppe (`EnvelopeBalances`, ~l.717 à 775), sans écraser ni réécrire le reste.
- Domaine : nouvelle fonction pure donnant, pour une enveloppe et un mois, allocation, part en espèces, allocation virtuelle, dépensé virtuel et dépensé espèces ; elle lit `monthAlloc`, `cashPart` et les transactions `env` du mois. `envelopeConsumption` n'est pas modifiée (le tableau de bord, 0027, l'utilise).
- Application : aucune action nouvelle.
- Infrastructure / Supabase : aucun changement.
- Présentation : `Budget.tsx` (tuile) et `app.css` (segment espèces, contour de dépassement) ; `EnvelopesTotal` et `AllocEditor` inchangés.
- Documentation : amendement de 0026 (RG26, D37 à D41, CA10b).

## Amendements aux specs liées

- 0026 : RG26, D37 à D41 et CA10b (tuile du Budget : solde virtuel en gros, « Espèces X » = solde espèces, barre sur le solde de départ) sont remplacés par la présente spec.
- 0037 : RG11/RG12 inchangées ; elles fournissent l'allocation espèces et l'allocation virtuelle.
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
- CA9. Given la ligne « alloué X » et l'éditeur d'allocation, Then ils fonctionnent comme avant, avec le refus sous la part en espèces. (Man)
- CA10. Given la tuile des enveloppes du tableau de bord, Then elle est inchangée. (Auto : tests existants de `envelopeConsumption`)
- CA11. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur : une barre de la largeur de l'allocation du mois, remplie par deux segments (dépensé virtuel puis dépensé espèces) ; teinte `is-cash` avec hachure ; libellé total, détail et soldes en infobulle ; dépassement mesuré sur le total, barre pleine, segments proportionnels, contour rouge et « dépassé de X € », l'espèces prise sur le report n'étant pas un dépassement ; tableau de bord (0027) inchangé.
