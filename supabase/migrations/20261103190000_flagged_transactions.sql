-- Drapeau sur une dépense / entrée (filtre « Marquées » de l'écran Saisie). Migration additive, à appliquer après 20261103180000.
-- transactions.flagged : true = marquée par l'utilisateur, null = non marquée. Information seule, aucun chiffre touché.
-- Aucune reprise de données, aucune contrainte, aucune suppression.

alter table transactions add column flagged boolean;
