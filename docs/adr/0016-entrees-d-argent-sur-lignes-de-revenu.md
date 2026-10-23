# 0016 — Entrées d'argent importées sur une ligne de revenu

- Statut : acceptée (décisions validées par le développeur)
- Date : 2026-10-23
- Spec liée : [0015-revenus-entrees-et-date-bancaire](../specs/0015-revenus-entrees-et-date-bancaire.md)

## Contexte
Les crédits du fichier étaient listés mais jamais importés. Le modèle de la spec 0014 (ligne « portée par ses écritures ») existe déjà pour les lignes fixes et crédits.

## Décision
- Nouveau type de transaction `rev` (cible = clé d'une ligne `rev`, sens entrant), sur le même modèle que `fix` : `domain/lineExpenses.ts` est généralisé (`isCarryingBlock`, `revenueLine`, `carriedLineNote`...). La ligne portée n'a plus son mouvement propre ; son réel est la somme de ses entrées ; réel saisi remplacé après une confirmation unique ; compte non modifiable ; compte archivé refusé.
- « Revenus attendus » reste budgétaire : une ligne `rev` portée non pointée pèse son budget, jamais le réel (risque de marge accepté jusqu'à la spec 0019).
- Import : nature « Revenu » (cible `line`, règles mémorisées incluses) ou « Nouvelle ligne de revenu » (ligne à budget 0 créée dans le mois de rattachement seulement, jamais dans le modèle, jamais dans une règle). Un virement reçu (libellé ou notes) est proposé « Virement reçu » : affiché, jamais importé (spec 0016).
- L'empreinte d'un crédit est préfixée par `+` ; celle d'un débit est inchangée.
- Aucune saisie manuelle d'entrée (spec 0019).

- Deux entrées choisies sur « Nouvelle ligne de revenu » créent deux lignes de même nom (une clé par entrée) ; l'utilisateur peut les renommer, rien ne les fusionne.

## Alternatives écartées
- Un mouvement entre comptes pour les revenus : il exige une source.
- Mettre le sens dans une colonne de plus : le préfixe suffit et ne touche pas les empreintes stockées.

## Conséquences
- Toute lecture qui additionne des transactions par type doit distinguer `rev` (une entrée n'est jamais une dépense) : la liste des dépenses ne totalise que les sorties.
- La spec 0019 simplifiera la notion de ligne portée.
