# 0053 — Règles de catégorie par défaut

- Statut : proposée
- Date : 2026-11-18
- Branche prévue : feat/regles_de_categorie

## Contexte et objectif
Aujourd'hui, une dépense reste « Sans catégorie » tant que le développeur ne la classe pas à la main (spec 0046). Seule l'importation CSV présélectionne une catégorie, via la règle mémorisée « libellé contient X » (0046, RG14), et uniquement à l'import.

Objectif : dans le sous-onglet « Gérer » de l'écran « Catégories », définir des règles qui associent par défaut une catégorie à des dépenses reconnues par leur libellé, leur compte imputé ou leur ligne/enveloppe. Exemples : tout ce qui touche le compte Swile ou l'enveloppe « Courses » reçoit « Alimentation » ; tous les libellés contenant « assurance » reçoivent « Assurances ».

Ces « règles de catégorie » s'ajoutent aux règles d'import CSV existantes (elles gardent nature et cible, inchangées).

## Périmètre
Inclus :
- Liste ordonnée de règles de catégorie, gérée dans « Gérer » : ajout, modification, suppression, réordonnancement (flèches haut/bas).
- Application automatique à l'import CSV (présélection) et à la création manuelle d'une opération quand aucune catégorie n'est choisie.
- Bouton explicite « Appliquer aux opérations sans catégorie » (aperçu du nombre, confirmation).
- Compteur d'opérations correspondantes par règle.

Exclus :
- Critères montant et compte de la banque d'origine (`importAccountId`).
- Correspondance de libellé autre que « contient » (pas de « commence par », « égal », expression régulière).
- Désactivation temporaire d'une règle.
- Écrasement d'une catégorie existante, à tout moment.
- Réapplication silencieuse à l'édition d'une opération.
- Création d'une règle depuis une opération ou le tableau des opérations (spec suivante).
- Modification des règles d'import CSV existantes (nature, cible).

## Règles de gestion
Règle :
- RG1. Une règle de catégorie a : une catégorie cible (obligatoire) et un ou plusieurs critères parmi : (a) libellé contient un texte, (b) compte imputé (`accountId`), (c) ligne ou enveloppe (`target`, avec son type : ligne `var`/`fix`/`epd` par clé, enveloppe `env` par identifiant). Au moins un critère est obligatoire ; chaque critère n'est présent qu'une fois.
- RG2. Les critères d'une règle se cumulent (ET) : l'opération doit tous les satisfaire.
- RG3. Critère libellé : « contient », insensible à la casse et aux accents, sur le libellé de l'opération. Le texte est rogné, non vide, de 60 caractères au plus.
- RG4. Critère compte imputé : égal à `accountId` de l'opération. Une opération sans `accountId` est rattachée au compte principal (comportement existant), la règle suit cette même lecture.
- RG5. Critère ligne ou enveloppe : égal au couple (type, `target`) de l'opération.
- RG6. Une règle refusée si elle est identique (mêmes critères, même catégorie) à une règle existante, avec un message.

Ordre et priorité :
- RG7. Les règles sont ordonnées. Les flèches haut/bas modifient l'ordre ; la première règle qui correspond à une opération décide de sa catégorie, les suivantes sont ignorées pour elle.
- RG8. Une nouvelle règle est ajoutée en fin de liste.

Application :
- RG9. Types concernés : `var`, `env`, `fix`, `epd` uniquement (RG7 de 0046). Entrées (`rev`, `envin`, `accin`), sorties d'épargne `epa`, transferts et ajustements ne sont jamais catégorisés par règle. Les opérations hors budget ou affectées à l'épargne le sont (RG8 de 0046).
- RG10. Une règle ne remplit que les opérations « Sans catégorie » ; elle n'écrase jamais une catégorie existante, ni lors de l'import, ni à la création, ni par le bouton RG13. Aucune option d'écrasement.
- RG11. Création manuelle : quand l'opération est enregistrée sans catégorie choisie, la première règle correspondante lui donne sa catégorie. Le choix explicite « Sans catégorie » n'est pas distinguable de l'absence de choix : la règle s'applique aussi (voir questions ouvertes pour la validation du développeur si besoin). Pas de réapplication à l'édition d'une opération existante.
- RG12. Import CSV : la catégorie présélectionnée d'une ligne suit cet ordre : (1) la catégorie de la règle d'import mémorisée (0046, RG14), si elle en a une ; (2) sinon la première règle de catégorie correspondante ; (3) sinon « Sans catégorie ». Elle reste modifiable dans l'assistant. Choix proposé, à valider : la règle d'import, mémorisée explicitement par le développeur pour ce libellé, est plus précise et prime. Au moment du calcul, la ligne est évaluée avec son libellé, son compte imputé et sa cible tels que présélectionnés dans l'assistant (type déduit de la cible).
- RG13. Bouton « Appliquer aux opérations sans catégorie » : calcule les opérations catégorisables sans catégorie qui correspondent à une règle, affiche leur nombre (et le décompte des opérations d'un mois clôturé ignorées), puis demande confirmation. À la confirmation, chaque opération reçoit la catégorie de la première règle correspondante. Les mois clôturés sont ignorés (RG10 de 0046) ; le message final indique le nombre modifié et le nombre ignoré. Si aucune opération n'est concernée, le bouton est désactivé.
- RG14. Chaque règle affiche le nombre d'opérations actuellement « Sans catégorie » et catégorisables qui lui correspondent en tenant compte de la priorité (une opération n'est comptée que pour la première règle qui la capte), mois clôturés compris.

