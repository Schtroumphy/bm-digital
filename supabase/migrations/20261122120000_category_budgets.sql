-- Spec 0054 : budgets par catégorie et par mois. Migration additive, APPLIQUÉE sur le Supabase distant (ne plus modifier ce fichier).
-- src/domain/database.types.ts a été mis à jour à la main d'après cette migration (table category_budgets).
-- Un budget = un montant indicatif (>= 0) pour un couple (catégorie, mois) ; pas de ligne = aucun budget (un budget de 0 est une vraie ligne).
-- La clé étrangère composite supprime les budgets d'une catégorie avec elle (spec 0054, RG10).
-- Ordre au déploiement : appliquer cette migration, puis publier l'application.
-- Retour arrière : drop table category_budgets;

create table category_budgets (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  category_id text not null,
  -- Mois au format AAAA-MM.
  month text not null,
  amount numeric(12,2) not null check (amount >= 0),
  primary key (user_id, category_id, month),
  foreign key (user_id, category_id) references categories (user_id, id) on delete cascade
);

alter table category_budgets enable row level security;
create policy "own rows" on category_budgets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
