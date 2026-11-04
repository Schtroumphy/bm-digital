-- Spec 0026 (amendement du 2026-11-04) : ajustement du solde espèces d'une enveloppe (RG27 à RG34).
-- Les espèces sont informatives et non tracées : l'utilisateur saisit le solde réel, l'application enregistre l'écart, daté du jour.
-- Migration additive : une nouvelle table, aucune colonne ni contrainte existante modifiée, aucune reprise de données (les données existantes
-- n'ont simplement aucun ajustement).
-- envelope_id n'est pas une clé étrangère (comme adjustments.account_id) : un ajustement est supprimé avec son enveloppe par l'application.
-- APPLIQUÉE sur le Supabase distant le 2026-11-04. src/domain/database.types.ts est à jour (table cash_adjustments).

create table cash_adjustments (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  envelope_id text not null,
  date date not null,
  -- Signé : positif = espèces ajoutées, négatif = retirées.
  amount numeric(12,2) not null check (amount <> 0),
  position int not null default 0,
  primary key (user_id, id)
);
create index on cash_adjustments (user_id, envelope_id, date);

alter table cash_adjustments enable row level security;
create policy "own rows" on cash_adjustments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
