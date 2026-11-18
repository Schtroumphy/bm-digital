-- Spec 0051 : le détail des opérations (spec 0020) est fusionné dans leur annotation (spec 0047, ADR 0041, ADR 0042).
-- 1. Pour chaque transaction et chaque mouvement ayant un détail non vide (après retrait des espaces) :
--    - sans annotation : l'annotation devient le détail, à l'identique ;
--    - avec une annotation : l'annotation devient « annotation, retour à la ligne, détail » (l'annotation existante n'est jamais écrasée) ;
--    - sans détail : l'annotation n'est pas touchée.
-- 2. Si le texte concaténé dépasse 500 caractères, la migration ÉCHOUE en listant les cas (mois, famille, libellé, longueur) : aucune troncature,
--    rien n'est copié ni retiré. Raccourcir à la main l'annotation ou le détail concerné, puis relancer.
-- 3. Retire les colonnes transactions.detail et account_movements.detail (même migration, après export préalable des textes, validé par le développeur).
--
-- DESTRUCTIVE, sans retour arrière automatique. APPLIQUÉE sur le Supabase distant le 2026-11-18 (ne plus modifier ce fichier). Ordre au déploiement : migration, puis publication de
-- l'application (l'ancienne version lit les colonnes retirées). Ne pas modifier 20261023181632 ni 20261118120000.
-- Relançable seulement après un échec de l'étape 2 : un second passage après un succès échoue, car les colonnes detail n'existent plus.
-- src/domain/database.types.ts a été mis à jour à la main d'après cette migration.

do $$
declare
  r record;
  n_long int := 0;
  report text := '';
begin
  -- Étape 2 : contrôle de la longueur avant toute écriture.
  for r in
    select month, 'transaction' as kind, label, char_length(btrim(annotation) || E'\n' || btrim(detail)) as len
    from transactions
    where btrim(coalesce(annotation, '')) <> '' and btrim(coalesce(detail, '')) <> ''
      and char_length(btrim(annotation) || E'\n' || btrim(detail)) > 500
    union all
    select month, 'mouvement', label, char_length(btrim(annotation) || E'\n' || btrim(detail))
    from account_movements
    where btrim(coalesce(annotation, '')) <> '' and btrim(coalesce(detail, '')) <> ''
      and char_length(btrim(annotation) || E'\n' || btrim(detail)) > 500
    order by 1, 2, 3
  loop
    n_long := n_long + 1;
    report := report || format(E'\n  - %s, %s « %s » : %s caractères', r.month, r.kind, r.label, r.len);
  end loop;
  if n_long > 0 then
    raise exception 'Migration annulée : % opération(s) dépasseraient 500 caractères une fois l''annotation et le détail concaténés (aucune troncature). Raccourcir puis relancer :%', n_long, report;
  end if;

  -- Étape 1 : copie du détail dans l'annotation.
  update transactions
  set annotation = case when btrim(coalesce(annotation, '')) <> '' then btrim(annotation) || E'\n' || btrim(detail) else btrim(detail) end
  where btrim(coalesce(detail, '')) <> '';
  update account_movements
  set annotation = case when btrim(coalesce(annotation, '')) <> '' then btrim(annotation) || E'\n' || btrim(detail) else btrim(detail) end
  where btrim(coalesce(detail, '')) <> '';
end
$$;

-- Étape 3.
alter table transactions drop column detail;
alter table account_movements drop column detail;
