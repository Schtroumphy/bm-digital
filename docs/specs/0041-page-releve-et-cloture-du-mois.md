# 0041 — Page « Relevé » : soldes de fin de mois et clôture du mois

- Statut : implémentée (2026-11-03)
- Date : 2026-11-03
- Branche prévue : feat/page_releve_cloture_mois

## Contexte et objectif

Le développeur veut saisir, chaque mois, le solde de fin de mois de TOUS ses comptes (courants, épargne, investissement, enveloppes, hors budget), pour repérer vite où se trouve une erreur : tant que le solde de la banque n'est pas égal au solde réel de l'application, quelque chose manque ou est faux.

Décision structurante : cette page devient l'endroit où l'on clôture le mois. « Clôturer le mois » et « Rouvrir le mois » quittent l'écran Budget. La clôture est bloquée tant que chaque compte concerné n'a pas un relevé saisi dont l'écart avec le solde réel est nul (ou comblé par une régularisation).

Aujourd'hui, deux mécanismes de relevé coexistent :
- `MonthData.accountBalances` (spec 0009 RG62, spec 0019 RG4) : un relevé par compte bancaire et par mois, saisi dans la carte « Pointage par compte » de l'écran Budget, avec écart contre le solde réel et régularisation (`Adjustment`).
- `BudgetData.statements` (mois puis clé de ligne `epa`/`inv`) : saisi dans Opérations > onglet « Soldes ».

Cette spec les réunit sur `accountBalances` et remplace l'onglet « Soldes ».

## Périmètre

Inclus :
- Nouvelle page « Relevé » (entrée de la barre latérale), qui suit le sélecteur de mois global.
- Saisie, par compte, du solde relevé et de sa date ; affichage de l'écart ; régularisation de l'écart.
- Remplacement de l'onglet « Soldes » d'Opérations ; le raccourci du tableau de bord pointe vers la page.
- Nouveau motif de blocage de la clôture (relevé manquant ou en écart).
- Déplacement de « Clôturer le mois », « Rouvrir le mois » et du bandeau « Impossible de clôturer » de l'écran Budget vers la page Relevé.
- Conversion des relevés existants `statements` vers `accountBalances`.

Exclus :
- Aucun changement des règles de calcul du solde réel (spec 0019) ni de l'écart (relevé moins solde réel à la date du relevé).
- Aucun changement du « Disponible à placer » ni de l'ordre de clôture (spec 0005 RG27, RG35).
- Aucune issue de secours (« clôturer quand même »).
- La clôture d'année (écran « Clôture ») : inchangée.
- Aucune exemption des mois existants : le relevé est exigé pour tous les mois, y compris le mois de démarrage.

## Définitions

- Compte concerné par le relevé d'un mois `m` : un compte de `BudgetData.accounts` qui n'est pas le compte réservé `acc-cash` (RG5), dont `openingMonth` ≤ `m`, et qui n'est pas dans le cas « sans mouvement ni solde » ci-dessous. Types : courant (ou type absent), épargne, invest, enveloppe ; comptes hors budget inclus.
- Compte « sans mouvement ni solde » : solde réel de début nul, aucun mouvement réel dans la période du mois, donc solde réel de fin nul. Il n'est pas concerné par le blocage ; il reste saisissable.
- Période du mois : celle de la spec 0039 (début = lendemain de la fin du mois précédent, fin = `endDate` du mois ou valeur par défaut).
- Solde réel à la date du relevé : solde réel du compte à cette date, régularisations actives comprises (spec 0019).
- Écart : relevé moins solde réel à la date du relevé, arrondi au centime. Inchangé (`accountPointage().gap`).
- Relevé « en règle » d'un compte : relevé saisi ET écart exactement nul.
- Statuts d'un compte : « À saisir » (aucun relevé), « Écart » (relevé saisi, écart non nul), « Validé » (écart nul), « Régularisé » (écart nul, avec au moins une régularisation active dans la période), « Aucun mouvement » (non concerné).

## Règles de gestion

