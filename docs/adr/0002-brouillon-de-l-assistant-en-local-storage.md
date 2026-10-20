# 0002 — Brouillon de l'assistant conservé en localStorage, hors de BudgetData

- Statut : acceptée
- Date : 2026-10-20
- Spec liée : [0001-initialisation-budget](../specs/0001-initialisation-budget.md)

## Contexte
L'assistant « Démarrage » doit survivre à un rechargement de la page (étape, mois, lignes saisies). Ce brouillon est temporaire : il n'a de sens qu'avant la création du premier mois.

## Décision
Le brouillon est écrit dans `localStorage` sous la clé `budget-perso:setup-draft`, par un petit hook de présentation (`presentation/state/setupDraft.ts`). Il ne passe ni par `BudgetData`, ni par `BudgetRepository`, ni par Supabase. Il n'y a pas de nouveau port : une seule implémentation existe.

Les opérations sur le brouillon (ajouter, modifier, calculer le récapitulatif) sont des fonctions pures dans `application/setup.ts`.

## Alternatives écartées
- Port `DraftRepository` injecté depuis `main.tsx` : cohérent avec le reste, mais une abstraction à une seule implémentation (contraire au garde-fou KISS).
- Brouillon dans `BudgetData` (donc Supabase) : disponible sur plusieurs appareils, mais pollue l'agrégat et le schéma pour un état temporaire.

## Conséquences
- Le brouillon est propre au navigateur : il n'est pas partagé entre appareils.
- Un brouillon illisible est ignoré (on repart d'un brouillon vide).
- Si un second stockage de brouillon apparaît, on pourra extraire un port.
