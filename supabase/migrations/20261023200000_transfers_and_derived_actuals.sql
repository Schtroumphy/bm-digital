-- Spec 0019 : pointage fictif et soldes réels. Migration appliquée après 20261023181632 (spec 0020).
-- 1. Cible facultative d'un transfert (account_movements) : la ligne (clé) ou l'enveloppe (identifiant) que le transfert représente.
--    Les mouvements existants restent valides : target_kind et target_key valent null (« sans cible »).
-- 2. Le réel d'une ligne est dérivé de ses écritures, plus jamais saisi : le réel du modèle de budget disparaît.
--    month_lines.actual est conservé : c'est un cache recalculé par l'application à chaque changement d'écriture.
-- 3. settings.pointage_start reste en base, inutilisée, sans reprise de données.
-- src/domain/database.types.ts doit être régénéré après application.

alter table account_movements add column target_kind text;
alter table account_movements add column target_key text;
alter table account_movements add constraint account_movements_target_check
  check ((target_kind is null and target_key is null) or (target_kind in ('line', 'env') and target_key is not null));

alter table template_lines drop column actual;
