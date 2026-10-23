# 0011 — Une enveloppe = un compte (étape B)

- Statut : validée (décisions du développeur du 2026-10-22, voir « Décisions d'implémentation »)
- Date : 2026-10-21
- Branche prévue : feat/account_kind

Étape B de deux. **Dépend de la spec 0010** (type de compte `kind`, dont `enveloppe`, et groupes de la clôture). Elle amende les specs 0006 (compte et mode de paiement des enveloppes) et 0009 (RG88 à RG99 : allocation comme mouvement, « Compte des enveloppes »). PR vers `develop`.

## Contexte et objectif

Aujourd'hui une enveloppe est un solde calculé à part (`Ledger.envMonth` : début + allocation − dépensé), sans lien avec un compte bancaire. L'argent qu'elle réserve reste donc, selon les cas :
- dans le compte principal, qui n'est pas débité de l'allocation : le même argent apparaît dans le solde du principal et dans le solde de l'enveloppe, donc compté deux fois dans le total de la clôture ;
- ou, depuis la spec 0009 (RG88 à RG90), déplacé vers un autre compte, mais seulement quand l'allocation est pointée et que le compte résolu n'est pas le principal. Le solde de l'enveloppe (`envMonth`) reste lui calculé séparément : le double compte persiste dans la clôture (groupe « Enveloppes » en plus du compte).

Objectif : une enveloppe a son propre compte bancaire (type `enveloppe`, spec 0010). L'allocation devient un vrai mouvement du compte principal vers ce compte. Le solde de l'enveloppe est le solde de son compte. La clôture a une seule ligne par enveloppe et l'argent n'est compté qu'une fois.

## Constats dans le code

- C1. `Envelope` étend `PaymentSetting` : son `accountId` est aujourd'hui le « compte attribué » en mode Virtuel, c'est-à-dire le compte qui paie ses dépenses (spec 0006, RG1 à RG5), avec `payMode` (Virtuel / Espèces). Il est facultatif. Ce n'est pas le compte qui détient l'argent de l'enveloppe.
- C2. `Settings.envelopeAccountId` (spec 0009, RG98) est le compte de réception par défaut des allocations, réglé dans Comptes (« Compte des enveloppes »). Il devient inutile (RG21).
- C3. `bankMovements` (spec 0009) ne crée un mouvement d'allocation que si l'allocation est pointée (clé `env:<id>`) et que le compte de destination n'est pas le principal. Une enveloppe qui résout au principal n'a ni case de pointage ni mouvement.
- C4. `Ledger.envMonth` calcule le solde d'une enveloppe sans lire les comptes ; `Closing.tsx` additionne ces soldes (groupe « Enveloppes ») en plus des comptes. Les dépenses `env` payées avec un compte hors budget sont exclues du « dépensé » de l'enveloppe (`ledger.ts`).
- C5. `envHistory` (mois importés avant le premier mois géré) alimente `envMonth` pour les mois antérieurs à `firstMonth`.
- C6. Écrans qui lisent `envMonth` : Enveloppes, Budget (tuiles), Dépenses, Clôture. `EnvelopeCheck` et `resolveEnvelopeAccountId` portent la logique de compte de réception.

## Périmètre

Inclus :
- Chaque enveloppe a un compte de type `enveloppe` (obligatoire), créé et tenu à jour automatiquement avec l'enveloppe.
- L'allocation mensuelle est un mouvement du compte principal vers le compte de l'enveloppe, dans le calcul des soldes (`bankFlow`).
- Le solde d'une enveloppe est celui de son compte ; ses dépenses débitent ce compte.
- Clôture : une ligne par enveloppe, sans double compte.
- Archivage du compte d'une enveloppe supprimée (le compte garde le lien `envelopeId`).
- Retrait du réglage « Compte des enveloppes » (0009, RG98) et du compte attribué / mode des enveloppes (0006).

Exclus :
- Transferts manuels entre enveloppes, ou entre une enveloppe et un autre compte, hors allocation.
- Part `cash` des enveloppes (reste informative, spec 0002 « Exclus »).
- Modification des lignes `epa` / `inv` et de leurs comptes (spec 0010).
- Changement du budget : « Reste à placer », « Disponible (réel) », « Épargne budgétisée », taux d'épargne restent calculés comme aujourd'hui.
- Schéma Supabase hors migration additive de cette spec.

## Règles de gestion

Modèle
- RG1. Chaque enveloppe a un `accountId` obligatoire qui désigne un compte bancaire de type `enveloppe` (spec 0010). Deux enveloppes ne partagent jamais le même compte. Voir Q1 : ce champ avait jusqu'ici le sens « compte qui paie les dépenses » (spec 0006) ; cette spec lui donne le sens « compte de l'enveloppe ».
- RG2. Un compte de type `enveloppe` appartient à une seule enveloppe et ne se choisit pas comme compte courant dans les listes de choix (« Payé avec », compte d'une ligne, compte attribué) hors des dépenses de son enveloppe (RG10).
- RG3. Création d'une enveloppe : son compte est créé en même temps (nom = nom de l'enveloppe, teinte = teinte de l'enveloppe, type `enveloppe`, dans le budget, solde de départ 0 au mois courant). Renommer l'enveloppe renomme son compte. Le nom et le type du compte ne se modifient pas depuis l'onglet Comptes pour un compte `enveloppe` (ils suivent l'enveloppe).
- RG4. Un compte `enveloppe` est toujours « dans le budget » (`inBudget` = oui) : l'option n'est pas proposée (voir Q8). L'isolation des comptes hors budget (spec 0009, RG92) ne s'applique donc pas aux enveloppes.

Allocation
- RG5. Compte source : le compte principal. L'allocation d'une enveloppe pour un mois est un mouvement de `source → compte de l'enveloppe` pour son montant (`alloc` du mois) : débit du principal, crédit du compte de l'enveloppe. Le montant est lu à chaque lecture (comme spec 0009, RG91), jamais copié.
- RG6. Quand le mouvement compte (Q2) : en mode réel, l'allocation du mois compte au 1er du mois, sans action de l'utilisateur ; en mode pointage (spec 0009), elle compte quand elle est pointée, à la date de pointage ; décocher annule. Toutes les enveloppes ont une case de pointage en mode pointage quand leur allocation du mois est > 0 ; la case n'est jamais affichée en mode réel, même déjà cochée. Mois ou année verrouillé : lecture seule.
- RG7. Pas de double comptage : le débit du principal et le crédit de l'enveloppe sont les deux faces d'un même mouvement ; le solde total des comptes ne varie pas par une allocation. Les deux faces sont lues par la même fonction (`bankMovements`) pour l'écran Comptes et le Solde estimé.
- RG8. Une allocation de 0 ne crée aucun mouvement.

Solde et dépenses
- RG9. Le solde d'une enveloppe est le solde de son compte (`bankMonth`) à partir du mois d'ouverture de son compte. `envMonth` n'est plus utilisé pour les enveloppes et les mois où son compte existe ; il reste pour lire les mois antérieurs (RG16).
- RG10. Une dépense `env` est imputée au compte de son enveloppe, qui la débite. « Payé avec » est préselectionné sur ce compte et n'est pas modifiable pour une dépense d'enveloppe (voir Q3). La règle des dépenses payées avec un compte hors budget exclues du dépensé (ledger, C4) disparaît pour les enveloppes.
- RG11. Solde de départ d'un mois = solde de fin du mois précédent du même compte, ou, pour une année clôturée précédente, la base ajustée `bank:<accountId>` (comportement des comptes, spec 0002).
- RG12. Dépenses planifiées (`planned`) et projection `envAvailable` : inchangées en résultat ; elles partent du solde du compte.
- RG13. Aucun solde négatif n'est empêché : une enveloppe peut devenir négative comme aujourd'hui (le compte aussi).

Clôture
- RG14. Le groupe « Enveloppes » de la clôture (spec 0010, RG9) contient une ligne par compte de type `enveloppe`, avec le solde du compte. Il n'y a plus de ligne `env:<id>`. L'ajustement et la base du 1er janvier sont enregistrés sous `bank:<accountId>`. Une année clôturée garde ses bases enregistrées.

Migration (supprimée)
- RG15 à RG20 : supprimées le 2026-10-22. L'application n'est pas encore utilisée : aucune donnée existante à migrer, aucune fonction de migration n'est écrite. Une enveloppe naît avec son compte (RG3, assistant de démarrage, données d'exemple).
- RG16. Historique avant le mois d'ouverture du compte (conservée) : `envHistory` et le calcul d'`envMonth` restent en lecture seule pour les mois antérieurs à l'ouverture du compte de l'enveloppe (affichage des courbes et tuiles) (Q5). À partir du mois d'ouverture, le solde vient du compte.
- RG18 (partielle). Les anciens pointages `env:<id>` d'un mois antérieur à l'ouverture gardent leur compte de destination ; à partir de l'ouverture, ce compte enregistré est ignoré (Q6).

