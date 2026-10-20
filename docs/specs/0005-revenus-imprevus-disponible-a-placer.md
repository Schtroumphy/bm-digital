# 0005 — Revenus imprévus : disponible à placer (réel) et clôture du mois

- Statut : implémentée (la règle de réouverture, RG34, est une proposition à confirmer, non bloquante)
- Date : 2026-10-20
- Branche prévue : feat/unplanned_income_available

Avenant aux specs 0002 (comptes bancaires) et 0003 (allocation depuis le Budget, avenant à prévoir, voir RG24). La spec 0004 (valider le mois) n'est PAS modifiée : « Valider le mois » reste tel quel.

## Contexte et objectif

Des revenus non prévisibles arrivent en cours de mois (déblocage de prêt, remboursements de santé…). Le « Reste à placer » du Budget est le plan du mois (calculé sur les budgets) : il ne bouge pas. L'utilisateur veut savoir combien d'argent réel il peut placer maintenant (épargne, enveloppes), en tenant compte des entrées imprévues, des revenus inférieurs au prévu, et de ce qu'il a déjà placé. Pour finir proprement un mois, une nouvelle action « Clôturer le mois » verrouille le mois, mais seulement quand tout l'argent disponible a été placé (disponible = 0).

Il n'y a pas de notion d'« imprévu » dans les données : un revenu imprévu est un revenu normal, sur une ligne de revenu de budget 0 € et de réel X € (ligne créée à la saisie). L'écart réel − budget d'une ligne existe déjà (`lineGap`).

## Constats dans le code (écarts avec les hypothèses de départ)

Vérifiés dans `src/domain/bank.ts`, `budget.ts`, `ledger.ts`, `types.ts`, `src/application/bankAccounts.ts`, `Budget.tsx`, `Accounts.tsx`.

- E1. Le « compte par opération » d'un revenu est un attribut de la ligne (`Line.accountId`, absent = principal), pas de la saisie du réel. Pas de formulaire de saisie d'un revenu avec choix du compte. Le compte se change par la pastille de la ligne (`setLineAccount`) et vaut pour le budget ET le réel. Décision : on garde cette mécanique.
- E2. Une ligne a un seul réel par mois : deux versements de comptes différents sur la même ligne ne sont pas représentables (hors périmètre).
- E3. `setLineAccount` ne modifie que la ligne du mois affiché, pas `template.lines`, alors que son commentaire dit le contraire. Sans effet direct ici, à signaler.
- E4. Le Reste à placer actuel (`monthSummary.remaining`) compte les budgets de tous les revenus dont le compte est « dans le budget » (`inBudget`), donc aussi Espèces ou un dédié « oui ». Le critère « principal » demandé ici est géré en retirant ces budgets de la base du disponible (RG1, RG2), sans toucher au Reste à placer.
- E5. Une ligne sans réel saisi a un écart `null` (pas −budget) : un salaire non saisi ne fait pas baisser le disponible. C'est aussi ce qui rend « Valider le mois » (0004) neutre.
- E6. Compte de réception des lignes `epa`/`inv` (correction du constat initial). Dans le modèle actuel, une ligne d'épargne/placement EST elle-même le compte d'épargne qui reçoit : le `Ledger` (`accounts(d)`, `accMonth`) suit son solde (versement réel `actual` crédité, sorties `epa` débitées, relevé). Ce sont des comptes à part des comptes bancaires. Le versement réel de la ligne débite un compte bancaire, par `Line.accountId` (champ existant pour tous les blocs, lu par `bankFlow`), absent = principal ; aucun écran ne permet de le choisir pour `epa`/`inv` (la pastille n'existe que pour rev/fix/cre). En revanche, il n'existe PAS de champ « compte de réception » qui relierait une ligne `epa`/`inv` à un compte bancaire de destination (par exemple un Livret A modélisé comme compte bancaire), ni de crédit d'un compte bancaire par un versement. Un virement (`Transfer`) vers une épargne est informatif ; un virement « fait » vers un autre compte bancaire ne bouge que les soldes. Conséquence pour 0005 : la formule du disponible (RG1) n'a besoin que du débit du principal ; la ligne d'épargne est déjà créditée côté Ledger. Le lien ligne → compte bancaire de réception est traité dans une spec séparée (autre session), non spécifié ici (RG33).
- E7. Changer de compte principal fige les lignes et transactions sans compte sur l'ancien principal (`setMainBankAccount`). Voir RG20.
- E8. Un compte archivé reste résolu par `bankAccount` : ses lignes gardent compte et pastille.
- E9. Il n'existe pas de « clôture de mois ». Le verrouillage actuel est par année : `isMonthLocked(d, m)` renvoie `closes[année].closed`, et ce garde-fou est utilisé par les actions (lignes, transactions, comptes, validation 0004…) et par les écrans (lecture seule, bandeau « L'année … est clôturée »). `MonthData` n'a aucun indicateur de clôture. Le verrouillage d'un seul mois est donc un nouveau concept de données (voir Impact technique).

