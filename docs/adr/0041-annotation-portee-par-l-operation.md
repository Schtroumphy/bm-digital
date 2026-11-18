# 0041 — Annotation portée par l'opération (remplace la 0040)

- Statut : acceptée (décision du développeur, spec 0047 amendée)
- Date : 2026-11-18
- Spec liée : [0047-annotations-de-lignes-du-budget](../specs/0047-annotations-de-lignes-du-budget.md)
- Remplace : [0040](0040-annotation-de-ligne-champ-de-la-ligne-du-mois.md)

## Contexte
L'[ADR 0040](0040-annotation-de-ligne-champ-de-la-ligne-du-mois.md) stockait l'annotation dans la ligne du mois. En ajouter une depuis le Budget la répercutait sur toutes les opérations de la ligne, sans choix, et on ne pouvait pas la modifier pour une seule opération. Le développeur veut une annotation par opération, avec le montant de l'opération rappelé dans le Budget.

## Décision
- Le modèle porte `Transaction.annotation?` et `AccountMovement.annotation?` (texte facultatif, 500 caractères, retours à la ligne conservés). `Line.annotation` disparaît ; `TemplateLine` redevient `Omit<Line, 'actual'>`.
- En base : une colonne `annotation` (text, nullable) sur `transactions` et sur `account_movements`, et retrait de `budget_lines.annotation`. Migration `20261118120000_operation_annotations.sql`. La migration `20261113120000` reste intacte (déjà appliquée).
- L'annotation suit l'opération : supprimée avec elle, conservée quand elle est modifiée. Aucune copie de mois ne crée d'opération, donc aucune annotation n'est recopiée (RG3) et aucun nettoyage dans `initMonth` ou `saveAsTemplate` n'est nécessaire.
- Rattachement d'une opération à une ligne (RG11), calculé à la lecture, jamais stocké : par imputation (transaction de type ligne, ou cible de mouvement) ou par affectation au compte lié d'une ligne d'épargne ou de placement. Les opérations hors budget n'y figurent pas.
- Migration des données : chaque annotation de ligne est copiée sur les opérations rattachées dans le mois de la ligne ; les textes d'une opération rattachée à plusieurs lignes sont concaténés (retour à la ligne, ordre des lignes).
  - Texte de ligne sans opération rattachée : perdu, risque accepté ; un NOTICE les liste.
  - Texte concaténé de plus de 500 caractères : la migration échoue en listant les cas, aucune troncature.

## Alternatives écartées
- Table `operation_annotations` (famille, id, texte) : évite deux colonnes, mais ajoute une table, une jointure et un nettoyage à la suppression d'une opération, pour un texte unique par opération. Les colonnes suivent la convention déjà utilisée pour `detail`.
- Garder l'annotation sur la ligne en plus : deux sources de vérité pour le même rappel, et le défaut d'origine (pas de choix par opération) resterait.
- Tronquer à 500 caractères à la migration, ou exporter les textes orphelins en notes du mois ([ADR 0023](0023-notes-du-mois-dans-une-table-month-notes.md)) : écartés par le développeur au profit de l'échec explicite et de la perte acceptée.

## Conséquences
- Une migration additive (deux colonnes) puis destructive (retrait de la colonne de ligne) : pas de retour arrière automatique, ordre au déploiement : migration, puis publication de l'application. Migration appliquée au Supabase distant.
- Les annotations de ligne sans opération rattachée sont perdues à la migration.
- Une opération rattachée à plusieurs lignes n'a qu'une annotation, affichée sous chacune.
- `database.types.ts` mis à jour à la main d'après la migration. La copie SQL a été vérifiée sur une base Postgres jetable (cas nominal, opérations multiples, orpheline, dépassement de 500 caractères).
