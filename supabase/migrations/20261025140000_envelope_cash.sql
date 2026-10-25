-- Spec 0026 : solde espèces des enveloppes. Migration additive, appliquée après 20261025120000 (spec 0025).
-- transactions.pay_mode : mode de paiement d'une dépense d'enveloppe ('especes'), null = virtuel (aucune reprise de données :
-- les dépenses existantes restent payées en virtuel).
-- envelopes.cash : la colonne garde son nom mais contient désormais les espèces d'ouverture de l'enveloppe, un solde à part du
-- virtuel (D5) ; aucune conversion de valeur en base, la valeur est reprise telle quelle.
-- src/domain/database.types.ts est déjà à jour (colonne pay_mode de transactions) ; à régénérer pour vérification après application.

alter table transactions add column pay_mode text;