## Périmètre

Inclus :
- Calcul et affichage d'un chiffre « Disponible à placer (réel) » par mois, écran Budget.
- Règle sur le compte d'encaissement, cas du versement direct sur un compte dédié.
- Prise en compte des versements réels vers l'épargne et les placements (le disponible redescend quand on place).
- Comparaison de l'avertissement d'allocation des enveloppes (0003) au disponible.
- Nouvelle action « Clôturer le mois » (verrouille le mois), impossible tant que le disponible ≠ 0.
- Conservation de l'historique au changement de compte principal.
- Tests du calcul et de la clôture (domaine, application).

Exclus :
- Modification de « Valider le mois » (0004) : bandeau, action, annulation inchangés.
- Colonne ou notion « imprévu » dans les données.
- Ligne « Exceptionnel » préremplie dans le modèle.
- Formulaire dédié de saisie d'un revenu avec choix du compte.
- Report du disponible d'un mois sur l'autre (mensuel strict).
- Répartition d'un même revenu sur plusieurs comptes.
- Recalcul du disponible des mois passés lors d'un changement de compte principal (acceptable, hors périmètre).
- Lien d'une ligne `epa`/`inv` vers un compte bancaire de réception (spec séparée, voir E6 et RG33).
- Prise en compte des autres écarts (fixes, crédits, variables, sorties d'enveloppe, sorties d'épargne).
- Modification du Reste à placer, du Taux d'épargne, de la Clôture annuelle.
- Schéma Supabase et `SupabaseRepository` (localRepository seulement, comme 0002).

## Règles de gestion

