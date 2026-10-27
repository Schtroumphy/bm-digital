-- Spec 0027 : notes du mois (écran « Tableau de bord »). Migration additive, NON APPLIQUÉE : à valider puis appliquer par le développeur.
-- Après application, régénérer src/domain/database.types.ts (mis à jour à la main en attendant : table month_notes).
-- Aucune reprise de données : les mois existants n'ont simplement aucune note.

-- Une note appartient à un mois (la première note d'un mois non initialisé crée sa ligne dans months, sans l'initialiser).
create table month_notes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  id text not null,
  text text not null,
  done boolean not null default false,
  -- Ordre de création dans le mois.
  position integer not null default 0,
  primary key (user_id, month, id),
  foreign key (user_id, month) references months on delete cascade
);

alter table month_notes enable row level security;
create policy "own rows" on month_notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
