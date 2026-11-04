# 0037 — Le « reste à sortir » (budget − réel) remplace le pointage et le solde estimé

- Statut : acceptée (décisions du développeur, spec 0043) ; amende les [ADR 0005](0005-solde-estime-continu-et-regularisation.md) et [0017](0017-deux-soldes-reel-et-estime.md)
- Date : 2026-11-04
- Spec liée : [0043-remplacer-le-pointage-par-le-reste-a-sortir](../specs/0043-remplacer-le-pointage-par-le-reste-a-sortir.md)

## Contexte
Les ADR 0005 et 0017 reposent sur un pointage manuel (case « l'argent a bougé ») qui alimente un solde estimé à côté du solde réel. Depuis que les opérations sont importées régulièrement, le pointage ne sert plus ; il servait seulement à savoir si le solde tiendrait jusqu'à la fin du mois.

## Décision
- Le pointage et le solde estimé disparaissent : plus de case, de contrepartie fictive, d'écart réel − estimé, de vue « Estimé », de liste grise, de signal « Semblable à un pointage ».
- Le reste d'une ligne vaut `budget − réel` (le réel est la somme des écritures, `Line.actual`), plancher à 0 : un dépassement ne donne pas de reste négatif. Une allocation d'enveloppe : part virtuelle moins les transferts rattachés. Les lignes `var` (y compris à compte dédié) comptent comme une ligne `var` du compte principal.
- Un encart « À venir ce mois-ci » (`domain/comingUp.ts`, fonctions pures, informatif) range les restes par mode d'exécution et donne la marge = solde réel de référence − total des restes.
- Le retard et les tâches du tableau de bord se fondent sur ce reste.
- Le solde réel (ADR 0017, chaîne `realMovements`) est inchangé.
- Les données de pointage (`MonthData.checks`) restent dans le modèle et en base, inertes : chargées et sauvegardées, jamais lues. Aucune migration.

## Alternatives écartées
- Garder le pointage en option : double mécanisme à entretenir, pour un besoin déjà couvert par l'import.
- Supprimer les données et le schéma maintenant : risque de perte, reporté à une spec de nettoyage.

## Conséquences
- Écrans plus simples, un seul solde par compte.
- Les ADR 0005 et 0017 sont amendés pour le solde estimé et le pointage ; leur partie sur la régularisation et le solde réel reste valable.
- Le reste d'une ligne dépend de la qualité de l'import (une écriture non rattachée laisse un reste).
- À faire plus tard : nettoyer `checks`, `LineCheck` et la table `line_checks`.
