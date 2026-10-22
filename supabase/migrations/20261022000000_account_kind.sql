-- Spec 0010 : type de compte bancaire (courant, épargne, invest, enveloppe). Migration additive. Non appliquée.
-- Le type ne sert qu'à classer le compte dans un seul groupe de la clôture : aucun solde ni lien n'en dépend.
-- La table des comptes bancaires n'existe pas encore dans le schéma (en retard sur le domaine, spec 0009 C5) :
-- la colonne est ajoutée seulement si la table est là, sinon elle est à reprendre dans la migration qui la crée.
do $$
begin
  if to_regclass('public.bank_accounts') is not null then
    alter table bank_accounts
      add column if not exists kind text not null default 'courant'
      check (kind in ('courant', 'epargne', 'invest', 'enveloppe'));
  end if;
end $$;
