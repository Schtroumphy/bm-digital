-- Spec 0016 : virements internes et liaison des deux faces. Migration additive, appliquée après 20261023200855 (spec 0019).
-- 1. Seconde trace d'un mouvement entre comptes : la face crédit (compte d'import, empreinte, rang, date bancaire). Les colonnes sans préfixe
--    restent la trace de la face débit. Les quatre colonnes sont renseignées toutes ensemble ou aucune ; les mouvements existants valent null
--    (« une face (débit) »), aucune reprise de données.
-- 2. Un mouvement issu d'un crédit seul n'a pas de trace débit : la contrainte « tout ou rien » des colonnes d'origine l'autorise déjà.
-- 3. « Enveloppes (global) » n'est pas un compte : il est stocké dans from_account_id / to_account_id par la valeur réservée 'enveloppes'
--    (aucune colonne en plus). La contrainte from <> to est inchangée.
-- 4. Source facultative d'un revenu (transactions.source), texte libre, sans effet sur aucun calcul.
-- 5. Règles mémorisées : la nature 'recu' (« Virement interne » reçu) devient possible, avec une cible compte (ou 'enveloppes').
-- src/domain/database.types.ts doit être régénéré après application.

alter table account_movements add column credit_import_account_id text;
alter table account_movements add column credit_fingerprint text;
alter table account_movements add column credit_rank int check (credit_rank >= 1);
alter table account_movements add column credit_bank_date date;
alter table account_movements add constraint account_movements_credit_trace_check
  check ((credit_import_account_id is null) = (credit_fingerprint is null) and (credit_fingerprint is null) = (credit_rank is null) and (credit_rank is null) = (credit_bank_date is null));
-- Une clé (compte d'import, empreinte, rang) ne sert qu'une fois par face. L'unicité croisée entre face débit et face crédit est garantie par l'application.
create unique index account_movements_credit_import_key on account_movements (user_id, credit_import_account_id, credit_fingerprint, credit_rank) where credit_fingerprint is not null;

alter table transactions add column source text;

alter table import_rules drop constraint import_rules_nature_check;
alter table import_rules add constraint import_rules_nature_check check (nature in ('depense', 'retrait', 'interne', 'externe', 'revenu', 'recu'));
