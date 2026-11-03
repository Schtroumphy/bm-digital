# 0039 — Périodes budgétaires à dates fixes (soldes des comptes)

- Statut : en cours d'implémentation (2026-11-03) ; ADR 0032 écrit ; migration appliquée le 2026-11-03
- Date : 2026-11-03
- Branche prévue : feat/periodes_budgetaires_dates_fixes
- Dépend de : 0015 (date bancaire), 0019 (soldes réels et pointage), 0009 (pointage), 0007 (compte dédié), 0002 (comptes). Décision déjà prise avec le développeur : on retient les dates fixes (et non « afficher les opérations rattachées au mois »).

## Contexte et objectif

Un mois du budget est aujourd'hui une simple clé `AAAA-MM`. L'onglet Comptes calcule ses soldes sur le mois civil (1er au dernier jour), alors que le budget réel démarre vers le 29-30 du mois précédent (salaire et prélèvements de fin de mois rattachés au mois suivant, spec 0015). Résultat : le solde de fin « octobre » inclut des opérations du 1er au 31/10 alors que le budget d'octobre court du 29/09 au 29/10, ce qui est troublant et rend le solde de début/fin difficile à rapprocher du relevé bancaire.

Objectif : donner à chaque mois du budget une **période** (début et fin) contiguë aux autres. Les soldes et mouvements bancaires sont calculés sur cette période : solde de début + mouvements de la période = solde de fin.

Le rattachement budgétaire d'une écriture à un mois (`month`, spec 0015) reste un choix distinct de sa date bancaire (RG3 de la 0015 inchangée).

## Périmètre

Inclus :
- Une date de début du budget (premier mois), saisie une fois, qui sert aussi de date du solde de départ.
- Une date de fin par mois, éditable ; le début de chaque mois se déduit de la fin du précédent.
- Calcul des soldes et des mouvements bancaires (réels et estimés) sur la période : écran Comptes, solde estimé, détail d'un compte, solde de départ.
- Affichage de la période dans l'onglet Comptes et saisie des dates.
- Signalement « Hors période » des écritures datées avant le début du budget.
- Cohérence de l'import de relevés (avertissement de date, mois proposé) et du pointage (date de pointage dans la période).
- Migration Supabase additive, sans changement des soldes existants, testée sur la sauvegarde.

Exclus (restent au mois civil, hors de cette spec) :
- Chiffres du budget (réels des lignes, totaux, bilan, disponible à placer) : ils suivent toujours le mois de rattachement.
- Tableau de bord, objectifs (échéances), simulation, détermination du « mois en cours » d'après la date du jour.
- Modification en masse des dates de plusieurs mois, périodes pour les mois avant le premier mois (historique importé).

## Règles de gestion

Périodes
- RG1. Une **période** est un intervalle de dates inclusif `[début, fin]` associé à un mois du budget (clé `AAAA-MM`). Le mois n'est qu'un nom : « octobre » peut courir du 29/09 au 29/10.
- RG2. Le **début du premier mois** (`firstMonth`) est une date saisie, globale au budget (« Début du budget »). Absente, elle vaut le 1er jour du premier mois (comportement actuel).
- RG3. Chaque mois a une **date de fin** éditable. Le **début de tout mois suivant** est toujours le lendemain de la fin du mois précédent (non saisissable). Les périodes sont donc contiguës : sans trou, sans chevauchement.
- RG4. Bornes d'une date de fin : au plus tôt le début du mois (période d'au moins un jour) ; au plus tard la veille de la fin du mois suivant (le mois suivant garde au moins un jour). Valeurs hors bornes refusées avec un message clair. Le début du budget (RG2) est compris entre le 1er jour du mois civil précédant le premier mois et le dernier jour du premier mois.
- RG5. Un mois sans date de fin explicite reçoit une fin par défaut : le même numéro de jour que la fin du mois précédent, plafonné à la longueur du mois (29/10 donne 29/11, puis 29/12 ; 31/01 donne 28/02 ou 29/02 ; une fin au dernier jour du mois civil reste le dernier jour du mois civil). Cette fin par défaut est calculée, pas stockée : modifier la fin d'un mois déplace la fin par défaut des mois suivants sans date explicite. Elle reste modifiable ensuite (date explicite).
- RG6. Tant qu'aucune date n'est saisie (état actuel de toutes les données), chaque période est le mois civil : les soldes sont strictement identiques à ceux d'avant la fonctionnalité (CA9).
- RG7. Modifier le début du budget (RG2) ou la fin d'un mois (RG3) déplace des écritures d'un mois à l'autre dans les soldes. Aucune écriture n'est modifiée ni supprimée ; seule leur appartenance à une période change.
- RG8. Mois clos ou verrouillé (spec 0004/0010) : la date de fin d'un mois clos ou verrouillé n'est pas modifiable, ni celle du mois qui précède un mois clos ou verrouillé (cela déplacerait le début de ce dernier). Le début du budget n'est pas modifiable si le premier mois est clos ou verrouillé (extension de la même logique, à confirmer).

