-- Spec 0009 : pointage des lignes du budget. Migration additive, sans rattraper les autres specs. Non appliquée.

-- Pointage d'une ligne pour un mois : une case et une date (« reçu » pour un revenu). Aucun montant stocké : le montant compté est calculé (réel sinon budget, RG76).
create table line_checks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  line_key text not null,
  done_on date not null,
  -- Pointage de l'allocation d'une enveloppe seulement (line_key = 'env:<id>') : compte de destination enregistré au pointage (RG90).
  account_id text,
  primary key (user_id, month, line_key),
  foreign key (user_id, month) references months on delete cascade
);

-- Relevé bancaire d'un compte, par mois (un par compte et par mois) : le solde affiché par la banque, à une date.
-- Sert à comparer avec le Solde estimé (écart), ne fait pas partie du calcul.
create table account_balances (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  account_id text not null,
  amount numeric(12,2) not null,
  entered_on date not null,
  primary key (user_id, month, account_id),
  foreign key (user_id, month) references months on delete cascade
);

-- Régularisations « écart constaté » (RG65, RG66) : jamais supprimées, seulement annulées.
create table adjustments (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  account_id text not null,
  date date not null,
  amount numeric(12,2) not null check (amount <> 0),
  label text not null default 'écart constaté',
  created_on date not null,
  cancelled_on date,
  primary key (user_id, id)
);
create index on adjustments (user_id, account_id, date);

-- Début du pointage : premier mois compté d'après les pointages plutôt que d'après le réel (RG61).
alter table settings add column pointage_start text;

-- Compte de réception par défaut des enveloppes sans compte propre ; absent = compte principal (RG98).
alter table settings add column envelope_account_id text;

-- Jour prévu et mode d'exécution : portés par la ligne et par le modèle (RG17).
alter table template_lines
  add column due_day int check (due_day between 1 and 31),
  add column exec_mode text check (exec_mode in ('prelevement','virement_auto','virement_manuel','retrait','informatif'));
alter table budget_lines
  add column due_day int check (due_day between 1 and 31),
  add column exec_mode text check (exec_mode in ('prelevement','virement_auto','virement_manuel','retrait','informatif'));

alter table line_checks enable row level security;
create policy "own rows" on line_checks for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table account_balances enable row level security;
create policy "own rows" on account_balances for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
alter table adjustments enable row level security;
create policy "own rows" on adjustments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
