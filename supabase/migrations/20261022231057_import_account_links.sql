-- Spec 0013, amendement 1 : export Linxo, plusieurs comptes. Migration additive, appliquée après 20261022224005.
-- src/domain/database.types.ts a été mis à jour après application.

-- Catégorie donnée par Linxo : information facultative, hors empreinte et hors unicité (RG37).
alter table transactions add column category text;
alter table account_movements add column category text;

-- Correspondance entre un compte du fichier (nom du compte, nom de la connexion) et un compte de l'app (RG32).
-- account_id null = « Ne pas importer ».
create table import_account_links (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  account_name text not null,
  connection_name text not null,
  account_id text,
  position int not null default 0,
  primary key (user_id, id),
  unique (user_id, account_name, connection_name)
);

alter table import_account_links enable row level security;
create policy "own rows" on import_account_links for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
