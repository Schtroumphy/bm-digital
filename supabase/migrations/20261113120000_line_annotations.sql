-- Spec 0047 : annotations de lignes du budget. Migration additive, APPLIQUÉE sur le Supabase distant le 2026-11-13 (ne plus modifier ce fichier).
-- Une annotation est un texte facultatif (500 caractères max, contrôlé par l'application) propre à une ligne d'un mois :
-- elle vit dans la ligne du mois (budget_lines), donc disparaît avec elle. Les lignes du modèle (template_lines) n'en ont pas.
-- src/domain/database.types.ts a été mis à jour à la main d'après cette migration.
-- Ordre au déploiement : appliquer cette migration, puis publier l'application.
-- Restauration : alter table budget_lines drop column annotation;

alter table budget_lines add column annotation text;