Page et saisie
- RG1. Une page « Relevé » est ajoutée à la barre latérale, juste après « Comptes ». Elle affiche le mois du sélecteur global.
- RG2. La page liste les comptes concernés (définition ci-dessus), groupés par type : Comptes courants, Épargne, Investissements, Enveloppes. Un compte hors budget y figure, avec une mention « hors budget ». Les comptes non concernés parce que sans mouvement ni solde sont listés en fin de groupe, estompés, statut « Aucun mouvement ».
- RG3. Compte archivé : il suit la même règle que les autres. Il est concerné s'il a un solde réel non nul ou un mouvement réel dans la période, sinon il n'est pas concerné (cas « sans mouvement ni solde »).
- RG4. Compte pas encore ouvert au mois affiché (`openingMonth` postérieur) : absent de la page et non concerné.
- RG5. Le compte réservé `acc-cash` (« Espèces ») n'est pas affiché ni exigé, conformément à l'ADR 0029 (« tout nouvel écran listant les comptes doit écarter `CASH_ACCOUNT_ID` »). Décision du développeur : Espèces est exclu.
- RG6. Pour chaque compte concerné, la ligne affiche : nom, début de mois (solde réel), entrées, sorties, solde réel attendu à la date du relevé, date du relevé, solde relevé (saisie), écart, statut. Le détail du compte (mouvements réels du mois) se déplie comme dans la carte « Pointage par compte », sans vues « Estimé ».
- RG7. Le solde relevé se saisit en place (montant, négatif accepté) ; vider la saisie supprime le relevé. La date du relevé est modifiable ; par défaut, c'est la fin de période du mois si elle n'est pas dans le futur, sinon la date du jour. La saisie reprend les règles existantes de `setAccountStatement` (date dans la période du mois, pas dans le futur, un relevé par compte et par mois, le nouveau remplace l'ancien).
- RG8. Le relevé n'entre dans aucun solde ; il n'est comparé qu'au solde réel (spec 0009 RG62, spec 0019 RG4).
- RG9. Régularisation : quand l'écart est non nul et le mois non verrouillé, l'action « Régulariser l'écart » crée une `Adjustment` datée du jour du relevé, du montant de l'écart (spec 0009 RG65). Elle compte dans le solde réel, donc ramène l'écart à 0. Elle est traçable, annulable (jamais supprimée), l'annuler fait revenir l'écart. Elle est proposée pour tous les types de compte, épargne et invest compris (amendement de la spec 0009 RG68), y compris pour un compte hors budget (amendement du 2026-11-03 : l'exception initiale bloquait la clôture sans issue ; une régularisation ne touche que le solde réel du compte, jamais le budget). Le bouton est direct, le montant n'est pas modifiable, une confirmation précède.
- RG10. Tolérance nulle : l'écart est « nul » seulement s'il vaut 0,00 € après arrondi au centime. Il n'y a ni seuil ni réglage.
- RG11. Compteur de la page : « n / total comptes en règle » (comptes concernés seulement). Mois clôturé ou année clôturée : tout est en lecture seule (saisie, date, régularisation, annulation de régularisation), comme aujourd'hui.

Clôture et réouverture
- RG12. « Clôturer le mois » et « Rouvrir le mois » sont déplacés sur la page Relevé et s'appliquent au seul mois affiché. L'écran Budget n'a plus aucune action de clôture ni de réouverture ; il n'affiche plus que l'état « Mois clôturé ».
- RG13. Nouveau motif de refus de la clôture : au moins un compte concerné sans relevé en règle. Il s'ajoute à `closeBlockers` à côté des motifs existants (mois précédent non clôturé, spec 0005 RG35 ; disponible ≠ 0, spec 0005 RG27). Les trois sont évalués ensemble et tous affichés.
- RG14. Aucun mois n'est exempté : le mois de démarrage et les mois existants sont soumis à la règle. Aucune issue de secours. La seule exception est le compte « sans mouvement ni solde » (définition).
- RG15. Le motif relevé dresse la liste des comptes en cause, chacun avec sa raison : « relevé à saisir » ou « écart de X € à régulariser ». Chaque compte de la liste est cliquable et fait défiler/surligne sa ligne dans le tableau.
- RG16. Le bandeau « Impossible de clôturer » complet (spec 0005 RG28) est affiché sur la page Relevé, avec les anciens textes inchangés pour « mois précédent » et « disponible » et le nouveau pour les relevés. Il s'affiche au clic sur « Clôturer le mois » (le bouton reste cliquable) et disparaît dès que plus aucun motif ne subsiste ou à la fermeture. Pour les motifs « disponible » et « mois précédent », le bandeau propose un lien vers l'écran Budget ou le mois précédent.
- RG17. Évaluation en direct : l'état des relevés est recalculé à chaque changement (nouvelle écriture, import, régularisation annulée, modification du relevé). Tant que le mois est ouvert, un compte qui sort de la règle fait revenir le motif de refus. Un mois déjà clôturé n'est jamais re-vérifié.
- RG18. La confirmation de clôture (spec 0005 RG29, « Clôturer {mois} ? Le mois deviendra en lecture seule. ») et le dialogue de régularisation des lignes en espèces (spec 0037 RG19, `CashReconcileDialog`, `closeMonthReconciling`) sont conservés, déplacés avec le bouton. Leur logique est inchangée.
- RG19. Après clôture, la page reste sur le mois clos en lecture seule, avec le bandeau « Ce mois est clôturé : il est en lecture seule » (réutiliser `banner is-locked`) et le bouton « Rouvrir le mois ». Les conditions de réouverture sont inchangées (spec 0005 RG34 : seul le dernier mois clôturé ; année clôturée à rouvrir par l'écran Clôture) et l'infobulle de blocage est conservée.
- RG20. Un mois non initialisé ou une année clôturée : la page affiche l'état (« Mois non initialisé » / mois verrouillé par l'année), sans bouton de clôture, comme aujourd'hui pour `MonthCloseControl`.