Suppression
- RG21. Réglage « Compte des enveloppes » (spec 0009, RG98) : retiré de l'onglet Comptes et du modèle (`Settings.envelopeAccountId`). Le compte payeur et le mode Espèces des enveloppes n'existent plus (Q1, Q3).
- RG22. Supprimer une enveloppe n'efface jamais son compte. Le compte garde `BankAccount.envelopeId` : le mouvement d'allocation est lu depuis les comptes d'enveloppe, donc les allocations passées restent dans l'historique du principal. À partir du mois suivant la suppression, l'enveloppe n'est plus allouée (modèle et mois déjà créés non verrouillés). Le compte est archivé (pas supprimé). Tant que son solde n'est pas nul, il reste visible dans l'écran Comptes et dans la clôture (spec 0010, RG12) pour que l'utilisateur déplace ou régularise l'argent. À solde nul, il reste archivé (historique) et n'apparaît plus dans la clôture. Voir Q7 pour la suppression d'une enveloppe au solde non nul.
- RG23. Un compte `enveloppe` archivé n'est pas proposé dans les listes de choix, et ne peut pas être rattaché à une nouvelle enveloppe.

## Parcours utilisateur

Nominal. Je crée l'enveloppe « Santé » : son compte de type enveloppe est créé (0 € au mois courant, ou le solde saisi dans l'assistant). Je lui alloue 50 € ce mois-ci : le principal baisse de 50 €, le compte Santé monte de 50 €. Je dépense 30 € : Santé baisse de 30 €. Dans Clôture, « Santé » est une ligne du groupe « Enveloppes » (20 €), le principal est diminué des 50 €, le total n'a plus de doublon.

