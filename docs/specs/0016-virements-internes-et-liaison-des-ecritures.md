# 0016 — Entrées d'argent : source externe ou virement interne, et liaison des deux faces

- Statut : implémentée (revue en attente) ; R1 à R6 et R8 à R12 tranchées, voir « Décisions ». Implémentée APRÈS la 0013, la 0014, la 0015 et la 0019 (amendement du 2026-10-23 ci-dessous).
- Date : 2026-10-23
- Branche prévue : feat/virements_internes_lies

## Contexte et objectif

Une entrée d'argent (crédit du fichier) a deux origines très différentes :
- Source externe : un salaire, un remboursement, une cagnotte. L'argent entre dans le patrimoine. C'est un revenu (spec 0015).
- Source interne : un virement depuis un autre de mes comptes. Le patrimoine ne change pas, l'argent change de compte. Ce n'est ni un revenu ni une dépense.

Aujourd'hui (0013 RG10c, RG36, RG62 ; 0015 RG15 à RG17) l'app ne fait que l'indiquer : un « virement en votre faveur » est un indice, jamais importé, et le mouvement entre comptes naît du seul débit de l'autre compte. Conséquences : la face crédit n'est pas tracée (on ne sait pas quelle ligne du fichier la représente), un virement dont l'autre compte n'est pas exporté ne peut pas être importé du côté crédit, et rien ne dit qu'un salaire (externe) et un virement entre mes comptes (interne) sont deux choses distinctes.

Objectif :
1. Qualifier chaque entrée : « Revenu » (source externe) ou « Virement interne » (source interne), modifiable ligne par ligne.
2. Relier les deux faces d'un virement interne (le débit du compte émetteur, le crédit du compte récepteur) et les importer comme UNE seule écriture : un mouvement entre comptes « virement interne », qui garde la trace des deux lignes du fichier.
3. Gérer le cas où une seule face est dans l'export, et la liaison tardive quand l'autre arrive à un import ultérieur.

Principe directeur : « le budget est une information ; les écritures et les comptes sont la réalité » (0014). Un virement interne ne touche jamais le budget (ni réel, ni revenus, ni dépensé).

## Périmètre

Inclus :
- Nature d'une entrée : « Revenu » (0015) ou « Virement interne » (nouvelle écriture à partir d'un crédit).
- Appariement d'un débit et d'un crédit en un seul mouvement entre comptes, avec trace des deux lignes (empreinte, rang, compte d'import, date de chaque face).
- Virement interne à une seule face (crédit seul avec compte source choisi ; débit seul comme aujourd'hui) et liaison tardive.
- Information « source » facultative d'un revenu (qui verse), pour tracer l'origine externe.
- Délier / relier à la main ; suppression d'un virement lié.
- Déduplication des deux faces ; règles mémorisées.
- Affichage de l'état de liaison (lié, une face).
- Schéma : migration additive.

Exclus : lien informatif d'un remboursement ou d'un avoir avec la dépense d'origine (spec ultérieure ; en attendant, ils sont des revenus, voir RG23), frais de virement (écart de montant entre les deux faces), virements d'un compte vers une ligne d'épargne `epa` (spec 0007), saisie manuelle libre d'un virement, double pointage et rapprochement budget ↔ réalité (spec 0018 prévue, anciennement citée comme 0016 puis 0017), bilan annuel, revue comptes/objectifs.

## État des lieux (vérifié)

- `AccountMovement` (0013, ADR 0011) : id, mois, jour, libellé, montant, compte source, compte destination, et facultatifs `importAccountId`, `fingerprint`, `rank`, `category`. Une seule empreinte : celle de la ligne qui l'a créé (le débit). Géré dans le bloc « Mouvements entre comptes de <mois> » (modification du libellé et du montant, suppression, mois verrouillé refusé).
- Les crédits de l'aperçu sont listés « Entrée d'argent », non cochables (0013, amendement 4). La 0015 les rend importables comme « Revenu » ou propose « Virement reçu » non importable.
- `bankMovements` lit les mouvements entre comptes dans les deux modes de mois et applique l'isolation des comptes hors budget (0009, RG92).

## Règles de gestion

Qualification d'une entrée
- RG1. Toute entrée d'argent importable a une nature : « Revenu » (source externe : rattachement à une ligne `rev`, spec 0015) ou « Virement interne » (source interne : un autre compte de l'app). La nature est modifiable ligne par ligne dans l'aperçu.
- RG2. Nature proposée : « Virement interne » (paire « À confirmer », RG6) quand l'entrée est appariée ou quand une règle mémorisée (RG20) le dit ; « Revenu » (décoché tant qu'aucune ligne de revenu n'est choisie, indice « virement possible » dans l'infobulle) quand le libellé ou les notes évoquent un virement mais qu'aucun appariement n'existe ; « Revenu » sinon. Le crédit d'un compte d'enveloppe est « Virement interne » depuis « Enveloppes (global) ». Aucune détection n'est définitive : l'utilisateur tranche.
- RG3. Un revenu a une « source » facultative (texte libre, prérempli avec le libellé court de la ligne, modifiable) enregistrée avec l'écriture. Elle ne sert qu'à tracer l'origine externe et à nourrir les règles ; elle n'entre ni dans l'empreinte ni dans un calcul.
- RG4. Un virement interne n'est jamais rattaché à une ligne de budget et ne modifie aucun réel, aucune allocation, aucun « Reste à sortir », aucun « Disponible à placer ». Seuls les soldes des deux comptes changent (comportement de la 0013, RG10b).