Navigation et tableau de bord
- RG21. L'onglet « Soldes » d'Opérations est supprimé. Le raccourci « soldes de compte à saisir » du tableau de bord ouvre la page Relevé sur le mois affiché.
- RG22. La tâche du tableau de bord « soldes de compte à saisir » compte désormais les comptes concernés sans relevé en règle (au lieu des lignes `epa`/`inv` sans solde) et en cite les noms. Libellé à ajuster : « relevé de compte à saisir ».

Données
- RG23. Un seul stockage : `MonthData.accountBalances` (un relevé par compte et par mois). `BudgetData.statements` n'est plus écrit ni lu pour les mois gérés.
- RG24. Conversion au chargement, pure et idempotente, sur le modèle de l'ADR 0031. Pour chaque mois à partir de `firstMonth`, chaque relevé de ligne `epa`/`inv` de `statements` devient un relevé du compte dédié de la ligne (`linkedAccountId`), de même montant, daté de la fin de période du mois (ou du jour si elle est future). Cas :
  - un `accountBalances` existe déjà pour ce compte et ce mois : on le garde, le relevé de ligne est abandonné ;
  - plusieurs lignes du mois partagent le même compte dédié : ambiguïté, aucun relevé converti pour ce compte ;
  - la ligne n'a pas de compte dédié : rien à convertir.
  Les relevés non convertibles sont comptés et signalés par un bandeau unique affiché une fois (« N soldes de lignes d'épargne n'ont pas pu être repris ; saisis le relevé du compte »). Les mois antérieurs à `firstMonth` gardent leurs `statements` comme historique en lecture seule : le Ledger les lit encore pour la chaîne de départ.
- RG25. Le Ledger (`acc`, lignes `epa`/`inv`) lit désormais le relevé du compte dédié (`accountBalances`) à la place de `statements[m][key]` pour les mois gérés.

Carte « Pointage par compte »
- RG26. La carte « Pointage par compte » de l'écran Budget n'est plus un point de saisie du relevé : elle affiche le relevé, la date et l'écart en lecture seule, sans « Régulariser l'écart » ni annulation de régularisation, et propose un lien vers la page Relevé du mois affiché. Les autres éléments de la carte (Reste à sortir, solde estimé, marge, détail) sont inchangés.

## Parcours utilisateur

Nominal : fin octobre, j'ouvre « Relevé ». Pour chaque compte j'entre le solde que montre ma banque. Les comptes qui collent passent à « Validé ». Le Livret A affiche un écart de 12,40 € : j'ouvre le détail, je repère une écriture oubliée, je l'ajoute dans Saisie ; l'écart passe à 0 (ou j'appuie sur « Régulariser l'écart » si je ne retrouve pas la cause ; le statut devient « Régularisé »). Le compteur affiche 7 / 7. Je clique sur « Clôturer le mois », je confirme, le mois est en lecture seule.

