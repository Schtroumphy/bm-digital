-- Spec 0034 : onglet Simulation. Migration additive, appliquée.
-- Le reste à placer d'une simulation n'est jamais stocké : il est recalculé depuis ses lignes (RG18).
-- L'unicité du nom (RG22) est une règle de l'application (casse et espaces ignorés) ; elle n'est pas portée par un index :
-- une sauvegarde par diff peut passer transitoirement par deux noms identiques (échange de noms).

create table simulations (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null default '',
  notes text not null default '',
  -- Ordre d'affichage : la plus récente en tête.
  position integer not null default 0,
  primary key (user_id, id)
);

create table simulation_rows (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  simulation_id text not null,
  id text not null,
  -- rev, cre, fix, var, epa, inv, ou env (« Enveloppes » : lignes libres, sans lien avec les vraies enveloppes).
  block text not null check (block in ('rev', 'cre', 'fix', 'var', 'epa', 'inv', 'env')),
  name text not null default '',
  -- Montant mensuel tel que saisi (« 1 234,5 »), vide = 0.
  amount text not null default '',
  position integer not null default 0,
  primary key (user_id, simulation_id, id),
  foreign key (user_id, simulation_id) references simulations (user_id, id) on delete cascade
);

alter table simulations enable row level security;
alter table simulation_rows enable row level security;
create policy "own rows" on simulations for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on simulation_rows for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
