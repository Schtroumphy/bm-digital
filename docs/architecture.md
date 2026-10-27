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
  domain/           entités (types) et règles pures : ledger, budget, goals, dashboard, bank, bankMovements, transfers, lineActuals, migrate, format, empty, seed (tests)
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
  - les soldes d'enveloppes : début + allocation − dépensé (budgétaire, spec 0019) ;
  - les soldes de comptes d'épargne et de placement : début + versé − retraits, ou le relevé saisi s'il existe ;
  - les soldes des comptes bancaires (`bankMonth`) : le **solde réel** (spec 0019), construit uniquement à partir d'écritures réelles : solde de départ + entrées d'argent + sorties d'épargne − dépenses (`var`, `env`, `fix`) ± transferts + régularisations actives. Aucun pointage, réel de ligne ni allocation n'y entre (voir la puce « Pointage fictif et deux soldes ») ;
  - le solde propre d'une enveloppe (`envMonth`) reste budgétaire : début + allocation − dépensé. Le solde réel de son compte (`bankMonth`) ne monte que lorsque l'alimentation est enregistrée par un transfert.
- **Comptes bancaires** (`BudgetData.accounts`) : toujours un compte principal et « Espèces ». Une opération sans `accountId` est sur le compte principal ; changer de principal fige d'abord ces opérations sur l'ancien (toutes les lignes, `var` comprises, le modèle et les transactions). Un compte « hors budget » (`inBudget: false`) est exclu des chiffres du budget (revenus, fixes, crédits, enveloppes, sorties d'épargne) mais reste calculé dans son solde. Exception (spec 0008) : ses dépenses `var` comptent dans le réel de leur ligne ; `realignVariableActuals` (domain/migrate) corrige au chargement les réels détectablement périmés (vides, ou égaux à l'ancien calcul sans les dépenses hors budget) et conserve les saisies manuelles. Les virements ne bougent un solde que s'ils ont un compte bancaire pour destination. Depuis la spec 0009 (amendement 8), une ligne `var` d'un compte hors budget est aussi informative : exclue des totaux du budget, du Reste à sortir et du retard (son réel reste affiché, voir la puce « Pointage »).
- **Mode de paiement par box** (spec 0006) : une ligne `var` porte `payMode?` (`PayMode` : Virtuel par défaut, ou Espèces) et un compte attribué facultatif (`PaymentSetting`, dans `domain/types.ts`). Résolution du compte (RG3, RG4) dans `domain/bank.ts` (`resolveBoxAccountId`) ; cas d'usage dans `application/payment.ts`. `addTransaction` écrit le compte résolu dans la transaction. Une enveloppe n'a plus de mode de paiement depuis la spec 0011 : sa dépense est toujours sur son compte.
- **Compte dédié d'une ligne d'épargne** (spec 0007) : une ligne `epa`/`inv` porte un `linkedAccountId?` (compte bancaire qui reçoit ses versements). Le calcul est dans `domain/bankMovements.ts` (source unique du `Ledger` et du Solde estimé, spec 0009) : au réel, le compte dédié reçoit le réel de ces lignes au 1er du mois et est débité des sorties d'épargne à leur jour ; au pointage, il reçoit le montant compté à la date du pointage ; le solde de la ligne (`accMonth`) reste un calcul séparé. Règles de lien (`canLinkAccount`, `isSavingsWithdrawalAllowed`) dans `domain/bank.ts`, action `setLineLinkedAccount` dans `application/bankAccounts.ts`. Le « solde estimé » affiché dans les blocs Épargnes et Investissements est `estimatedBalance` (domain/budget) : calculé, jamais stocké.
- **Type de compte** (spec 0010) : `BankAccount.kind?` (`courant` par défaut, `epargne`, `invest`, `enveloppe`, le compte d'une enveloppe, spec 0011) ne sert qu'à classer le compte dans un seul groupe de la clôture. Une ligne `epa`/`inv` liée par `linkedAccountId` à un compte existant n'a pas de ligne propre dans la clôture : son compte (`bankMonth`) la représente. `canLinkAccount` exige le bon type (`epargne` pour `epa`, `invest` pour `inv`). Lecture et déduction dans `domain/accountKind.ts` (candidats d'après le nom, jamais écrits sans confirmation), groupes de la clôture dans `domain/closing.ts`, cas d'usage dans `application/accountKinds.ts`.
- **Pointage** (spec 0009, amendement 4) : `MonthData.checks` (date de pointage par ligne, sans montant ; « reçu » pour un revenu), `MonthData.accountBalances` (relevé bancaire daté, un par compte et par mois), `BudgetData.adjustments?` (régularisations « écart constaté », annulables, jamais supprimées) et (`Settings.pointageStart?` a disparu avec la spec 0019) sont facultatifs : aucune migration de version. `Line`/`TemplateLine` portent `dueDay?` et `execMode?`. Un seul solde de départ par compte (onglet Comptes). `domain/bankMovements.ts` liste les mouvements datés d'un compte pour un mois, au réel (`actual`) ou au pointage (`checks`) ; le montant d'une ligne pointée n'est jamais stocké : `countedAmount` (domain/bankMovements) donne son réel s'il existe, sinon son budget, et sert aux mouvements, au Reste à sortir et aux Revenus attendus ; le `Ledger` (réel) et `domain/checkoff.ts` (`monthBalance`, Solde estimé continu : début de mois = fin du précédent, mêmes reports de clôture `bank:<id>`) s'appuient sur cette même liste, d'où l'égalité Solde estimé = solde de l'écran Comptes sur tout mois au réel. À partir de `pointageStart` (posé au premier pointage, modifiable dans l'onglet Comptes, mois clôturé protégé), un mois est compté au pointage. L'écart = relevé − Solde estimé à la date du relevé ; une régularisation active compte dans le Solde estimé et dans le solde du `Ledger`, jamais dans les chiffres du budget. Épargne (`statements`) inchangée. Les revenus se pointent (« reçu » : entrée du Solde estimé) ; non reçus, ils sont des « Revenus attendus » hors Marge. Le pointage d'une ligne `var` sur compte dédié déplace son budget du principal vers le compte dédié dans les deux modes. Allocations d'enveloppes : voir la puce « Une enveloppe = un compte » ci-dessous (spec 0011, qui remplace l'amendement 6). Un compte hors budget n'affecte jamais le principal (ligne `var` pointée, anciens virements « faits ») : il enregistre seul son côté. « Reste à placer » et soldes d'enveloppes du Ledger inchangés. Une ligne `var` dont le compte résolu est hors budget est informative (`isLineInBudget` l'écarte des totaux du budget, du Reste à sortir et de la Marge ; classement calculé, rétroactif ; export CSV avec colonne « Hors budget »). Le détail du principal liste en gris les contreparties ignorées (`ignoredMovements`, fonction pure séparée de `bankMovements`, jamais sommée). Les virements (`transfers`, `transfersDone`) n'ont plus ni interface ni action : leurs données restent lues pour ne pas changer les soldes passés.
- **Une enveloppe = un compte** (spec 0011) : `Envelope.accountId` (obligatoire) désigne un compte `BankAccount` de `kind: 'enveloppe'`, créé, renommé et archivé avec l'enveloppe (`application/envelopes.ts`). L'allocation du mois est un mouvement du compte principal vers ce compte, lu par `bankMovements` pour l'écran Comptes comme pour le Solde estimé : au 1er du mois en mois « au réel », au pointage (`MonthData.checks['env:<id>']`, date seule) en mois « au pointage ». La dépense `env` est toujours sur le compte de l'enveloppe (`addTransaction` impose le compte). Le mouvement est lu depuis les comptes d'enveloppe (`BankAccount.envelopeId`), pas depuis les enveloppes : supprimer une enveloppe vide archive son compte et garde ses allocations passées dans l'historique du principal. Une dépense `var` sur une ligne à compte attribué est aussi figée sur ce compte (`fixedTransactionAccountId`). La case de pointage de l'allocation n'existe qu'en mois « au pointage ». Jusqu'au mois d'ouverture du compte (`envelopeAccountAt`), l'ancien calcul `envMonth` (historique, anciens pointages avec leur compte de destination) reste en lecture. Un compte `enveloppe` est toujours dans le budget, absent des listes de choix (`activeBankAccounts`), sans nom ni type modifiables depuis les Comptes ; il groupe la clôture « Enveloppes » (`closingView`, une ligne par compte, ajustement `bank:<id>`). Supprimer une enveloppe vide archive son compte (jamais effacé).
- **Import CSV des dépenses** (spec 0013) : le port `StatementSource` (`application/ports.ts`) lit un fichier en `StatementReading` ; son implémentation est le lecteur de l'export Linxo, `infrastructure/linxoStatement.ts` (tabulation, repli `;`, montant signé, UTF-8 avec repli Windows-1252, lecteur maison), injectée par `main.tsx` jusqu'à l'écran Dépenses. `domain/statement.ts` porte la normalisation et l'empreinte (date + montant + libellé + notes, catégorie exclue) ; chaque ligne a son compte, donné par la correspondance mémorisée (nom du compte, nom de la connexion) → compte de l'app (`BudgetData.importAccountLinks`, `application/accountLinks.ts`, [ADR 0013](adr/0013-import-linxo-multi-comptes.md)) ; `application/statementImport.ts` prépare l'aperçu (`prepareImport`) et écrit les lignes retenues (`validateImport`), fonctions pures. Les débits deviennent des `Transaction` (dépense, transfert externe) ou des `AccountMovement` (retrait, transfert interne) qui portent `importAccountId`, `fingerprint` et `rank` ([ADR 0010](adr/0010-deduplication-de-l-import-par-compte-d-import-empreinte-et-rang.md)). Le mouvement entre comptes est lu par `bankMovements` dans les deux modes de mois et se gère dans l'onglet Saisie ([ADR 0011](adr/0011-mouvement-entre-comptes-et-bloc-de-gestion.md)) ; le compte d'une dépense `var` importée : [ADR 0012](adr/0012-compte-d-une-depense-importee.md). Les règles « libellé contient X » sont dans `BudgetData.importRules`. L'aperçu liste aussi les entrées d'argent (crédits), non cochables et jamais importées ; `application/importFilters.ts` porte les états de ligne, les filtres (ET entre familles, OU dans une famille), les compteurs, le cochage et l'application en masse, et `refreshPreview` (`statementImport.ts`) refait l'aperçu au retour de la liste des correspondances en gardant les corrections des lignes inchangées. L'import est progressif (amendement 5) : `validateImport(d, preview, newId, { ids, done, marked })` n'écrit que les lignes données, ignore celles déjà importées dans la session et celles dont la clé (compte, empreinte, rang) existe déjà, puis l'aperçu est refait ; l'état « Importée », le compte « traité » (`accountProgress`) et le cumul (`sessionSummary`) vivent dans l'état de l'assistant, rien n'est stocké en plus. Spec 0013, amendements 3 à 5.
- **Dépenses sur lignes fixes et crédits** (spec 0014) : type de transaction `fix` (cible = clé de la ligne, compte de la ligne). `domain/lineExpenses.ts` dit si une ligne est « portée par ses dépenses » ; dans ce cas `bankMovements` ignore son mouvement propre et le réel de la ligne est la somme des dépenses (`addTransaction`, `deleteTransaction`, `updateLine`). « Reste à sortir » n'est pas modifié. L'import propose ces lignes (`ImportTarget` `line`) pour le compte résolu ([ADR 0014](adr/0014-ligne-portee-par-ses-depenses.md)).
- **Détail des écritures** (spec 0020) : `Transaction.detail?` et `AccountMovement.detail?`, texte libre facultatif (200 caractères, espaces retirés, vide = absent) normalisé par `domain/detail.ts` (`normalizeDetail`, réutilisable par les specs 0021 à 0023). Information seule : hors empreinte, rang, soldes et budget. Modifiable aussi sur un mois verrouillé (`setTransactionDetail`, `setAccountMovementDetail`). La recherche de Saisie porte sur le libellé et le détail (`matchesEntrySearch`). Colonnes `detail` ajoutées par `20261023181632_entry_detail.sql`.
- **Date bancaire et entrées d'argent** (spec 0015) : `Transaction.bankDate` et `AccountMovement.bankDate` (facultatifs) sont lus par `bankDateOf` : les soldes rangent une écriture par cette date (repli `month`/`day`), le budget suit le mois de rattachement ([ADR 0015](adr/0015-date-bancaire-contre-mois-de-rattachement.md)). Type `rev` : entrée d'argent sur une ligne `rev`, même modèle de ligne portée que `fix` ([ADR 0016](adr/0016-entrees-d-argent-sur-lignes-de-revenu.md)).
- **Objectifs** (spec 0025) : `Settings` porte `investAccounts?` (lignes comptées pour « Investir », défaut toutes les lignes `inv`), `emergencyDue?` et `investDue?`. `domain/goals.ts` (`goalView`, fonctions pures) calcule pour chaque objectif la valeur au mois de référence, la série réelle sur l'année, le plan linéaire, le statut et les stats ; `application/goals.ts` valide la cible et écrit cible, échéance et comptes cochés. L'écran `presentation/screens/Goals.tsx` ne calcule rien. Colonnes ajoutées par `20261025120000_goals_settings.sql`.
- **Tableau de bord / Accueil** (spec 0027) : écran d'ouverture. `domain/dashboard.ts` (`dashboardView`, `monthTransfers`, fonctions pures) assemble `monthSummary`, `variableRemaining`, `lineRemaining`, `envelopeAlerts`, `goalView` (mois de référence de l'écran Objectifs, indépendant du mois choisi), `lineCounted`/`lineCheck`/`isLate` (virements à faire : lignes `epa`/`inv` hors « informatif » et allocations d'enveloppes > 0, triés par jour prévu) et `planned` (12 mois de l'année) ; il ne recalcule rien. Mois non initialisé : bandeau, donut, variables, enveloppes, prévu et à-faire sont nuls (« — »), patrimoine, objectifs et notes restent. Notes : `MonthData.notes?` (`MonthNote { id, text, done }`), cas d'usage `application/monthNotes.ts` (`addNote`, `toggleNote`, `deleteNote`, texte normalisé comme `normalizeDetail`, modifiables même sur un mois clôturé ou non initialisé : la première note crée l'enregistrement du mois sans l'initialiser), table `month_notes` ([ADR 0023](adr/0023-notes-du-mois-dans-une-table-month-notes.md), migration `20261025160000_month_notes.sql`, écrite, non appliquée), note de plus de 200 caractères refusée. Saisie rapide : `addLineEntry` (ligne `var`) et `addEnvelopeEntry` (dépense `env`, `application/quickEntry.ts`), formulaire partagé `presentation/components/QuickEntryPopup.tsx` (aussi utilisé par `LineQuickEntry` du Budget). `presentation/screens/Dashboard.tsx`, `components/Donut.tsx` (SVG écrit à la main) et `components/MonthNotes.tsx` n'affichent que la vue ; aucun port ni dépendance.
- **Solde espèces des enveloppes, à part du virtuel** (spec 0026, [ADR 0022](adr/0022-solde-especes-d-enveloppe-derive.md)) : `Envelope.cash` est remplacé par `Envelope.openingCash` (espèces d'ouverture, sans plafond lié au virtuel) ; `Transaction.payMode?` (`especes`, absent = virtuel) marque une dépense d'enveloppe payée en espèces. Le virtuel est le compte de l'enveloppe, inchangé. `domain/envelopeCash.ts` dérive le solde espèces (ouverture + transferts `Espèces → compte de l'enveloppe` − dépenses en espèces, ≥ 0) ; rien n'est stocké ; `envelopeTotal` (virtuel + espèces) n'est qu'un chiffre d'affichage. Un transfert `Espèces → enveloppe` (`isCashFunding`, `movementTargets.ts`) débite « Espèces » sans créditer le compte de l'enveloppe et ne remplace pas son allocation ; une dépense en espèces ne bouge aucun compte (`bankMovements`) et compte dans `EnvMonth.spent` sans toucher `EnvMonth.balance`. Clôture, « Disponible » et `envAvailable` lisent le virtuel seul ; les espèces sont hors clôture (limite connue, D2). `domain/envelopeHistory.ts` dérive l'historique en deux listes (Virtuel : mouvements réels du compte ; Espèces) avec solde cumulé, affichées en deux onglets dans le panneau de l'enveloppe ; les deux soldes de départ y sont modifiables (`setEnvelopeOpeningBalance`, `setEnvelopeOpeningCash`, mois de départ ouvert, espèces jamais négatives). L'écran Comptes (cartes du groupe Enveloppes) porte aussi le départ espèces et affiche les espèces en lecture seule et une ligne « Total » (solde réel du compte + espèces, `envelopeAccountTotal`), hors de tout total ou KPI ; le titre du groupe « Enveloppes » porte un sous-titre « avec espèces » (`envelopesGroupTotals`, enveloppes actives). `addTransaction` refuse une dépense en espèces supérieure au solde espèces ; `setEnvelopeOpeningCash` valide l'ouverture ; `migrateEnvelopeOpeningCash` convertit les anciens `cash` (solde additionnel). Colonne `transactions.pay_mode` ajoutée par `20261025140000_envelope_cash.sql` (écrite, non appliquée) ; `envelopes.cash` garde son nom.
- **Opérations affectées à un compte d'épargne** (spec 0028, [ADR 0024](adr/0024-une-operation-sort-du-budget-par-son-affectation.md)) : `Transaction.assignedAccountId?` (types `var`, `fix`, `rev`, compte `epargne` actif et différent du compte propre, `canAssignTo` dans `domain/bank.ts`). Une opération affectée sort du budget (`isTransactionInBudget`, réel de ligne dérivé par `lineEntryAmounts`) mais reste intacte dans les soldes réels ; son `fix`/`rev` est lu à sa date par `estimatedMovements` quand sa ligne est pointée. `domain/assignedOperations.ts` liste et totalise les opérations affectées d'un compte (panneau de l'écran Comptes) et du mois (mention sous le bandeau KPI du tableau de bord, `DashboardView.assigned`, via `monthAssignedSummary`). Poser, changer ou retirer l'affectation passe par `addTransaction` / `updateTransaction` (`TransactionPatch.assignedAccountId`, refusé sur mois verrouillé) ; l'import l'accepte par ligne (`PreviewLine.assignedAccountId`), sans la mémoriser. Colonne `transactions.assigned_account_id` ajoutée par `20261027120000_assigned_account.sql` (écrite, non appliquée).
- **Carte « Épargne » du tableau de bord** (spec 0029) : `DashboardView.savingsAccounts` (`savingsAccountsOf`) liste les comptes bancaires `epargne` puis `invest` du mois choisi avec leurs flux réels (`ledger.bankMonth` : reçu = `in`, dépensé = `out`, évolution = `balance − start`), sans solde ; un compte archivé n'apparaît que s'il a un mouvement ou une opération affectée ; la ligne « Affecté (hors solde) » (comptes `epargne`) vient de `assignedOperations` / `assignedTotals` ; nulle sur mois non initialisé ou sans compte à afficher. Le filtre « Avec évolution » de `SavingsCard` s'appuie sur `hasMovement`. Lecture seule, aucun port. Périmètre différent de « Patrimoine » (comptes et non lignes `epa` / `inv`).
- **Migration** : `migrateBankAccounts` (domain) ajoute les comptes aux données qui n'en ont pas, au chargement, de façon idempotente.
- Les cas d'usage (`application/actions.ts`) sont des fonctions qui modifient une copie des données.
- **Pointage fictif et deux soldes** (spec 0019, [ADR 0017](adr/0017-deux-soldes-reel-et-estime.md), [ADR 0018](adr/0018-transfert-et-anti-double-compte.md), [ADR 0019](adr/0019-reel-de-ligne-derive-des-ecritures.md)) : `domain/bankMovements.ts` expose deux listes de mouvements datés par compte. `realMovements` (écritures seulement : transactions, transferts, régularisations) alimente le solde réel (`Ledger.bankMonth`, relevé, reports de clôture `bank:<id>`). `estimatedMovements` (pointages fictifs au montant compté, contreparties entre comptes, dépenses `var`/`env`/`epa`, transferts) alimente le solde estimé (`checkoff.monthBalance`), toujours calculé « au pointage » : le réglage `pointageStart` et les modes réel/pointage n'existent plus. Un transfert (`AccountMovement`, cible facultative `MovementTarget` ligne ou enveloppe) compte dans les deux ; quand un transfert est rattaché à un poste, il remplace la contrepartie fictive du poste (`domain/movementTargets.ts`, `domain/transfers.ts`). L'isolation des comptes hors budget ne s'applique qu'aux contreparties fictives. « Reste à sortir » et « Revenus attendus » restent budgétaires (budget des lignes). Le réel d'une ligne (`Line.actual`) est un cache de la somme de ses écritures (`domain/lineActuals.ts`, `syncLineActual` appelé par chaque cas d'usage qui change une écriture) ; il n'est jamais saisi, et le chargement (`clearManualActuals`) vide les réels saisis à la main. Écriture rapide d'une ligne : `application/quickEntry.ts`.
- **Disponible à placer (réel)** : `availableReal` (domain/budget) = Reste à placer budgété, corrigé des écarts de revenus du compte principal et des versements d'épargne/placement. Calculé, jamais stocké (spec 0005).
- **Virements internes et « Enveloppes (global) »** (spec 0016, [ADR 0020](adr/0020-seconde-trace-et-appariement-des-virements-internes.md), [ADR 0021](adr/0021-enveloppes-global-valeur-reservee-et-remplacement-des-allocations.md)) : un virement entre deux comptes de l'app est un `AccountMovement` qui garde la trace de ses deux lignes du fichier (champs plats = face débit, `creditTrace` = face crédit ; `domain/internalTransfers.ts`). L'aperçu d'import apparie un débit et un crédit (`pairFaces`, `linkFaces` dans `statementImport.ts`), les affiche en deux lignes liées (`PreviewLine.link`, cases liées par `setChecked`/`syncLinked`) et `validateImport` écrit un mouvement, ou ajoute sa trace à un mouvement « une face » existant (`findCompletable`). La nature `recu` est le crédit d'un virement interne (compte source choisi). « Enveloppes (global) » est la valeur réservée `ENVELOPES_ID` dans `fromAccountId`/`toAccountId`, pas un compte ; un mois qui a un débit « vers enveloppes » n'a plus de contrepartie d'allocation dans le solde estimé. Migration `20261023200904_internal_transfers.sql` (appliquée).
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
- L'écran actif et le mois courant sont un état local de `presentation/App.tsx`. L'écran initial est l'Accueil, c'est-à-dire le Tableau de bord (l'assistant tant que `firstMonth` est `null`).

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

21 tables (dont `month_notes`, spec 0027), définies par `20261020120918_init_schema.sql`, rattrapées sur le domaine par `20261022212402_domain_schema_catchup.sql` (spec 0012), puis complétées par `20261022224005_csv_import.sql` (spec 0013 : `account_movements`, `import_rules`, colonnes d'import de `transactions`), puis `20261022231057_import_account_links.sql` (amendement 1 : `import_account_links`, colonne `category`) : `settings`, `bank_accounts`, `template_lines`, `months`, `budget_lines`, `line_checks`, `account_balances`, `envelopes`, `envelope_allocations`, `envelope_history`, `account_statements`, `transactions`, `transfers`, `transfers_done`, `adjustments`, `planned_items`, `year_closes` et `month_notes` (spec 0027, migration non appliquée). L'ancien fichier `20261021000000_line_checks.sql`, jamais appliqué, a été supprimé : la migration de rattrapage le remplace.

Spec 0019 : `20261023200855_transfers_and_derived_actuals.sql` (appliquée) ajoute la cible facultative d'un transfert (`account_movements.target_kind`, `target_key`) et retire `template_lines.actual` ; `month_lines.actual` est conservé comme cache recalculé et `settings.pointage_start` reste en base, inutilisée.

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
| 12 | Solde estimé continu (toujours au pointage depuis la spec 0019, qui supprime `settings.pointageStart`), solde réel séparé, régularisation tracée, contreparties entre comptes, comptes hors budget isolés (mouvements ignorés listés en gris par `ignoredMovements`, jamais sommés), une enveloppe = un compte (spec 0011) | Un solde de départ, une source de mouvements partagée avec le `Ledger`, écart corrigé sans réécrire l'historique ([ADR 0005](adr/0005-solde-estime-continu-et-regularisation.md), amendée par [ADR 0017](adr/0017-deux-soldes-reel-et-estime.md)) ; une enveloppe = un compte ([ADR 0006](adr/0006-une-enveloppe-un-compte-bancaire.md)). |

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