Appariement (les deux faces)
- RG5. Une « face » est une ligne du fichier : la face débit (montant négatif, compte émetteur) ou la face crédit (montant positif, compte récepteur). Un virement interne complet a deux faces, une seule écriture.
- RG6. Appariement proposé d'office dans l'aperçu, À CONFIRMER ligne à ligne (décoché par défaut, R3), entre un débit et un crédit quand l'une des deux lignes ressemble à un virement (débit « virement émis » ou déjà qualifié, crédit dont le libellé évoque un virement) et : même montant exact, comptes d'import résolus différents, dates à au plus N jours d'écart (N = 3, voir R1), les deux lignes non encore importées, et une seule correspondance possible de chaque côté. Plusieurs candidats pour une ligne (par exemple deux virements de 100 € le même jour) : aucun appariement automatique, les lignes portent l'indice « Appariement ambigu » et l'utilisateur relie à la main (RG9).
- RG7. Une paire proposée ou liée reste visible en DEUX lignes dans l'aperçu, l'une sous l'autre et reliées visuellement (accolade, même fond, pastille « Lié ») : la ligne débit du compte émetteur et la ligne crédit du compte récepteur, chacune avec sa date, son libellé, son montant et son compte. La paire a un état unique « À confirmer » (décochée par défaut) puis « Lié ». Les cases des deux lignes sont liées : cocher ou décocher l'une agit sur l'autre, et la paire n'est importée que si les deux sont cochées. Le mois de rattachement se règle une seule fois sur la paire. Le récapitulatif (RG21) la compte en UNE ligne.
- RG8. Les deux faces de la paire n'ont pas à être dans le même fichier : l'appariement se fait sur les lignes de l'aperçu, qui peut réunir plusieurs comptes (0013, RG32). Si l'une est dans un fichier et l'autre dans un fichier ultérieur, voir RG13.
- RG9. Relier / délier à la main : depuis une ligne débit, « Relier à une entrée » propose les crédits compatibles (comptes différents, même montant, tolérance de dates N) ; depuis une paire, « Délier » rend deux lignes indépendantes, à qualifier. Une ligne appariée est exclusive : un crédit ne se relie qu'à un seul débit.
- RG10. Écart de montant ou de comptes : jamais d'appariement automatique ni de liaison manuelle entre faces de montants différents (un frais ou une commission reste une dépense séparée, hors périmètre).

Écriture créée
- RG11. Une paire complète crée UN `AccountMovement` : source = compte émetteur, destination = compte récepteur, montant, libellé, mois de rattachement (choisi sur la paire, mêmes règles que la 0013, RG11 à RG13), et les deux traces : face débit (compte d'import, empreinte, rang, date bancaire) et face crédit (compte d'import, empreinte, rang, date bancaire). Un virement qui n'a qu'une face (RG12) n'a que sa trace.
- RG12. Virement interne à une seule face :
  - face débit seule : comportement actuel (0013, RG9 et RG10a) : l'utilisateur choisit le compte destination. L'écriture est « une face » ;
  - face crédit seule : nouveauté. L'utilisateur choisit le compte SOURCE (autre compte actif que le compte récepteur) ; l'écriture a pour source ce compte et pour destination le compte résolu de la ligne. Elle est « une face » (crédit).
  Un compte hors budget, un compte Espèces et un compte d'enveloppe sont acceptés comme l'autre compte (0013, RG10a ; isolation 0009 RG92 inchangée).
