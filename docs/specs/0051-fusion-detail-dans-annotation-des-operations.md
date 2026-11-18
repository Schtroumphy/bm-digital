# 0051 — Fusion du détail des écritures dans l'annotation de l'opération

- Statut : implémentée le 2026-11-18 (validée ; toutes les réponses du développeur intégrées le 2026-11-18)
- Date : 2026-11-18
- Branche prévue : refactor/fusion_detail_annotation
- Amende : 0020 (détail des écritures, à marquer « amendée par 0051 ») et 0047 RG5 (colonne CSV). Dépend de : 0047 (annotation portée par l'opération, implémentée).
- Specs voisines à marquer « obsolète, voir 0051 » : 0021 (détail à l'import), 0022 (détail des lignes du budget), 0023 (détail des enveloppes).

## Contexte et objectif

Une opération (dépense, entrée, mouvement entre comptes) porte aujourd'hui deux textes libres : le « détail » (spec 0020, 200 caractères, une ligne, sous le libellé) et l'« annotation » (spec 0047, 500 caractères, plusieurs lignes, ligne grise cliquable). Besoin du développeur : « Détails fait doublon à annotation ». Objectif : **un seul texte libre par opération, l'annotation**. Le texte du détail est copié dans l'annotation de la même opération, puis le détail disparaît (champ, colonnes, saisie, affichage).

Constats vérifiés dans le code et la base (2026-11-18) :
- Le détail ne subsiste que sur `Transaction.detail` et `AccountMovement.detail` (colonnes `transactions.detail` et `account_movements.detail`, migration 20261023181632). `budget_lines` n'a plus de colonne `detail` : la spec 0022 n'a plus de code. Aucun champ « détail » non plus sur les enveloppes (0023).
- L'import bancaire (`statementImport`, `statement`, `ImportRow`) ne lit ni n'écrit aucun détail : la spec 0021 n'est pas implémentée. Aucun impact import à prévoir, à part le retrait éventuel de ce qui la suppose.
- Données distantes : 26 transactions et 2 mouvements ont un détail (92 caractères maximum). Aucune opération n'a à la fois un détail et une annotation.
- `normalizeDetail` et `DETAIL_MAX` (`src/domain/detail.ts`) sont aussi utilisés par les notes du mois (`monthNotes.ts`, `MonthNotes.tsx`, limite 200). Ils ne disparaissent pas tels quels (voir RG12).

## Périmètre

Inclus :
- Migration des données : copie du détail dans l'annotation de la même opération, puis retrait des colonnes `detail`.
- Retrait du champ `detail` du modèle (`Transaction`, `AccountMovement`), des actions, de l'export, de la saisie et de l'affichage « sous le libellé ».
- Où se saisit et s'affiche désormais le texte libre à la création, à la modification et en lecture (RG6 à RG11).
- Mise à jour des specs 0020 et 0047 (renvois), ADR, architecture.

Exclus :
- Notes du mois (spec 0027) : inchangées, limite 200 conservée.
- Reprise du texte brut de la banque à l'import (0021) : non implémentée, hors périmètre ; si le développeur la veut un jour, elle alimentera l'annotation (nouvelle spec).
- Catégorie Linxo (`Transaction.category`) : distincte, inchangée.
- Changement des règles d'annotation de 0047 (500 caractères, plusieurs lignes, mois clos modifiable, rattachement aux lignes) : inchangées.

## Règles de gestion

Migration
- RG1. Pour chaque transaction et chaque mouvement ayant un détail non vide (après retrait des espaces), ce texte est copié dans son annotation. Aucun texte n'est reformulé ni tronqué.
- RG2. Opération sans annotation : son annotation devient son détail, à l'identique.
- RG3. Opération qui a déjà une annotation ET un détail (aucune aujourd'hui, mais la migration doit être sûre) : l'annotation devient « annotation, retour à la ligne, détail » (ordre validé par le développeur). L'annotation existante n'est jamais écrasée ni perdue.
- RG4. Limite : le détail (200) rentre toujours seul dans l'annotation (500). Si, dans le cas RG3, le texte concaténé dépasse 500 caractères, la migration ÉCHOUE en listant les cas (mois, famille, libellé, longueur), sans rien copier ni retirer et sans troncature, comme pour la migration de 0047 (RG13). Elle est relançable après correction à la main.
- RG5. Une fois la copie faite, les colonnes `transactions.detail` et `account_movements.detail` sont retirées (même migration, après export préalable des 28 textes, validé par le développeur). Les opérations sans détail ne sont pas touchées. La migration 20261023181632 et la migration 20261118120000 ne sont pas modifiées.

Application
- RG6. Création d'une opération (formulaire d'ajout de l'écran Opérations, y compris le transfert) : le champ « Détail » devient, au même endroit, un champ « Annotation » facultatif, une ligne, 500 caractères maximum (refusé au-delà, jamais tronqué), nettoyé des espaces (règle de 0047 RG2 pour le texte ; les retours à la ligne se saisissent via la modale de 0047).
- RG7. Modification d'une opération existante : le champ « Détail » du mode édition d'une dépense et d'un mouvement devient le champ « Annotation » (mêmes règles que RG6 ; vidé = annotation supprimée). Le crayon « Ajouter / Modifier le détail » à côté du libellé (0020, RG6) et l'ouverture de l'édition par clic sur le libellé disparaissent. L'annotation se modifie par les entrées de 0047 (ligne grise cliquable, action d'ajout discrète).
- RG8. Affichage sous le libellé : plus de seconde ligne « détail ». Seule subsiste la ligne grise d'annotation de 0047 (2 lignes visuelles, infobulle, clic pour modifier), qui reprend donc l'ancien détail. La ligne de rattachement grise (`attach`, ex. imputation d'un virement) reste inchangée. Sans annotation, aucune ligne supplémentaire n'est réservée.
- RG9. Recherche de l'écran Opérations : elle porte sur le libellé et l'annotation (placeholder « Rechercher un libellé ou une annotation »). Un texte autrefois dans le détail reste donc trouvable.
- RG10. Distinction à respecter : (i) les bulles « Détails » du Budget et de la vue annuelle sont un récapitulatif CALCULÉ des entrées derrière la somme affichée ; elles RESTENT. (ii) Le texte libre saisi par le développeur vit dans l'annotation. Conséquences :
  - Écran Comptes (détail d'un compte : lignes grises sous les opérations affectées et les virements) : plus aucun texte libre affiché, ni détail ni annotation. Le texte retiré de `bankMovements` et `assignedOperations` n'est pas remplacé.
  - Bulle « Détails » de la vue annuelle (`yearView`) : elle garde son récapitulatif (date, libellé, montant) et ne reprend plus aucun texte libre (ni détail ni annotation).
  - Bulle « Détails » d'une ligne du Budget (`lineActuals`) : elle reste. Aujourd'hui, pour chaque entrée, elle affiche « jour : ±montant », le libellé, puis le détail s'il existe. Après la fusion, elle affiche l'annotation de l'entrée à la place du détail, au même endroit et avec le même rendu (retours à la ligne conservés) ; sans annotation, rien sous le libellé. L'icône d'annotation du Budget (0047 RG10) est un autre affichage, inchangé.
- RG11. Export CSV des opérations : la colonne « Détail » est renommée « Annotation » et contient le texte de l'annotation. Cela amende 0047 RG5 pour ce point seulement (l'annotation reste sans effet sur les chiffres). Rien d'autre ne change dans l'export.
- RG12. Code partagé : la règle du détail d'écriture (`normalizeDetail` pour une opération, `applyDetail`, `setTransactionDetail`, `setAccountMovementDetail`, `matchesEntrySearch` à adapter à l'annotation, `DetailInput`) est retirée ; ce qui sert aux notes du mois (limite 200, trim) reste disponible sous un nom qui ne parle plus de détail d'écriture. Les notes du mois ne changent pas de comportement.
- RG13. Inchangés : l'empreinte et le rang d'une écriture importée (aucun lien avec le texte libre), tous les calculs (budget, réel, soldes), le verrou des mois (l'annotation reste modifiable en mois clos, 0047 RG6), les virements liés (chaque écriture garde sa propre annotation).
- RG14. Aucune perte pour les données déjà annotées : une opération annotée avant la migration garde son annotation à l'identique si elle n'avait pas de détail (RG3 sinon).

## Parcours utilisateur

- Nominal, après migration : « Pharmacie » avait le détail « Ordonnance du Dr Martin, mutuelle à demander ». Dans Opérations, ce texte apparaît désormais dans la ligne grise d'annotation (clic = modale d'édition de 0047). Rien n'apparaît plus comme « détail ».
- Coexistence (théorique) : une opération avec annotation « Acompte versé » et détail « Chèque n°12 » se retrouve avec « Acompte versé / Chèque n°12 » (deux lignes).
- Création : j'ajoute une dépense ; un champ « Annotation » facultatif est proposé dans le formulaire, à la place de « Détail ».
- Recherche : je cherche « mutuelle » : la dépense ci-dessus remonte (via l'annotation).
- Cas limites : détail de 200 caractères sans annotation : copié tel quel, bien sous 500 ; annotation de 400 + détail de 150 : 551 caractères, la migration échoue en listant le cas ; mois clos : l'annotation reste modifiable ; opération sans détail ni annotation : aucun changement visible.

## Design

Design proposé, à valider avec la spec (pas de maquette, confirmé par le développeur). Réutilise `AnnotationLine`, `useOperationAnnotation`, `AnnotationModal`, `text-input`, `field-w`, `field-label` et les tokens de `src/presentation/ds/organic.css`.

Formulaire d'ajout (champ remplacé à l'identique, même place) :
```
Libellé [ Pharmacie ]  Montant [ 23,40 ]  Type [..]  Cible [..]  Compte [..]
Annotation [ Ordonnance du Dr Martin, mutuelle à demander ] (facultatif, 500 max)  [Ajouter]
```
Champ sur une ligne, Entrée valide ; le texte multi-ligne se saisit ensuite via la modale d'annotation.

Liste (une seule ligne grise sous le libellé) :
```
[ ] 12  Pharmacie                         Variables · Santé     -23,40 €
        Ordonnance du Dr Martin, mutuelle à d…   (gris, annotation, cliquable, infobulle)
[ ] 14  Carrefour                         Variables · Courses   -61,10 €
        (aucune annotation : rien)  [+ annotation au survol]
```
Retraits visibles : crayon à côté du libellé, champ « Détail » du formulaire, du mode édition et du transfert, compteur « n/200 ».

États : sans annotation (rien, action discrète d'ajout), annotée (ligne grise), édition (modale 0047), erreur (> 500 : refusé, compteur en alerte, comme 0047), mois clos (identique).

## Impact technique

- Domaine : suppression de `detail` sur `Transaction` et `AccountMovement` (`types.ts`) ; `detail.ts` et `detail.test.ts` allégés ou renommés pour ne garder que ce qu'utilisent les notes du mois (RG12) ; `bankMovements`, `assignedOperations` (écran Comptes) et `yearView` n'exposent plus aucun texte libre ; `lineActuals` (`lineEntryDetails`) lit l'annotation de l'entrée au lieu du détail ; recherche (`matchesEntrySearch`) sur libellé + annotation.
- Application : retrait de `detail` des actions d'ajout (`addTransaction` et variantes, `updateTransaction`, `addManualTransfer`, `updateAccountMovement`), de `setTransactionDetail`, `setAccountMovementDetail`, et de la colonne de `transactionsCsv` (remplacée, RG11). Ces actions acceptent à la place l'annotation (500, normalisation de 0047, refus au-delà). Aucun port ni changement de contrat de dépôt autre que le retrait du champ.
- Infrastructure / Supabase : une migration (proposée : `20261118130000_merge_detail_into_annotation.sql`) qui copie le détail dans l'annotation selon RG1 à RG4 puis retire les deux colonnes ; destructive, sans retour arrière automatique, relançable seulement après un échec de RG4. Ordre au déploiement : migration, puis publication de l'application (l'ancienne version lit les colonnes retirées). Recommandation : exporter les 28 textes avant (déjà tracés : 26 transactions, 2 mouvements). `supabaseRows.ts` et `database.types.ts` mis à jour ; test de contrat du dépôt (`budgetRepository.contract.ts`) sans `detail`, annotation relue à l'identique. L'en-tête de la migration 20261118120000 dit « NON APPLIQUÉE » alors qu'elle l'est : à corriger dans la doc, pas dans le fichier SQL.
- Présentation : `Expenses.tsx` (formulaire, mode édition, transfert, `EntryLabel` sans crayon, recherche, export), `DetailInput.tsx` (retiré ou réutilisé pour le champ d'annotation), `Accounts.tsx` (texte libre retiré de la liste d'un compte), bulles « Détails » du Budget et de la vue annuelle (`DetailsBubble`, conservées), `app.css` (styles `detail-*`, `entry-detail` non-annotation, `entry-edit` retirés).
- Documentation : ADR 0042 « Détail fusionné dans l'annotation de l'opération » (renvoie à l'ADR 0041, note que `detail` n'est plus la convention de colonne évoquée) ; `docs/architecture.md` ; spec 0020 : bandeau « amendée par 0051 » et RG5 à RG11 marquées retirées ; spec 0047 : retirer la mention de 0022 comme coexistant (RG4, CA9) ; bandeau « obsolète, voir 0051 » sur les specs 0021, 0022, 0023.

## Critères d'acceptation

- CA1. Given une opération avec détail et sans annotation, When la migration s'exécute, Then son annotation est exactement son ancien détail et la colonne `detail` n'existe plus. (Auto pour la règle de copie ; migration vérifiée à la main sur une copie de la base)
- CA2. Given une opération avec une annotation et un détail, When la migration s'exécute, Then son annotation est l'annotation d'origine suivie d'un retour à la ligne et du détail (ordre de la question 3), rien de perdu. (Auto)
- CA3. Given un cas CA2 dont le texte concaténé dépasse 500 caractères, When la migration s'exécute, Then elle échoue en listant le cas, sans rien modifier. (Auto pour la règle, manuel pour la migration)
- CA4. Given une opération sans détail, When la migration s'exécute, Then son annotation (présente ou absente) est strictement inchangée. (Auto)
- CA5. Given des données migrées, When je sauvegarde puis recharge (Supabase), Then les annotations des transactions et des mouvements sont identiques et aucune propriété `detail` n'existe. (Auto, test de contrat)
- CA6. Given l'écran Opérations, When je regarde le formulaire d'ajout, le mode édition d'une dépense et d'un mouvement, Then aucun champ « Détail » n'existe. (Manuel)
- CA7. Given une ligne d'opération, When je la survole ou la focalise, Then aucun crayon « Ajouter / Modifier le détail » n'apparaît et le clic sur le libellé n'ouvre plus d'édition de détail. (Manuel)
- CA8. Given une opération ayant une annotation (ancien détail inclus), When j'affiche Opérations, Then une seule ligne grise sous le libellé montre l'annotation, cliquable pour la modifier ; sans annotation, aucune seconde ligne. (Manuel)
- CA9. Given une annotation contenant « mutuelle », When je saisis « mutuelle » dans la recherche, Then l'opération s'affiche ; Given un libellé contenant le mot, Then elle s'affiche aussi. (Auto)
- CA10. Given une opération annotée, When j'ouvre le détail d'un compte (écran Comptes), Then aucune ligne grise de texte libre ne figure sous les opérations et virements. (Auto pour la donnée exposée, manuel pour le rendu)
- CA10b. Given des entrées d'une ligne sur un an, When j'ouvre la bulle « Détails » de la vue annuelle, Then elle liste date, libellé et montant de chaque entrée, sans aucun texte libre. (Auto)
- CA10c. Given une ligne du Budget avec des entrées, When j'ouvre sa bulle « Détails », Then elle reste disponible avec ses entrées (jour, montant, libellé) ; sous le libellé de chaque entrée annotée figure son annotation (retours à la ligne conservés), rien pour une entrée sans annotation. (Auto)
- CA11. Given une sélection d'opérations annotées, When j'exporte en CSV, Then la colonne « Annotation » contient leur annotation et aucune colonne « Détail » n'existe. (Auto)
- CA12. Given une dépense importée dont j'ai modifié l'annotation, When je réimporte le même fichier, Then la ligne est reconnue « déjà importée » et l'annotation conservée. (Auto)
- CA13. Given un mois clos ou verrouillé, When je modifie l'annotation d'une opération, Then c'est enregistré et aucun chiffre ne bouge ; budget, réel, soldes et bilans sont identiques à ceux d'avant la fusion. (Auto)
- CA14. Given les notes du mois, When j'en ajoute une de 200 caractères puis une de 201, Then la première est acceptée et la seconde refusée comme avant. (Auto, test existant conservé)
- CA15. Given un virement lié, When j'annote l'une des deux écritures, Then l'autre garde sa propre annotation. (Auto)
- CA16. Given l'ensemble de la suite de tests, When je la lance, Then les tests du détail d'écriture (`entryDetail.test.ts`, parties de `detail.test.ts`) sont supprimés ou convertis en tests d'annotation, et la suite passe. (Auto)

## Questions ouvertes

Arbitrages du développeur (2026-11-18) : pas de maquette, design validé avec la spec ; champ « Annotation » à la place de « Détail » ; ordre annotation puis détail ; crayon et clic libellé supprimés ; recherche libellé + annotation ; Comptes et vue annuelle sans texte libre ; CSV « Annotation » ; colonnes retirées dans la même migration après export ; 0021, 0022, 0023 obsolètes, 0020 amendée.

Bulle « Détails » du Budget : elle affiche l'annotation de l'entrée à la place du détail (RG10). Aucune question ouverte.
