-- Spec 0042 : entrée d'argent sur un compte courant hors budget (ex. Swile). Migration additive, à appliquer après 20261103215845.
-- Nouveau type d'écriture « accin » : écriture entrante sur un compte (cible = id du compte, source facultative dans `source`).
-- On élargit seulement la contrainte de transactions.type ; aucune colonne ajoutée, aucune reprise de données, aucune suppression.
-- La contrainte garde tous les types déjà autorisés en base, 'epd' et 'envin' compris.
-- Restauration : remettre la contrainte précédente après avoir supprimé les écritures de type 'accin'.

alter table transactions drop constraint transactions_type_check;
alter table transactions add constraint transactions_type_check check (type in ('var', 'env', 'epa', 'fix', 'rev', 'epd', 'envin', 'accin'));
