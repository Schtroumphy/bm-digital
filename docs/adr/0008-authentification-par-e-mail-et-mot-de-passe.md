# 0008 — Authentification par e-mail et mot de passe, sans inscription dans l'application

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-22
- Spec liée : [0012-sauvegarde-supabase](../specs/0012-sauvegarde-supabase.md)

## Contexte
Les données sont rattachées à un utilisateur (RLS). Un seul compte existe aujourd'hui.

## Décision
- Connexion par e-mail et mot de passe (Supabase Auth). Le compte est créé hors application (tableau de bord) ; l'inscription publique est désactivée dans les réglages du projet.
- Port `AuthService` (`application/ports.ts`), adaptateur `infrastructure/supabaseAuth.ts`. `AuthGate` (présentation) n'affiche l'application que pour un utilisateur connecté ; sans session, à l'expiration ou à la déconnexion, l'arbre est retiré et les données en mémoire disparaissent.
- Le navigateur n'utilise que l'URL du projet et la clé publique (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), jamais de clé de service.

## Alternatives écartées
- Lien magique ou OAuth : plus de configuration pour un seul utilisateur.
- Création de compte et mot de passe oublié dans l'application : hors périmètre.

## Conséquences
- Prérequis de déploiement : désactiver l'inscription publique du projet Supabase (réglages Auth). Sans cela, n'importe qui pourrait créer un compte via l'API publique.
- La session est conservée par le client Supabase (dans `localStorage`, hors clé `budget-perso:v1`).
- Réinitialiser le mot de passe se fait dans le tableau de bord Supabase.
