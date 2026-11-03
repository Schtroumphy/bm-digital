-- Spec 0037 : part en espèces d'une enveloppe pour un mois (informative, 0 <= part <= allocation du mois).
-- envelope_allocations.cash_part : montant de l'allocation du mois gardé en espèces ; null = aucune part (comportement actuel).
-- Migration additive : aucune colonne supprimée, aucune contrainte, aucune reprise de données SQL. La conversion des anciennes données
-- (transferts vers « Espèces » en retraits, transferts « Espèces » -> enveloppe en part du mois) est faite au chargement par
-- migrateCashWithdrawals (src/domain/migrate.ts) puis enregistrée par le diff habituel.
-- Un retrait n'a pas de colonne dédiée : c'est un account_movements dont to_account_id vaut la valeur réservée 'especes' (comme 'enveloppes', spec 0016).
-- NON APPLIQUÉE sur le Supabase distant. src/domain/database.types.ts est déjà à jour (colonne cash_part) ; à régénérer pour vérification après application.

alter table envelope_allocations add column if not exists cash_part numeric(12,2);
