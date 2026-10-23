-- Spec 0015 : revenus, entrées d'argent et date bancaire. Migration additive, à appliquer après 20261023130410.
-- Après application, régénérer src/domain/database.types.ts (mis à jour à la main en attendant : colonnes bank_date).
-- Aucune reprise de données : une écriture sans date bancaire se range au mois et au jour de rattachement (repli).

-- Date bancaire réelle d'une écriture : les soldes rangent et datent l'écriture par cette date, le budget suit le mois de rattachement.
alter table transactions add column bank_date date;
alter table account_movements add column bank_date date;

-- Nouveau type d'écriture « rev » : entrée d'argent sur une ligne de revenu (cible = clé de ligne).
alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type in ('var', 'env', 'epa', 'fix', 'rev'));

-- Nature « revenu » pour les règles mémorisées (la cible 'line' existe déjà depuis la spec 0014).
alter table import_rules drop constraint import_rules_nature_check;
alter table import_rules add constraint import_rules_nature_check check (nature in ('depense', 'retrait', 'interne', 'externe', 'revenu'));
