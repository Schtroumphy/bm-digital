-- Spec 0050 (amendement du 2026-11-20) : association d'une opération à UNE ligne de transfert entre comptes. Migration additive.
-- transactions.transfer_line_key : clé de la ligne de transfert (ligne epa du mois) à laquelle l'opération affectée est associée, null = aucune association.
-- Aucune reprise de données, aucune contrainte, aucune suppression : les opérations existantes gardent transfer_line_key = null (RG45).
-- APPLIQUÉE le 2026-11-20 à la base distante, sur demande explicite du développeur (enregistrée côté Supabase sous le nom transfer_line_key, avec son propre horodatage).
-- src/domain/database.types.ts est déjà à jour (colonne transfer_line_key de transactions) ; à régénérer pour vérification après application.

alter table transactions add column transfer_line_key text;
