-- Spec 0032 : objectifs par année et par type. Migration additive, NON APPLIQUÉE : à valider puis appliquer par le développeur.
-- Après application, régénérer src/domain/database.types.ts (mis à jour à la main en attendant : table goals, colonne settings.goals_migrated).
-- Les trois anciens objectifs (colonnes de settings) sont convertis en lignes de goals par l'application elle-même, au premier chargement
-- (migrateGoals), puis settings.goals_migrated passe à true : aucune reprise de données en SQL. Les anciennes colonnes sont conservées.

alter table settings add column goals_migrated boolean not null default false;

create table goals (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  year integer not null,
  -- amount = montant sur comptes, rate = taux d'épargne, cap = plafond de dépenses, saved = épargné dans l'année
  kind text not null check (kind in ('amount', 'rate', 'cap', 'saved')),
  name text not null,
  target numeric not null check (target > 0),
  due date,
  -- Paramètres du type : { "accounts": [clés de lignes epa/inv] } pour amount et saved, { "scope": {...} } pour cap.
  params jsonb not null default '{}'::jsonb,
  -- Ordre de création.
  position integer not null default 0,
  primary key (user_id, id)
);

alter table goals enable row level security;
create policy "own rows" on goals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
