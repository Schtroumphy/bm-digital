# 0002 — Choix de l'horizon (LT / MT) à l'ajout d'une épargne

- Statut : implémentée
- Date : 2026-10-20
- Branche prévue : feat/savings_horizon_on_add

## Contexte et objectif

L'assistant « Démarrage » (spec 0001) permet déjà de choisir l'horizon LT ou MT de chaque épargne. Dans l'écran Budget, le bouton « Ajouter » du bloc « Épargnes » crée une ligne « Nouvelle ligne » qui reprend la section de la dernière ligne du bloc : l'horizon est subi (celui de la dernière ligne, ou aucun s'il n'y a pas de ligne). Objectif : choisir l'horizon au moment de l'ajout.

## Périmètre

Inclus :
- Écran Budget, bloc « Épargnes » : le bouton « Ajouter » ouvre un menu « Long terme » / « Moyen terme ».

Exclus :
- Changer l'horizon d'une ligne existante.
- Les autres blocs (revenus, crédits, dépenses, investissements) : leur « Ajouter » reste inchangé.
- Autres écrans, assistant « Démarrage », modèle de budget (`template`) : inchangés.
- Nouveau champ de données ou migration.

## Règles de gestion

- RG1. Dans le bloc « Épargnes », un clic sur « Ajouter » ouvre un petit menu (style `popmenu`) avec deux choix : « Long terme » et « Moyen terme ». Aucun choix n'est pré-sélectionné ; aucune ligne n'est créée avant le choix.
- RG2. « Long terme » crée la ligne dans la section « Épargne long terme » ; « Moyen terme » dans « Épargne moyen terme » (mêmes libellés que l'assistant).
- RG3. La ligne créée est nommée « Nouvelle ligne », budget 0 €, réel vide, et son nom passe en édition immédiatement (comportement actuel).
- RG4. Si la section choisie contient déjà des lignes, la nouvelle ligne est placée à la suite de la dernière ligne de cette section. Sinon la section est créée et placée à la fin du bloc « Épargnes ».
- RG5. Fermer le menu sans choisir (clic ailleurs, Échap) ne crée rien.
- RG6. Si le mois est verrouillé, « Ajouter » reste désactivé et n'ouvre pas de menu (comportement actuel).
- RG7. L'horizon est représenté uniquement par la section de la ligne : pas de nouveau champ, pas de migration, `template` non modifié.
- RG8. Les autres blocs gardent leur ajout direct sans menu.

Hypothèses à valider (non confirmées explicitement) :
- H1. LT = « Épargne long terme » et MT = « Épargne moyen terme », comme dans l'assistant.
- H2. Les épargnes déjà saisies gardent leur section, rien n'est migré.
- H3. Le menu fonctionne aussi quand le bloc ne contient aucune ligne d'épargne.

## Parcours utilisateur

Nominal : l'utilisateur clique « Ajouter » dans « Épargnes », choisit « Moyen terme » ; une ligne apparaît dans « Épargne moyen terme », son nom est en édition.

Cas limites :
- Menu fermé sans choix : rien n'est créé (RG5).
- Bloc sans épargne : le choix crée la section (RG4, H3).
- Section choisie absente alors que l'autre existe : nouvelle section en fin de bloc (RG4).
- Mois verrouillé : bouton inactif (RG6).

## Design

Design proposé, à valider. Réutilise `popmenu` / `popmenu-item` (`src/presentation/app.css`), le bouton `add-btn` existant et les tokens de `organic.css`. Aucune maquette existante.

```
Bloc Épargnes
 Nom                    Budget   Réel   Écart
 Épargne long terme
  Livret A               300 €    300 €   0 €
 Épargne moyen terme
  Lydia Holidays         100 €    100 €   0 €
 ┌──────────────┐
 │ Long terme   │   <- menu ouvert au-dessus/à côté du bouton
 │ Moyen terme  │
 └──────────────┘
 (+) Ajouter             Totaux …
```

États : fermé (bouton seul), menu ouvert (2 items, survol grisé léger), verrouillé (bouton `is-disabled`, pas de menu), après choix (ligne en édition).

## Impact technique

- Domaine : aucun changement de type.
- Application : l'action d'ajout de ligne accepte une section cible (optionnelle pour les autres blocs) et applique RG4.
- Infrastructure / Supabase : aucun.
- Présentation : `Budget.tsx`, pied du bloc « Épargnes » : ouverture du menu (RG1) puis création et passage en édition.

## Critères d'acceptation

Automatisés (Vitest, `actions.test.ts`) : CA2 à CA5. Les autres sont vérifiés à la relecture de l'UI.

- CA1. Given l'écran Budget, When je clique « Ajouter » dans « Épargnes », Then un menu « Long terme » / « Moyen terme » s'affiche sans option pré-sélectionnée et aucune ligne n'est créée.
- CA2. Given le menu ouvert, When je choisis « Long terme », Then une ligne « Nouvelle ligne » (budget 0, réel vide) existe dans la section « Épargne long terme ».
- CA3. Given le menu ouvert, When je choisis « Moyen terme », Then la ligne existe dans « Épargne moyen terme ».
- CA4. Given une section contenant des lignes, When j'y ajoute une épargne, Then elle est placée après la dernière ligne de cette section.
- CA5. Given un bloc sans ligne d'épargne (ou sans la section choisie), When je choisis un horizon, Then la section est créée à la fin du bloc avec la nouvelle ligne.
- CA6. Given le menu ouvert, When je ferme sans choisir, Then aucune ligne n'est créée.
- CA7. Given un mois verrouillé, When je regarde le bouton « Ajouter » d'Épargnes, Then il est inactif et n'ouvre pas de menu.
- CA8. Given les blocs autres qu'Épargnes, When je clique « Ajouter », Then la ligne est créée directement comme avant.
- CA9. Given une ligne créée, Then son nom est en édition et le `template` n'a pas changé.

## Questions ouvertes

Aucune ; hypothèses H1 à H3 à valider avec la spec.
