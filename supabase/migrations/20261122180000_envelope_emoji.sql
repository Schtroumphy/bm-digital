-- Spec 0056 : emoji facultatif d'une enveloppe. Migration additive, appliquée sur le Supabase distant le 2026-11-22.
-- src/domain/database.types.ts a été mis à jour à la main d'après cette migration (colonne envelopes.emoji).
-- Pas de ligne = pas d'emoji (null) ; les enveloppes existantes restent valides sans changement.
-- Ordre au déploiement : migration d'abord (déjà faite), puis publication de l'application.
-- Retour arrière : alter table envelopes drop column emoji;

alter table envelopes add column emoji text;