Création. Je crée l'enveloppe « Vacances » : son compte apparaît dans l'écran Comptes.

Suppression. Je supprime « Santé » avec 140 € dessus : le compte est archivé, il reste dans la clôture à 140 € (RG22).

Cas limites :
- Allocation 0 : aucun mouvement (RG8).
- Mode pointage, allocation non pointée : le compte de l'enveloppe ne reçoit rien (RG6).
- Année clôturée : bases enregistrées inchangées (RG14).
- Deux enveloppes de même nom : deux comptes de même nom ; non bloqué.

## Design

Design proposé, à valider (aucune maquette fournie). Composants et tokens existants : tuiles d'enveloppe (écran Enveloppes et Budget), `popmenu`, pastille de compte (`dot`), bandeau, `chip`, `panel-lg`.

- Écran Enveloppes et tuiles du Budget : visuellement inchangés ; le solde affiché est celui du compte. Le menu de la pastille (spec 0006, RG8) perd le choix « Virtuel / Espèces / compte attribué » pour les enveloppes : la pastille devient simplement la teinte de l'enveloppe, sans menu.
- Écran Comptes : les comptes `enveloppe` forment un groupe replié « Enveloppes » (nom non modifiable, solde, détail des mouvements comme tout compte). La ligne « Compte des enveloppes » à côté de « Pointage depuis » disparaît.
- Formulaire « Nouvelle dépense » : pour une enveloppe, « Payé avec » est figé sur le compte de l'enveloppe (rangée de `chip` désactivée avec la valeur affichée).
- Clôture : groupe « Enveloppes » : pastille et nom ; une ligne par compte `enveloppe` (spec 0010).

États : enveloppe sans mouvement ; enveloppe négative (couleur d'alerte existante) ; mois en mode réel / en mode pointage (case de pointage de l'allocation) ; mois verrouillé ; compte archivé d'enveloppe supprimée (écran Comptes, clôture).

