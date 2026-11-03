-- Spec 0036 : entrée d'argent sur une enveloppe (remboursement, vente). Migration additive, à appliquer après 20261103190000.
-- Nouveau type d'écriture « envin » : écriture entrante sur le compte d'une enveloppe (cible = id de l'enveloppe, source facultative dans `source`).
-- On élargit seulement la contrainte de transactions.type ; aucune colonne ajoutée, aucune reprise de données, aucune suppression.
-- Restauration : remettre la contrainte précédente après avoir supprimé les écritures de type 'envin'.

alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type in ('var', 'env', 'epa', 'fix', 'rev', 'epd', 'envin'));