Cycle de vie :
- RG15. Supprimer une règle demande une confirmation et ne modifie aucune opération déjà catégorisée.
- RG16. Supprimer une catégorie supprime aussi ses règles de catégorie, après confirmation qui indique leur nombre. La suppression d'une catégorie reste soumise à RG5 de 0046 (aucune écriture associée) ; les règles ne comptent pas comme usage.
- RG17. Renommer une catégorie ne modifie pas ses règles (liaison par identifiant). Modifier une règle (critères, catégorie) ne change aucune opération existante.
- RG18. Si le compte ou la ligne/enveloppe visé par un critère disparaît, la règle est conservée, marquée « Critère introuvable » et ne correspond à aucune opération (aucune suppression automatique).
- RG19. Desktop 1440 px, textes en français, composants et tokens existants. Accessibilité : boutons nommés, flèches avec libellé (« Monter la règle »), ordre annoncé.

## Parcours utilisateur
Nominal :
1. Dans « Catégories › Gérer », section « Règles automatiques », le développeur clique « Ajouter une règle ».
2. Il renseigne « Compte imputé = Swile », choisit la catégorie « Alimentation », valide : la règle apparaît en fin de liste avec « 12 opérations ».
3. Il ajoute « Libellé contient assurance » → « Assurances ».
4. Il remonte une règle plus précise au-dessus d'une règle plus large avec les flèches.
5. Il clique « Appliquer aux opérations sans catégorie » : « 31 opérations seront catégorisées, 4 ignorées (mois clôturés) ». Il confirme.
6. Plus tard, une opération créée à la main sans catégorie reçoit « Alimentation » ; à l'import CSV, la ligne est présélectionnée.

Cas limites :
- Opération déjà catégorisée à la main : jamais modifiée.
- Opération qui correspond à deux règles : la première de la liste gagne.
- Règle d'import avec catégorie et règle de catégorie différente : la règle d'import prime (RG12).
- Critère sur un compte supprimé : règle marquée « Critère introuvable » (RG18).
- Doublon exact : refusé.
- Aucun critère ou aucune catégorie : refusé.
- Supprimer une catégorie : la confirmation annonce « 3 règles seront aussi supprimées ».
- Opération d'un mois clôturé : ignorée par le bouton (et comptée comme ignorée).

## Design
Design proposé, à valider (aucune maquette existante). Section « Règles automatiques » ajoutée sous la liste des catégories du sous-onglet « Gérer », avec cartes, boutons, champs, listes déroulantes et pastilles de `src/presentation/ds/organic.css` et `src/presentation/components/`.

```
Catégories › [ Répartition ] [ Gérer ]
 ... liste des catégories (existante) ...

┌─ Règles automatiques ─────────────────────────────────────────────┐
│ La première règle qui correspond décide. Ne remplace jamais une   │
│ catégorie déjà choisie.                                           │
│ [Ajouter une règle]        [Appliquer aux opérations sans catégorie (35)] │
│                                                                   │
│ 1 ▲▼  Compte = Swile                         → ● Alimentation     │
│        12 opérations              [Modifier] [Supprimer]          │
│ 2 ▲▼  Libellé contient « assurance »         → ● Assurances       │
│        3 opérations               [Modifier] [Supprimer]          │
│ 3 ▲▼  Enveloppe = Courses ET libellé « leclerc » → ● Alimentation │
│        0 opération                [Modifier] [Supprimer]          │
└───────────────────────────────────────────────────────────────────┘

Formulaire (ajout / édition, en ligne dans la carte) :
 Libellé contient [______]   Compte imputé [Tous ▾]
 Ligne ou enveloppe [Aucune ▾]   Catégorie [Choisir… ▾]
 [Enregistrer] [Annuler]    message d'erreur sous le champ concerné
```

États :
- Vide : « Aucune règle. Ajoute-en une pour catégoriser automatiquement tes dépenses. » ; bouton « Appliquer » masqué.
- Chargé : comme ci-dessus ; bouton « Appliquer » désactivé si 0 opération concernée.
- Erreur : aucun critère, aucune catégorie, doublon, texte trop long (message sous le formulaire) ; règle « Critère introuvable » en grisé avec avertissement.
- Édition : la ligne devient le formulaire ; Entrée enregistre, Échap annule.
- Confirmation : boîte « N opérations seront catégorisées, M ignorées (mois clôturés) » avec « Appliquer » et « Annuler » ; idem à la suppression d'une règle et d'une catégorie.