Calcul
- RG1. Disponible à placer (réel) du mois M = Reste à placer budgété de M
  − Σ budgets des lignes de revenu de M rattachées à un compte autre que le principal et « dans le budget » (leur argent n'arrive pas sur le principal)
  + Σ écarts (réel − budget) des lignes de revenu du compte principal, positifs et négatifs
  − Σ (réel − budget) des lignes `epa` et `inv` (versements vers l'épargne et les placements).
  Les versements des lignes `epa`/`inv` sont pris tels quels, sans tenir compte de `Line.accountId` (voir E6).
- RG2. Une ligne de revenu est « du principal » si son `accountId` est absent ou égal au principal. Les revenus d'un compte hors budget sont déjà exclus du Reste à placer et ne sont pas retirés une seconde fois.
- RG3. Une ligne sans réel saisi (`actual` null) contribue pour 0, dans les deux sommes d'écarts.
- RG4. Un revenu inférieur au prévu fait baisser le disponible ; un versement vers l'épargne supérieur au budget aussi ; un versement inférieur au budget le fait monter.
- RG5. Le chiffre est recalculé dès la saisie d'un budget ou réel (revenu, épargne, placement), d'un changement de compte d'une ligne, ou d'une allocation d'enveloppe (0003), sans attendre « Valider le mois ».
- RG6. Le Reste à placer budgété n'est pas modifié et reste affiché.
- RG7. « Valider le mois » (0004) ne change pas le disponible : elle ne remplit que des lignes à réel `null` et à budget ≠ 0, dont l'écart passe de « absent » (0) à 0. Annuler la validation non plus.
- RG8. Les virements (`Transfer`) n'entrent pas dans le calcul, même « faits » (confirmé : ils sont hors budget ou en sont la conséquence).
- RG9. Mois non initialisé : le disponible est masqué.
- RG10. Le disponible vient des lignes du mois ; il peut différer du solde réel du principal (écran Comptes).

Compte de la ligne de revenu
- RG11. Cas général (prêt) : le déblocage est une ligne du principal (budget 0, réel X). Écart +X : disponible +X, solde du principal +X. Placé dans LDDS Travaux par un versement réel sur la ligne `inv` correspondante : le principal est débité du versement, la ligne LDDS (compte d'épargne) est créditée (Ledger, déjà en place), et le disponible baisse de (versement − budget de la ligne).
- RG12. Versement direct sur un compte dédié : la ligne de revenu est rattachée au dédié. Le réel crédite son solde (déjà en place). L'écart de la ligne s'affiche mais n'entre pas dans le disponible.
- RG13. Budget 0 / réel X sur dédié : écart +X sur la ligne, disponible inchangé, solde du dédié +X, Reste à placer inchangé.
- RG14. Ligne budgétée B > 0 sur un dédié « dans le budget » : B reste dans le Reste à placer (inchangé) mais est retiré de la base du disponible (RG1) ; l'écart (réel − B) s'affiche sans entrer dans le disponible.
- RG15. Budgété sur le principal, encaissé sur un dédié : on bascule la ligne vers le dédié. Budget et réel suivent la ligne ; aucun budget « fantôme » sur le principal.
- RG16. Changement de compte après coup : disponible, soldes des deux comptes et chiffres du budget recalculés immédiatement ; aucun montant de ligne modifié.
- RG17. Compte dédié archivé : ses lignes gardent compte, pastille et soldes ; le disponible les traite comme non principales.
- RG18. Compte dédié « hors budget » : lignes exclues du Reste à placer et du disponible, restent listées, comptées dans le solde du compte.
- RG19. Mois verrouillé (année clôturée ou mois clôturé, RG25) : le disponible est affiché en lecture seule.
- RG20. Conservation de l'historique : changer de compte principal ne doit modifier aucune donnée des mois passés (budgets, réels, comptes des lignes et transactions, soldes). Le comportement actuel qui fige sur l'ancien principal les lignes sans compte, lignes variables comprises, et les transactions est conservé. Le disponible affiché des mois passés après ce changement est hors périmètre.

Affichage
- RG21. Écran Budget : « Disponible (réel) » en sous-ligne dans la carte héros « Reste à placer ». Négatif : couleur d'alerte existante. Aucun avertissement permanent ailleurs.
- RG22. Écran Comptes : pas de nouvelle colonne ; le revenu du dédié figure dans ses Entrées et son solde.
- RG23. Info-bulle sur la pastille (ou l'écart) des lignes de revenu hors principal : « Ne compte pas dans le disponible à placer ».

Enveloppes (spec 0003)
- RG24. L'avertissement non bloquant d'allocation d'enveloppe compare l'allocation au disponible (réel) quand celui-ci est affiché : « Dépasse le disponible de X ». Jamais bloquant, la valeur est enregistrée. Avenant à 0003 à faire après validation.

Action « Clôturer le mois » (nouvelle ; ne remplace pas « Valider le mois »)
- RG25. « Clôturer le mois » verrouille le mois affiché. Un mois clôturé est verrouillé comme un mois d'année clôturée : `isMonthLocked` renvoie vrai, donc budgets, réels, noms, ajout et suppression de lignes, compte d'une ligne, allocations d'enveloppes, transactions du mois, cases « fait » des virements, « Valider le mois » et son annulation, application du modèle, sont tous refusés par les mêmes garde-fous que pour une année clôturée. Les chiffres restent calculés et affichés. Les autres mois ne sont pas touchés, mais l'ordre de clôture est imposé (RG34, RG35).
- RG26. Emplacement : bouton « Clôturer le mois » dans l'en-tête de l'écran Budget, à côté du sélecteur de mois (style `btn-outline`), pour le mois affiché. Absent si le mois n'est pas initialisé. Si le mois est clôturé, il est remplacé par l'état « Mois clôturé » et un bouton « Rouvrir le mois » (RG34). Si l'année est clôturée, ni l'un ni l'autre n'est proposé (la réouverture se fait par l'écran Clôture).
- RG27. Condition : la clôture est impossible tant que le disponible (réel) du mois est ≠ 0 après arrondi à 2 décimales. Non contournable : pas de « Clôturer quand même ».
- RG28. Pas d'avertissement permanent : le bouton reste cliquable et le message n'apparaît qu'au clic, sous forme d'un bandeau (`banner`) ou d'une alerte en ligne sous l'en-tête, qui dit quoi faire :
  - disponible > 0 : « Il reste X € à placer. Place-les (versement sur une épargne ou un placement, allocation d'une enveloppe) ou baisse le budget des revenus concernés pour revenir à 0 € avant de clôturer. »
  - disponible < 0 : « Tu as placé X € de plus que disponible. Réduis un versement ou une allocation d'enveloppe, ou saisis le revenu manquant, pour revenir à 0 € avant de clôturer. »
  Le message disparaît à la fermeture ou dès que le disponible vaut 0.
- RG29. Avec un disponible à 0, le clic demande une confirmation (« Clôturer {mois} ? Le mois deviendra en lecture seule. »), puis verrouille. Une fois clôturé, le mois affiche un bandeau de verrouillage (réutiliser `banner is-locked`, texte « Ce mois est clôturé : il est en lecture seule »).
- RG30. Le blocage de la clôture ne concerne que cette action : toutes les saisies, « Valider le mois » et son annulation restent possibles tant que le mois n'est pas clôturé. Le toast d'annulation de 0004 en cours est retiré à la clôture.
- RG31. Risque de blocage : tout écart du disponible vient de valeurs modifiables sur l'écran Budget (budgets, réels, allocations, compte d'une ligne, y compris d'un compte archivé via la pastille). L'arrondi à 2 décimales évite un blocage par un résidu. Un mois dont le Reste à placer budgété est volontairement ≠ 0 ne peut pas être clôturé tant qu'il n'est pas équilibré : conséquence assumée de la décision, mentionnée dans le message.
- RG32. Interaction avec « Valider le mois » (décision) : les deux actions sont indépendantes. Clôturer n'exige pas d'avoir validé ; les lignes restées sans réel restent vides. Valider le mois ne change pas le disponible (RG7).
- RG33. (Vision, hors périmètre, pour consigner la mécanique visée.) On pourra cocher les lignes de budget « faites » (virement vers le Livret A, sortie d'espèces pour l'alimentation…) : elles débiteront le compte courant et créditeront le compte de destination (espèces, livret A…). Les virements deviendront implicites à la validation du budget. Cela suppose un compte de réception sur les lignes `epa`/`inv` (E6), traité dans une spec séparée (autre session) ; la formule du disponible (RG1) devra alors être revue avec elle.
- RG34. Réouverture (décision : « Rouvrir le mois » existe). Le bouton lève la clôture du mois, sans modifier aucune donnée, et le disponible est de nouveau modifiable. Règle d'ordre proposée (à confirmer) : seul le DERNIER mois clôturé peut être rouvert. Un mois dont un mois postérieur est clôturé (ou verrouillé par une année clôturée) ne peut pas être rouvert : le bouton est grisé avec l'info-bulle « Rouvre d'abord {mois suivant clôturé} ». Un mois verrouillé seulement par l'année clôturée n'est pas concerné (réouverture de l'année par l'écran Clôture). La réouverture n'exige pas disponible = 0.
- RG35. Ordre de clôture (décision) : pour clôturer un mois, le mois précédent doit être clôturé. Le « mois précédent » est le mois initialisé le plus proche avant lui (les mois non initialisés entre deux mois sont ignorés). Cas :
  - tout premier mois du budget (`firstMonth`), ou aucun mois initialisé avant lui : pas de précédent, la clôture est possible ;
  - mois précédent dans une année clôturée : il compte comme clôturé ;
  - mois précédent non clôturé : clôture refusée, message « Clôture d'abord {mois précédent} » (le bouton reste cliquable, le message s'affiche au clic, comme RG28).
  Les deux conditions (ordre RG35, disponible RG27) sont évaluées ; si les deux échouent, les deux messages s'affichent, l'ordre d'abord.

## Parcours utilisateur

Nominal 1 (remboursement santé, principal) : Reste à placer 500 €, ligne « Remboursement santé » (principal) budget 0, réel 120. Disponible = 620 €, Reste à placer = 500 €.

Nominal 2 (déblocage de prêt) : ligne « Déblocage prêt » (principal) réel 20 000. Disponible = Reste + 20 000. L'utilisateur verse 20 000 sur la ligne « LDDS Travaux » (budget 0, réel 20 000) : le principal est débité, la ligne LDDS créditée, le disponible redescend de 20 000.

Nominal 3 (versement direct sur compte dédié « Travaux ») : nouvelle ligne de revenu budget 0, pastille sur « Travaux », réel 20 000. Solde « Travaux » +20 000 (Comptes). Disponible et Reste à placer inchangés. Info-bulle sur la ligne.

Revenu budgété basculé : salaire 1 000 € budgété sur le principal, finalement versé sur « Travaux » : l'utilisateur change la pastille. Disponible baisse de 1 000 (le budget sort de la base si le dédié est « dans le budget »).

Revenu inférieur au prévu : 2 950 budget, 2 800 réel : disponible − 150.

Clôture bloquée : disponible 300 €. L'utilisateur clique « Clôturer le mois » : le message « Il reste 300 € à placer… » s'affiche, le mois n'est pas verrouillé. Il verse 300 € sur une épargne : disponible 0. Il clique à nouveau, confirme : le mois est clôturé, en lecture seule.

Cas limites : revenu sans réel (contribue 0) ; « Valider le mois » (disponible inchangé) ; compte dédié archivé ; changement de principal (RG20) ; mois non initialisé (masqué, pas de bouton) ; année déjà clôturée (pas de bouton, bandeau existant) ; mois déjà clôturé (bouton remplacé par l'état clôturé).

## Design

Design proposé, à valider. Réutilise `kpi kpi-hero`, `kpi-sub`, couleurs d'alerte, `AccountPicker`, `AccountDot`, `alert-box`, `banner`, `banner is-locked`, `btn-outline`.

```
+---------------------------------+
| Reste à placer                  |
| 500,00 €                        |   <- plan, inchangé
| Disponible (réel) 620,00 €      |   <- sous-ligne
+---------------------------------+
```

En-tête de l'écran Budget :

```
Budget      [ < Octobre 2026 > ]                 [ Clôturer le mois ]
```

Au clic, disponible ≠ 0 (message sous l'en-tête) :

```
+----------------------------------------------------------------+
| (!)  Impossible de clôturer : il reste 300,00 € à placer.      |
|      Place-les (épargne, placement, enveloppe) ou baisse le    |
|      budget des revenus concernés pour revenir à 0 €.      [x] |
+----------------------------------------------------------------+
```

Mois clôturé : bouton remplacé par la mention « Mois clôturé » et `banner is-locked`.

États : masqué (non initialisé), chargé, négatif (alerte), mois clôturé (lecture seule), bouton cliquable avec message au clic. Erreur sans objet.

## Impact technique

- Domaine : fonction pure (`budget.ts`) calculant le disponible (`availableReal` dans `MonthSummary`, nom indicatif), arrondi à 2 décimales. Nouvel indicateur de clôture sur `MonthData` (par exemple `closed?: boolean`, nom indicatif) ; `isMonthLocked` (ledger.ts) renvoie vrai si l'année est clôturée OU si le mois est clôturé. Ce point étend d'un coup tous les garde-fous existants (RG25).
- Application : action « clôturer le mois » (refusée si mois non initialisé, déjà verrouillé, mois précédent initialisé non clôturé, ou disponible ≠ 0 arrondi) ; action « rouvrir le mois » (refusée si le mois n'est pas clôturé par son propre indicateur ou si un mois postérieur est clôturé/verrouillé). Le domaine expose une fonction pure donnant le mois précédent initialisé d'un mois. Aucune modification de `validateMonth` / `undoValidateMonth` (0004). Dépassement d'enveloppe (0003) basé sur le disponible.
- Infrastructure : `localRepository` inchangé (le champ suit `MonthData`). Données existantes : champ absent = mois non clôturé, aucune migration.
- Schéma Supabase : une information de clôture par mois sera nécessaire (équivalent mensuel du `closed` des années). Repoussé à la spec Supabase dédiée, comme 0002.
- Présentation : `Budget.tsx` (carte héros, info-bulle, bouton et message de clôture, bandeau de verrouillage, retrait du toast), `App.tsx` ou l'en-tête d'écran pour l'emplacement du bouton. Les écrans qui lisent `isMonthLocked` (Expenses, Envelopes, Accounts, Closing) deviennent en lecture seule pour un mois clôturé. À examiner par le reviewer : l'écran Clôture annuelle doit continuer à fonctionner si des mois de l'année sont clôturés.
- Avenants : 0003 (RG8, comparaison au disponible). Aucun avenant 0004.

## Critères d'acceptation

(T) = test automatisé (Vitest).

- CA1 (T). Reste 500, revenu principal budget 0 réel 120 : disponible 620, Reste 500.
- CA2 (T). Revenu principal 2 950 / 2 800 : disponible = Reste − 150.
- CA3 (T). Écarts +120 et −150 : disponible = Reste − 30.
- CA4 (T). Revenu budgété sans réel : contribution 0.
- CA5 (T). Revenu budget 0 réel 20 000 sur dédié « dans le budget » : disponible = Reste ; solde du dédié +20 000 ; principal inchangé.
- CA6 (T). Revenu budget 1 000 réel 1 200 sur dédié « dans le budget » : écart de ligne +200 ; disponible = Reste − 1 000.
- CA7 (T). Ligne de réel 120 déplacée du principal vers un dédié : disponible − 120 ; solde du dédié +120 ; principal −120. Et inversement.
- CA8 (T). Ligne budgétée 1 000 sur le principal puis basculée sur un dédié : plus aucun budget de cette ligne dans la base du principal.
- CA9 (T). Compte dédié archivé portant un revenu de 500 : disponible l'exclut ; solde du compte l'inclut.
- CA10 (T). Compte dédié « hors budget » : disponible et Reste l'excluent ; son solde l'inclut.
- CA11 (T). Ligne `inv` budget 0, réel 20 000 après un revenu de 20 000 sur le principal : disponible revient à sa valeur d'avant le revenu ; le principal est débité de 20 000 ; le solde Ledger de la ligne `inv` est crédité de 20 000.
- CA12 (T). Ligne `epa` budget 300, réel 200 : disponible + 100. Réel vide : contribution 0.
- CA13 (T). « Valider le mois » puis annulation : disponible identique avant, après validation, après annulation.
- CA14 (T). Allocation d'enveloppe modifiée (0003) : Reste et disponible varient du même montant.
- CA15 (T). Virement « fait » principal → autre compte : disponible inchangé.
- CA16 (T). Changement de compte principal : budgets, réels, comptes des lignes (variables comprises) et transactions, soldes des mois passés inchangés.
- CA17 (T). Mois non initialisé : pas de disponible.
- CA18. Carte « Reste à placer » : sous-ligne « Disponible (réel) », alerte si négatif, pas d'autre avertissement permanent.
- CA19. Ligne de revenu hors principal : info-bulle « Ne compte pas dans le disponible à placer ».
- CA20. Allocation d'enveloppe qui dépasse le disponible : avertissement « Dépasse le disponible de X », valeur enregistrée.
- CA21 (T). Given un mois initialisé et ouvert avec un disponible de 300 (ou −50), When j'appelle l'action « clôturer le mois », Then le mois n'est pas clôturé et aucune donnée n'est modifiée. Given un disponible de 0 ou de 0,004, Then le mois est clôturé.
- CA22 (T). Given un mois clôturé, When j'appelle une action de modification du mois (saisie d'un budget, d'un réel, ajout de ligne, changement de compte de ligne, allocation d'enveloppe, transaction du mois, « Valider le mois »), Then elle est refusée et rien ne change.
- CA23 (T). Given un mois clôturé, When je lis les soldes et le disponible, Then ils restent calculés et inchangés ; les autres mois et l'année ne sont pas verrouillés.
- CA24 (T). Given un mois non initialisé ou dans une année clôturée, When j'appelle la clôture, Then elle est refusée.
- CA29 (T). Given le mois M-1 initialisé et non clôturé, When je clôture M (disponible 0), Then c'est refusé ; Given M-1 clôturé, Then c'est accepté.
- CA30 (T). Given le tout premier mois du budget, When je le clôture (disponible 0), Then c'est accepté sans précédent.
- CA31 (T). Given M-2 clôturé, M-1 non initialisé et M initialisé, When je clôture M, Then c'est accepté (M-2 est le précédent initialisé) ; Given M-2 non clôturé, Then refusé.
- CA32 (T). Given M-1 dans une année clôturée, When je clôture M (disponible 0), Then c'est accepté.
- CA33 (T). Given M et M+1 clôturés, When je rouvre M, Then c'est refusé ; When je rouvre M+1 puis M, Then les deux sont acceptés et aucune donnée n'a changé.
- CA34 (T). Given un mois rouvert, When je modifie un réel, Then la modification est acceptée et le disponible est recalculé ; Given un mois verrouillé seulement par l'année clôturée, When j'appelle la réouverture du mois, Then c'est refusé.
- CA35. Given un mois clôturé dont le suivant est clôturé, When je regarde « Rouvrir le mois », Then il est grisé avec l'info-bulle indiquant le mois à rouvrir d'abord.
- CA25. Given un disponible ≠ 0, When je clique « Clôturer le mois », Then le message d'explication (RG28) s'affiche avec le montant et quoi faire, aucun bouton pour contourner ; Given que je corrige jusqu'à 0, Then le message disparaît et le clic demande la confirmation.
- CA26. Given un mois clôturé, When je l'ouvre, Then le bandeau de verrouillage s'affiche, tous les champs sont en lecture seule, le bouton « Clôturer le mois » n'est plus proposé et « Rouvrir le mois » l'est (sauf RG34).
- CA27. Given l'écran Budget, When je regarde « Valider le mois » (0004), Then son comportement est identique à avant, y compris avec un disponible ≠ 0.
- CA28. Année clôturée : disponible affiché, rien d'éditable, pas de bouton « Clôturer le mois ».

## Questions ouvertes

Aucune question bloquante. Décisions du développeur intégrées : « Rouvrir le mois » existe ; clôturer n'exige pas d'avoir validé ; le mois précédent doit être clôturé (RG35) ; compte de réception des lignes d'épargne traité dans une spec séparée.

À confirmer (non bloquant) :
1. RG34 : seul le dernier mois clôturé peut être rouvert ; rouvrir ne demande pas disponible = 0.
2. RG35 : le « mois précédent » est le mois initialisé le plus proche avant (les mois non initialisés sont ignorés) ; un précédent dans une année clôturée compte comme clôturé ; le tout premier mois n'a pas de précédent.
