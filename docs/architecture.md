# Architecture — Budget Perso

## 1. Vue d'ensemble

Budget Perso est une application de budget personnel, **desktop uniquement (1440 px)** et **en français**. Elle remplace un Google Sheet et implémente le design Claude Design (`design/project/Budget Perso.dc.html`).

| Élément | Choix |
| --- | --- |
| UI | React 19 |
| Langage | TypeScript 5.9 |
| Build / dev | Vite 8 (port 5180) |
| Tests | Vitest 5 |
| Dépendances runtime | React, React DOM et `@supabase/supabase-js` (exception validée, spec 0012) ; pas de routeur, pas de lib d'état |
| Persistance | Supabase (source de vérité, authentification e-mail + mot de passe) ; `localStorage` pour le brouillon de l'assistant et le mois affiché |

## 2. Structure des dossiers

Le projet suit la **clean architecture**, les principes **SOLID** et **KISS**.

```
src/
  main.tsx          racine de composition : choisit le repository et l'injecte
  domain/           entités (types) et règles pures : ledger, budget, bank, migrate, format, empty, seed (tests)
  application/      cas d'usage (actions, setup de l'assistant) et ports (BudgetRepository)
  infrastructure/   implémentations des ports : supabaseRepository (+ rows, remote, auth, client), localRepository (conservé, plus utilisé)
  presentation/     App, screens, components, state (store, ui), ds, app.css
supabase/
  migrations/       schéma SQL et RLS
docs/               documentation
design/             handoff et prototype Claude Design
```

### Règle de dépendance

Les dépendances vont toujours vers l'intérieur.

```mermaid
flowchart LR
  main["main.tsx (composition)"] --> presentation
  main --> infrastructure
  presentation --> application
  infrastructure --> application
  application --> domain
  presentation --> domain
```

- `domain` ne dépend de rien.
- `application` dépend de `domain`.
- `infrastructure` implémente les ports d'`application`.
- `presentation` appelle `application` et `domain`, jamais `infrastructure`.
- Seul `main.tsx` connaît les implémentations concrètes.

### SOLID

| Principe | Application dans le projet |
| --- | --- |
| **S** | Un fichier, une responsabilité : `Ledger` calcule, `actions` mute, le store orchestre, `supabaseRepository` persiste. |
| **O** | Ajouter un `SupabaseRepository` n'a changé ni les actions ni les écrans (le store n'a gagné que l'état de sauvegarde). |
| **L** | Tout `BudgetRepository` est interchangeable : `load` renvoie les données ou `null`, `save` écrit l'agrégat. |
| **I** | Ports petits et ciblés : `BudgetRepository` n'a que `load` et `save`. |
| **D** | Le store dépend du port `BudgetRepository` et reçoit `repository` et `initialData` par props. |

### KISS : garde-fous

- Un seul agrégat `BudgetData` et un seul repository, pas un repository par entité.
- Pas de conteneur d'injection, de bus d'événements ni de lib d'état.
- Un cas d'usage est une fonction pure, pas une classe.
- On n'ajoute une couche ou une abstraction que si deux implémentations existent ou sont prévues.

## 3. Modèle de domaine

- Un seul agrégat sérialisable, `BudgetData` (version 1). `firstMonth` vaut `null` tant que l'assistant n'a pas créé le premier mois. Il contient le modèle de budget, les mois, les enveloppes, l'historique importé, les relevés de comptes, les transactions, les virements, le prévisionnel, les clôtures et les réglages.
- Six blocs de budget : `rev`, `cre`, `fix`, `var`, `epa`, `inv`. Une `Line` a une `key` stable d'un mois à l'autre.
- `Ledger` calcule mois par mois :
  - les soldes d'enveloppes : jusqu'au mois de départ du compte de l'enveloppe, début + allocation − dépensé ; à partir de ce mois, le solde de son compte (`bankMonth`, spec 0011) ;
  - les soldes de comptes d'épargne et de placement : début + versé − retraits, ou le relevé saisi s'il existe ;
  - les soldes des comptes bancaires (`bankMonth`) : solde de départ + revenus réels + sorties d'épargne + virements « faits » reçus − dépenses (`var`, `env`) − réel des lignes `fix`, `cre`, `epa`, `inv` − virements « faits » envoyés (+ régularisations actives, pointage des lignes `var` vers un compte dédié et compte dédié d'une ligne d'épargne qui reçoit le montant compté à la date du pointage, voir les puces « Compte dédié » et « Pointage » ci-dessous).
