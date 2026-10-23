# 0019 — Le réel d'une ligne est un cache dérivé de ses écritures

- Statut : acceptée (décisions du développeur, spec 0019) ; remplace les règles « ligne portée » des [ADR 0014](0014-ligne-portee-par-ses-depenses.md) et [ADR 0016](0016-entrees-d-argent-sur-lignes-de-revenu.md)
- Date : 2026-10-23
- Spec liée : [0019-pointage-fictif-et-soldes-reels](../specs/0019-pointage-fictif-et-soldes-reels.md)

## Contexte
Le réel d'une ligne était une saisie libre, copiée par « Valider le mois » et par le modèle, sauf pour les lignes `var`, `fix`, `cre` et `rev` « portées » par leurs écritures. Les totaux (Budget, bilan, clôture) lisent `Line.actual`.

## Décision
- Le réel d'une ligne est toujours la somme de ses écritures du mois (`domain/lineActuals.derivedActual`) : dépenses `var`/`fix`, entrées `rev`, transferts rattachés pour `epa`/`inv`. Une ligne sans écriture a un réel vide (nul dans les totaux).
- `Line.actual` reste dans le modèle comme **cache** : les totaux le lisent sans changement. Chaque cas d'usage qui ajoute, supprime ou modifie une écriture rappelle `syncLineActual` sur la ligne visée ; `updateLine` ne modifie plus le réel ; `validateMonth` / `undoValidateMonth`, la saisie du réel, `template_lines.actual` et la confirmation « réel remplacé » disparaissent.
- Au chargement, `clearManualActuals` réécrit tous les réels depuis les écritures, compte les réels saisis à la main perdus (réels non nuls) et le store affiche un bandeau unique ; aucune écriture n'est fabriquée. L'opération est pure et idempotente.
- Une ligne `epa`/`inv` sans compte dédié ne peut recevoir aucun transfert : son réel reste vide et son infobulle le dit.
- `month_lines.actual` est conservé en base (cache recalculé).

## Alternatives écartées
- Calculer le réel à la lecture partout : plusieurs dizaines de lectures de `l.actual` à réécrire, sans gain de comportement.
- Retirer `month_lines.actual` : migration lourde pour un champ que les totaux lisent.

## Conséquences
- Toute nouvelle écriture touchant une ligne doit appeler `syncLineActual` (ou passer par `addTransaction`, `addTransfer`, `validateImport`).
- Un test qui veut un réel sans écriture le pose directement sur la ligne (fixture) ; l'application, elle, le recalcule au prochain chargement.