Cas limites :
- Je clique sur « Clôturer le mois » avec 2 comptes sans relevé : bandeau « Impossible de clôturer » listant les 2 comptes.
- Je clôture, puis je constate une erreur : « Rouvrir le mois » sur la page, je corrige, je reclôture.
- J'ajoute une écriture après avoir saisi le relevé : l'écart réapparaît, la clôture est de nouveau refusée.
- Compte ouvert en cours d'année : absent des mois précédents.
- Compte archivé avec un solde : il reste exigé (RG3).
- Compte d'enveloppe : exigé comme les autres (son solde réel est le solde de l'enveloppe).
- Régularisation annulée : l'écart revient, le statut repasse à « Écart ».
- Mois précédent non clôturé et relevés manquants : les deux motifs s'affichent.
- Relevé daté dans le futur : refusé par la saisie.
- Mois ou année verrouillés : lecture seule.

## Design

Maquette : `design/project/Budget Perso (standalone).html` ne contient pas la page « Relevé » (aucune occurrence repérable dans le fichier, qui est un bundle compressé). `design/HANDOFF.md` ne la décrit pas. Seul `design/chats/chat1.md` (ligne 346) décrit l'ancien onglet « Soldes des comptes » : tableau par compte avec courbe sur 6 mois, début, versé, sorties, solde attendu, solde relevé saisi, écart, statut (Validé / À vérifier / À saisir) et compteur « x / 10 validés ». Le développeur pensait disposer d'une maquette, mais le fichier indiqué n'en contient pas. Le design ci-dessous est donc un **Design proposé, provisoire** : le développeur peut le remplacer par sa propre maquette, auquel cas cette section et les critères d'affichage (Man) seront mis à jour.

Composants réutilisés : la grille `acc-grid acc-cols` et `EditableAmount` de l'onglet « Soldes » (`Expenses.tsx`), le panneau `panel-lg` par groupe, `Spark`, la pastille de statut `pill`, le détail déplié et la régularisation de `PointageCard`, les boutons `btn-outline` et `btn-dark`, `banner` et `banner is-locked`, `month-closed`.

```
 Relevé · Octobre 2026                      [ Mois clôturé ] [ Rouvrir le mois ]   (ou [ Clôturer le mois ])
 Saisis le solde de chaque compte tel que ta banque le montre. Le mois ne se clôture que lorsque tous les écarts sont à 0.   [ 5 / 7 en règle ]

 ┌ Impossible de clôturer Octobre 2026 ───────────────────────────────────── ✕ ┐
 │ • Livret A : écart de 12,40 € à régulariser    • PEA : relevé à saisir       │
 │ • Il reste 30,00 € à placer (…)   • Clôture d'abord Septembre 2026.          │
 └──────────────────────────────────────────────────────────────────────────────┘

 Comptes courants
 Compte        6 mois  Début    + Entrées  − Sorties  = Réel au 31/10  Date relevé  Solde relevé  Écart     Statut
 Principal     ▁▂▃     2 140,30   2 480,00  2 939,70      1 680,60      31/10       1 680,60     —        [Validé]
 Joint (hors budget) …                                                                                      [Régularisé]
 Épargne
 Livret A      ▁▁▂     5 000,00    300,00      0,00       5 300,00      31/10       5 312,40     +12,40   [Écart] [Régulariser l'écart]
 Investissements
 PEA           ▂▃▃     …                                                  31/10      Saisir…       —       [À saisir]
 Enveloppes
 Loisirs       …                                                                                                [Validé]
 Aucun mouvement : Compte fermé (archivé)                                                                       [Aucun mouvement]
```