## Impact technique
Domaine : type `CategoryRule { id, categoryId, labelContains?, accountId?, target? (type + clé/id) }` et `BudgetData.categoryRules?` (ordonnée) ; fonctions pures : correspondance d'une règle, première règle correspondante, normalisation du libellé (comme l'import), validation (RG1, RG6), calcul des opérations concernées par règle (RG14) et par l'application groupée (RG13), suppression en cascade avec la catégorie (RG16).
Application : actions ajouter, modifier, supprimer, réordonner une règle ; appliquer aux opérations sans catégorie ; application à la création d'une opération et à la présélection de l'import (RG12) ; suppression de catégorie étendue. Aucun nouveau port.
Infrastructure : conversion lignes ↔ domaine étendue (`supabaseRows.ts`, `supabaseSchema.ts`, `database.types.ts`).
Présentation : section « Règles automatiques » dans `Categories.tsx` (sous-onglet « Gérer »), formulaire de saisie, assistant d'import (présélection).
Schéma Supabase : nouvelle table dédiée `category_rules` (id, category_id, position, label_contains, account_id, target_type, target_key, clés étrangères, politique d'accès comme les autres tables) et migration. Points à confirmer à l'implémentation : suppression en cascade côté base pour `category_id`, stockage de la position, gestion du critère « compte » ou « cible » supprimé (RG18), et nom du fichier de migration.

## Critères d'acceptation
Les cas marqués (T) seront couverts par un test automatisé (domaine ou application).
- CA1 (T). Given une règle sans critère ou sans catégorie, When je l'enregistre, Then c'est refusé ; Given un libellé vide ou de plus de 60 caractères, Then refusé ; Given une règle identique à une existante, Then refusée.
- CA2 (T). Given une règle « libellé contient assurance », When une dépense a pour libellé « ASSURANCE Habitation » ou « Assûrance », Then elle correspond ; When le libellé est « Mutuelle », Then non.
- CA3 (T). Given une règle « compte = Swile ET libellé contient leclerc », When une dépense Swile s'intitule « Leclerc », Then elle correspond ; When le compte est différent, Then non.
- CA4 (T). Given une règle sur l'enveloppe « Courses » (type `env`), When une dépense d'une autre enveloppe ou d'une ligne de même clé de type différent est évaluée, Then elle ne correspond pas.
- CA5 (T). Given deux règles qui correspondent, When je les inverse avec les flèches, Then c'est la première de la liste qui donne la catégorie.
- CA6 (T). Given une dépense `var` créée à la main sans catégorie et correspondant à une règle, When je l'enregistre, Then elle reçoit la catégorie de la règle ; Given une catégorie choisie à la main, Then elle est conservée.
- CA7 (T). Given une entrée `rev`, `envin`, `accin`, une sortie `epa` ou un transfert, When une règle correspondrait, Then aucune catégorie n'est posée ; Given une dépense hors budget ou affectée à l'épargne, Then la catégorie est posée.
- CA8 (T). Given une opération existante, When je la modifie (libellé, compte), Then sa catégorie ne change pas par règle.
- CA9 (T). Given une ligne d'import dont la règle d'import a une catégorie A et une règle de catégorie donne B, When j'ouvre l'assistant, Then A est présélectionnée ; Given la règle d'import sans catégorie, Then B est présélectionnée ; Given ni l'une ni l'autre, Then « Sans catégorie ». La catégorie reste modifiable et l'empreinte de la ligne est inchangée.
- CA10 (T). Given 10 opérations sans catégorie correspondantes dont 2 d'un mois clôturé et 1 déjà catégorisée à la main, When j'ouvre l'aperçu, Then il annonce 8 à catégoriser et 2 ignorées ; When je confirme, Then 8 reçoivent leur catégorie, les autres sont inchangées.
- CA11 (T). Given aucune opération concernée, When j'ouvre la section, Then le bouton « Appliquer » est désactivé.
- CA12 (T). Given deux règles qui captent la même opération, When je lis les compteurs, Then l'opération n'est comptée que pour la première.
- CA13 (T). Given une catégorie avec 3 règles, When je la supprime après confirmation indiquant « 3 règles », Then la catégorie et ses règles disparaissent ; Given une catégorie utilisée par une dépense, Then la suppression reste refusée (RG5 de 0046).
- CA14 (T). Given une catégorie renommée, When je consulte ses règles, Then elles pointent toujours vers elle.
- CA15 (T). Given une règle visant un compte supprimé, When je consulte la liste, Then elle est signalée « Critère introuvable », ne correspond à aucune opération et n'est pas supprimée.
- CA16 (T). Given des règles, When on recharge, Then leur ordre et leurs critères sont conservés (aller-retour du dépôt).
- CA17. Given l'écran « Catégories › Gérer » en 1440 px, Then la section est lisible, en français, états vide, chargé, erreur et édition conformes au design validé.

## Questions ouvertes
- Q1 (à valider, RG12). Priorité à l'import : la règle d'import avec catégorie prime sur la règle de catégorie. Alternative : la règle de catégorie prime, pour que « Gérer » ait le dernier mot.
- Q2 (à valider, RG11). À la création manuelle, un champ catégorie laissé sur « Sans catégorie » déclenche la règle (pas de distinction entre « pas de choix » et « choix explicite »).
- Q3 (à confirmer à l'implémentation). Points de schéma Supabase listés dans « Impact technique ».
