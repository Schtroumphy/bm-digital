-- Spec 0012 : rattrape le schéma sur le domaine (src/domain/types.ts) pour que Supabase stocke tout BudgetData sans perte.
-- Migration additive : elle ne modifie pas les fichiers déjà appliqués (init_schema, envelope_accounts, account_kind).
-- Elle remplace 20261021000000_line_checks.sql (jamais appliquée) : ce fichier réajouterait settings.envelope_account_id,
-- supprimée par la spec 0011. Son contenu utile (pointage, relevés, régularisations, jour prévu, mode d'exécution,
-- début du pointage) est repris ici. À ne pas appliquer en plus de lui.
-- Les tables étaient vides au moment de l'écriture : les colonnes obligatoires ajoutées ont une valeur par défaut.

-- Comptes bancaires (n'existaient pas : envelope_accounts et account_kind étaient sans effet).
create table bank_accounts (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  name text not null,
  hue numeric(6,2) not null default 0,
  is_default boolean not null default false,
  opening_balance numeric(12,2) not null default 0,
  opening_month text not null,
  in_budget boolean not null default true,
  archived boolean not null default false,
  -- Type de compte (spec 0010). Défaut « courant » ; null = pas encore décidé (le domaine distingue les deux).
  kind text default 'courant' check (kind in ('courant', 'epargne', 'invest', 'enveloppe')),
  -- Compte de type « enveloppe » : l'enveloppe d'origine, conservée après sa suppression (spec 0011).
  envelope_id text,
  opening_confirmed boolean,
  position int not null,
  primary key (user_id, id)
);

-- Réglages : firstMonth vaut null avant l'assistant « Démarrage ».
alter table settings alter column first_month drop not null;
-- Début du pointage : premier mois compté d'après les pointages plutôt que d'après le réel.
alter table settings add column pointage_start text;

-- Mois clôturé par l'utilisateur.
alter table months add column closed boolean;

-- Lignes du modèle et des mois : compte, mode de paiement, compte dédié, jour prévu, mode d'exécution.
alter table template_lines
  add column actual numeric(12,2),
  add column account_id text,
  add column pay_mode text check (pay_mode in ('virtuel', 'especes')),
  add column linked_account_id text,
  add column due_day int check (due_day between 1 and 31),
  add column exec_mode text check (exec_mode in ('prelevement', 'virement_auto', 'virement_manuel', 'retrait', 'informatif'));
alter table budget_lines
  add column account_id text,
  add column pay_mode text check (pay_mode in ('virtuel', 'especes')),
  add column linked_account_id text,
  add column due_day int check (due_day between 1 and 31),
  add column exec_mode text check (exec_mode in ('prelevement', 'virement_auto', 'virement_manuel', 'retrait', 'informatif'));

-- Allocation par défaut facultative ; une allocation d'un mois peut survivre à son enveloppe supprimée (mois clôturés).
alter table envelopes alter column template_alloc drop not null;
alter table envelope_allocations drop constraint if exists envelope_allocations_user_id_envelope_id_fkey;

-- Transactions : le compte remplace la source « vir / esp » ; l'ordre de la liste est conservé.
alter table transactions drop column source;
alter table transactions
  add column account_id text,
  add column position int not null default 0;

-- Virements : compte de départ et destination (compte bancaire ou ligne d'épargne), ordre conservé.
alter table transfers
  add column from_account_id text not null default 'acc-main',
  add column to_kind text check (to_kind in ('bank', 'saving')),
  add column to_id text,
  add constraint transfers_to_complete check ((to_kind is null) = (to_id is null));
alter table transfers_done add column done boolean not null default true;

alter table planned_items add column position int not null default 0;

-- Pointage d'une ligne pour un mois : une date (« reçu » pour un revenu). Aucun montant stocké.
create table line_checks (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  line_key text not null,
  done_on date not null,
  -- Pointage de l'allocation d'une enveloppe seulement (line_key = 'env:<id>') : compte de destination d'avant la spec 0011.
  account_id text,
  primary key (user_id, month, line_key),
  foreign key (user_id, month) references months on delete cascade
);

-- Relevé bancaire d'un compte, par mois : le solde affiché par la banque, à une date.
create table account_balances (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  month text not null,
  account_id text not null,
  amount numeric(12,2) not null,
  entered_on date not null,
  primary key (user_id, month, account_id),
  foreign key (user_id, month) references months on delete cascade
);

-- Régularisations « écart constaté » : jamais supprimées, seulement annulées.
create table adjustments (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  account_id text not null,
  date date not null,
  amount numeric(12,2) not null check (amount <> 0),
  label text not null default 'écart constaté',
  created_on date not null,
  cancelled_on date,
  position int not null default 0,
  primary key (user_id, id)
);
create index on adjustments (user_id, account_id, date);

-- RLS « own rows » sur les nouvelles tables.
do $$
declare t text;
begin
  foreach t in array array['bank_accounts', 'line_checks', 'account_balances', 'adjustments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "own rows" on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