États : mois non initialisé ; mois chargé avec relevés manquants ; écarts ; tout en règle (bouton de clôture actif visuellement, il reste cliquable) ; mois clôturé en lecture seule ; année clôturée ; aucun compte concerné (compteur 0 / 0, la clôture n'est bloquée par aucun relevé). Mois dont la fin de période est future : la date proposée est celle du jour.

Écran Budget : à la place des deux boutons, seule la pastille « Mois clôturé » (si clos) est conservée.

## Impact technique

Domaine
- Nouvelle fonction pure donnant, pour un mois, les comptes concernés et le statut de relevé de chacun (réutilise `accountPointage` : `statement`, `gap`, `real`).
- Nouveau motif dans `closeBlockers` / `CloseBlocker` (`application/monthClosing.ts`) : comptes en défaut avec leur raison.
- Ledger : lecture de `accountBalances` pour la chaîne des lignes `epa`/`inv` (RG25) ; `statements` conservé uniquement pour l'historique avant `firstMonth`.
- `dashboard.ts` : `balancesToEnter` calculé sur les comptes (RG22).

Application
- `setStatement` (relevé par ligne) et son usage disparaissent ; `setAccountStatement`, `createAdjustment`, `cancelAdjustment` sont réutilisés tels quels (la restriction « pas de régularisation pour l'épargne », RG68 de la spec 0009, est levée dans la règle, le code n'y est pas bloqué).
- Conversion `statements` vers `accountBalances` au chargement (RG24), appelée par `loadBudget`, qui enregistre si elle a changé quelque chose (ADR 0031).
- `closeMonthReconciling`, `closeBlockersAfterReconcile` (`application/cash.ts`) : logique inchangée. Constat : elle appelle `closeBlockers`, donc le nouveau motif s'applique tout seul. La régularisation des lignes en espèces ajoute des dépenses « Reste non saisi » sans débiter de compte (spec 0037 RG7) : elle ne change aucun solde réel, donc aucun écart. Pas de contradiction constatée. Le point à surveiller : la clôture « tout ou rien » ne doit pas créer ces dépenses si le nouveau motif de refus subsiste.

Infrastructure et schéma Supabase
- Aucune nouvelle table ni colonne : `account_balances` (mois, compte, montant, date de saisie) existe déjà.
- `account_statements` n'est plus alimentée pour les mois gérés ; la table et les lignes historiques restent en base, sans migration SQL ni suppression (additif, comme `pointage_start`). La conversion se fait côté client (ADR 0031) ; à vérifier à l'implémentation : le diff d'enregistrement doit supprimer les lignes `account_statements` converties ou les laisser, sans les relire en double.
- Mettre à jour `supabaseRows.ts` et le test de contrat si le comportement de lecture de `statements` change.

Présentation
- Nouvel écran « Relevé » (`Screen` = `releve`) et entrée de la barre latérale.
- `Budget.tsx` : retrait de `MonthCloseControl`, du bandeau de refus et des props `closeAttempt` / `onDismissClose` ; `App.tsx` : retrait de l'état `closeAttempt` et de l'onglet `soldes` d'Opérations. Le contrôle de clôture, `CashReconcileDialog` et le bandeau déménagent vers la page Relevé.
- Carte « Pointage par compte » de l'écran Budget : le relevé, son écart et la régularisation y sont affichés en lecture seule (plus de saisie, plus de « Régulariser l'écart »), avec un lien « Saisir le relevé » vers la page Relevé (RG26).
- Tableau de bord : raccourci et libellé (RG21, RG22).

