# 0009 — Bannière d'erreur de sauvegarde avec réessai

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-22
- Spec liée : [0012-sauvegarde-supabase](../specs/0012-sauvegarde-supabase.md)

## Contexte
Avec une base distante, une sauvegarde peut échouer (réseau, session). Le store enregistre à chaque changement, sans file d'attente visible.

## Décision
`createSaveTracker` (`application/saveTracker.ts`, fonction pure testable) suit les sauvegardes et publie un état : `saving`, `saved` ou `error`. Le store l'expose avec `retrySave`. L'écran affiche un indicateur discret (barre latérale) et, en erreur, une bannière « Les dernières modifications ne sont pas enregistrées » avec « Réessayer », sans bloquer le travail en mémoire. Un échec de chargement affiche un écran d'erreur avec « Réessayer », jamais l'assistant vide.

## Alternatives écartées
- Fenêtre bloquante : empêche de continuer à travailler.
- Réessai automatique silencieux : l'utilisateur ne saurait pas que ses données ne sont pas enregistrées.

## Conséquences
- Le réessai repose sur le repository : `save` renvoie tout ce qui n'est pas encore enregistré (contrat du port).
- Pas de mode hors ligne : fermer l'onglet en erreur perd les modifications non enregistrées.
