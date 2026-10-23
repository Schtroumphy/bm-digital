# 0014 — Ligne fixe ou crédit portée par ses dépenses

- Statut : acceptée (décisions validées par le développeur)
- Date : 2026-10-23
- Spec liée : [0014-depenses-lignes-fixes-et-credits](../specs/0014-depenses-lignes-fixes-et-credits.md)

## Contexte
Une dépense (saisie ou importée) peut maintenant viser une ligne `fix` ou `cre`, qui avait déjà son propre mouvement d'argent (réel du 1er du mois, montant pointé). Compter les deux ferait sortir l'argent deux fois du compte.

## Décision
- Nouveau type de transaction `fix` (cible = clé de la ligne), au compte de la ligne ; un seul type couvre `fix` et `cre`, le bloc est vérifié à l'écriture.
- Une ligne qui porte au moins une dépense est « portée par ses dépenses » : `bankMovements` ne produit plus son mouvement propre (réel, pointage) ; les dépenses, déjà des mouvements de compte, le remplacent. Pointer ou dépointer ne change aucun solde.
- Le réel de la ligne est la somme de ses dépenses, non modifiable à la main ; supprimer la dernière le remet à vide, un réel saisi remplacé n'est pas restauré. Un réel saisi n'est remplacé qu'après confirmation (`addTransaction(..., { replaceActual })` refuse sinon ; une seule confirmation à l'import, `replacedActuals`).
- « Reste à sortir » reste budgétaire et inchangé : une ligne portée non pointée pèse son budget, jamais le réel alimenté par ses dépenses.
- Le compte d'une ligne qui porte des dépenses ne peut pas changer (`CARRIED_ACCOUNT_REFUSAL`), et une dépense est refusée sur une ligne dont le compte est archivé (`expenseLineBlocker`). « Annuler la validation du mois » ne vide pas le réel d'une ligne portée. Risque accepté : la marge compte la sortie deux fois tant que la ligne n'est pas pointée (traité par la spec 0018).
- Import : cible `{ kind: 'line', key }`, proposée seulement pour les lignes du compte résolu ; migration additive qui élargit les `check` de `transactions.type` et `import_rules.target_kind`.

## Alternatives écartées
- Garder le mouvement propre et ignorer la dépense dans les soldes : la dépense est la donnée réelle.
- Un type par bloc (`fix`, `cre`) : aucune règle ne les distingue.
- Restaurer le réel remplacé : exigerait de le stocker, refusé par le développeur.

## Conséquences
- La marge peut être sous-estimée avant le pointage (observable, voulu).
- `database.types.ts` ne change pas (colonnes `text`) ; seule la migration `20261023130410_fixed_line_expenses.sql` doit être appliquée.
