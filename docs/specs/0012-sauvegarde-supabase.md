# 0012 — Supabase : schéma, connexion et sauvegarde des données

- Statut : implémentée
- Date : 2026-10-22
- Branche prévue : feat/supabase_repository

Spec autonome : l'application repart d'un budget neuf dans Supabase.

## Contexte et objectif

Aujourd'hui toutes les données métier (`BudgetData`) vivent dans `localStorage`, clé `budget-perso:v1`, réécrites en entier à chaque changement (`infrastructure/localRepository.ts`). Vider le navigateur ou changer d'appareil fait perdre le budget.

Objectif : le développeur se connecte avec un compte e-mail + mot de passe, et ses données sont lues et enregistrées dans Supabase, qui devient la source de vérité. Le schéma est rattrapé sur le domaine actuel et utilisable par plusieurs utilisateurs, même si un seul compte existe.

## État des lieux (vérifié)

- Port `BudgetRepository` (`load`, `save`) en place, `main.tsx` injecte le repository. Aucun `SupabaseRepository`, aucune authentification, pas de `@supabase/supabase-js`.
- Base distante (projet `.mcp.json`) : migrations appliquées = `init_schema`, `envelope_accounts` (20261022140905), `account_kind` (20261022141030). `line_checks` (20261021000000) **n'est pas appliquée**. Les 13 tables sont vides : rien à préserver.
- `bank_accounts` n'existe pas : `envelope_accounts` et `account_kind` ont été des no-op (leurs colonnes `envelope_id` et `kind` sont conditionnées à l'existence de la table). La base a déjà `envelopes.account_id` et n'a plus `settings.envelope_account_id`.
- Écarts schéma / domaine (`src/domain/types.ts`) à combler : table des comptes bancaires (nom, teinte, principal, solde et mois d'ouverture, hors budget, archivé, `kind`, `envelopeId`, `openingConfirmed`) ; sur les lignes et le modèle `accountId`, `payMode`, `linkedAccountId` ; `closed` sur le mois ; `accountId` sur les transactions ; comptes source/destination des virements ; `settings.first_month` encore `not null` alors que `firstMonth` peut être `null` ; contenu de `line_checks` (pointages, relevés `account_balances`, régularisations `adjustments`, `pointage_start`, `due_day`, `exec_mode`).

## Périmètre

Inclus :
- Nouvelle migration de rattrapage du schéma (RLS et `user_id` partout).
- Authentification Supabase e-mail + mot de passe, écran de connexion, déconnexion.
- `SupabaseRepository` avec écriture par diff par table, branché dans `main.tsx`.
- Gestion de l'erreur de chargement et de sauvegarde, indicateur d'état d'enregistrement.
- Le brouillon de l'assistant et le mois affiché restent en `localStorage`.

Exclus : reprise des données locales et export JSON (abandonnés : le développeur repart d'un budget neuf), import CSV, revue comptes/objectifs, bilan annuel, mot de passe oublié dans l'application (réinitialisation via le tableau de bord Supabase), création de compte dans l'application, mode hors ligne, conflits multi-onglets et multi-appareils.

## Règles de gestion

- RG1. Sans session Supabase valide, l'application n'affiche aucune donnée métier, seulement l'écran de connexion.
- RG2. L'inscription publique est désactivée sur le projet Supabase ; l'application n'offre aucune création de compte. Le compte unique est créé hors application (tableau de bord).
- RG3. Toute table de données métier porte `user_id` (défaut `auth.uid()`, supprimé en cascade avec l'utilisateur) et une RLS « own rows » qui limite lecture et écriture à `user_id = auth.uid()`. Les nouvelles tables suivent la même règle.
- RG4. Les clés primaires incluent `user_id` : deux utilisateurs peuvent avoir les mêmes identifiants applicatifs.
- RG5. Le schéma stocke sans perte tout `BudgetData` valide, y compris `firstMonth: null`, les comptes (type, enveloppe d'origine), le pointage, les relevés, les régularisations, les clôtures. Sauvegarder puis recharger redonne un `BudgetData` identique.
- RG6. La migration est additive par rapport à celles déjà appliquées : elle ne modifie pas leurs fichiers. Elle crée `bank_accounts` avec `kind` (`courant`, `epargne`, `invest`, `enveloppe`, défaut `courant`) et `envelope_id`. Elle intègre ce que fait `line_checks` sans réintroduire `settings.envelope_account_id` (supprimée par la spec 0011).
- RG7. Après connexion, `load()` renvoie les données de l'utilisateur, ou `null` s'il n'en a aucune : l'application démarre alors sur l'assistant « Démarrage ». Seul `null` signifie « rien d'enregistré » ; une erreur de lecture n'est jamais confondue avec un compte vide.
- RG8. `save()` envoie uniquement les lignes modifiées depuis le dernier état synchronisé (insertions/mises à jour et suppressions), table par table. Le store et les écrans ne changent pas.
- RG9. Des sauvegardes rapprochées s'exécutent dans l'ordre ; une modification n'est jamais perdue silencieusement.
- RG10. En cas d'échec de sauvegarde, une bannière d'erreur s'affiche avec un bouton « Réessayer » ; l'écran n'est pas bloqué et l'utilisateur peut continuer à travailler en mémoire. Le réessai renvoie tout ce qui n'est pas encore enregistré.
- RG11. Un indicateur discret affiche l'état : « Enregistré » ou « Enregistrement… » (et l'erreur de RG10).
- RG12. Échec de chargement (réseau, session) : message d'erreur avec « Réessayer ».
- RG13. Session expirée ou invalide : retour à l'écran de connexion. La déconnexion vide les données en mémoire et ramène à l'écran de connexion.
- RG14. Le brouillon de l'assistant et le mois affiché restent dans `localStorage` (ADR 0002 inchangé). Les données métier n'y sont plus ni lues ni écrites par l'application.
- RG15. Seuls l'URL du projet et la clé publique (anon) sont utilisés par le navigateur, via des variables d'environnement ; aucune clé de service dans le code ni dans le dépôt.
- RG16. Cette spec supprime l'usage de `localRepository` dans `main.tsx`. Le fichier est conservé mais n'est plus utilisé.
- RG17. `src/domain/database.types.ts` est régénéré après la migration.

## Parcours utilisateur

Nominal : ouverture sans session, écran de connexion, saisie e-mail et mot de passe, chargement des données, application affichée avec l'indicateur « Enregistré ». Une modification passe à « Enregistrement… » puis « Enregistré ».

Cas limites :
- Compte sans donnée : assistant « Démarrage ».
- Identifiants invalides : message d'erreur, reste sur la connexion.
- Réseau coupé pendant une modification : bannière d'erreur + « Réessayer », puis retour à « Enregistré » au succès.
- Réseau coupé au chargement : message + « Réessayer », jamais l'assistant vide.
- Session expirée : écran de connexion.
- Déconnexion : écran de connexion, plus aucune donnée affichée.

## Design

Design proposé, à valider (validé dans son principe par le développeur : pas de maquette). Réutiliser `src/presentation/ds/organic.css` et les composants existants.

Écran de connexion (centré, 1440 px) :
```
+------------------------------------------+
|              Budget Perso                |
|        +--------------------------+      |
|        | Connexion                |      |
|        | E-mail       [_________] |      |
|        | Mot de passe [_________] |      |
|        | [ Se connecter ]         |      |
|        | (message d'erreur)       |      |
|        +--------------------------+      |
+------------------------------------------+
```
États : repos ; envoi (bouton désactivé, « Connexion… ») ; erreur (« E-mail ou mot de passe incorrect »).

Indicateur d'enregistrement : petit texte discret fixe (« Enregistré » / « Enregistrement… »), emplacement à fixer à l'implémentation d'après la barre latérale ou l'en-tête existants. Bannière d'erreur : bandeau en haut du contenu, message « Les dernières modifications ne sont pas enregistrées » + [Réessayer], sans bloquer l'écran.

Déconnexion : action « Se déconnecter » discrète (barre latérale ou Réglages, à fixer à l'implémentation).

Chargement : écran d'attente, puis écran d'erreur avec « Réessayer ».

## Impact technique

Domaine : `BudgetData` inchangé.

Application : port d'authentification (session, connexion, déconnexion). Test de contrat réutilisable `BudgetRepository` (dette §8), appliqué à `localRepository` et `SupabaseRepository`. Calcul du diff entre deux `BudgetData` en fonction pure testable.

Infrastructure : `SupabaseRepository` (dernier état synchronisé, diff par table), client Supabase, adaptateur d'authentification. Nouvelle dépendance runtime `@supabase/supabase-js` (validée) ; documenter l'exception à « React uniquement » dans l'architecture.

Présentation : écran de connexion, indicateur d'état, bannière d'erreur, écran de chargement/erreur du store, déconnexion. `main.tsx` compose authentification et repository.

Schéma : voir RG3 à RG6 et RG17. Le fichier `20261021000000_line_checks.sql` n'est pas appliqué et ne doit pas l'être tel quel (il réajouterait `settings.envelope_account_id`) : la nouvelle migration le remplace et le fichier est supprimé (décision du développeur), sans réécrire les migrations déjà appliquées. Inscription publique à désactiver dans les réglages du projet (hors SQL).

Documentation : architecture §1, §5, §8 ; ADR (authentification, Supabase source de vérité, bannière de sauvegarde).

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given aucune session, When j'ouvre l'application, Then seul l'écran de connexion est visible. (Man)
- CA2. Given des identifiants valides, When je me connecte, Then l'application s'affiche avec mes données. (Man)
- CA3. Given des identifiants invalides, When je me connecte, Then un message d'erreur s'affiche et je reste sur la connexion. (Man)
- CA4. Given l'inscription publique, When je tente de créer un compte via l'API publique, Then c'est refusé ; l'application n'a aucun lien d'inscription. (Man)
- CA5. Given deux utilisateurs A et B, When B interroge chaque table, Then il ne voit ni ne modifie aucune ligne de A. (Man, requêtes sur la base)
- CA6. Given la base après migration, When je liste les tables, Then `bank_accounts` existe avec `kind` et `envelope_id`, toutes les tables ont `user_id` et la RLS activée. (Man)
- CA7. Given un `BudgetData` complet (comptes de chaque type, enveloppes, pointages, relevés, régularisations, clôtures, transferts, prévisionnel), When je le sauvegarde puis le recharge, Then il est identique. (Auto sur la conversion domaine ↔ lignes ; Man sur la base réelle)
- CA8. Given `firstMonth: null`, When je sauvegarde puis recharge, Then il est identique. (Auto)
- CA9. Given un compte sans donnée, When je me connecte, Then l'assistant « Démarrage » s'affiche. (Auto sur `load()` = `null`, Man sur l'écran)
- CA10. Given un état synchronisé, When je modifie une ligne, Then seules les lignes de la table concernée modifiées sont envoyées ; sans changement, rien n'est envoyé. (Auto sur le diff)
- CA11. Given des suppressions (ligne, enveloppe, transaction), When je sauvegarde, Then elles sont supprimées en base. (Auto)
- CA12. Given un échec de sauvegarde, When je modifie une donnée, Then la bannière d'erreur apparaît, l'écran reste utilisable, et « Réessayer » renvoie tout ce qui n'était pas enregistré. (Auto avec un repository factice en échec ; Man sur l'écran)
- CA13. Given une modification, When elle est en cours puis terminée, Then l'indicateur passe de « Enregistrement… » à « Enregistré ». (Man)
- CA14. Given un échec de chargement, When l'application démarre, Then un message avec « Réessayer » s'affiche, jamais l'assistant. (Man)
- CA15. Given une session active, When je clique sur « Se déconnecter », Then je reviens à l'écran de connexion sans donnée affichée. (Man)
- CA16. Given l'application, When je modifie une donnée métier, Then `localStorage` n'est ni lu ni écrit pour `budget-perso:v1` ; le brouillon de l'assistant et le mois affiché y restent. (Man)
- CA17. `localRepository` et `SupabaseRepository` passent le même test de contrat `BudgetRepository`. (Auto)
- CA18. Aucune clé de service dans le code ni dans le dépôt ; seules l'URL et la clé publique sont utilisées. (Man)
- CA19. `npm run build` et les tests passent. (Auto)

## Questions ouvertes

Aucune.