## Impact technique

- Domaine : `Envelope.accountId` obligatoire et de sens « compte de l'enveloppe » (ou champ distinct, Q1) ; `PaymentSetting` retiré de `Envelope` ; `bankMovements` / `bankFlow` : mouvement d'allocation principal → compte-enveloppe selon RG5 et RG6, pour toutes les enveloppes ; `Ledger` : le solde des enveloppes lit `bankMonth` dès le mois de départ du compte, `envMonth` reste pour l'historique ; dépense `env` imputée au compte de l'enveloppe ; `Settings.envelopeAccountId` retiré ; fonctions `resolveEnvelopeAccountId` / `envelopeDefaultAccountId` / pointage d'allocation à simplifier.
- Application : actions de création d'enveloppe (crée le compte), renommage (renomme le compte), suppression (archive le compte, RG22), `addTransaction` (compte imposé pour `env`), pointage d'allocation. Pas de migration de données.
- Infrastructure : `localRepository` inchangé. Supabase : colonne du compte de l'enveloppe et type `enveloppe` du compte, dans la migration additive de cette spec ; l'état des tables d'enveloppes et de comptes dans le schéma est à vérifier (en retard sur le domaine, spec 0009 C5).
- Présentation : `Closing.tsx`, `Envelopes.tsx`, `Budget.tsx` (tuiles, case d'allocation), `Expenses.tsx` (« Payé avec » figé), `Accounts.tsx` (groupe enveloppes, retrait du réglage), `PayModePicker.tsx` / `EnvelopeCheck.tsx` (retrait pour les enveloppes), `Setup.tsx` (création d'enveloppe dans l'assistant crée le compte), données de démonstration.
- Schéma Supabase : voir ci-dessus.

## Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application). Le reste est vérifié à la relecture de l'UI.

- CA1 (T). Given une enveloppe de compte E et une allocation de 50 € en mode réel, When je lis les soldes du mois, Then le principal baisse de 50 € et E monte de 50 €.
- CA2 (T). Given ce mouvement, When je somme les soldes de tous les comptes, Then le total est identique à celui d'avant l'allocation (aucun double compte).
- CA3 (T). Given une dépense `env` de 30 €, When je lis les soldes, Then E baisse de 30 € et le principal n'est pas touché.
- CA4 (T). Given une enveloppe dont E a un solde de 140 €, When je lis son solde, Then c'est `bankMonth(E)` (140 €), pas un calcul `envMonth`.
- CA5 (T). Given un mois en mode pointage avec une allocation de 50 € non pointée, When je lis les soldes, Then ni le principal ni E ne bougent ; When je la pointe, Then le principal baisse et E monte de 50 € à la date de pointage ; When je décoche, Then les soldes reviennent.
- CA6 (T). Given une allocation de 0 €, Then aucun mouvement n'est créé.
- CA7 : supprimé (migration supprimée, voir « Décisions d'implémentation »).
- CA8 : supprimé (migration supprimée, voir « Décisions d'implémentation »).
- CA9 : supprimé (migration supprimée, voir « Décisions d'implémentation »).
- CA10 (T). Given les mois antérieurs au mois de départ d'un compte d'enveloppe, When je lis le solde de l'enveloppe, Then il est celui de l'historique (`envHistory` / calcul d'avant), inchangé.
- CA11 (T). Given une enveloppe créée, Then son compte `enveloppe` est créé ; Given l'enveloppe renommée, Then son compte aussi ; Given deux enveloppes, Then leurs comptes sont distincts.
- CA12 (T). Given une enveloppe supprimée dont le compte a un solde non nul, Then le compte est archivé, jamais supprimé, et apparaît dans la clôture avec son solde ; Given un solde nul, Then il est archivé et absent de la clôture.
- CA13 : supprimé (migration supprimée, voir « Décisions d'implémentation »).
- CA14 (T). Given les données d'exemple migrées et toutes les déductions de la spec 0010 confirmées, When je calcule le total de la clôture, Then il est égal à la somme des soldes des comptes, une fois chacun, sans ligne d'enveloppe supplémentaire.
- CA15 (T). Given un compte de type `enveloppe`, When je tente d'en changer le nom ou le type depuis les comptes, Then c'est refusé ; When j'en choisis un comme compte d'une ligne ou « Payé avec » d'une dépense `var`, Then il n'est pas proposé.
- CA16 : supprimé (migration supprimée, voir « Décisions d'implémentation »).
- CA17. Given l'écran Clôture, When je le regarde, Then le groupe « Enveloppes » a une seule ligne par enveloppe, au solde de son compte.
- CA18. Given l'écran Dépenses, When je choisis une enveloppe, Then « Payé avec » affiche son compte, non modifiable.
- CA19. Given l'écran Comptes, When je le regarde, Then le groupe « Enveloppes » est présent et le réglage « Compte des enveloppes » a disparu.
- CA20 : supprimé (migration supprimée, voir « Décisions d'implémentation »).

## Questions ouvertes

Q1. Nom du champ. `Envelope.accountId` existe (spec 0006) avec le sens « compte payeur des dépenses ». Option A (recommandée) : le réutiliser pour le compte de l'enveloppe, comme demandé, en abandonnant la notion de compte payeur et de mode Espèces pour les enveloppes (la dépense débite le compte de l'enveloppe, RG10). Option B : garder `accountId` / `payMode` comme compte payeur et ajouter un champ distinct (ex. `holdingAccountId`) ; plus de souplesse, mais une dépense payée ailleurs ne diminue pas l'enveloppe, ce qui complique les soldes. Option C : renommer l'existant en `payerAccountId`. Décision à prendre.

   **Décision du développeur (2026-10-21) : option A, `Envelope.accountId` devient le compte de l'enveloppe ; la notion de compte payeur et le mode Espèces des enveloppes disparaissent.**

Q2. Quand l'allocation compte-t-elle ? Recommandation (RG6) : en mode réel au 1er du mois, en mode pointage au pointage. Alternative : toujours au pointage, au risque d'un solde d'enveloppe nul pour qui ne pointe pas (régression pour les mois en mode réel).

   **Décision du développeur (2026-10-21) : recommandation retenue (RG6) : mode réel au 1er du mois, mode pointage au pointage.**

Q3. « Payé avec » d'une dépense d'enveloppe : figé sur le compte de l'enveloppe (RG10, recommandé) ou modifiable ? Modifiable : si l'on paie avec un autre compte, que devient le solde de l'enveloppe ? Et le mode Espèces des enveloppes (spec 0006) disparaît-il, ou garde-t-on un compte Espèces par enveloppe ? Recommandation : abandonner.

   **Décision du développeur (2026-10-21) : « Payé avec » figé sur le compte de l'enveloppe (RG10). Le mode Espèces des enveloppes est abandonné ; le cash n'est conservé qu'à titre indicatif.**

Q4. Mois de départ et solde de départ des comptes d'enveloppe : mois courant, avec rattachement des transactions `env` du mois courant et suivantes (recommandé) ; ou mois suivant le dernier mois initialisé, sans réécriture de transaction ? Dans le premier cas on modifie des transactions (exception à spec 0006, RG6) ; dans le second, un mois reste calculé deux fois. Décision à prendre.

   **Décision du développeur (2026-10-21) : exception acceptée : mois de départ = mois courant, avec rattachement des transactions `env` du mois courant et suivantes, en dérogation à la spec 0006 RG6.** *Rendue sans objet le 2026-10-22 : plus de migration, le compte d'une enveloppe s'ouvre à sa création.*

Q5. `envHistory` et les mois antérieurs : les conserver en lecture seule (RG16, recommandé), ou convertir l'historique en opérations de compte (solde de départ de l'enveloppe au premier mois géré, tous les mois via les comptes) ? La seconde option donne un seul calcul mais réécrit les soldes du passé du principal (les allocations anciennes deviendraient des mouvements). Écartée par défaut.

   **Décision du développeur (2026-10-22) : recommandation retenue (RG16) : `envHistory` et le calcul d'`envMonth` conservés en lecture seule pour les mois antérieurs.**

Q6. Pointages d'allocation existants (`env:<id>` avec compte de destination, spec 0009, RG90) : ignorer le compte enregistré et lire l'enveloppe (RG18), ou conserver ce comportement pour les mois passés ? Recommandation : lire l'enveloppe dès le mois de départ ; avant, inchangé.

   **Décision du développeur (2026-10-21) : lire l'enveloppe dès le mois de départ ; avant, comportement inchangé.**

Q7. Suppression d'une enveloppe au solde non nul : l'autoriser et archiver (RG22), ou exiger de vider l'enveloppe d'abord (transfert vers le principal ou une autre enveloppe) ? Un transfert entre comptes est hors périmètre : sinon, comment retrouver l'argent ?

   **Décision du développeur (2026-10-21) : vider l'enveloppe par un transfert est obligatoire avant suppression ; ce transfert entre comptes n'est pas géré dans cette spec.**

Q8. Un compte enveloppe peut-il être « hors budget » (spec 0002, RG17) ? Recommandation : non (RG4), pour éviter l'isolation de RG92. Confirmer.

   **Décision du développeur (2026-10-22) : non, un compte enveloppe n'est jamais « hors budget » (RG4).**

Q9. Compte source de l'allocation : toujours le compte principal (RG5). Faut-il prévoir un compte source par enveloppe (cas d'un salaire versé sur un second compte) ? Recommandation : non, hors périmètre.

   **Décision du développeur (2026-10-21) : toujours le compte principal (RG5), pas de compte source par enveloppe.**

Q10. Le groupe « Enveloppes » de l'écran Comptes : replié par défaut avec un total, ou intégré à la liste ? Choix de design à valider.

   **Décision du développeur (2026-10-22) : groupe replié par défaut, avec un total.**

Q11. Quand un compte d'enveloppe est le compte de départ d'une ligne `fix` / `cre` ou d'un revenu (donnée existante) : impossible par RG2 ; les cas existants (compte attribué à une box, compte d'une ligne) ne concernent pas d'enveloppe mais sont à vérifier à la migration.

   **Décision du développeur (2026-10-22) : pas possible. Un compte enveloppe est un compte de type `enveloppe` (RG2), jamais choisi comme compte d'une ligne ou d'un revenu.**

## Décisions d'implémentation (2026-10-22)

- D1. `BankAccount.envelopeId?` : l'enveloppe à laquelle appartient un compte de type `enveloppe`, conservé après la suppression de l'enveloppe. Le mouvement d'allocation est lu depuis les comptes d'enveloppe : supprimer une enveloppe vide déjà allouée ne change pas les soldes passés du principal (RG22).
- D2. Case de pointage de l'allocation : jamais en mode réel, y compris déjà cochée (RG6).
- D3. « Payé avec » figé aussi pour les dépenses variables (`var`) dont la ligne a un compte attribué (spec 0006, amendée) : interface désactivée sur ce compte, et `addTransaction` / `setTransactionAccount` refusent un autre compte. Une ligne en mode Espèces, sans compte attribué, ou dont le compte attribué est archivé, laisse le choix. Une dépense d'enveloppe reste sur le compte de l'enveloppe (imposé par `addTransaction`).
- D4. La migration de données (RG15 à RG20, CA7 à CA9, CA13, CA16, CA20, bandeau, `Settings.envelopeAccountsNotice`) est supprimée : l'application n'est pas encore utilisée. Seule reste la lecture de l'historique avant l'ouverture du compte (RG16, Q5).
- D5. Acceptés tels quels : mode pointage à la création, suppression refusée si le solde n'est pas nul (pas de transfert pour l'instant), comptes d'enveloppe absents de la carte de pointage.

## Amendement — spec 0019 (implémentée)

- L'allocation d'une enveloppe est un débit **fictif** (pointage) : elle ne bouge plus le solde réel des comptes. L'alimentation réelle est un **transfert** du principal vers le compte de l'enveloppe, avec la cible facultative « enveloppe ». Le transfert rattaché remplace la contrepartie fictive de l'allocation pointée dans le solde estimé.
- Le solde propre de l'enveloppe du Ledger (`envMonth`) reste budgétaire (début + allocation − dépensé) ; le solde réel de son compte est `bankMonth`.
- La case de pointage de l'allocation n'a plus de condition de mois « au pointage ».
