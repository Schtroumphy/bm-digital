-- Spec 0020 : détail facultatif des écritures de Saisie. Migration additive, appliquée après 20261023133612 (spec 0015).
-- Aucune reprise de données : les lignes existantes gardent detail = null (« pas de détail »).
-- src/domain/database.types.ts doit être régénéré après application.

alter table transactions add column detail text;
alter table account_movements add column detail text;
