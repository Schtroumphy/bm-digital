-- Spec 0013 : import des dépenses par fichier CSV. Migration additive, appliquée après 20261022212402.
-- src/domain/database.types.ts a été régénéré après application.

-- Transactions importées : compte du fichier, empreinte de la ligne et rang parmi les lignes identiques (RG20 à RG24).
-- Les trois colonnes vont ensemble ; une transaction saisie à la main n'en a aucune.
alter table transactions
  add column import_account_id text,
  add column fingerprint text,
  add column rank int check (rank >= 1),
  add constraint transactions_import_complete check (
    (import_account_id is null) = (fingerprint is null) and (fingerprint is null) = (rank is null)
  );
-- Clé de déduplication (ADR 0010) : un doublon forcé prend le prochain rang libre, la clé reste unique.
create unique index transactions_import_key on transactions (user_id, import_account_id, fingerprint, rank) where fingerprint is not null;

-- Mouvements entre comptes (retraits, transferts internes), créés par l'import (RG10a à RG10d).
create table account_movements (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  month text not null,
  day int not null check (day between 1 and 31),
  label text not null,
  amount numeric(12,2) not null check (amount > 0),
  from_account_id text not null,
  to_account_id text not null,
  import_account_id text,
  fingerprint text,
  rank int check (rank >= 1),
  position int not null default 0,
  primary key (user_id, id),
  check (from_account_id <> to_account_id),
  check ((import_account_id is null) = (fingerprint is null) and (fingerprint is null) = (rank is null))
);
create index on account_movements (user_id, month);
create unique index account_movements_import_key on account_movements (user_id, import_account_id, fingerprint, rank) where fingerprint is not null;

-- Règles mémorisées « libellé contient X -> nature + cible » (RG18). Le motif est stocké normalisé.
create table import_rules (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  pattern text not null check (pattern <> ''),
  nature text not null check (nature in ('depense', 'retrait', 'interne', 'externe')),
  target_kind text not null check (target_kind in ('var', 'env', 'account')),
  target_id text not null,
  position int not null default 0,
  primary key (user_id, id),
  unique (user_id, pattern)
);

-- RLS « own rows » sur les nouvelles tables.
do $$
declare t text;
begin
  foreach t in array array['account_movements', 'import_rules']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