Soldes et mouvements
- RG9. Les mouvements bancaires d'un compte pour un mois (réels : dépenses, entrées d'argent, transferts sur leurs deux faces, ajustements ; estimés : pointages, contreparties, dépenses des lignes variables, enveloppes et épargne) sont ceux dont **la date est dans la période du mois**, au lieu d'être dans le mois civil. La règle s'applique à chaque date : date bancaire d'une écriture (`bankDate`), date de débit et de crédit d'un transfert, date d'un ajustement.
- RG10. Solde de fin d'un mois = solde de début + entrées − sorties de la période. Solde de début d'un mois = solde de fin du mois précédent (inchangé), sauf mois d'ouverture du compte et report ajusté d'une année clôturée (inchangés).
- RG11. Saisie manuelle : toute nouvelle écriture saisie à la main porte une **date réelle explicite** (obligatoire, dans la plage acceptée par les soldes) enregistrée comme date bancaire ; le couple mois + jour ne sert plus à dater une nouvelle écriture.
- RG11a. Écriture existante sans date bancaire (saisie manuelle ou ancien import) : sa date se déduit de son mois de rattachement et de son jour `day` (spec 0015, RG2). Quand ce numéro de jour existe deux fois dans la période (le 29 : 29/09 et 29/10), **règle de reprise minimale, à confirmer** : on prend la date la plus tardive de la période portant ce numéro (29/10). Le jour n'existe qu'une fois : cette date. Aucune donnée n'est réécrite à la migration ; l'écriture reste éditable pour fixer sa vraie date (qui devient sa date bancaire), et l'infobulle indique « date déduite du jour ».
- RG12. Solde de départ : « solde du compte à la date de début de la période de son mois de départ, avant les écritures de ce jour ». Pour un compte dont le mois de départ est le premier mois, cette date est le **début du budget** (RG2). Pour un compte ouvert plus tard, c'est le début de la période de son mois d'ouverture (qui découle de la fin du mois précédent). Le libellé affiche la date réelle (« Solde de départ, au 29/09 »).
- RG13. Un compte garde son mois d'ouverture (`openingMonth`) ; il n'a pas de date de départ propre.
- RG14. Changer le début du budget alors qu'un solde de départ est déjà saisi : le montant n'est pas modifié (il est maintenant réputé « au nouveau début »). Une confirmation explicite l'indique avant d'enregistrer ; le développeur resaisit lui-même les soldes s'il le souhaite.
- RG15. Le relevé saisi pour un compte et un mois (spec 0009, RG62) se compare au solde de fin de la période du mois (donc à la date de fin du mois).
- RG16. Report d'année clôturée (spec 0010) : le solde de report ajusté s'applique au début du premier mois de l'année suivante, c'est-à-dire à sa période (sa date de début) ; aucun changement de règle, seule la date du report suit la période.

Écritures hors période
- RG17. Une écriture dont la date est **avant le début du budget** (RG2) n'est comptée dans aucun solde. Elle est signalée « Hors période » (badge + infobulle donnant la raison et le début du budget) dans le détail d'un compte et dans les listes d'écritures. Elle garde sa vraie date et son rattachement.
- RG18. Une écriture rattachée à un mois mais datée dans la période d'un autre mois reste signalée comme aujourd'hui (listée en grisé, « rattachée à octobre », spec 0015, RG4) ; la comparaison porte maintenant sur la période et non sur le mois civil. Elle est comptée dans la période qui contient sa date.
- RG19. Le comportement « après la fin de la plage des soldes » (spec 0015, RG6a) est inchangé (la plage reste mesurée en mois, sa dernière période suit RG5).