- **Comptes bancaires** (`BudgetData.accounts`) : toujours un compte principal et « Espèces ». Une opération sans `accountId` est sur le compte principal ; changer de principal fige d'abord ces opérations sur l'ancien (toutes les lignes, `var` comprises, le modèle et les transactions). Un compte « hors budget » (`inBudget: false`) est exclu des chiffres du budget (revenus, fixes, crédits, enveloppes, sorties d'épargne) mais reste calculé dans son solde. Exception (spec 0008) : ses dépenses `var` comptent dans le réel de leur ligne ; `realignVariableActuals` (domain/migrate) corrige au chargement les réels détectablement périmés (vides, ou égaux à l'ancien calcul sans les dépenses hors budget) et conserve les saisies manuelles. Les virements ne bougent un solde que s'ils ont un compte bancaire pour destination. Depuis la spec 0009 (amendement 8), une ligne `var` d'un compte hors budget est aussi informative : exclue des totaux du budget, du Reste à sortir et du retard (son réel reste affiché, voir la puce « Pointage »).
- **Mode de paiement par box** (spec 0006) : une ligne `var` porte `payMode?` (`PayMode` : Virtuel par défaut, ou Espèces) et un compte attribué facultatif (`PaymentSetting`, dans `domain/types.ts`). Résolution du compte (RG3, RG4) dans `domain/bank.ts` (`resolveBoxAccountId`) ; cas d'usage dans `application/payment.ts`. `addTransaction` écrit le compte résolu dans la transaction. Une enveloppe n'a plus de mode de paiement depuis la spec 0011 : sa dépense est toujours sur son compte.
- **Compte dédié d'une ligne d'épargne** (spec 0007) : une ligne `epa`/`inv` porte un `linkedAccountId?` (compte bancaire qui reçoit ses versements). Le calcul est dans `domain/bankMovements.ts` (source unique du `Ledger` et du Solde estimé, spec 0009) : au réel, le compte dédié reçoit le réel de ces lignes au 1er du mois et est débité des sorties d'épargne à leur jour ; au pointage, il reçoit le montant compté à la date du pointage ; le solde de la ligne (`accMonth`) reste un calcul séparé. Règles de lien (`canLinkAccount`, `isSavingsWithdrawalAllowed`) dans `domain/bank.ts`, action `setLineLinkedAccount` dans `application/bankAccounts.ts`. Le « solde estimé » affiché dans les blocs Épargnes et Investissements est `estimatedBalance` (domain/budget) : calculé, jamais stocké.
- **Type de compte** (spec 0010) : `BankAccount.kind?` (`courant` par défaut, `epargne`, `invest`, `enveloppe`, le compte d'une enveloppe, spec 0011) ne sert qu'à classer le compte dans un seul groupe de la clôture. Une ligne `epa`/`inv` liée par `linkedAccountId` à un compte existant n'a pas de ligne propre dans la clôture : son compte (`bankMonth`) la représente. `canLinkAccount` exige le bon type (`epargne` pour `epa`, `invest` pour `inv`). Lecture et déduction dans `domain/accountKind.ts` (candidats d'après le nom, jamais écrits sans confirmation), groupes de la clôture dans `domain/closing.ts`, cas d'usage dans `application/accountKinds.ts`.
- **Pointage** (spec 0009, amendement 4) : `MonthData.checks` (date de pointage par ligne, sans montant ; « reçu » pour un revenu), `MonthData.accountBalances` (relevé bancaire daté, un par compte et par mois), `BudgetData.adjustments?` (régularisations « écart constaté », annulables, jamais supprimées) et `Settings.pointageStart?` sont facultatifs : aucune migration de version. `Line`/`TemplateLine` portent `dueDay?` et `execMode?`. Un seul solde de départ par compte (onglet Comptes). `domain/bankMovements.ts` liste les mouvements datés d'un compte pour un mois, au réel (`actual`) ou au pointage (`checks`) ; le montant d'une ligne pointée n'est jamais stocké : `countedAmount` (domain/bankMovements) donne son réel s'il existe, sinon son budget, et sert aux mouvements, au Reste à sortir et aux Revenus attendus ; le `Ledger` (réel) et `domain/checkoff.ts` (`monthBalance`, Solde estimé continu : début de mois = fin du précédent, mêmes reports de clôture `bank:<id>`) s'appuient sur cette même liste, d'où l'égalité Solde estimé = solde de l'écran Comptes sur tout mois au réel. À partir de `pointageStart` (posé au premier pointage, modifiable dans l'onglet Comptes, mois clôturé protégé), un mois est compté au pointage. L'écart = relevé − Solde estimé à la date du relevé ; une régularisation active compte dans le Solde estimé et dans le solde du `Ledger`, jamais dans les chiffres du budget. Épargne (`statements`) inchangée. Les revenus se pointent (« reçu » : entrée du Solde estimé) ; non reçus, ils sont des « Revenus attendus » hors Marge. Le pointage d'une ligne `var` sur compte dédié déplace son budget du principal vers le compte dédié dans les deux modes. Allocations d'enveloppes : voir la puce « Une enveloppe = un compte » ci-dessous (spec 0011, qui remplace l'amendement 6). Un compte hors budget n'affecte jamais le principal (ligne `var` pointée, anciens virements « faits ») : il enregistre seul son côté. « Reste à placer », part `cash` et soldes d'enveloppes du Ledger inchangés. Une ligne `var` dont le compte résolu est hors budget est informative (`isLineInBudget` l'écarte des totaux du budget, du Reste à sortir et de la Marge ; classement calculé, rétroactif ; export CSV avec colonne « Hors budget »). Le détail du principal liste en gris les contreparties ignorées (`ignoredMovements`, fonction pure séparée de `bankMovements`, jamais sommée). Les virements (`transfers`, `transfersDone`) n'ont plus ni interface ni action : leurs données restent lues pour ne pas changer les soldes passés.
- **Une enveloppe = un compte** (spec 0011) : `Envelope.accountId` (obligatoire) désigne un compte `BankAccount` de `kind: 'enveloppe'`, créé, renommé et archivé avec l'enveloppe (`application/envelopes.ts`). L'allocation du mois est un mouvement du compte principal vers ce compte, lu par `bankMovements` pour l'écran Comptes comme pour le Solde estimé : au 1er du mois en mois « au réel », au pointage (`MonthData.checks['env:<id>']`, date seule) en mois « au pointage ». La dépense `env` est toujours sur le compte de l'enveloppe (`addTransaction` impose le compte). Le mouvement est lu depuis les comptes d'enveloppe (`BankAccount.envelopeId`), pas depuis les enveloppes : supprimer une enveloppe vide archive son compte et garde ses allocations passées dans l'historique du principal. Une dépense `var` sur une ligne à compte attribué est aussi figée sur ce compte (`fixedTransactionAccountId`). La case de pointage de l'allocation n'existe qu'en mois « au pointage ». Jusqu'au mois d'ouverture du compte (`envelopeAccountAt`), l'ancien calcul `envMonth` (historique, anciens pointages avec leur compte de destination) reste en lecture. Un compte `enveloppe` est toujours dans le budget, absent des listes de choix (`activeBankAccounts`), sans nom ni type modifiables depuis les Comptes ; il groupe la clôture « Enveloppes » (`closingView`, une ligne par compte, ajustement `bank:<id>`). Supprimer une enveloppe vide archive son compte (jamais effacé).
- **Import CSV des dépenses** (spec 0013) : le port `StatementSource` (`application/ports.ts`) lit un fichier en `StatementReading` ; son implémentation est le lecteur de l'export Linxo, `infrastructure/linxoStatement.ts` (tabulation, repli `;`, montant signé, UTF-8 avec repli Windows-1252, lecteur maison), injectée par `main.tsx` jusqu'à l'écran Dépenses. `domain/statement.ts` porte la normalisation et l'empreinte (date + montant + libellé + notes, catégorie exclue) ; chaque ligne a son compte, donné par la correspondance mémorisée (nom du compte, nom de la connexion) → compte de l'app (`BudgetData.importAccountLinks`, `application/accountLinks.ts`, [ADR 0013](adr/0013-import-linxo-multi-comptes.md)) ; `application/statementImport.ts` prépare l'aperçu (`prepareImport`) et écrit les lignes retenues (`validateImport`), fonctions pures. Les débits deviennent des `Transaction` (dépense, transfert externe) ou des `AccountMovement` (retrait, transfert interne) qui portent `importAccountId`, `fingerprint` et `rank` ([ADR 0010](adr/0010-deduplication-de-l-import-par-compte-d-import-empreinte-et-rang.md)). Le mouvement entre comptes est lu par `bankMovements` dans les deux modes de mois et se gère dans l'onglet Saisie ([ADR 0011](adr/0011-mouvement-entre-comptes-et-bloc-de-gestion.md)) ; le compte d'une dépense `var` importée : [ADR 0012](adr/0012-compte-d-une-depense-importee.md). Les règles « libellé contient X » sont dans `BudgetData.importRules`. L'aperçu liste aussi les entrées d'argent (crédits), non cochables et jamais importées ; `application/importFilters.ts` porte les états de ligne, les filtres (ET entre familles, OU dans une famille), les compteurs, le cochage et l'application en masse, et `refreshPreview` (`statementImport.ts`) refait l'aperçu au retour de la liste des correspondances en gardant les corrections des lignes inchangées. L'import est progressif (amendement 5) : `validateImport(d, preview, newId, { ids, done, marked })` n'écrit que les lignes données, ignore celles déjà importées dans la session et celles dont la clé (compte, empreinte, rang) existe déjà, puis l'aperçu est refait ; l'état « Importée », le compte « traité » (`accountProgress`) et le cumul (`sessionSummary`) vivent dans l'état de l'assistant, rien n'est stocké en plus. Spec 0013, amendements 3 à 5.
- **Migration** : `migrateBankAccounts` (domain) ajoute les comptes aux données qui n'en ont pas, au chargement, de façon idempotente.
- Les cas d'usage (`application/actions.ts`) sont des fonctions qui modifient une copie des données.
- **Disponible à placer (réel)** : `availableReal` (domain/budget) = Reste à placer budgété, corrigé des écarts de revenus du compte principal et des versements d'épargne/placement. Calculé, jamais stocké (spec 0005).
- **Clôture d'un mois** : `MonthData.closed` verrouille un seul mois (`isMonthLocked` = année clôturée ou mois clôturé). Cas d'usage dans `application/monthClosing.ts` : clôture refusée si le mois précédent initialisé n'est pas clôturé ou si le disponible ≠ 0, seul le dernier mois clôturé se rouvre ([ADR 0004](adr/0004-cloture-d-un-mois-par-un-indicateur-sur-le-mois.md)).
- **Clôture d'année** : elle verrouille les mois de l'année. Janvier suivant repart des soldes du 31 décembre, ajustables via `YearClose.overrides`.

## 4. État et flux de données

```mermaid
sequenceDiagram
  participant S as Écran
  participant St as StoreProvider
  participant D as application/actions
  participant L as Ledger
  participant R as BudgetRepository

  St->>R: load() au montage
  R-->>St: BudgetData, null (compte vide) ou erreur (écran « Réessayer »)
  S->>St: update(fn)
  St->>D: fn sur un structuredClone
  St->>L: nouveau Ledger (useMemo)
  St-->>S: re-render
  St->>R: save(data) via le suivi de sauvegarde (useEffect)
```

- `AuthGate` (présentation) n'affiche le store et l'application que pour un utilisateur connecté ; sinon écran de connexion. La déconnexion retire l'arbre : les données en mémoire disparaissent.
- `StoreProvider` affiche un écran d'attente pendant le chargement, et un écran d'erreur avec « Réessayer » si la lecture échoue (jamais l'assistant vide).
- Sans données, il utilise `initialData()`, injecté par `main.tsx` : `emptyData` (budget vide, `firstMonth: null`). `seedData` (chiffres de décembre 2026) ne sert plus qu'aux tests.
- Tant que `firstMonth` est `null`, l'application n'affiche que l'écran « Démarrage » (assistant en 9 étapes). `createFirstMonth` (`application/actions.ts`) crée le premier mois à partir du brouillon ; les soldes de départ des épargnes et enveloppes sont stockés comme soldes de fin du mois précédent (ADR 0001), ceux des comptes bancaires sur le compte lui-même (`openingBalance`).
- Le brouillon de l'assistant vit dans `localStorage` (clé `budget-perso:setup-draft`), hors de `BudgetData` (ADR 0002).
- La sauvegarde se déclenche à chaque changement de `data`, sans debounce, par `createSaveTracker` (`application/saveTracker.ts`) : état `saving` / `saved` / `error` (indicateur dans la barre latérale, bannière avec « Réessayer » en erreur). Le repository n'envoie que le diff.
- `presentation/state/ui.tsx` gère les menus contextuels et popovers, séparément des données.
- L'écran actif et le mois courant sont un état local de `presentation/App.tsx`.

## 5. Données et Supabase

### Interface de persistance

```ts
interface BudgetRepository {
  load(): Promise<BudgetData | null>;
  save(data: BudgetData): Promise<void>;
}
```

C'est un port défini dans `application/ports.ts`, seule porte d'accès à la persistance. `load` renvoie `null` seulement si rien n'est enregistré ; une erreur de lecture rejette. `application/ports.ts` définit aussi `AuthService` (connexion, déconnexion, session). `main.tsx` branche `createSupabaseRepository` et `createSupabaseAuth`. `infrastructure/localRepository.ts` (clé `budget-perso:v1`) n'est plus utilisé par l'application ; il reste dans le dépôt.

### Schéma Supabase

20 tables, définies par `20261020120918_init_schema.sql`, rattrapées sur le domaine par `20261022212402_domain_schema_catchup.sql` (spec 0012), puis complétées par `20261022224005_csv_import.sql` (spec 0013 : `account_movements`, `import_rules`, colonnes d'import de `transactions`), puis `20261022231057_import_account_links.sql` (amendement 1 : `import_account_links`, colonne `category`) : `settings`, `bank_accounts`, `template_lines`, `months`, `budget_lines`, `line_checks`, `account_balances`, `envelopes`, `envelope_allocations`, `envelope_history`, `account_statements`, `transactions`, `transfers`, `transfers_done`, `adjustments`, `planned_items`, `year_closes`. L'ancien fichier `20261021000000_line_checks.sql`, jamais appliqué, a été supprimé : la migration de rattrapage le remplace.

- Chaque table porte un `user_id` (défaut `auth.uid()`, suppression en cascade) dans sa clé primaire.
- La RLS « own rows » limite l'accès à `user_id = auth.uid()`.
- `src/domain/database.types.ts` est généré avec `generate_typescript_types` (à régénérer après chaque migration).
- Le projet Supabase est relié via `.mcp.json`. Le navigateur n'utilise que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (`.env.local`, modèle dans `.env.example`).

### Synchronisation : diff par table ([ADR 0007](adr/0007-supabase-source-de-verite-et-sauvegarde-par-diff.md))

`createSupabaseRepository` (`infrastructure/supabaseRepository.ts`) :

1. garde les lignes qu'il sait enregistrées (`synced`) ;
2. convertit le nouvel agrégat en lignes (`supabaseRows.ts`, fonctions pures) et compare table par table (`application/diff.ts`) ;
3. envoie les suppressions (enfants avant parents) puis les `upsert` (parents avant enfants) de ce qui a changé seulement, par un port minimal `RemoteTables` (`supabaseRemote.ts` en production, `memoryRemote.ts` dans les tests) ;
4. exécute les sauvegardes une par une, et avance `synced` à chaque confirmation : après un échec, la sauvegarde suivante envoie ce qui manque.

Authentification : [ADR 0008](adr/0008-authentification-par-e-mail-et-mot-de-passe.md). Bannière d'erreur : [ADR 0009](adr/0009-banniere-d-erreur-de-sauvegarde-avec-reessai.md).

## 6. Décisions d'architecture

| # | Décision | Raison |
| --- | --- | --- |
| 1 | Clean architecture : domain, application, infrastructure, presentation | Dépendances vers l'intérieur ; le domaine et les cas d'usage se testent seuls avec Vitest. |
| 2 | Contexte React plutôt qu'une lib d'état | Un seul agrégat, app mono-utilisateur, aucune dépendance en plus. |
| 3 | Mutations par `structuredClone` + fonction | Pas de lib d'immutabilité, actions simples à tester. |
| 4 | `Ledger` dérivé, jamais persisté | Les soldes se recalculent depuis `BudgetData` : une seule source de vérité. |
| 5 | `BudgetRepository` comme port, injecté depuis `main.tsx` | Inversion de dépendance : on change de persistance sans toucher aux écrans ni au store. |
| 6 | Sync par diff par table (réalisée, spec 0012) | Écritures minimales sans modifier les actions ni les écrans ([ADR 0007](adr/0007-supabase-source-de-verite-et-sauvegarde-par-diff.md)). |
| 7 | RLS par `user_id`, connexion e-mail + mot de passe | L'isolation des données est garantie par la base, pas par le client ([ADR 0008](adr/0008-authentification-par-e-mail-et-mot-de-passe.md)). |
| 8 | CSS transcrit du prototype sur le design system Organic | Fidélité au design, pas de framework CSS. |
| 9 | Soldes de départ = soldes de fin du mois précédent | Réutilise `statements` et `envHistory`, sans changer le schéma ([ADR 0001](adr/0001-soldes-de-depart-via-le-mois-precedent.md)). |
| 10 | Brouillon de l'assistant en `localStorage`, hors `BudgetData` | État temporaire, une seule implémentation, pas de nouveau port ([ADR 0002](adr/0002-brouillon-de-l-assistant-en-local-storage.md)). |
| 11 | Clôture d'un mois par `MonthData.closed` | Réutilise le garde-fou `isMonthLocked` ([ADR 0004](adr/0004-cloture-d-un-mois-par-un-indicateur-sur-le-mois.md)). |
| 12 | Solde estimé continu, bascule réel / pointage (`settings.pointageStart`), régularisation tracée, contreparties entre comptes, comptes hors budget isolés (mouvements ignorés listés en gris par `ignoredMovements`, jamais sommés), une enveloppe = un compte (spec 0011) | Un solde de départ, une source de mouvements partagée avec le `Ledger`, écart corrigé sans réécrire l'historique ([ADR 0005](adr/0005-solde-estime-continu-et-regularisation.md)) ; une enveloppe = un compte ([ADR 0006](adr/0006-une-enveloppe-un-compte-bancaire.md)). |

## 7. Tests et qualité

- Vitest couvre le domaine et les cas d'usage :
  - `budget.test.ts` vérifie les chiffres du design (reste à placer 2 950 €, épargne brute 2 060 €, taux d'épargne réel 20,2 %) ;
  - `application/actions.test.ts` vérifie les cas d'usage ;
  - `application/budgetRepository.contract.ts` est le test de contrat de `BudgetRepository`, appliqué à `localRepository` et `SupabaseRepository` (`infrastructure/repositories.test.ts`) ; `supabaseRepository.test.ts` couvre le diff, les suppressions et le réessai sur une base en mémoire.
- L'UI n'a pas de tests.
- `npm run build` exécute `tsc --noEmit` puis `vite build` : une erreur de type bloque le build.

## 8. Roadmap et dette technique

- Ajouter des tests d'UI et configurer un linter.
- Gérer les conflits multi-onglets et multi-appareils.
- Aucun support hors desktop 1440 px.

## 9. Workflow Git

Le projet suit **Gitflow**. Chaque feature ou correctif est développé dans sa propre branche.

### Branches

- `main` : production, uniquement des releases et des hotfixes, taguées `vX.Y.Z`.
- `develop` : intégration, point de départ de toutes les features.
- Jamais de commit direct sur `main` ni sur `develop`.

### Nommage

`<type>/<description_en_snake_case>`, en minuscules et sans accents.

| Type | Part de | Revient dans | Exemple |
| --- | --- | --- | --- |
| `feat` | `develop` | `develop` | `feat/initialize_budget` |
| `fix` | `develop` | `develop` | `fix/budget_display` |
| `chore` | `develop` | `develop` | `chore/update_dependencies` |
| `docs` | `develop` | `develop` | `docs/architecture` |
| `release` | `develop` | `main` puis `develop` | `release/1_2_0` |
| `hotfix` | `main` | `main` puis `develop` | `hotfix/envelope_balance` |

### Intégration

- Rebase sur la branche cible, puis fast-forward : l'historique reste linéaire, sans commit de merge.
- **3 commits maximum** par branche de feature, au format gitmoji (skill `commit-gitmoji`).
- Après un `release` ou un `hotfix` dans `main`, on pose le tag et on reporte dans `develop`.

### Skill dédié

Le skill `.claude/skills/git-branch/SKILL.md` applique cette convention : il valide le nom, choisit la branche source et crée la branche. Il refuse de travailler directement sur `main` ou `develop`.
