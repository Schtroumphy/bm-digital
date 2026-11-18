# 0042 — Détail fusionné dans l'annotation de l'opération

- Statut : acceptée (décision du développeur, spec 0051)
- Date : 2026-11-18
- Spec liée : [0051-fusion-detail-dans-annotation-des-operations](../specs/0051-fusion-detail-dans-annotation-des-operations.md)
- Complète : [0041](0041-annotation-portee-par-l-operation.md)

## Contexte
Une opération portait deux textes libres : le « détail » (spec 0020, 200 caractères, une ligne) et l'« annotation » (spec 0047, 500 caractères, plusieurs lignes). Le développeur trouve qu'ils font doublon. En base, 26 transactions et 2 mouvements avaient un détail, et aucune opération n'avait à la fois un détail et une annotation.

## Décision
- Un seul texte libre par opération : l'annotation. `Transaction.detail` et `AccountMovement.detail` disparaissent du modèle, des actions, des formulaires et des colonnes SQL.
- Migration `20261118130000_merge_detail_into_annotation.sql` : le détail est copié dans l'annotation (à l'identique si elle était vide ; sinon « annotation, retour à la ligne, détail »), puis les colonnes `transactions.detail` et `account_movements.detail` sont retirées. Si un texte concaténé dépasse 500 caractères, la migration échoue en listant les cas, sans troncature (même règle que l'[ADR 0041](0041-annotation-portee-par-l-operation.md)).
- Les formulaires de saisie et de modification gardent un champ d'une ligne, désormais « Annotation » (`AnnotationInput`, 500 caractères, refusé au-delà). Les retours à la ligne se saisissent par la modale de la spec 0047.
- La recherche de l'écran Opérations et la colonne CSV portent sur l'annotation.
- Les bulles « Détails » (Budget, vue annuelle) sont des récapitulatifs calculés et restent. Celle du Budget affiche l'annotation de chaque entrée ; celle de la vue annuelle et l'écran Comptes n'affichent aucun texte libre.
- `domain/detail.ts` est renommé `domain/note.ts` (`normalizeNote`, `NOTE_MAX` = 200) : il ne sert plus qu'aux notes du mois, qui ne changent pas.

## Alternatives écartées
- Garder les deux champs : doublon, deux lignes grises sous le libellé, deux limites différentes.
- Reprendre le détail dans la seule recherche ou l'afficher à part : le texte serait perdu de l'écran principal.
- Tronquer à 500 caractères à la migration : écarté (aucune perte silencieuse) ; le cas n'existe pas dans les données actuelles.

## Conséquences
- Migration destructive, sans retour arrière automatique ; ordre au déploiement : migration, puis publication de l'application. Appliquée au Supabase distant le 2026-11-18 (après export des 28 textes).
- La convention « colonne `detail` sur les opérations » évoquée dans l'ADR 0041 ne s'applique plus : `annotation` est la seule colonne de texte libre des opérations.
- Les specs 0021, 0022 et 0023 deviennent obsolètes ; 0020 est amendée.
- Le filtre « Détails » de l'écran Opérations, qui affichait la ligne de détail, est supprimé : il n'avait plus d'objet.