Import de relevés
- RG20. L'avertissement d'aperçu « Date hors soldes » et le calcul des soldes partagent la même règle de bornes (comme en spec 0015, RG6a). La raison « Date avant le premier mois du budget » devient « Date avant le début du budget (jj/mm/aaaa) ».
- RG21. L'état « Mois différent de la date » (spec 0013) compare le mois de rattachement proposé à la **période contenant la date**, et non au mois civil de la date. Mois proposé par défaut : le mois dont la période contient la date (30/09 donne octobre). Une date hors de toute période (avant le début du budget) garde l'état « Date hors soldes » de l'import, sans badge « Hors période ».
- RG21a. Badge « Hors période » (RG17) : détail d'un compte et listes de l'écran Saisie.
- RG21b. Le « mois en cours » détecté d'après la date du jour reste le mois civil dans cette spec.

Pointage
- RG22. La date d'un pointage (`doneOn`) d'un mois doit être dans la période de ce mois (aujourd'hui : dans le mois civil, état « outside »). Le mouvement estimé du pointage garde cette date.

## Parcours utilisateur

Nominal 1, premier réglage : dans l'onglet Comptes (ou l'assistant), je saisis le début du budget « 29/09/2026 ». Le solde de départ du compte principal s'affiche « au 29/09 ». Je saisis la fin d'octobre « 29/10/2026 » : novembre démarre le 30/10.

Nominal 2, lecture : en choisissant octobre dans l'onglet Comptes, je lis « du 29/09 au 29/10 », un solde de début au 29/09, la liste des mouvements de cette période et un solde de fin au 29/10 égal à début + entrées − sorties.

Nominal 3, correction : je décale la fin d'octobre au 30/10 ; novembre démarre le 31/10 ; les soldes d'octobre et de novembre se recalculent.

Cas limites :
- Aucune date saisie : tout est comme avant (mois civil).
- Début du budget changé alors qu'un solde de départ existe : confirmation (RG14).
- Fin hors bornes (avant le début du mois, après la fin du mois suivant) : refusée, message.
- Mois clos ou verrouillé : fin non modifiable (RG8).
- Écriture du 27/09 alors que le budget débute le 29/09 : « Hors période », absente des soldes (RG17).
- Écriture du 30/09 rattachée à octobre : dans la période d'octobre (29/09-29/10), comptée dans octobre, sans mention « rattachée à un autre mois ».
- Salaire du 29/10 reçu le dernier jour de la période d'octobre : dans octobre ; le 30/10 : dans novembre.
- Compte ouvert en novembre : solde de départ au début de la période de novembre (30/10).
- Fin de mois à 29 février / 31 : règle par défaut RG5 (plafonnée à la longueur du mois).
- Saisie manuelle : la date réelle est obligatoire (RG11).

## Design

Aucune maquette existante ; design proposé, validé par le développeur. Réutiliser `organic.css` (`kpi-label`, `su-select`, `cpt-tip`, bandeaux `banner-text`, pastilles) et les composants de `Accounts.tsx` ; desktop 1440 px.

Onglet Comptes, en-tête du mois sélectionné :
```
 Octobre 2026                                   [ < ]  [ > ]
 Période : du 29/09/2026 (début du budget ✎)  au  [ 29/10/2026 ✎ ]   (i)
 ----------------------------------------------------------------
 Compte principal
   Solde de début (29/09)      1 240,00 €
   Entrées de la période        2 480,00 €
   Sorties de la période       -2 118,40 €
   Solde de fin (29/10)         1 601,60 €
 Mouvements du 29/09 au 29/10
   30 sept.  💸 Loyer                       -650,00   
   29 sept.  📥 Salaire         (rattaché à octobre)   +2 480,00
   27 sept.  💸 Courses          [Hors période]   -43,20   (grisé, hors des soldes)
```
- Le début d'un mois autre que le premier est en lecture seule (« = lendemain de la fin de septembre »). Pour le premier mois, le début est éditable (✎) avec l'infobulle « Date du solde de départ des comptes ouverts dès le début du budget ».
- La fin est un champ date (`input type="date"`) avec validation en ligne (RG4) ; désactivé et infobulle « Mois clos » quand RG8 s'applique.
- Libellés existants adaptés : « Solde de départ, au 1er octobre » devient « Solde de départ, au 29/09 » ; infobulle réécrite : « Solde du compte à la date de début de la période, avant toute écriture de ce jour. ».
- Badge « Hors période » : petite pastille grisée en tête de la ligne du détail (le principe des listes de la 0015 dit que l'information va dans l'infobulle ; ici le signalement visible est demandé par le développeur).
- Assistant de démarrage (`Setup.tsx`) : champ « Début du budget » facultatif sous le choix du premier mois (vide = 1er du mois).
- Confirmation de changement de début (RG14) : boîte « Les soldes de départ saisis seront désormais considérés au jj/mm. Continuer ? ».

