# 0028 — Opérations affectées à un compte d'épargne (hors budget)

- Statut : validée par le développeur (toutes les questions tranchées)
- Date : 2026-10-27
- Branche prévue : feat/operations_affectees_epargne

## Contexte et objectif

Octobre 2026 : les travaux (achats Leroy Merlin / Brico Dépôt, artisan, bon d'achat, 200 € en espèces) et les entrées qui les financent (remboursements Leroy Merlin, déblocages de prêt) sont enregistrés sur le compte principal (et Espèces) dans des lignes du budget (Imprévus, « Remboursement compte joint », lignes de revenu). Ils faussent le budget réel du mois. Le développeur veut les sortir du budget et les rattacher au compte « LDDS Travaux » pour pouvoir les relire ensuite, SANS modifier les opérations bancaires (compte, date, montant).

Aujourd'hui c'est impossible : une opération ne sort du budget que si SON COMPTE est « hors budget » (`isTransactionInBudget` = `isAccountInBudget(t.accountId)`, specs 0002 RG17/RG18, 0009 RG92/RG110), donc « l'associer à un autre compte » et « la sortir du budget » sont une seule et même chose, et changer son compte fausserait les soldes réels.

Objectif : une opération peut être **affectée** à un compte d'épargne (ici LDDS Travaux) sans changer son compte bancaire. Une opération affectée sort des chiffres du budget, apparaît dans le détail du compte d'épargne, et reste intacte dans les soldes du compte où elle a eu lieu.

Vocabulaire : le mot « imputation » est déjà utilisé dans l'app pour la ligne ou l'enveloppe d'une opération (colonne « Imputation » de l'export, `imputation` des mouvements de compte). Cette spec parle donc d'**affectation** à un compte (à valider, question 1).

## État des lieux (vérifié dans le code et les specs)

