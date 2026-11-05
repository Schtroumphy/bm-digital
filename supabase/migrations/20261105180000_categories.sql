-- Spec 0046 : catégories de dépenses. Migration additive, APPLIQUÉE sur le Supabase distant le 2026-11-05 (ne plus modifier ce fichier).
-- src/domain/database.types.ts a été mis à jour à la main d'après cette migration ( table categories,
-- colonnes transactions.category_id, import_rules.category_id, settings.categories_initialized).
-- La liste par défaut (Alimentation, Logement…) est créée par l'application au premier chargement, pas en SQL :
-- settings.categories_initialized distingue « jamais initialisée » (false) de « vidée par l'utilisateur » (true, aucune ligne).
-- Pas de clé étrangère : l'application garantit qu'une catégorie utilisée n'est pas supprimée (RG5) et vide la catégorie des règles (RG14).
-- Ordre au déploiement : appliquer cette migration, puis publier l'application.

create table categories (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null,
  hue integer not null,
  -- Ordre d'affichage.
  position integer not null default 0,
  primary key (user_id, id)
);

alter table categories enable row level security;
create policy "own rows" on categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table transactions add column category_id text;
alter table import_rules add column category_id text;
alter table settings add column categories_initialized boolean not null default false;
