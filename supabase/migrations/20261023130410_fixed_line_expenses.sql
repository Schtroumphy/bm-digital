-- Spec 0014 : dépenses sur lignes fixes et crédits. Migration additive, appliquée après 20261022231057.
-- src/domain/database.types.ts est inchangé : les colonnes restent des text.

-- Nouveau type de dépense « fix » (cible = clé de la ligne fix/cre).
alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type in ('var', 'env', 'epa', 'fix'));

-- Cible « line » (ligne fixe ou crédit) pour les règles mémorisées de l'import.
alter table import_rules drop constraint import_rules_target_kind_check;
alter table import_rules add constraint import_rules_target_kind_check check (target_kind in ('var', 'line', 'env', 'account'));
