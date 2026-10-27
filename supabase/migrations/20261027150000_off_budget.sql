-- Spec 0031 : opération marquée « hors budget » (sans compte d'affectation). Migration additive, à appliquer après 20261027120000 (assigned_account).
-- transactions.off_budget : true = l'opération sort des chiffres du budget, null = comptée dans le budget (comportement actuel).
-- Aucune reprise de données, aucune contrainte, aucune suppression : les lignes existantes gardent off_budget = null.
-- APPLIQUÉE sur le Supabase distant (2026-10-27).
-- src/domain/database.types.ts est déjà à jour (colonne off_budget de transactions) ; à régénérer pour vérification après application.

alter table transactions add column off_budget boolean;
