-- Spec 0047 (amendée le 2026-11-18) : l'annotation passe de la ligne du mois aux opérations.
-- 1. Ajoute une colonne annotation (text, nullable, 500 caractères max contrôlés par l'application) sur transactions et account_movements.
-- 2. Copie chaque annotation de ligne (budget_lines.annotation, migration 20261113120000) sur chaque opération rattachée à cette ligne dans le mois de la ligne.
--    Une opération est rattachée à une ligne (RG11) si : (a) c'est une transaction de type var/fix/rev/epd/epa dont target = la clé de la ligne, ou un
--    mouvement dont une cible { kind: 'line', key } est la ligne ; (b) c'est une transaction affectée (assigned_account_id) au compte lié d'une ligne
--    d'épargne ou de placement (epa/inv). Les opérations « hors budget » (off_budget) ne sont pas rattachées.
--    Une opération rattachée à plusieurs lignes annotées reçoit les textes concaténés, séparés par un retour à la ligne, dans l'ordre des lignes.
-- 3. Retire budget_lines.annotation.
--
-- Arbitrages du développeur (2026-11-18) :
--  - une annotation de ligne sans aucune opération rattachée dans son mois est PERDUE (risque accepté) ; un NOTICE les liste, sans bloquer ;
--  - si les textes concaténés d'une même opération dépassent 500 caractères, la migration ÉCHOUE et liste les cas : aucune troncature.
--    Dans ce cas, raccourcir les annotations de ligne concernées (ou en retirer) puis relancer ; rien n'est copié ni retiré, et la migration peut être relancée après cet échec (ajouts et retrait conditionnels).
--    Relançable seulement après un échec : un second passage après un succès échoue, car budget_lines.annotation n'existe plus.
--
-- NON APPLIQUÉE sur le Supabase distant. Ordre au déploiement : appliquer cette migration, puis publier l'application
-- (l'ancienne version lit budget_lines.annotation, qui disparaît). src/domain/database.types.ts a été mis à jour à la main d'après cette migration.
-- Pas de retour arrière automatique : les textes copiés ne peuvent pas être reconstitués sur les lignes.

alter table transactions add column if not exists annotation text;
alter table account_movements add column if not exists annotation text;

do $$
declare
  lost record;
  too_long record;
  n_lost int := 0;
  n_long int := 0;
  report text := '';
begin
  -- Opérations rattachées à une ligne annotée : une ligne par couple (ligne, opération).
  create temporary table _ann_attach on commit drop as
    select l.user_id, l.month, l.key as line_key, l.position as line_position, btrim(l.annotation) as text, 'tx'::text as kind, t.id as op_id, t.label as op_label
    from budget_lines l
    join transactions t on t.user_id = l.user_id and t.month = l.month and t.off_budget is distinct from true
    where l.annotation is not null and btrim(l.annotation) <> ''
      and ((t.type in ('var', 'fix', 'rev', 'epd', 'epa') and t.target = l.key)
        or (l.block in ('epa', 'inv') and l.linked_account_id is not null and t.assigned_account_id = l.linked_account_id))
    union
    select l.user_id, l.month, l.key, l.position, btrim(l.annotation), 'mv', m.id, m.label
    from budget_lines l
    join account_movements m on m.user_id = l.user_id and m.month = l.month
    where l.annotation is not null and btrim(l.annotation) <> ''
      and exists (select 1 from jsonb_array_elements(m.targets) e where e->>'kind' = 'line' and e->>'key' = l.key);

  -- Textes concaténés par opération.
  create temporary table _ann_final on commit drop as
    select user_id, kind, op_id, min(op_label) as op_label, min(month) as month,
           string_agg(text, E'\n' order by line_position, line_key) as text
    from _ann_attach
    group by user_id, kind, op_id;

  -- Arbitrage 2 : au-delà de 500 caractères, la migration échoue et liste les cas.
  for too_long in select * from _ann_final where char_length(text) > 500 order by month, op_label loop
    n_long := n_long + 1;
    report := report || format(E'\n  - %s, %s « %s » : %s caractères', too_long.month, case too_long.kind when 'tx' then 'transaction' else 'mouvement' end, too_long.op_label, char_length(too_long.text));
  end loop;
  if n_long > 0 then
    raise exception 'Migration annulée : % opération(s) dépasseraient 500 caractères une fois les annotations de ligne concaténées (aucune troncature). Raccourcir les annotations de ligne concernées puis relancer :%', n_long, report;
  end if;

  -- Arbitrage 1 : une annotation de ligne sans opération rattachée est perdue ; on la signale.
  for lost in
    select l.month, l.name, l.annotation
    from budget_lines l
    where l.annotation is not null and btrim(l.annotation) <> ''
      and not exists (select 1 from _ann_attach a where a.user_id = l.user_id and a.month = l.month and a.line_key = l.key)
    order by l.month, l.position
  loop
    n_lost := n_lost + 1;
    raise notice 'Annotation de ligne perdue (aucune opération rattachée) : % · % : %', lost.month, lost.name, lost.annotation;
  end loop;
  if n_lost > 0 then
    raise notice '% annotation(s) de ligne perdue(s), risque accepté.', n_lost;
  end if;

  update transactions t set annotation = f.text from _ann_final f where f.kind = 'tx' and f.user_id = t.user_id and f.op_id = t.id;
  update account_movements m set annotation = f.text from _ann_final f where f.kind = 'mv' and f.user_id = m.user_id and f.op_id = m.id;
end
$$;

alter table budget_lines drop column if exists annotation;
