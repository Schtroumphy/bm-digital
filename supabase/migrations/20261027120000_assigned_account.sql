-- Spec 0028 : opérations affectées à un compte d'épargne (hors budget). Migration additive, à appliquer après 20261025160000 (month_notes).
-- transactions.assigned_account_id : compte d'épargne auquel l'opération est affectée, null = comptée dans le budget (comportement actuel).
-- Aucune reprise de données, aucune contrainte, aucune suppression : les lignes existantes gardent assigned_account_id = null.
-- ÉCRITE, NON APPLIQUÉE : à appliquer seulement après sauvegarde de la base et accord explicite du développeur.
-- src/domain/database.types.ts est déjà à jour (colonne assigned_account_id de transactions) ; à régénérer pour vérification après application.

alter table transactions add column assigned_account_id text;
