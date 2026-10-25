# 0017 — Sorties d'épargne et motifs

- Statut : brouillon prêt pour validation. Implémentation : APRÈS la livraison de la 0014 ; indépendante des 0015 et 0016.
- Date : 2026-10-23
- Branche prévue : feat/sorties_epargne_motifs

## Contexte et objectif

Demande du développeur : « Les sorties d'épargne ne peuvent pas être consignées (ex : sur les comptes épargne, je dois pouvoir mettre dépenses + sortie d'épargne avec un flag par exemple si cette sortie concerne une sortie spécifique comme Vacances Rome par exemple ou autre - une raison). »

Objectif : sur un compte d'épargne (ou d'investissement), consigner (1) des sorties d'épargne vers un autre de ses comptes et (2) des dépenses payées depuis ce compte, par saisie manuelle comme par import, chacune avec un motif optionnel (« Vacances Rome », « Travaux »…) choisi dans une liste réutilisable, puis retrouver les sorties par motif.

## État des lieux (vérifié dans le code et les specs)

- Le type de transaction `epa` (« Sortie épargne ») se saisit dans l'écran Dépenses, onglet Saisie, formulaire « Nouvelle dépense », chip « Sortie épargne ». Sa cible n'est PAS un compte bancaire mais une LIGNE `epa` du budget du mois (libellé « Compte d'épargne débité »), et l'argent est crédité au compte choisi dans « Reçu sur » (tout compte actif, sauf le compte dédié de la ligne, spec 0007 RG7). Champs : libellé, montant, ligne, compte. Aucun motif.
- Conséquences : une sortie ne se saisit que si le mois contient une ligne `epa` ; un compte de type épargne ou invest n'est débité que s'il est le « compte dédié » (`linkedAccountId`) d'une ligne (spec 0007) ; toute sortie crédite un compte de l'app (pas de sortie vers l'extérieur) ; les lignes `inv` n'ont pas de sortie saisissable.
- Les dépenses `var` et `env` acceptent déjà un compte payeur de type épargne (« Payé avec »), sans motif.
- Le budget compte les sorties `epa` (« − Sorties des comptes d'épargne », « Épargne réelle ») quand le compte récepteur est dans le budget (spec 0008 RG15/RG16).
- Spec 0013 : `AccountMovement` (retrait, transfert interne) est créé à l'import ; aucune création libre. À l'import, un débit d'un compte épargne reçoit une nature à choisir (Dépense, Retrait, Transfert interne, Transfert externe), sans motif.
- Il n'existe pas d'entité « objectif d'épargne » : les « objectifs » sont des cibles globales dans les réglages. `PlannedItem` ne concerne que les enveloppes.
- Deux façons d'enregistrer une même sortie réelle vers un compte propre existent donc (transaction `epa`, mouvement entre comptes) : risque de double compte si elle est saisie des deux façons.

## Périmètre

Inclus :
- Saisie manuelle, sur un compte épargne ou invest, de sorties vers un de mes comptes et de dépenses.
- Import : nature « Sortie d'épargne » avec destination et motif.
- Motifs : liste réutilisable (création, renommage, retrait de la liste et remise à la volée depuis le sélecteur ; un motif n'est jamais détruit).
- Affichage et filtre des écritures par motif ; cumul « Sorties par motif ».
- Règles mémorisées avec motif.
- Schéma : migration additive.

Exclus : « objectifs d'épargne » avec montant cible et progression, versements (entrées) sur un compte épargne, sortie externe sans ligne de budget (la dépense se rattache à une ligne `var` ou à une enveloppe), motif sur les écritures des autres comptes, double pointage (spec 0018), liaison des deux faces d'un virement (spec 0016), bilan annuel, revue comptes/objectifs.

## Règles de gestion

Saisie manuelle
- RG1. Le détail d'un compte de type épargne ou invest (écran Comptes) propose « Nouvelle opération sur ce compte » avec deux types : « Sortie vers un de mes comptes » et « Dépense depuis ce compte ». Cette entrée n'est pas proposée sur les autres types de compte.
- RG2. Sortie vers un de mes comptes : date (jour d'un mois ouvert, défaut aujourd'hui), montant positif, libellé facultatif, compte de destination (tout compte actif différent de la source : principal, Espèces, enveloppe, autre compte), motif facultatif. Elle débite le compte source et crédite la destination à sa date.
- RG3. Un seul enregistrement par sortie : si le compte source est le compte dédié d'une ligne `epa` du mois de la date, la sortie est enregistrée comme sortie d'épargne de cette ligne (transaction `epa`, mêmes effets sur le budget qu'aujourd'hui, refus du compte dédié comme destination, spec 0007 RG7) ; sinon comme mouvement entre comptes (spec 0013), SANS AUCUN effet sur l'épargne réelle du budget (le budget reste une estimation). Le mécanisme retenu est affiché avant l'enregistrement : « Comptée dans l'épargne réelle de la ligne <nom> » ou « Mouvement entre comptes, sans effet sur le budget ».
- RG4. Dépense depuis ce compte : montant, jour, libellé, ligne variable ou enveloppe de rattachement (règles existantes : réel d'une ligne `var`, enveloppe sur son propre compte, spec 0011 RG2/RG10), motif facultatif. Le compte payeur est le compte épargne.
- RG5. Dans l'écran Saisie, le formulaire « Nouvelle dépense » existant gagne le choix du motif, affiché quand le compte payeur (ou le compte reçevant d'une sortie d'épargne `epa`) est de type épargne ou invest, sans autre changement du formulaire.
- RG6. Les soldes du compte (écran Comptes, solde estimé) baissent à la date de l'écriture. Mois verrouillé ou clos : création et suppression refusées.
- RG7. Doublon : une écriture saisie ou importée de même compte, montant et jour qu'une sortie déjà enregistrée par l'autre mécanisme (transaction `epa` ou mouvement) est signalée « Semblable déjà enregistrée », sans bloquer ni décocher.

Motifs
- RG8. Un motif est un nom court choisi dans une liste réutilisable de l'utilisateur, créable à la volée dans le sélecteur, renommable. Deux motifs ne peuvent avoir le même nom (insensible à la casse et aux accents), motifs retirés compris (RG11a).
- RG9. Un motif ne s'applique qu'aux écritures d'un compte épargne ou invest : sorties vers un de mes comptes, dépenses depuis ce compte, et ces mêmes écritures importées. Une écriture porte au plus un motif.
- RG10. Le motif d'une écriture est modifiable ou retirable après coup, même sur un mois clos : il n'affecte aucun chiffre.
- RG11. Retrait d'un motif à la volée (décision du développeur : « le motif doit être conservé, il ne sera simplement plus applicable »). Depuis le sélecteur de motif lui-même (pas d'écran de gestion), chaque motif a une action « Retirer de la liste ». Elle bascule un booléen « visible » du motif à faux : le motif n'est plus proposé pour de NOUVELLES écritures, mais n'est JAMAIS détruit ni effacé des écritures existantes. Une écriture déjà étiquetée garde son motif et l'affiche ; le nom, la couleur et les totaux par motif restent. Le sélecteur propose « Afficher les motifs retirés », qui les liste (marque « retiré ») avec une action « Remettre dans la liste » qui rend le motif visible. Il n'y a pas de suppression définitive d'un motif. Ces actions ne modifient aucun solde ni aucun chiffre du budget.
- RG11a. Un motif retiré reste filtrable (filtre par motif du détail du compte et de l'écran Dépenses) et reste visible dans « Sorties par motif », avec la marque « retiré ». Son nom ne peut être réutilisé par un autre motif : créer à la volée un motif du même nom qu'un motif retiré (insensible à la casse et aux accents) le remet dans la liste (visible) au lieu d'en créer un second.

Affichage
- RG12. Le détail du compte affiche les opérations du mois avec leur motif (pastille) et un bloc « Sorties par motif » : pour chaque motif (retirés compris, marqués « retiré »), total des sorties et dépenses sur la période affichée (mois, année, tout) et nombre d'écritures ; « Sans motif » en dernier.
- RG13. Filtre par motif dans le détail du compte et dans la liste des écritures de l'écran Dépenses ; la recherche texte existante est inchangée.
- RG14. Les totaux par motif ne servent ni de solde, ni d'objectif ; ils n'entrent dans aucun calcul du budget.

Import (spec 0013)
- RG15. Dans l'aperçu, pour un débit d'un compte de type épargne ou invest, la nature « Sortie d'épargne » est proposée (sortie vers un de mes comptes) avec une destination et un motif, en plus de Dépense et Transfert externe. « Retrait » et « Transfert interne » restent pour les autres comptes. Le mécanisme (transaction `epa` ou mouvement) suit RG3.
- RG16. Le motif se choisit ligne par ligne dans l'aperçu (liste, création et suppression à la volée comme RG8 et RG11) et se mémorise dans une règle « libellé contient X → nature, destination, motif ». Une règle dont la destination n'existe plus ou est archivée n'est pas appliquée. Une règle dont le motif est retiré (RG11) reste appliquée pour la nature et la destination, mais le motif n'est pas prérempli (il n'est plus applicable) ; la ligne indique « motif retiré » et l'utilisateur peut en choisir un autre ou remettre le motif dans la liste.
- RG17. La déduplication, l'empreinte et le rang de la 0013 sont inchangés ; le motif n'entre pas dans l'empreinte.
- RG18. Les crédits correspondants (entrée du compte destination dans son propre export) restent traités par les specs 0013 (visibilité), 0015 et 0016 ; cette spec ne modifie ni leur qualification ni leur liaison. Le motif est porté par l'écriture créée à partir du débit.

Modèle et données
- RG19. Un motif est une entité de l'utilisateur (nom, couleur, visible : booléen, vrai par défaut). Les écritures le référencent par identifiant (champ facultatif). Les écritures sans motif et les données existantes sont inchangées.
- RG20. Toutes les nouvelles tables portent `user_id`, une clé primaire incluant `user_id` et une RLS « own rows » (spec 0012).

## Parcours utilisateur

Nominal (saisie) : détail du Livret A, « Nouvelle opération sur ce compte », « Sortie vers un de mes comptes », 600 €, destination Compte principal, motif « Vacances Rome » créé à la volée ; le Livret A baisse de 600 €, le principal augmente de 600 €, la sortie apparaît dans « Sorties par motif ».

Dépense depuis l'épargne : « Dépense depuis ce compte », 180 €, ligne variable « Loisirs », motif « Vacances Rome » : le Livret A baisse de 180 €, le réel de « Loisirs » monte de 180 €.

Import : le débit de 600 € du Livret A est proposé « Sortie d'épargne », destination Compte principal, motif « Vacances Rome » ; une règle mémorisée le préremplit la prochaine fois.

Ménage de la liste : dans le sélecteur de motif, « Retirer de la liste » sur « Cadeau 2025 » : il disparaît des propositions, ses écritures le gardent, il reste dans « Sorties par motif » avec la marque « retiré » ; « Afficher les motifs retirés » permet de le remettre.

Cas limites : sortie vers le compte dédié de la ligne (refus) ; montant nul ou négatif ; destination identique à la source ; compte archivé ; mois clos ; motif retiré ; même sortie déjà enregistrée par l'autre mécanisme (RG7) ; compte épargne sans ligne `epa` liée (mouvement, sans effet sur le budget) ; ligne `epa` liée absente du mois (mouvement).

## Design (proposé, à valider)

Réutiliser `organic.css`, les chips, la pastille de compte et le style du détail de compte.

Détail d'un compte épargne (écran Comptes) :
```
 Livret A  (épargne)                                   Solde estimé 4 800,00 €
 [ Nouvelle opération sur ce compte ]

 Opérations d'octobre            Motif : [Tous v]    Recherche [______]
 12/10  Sortie vers Compte principal       -600,00   [Vacances Rome]   mouvement
 18/10  Loisirs · Resto Rome                -180,00   [Vacances Rome]   dépense
 25/10  Versement épargne                   +300,00                      versement

 Sorties par motif                          (mois | année | tout)
  Vacances Rome      780,00 €   2 écritures
  Travaux            150,00 €   1 écriture
  Cadeau 2025         60,00 €   1 écriture  (retiré)
  Sans motif          40,00 €   1 écriture
```
Formulaire :
```
 Nouvelle opération sur Livret A
  Type     [ Sortie vers un de mes comptes ] [ Dépense depuis ce compte ]
  Date [12/10/2026]   Montant [600,00]   Libellé [Voyage Rome___]
  Vers     [ Compte principal ] [ Espèces ] [ Enveloppe Loisirs ] …      (chips avec pastille)
  Motif    [ Vacances Rome v ]
  Effet    « Mouvement entre comptes, sans effet sur le budget »
                                                     [Annuler] [Enregistrer]
```
Sélecteur de motif (liste déroulante) :
```
  ( ) Aucun motif
  ( ) Vacances Rome                 [Renommer] [Retirer de la liste]
  ( ) Travaux                       [Renommer] [Retirer de la liste]
  [+ Nouveau motif …]               ☐ Afficher les motifs retirés (2)
  (motifs retirés, si la case est cochée, en grisé :)
      Cadeau 2025  (retiré)         [Remettre dans la liste]
```
Aucune confirmation : l'action est réversible et ne détruit rien.
Aperçu d'import : la nature « Sortie d'épargne » affiche, sur la même ligne, la destination et le motif (sélecteur ci-dessus).

États : compte sans opération (« Aucune opération ce mois-ci »), formulaire en erreur (destination identique, mois clos), liste de motifs vide (« Aucun motif. Créez-en un à la saisie. »), motif retiré (grisé).

## Impact technique (quoi, pas comment)

- Domaine : entité `Purpose` (id, nom, couleur, visible) dans `BudgetData` (liste facultative) ; champ facultatif `purposeId` sur `Transaction` et `AccountMovement` ; fonctions pures : cumul par motif, filtre, choix du mécanisme (RG3), détection de « semblable déjà enregistrée » (RG7), retrait et remise d'un motif dans la liste (jamais de suppression). Aucun changement des calculs de solde ni du budget.
- Application : cas d'usage « sortie vers un de mes comptes » (transaction `epa` ou mouvement selon RG3, motif), « dépense depuis ce compte » (réutilise `addTransaction`), création de mouvement hors import (la 0013 la refusait dans le bloc de gestion : autorisée ici depuis le détail d'un compte épargne), gestion des motifs (créer, renommer, retirer de la liste, remettre dans la liste, réactivation par création du même nom), modification du motif d'une écriture ; import : nature « Sortie d'épargne », motif de ligne, règle mémorisée avec motif (`ImportNature`, `ImportRule`, `validateImport`, `prepareImport`).
- Infrastructure / schéma Supabase : NOUVELLE migration additive : table des motifs (`user_id`, id, nom, couleur, `visible` booléen vrai par défaut, unicité (user_id, nom normalisé), RLS « own rows ») ; colonne `purpose_id` nullable sur `transactions` et `account_movements` ; colonne de motif sur `import_rules` et, si la nature des règles est contrainte en base, élargissement du `check` ; `supabaseRows`, `database.types.ts`, test de contrat. La migration ne touche pas le `check` sur `transactions.type` (0014).
- Présentation : détail du compte (opérations, motif, « Sorties par motif », bouton et formulaire), sélecteur de motif partagé (écran Comptes, Saisie, aperçu d'import), liste des écritures de l'écran Dépenses (filtre, pastille).
- Impact sur ce qui existe : le formulaire « Sortie épargne » de l'écran Saisie et les sorties `epa` existantes restent valides, sans motif ; la nature de l'import et son aperçu gagnent « Sortie d'épargne ».
- Documentation : architecture (motifs ; deux mécanismes de sortie et règle RG3) ; ADR.

## Critères d'acceptation

(Auto = test automatisé ; Man = manuel.)

- CA1. Given un compte de type épargne, When j'ouvre son détail, Then « Nouvelle opération sur ce compte » est proposé ; Given un compte courant, Then il ne l'est pas. (Man)
- CA2. Given le Livret A à 5 000 € et une sortie de 600 € vers le Compte principal, When j'enregistre, Then le Livret A vaut 4 400 € et le principal augmente de 600 € à la date saisie. (Auto)
- CA3. Given un Livret A sans ligne `epa` liée, When j'enregistre cette sortie, Then un mouvement entre comptes est créé et l'épargne réelle du budget ne change pas. (Auto)
- CA4. Given un Livret A dédié d'une ligne `epa` du mois, When j'enregistre cette sortie, Then une sortie d'épargne de la ligne est créée (transaction `epa`) et l'épargne réelle baisse comme aujourd'hui, sans second enregistrement. (Auto)
- CA5. Given une destination identique à la source, un montant nul ou négatif, un compte archivé, le compte dédié de la ligne ou un mois clos, When j'enregistre, Then c'est refusé avec un message. (Auto)
- CA6. Given une dépense de 180 € depuis le Livret A rattachée à « Loisirs », Then le Livret A baisse de 180 € et le réel de « Loisirs » augmente de 180 €. (Auto)
- CA7. Given l'écran Saisie, When je choisis un compte payeur de type épargne, Then le choix du motif apparaît ; Given un compte courant, Then il n'apparaît pas. (Man)
- CA8. Given un motif « Vacances Rome » créé à la volée, Then il est proposé ensuite ; Given un nom identique à la casse et aux accents près, Then la création est refusée. (Auto)
- CA9. Given un motif, When je clique « Retirer de la liste » dans le sélecteur, Then il n'est plus proposé pour de nouvelles écritures, sans confirmation. (Auto)
- CA10. Given un motif retiré utilisé par 3 écritures, Then ces écritures gardent et affichent leur motif, il reste filtrable et visible dans « Sorties par motif » avec la marque « retiré », et aucun solde ni chiffre du budget ne change. (Auto)
- CA11. Given « Afficher les motifs retirés » coché, Then ils sont listés en grisé ; When je clique « Remettre dans la liste », Then le motif est de nouveau proposé. (Auto, Man)
- CA12. Given un motif retiré « Cadeau 2025 », When je crée à la volée un motif « cadeau 2025 », Then le motif retiré est remis dans la liste et aucun second motif n'est créé. (Auto)
- CA13. Given des écritures de motifs différents, Then « Sorties par motif » affiche total et nombre d'écritures par motif et « Sans motif » ; Given le filtre « Vacances Rome », Then seules ces écritures sont listées. (Auto sur le cumul, Man sur l'écran)
- CA14. Given un mois clos, When je change le motif d'une écriture, Then c'est accepté et aucun solde ne change ; Given la création ou la suppression d'une écriture, Then c'est refusé. (Auto)
- CA15. Given un débit d'un compte épargne dans l'aperçu d'import, Then la nature « Sortie d'épargne » avec destination et motif est proposée ; Given la validation, Then l'écriture est créée avec son motif (transaction `epa` ou mouvement selon RG3), dédupliquée comme les autres. (Auto)
- CA16. Given une règle mémorisée « VIREMENT ROME → Sortie d'épargne, Compte principal, Vacances Rome », Then elle préremplit nature, destination et motif ; Given un motif retiré, Then nature et destination sont préremplies, le motif ne l'est pas et la ligne indique « motif retiré » ; Given une destination archivée, Then la règle n'est pas appliquée. (Auto)
- CA17. Given une sortie déjà saisie en transaction `epa` puis le même débit importé (ou l'inverse), Then la seconde est signalée « Semblable déjà enregistrée » (même compte, montant, jour) sans bloquer. (Auto)
- CA18. Given la migration, Then la table des motifs (RLS « own rows »), les colonnes `purpose_id` et la colonne de motif des règles existent ; sauvegarder puis recharger redonne le même `BudgetData`. (Auto sur la conversion, Man sur la base)
- CA19. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décision du développeur sur la suppression : le motif est conservé, il n'est que retiré de la liste proposée (booléen « visible », RG11), sans onglet ni écran de gestion dédié.

Évolution possible, hors périmètre : un onglet de traçabilité des motifs (liste complète, historique, réactivation en masse).

Décisions du développeur intégrées : numérotation (0017 sorties d'épargne, double pointage en 0018) ; opérations (sortie vers un de mes comptes et dépense depuis ce compte) ; saisie par l'import et en manuel ; motifs en liste réutilisable avec suppression à la volée ; motif sur les écritures des comptes épargne et invest ; choix automatique du mécanisme (RG3) avec signal de doublon ; nature d'import « Sortie d'épargne » mémorisable, motif hors empreinte ; implémentation après la 0014, indépendante ; aucun effet sur l'épargne réelle pour un compte non lié à une ligne `epa`.
