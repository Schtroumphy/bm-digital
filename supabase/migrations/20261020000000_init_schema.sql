-- Budget Perso — initial Supabase schema.
-- Mirrors src/domain/types.ts so a Supabase BudgetRepository can replace the
-- localStorage one. Every table is scoped to the signed-in user via RLS.
-- Month keys are 'YYYY-MM' text, as in the app.

create table settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  first_month text not null,
  emergency_accounts text[] not null default '{}',
  emergency_target numeric(12,2) not null default 0,
  invest_target numeric(12,2) not null default 0,
  savings_rate_target numeric(5,2) not null default 0
);

create table template_lines (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  block text not null check (block in ('rev','cre','fix','var','epa','inv')),
  section text not null default '',
  name text not null,
  budget numeric(12,2) not null default 0,
  position int not null,
  primary key (user_id, key)
);

create table months (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  initialized boolean not null default false,
  primary key (user_id, month)
);

create table budget_lines (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  key text not null,
  block text not null check (block in ('rev','cre','fix','var','epa','inv')),
  section text not null default '',
  name text not null,
  budget numeric(12,2) not null default 0,
  actual numeric(12,2),
  position int not null,
  primary key (user_id, month, key),
  foreign key (user_id, month) references months on delete cascade
);

create table envelopes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null,
  hue int not null,
  cash numeric(12,2) not null default 0,
  template_alloc numeric(12,2) not null default 0,
  position int not null,
  primary key (user_id, id)
);

create table envelope_allocations (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  envelope_id text not null,
  amount numeric(12,2) not null,
  primary key (user_id, month, envelope_id),
  foreign key (user_id, envelope_id) references envelopes on delete cascade
);

-- Months imported from the spreadsheet, before the app managed them.
create table envelope_history (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  envelope_id text not null,
  alloc numeric(12,2) not null,
  spent numeric(12,2) not null,
  balance numeric(12,2) not null,
  primary key (user_id, month, envelope_id)
);

create table account_statements (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  account_key text not null,
  amount numeric(12,2) not null,
  primary key (user_id, month, account_key)
);

create table transactions (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  month text not null,
  day int not null check (day between 1 and 31),
  label text not null,
  amount numeric(12,2) not null,
  type text not null check (type in ('var','env','epa')),
  target text not null,
  source text not null check (source in ('vir','esp')),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index on transactions (user_id, month);

create table transfers (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null,
  amount numeric(12,2) not null default 0,
  position int not null,
  primary key (user_id, id)
);

create table transfers_done (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  transfer_id text not null,
  primary key (user_id, month, transfer_id)
);

create table planned_items (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  year int not null,
  month int not null check (month between 0 and 11),
  label text not null,
  amount numeric(12,2) not null default 0,
  envelope_id text not null,
  primary key (user_id, id)
);
create index on planned_items (user_id, year);

create table year_closes (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  year int not null,
  closed boolean not null default false,
  -- 'acc:<line key>' or 'env:<envelope id>' → adjusted base for 1 January of year + 1
  overrides jsonb not null default '{}',
  primary key (user_id, year)
);

do $$
declare t text;
begin
  foreach t in array array['settings','template_lines','months','budget_lines','envelopes','envelope_allocations',
    'envelope_history','account_statements','transactions','transfers','transfers_done','planned_items','year_closes']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