- RG13. Liaison tardive : quand l'autre face d'un mouvement « une face » arrive dans un import ultérieur, elle est proposée « Complète le virement du JJ/MM » si : mêmes comptes source et destination, même montant, dates à au plus N jours. À la validation, elle ne crée aucune écriture : elle AJOUTE sa trace (compte d'import, empreinte, rang, date bancaire) au mouvement existant, qui devient complet. Elle compte dans « liées », pas dans « importées ». Refus si le mois du mouvement est verrouillé ou clos (RG18).
- RG14. Dates : chaque face garde sa date bancaire (spec 0015). Le compte émetteur est débité à la date de la face débit, le compte récepteur crédité à la date de la face crédit. Une face absente reprend la date de l'autre. Le mouvement appartient à un seul mois de rattachement (budget) ; les soldes suivent la date bancaire de chaque face (0015, RG2).
- RG15. Libellé du mouvement : celui de la face débit, sinon de la face crédit ; modifiable après import (0013, RG10d). Les traces ne changent pas quand on modifie libellé ou montant à la main ; modifier le montant d'un virement complet est refusé (les deux faces du fichier ont ce montant) : il faut le délier ou le supprimer.

Déduplication
- RG16. Chaque face a sa propre clé de déduplication (compte d'import, empreinte, rang), avec le sens dans l'empreinte (0015, RG18). Une ligne dont la clé existe déjà comme trace d'une face (de n'importe quel mouvement, première ou seconde trace) est un « Doublon » décoché, comme une dépense. Une clé ne peut servir qu'une fois, toutes traces confondues.
- RG17. Réimport du même fichier : la paire déjà importée est reconnue (ses deux faces sont des doublons) ; une paire formée de deux lignes dont une seule a déjà été importée se présente comme « Complète le virement » (RG13).

Gestion après import
- RG18. Dans le bloc « Mouvements entre comptes de <mois> » (0013, RG10d), un virement interne affiche son état de liaison : « Lié » (deux traces, avec date et compte de chaque face) ou « Une face (débit | crédit) ». Mois verrouillé ou clos : modification, suppression et déliage refusés.
- RG19. Supprimer un virement lié supprime l'écriture ; ses deux clés de déduplication sont libérées, les deux lignes du fichier redeviennent importables. Délier un virement complet (depuis le bloc) retire la trace de la face choisie : l'écriture reste « une face » ; la ligne libérée redevient importable séparément.
- RG20. Règles mémorisées (0013, RG18 ; 0015, RG19) : une règle peut porter la nature « Virement interne » avec, pour un crédit, le compte source par défaut, et pour un débit le compte destination (comportement actuel). Une règle « Revenu » peut mémoriser la source (RG3). Une règle dont le compte n'existe plus ou est archivé n'est pas appliquée.

Affichage et cohérence
- RG21. Un virement interne n'est jamais compté comme dépense ni comme entrée de revenu dans les totaux du budget, de l'écran Dépenses et du récapitulatif. Le récapitulatif compte un virement interne complet en UNE ligne (et non deux), même si l'aperçu en montre deux, et distingue : revenus importés, virements internes (complets / une face), faces liées à un virement existant (RG13).
- RG22. Les comptes affichent un virement interne comme « <libellé> → <compte> (transfert) » (sortie) et « <libellé> depuis <compte> (transfert) » (entrée), « Supprimé » si le compte est inconnu, jamais comme « Revenu » ou « Dépense ». Un revenu s'affiche avec sa source externe.
- RG23. Remboursements et avoirs (« Avoir », remboursement de mutuelle, achat remboursé par un proche) : ce sont des entrées de source externe, donc des « Revenus » (0015) rattachés à une ligne `rev` et comptés comme tels. Le lien informatif avec la dépense d'origine (pour la tracer, sans effet sur les calculs) est renvoyé à une spec ultérieure (R4) ; en attendant, la source (RG3) peut le dire en texte libre.

Destination « Enveloppes (global) » (amendement du 2026-10-23, R8 à R12)
- RG24. « Enveloppes (global) » est un simple choix de destination dans l'import, pas un compte : aucun compte n'est créé, aucune ligne dans Comptes ni dans la clôture, aucun solde propre. Il est proposé dans le sélecteur « Vers » d'un débit (RG12), en plus des comptes réels.
- RG25. Un débit imputé « Enveloppes (global) » crée un `AccountMovement` « une face (débit) » dont la source est le compte résolu de la ligne (en pratique le principal) et dont la destination est « enveloppes » (mention « vers enveloppes », pas de compte destination). Il débite le compte source à la date bancaire de la ligne. Aucun compte récepteur n'est crédité. Il ne touche jamais le budget (RG4). La source peut être n'importe quel compte actif, hors compte d'enveloppe.
- RG26. Un débit « vers enveloppes » n'a pas de face crédit à apparier (RG6) ni à compléter (RG13) : le compte qui contient les enveloppes (ex. Lydia) n'est pas importé comme compte (R9). Il n'est jamais proposé comme « Appariement ambigu ».
- RG27. Les crédits individuels par enveloppe sont des lignes du fichier importé (R9) : une entrée dont le compte récepteur est un compte d'enveloppe est un virement interne « une face (crédit) » (RG12) dont la source est « Enveloppes (global) ». Elle crédite le compte de l'enveloppe à sa date bancaire, ne débite aucun compte réel (le principal l'a déjà été par le débit global, RG25) et ne modifie aucune allocation. Le compte d'enveloppe est la cible, jamais un compte courant (0011, RG2, inchangé).
- RG28. Le virement remplace l'allocation (R10) : pour un mois de rattachement donné, tant qu'au moins un débit « vers enveloppes » existe pour ce mois, `bankMovements` ne crée plus de mouvement d'allocation (0011, RG5/RG6) pour aucune enveloppe de ce mois, ni en mode réel ni en mode pointage. Le principal n'est donc débité qu'une fois. Les crédits des comptes d'enveloppe viennent alors des crédits importés (RG27). Si le dernier débit « vers enveloppes » du mois est supprimé, les mouvements d'allocation reviennent. L'allocation (montant du budget) n'est pas modifiée.
- RG29. Information indicative (R11) : à côté du débit « vers enveloppes », l'écran Saisie (bloc des transferts, pas l'aperçu d'import) affiche, une fois par mois, « Réparti : X € sur 300 € » (total mensuel) où X est la somme des crédits individuels (RG27) du même mois de rattachement. Information calculée, jamais saisie, sans compte ni solde ; aucun écart n'est corrigé ni bloquant.
- RG30. Le récapitulatif (RG21) compte « Enveloppes (global) » en une ligne distincte (« Virements vers enveloppes »). Les comptes affichent « Virement vers enveloppes » (sortie) pour le compte source (RG22).
- RG31. Règle mémorisée (R12) : un libellé peut mémoriser la destination « Enveloppes (global) » comme tout autre compte destination (RG20) ; elle n'est jamais « archivée ».
- RG32. Mois verrouillé ou clos : le débit « vers enveloppes » suit les règles de RG18 ; sa suppression ou son changement de destination est refusé, et RG28 reste inchangée.

## Amendement du 2026-10-23 : réconciliation avec la 0019 et écarts d'implémentation

Vocabulaire : un « mouvement entre comptes » est un « transfert » au sens de la 0019 (même `AccountMovement`, cible facultative `target`).

Réconciliations avec la 0019 :
- Isolation (RG4, CA16) : la 0019 (RG12) prévaut. Un virement interne est une écriture réelle : il débite et crédite ses deux comptes dans le solde réel ET dans le solde estimé, hors budget ou non. L'isolation de la 0009 (RG92) ne vaut que pour les contreparties fictives des pointages. CA16 devient : un virement vers un compte hors budget compte les deux faces dans les deux soldes. R7 (virement vers un compte `epa`) est résolue par la cible du transfert et la RG10 de la 0019 : un virement apparié dont le compte récepteur est celui d'une enveloppe ou d'une ligne `epa`/`inv` reçoit la cible par défaut de ce compte (`transferAttachment`), ce qui remplace la contrepartie fictive pointée.
- RG28 (le virement remplace l'allocation) : les allocations ne produisent plus aucun mouvement de solde réel (0019, RG1) ; la règle ne porte donc que sur le solde estimé. Les allocations pointées d'un mois sont des contreparties fictives (0019, RG6) ; un débit « vers enveloppes » les remplace toutes pour ce mois, comme si chacune avait un transfert rattaché (0019, RG10). Le principal est débité une seule fois, par le virement réel, dans les deux soldes. Les crédits individuels n'ont pas de cible. Le montant d'allocation du budget et le « Reste à sortir » ne changent pas.
- RG15 à RG17 de la 0015 (« Virement reçu » non importable) sont remplacées : la nature `recu` est le crédit d'un virement interne, importable.
- R7 de la 0019 (suppression des références à l'isolation) : faite par les deux points ci-dessus.

Écarts d'implémentation à valider :
- RG2 : un crédit dont le libellé évoque un virement et sans contrepartie reste proposé « Revenu » (décoché tant qu'aucune ligne de revenu n'est choisie), avec l'indice dans l'infobulle, comme avant ; il n'est pas basculé d'office en « Virement interne à confirmer ». Il devient « Virement interne » par appariement, règle mémorisée, crédit sur un compte d'enveloppe (source « Enveloppes (global) ») ou complément d'un mouvement existant.
- RG6 : l'appariement automatique exige en plus que l'une des deux lignes ressemble à un virement (débit « virement émis » ou déjà qualifié, crédit dont le libellé évoque un virement). Sans cela, une dépense et un salaire de même montant seraient reliés. La liaison manuelle (RG9) n'a pas cette condition.
- RG20 : la règle « Revenu » ne mémorise pas la source (RG3) ; seule la nature `recu` avec son compte source est mémorisable.
- RG21 / RG30 : le récapitulatif distingue revenus, virements internes (dont « liés »), virements vers enveloppes et lignes liées à un virement existant.
- RG22 : les comptes gardent le libellé « <libellé> → <compte> (transfert) » / « depuis <compte> (transfert) » de la 0019 (pas de relibellage « Virement vers / depuis »).
- RG29 : « Réparti : X sur Y » est affiché dans le bloc des transferts de l'écran Saisie, pas dans l'aperçu d'import (rien n'y est encore importé).
- RG31 : « Enveloppes (global) » est mémorisable comme destination d'une règle `interne` (cible compte `enveloppes`).
- Une face absente d'un mouvement né d'un crédit seul : ses champs plats (empreinte, rang, compte d'import) sont vides, la trace est dans `creditTrace`, et `bankDate` est la date du crédit (ADR 0020).
- Schéma : « Enveloppes (global) » est la valeur réservée `'enveloppes'` dans `from_account_id` / `to_account_id` (pas de colonne en plus, ADR 0021). Migration `20261023200904_internal_transfers.sql`.

## Parcours utilisateur

Nominal (virement complet) : je charge un export Linxo de deux comptes ; le virement de 300 € du compte principal vers le Livret (débit le 28/09, crédit le 29/09) apparaît comme UNE ligne « Virement interne Compte principal → Livret A », cochée ; le salaire de 2 480 € reste une entrée « Revenu » (0015), source « ACME » ; j'importe : un mouvement entre comptes lié et un revenu. Réimport : tout est « Doublon ».

Enveloppes (global) : depuis le principal, un débit de 300 € le 02/10 est importé avec « Vers : Enveloppes (global) » ; le principal baisse de 300 € ; aucune allocation de octobre n'est plus comptée (RG28). Les lignes qui créditent ensuite chaque compte d'enveloppe sont importées (Santé +50 €, etc.) et créditent chacune le compte de l'enveloppe. Le débit affiche « Réparti : 250 € sur 300 € » (RG29).

Cas limites :
- Débit « vers enveloppes » sans aucun crédit individuel importé : le principal est débité, les enveloppes ne sont pas créditées (R9) ; l'indication affiche « Réparti : 0 € sur 300 € ».
- Débit « vers enveloppes » supprimé : les allocations du mois reviennent (RG28).
- Virement vers un compte non exporté (Livret en « Ne pas importer ») : le débit seul, destination choisie → une face (débit) ; plus tard, si le Livret est exporté, son crédit est proposé « Complète le virement » (RG13).
- Crédit seul « Virement en votre faveur » d'un compte non exporté : nature Virement interne, source choisie → une face (crédit). Si l'utilisateur ne sait pas d'où il vient : « Revenu ».
- Deux virements de 100 € le même jour entre les mêmes comptes : appariement ambigu, relier à la main (RG6, RG9).
- Un faux appariement automatique : « Délier » (RG9).
- Un salaire ressemblant à un virement : proposé « à confirmer », requalifié « Revenu » par l'utilisateur ; la règle mémorisée évite de le refaire.
- Frais prélevés en plus du virement : montants différents, pas de liaison (RG10).
- Mois de rattachement clos ou verrouillé : ligne signalée (0013, RG12).
- Réimport d'un fichier couvrant une seule face (RG17).

## Design

Design proposé, à valider (aucune maquette). Réutiliser `organic.css`, les pastilles, les filtres et le groupement par compte de la 0013 (amendement 3).

Aperçu (suite de la 0015) : une paire = deux lignes reliées, une seule validation.
```
 ☐ ┌ 28 sept.  VIREMENT EMIS …              -300,00  [Compte principal]  Nature [Virement interne v]  Mois [sept. v]   [À confirmer · lié]  [Délier]
 ☐ └ 29 sept.  VIREMENT EN VOTRE FAVEUR …    +300,00  [Livret A]         (cases liées)                                      [À confirmer · lié]
 ☑ 28 sept.  VIREMENT SALAIRE ACME         +2 480,00  Nature [Revenu v]  Rattacher à [Salaire v]  Source [ACME ____]  Mois [oct. v]  [Date bancaire 28/09 · rattachée à octobre]
 ☐ 22 oct.   VIREMENT EN VOTRE FAVEUR cagnotte…  +1 600,00  Nature [Revenu v]  (choisir « Virement interne » pour indiquer le compte source « Depuis »)   [À rattacher]
 ☐ 30 sept.  VIREMENT EMIS …                   100,00  Nature [Virement interne v]  Vers [Livret A v]  [Appariement ambigu] [Relier à une entrée…]
Ligne « vers enveloppes » :
```
 ☐ 02 oct.   VIREMENT LYDIA                    -300,00  [Compte principal]  Nature [Virement interne v]  Vers [Enveloppes (global) v]  [Réparti : 250 € sur 300 €]
```
Sélecteur « Vers » (design proposé, à valider ; aucune maquette fournie ; recommandation R12 validée) :
```
 Vers [ v ]
   Comptes
     Livret A
     Espèces
     Lydia
   Enveloppes
     Enveloppes (global)   <- choix indicatif, pas un compte
```
Les comptes d'enveloppe individuels ne figurent pas dans cette liste (0011, RG2) ; seul « Enveloppes (global) » les représente. Pastille neutre pour ce choix (aucune teinte de compte).

Récapitulatif : `Virements internes   1 (complet)` (une ligne, pas deux) ; `Virements vers enveloppes   1`.
Filtre d'état : « Virement interne », « Lié », « Une face », « Appariement ambigu ».

Bloc « Mouvements entre comptes de <mois> » : une ligne par mouvement, avec « Lié · Débit 28/09 CA x1111, Crédit 29/09 Livret » ou « Une face (débit) », actions Modifier / Délier une face / Supprimer.

États : aperçu (paire, ambiguïté, une face, complète un virement), bloc de gestion (lié, une face, mois verrouillé), récapitulatif (revenus, virements complets, une face, liés à l'existant).

## Impact technique (quoi, pas comment)

- Domaine : `AccountMovement` gagne une seconde trace facultative (compte d'import, empreinte, rang, date bancaire de la face crédit) à côté de la première (face débit, ou face unique) ; fonction pure d'appariement (débits ↔ crédits, tolérance N, ambiguïté, exclusivité) ; fonction pure de liaison tardive ; nature « Virement interne » côté crédit (compte source) ; champ facultatif `source` sur l'écriture de revenu (0015). Les clés de déduplication d'un mouvement sont désormais jusqu'à deux.
- Application : `prepareImport` (appariement, deux lignes reliées à cases liées, états « Lié », « Une face », « Complète le virement », « Appariement ambigu », nature « Virement interne à confirmer »), `validateImport` (un mouvement par paire, trace ajoutée à un mouvement existant), cas d'usage relier / délier / supprimer, règles mémorisées étendues, déduplication sur les deux traces, interdiction de modifier le montant d'un virement complet.
- Infrastructure / schéma : NOUVELLE migration additive sur `account_movements` : colonnes de la seconde trace (`credit_import_account_id`, `credit_fingerprint`, `credit_rank`, `credit_bank_date`), à renseigner toutes ensemble ou aucune, avec unicité (user_id, credit_import_account_id, credit_fingerprint, credit_rank). L'unicité croisée entre la première et la seconde trace (une clé ne sert qu'une fois) est garantie par l'application, ou par un index d'expression à étudier par l'implémenteur ; `import_rules` (nature, compte source, source du revenu) ; `supabaseRows`, `database.types.ts`, test de contrat avec un virement lié. Aucune reprise de données : les mouvements existants sont des « une face (débit) ».
- Présentation : paire en deux lignes reliées dans l'aperçu, sélecteurs « Depuis / Vers », actions relier / délier, bloc de gestion des mouvements, récapitulatif.
- Impact sur le code des specs précédentes : remplace 0013 RG10c, RG36 et RG62 (le crédit d'un virement n'est plus « simplement ignoré »), ainsi que 0015 RG15 à RG17 (« Virement reçu » non importable) et la décision « jamais de double compte » : le double compte est évité par la liaison, pas par l'ignorance de la face crédit.
- « Enveloppes (global) » : `AccountMovement` accepte une destination « enveloppes » sans compte (et, côté crédit, une source « enveloppes » sans compte) ; `bankMovements` supprime les mouvements d'allocation d'un mois qui a un débit « vers enveloppes » (0011 RG5/RG6) ; fonction pure de total réparti (RG29) ; schéma : destination facultative et indicateur « enveloppes » dans la migration additive (colonne ou valeur réservée, au choix de l'implémenteur). Impact sur la 0011 : RG5/RG6 amendées par RG28 ; RG2 inchangée ; RG7 (« le total des comptes ne varie pas ») respectée : le débit global est une sortie du principal dont la contrepartie est créditée par les crédits individuels (RG27), un écart temporaire est possible.
- Documentation : architecture et ADR (appariement et seconde trace d'un mouvement entre comptes ; remplacement de « le crédit est ignoré »).

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given un débit de 300 € sur le compte A le 28/09 et un crédit de 300 € sur le compte B le 29/09, When j'ouvre l'aperçu, Then (l'une des deux lignes évoquant un virement) ils sont proposés comme deux lignes reliées, état « À confirmer » (chip « Lié »), décochées ; When je coche l'une, Then l'autre se coche ; When je les valide, Then la paire est « Liée ». (Auto)
- CA2. Given cette paire, When j'importe, Then un seul `AccountMovement` est créé (source A, destination B, 300 €) portant les deux traces ; aucun revenu ni dépense n'est créé. (Auto)
- CA3. Given ce mouvement, When je calcule les soldes, Then A baisse de 300 € le 28/09 et B monte de 300 € le 29/09 ; les réels, allocations et « Reste à sortir » ne changent pas. (Auto)
- CA4. Given deux montants différents (300 € et 299 €) ou deux lignes du même compte, Then aucun appariement automatique ni liaison manuelle n'est possible. (Auto)
- CA5. Given deux virements de 100 € le même jour entre les mêmes comptes, Then aucun appariement automatique, l'indice « Appariement ambigu » est affiché ; When je relie à la main, Then chaque crédit n'est relié qu'à un seul débit. (Auto)
- CA6. Given une paire, When je clique « Délier », Then deux lignes indépendantes réapparaissent, à qualifier. (Auto)
- CA7. Given un salaire (crédit sans contrepartie) qualifié « Revenu », Then il est rattaché à une ligne `rev` (0015) avec une source modifiable, et aucun mouvement entre comptes n'est créé. (Auto)
- CA7a. Given un crédit « Avoir » ou « Remboursement », When je le qualifie « Revenu » et le rattache à une ligne `rev`, Then il compte dans le réel de cette ligne comme tout revenu. (Auto)
- CA8. Given un crédit « virement » sans contrepartie, Then il est proposé « Revenu », décoché, avec l'indice « virement possible » ; When je choisis « Revenu » ou « Virement interne » avec un compte source, Then il devient importable. (Auto)
- CA9. Given un crédit seul avec compte source choisi, When j'importe, Then un mouvement « une face (crédit) » est créé : source = compte choisi, destination = compte de la ligne. (Auto)
- CA10. Given un mouvement « une face (débit) » existant, When j'importe plus tard le crédit correspondant (mêmes comptes, même montant, dates à ≤ 3 jours), Then il est proposé « Complète le virement », n'ajoute aucune écriture, et le mouvement devient complet. (Auto)
- CA11. Given un virement complet importé, When je réimporte les fichiers, Then les deux lignes sont des doublons décochés ; Given un virement dont une seule face a été importée, Then l'autre est proposée « Complète le virement ». (Auto)
- CA12. Given un crédit et un débit de même date, montant et libellé, Then leurs empreintes diffèrent (sens) et une clé ne peut servir deux fois, toutes traces confondues. (Auto)
- CA13. Given un virement lié, When je le supprime, Then l'écriture disparaît et les deux lignes redeviennent importables ; Given un mois verrouillé ou clos, Then suppression, déliage et modification sont refusés. (Auto)
- CA14. Given un virement complet, When je tente de modifier son montant, Then c'est refusé ; When je modifie son libellé, Then c'est accepté et les traces ne changent pas. (Auto)
- CA15. Given une règle « EN VOTRE FAVEUR cagnotte → Virement interne depuis Livret A », Then la nature et le compte source sont préremplis ; Given un compte archivé ou absent, Then la règle n'est pas appliquée. (Auto)
- CA16. Given un virement interne vers un compte hors budget, Then le compte principal n'est pas touché au sens de la spec 0009, RG92. (Auto)
- CA17. Given le récapitulatif, Then un virement interne complet y compte pour UNE ligne et il distingue revenus importés, virements internes complets, virements « une face » et faces liées à un virement existant. (Auto sur les compteurs, Man sur l'écran)
- CA18. Given l'aperçu, Then les deux lignes reliées d'une paire, les sélecteurs Depuis / Vers, les états et filtres s'affichent comme dans le wireframe. (Man)
- CA19. Given les comptes, Then un virement interne s'affiche « Virement vers / depuis <compte> », jamais comme revenu ou dépense. (Man)
- CA20. Given la migration, Then les colonnes de la seconde trace sont acceptées en base avec leur unicité, les mouvements existants restent valides, et sauvegarder puis recharger redonne le même `BudgetData`. (Auto sur la conversion, Man sur la base)
- CA22. Given un débit de 300 € du principal, When je le valide avec « Vers : Enveloppes (global) », Then un mouvement « une face (débit) » est créé (source principal, destination enveloppes), le principal baisse de 300 € à sa date, aucun compte n'est créé ni crédité, et le budget ne bouge pas. (Auto)
- CA23. Given ce mouvement pour octobre, Then aucun mouvement d'allocation d'octobre n'est calculé (mode réel et pointage), le principal n'est débité qu'une fois ; When je le supprime, Then les mouvements d'allocation reviennent. (Auto)
- CA24. Given un crédit dont le compte récepteur est un compte d'enveloppe, source « Enveloppes (global) », When j'importe, Then le compte de l'enveloppe est crédité, aucun compte réel n'est débité et l'allocation n'est pas modifiée. (Auto)
- CA25. Given un débit « vers enveloppes » et des crédits individuels de 250 € au total, Then « Réparti : 250 € sur 300 € » s'affiche, calculé et non éditable, sans écart bloquant. (Auto sur le calcul, Man sur l'écran)
- CA26. Given le sélecteur « Vers », Then « Enveloppes (global) » est proposé et aucun compte d'enveloppe individuel ne l'est ; il n'apparaît ni dans Comptes ni dans la clôture. (Man)
- CA27. Given un mois verrouillé ou clos, Then suppression et changement de destination du débit « vers enveloppes » sont refusés. (Auto)
- CA21. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Décisions du développeur

- R1. Tolérance de date entre les deux faces : 3 jours (RG6).
- R2. Une date bancaire par face (RG14).
- R3. Appariement proposé d'office mais à confirmer ligne à ligne : paire décochée, cases liées (RG6, RG7).
- R4. Lien informatif remboursement / avoir ↔ dépense : plus tard. Les remboursements et avoirs sont comptés comme revenus (RG23).
- R5. Liaison tardive incluse (RG13).
- R6. Cette spec garde le numéro 0016 ; le double pointage devient 0018 (la 0017 est « Sorties d'épargne et motifs » ; mentions renumérotées dans les specs 0013, 0014, 0015 et 0017).

## Question ouverte

- R8 (tranché par le développeur le 2026-10-23). « Enveloppes (global) » est un simple choix de destination, sans compte créé ; le débit du principal est tracé « vers enveloppes » (RG24, RG25).
- R9 (tranché). Les crédits individuels par enveloppe sont des lignes du fichier importé, rattachées à un compte d'enveloppe (RG27). Lydia n'est pas importé comme compte : le débit « vers enveloppes » reste une face unique (RG26) et les crédits d'enveloppe sont des lignes séparées.
- R10 (tranché). Le virement remplace l'allocation, mois par mois (RG28).
- R11 (tranché). « Réparti X sur 300 » : information calculée, somme des crédits individuels importés du mois, aucun compte ni solde créé (RG29).
- R12 (tranché, recommandations validées). « Enveloppes (global) » seul représente les enveloppes dans le sélecteur « Vers », sans ligne dans la clôture (RG24, RG26) ; mémorisable comme règle (RG31) ; un seul choix global, aucun réglage.
- R7. Virement interne vers un compte dédié à une ligne d'épargne `epa` (spec 0007). Une ligne `epa` pointée déplace déjà de l'argent du compte principal vers son compte dédié ; un virement importé vers ce même compte compterait le déplacement deux fois dans les soldes. Hors périmètre ici ; à traiter par une règle « ligne portée par ses écritures » comme pour `fix`/`cre` (0014) et `rev` (0015), dans une spec ultérieure. Option 1 (recommandée) : spec ultérieure, risque accepté d'ici là. Option 2 : l'inclure ici en retirant le mouvement propre de la ligne `epa` dès qu'un virement interne alimente son compte.