Documentation
- Amendement de la spec 0005 (RG27 à RG35 : action déplacée sur la page Relevé, motif ajouté), de la 0009 (RG68), de la 0037 (RG19 : dialogue déplacé), de l'ADR 0004 (indicateur de clôture : l'indicateur est inchangé, l'endroit de l'action change). ADR rédigées : [0033](../adr/0033-cloture-du-mois-sur-la-page-releve.md) (déplacement de l'action de clôture) et [0034](../adr/0034-releve-unique-par-compte-et-abandon-des-releves-de-ligne.md) (relevé unique).

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given un mois avec un compte courant sans relevé, When je demande la clôture, Then elle est refusée et le motif nomme ce compte (« relevé à saisir »). (Auto)
- CA2. Given un relevé de 1 000,00 € et un solde réel de 1 000,00 € à la date du relevé, Then l'écart vaut 0 et le statut est « Validé ». (Auto)
- CA3. Given un écart de 0,01 €, Then le statut est « Écart » et la clôture est refusée (tolérance nulle). (Auto)
- CA4. Given un écart de 12,40 € comblé par une régularisation de 12,40 €, Then l'écart vaut 0, le statut est « Régularisé » et la clôture n'est plus bloquée par ce compte. (Auto)
- CA5. Given cette régularisation annulée, Then l'écart revient, le statut repasse à « Écart » et la clôture est de nouveau refusée. (Auto)
- CA6. Given un compte sans mouvement dans la période, avec un solde réel de début et de fin nuls, Then il n'est pas concerné et ne bloque pas la clôture. (Auto)
- CA7. Given un compte dont `openingMonth` est postérieur au mois, Then il est absent de la page et ne bloque pas. (Auto)
- CA8. Given des comptes de type épargne, invest, enveloppe et hors budget, Then chacun est concerné et bloque s'il n'est pas en règle. (Auto)
- CA9. Given le compte réservé `acc-cash`, Then il n'apparaît pas et ne bloque jamais. (Auto)
- CA10. Given un compte archivé avec un solde non nul, Then il est concerné ; Given un archivé sans solde ni mouvement, Then il ne l'est pas. (Auto)
- CA11. Given le mois de démarrage et un mois sans relevé, Then ils sont soumis à la règle comme tout autre mois. (Auto)
- CA12. Given un mois entièrement en règle, un mois précédent clos et un disponible à 0, When je clique sur « Clôturer le mois » et je confirme, Then le mois est clos et la page reste affichée en lecture seule avec « Rouvrir le mois ». (Auto sur le domaine, Man sur l'écran)
- CA13. Given plusieurs motifs (mois précédent non clos, disponible ≠ 0, relevé manquant), When je demande la clôture, Then le bandeau affiche tous les motifs, les textes « mois précédent » et « disponible » inchangés. (Auto sur le domaine, Man sur l'écran)
- CA14. Given un mois en règle, When j'ajoute une écriture qui change le solde réel avant la clôture, Then l'écart réapparaît et la clôture est refusée. (Auto)
- CA15. Given un mois clôturé, Then la saisie du relevé, de sa date, la régularisation et son annulation sont refusées. (Auto)
- CA16. Given un mois clos, When je clique sur « Rouvrir le mois », Then les règles de la spec 0005 RG34 s'appliquent (dernier mois clos seulement, infobulle sinon). (Auto)
- CA17. Given l'écran Budget, Then il n'affiche ni « Clôturer le mois », ni « Rouvrir le mois », ni le bandeau « Impossible de clôturer » ; il affiche « Mois clôturé » si le mois est clos. (Man)
- CA18. Given Opérations, Then l'onglet « Soldes » n'existe plus ; When j'appuie sur la tâche « relevé de compte à saisir » du tableau de bord, Then la page Relevé s'ouvre sur le mois affiché. (Man)
- CA19. Given la tâche du tableau de bord, Then elle cite les comptes concernés sans relevé en règle. (Auto)
- CA20. Given un relevé de ligne `epa` avec un compte dédié et sans relevé de compte pour le mois, When les données se chargent, Then un relevé du compte existe, de même montant, daté de la fin de période, et `statements` n'est plus lu pour ce mois. (Auto)
- CA21. Given un `accountBalances` déjà présent, ou plusieurs lignes sur le même compte dédié, ou une ligne sans compte dédié, Then le relevé existant est gardé, ou rien n'est converti, et le bandeau unique indique le nombre de relevés non repris, une seule fois. (Auto, Man)
- CA22. Given la conversion déjà appliquée, When je recharge, Then rien ne change (idempotence) et sauvegarder puis recharger redonne le même `BudgetData`. (Auto)
- CA23. Given le Ledger, Then le solde d'une ligne `epa`/`inv` à compte dédié lit le relevé du compte. (Auto)
- CA24. Given une clôture avec lignes en espèces à régulariser (spec 0037 RG19) et un relevé manquant, When je valide le dialogue, Then rien n'est créé et la clôture est refusée (tout ou rien). (Auto)
- CA25. Given la carte « Pointage par compte » du Budget, Then le relevé et l'écart y sont affichés mais non modifiables, aucune régularisation n'y est proposée, et le lien ouvre la page Relevé sur le mois affiché. (Man)
- CA27. Given un compte hors budget en écart, Then « Régulariser l'écart » n'est pas proposé et la clôture reste refusée ; Given un compte du budget en écart, Then il l'est. (Auto)
- CA26. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur intégrées : Espèces exclu (ADR 0029) ; carte « Pointage par compte » en lecture seule avec lien vers la page ; archivés, clôture sur le seul mois affiché, entrée de barre latérale, date par défaut et liens du bandeau validés ; conversion de `statements` acceptée, y compris l'abandon des relevés non convertibles avec bandeau unique et le maintien de `statements` avant `firstMonth`.
