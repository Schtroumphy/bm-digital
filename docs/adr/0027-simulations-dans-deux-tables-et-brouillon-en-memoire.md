# 0027 — Simulations dans deux tables Supabase, brouillon en mémoire

- Statut : acceptée
- Date : 2026-10-28
- Spec liée : [0034-onglet-simulation](../specs/0034-onglet-simulation.md)

## Contexte
L'onglet Simulation garde plusieurs simulations enregistrées (nom, notes, lignes libres réparties en 7 blocs). Elles doivent survivre au rechargement et suivre l'utilisateur d'un appareil à l'autre. La simulation en cours d'édition, elle, est un brouillon. Le repository sauvegarde par diff table par table ([ADR 0007](0007-supabase-source-de-verite-et-sauvegarde-par-diff.md)).

## Décision
- Deux tables avec `user_id` et RLS « own rows » : `simulations` (`id`, `name`, `notes`, `position`) et `simulation_rows` (`simulation_id`, `id`, `block`, `name`, `amount`, `position`), la seconde liée à la première par une clé étrangère `on delete cascade`. Migration additive `20261028150000_simulations.sql`.
- Domaine : `BudgetData.simulations?: Simulation[]` (absent quand il n'y en a pas, plus récente en tête), `SimulationRow.amount` est le texte saisi (« 1 234,5 »), lu par `simulationAmount` ; le reste à placer n'est jamais stocké, il est recalculé (RG18).
- Le brouillon (`SimulationDraft`) vit dans l'état de `App`, hors de `BudgetData` : conservé en changeant d'onglet, perdu au rechargement, jamais sauvegardé tant que « Enregistrer » n'a pas été cliqué.
- L'unicité du nom (RG22) est vérifiée par l'application (`simulationSaveError`), pas par un index SQL.

## Alternatives écartées
- Une colonne `jsonb` sur `settings` ou une table unique avec les lignes en JSON : une modification renverrait toute la liste, et le schéma ne stocke nulle part ailleurs d'objets imbriqués de cette taille (même raisonnement que [ADR 0023](0023-notes-du-mois-dans-une-table-month-notes.md)).
- Montant en `numeric` : il faudrait perdre la saisie en cours (« 12, ») ou stocker un second champ ; le texte garde exactement ce qui est affiché.
- Index unique sur `lower(btrim(name))` : une sauvegarde par diff peut passer par deux noms identiques (échange de noms entre deux simulations) et échouer.
- Brouillon dans `localStorage` ou dans `BudgetData` : la spec veut qu'il soit perdu au rechargement ; un `useState` suffit.

## Conséquences
- Deux tables de plus (24 avec `goals`), une migration additive, appliquée, et `database.types.ts` régénéré.
- Le nom unique n'est pas garanti en base : un autre client qui écrirait directement pourrait créer un doublon.
- Les positions des simulations sont réécrites à chaque ajout en tête (peu de lignes, sans importance).