- Exclusion du budget : `isTransactionInBudget` (`bank.ts`) ne regarde que le compte de l'opération. Utilisée par `monthSummary` (`budget.ts`, dépensé enveloppes et sorties d'épargne) et par `ledger.ts` (dépensé des enveloppes).
- Le réel d'une ligne est dérivé de ses écritures (spec 0019 RG19/RG20, ADR 0019) : `lineEntryAmounts` (`lineActuals.ts`) additionne les `Transaction` de type `var` (ligne `var`), `rev` (ligne de revenu), `fix` (ligne fixe ou crédit) dont la cible est la ligne ; `syncLineActual(s)` réécrit le cache `Line.actual`. « Disponible à placer », « Reste à placer », surplus, tableau de bord (spec 0027) lisent ces réels.
- Soldes : `realMovements` (solde réel) lit toutes les transactions de leur compte à leur date bancaire ; `estimatedMovements` (solde estimé) lit les `var`/`env`/`epa` à leur date mais PAS les `fix` ni les `rev`, estimés par le pointage de leur ligne (montant compté = réel de la ligne, sinon budget). Les flux Entrées/Sorties du panneau de compte viennent de `flowOf(realMovements)`.
- Détail de compte = panneau latéral « Mouvements » de l'écran Comptes (`AccountPanel`, `Accounts.tsx`) : liste des mouvements réels du mois (et rattachés d'un autre mois), solde, entrées, sorties.
- Les comptes ne sont jamais supprimés, seulement archivés (`archiveBankAccount`).
- Spec 0017 (sorties d'épargne et motifs) est un brouillon NON implémenté (aucune trace de `Purpose`, `purposeId` dans `src/`). Cette spec n'en dépend pas et ne le réutilise pas : le « détail qui va bien » est le champ libre existant `detail` (spec 0020, 200 caractères). Distinction à garder si la 0017 est livrée : la 0017 enregistre de VRAIS mouvements d'argent depuis/vers un compte d'épargne ; la 0028 ne déplace aucun argent.
- Spec 0024 (entrée sur enveloppe, type `ienv`) également non implémentée : elle ne concerne pas cette spec (les types affectables sont `var`, `fix`, `rev`).

## Périmètre

Inclus :
- Un champ facultatif « compte d'affectation » sur une opération (`Transaction`), un seul compte, pour la totalité du montant.
- Saisie (écran Opérations, onglet Saisie), import CSV (aperçu), modification d'une opération existante, retrait de l'affectation.
- Exclusion des chiffres du budget ; conservation dans les soldes ; affichage dans le détail du compte d'épargne.
- Schéma Supabase (migration additive), `supabaseRows`, `database.types.ts`, test de contrat.

Exclus :
- Migration des données d'octobre 2026 (spec / opération séparée, avec sauvegarde). Elle est décrite en annexe pour mémoire seulement.
- Aucun mouvement fictif, aucun virement créé ni modifié ; les virements principal ↔ LDDS (ADR 0018/0020/0021) restent inchangés.
- Fractionnement d'une opération sur plusieurs comptes ; types `env` et `epa` ; comptes `invest` comme cible ; motifs de la 0017 ; mémorisation en règle d'import ; nouvel écran.
- Tableau de bord : la mention (RG25) est incluse ; la carte « Épargne » est exclue (spec 0029, livrée ensuite, dépend de celle-ci).
- Aucune modification d'un solde réel ou estimé de compte.

## Règles de gestion

Modèle
- RG1. Une opération (`Transaction`) de type `var`, `fix` ou `rev` peut porter un « compte d'affectation » facultatif. Absent = comportement actuel, aucune donnée existante n'est modifiée. Les types `env` et `epa` n'en portent pas.
- RG2. Comptes affectables : comptes actifs (non archivés) de type `epargne` UNIQUEMENT (décision du développeur : le besoin ne concerne que ce cas), différents du compte propre de l'opération. Jamais un compte `invest`, le compte principal, Espèces ni un compte d'enveloppe.
- RG3. L'affectation ne change ni le compte propre (`accountId`), ni la date, ni le mois de rattachement, ni le montant, ni la ligne ou le type de l'opération, ni son empreinte d'import (déduplication inchangée).
- RG4. Un compte affecté puis archivé garde ses opérations affectées (affichées, comptées comme avant) ; on ne peut plus lui en affecter de nouvelles.

Effets sur le budget (une opération affectée est « hors budget »)
- RG5. Une opération affectée n'entre dans aucun chiffre du budget : réel de la ligne `var` / `fix` / `cre` / `rev` qu'elle cible (le réel reste la somme des écritures NON affectées ; sans autre écriture il est vide, ADR 0019), dépensé des lignes variables et « Restant des variables », totaux de dépenses, « Revenus » réels, « Disponible à placer (réel) », « Reste à placer », surplus, bilan du mois, tableau de bord (spec 0027), pointage « montant compté » d'une ligne. Elle est donc aussi exclue des écarts et alertes qui en dépendent.
- RG6. Cible et type restent enregistrés (la ligne visée reste connue, l'affectation est réversible, RG16). L'opération reste listée dans les écritures de sa ligne comme une écriture « affectée » (pastille), non comptée dans le réel, avec l'infobulle « n écritures, réel = somme des écritures » comptant uniquement les non affectées.
- RG7. Les garde-fous de la ligne ne changent pas : une ligne qui porte une opération affectée est « portée » (son compte ne peut pas changer, spec 0014 RG2, 0015 RG13).
- RG8. Les budgets (montants prévus), les allocations d'enveloppes et les virements ne sont pas touchés.

Effets sur les soldes et le consolidé
- RG9. Solde réel du compte propre : inchangé, l'opération y compte à sa date bancaire comme avant, sans double compte. Solde réel du compte d'affectation : inchangé (aucun mouvement créé).
- RG10. Solde estimé du compte propre : l'opération affectée reste comptée. Pour `var` rien ne change (lue à sa date). Pour `fix` et `rev`, que l'estimé lit par le pointage de leur ligne, une opération affectée sort du montant compté de la ligne (RG5) ET est lue comme une dépense / une entrée à sa date bancaire, de façon que le solde estimé du compte soit le même qu'avant l'affectation, sans double compte (décision du développeur). Précision (cas limite, décision du développeur) : pour une ligne pointée dont TOUTES les écritures sont affectées, le réel est vide mais le solde estimé ne compte AUCUN montant pour la ligne (0, pas son budget), sinon le budget s'ajouterait aux écritures lues à leur date ; seule la case de pointage de l'écran Budget continue d'afficher le budget (CA13).
- RG11. Consolidé : les soldes de comptes, la clôture annuelle (groupes Comptes bancaires / Épargnes / Enveloppes / Investissements), le Patrimoine du tableau de bord et les soldes à saisir ne changent pas d'un centime, puisqu'aucun solde ne change. Une opération affectée reste une vraie dépense / entrée de son compte dans tout total par compte, flux d'un compte courant (Entrées / Sorties du panneau) et historique de solde. Il n'existe pas d'autre vue consolidée des dépenses à adapter.
- RG12. Le solde du LDDS Travaux (compte `acc-sav-smvgtq10y1l`) vaut toujours 1 827,67 € (ouverture 63,95 + versements 2 359,19 − retraits 595,47) : les opérations affectées sont informatives, hors solde, hors Entrées / Sorties de son panneau, hors historique de versé.

Affichage
- RG13. Détail du compte d'affectation (panneau « Mouvements » de l'écran Comptes) : les opérations affectées du mois s'affichent dans la liste, triées avec les autres par date, en gris, sans signe de couleur, avec le libellé de l'opération, sa sous-ligne (« Dépense · Imprévus · payée avec Compte principal » / « Entrée · Remboursement… · reçue sur Compte principal »), le détail s'il existe, et la mention « affectée, hors solde ». Un récapitulatif d'une ligne sous les stats : « Affecté ce mois-ci : dépenses X € · entrées Y € · net Z € ». Les chiffres Entrées / Sorties / solde de ce panneau n'en tiennent pas compte (RG12).
- RG14. Écran Opérations (liste du mois) : l'opération affectée porte une pastille avec le nom du compte (« LDDS Travaux »), reste filtrable, et est exclue de l'impact « Restant des variables » du formulaire. Le total de la liste reste brut, infobulle « dont X € affectés hors budget ».
- RG15. Le libellé et le champ libre `detail` (spec 0020) portent « le détail qui va bien » (ex. « Travaux cuisine : carrelage ») ; aucune autre donnée n'est ajoutée.

Saisie, import, modification, retrait
- RG16. Saisie : le formulaire « Nouvelle dépense / entrée » (écran Opérations, onglet Saisie) gagne un champ facultatif « Affecter à un compte d'épargne » (par défaut « Aucun »), proposé pour les types `var`, `fix` et `rev` et seulement s'il existe au moins un compte affectable (RG2). Le bloc « impact » montre un réel de ligne inchangé quand un compte est choisi.
- RG17. Import (aperçu CSV, spec 0013) : une ligne importée de nature dépense (variable ou fixe) ou revenu peut recevoir le même choix, ligne par ligne. Non mémorisé dans les règles d'import (décision du développeur ; `import_rules` inchangé). L'affectation n'entre pas dans l'empreinte, le rang ni la déduplication.
- RG18. Modification d'une opération existante (édition d'une ligne de la liste Opérations, `updateTransaction`) : le compte d'affectation peut être choisi, changé ou retiré (« Aucun »), y compris sur un mois déjà initialisé. Le réel des lignes concernées, tous les chiffres de RG5 et les soldes estimés (RG10) sont recalculés ; l'ancienne ligne et la nouvelle ligne cible en cas de changement de ligne.
- RG19. Mois clos ou année clôturée (`isMonthLocked`) : poser, changer ou retirer une affectation est REFUSÉ (cela modifie les chiffres du budget du mois), avec le message habituel de mois verrouillé. Seule la modification du `detail` reste permise (spec 0020 RG6/RG11).
- RG20. Refus : compte non affectable (RG2), type `env` ou `epa`, mois verrouillé. L'opération reste inchangée en cas de refus (comme `updateTransaction`).
- RG21. Changer le type ou la cible d'une opération affectée (autre ligne, autre type) conserve l'affectation si elle reste valide (RG1), sinon l'opération est refusée.
- RG22. Supprimer une opération affectée la supprime partout ; l'affectation n'a aucune existence propre.

