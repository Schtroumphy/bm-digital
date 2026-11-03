# 0032 — Périodes budgétaires à dates fixes

- Statut : acceptée
- Date : 2026-11-03
- Spec liée : [0039-periodes-budgetaires-a-dates-fixes](../specs/0039-periodes-budgetaires-a-dates-fixes.md)

## Contexte
Un mois du budget est une clé `AAAA-MM`, mais le budget réel court par exemple du 29/09 au 29/10 (salaire et prélèvements de fin de mois rattachés au mois suivant, [ADR 0015](0015-date-bancaire-contre-mois-de-rattachement.md)). Les soldes de l'onglet Comptes étaient calculés sur le mois civil : difficiles à rapprocher du relevé bancaire.

## Décision
- Une période est un intervalle contigu `[début, fin]` par mois, défini par un début global (`Settings.startDate`, début du premier mois et date des soldes de départ) et une fin par mois (`MonthData.endDate`). Le début d'un mois est le lendemain de la fin du précédent : il n'est jamais stocké.
- La fin par défaut est calculée, pas stockée : même numéro de jour que la fin du mois précédent, plafonné à la longueur du mois ; une fin au dernier jour du mois civil reste au dernier jour. Modifier une fin déplace donc les fins par défaut suivantes.
- Les soldes (réel, estimé, transferts sur leurs deux faces, ajustements) rangent les mouvements par période selon leur date bancaire. Le rattachement budgétaire (`month`) reste un choix distinct, compatible avec l'ADR 0015.
- Sans aucune date saisie, la période est le mois civil : les soldes sont identiques à ceux d'avant.
- Migration additive à deux colonnes nullables (`settings.start_date`, `months.end_date`), sans reprise de données.
- Saisie manuelle avec date réelle explicite (écrite comme date bancaire). Pour les écritures existantes sans date bancaire, reprise par la date la plus tardive de la période portant leur numéro de jour, modifiable ensuite.
- Une écriture datée avant le début du budget est « Hors période » : dans aucun solde, signalée dans l'interface.
- Fin non modifiable pour un mois clos ou verrouillé et pour son précédent.
- Restent au mois civil : le « mois en cours », le tableau de bord, les objectifs, la simulation.

## Alternatives écartées
- Afficher les opérations « rattachées au mois » sans changer les soldes : ne rapproche pas le solde du relevé.
- Stocker toutes les bornes de période (début et fin de chaque mois) : redondant, risque de trous ou de chevauchements.

## Conséquences
- Les périodes sont recalculées à la lecture avec un cache invalidé par une signature des dates (`domain/periods.ts`).
- Modifier une date déplace des écritures d'une période à l'autre dans les soldes, sans en modifier aucune.
- Le code écrit toujours les deux colonnes : la migration doit être appliquée avant de lancer cette version sur la base réelle.
- Procédure de migration : (1) sauvegarde fraîche de la base réelle ; (2) test sur une copie de `backups/2026-10-29/` (soldes identiques avant/après) ; (3) application avec l'accord du développeur.
- Statut de la migration : appliquée le 2026-11-03 sur la base réelle, à la demande du développeur, SANS sauvegarde fraîche ni test préalable sur copie de `backups/2026-10-29/` (réversible par `drop column`).
- Restauration : `alter table settings drop column start_date; alter table months drop column end_date;` (additif, sans perte des données d'avant, les dates saisies sont perdues et les soldes reviennent au mois civil), ou restauration de la sauvegarde fraîche par le développeur.
- Plusieurs écrans restent volontairement civils : une future spec devra les aligner.
