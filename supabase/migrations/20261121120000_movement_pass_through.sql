-- Spec 0054 : « simple passage » d'un virement entre comptes. Migration additive.
-- account_movements.pass_through : true = l'argent ne fait que transiter par le compte (ex. LDDS → Principal avant un transfert vers Travaux) ;
-- le virement n'est alors pas déduit du réel de la ligne d'épargne du compte qu'il quitte. Les virements existants gardent false.
-- APPLIQUÉE le 2026-11-21 à la base distante, sur demande explicite du développeur (enregistrée côté Supabase sous le nom movement_pass_through).

alter table account_movements add column pass_through boolean not null default false;
