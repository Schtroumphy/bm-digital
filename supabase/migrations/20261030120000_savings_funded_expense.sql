-- Spec 0035 : dépense financée par l'épargne (type de transaction 'epd') et sa cible d'import « ligne d'épargne ».
-- Migration additive, à appliquer AVANT de déployer le code : sans elle, l'écriture d'une transaction 'epd' ou d'une règle 'savings' est refusée par les check.
-- transactions.type : 'epd' = dépense payée depuis un compte d'épargne (account_id = payeur), catégorisée par une ligne d'épargne (target = clé de la ligne epa).
-- import_rules.target_kind : 'savings' = règle mémorisée « libellé contient X -> Dépense, ligne d'épargne <clé> » (target_id = clé de la ligne).
-- Aucune reprise de données, aucune suppression : les lignes existantes restent valides telles quelles.
-- NON APPLIQUÉE sur le Supabase distant (à appliquer par le développeur).
-- src/domain/database.types.ts n'a pas à changer : type et target_kind y sont des chaînes libres.

alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type in ('var', 'env', 'epa', 'fix', 'rev', 'epd'));

alter table import_rules drop constraint import_rules_target_kind_check;
alter table import_rules add constraint import_rules_target_kind_check check (target_kind in ('var', 'line', 'env', 'account', 'savings'));
