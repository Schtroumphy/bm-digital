-- Spec 0039 : périodes budgétaires à dates fixes.
-- settings.start_date : début du budget (date du solde de départ et début de la période du premier mois) ; null = le 1er du premier mois (comportement actuel).
-- months.end_date : dernier jour de la période du mois ; null = fin par défaut calculée (même numéro de jour que la fin du mois précédent, plafonné à la longueur du mois).
-- Le début d'un mois autre que le premier n'est jamais stocké : c'est le lendemain de la fin du mois précédent.
-- Migration additive : deux colonnes nullables, aucune contrainte, aucune reprise de données. Tant qu'aucune date n'est saisie, chaque période est le mois civil
-- et tous les soldes sont identiques à ceux d'avant (spec 0039, RG6, CA9, CA10).
--
-- APPLIQUÉE le 2026-11-03 sur le Supabase distant, sur demande explicite du développeur (enregistrée sous le nom « budget_periods »).
-- La sauvegarde fraîche et le test sur une copie de backups/2026-10-29/ prévus au départ n'ont PAS été faits : la migration est additive et réversible (voir ci-dessous).
-- IMPORTANT : le code écrit toujours ces deux colonnes (valeur null). Appliquer cette migration AVANT de lancer la nouvelle version de l'application
-- sur la base réelle, sinon la sauvegarde échoue (colonne inconnue).
--
-- Restauration en cas de problème (la migration est additive, aucune donnée existante n'est modifiée) :
--   a) retirer simplement les colonnes, sans perte des données d'avant :
--        alter table settings drop column if exists start_date;
--        alter table months drop column if exists end_date;
--      (les dates saisies depuis l'application sont perdues avec elles ; les soldes reviennent au mois civil) ;
--   b) ou restaurer la sauvegarde fraîche prise à l'étape 1 (le développeur seul le fait).
-- src/domain/database.types.ts est déjà à jour (mis à jour à la main) ; à régénérer pour vérification après application.

alter table settings add column if not exists start_date date;
alter table months add column if not exists end_date date;