États : vide (aucune date : période civile, affichée « du 01/10 au 31/10 »), chargé, erreur de saisie (fin hors bornes), mois clos (fin non modifiable), édition, écriture hors période.

## Impact technique

- Domaine : date de début du budget (`BudgetData`) et date de fin facultative par mois (`MonthData`) ; fonction unique « période d'un mois » (début, fin, contenance d'une date, mois contenant une date) dans un module dédié, utilisée par les soldes, l'import et le pointage ; `bankMovements.ts` (`realMovements`, `attachedMovements`, `estimatedMovements`, `transferMovements` : remplacent `startsWith(m)` et `slice(0,7)` par l'appartenance à la période) ; `ledger.ts` (`bankMonth`, `bankFlow`, solde de départ) ; `balanceRange.ts` (`isMonthInBalanceRange`, `balanceDateWarning`) ; `checkoff.ts` (état « outside » du pointage, ajustements annulés) ; `bank.ts` (date du solde de départ) ; `envelopeHistory.ts` (`upTo`) ; `lineExpenses.ts` / `bankDateOf` (repli de date des écritures sans date bancaire, RG11).
- Application : actions pour saisir le début du budget et la fin d'un mois (validation des bornes RG4, refus mois clos RG8, confirmation RG14) ; `statementImport.ts` (mois proposé, état `mois_different` dans `importFilters.ts`, raison de `balanceDateWarning`) ; `actions.ts` (édition d'une écriture : `bankDate` posé quand la date sort de la période) ; `loadBudget.ts`, `migrate.ts`.
- Infrastructure / schéma Supabase : migration additive, nullable, sans reprise de données : `settings.start_date date` (début du budget ; null = 1er du premier mois) et `months.end_date date` (fin du mois ; null = règle par défaut RG5). Conversion domaine ↔ lignes (`supabaseRows.ts`), `database.types.ts`, test de contrat du dépôt avec dates puis rechargement identique. Les mois existants gardent le mois civil sans qu'aucune valeur ne soit écrite (RG6). Mois clos : leur période n'est pas touchée par la migration.
- Procédure de migration et de restauration : (1) tester la migration sur une copie restaurée de `backups/2026-10-29/` ; (2) prendre une sauvegarde fraîche de la base réelle (même méthode que le dossier `backups/`) ; (3) n'appliquer sur la base réelle qu'avec l'accord explicite du développeur ; (4) en cas de problème, le développeur restaure la sauvegarde fraîche (la migration est additive : les deux colonnes peuvent aussi être supprimées sans perte). La procédure détaillée de restauration est consignée dans l'ADR / `docs/architecture.md` à l'implémentation.
- Test de la migration sur la sauvegarde `backups/2026-10-29/` (ignorée par Git) restaurée sur une base locale ou de test, jamais en premier sur la base réelle : soldes de chaque compte et chaque mois identiques avant/après migration (CA9, CA10) ; une sauvegarde fraîche est prise avant application en production (la reprise historique 2026 a été tentée puis abandonnée et rollbackée : voir la mémoire du projet, ne rien présumer de l'état de la base).
- Présentation : `Accounts.tsx` (période, solde de début/fin, badge « Hors période »), `Setup.tsx` (début du budget), `Expenses.tsx` (indication de rattachement et badge sur la date bancaire), `ImportRow.tsx` / `ImportWizard.tsx` (date et état « Mois différent de la date »).
- Documentation : `docs/architecture.md` et un ADR (à proposer après accord : « ADR 0032 — Périodes budgétaires à dates fixes »). Points qu'il consignerait : période = intervalle contigu défini par une fin par mois et un début global ; date bancaire contre période ; fin par défaut calculée plutôt que stockée ; migration additive sans reprise ; compatibilité avec le rattachement de la 0015.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given un début du budget au 29/09 et une fin d'octobre au 29/10, When je lis la période d'octobre, Then elle est « du 29/09 au 29/10 » et celle de novembre commence le 30/10. (Auto)
- CA2. Given ces périodes et une dépense du 30/09, When je calcule le solde réel d'octobre, Then elle y est comptée et pas dans le solde d'un éventuel mois précédent. (Auto)
- CA3. Given une écriture du 29/10 et une du 30/10, Then la première est dans octobre, la seconde dans novembre. (Auto)
- CA4. Given un compte, Then solde de début + entrées − sorties de la période = solde de fin, pour chaque mois, et le solde de début d'un mois = le solde de fin du précédent. (Auto)
- CA5. Given un transfert, un ajustement actif et une écriture avec date bancaire, Then chacun est rangé selon sa date dans la période (les deux faces d'un transfert selon leurs dates propres). (Auto)
- CA6. Given un compte du premier mois avec un solde de départ de 1 000 €, Then le solde de départ est « au 29/09 » et les écritures du 29/09 sont comptées après lui. (Auto)
- CA7. Given un compte ouvert en novembre, Then son solde de départ est à la date de début de novembre (30/10). (Auto)
- CA8. Given une écriture du 27/09 avec un budget débutant le 29/09, Then elle n'est comptée dans aucun solde, le badge « Hors période » et l'infobulle apparaissent dans le détail du compte, et elle garde sa date. (Auto sur le calcul et l'état, Man sur l'affichage)
- CA9. Given des données sans date de début ni de fin (état actuel), Then tous les soldes réels et estimés de tous les mois sont identiques à ceux calculés avant la fonctionnalité. (Auto)
- CA10. Given la sauvegarde `backups/2026-10-29/` migrée sur une base de test, Then les soldes de fin de chaque compte et chaque mois sont identiques avant et après, y compris les mois clos. (Man)
- CA11. Given une fin d'octobre hors bornes (avant le début du mois ou au-delà de la limite RG4), When je valide, Then c'est refusé avec un message et rien n'est enregistré. (Auto)
- CA12. Given un mois clos ou verrouillé, Then sa fin n'est pas modifiable, ni celle du mois qui le précède. (Auto)
- CA12a. Given un mois sans fin explicite après un mois finissant le 29/10, Then sa fin par défaut est le 29/11 ; Given une fin au 31/01, Then février finit le 28 (ou 29) ; Given une date explicite saisie ensuite, Then elle remplace la valeur par défaut. (Auto)
- CA12b. Given une saisie manuelle sans date, Then elle est refusée ; avec une date, elle est enregistrée comme date bancaire. (Auto)
- CA12c. Given une écriture existante sans date bancaire, jour 29, rattachée à octobre (29/09-29/10), Then sa date déduite est le 29/10, signalée « déduite du jour », et modifiable. (Auto) [règle à confirmer]
- CA12d. Given la liste de Saisie, Then une écriture avant le début du budget porte le badge « Hors période ». (Man)
- CA13. Given je décale la fin d'octobre du 29/10 au 30/10, Then novembre débute le 31/10, aucune écriture n'est modifiée et les soldes d'octobre et de novembre sont recalculés. (Auto)
- CA14. Given un solde de départ déjà saisi, When je change le début du budget, Then une confirmation est demandée ; annuler n'écrit rien ; confirmer garde le montant. (Auto sur la règle, Man sur le message)
- CA15. Given l'import d'une ligne du 30/09, Then le mois de rattachement proposé est octobre (période contenant la date) et l'état « Mois différent de la date » n'apparaît pas ; Given une ligne du 27/09, Then l'état « Date hors soldes » apparaît avec la raison « Date avant le début du budget (29/09/2026) », et la ligne reste importable. (Auto)
- CA16. Given le calcul des soldes et l'avertissement d'import pour une date juste dans ou juste hors du début du budget, Then ils sont d'accord (même règle). (Auto)
- CA17. Given le pointage d'une ligne d'octobre, Then sa date doit être dans la période d'octobre ; une date hors période est refusée. (Auto)
- CA18. Given un relevé saisi pour octobre, Then il se compare au solde de fin au 29/10. (Auto)
- CA19. Given le report ajusté d'une année clôturée, Then il s'applique au début de la période de janvier. (Auto)
- CA20. Given l'onglet Comptes, Then la période, le solde de début, le solde de fin, les libellés « Solde de départ, au 29/09 », le badge et les états (vide, erreur de saisie, mois clos) s'affichent comme dans le design validé. (Man)
- CA21. Given la migration, Then les colonnes de début et de fin sont acceptées, sauvegarder puis recharger redonne le même `BudgetData`. (Auto sur la conversion, Man sur la base)
- CA22. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune bloquante. Deux points à confirmer par le développeur à la validation de la spec :
- Règle de reprise des écritures existantes sans date bancaire dont le jour existe deux fois dans la période : date la plus tardive (RG11a). Il n'a pas choisi de règle.
- Début du budget non modifiable quand le premier mois est clos ou verrouillé (RG8) : extension proposée, non tranchée.

## Décisions du développeur (intégrées)

Design proposé validé ; fin par défaut = même jour que le mois précédent plafonné à la longueur du mois, modifiable ; saisie manuelle avec date explicite ; mois d'import = période contenant la date ; fin non modifiable pour un mois clos ou verrouillé et son précédent ; « mois en cours » civil (spec suivante) ; bornes RG4 ; soldes de départ conservés après confirmation ; badge « Hors période » dans le détail du compte et les listes de Saisie ; premier mois octobre 2026, début du budget 29/09/2026 ; ADR 0032 à proposer après validation et écrire sur accord explicite ; migration testée sur copie de la sauvegarde, sauvegarde fraîche avant la base réelle, rien appliqué sans accord, restauration par le développeur.

## Historique des questions posées (résolues)

1. Existe-t-il une maquette ou un design pour l'onglet Comptes et la saisie des dates ? Sinon, valides-tu la proposition de design ci-dessus (période sous le titre du mois, fin éditable dans l'onglet Comptes, début du budget dans l'assistant et l'onglet Comptes) ?
2. Fin par défaut d'un mois sans date saisie (ex. novembre quand tu n'as réglé que octobre) : (a) fin de mois civil, tu règles chaque mois à la main ; (b) même numéro de jour que la fin du mois précédent, plafonné à la longueur du mois (29/10 donne 29/11, puis 29/12), et « fin de mois civil » reste civil ; (c) comme (b) plus un bouton « appliquer à tous les mois suivants ». Recommandation : (b).
3. Écritures sans date bancaire (saisies à la main, anciens imports) rattachées à octobre avec un jour 29 : le 29 existe le 29/09 et le 29/10, deux dates dans la même période. Options : (a) la date la plus tardive de la période portant ce numéro (29/10) ; (b) la plus ancienne (29/09) ; (c) demander la date réelle à la saisie manuelle et garder (a) pour l'existant. Recommandation : (c).
4. À l'import, mois de rattachement proposé par défaut : (a) le mois dont la période contient la date (30/09 donne octobre) ; (b) le mois civil de la date, comme aujourd'hui. Recommandation : (a).
5. Mois clos ou verrouillé : (a) fin non modifiable pour le mois clos et pour celui qui le précède ; (b) modifiable avec avertissement que les soldes clos changent (comme la 0015, RG6). Recommandation : (a). Le mois de départ des comptes peut-il rester clos quand le début du budget change ?
6. Le « mois en cours » (détecté d'après la date du jour : tableau de bord, mois ouvert par défaut, pointage « aujourd'hui ») reste-t-il civil dans cette spec ? Le 31/10 serait alors encore octobre alors que novembre court du 30/10. Options : (a) civil pour l'instant, repoussé à une spec suivante ; (b) inclus ici. Recommandation : (a), pour livrer seule.
7. Bornes d'une date de fin (RG4) : validez-vous « de la fin du mois au plus tôt le début du mois, au plus tard la veille de la fin du mois suivant » ? Et pour le début du budget : toute date entre le 1er du mois civil précédant le premier mois et le dernier jour du premier mois ? Une date plus ancienne vous est-elle utile ?
8. Changement du début du budget avec soldes de départ déjà saisis : (a) montants conservés après confirmation ; (b) interdit une fois des écritures importées. Recommandation : (a). Les soldes de départ actuels des comptes du premier mois sont saisis « au 1er octobre » : faut-il saisir à nouveau « au 29/09 » après avoir posé le début ? (Ils changeraient, car des écritures du 29 et du 30/09 entreraient dans le budget.)
9. Où faut-il montrer le badge « Hors période » : détail du compte seulement, ou aussi les listes de l'écran Saisie et l'aperçu d'import (qui a déjà « Date hors soldes ») ? Recommandation : détail du compte et listes de Saisie, l'import gardant son état existant.
10. Premier mois : est-ce bien octobre 2026 (d'après l'exemple), avec septembre en historique ? Le début du 29/09 tombe donc dans un mois civil avant le premier mois : OK ?
11. ADR : confirmes-tu que je le propose (titre, contexte, décision, conséquences ci-dessus) dès la spec validée, pour écriture seulement après ton accord ?
12. Migration : acceptez-vous de la tester d'abord sur une copie de la sauvegarde `backups/2026-10-29/` puis de prendre une sauvegarde fraîche avant application sur la base réelle ? Quelqu'un d'autre que l'implementer restaure-t-il la sauvegarde ?