Données
- RG23. Schéma : migration additive, colonne facultative sur `transactions` (compte d'affectation), aucune suppression ni contrainte supplémentaire sur les colonnes existantes ; `supabaseRows` (aller et retour), `database.types.ts`, test de contrat (RG « sauvegarder puis recharger redonne le même `BudgetData` »).
- RG24. Les données existantes, sans compte d'affectation, se lisent exactement comme aujourd'hui (aucune reprise).

Tableau de bord (spec 0027)
- RG25. Mention « hors budget principal » : tant que le mois contient au moins une opération affectée, le tableau de bord affiche une phrase discrète sous le bandeau KPI : « N opérations (X € de dépenses, Y € d'entrées) sont affectées à un compte d'épargne et ne comptent pas dans ces chiffres », avec le détail par compte en infobulle. Absente s'il n'y en a pas, et sur un mois non initialisé. Aucun chiffre du bandeau ne change (ils lisent déjà le réel dérivé, RG5). La carte « Épargne » du tableau de bord est renvoyée à la spec 0029.

## Parcours utilisateur

Nominal (saisie) : Opérations, onglet Saisie, « Dépense », ligne Imprévus, « Leroy Merlin », 708,03 €, payé avec Compte principal, détail « Carrelage cuisine », « Affecter à un compte d'épargne » = LDDS Travaux. Le réel d'Imprévus ne bouge pas, le solde du principal baisse de 708,03 €, la liste montre la pastille « LDDS Travaux », le panneau du LDDS Travaux montre la ligne en gris « affectée, hors solde » et le récapitulatif passe à « dépenses 708,03 € ».

Nominal (modification) : sur une opération existante d'octobre, « Modifier », « Affecter à » = LDDS Travaux, Enregistrer. Le réel de sa ligne baisse, le « Disponible à placer » est recalculé, les soldes des comptes ne bougent pas.

Nominal (retrait) : « Modifier », « Affecter à » = Aucun : l'opération revient dans le réel de sa ligne et dans les chiffres du budget.

Import : dans l'aperçu, le choix « Affecter à » est proposé sur les lignes dépense / revenu, valeur « Aucun » par défaut.

Entrée affectée : un remboursement Leroy Merlin (type `rev`, ligne de revenu) affecté au LDDS Travaux : il ne compte plus dans les Revenus réels ni dans « Disponible à placer », reste crédité au compte principal, apparaît en gris, comme entrée, dans le panneau du LDDS.

Cas limites : mois clos (refus) ; compte d'affectation archivé après coup (RG4) ; compte d'affectation égal au compte propre (refusé) ; opération `env`/`epa` (non proposé) ; ligne qui n'a plus que des opérations affectées (réel vide, la case de pointage retombe sur le budget de la ligne, comme une ligne sans écriture) ; ligne pointée portant une opération affectée (RG10, pas de double compte) ; suppression de la ligne ou de la cible (comportement actuel de l'opération, l'affectation suit l'opération) ; mois non encore initialisé (aucune opération à affecter).

## Design

Design proposé, à valider. Aucun nouvel écran, aucune maquette fournie. Réutilise `organic.css`, les pastilles de compte, le formulaire Saisie, la ligne d'édition de la liste Opérations, l'aperçu d'import et le panneau de compte.

Formulaire Saisie (champ ajouté sous « Payé avec ») :
```
 Payé avec    [ Compte principal v ]
 Affecter à   [ Aucun v ]        (comptes d'épargne actifs ; masqué pour env et epa)
              « Hors budget : n'entre ni dans le réel de la ligne ni dans les revenus. »
```
Liste Opérations (pastille à côté du libellé) et édition (même sélecteur) :
```
 12/10  Leroy Merlin · Carrelage cuisine      Imprévus   [LDDS Travaux]   -708,03
```
Panneau « Mouvements » du LDDS Travaux :
```
 Solde réel · fin octobre   1 827,67 €
 Début 63,95 | Entrées 2 359,19 | Sorties -595,47
 Affecté ce mois-ci : dépenses 1 353,58 € · entrées 212,50 € · net -1 141,08 €   (chiffres d'exemple)
 12/10  Leroy Merlin · Carrelage cuisine   (gris)   -708,03   affectée, hors solde
        Dépense · Imprévus · payée avec Compte principal
```
États : aucune opération affectée (récapitulatif absent) ; compte non affectable (champ masqué) ; mois verrouillé (champ désactivé, message) ; compte d'affectation archivé (affiché en gris, non proposé).

## Impact technique (quoi)

- Domaine : `Transaction` gagne un compte d'affectation facultatif ; prédicats « est affectée » et « compte affectable » (`bank.ts`) ; `isTransactionInBudget` renvoie faux pour une opération affectée ; `lineActuals` (réel, nombre d'écritures) exclut les opérations affectées ; `bankMovements` : la liste du compte d'affectation reçoit les opérations affectées comme mouvements informatifs (marqués, exclus de `flowOf`, des soldes et du solde estimé) ; `estimatedMovements` lit les `fix`/`rev` affectées à leur date (RG10) ; `lineExpenses` (lignes portées) inchangé. Aucun changement du Ledger côté soldes.
- Application : `addTransaction`, `updateTransaction` (patch gagne l'affectation), refus mois verrouillé, comptes non affectables, types `env`/`epa` ; `syncLineActual(s)` appelé pour l'ancienne et la nouvelle ligne ; import : `prepareImport` / `validateImport` portent le choix ; empreinte inchangée.
- Infrastructure / schéma : NOUVELLE migration additive (colonne nullable sur `transactions`, jamais de suppression), `supabaseRows`, `database.types.ts`, test de contrat (`budgetRepository.contract.ts`).
- Présentation : formulaire Saisie, édition de la liste Opérations (pastille, infobulle du total), aperçu d'import (`ImportRow`), panneau de compte (`Accounts.tsx`, lignes grises et récapitulatif).
- Documentation : `docs/architecture.md`, ADR (« une opération sort du budget par son affectation, pas par son compte »), amendements aux specs 0002 RG17/RG18, 0008, 0009 RG92/RG110, 0019 RG19/RG20 (réel = écritures non affectées).
- Export CSV des opérations : colonne supplémentaire « Affectée à ».
- Tableau de bord : `domain/dashboard.ts` (`DashboardView`) gagne la mention (RG25), calculée depuis les opérations affectées du mois ; écran Accueil : un ajout d'affichage, sans nouvel écran. Spec 0027 amendée (mention).

## Annexe (pour mémoire, hors périmètre) — données d'octobre 2026

À traiter par une migration de données séparée, avec sauvegarde, une fois la spec livrée.
- Entrées à affecter au LDDS Travaux : 2 remboursements Leroy Merlin (19,90 et 192,60 €, `rev`, ligne `lmvlcx93jk`) et 7 déblocages de prêt (`rev`, ligne `smvguao0e7`). Le déblocage de 256,70 € (remboursement d'Axel) et les deux virements à Axel (250 + 6,70, ligne Imprévus) ne sont PAS affectés (net zéro, inchangés).
- Dépenses à affecter : Leroy Merlin 7,58 et 708,03 ; Brico Dépôt 11,57 et 33,90 ; artisan 450 ; bon d'achat Leroy Merlin 142,50 (`fix`, ligne « Remboursement compte joint » : il sort de cette ligne) ; 200 € en espèces payés depuis Espèces (`var`, ligne Imprévus : l'opération reste sur Espèces, solde d'Espèces inchangé, elle sort seulement du réel d'Imprévus).
- Attendu : Imprévus ne garde que COCO (1 620 + 10) et Axel (250 + 6,70), soit un réel de 1 886,70 € ; la ligne de revenu `smvguao0e7` ne garde que le déblocage de 256,70 € ; « Remboursement compte joint » perd 142,50 € ; soldes réels du principal et d'Espèces inchangés ; LDDS Travaux à 1 827,67 €.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given une dépense `var` de 708,03 € sur Imprévus, When je l'affecte au LDDS Travaux, Then le réel d'Imprévus baisse de 708,03 €, « Restant des variables » est recalculé sans elle, et son compte, sa date et son montant sont inchangés. (Auto)
- CA2. Given une entrée `rev` de 192,60 € sur une ligne de revenu, When je l'affecte, Then elle n'entre plus dans les Revenus réels ni dans « Disponible à placer (réel) », ni dans le réel de sa ligne (vide si c'était la seule). (Auto)
- CA3. Given une dépense `fix` de 142,50 € sur « Remboursement compte joint », When je l'affecte, Then le réel de la ligne baisse de 142,50 € (vide s'il ne reste aucune écriture) et le total des dépenses fixes réelles du mois aussi. (Auto)
- CA4. Given une dépense `var` payée avec Espèces affectée, Then le solde réel d'Espèces est inchangé et le réel de sa ligne baisse. (Auto)
- CA5. (y compris une ligne pointée à 300 € dont la seule écriture, 142,50 €, est affectée : solde estimé inchangé, la ligne ne compte rien dans l'estimé.) Given une opération affectée, Then le solde réel et le solde estimé de son compte propre sont identiques à ceux d'avant l'affectation, y compris pour un `fix` ou un `rev` sur une ligne pointée (pas de double compte). (Auto)
- CA6. Given une opération affectée au LDDS Travaux, Then le solde réel du LDDS Travaux, ses Entrées / Sorties du panneau, son historique et la clôture annuelle sont inchangés, et le Patrimoine du tableau de bord aussi. (Auto)
- CA7. Given le panneau du LDDS Travaux, Then les opérations affectées du mois y sont listées en gris avec « affectée, hors solde », sous-ligne (nature · ligne · compte) et détail, et le récapitulatif donne dépenses, entrées et net. (Man sur l'écran, Auto sur le calcul)
- CA8. Given une opération affectée, When je retire l'affectation (« Aucun »), Then elle revient dans le réel de sa ligne et dans tous les chiffres du budget, aux montants exacts d'avant. (Auto)
- CA9. Given un mois initialisé ouvert, When j'affecte une opération existante, Then les chiffres sont recalculés ; Given un mois clos ou une année clôturée, Then poser, changer ou retirer l'affectation est refusé et l'opération reste inchangée ; Then modifier son `detail` reste permis. (Auto)
- CA10. Given un compte d'affectation égal au compte propre, un compte courant, un compte `invest`, un compte d'enveloppe, un compte archivé, une opération `env` ou `epa`, Then l'affectation est refusée. (Auto)
- CA18. (RG25) Given un mois avec des opérations affectées, Then la mention « hors budget principal » du tableau de bord donne leur nombre et leurs totaux dépenses / entrées, et les chiffres du bandeau KPI sont ceux sans elles ; Given aucune, Then la mention est absente. (Auto sur le calcul, Man sur l'écran)
- CA11. Given l'aperçu d'import, When je choisis un compte d'affectation sur une ligne dépense ou revenu puis j'importe, Then l'opération est créée avec cette affectation, la déduplication et l'empreinte sont inchangées, et un réimport la signale « Doublon ». (Auto)
- CA12. Given un compte d'affectation archivé après coup, Then ses opérations affectées restent affichées et hors budget, et il n'est plus proposé. (Auto)
- CA13. Given une ligne qui ne porte que des opérations affectées, Then son réel est vide, sa case de pointage affiche son budget (sans effet sur le solde estimé, voir CA5), et son compte ne peut toujours pas changer. (Auto)
- CA14. Given la liste Opérations, Then l'opération affectée porte la pastille du compte et l'infobulle du total donne le montant affecté ; l'impact du formulaire ne change pas le « Restant des variables ». (Man)
- CA15. Given la migration, Then la colonne nullable existe, les anciennes opérations se chargent sans affectation, et sauvegarder puis recharger redonne le même `BudgetData` avec affectation. (Auto sur la conversion et le contrat, Man sur la base)
- CA16. Given les données sans affectation, Then tous les calculs existants (budget, enveloppes, virements, tableau de bord, import) produisent les mêmes résultats qu'avant. (Auto, tests existants)
- CA17. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Décisions du développeur déjà intégrées : vocabulaire « Affecter à » ; comptes affectables = épargne seulement ; types `var`/`fix`/`rev` ; total de liste brut + infobulle ; récapitulatif dans le panneau ; pas de règle d'import ; mois verrouillé = refus (sauf `detail`) ; solde estimé inchangé ; colonne CSV « Affectée à » ; pas de fractionnement.

Aucune. Découpage décidé : la carte « Épargne » du tableau de bord fait l'objet de la spec 0029.
