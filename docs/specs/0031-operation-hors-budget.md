# 0031 — Marquer une opération « hors budget »

- Statut : implémentée
- Date : 2026-10-27
- Branche prévue : feat/operation_hors_budget
- Dépend de : 0028 (opérations affectées à un compte d'épargne, implémentation en cours sur `feat/operations_affectees_epargne`)

## Contexte et objectif

Exemple du développeur : une cagnotte de 1 630 € reçue puis virée aux personnes concernées. L'entrée et les sorties faussent le budget du mois (revenus, dépenses, « Disponible à placer », restant des variables), alors que l'argent n'est pas à lui. Il veut pouvoir noter ces écritures comme « hors budget » pour qu'elles ne comptent plus dans les chiffres du budget, tout en restant dans les soldes bancaires (l'argent a bien transité par le compte).

Aujourd'hui, deux mécanismes existent et aucun ne convient :
- compte « hors budget » : tout un compte sort du budget (spec 0002 RG17/RG18) ; inadapté pour quelques écritures d'un compte courant ;
- affectation à un compte d'épargne (0028) : sort bien une opération du budget sans changer ses soldes, mais impose de choisir un compte d'épargne et affiche l'opération dans le détail de ce compte, ce qui n'a pas de sens pour une cagnotte.

## État des lieux (vérifié)

- 0028 (non commitée, en cours) : `Transaction.assignedAccountId` ; `isTransactionInBudget` renvoie faux pour une opération affectée ; le réel d'une ligne exclut les opérations affectées (`lineActuals`) ; les soldes réel et estimé du compte propre n'en sont pas modifiés (RG9, RG10) ; mois verrouillé = refus (RG19) ; types affectables `var`, `fix`, `rev` ; compte affectable : épargne actif seulement (RG2) ; mention dans le tableau de bord (`DashboardView.assigned`, RG25) ; colonne CSV « Affectée à » ; sélecteur `AssignPicker`.
- Le vocabulaire « ligne » est ambigu : « ligne du budget » (Budget, Modèle) ou « ligne d'opération » (liste de l'écran Opérations). Les lignes d'un compte « hors budget » existent déjà (`isLineInBudget`, section « Hors budget » du Budget).

## Périmètre (proposé)

Inclus :
- Une nouvelle option « Hors budget » sur une opération (`var`, `fix`, `rev`), SANS compte d'affectation : même effet que l'affectation de la 0028 sur les chiffres du budget et les soldes (identique RG5 à RG11 de la 0028), sans apparition dans le détail d'un compte d'épargne.
- Saisie, import (aperçu), modification, retrait, mois verrouillé, export CSV, mention du tableau de bord.
- Schéma Supabase (migration additive), `supabaseRows`, `database.types.ts`, test de contrat.

Exclus :
- Marquer en une fois toute une ligne du budget (Budget / Modèle) comme hors budget (décision du développeur : une opération à la fois).
- Compte « hors budget » (inchangé), fractionnement d'une opération, règle d'import mémorisée.
- Migration des données existantes (cagnotte de 1 630 €) : opération séparée avec sauvegarde.

## Règles de gestion

- RG1. Une opération `var`, `fix` ou `rev` peut être marquée « hors budget ». Absent = comportement actuel, aucune donnée existante modifiée.
- RG2. Effets : identiques à ceux d'une opération affectée (0028 RG3, RG5 à RG11, RG19 à RG22) : n'entre dans aucun chiffre du budget (réel de sa ligne, dépensé des variables, restant des variables, revenus réels, disponible à placer, reste à placer, surplus, bilan, tableau de bord, pointage) ; soldes réel et estimé de son compte inchangés ; compte, date, montant, ligne et empreinte d'import inchangés ; mois clos ou année clôturée : poser ou retirer le marquage est refusé (le `detail` reste modifiable) ; suppression : disparaît partout.
- RG3. Exclusivité : une opération est soit comptée au budget, soit hors budget (marquée), soit affectée à un compte d'épargne (0028, qui sort déjà du budget). Choisir un compte d'affectation implique hors budget. Interface : un seul sélecteur « Compté au budget / Hors budget / Affecter à <compte> ».
- RG4. Affichage : écran Opérations : pastille « Hors budget » (gris) ; filtre possible ; total de liste brut avec l'infobulle « dont X € hors budget / affectés » ; écritures de la ligne cible listées comme « hors budget », non comptées dans « n écritures » ; panneau d'un compte : aucun changement (l'opération reste un mouvement normal de son compte).
- RG5. Tableau de bord : la mention de la 0028 (RG25) est UNE SEULE phrase qui cumule les opérations affectées et les opérations hors budget (« N opérations (X € de dépenses, Y € d'entrées) sont hors budget ou affectées à un compte d'épargne et ne comptent pas dans ces chiffres »), détail par compte en infobulle pour les affectées. Absente s'il n'y en a aucune.
- RG6. Export CSV des opérations : nouvelle colonne « Hors budget » (oui / non) à côté de « Affectée à ». Une opération affectée à un compte est aussi « oui ».
- RG7. Schéma : migration additive, colonne facultative sur `transactions` pour le marquage « hors budget » sans compte ; la 0028 (`assigned_account`) n'est pas modifiée.
- RG8. Les sorties vers les concernés sont des dépenses `var` ou `fix` ordinaires (pas des virements internes) ; les virements restent hors périmètre.
- RG9. Dépendance : implémentation après la 0028.

## Parcours utilisateur

Nominal : Opérations, onglet Saisie, « Entrée », ligne de revenu « Divers », « Cagnotte anniversaire », 1 630 €, option « Hors budget » cochée. Revenus réels et « Disponible à placer » ne bougent pas ; le solde du compte principal augmente de 1 630 €. Puis 12 virements de 135,83 € aux concernés (dépenses `var` sur Imprévus), même option : le réel d'Imprévus ne bouge pas, le solde du compte baisse, et au final le solde bancaire est revenu au départ.

Modification : « Modifier » sur une opération existante, option « Hors budget », Enregistrer ; retrait : décocher.

Cas limites : mois clos (refus) ; opération déjà affectée à un compte d'épargne (déjà hors budget) ; ligne dont toutes les écritures sont hors budget (réel vide, case de pointage sur le budget, comme 0028 CA13) ; import CSV (choix ligne par ligne).

## Design

Design proposé (sélecteur validé par le développeur, pas de maquette). Dans `AssignPicker` / formulaire Saisie, sous « Payé avec » :
```
 Payé avec    [ Compte principal v ]
 Budget       [ Compté au budget v ]    options : Compté au budget · Hors budget · Affecter à LDDS Travaux…
```
Un seul sélecteur évite deux champs contradictoires. Liste Opérations : pastille grise « Hors budget » à côté du libellé. Aperçu d'import : même sélecteur par ligne. États : aucun compte d'épargne (seulement « Compté au budget » / « Hors budget »), mois verrouillé (désactivé, message habituel).

## Impact technique (quoi)

- Domaine : `Transaction` gagne un marquage « hors budget » (ou une valeur spéciale de l'affectation) ; `isTransactionInBudget` / `isTransactionAssigned` (`bank.ts`) étendus ; `lineActuals`, `estimatedMovements`, `bankMovements` : une opération marquée se comporte comme une opération affectée, sans apparaître dans le détail d'un compte d'épargne ; `monthAssignedSummary` (mention) étendu.
- Application : `addTransaction`, `updateTransaction` (refus mois verrouillé, types `env` / `epa`), import (`prepareImport` / `validateImport`), recalcul de l'ancienne et de la nouvelle ligne.
- Infrastructure / schéma : nouvelle migration additive (ou extension de `assigned_account`), `supabaseRows`, `database.types.ts`, contrat du repository.
- Présentation : `AssignPicker`, formulaire Saisie, édition de la liste Opérations, `ImportRow`, mention du tableau de bord.
- Documentation : l'ADR 0025 complète l'ADR 0024 sans la modifier (la spec 0028 n'est pas amendée), `docs/architecture.md`.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given une entrée `rev` de 1 630 € marquée hors budget, Then les Revenus réels, le réel de sa ligne, « Disponible à placer » et « Reste à placer » ne la comptent pas, et le solde réel et estimé de son compte la comptent. (Auto)
- CA2. Given 12 dépenses `var` de 135,83 € marquées hors budget, Then le réel de la ligne, le « Restant des variables » et les totaux de dépenses ne les comptent pas, et le solde du compte les compte. (Auto)
- CA3. Given une opération marquée, When je retire le marquage, Then elle revient dans tous les chiffres aux montants exacts d'avant. (Auto)
- CA4. Given un mois clos ou une année clôturée, Then poser ou retirer le marquage est refusé, l'opération reste inchangée, et le `detail` reste modifiable. (Auto)
- CA5. Given une opération `env` ou `epa`, Then le marquage n'est pas proposé / est refusé. (Auto)
- CA6. Given une opération déjà affectée à un compte d'épargne (0028), Then elle reste hors budget, sans double comptage, et le sélecteur affiche son compte. (Auto)
- CA7. Given l'aperçu d'import, When je marque une ligne hors budget puis j'importe, Then l'opération est créée marquée, empreinte et déduplication inchangées. (Auto)
- CA8. Given des opérations marquées dans le mois, Then la mention du tableau de bord donne leur nombre et leurs totaux, et les chiffres du bandeau sont ceux sans elles ; sans opération marquée, la mention est absente. (Auto sur le calcul, Man sur l'écran)
- CA9. Given sauvegarde puis rechargement, Then le marquage est conservé ; anciennes données : aucune opération marquée, calculs inchangés. (Auto sur la conversion et le contrat)
- CA10. Given la liste Opérations, Then l'opération marquée porte la pastille « Hors budget » et l'infobulle du total donne le montant hors budget. (Man)
- CA11. Given des données sans marquage, Then tous les calculs existants sont inchangés. (Auto, tests existants)
- CA12. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur intégrées : une opération à la fois ; sélecteur unique « Compté au budget / Hors budget / Affecter à… », 0031 après 0028 ; une seule phrase de mention (affectées + hors budget) ; colonne CSV « Hors budget » ; sorties en dépenses `var` / `fix` ; sélecteur proposé validé ; découpage 0030 / 0031 validé.
