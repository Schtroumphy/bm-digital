# 0007 — Supabase source de vérité, tables relationnelles et écriture par diff

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-22
- Spec liée : [0012-sauvegarde-supabase](../specs/0012-sauvegarde-supabase.md)

## Contexte
Les données métier (`BudgetData`) vivaient dans `localStorage`, réécrites en entier à chaque changement. Vider le navigateur ou changer d'appareil faisait perdre le budget. Le schéma Supabase existait, en retard sur le domaine.

## Décision
1. Supabase devient la source de vérité des données métier ; `localStorage` n'en garde que le brouillon de l'assistant et le mois affiché ([ADR 0002](0002-brouillon-de-l-assistant-en-local-storage.md)).
2. Le schéma reste **relationnel** (17 tables, `user_id` et RLS « own rows » partout). Une migration de rattrapage (`20261022160000_domain_schema_catchup.sql`) l'aligne sur le domaine sans toucher aux migrations déjà appliquées.
3. `SupabaseRepository` garde les lignes qu'il sait enregistrées et, à chaque `save`, n'envoie que les `upsert` et `delete` qui diffèrent, table par table (suppressions d'abord, enfants avant parents). Les sauvegardes passent une par une dans une file ; l'état connu avance au fur et à mesure des confirmations, donc un réessai envoie exactement ce qui manque.
4. La conversion `BudgetData` ↔ lignes (`supabaseRows.ts`) et le calcul du diff (`application/diff.ts`) sont des fonctions pures. Le repository parle à la base par un port minimal `RemoteTables` (Supabase en production, une copie en mémoire dans les tests).
5. Dépendance runtime ajoutée : `@supabase/supabase-js`.

## Alternatives écartées
- Une ligne JSON par utilisateur : simple, mais écrit tout à chaque changement et n'exploite pas le schéma.
- Réécrire toutes les lignes à chaque sauvegarde : ne passe pas à l'échelle.

## Conséquences
- Seuls les cas indiscernables en base reviennent « absents » : un enregistrement facultatif vide (`checks`, `accountBalances`, `adjustments`) et un `actual: null` d'une ligne de modèle. Une allocation de modèle d'une enveloppe supprimée n'est pas conservée (`deleteEnvelope` la retire déjà).
- Pas de gestion des conflits multi-onglets ni multi-appareils.
- `database.types.ts` a été régénéré après l'application de la migration (appliquée sous la version distante 20261022212402, le fichier local garde le nom 20261022160000).
