-- Spec 0025 : onglet Objectifs. Migration additive, appliquée après 20261023200000.
-- src/domain/database.types.ts vérifié conforme aux types générés par Supabase (colonnes invest_accounts, emergency_due, invest_due).
-- Aucune reprise de données : null = « réglage absent ». invest_accounts null = toutes les lignes d'investissement ;
-- une échéance null = « à définir ».

alter table settings add column invest_accounts text[];
alter table settings add column emergency_due date;
alter table settings add column invest_due date;
