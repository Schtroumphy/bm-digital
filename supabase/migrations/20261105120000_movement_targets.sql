-- Spec 0045 : un virement peut être associé à plusieurs lignes variables (RG3, RG18).
-- account_movements.target_kind / target_key (une seule cible) sont remplacés par targets (jsonb) : une liste d'objets
-- { "kind": "line", "key": "..." } ou { "kind": "env", "id": "..." }. Une liste vide = sans cible.
-- Reprise des données : chaque virement avec une cible devient targets = [cette cible] ; montants et soldes inchangés.
-- Ordre à respecter au déploiement : appliquer cette migration, puis publier l'application (l'ancienne version lit target_kind / target_key).

alter table account_movements add column targets jsonb not null default '[]'::jsonb check (jsonb_typeof(targets) = 'array');

update account_movements
set targets = jsonb_build_array(
  case target_kind
    when 'line' then jsonb_build_object('kind', 'line', 'key', target_key)
    else jsonb_build_object('kind', 'env', 'id', target_key)
  end)
where target_kind is not null and target_key is not null;

alter table account_movements drop constraint if exists account_movements_target_check;
alter table account_movements drop column target_kind;
alter table account_movements drop column target_key;
