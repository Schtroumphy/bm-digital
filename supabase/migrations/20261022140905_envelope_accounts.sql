-- Spec 0011 : une enveloppe = un compte bancaire. Migration additive.
-- Le type de compte « enveloppe » est accepté par la contrainte de 20261022141030_account_kind.sql (appliquée juste après, sans dépendance SQL).

-- Compte bancaire de l'enveloppe (type « enveloppe »), obligatoire côté application (RG1).
alter table envelopes add column account_id text;

-- Enveloppe à laquelle appartient un compte de type « enveloppe » ; conservée après la suppression de l'enveloppe,
-- pour que ses allocations passées restent dans l'historique du compte principal.
-- La table des comptes bancaires n'est pas toujours dans le schéma (en retard sur le domaine, spec 0009 C5) :
-- la colonne est ajoutée seulement si la table est là, sinon elle est à reprendre dans la migration qui la crée.
do $$
begin
  if to_regclass('public.bank_accounts') is not null then
    alter table bank_accounts add column if not exists envelope_id text;
  end if;
end $$;

-- Le réglage « Compte des enveloppes » (spec 0009, RG98) n'existe plus (RG21).
alter table settings drop column if exists envelope_account_id;
