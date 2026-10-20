# 0007 — Associer une ligne épargne / investissement à un compte dédié

- Statut : implémentée (révision de RG20 à RG22 : le solde estimé cumule les budgets des mois passés)
- Date : 2026-10-20
- Branche prévue : feat/savings_linked_account

Avenant à la spec 0002 (comptes bancaires). Elle comble le manque documenté en spec 0005 (E6, RG33) : aujourd'hui aucun champ ne relie une ligne `epa`/`inv` à un compte bancaire de destination. La spec 0005 n'est pas modifiée : sa formule du disponible n'a besoin que du débit du compte source (voir RG12).

## Contexte et objectif

Une ligne d'épargne (`epa`) ou d'investissement (`inv`) est elle-même un « compte d'épargne » suivi par le `Ledger` (`accMonth` : début, versements, sorties, relevé). Son versement réel débite un compte bancaire (`Line.accountId`, absent = principal). En revanche, rien ne crédite un compte bancaire : un Livret A, un LDDS ou un compte-titres modélisé comme compte bancaire (écran Comptes) ne voit jamais arriver les versements faits depuis le Budget.

Objectif : pouvoir associer une ligne d'épargne ou d'investissement à un compte bancaire dédié, pour que ce compte reçoive les versements réels de la ligne et que son solde évolue mois après mois dans l'écran Comptes. Même mécanique pour les investissements.

Vocabulaire : « compte source » = compte bancaire débité par le versement (`Line.accountId`, existant) ; « compte dédié » = compte bancaire associé à la ligne, qui reçoit (nouveau).

## Constats dans le code

Vérifiés dans `src/domain/types.ts`, `bank.ts`, `ledger.ts`, `Budget.tsx`.

- E1. `Line.accountId` existe pour tous les blocs et sert déjà de compte source pour `epa`/`inv` dans `bankFlow` (sortie `out` = réel de la ligne). Aucun écran ne permet de le choisir pour ces deux blocs (la pastille n'existe que pour rev/fix/cre, RG11 de 0002).
- E2. Pour les sorties d'épargne, `Transaction.accountId` est déjà le compte qui reçoit l'argent (RG9 de 0002) ; il est crédité (`in`). Il manque le débit symétrique du compte dédié.
- E3. Les soldes de la ligne (`accMonth`, avec relevé) et d'un compte bancaire (`bankMonth`, avec solde de départ) sont deux calculs indépendants. Les relier n'en fait pas un seul : voir RG6 à RG8.
- E4. `ACCOUNT_BLOCKS = ['rev','fix','cre']` : les lignes `epa`/`inv` ne quittent jamais le budget avec leur compte (RG17 de 0002). Le réglage « Dans le budget » du compte dédié ne les concerne donc pas.
- E5. Les virements (`Transfer`) vers une épargne (`to.kind = 'saving'`) sont informatifs (RG13bis de 0002). Ils ne sont pas touchés ici.

## Périmètre

Inclus :
- Champ « compte dédié » facultatif sur les lignes `epa` et `inv` (et le modèle).
- Crédit du compte dédié par le versement réel de la ligne ; débit par les sorties d'épargne de la ligne.
- Choix du compte dédié depuis l'écran Budget (pastille) et dans l'assistant.
- Évolution du compte dédié visible dans l'écran Comptes, et lien vers la ligne.
- Colonne « Écart » des blocs Épargnes et Investissements remplacée par « Solde estimé » (RG19 à RG24).
- Tests du calcul des soldes (domaine) et des actions (application).

Exclus :
- Modification de la formule du disponible (spec 0005) et du Reste à placer. L'écart d'une ligne reste calculé (`lineGap`) : seul son affichage change dans ces deux blocs.
- Cocher des lignes « faites » (vision RG33 de 0005), virements implicites.
- Répartir une même ligne sur plusieurs comptes dédiés.
- Rapprocher automatiquement le relevé de la ligne et le solde du compte dédié (RG8).
- Rétroactivité : les versements et sorties des mois passés ne sont pas recalculés pour un compte dédié ajouté après coup, au-delà de RG9.
- Schéma Supabase et `SupabaseRepository` (`localRepository` seulement, comme 0002).

## Règles de gestion

Lien
- RG1. Une ligne `epa` ou `inv` porte un compte dédié facultatif (`linkedAccountId`, nom indicatif). Absent = aucun lien : comportement actuel inchangé. Les autres blocs n'ont pas ce champ.
- RG2. Le compte dédié est un compte bancaire actif, différent du compte source de la ligne. Choisir le même compte pour la source et le dédié est refusé.
- RG3. Plusieurs lignes peuvent pointer vers le même compte dédié (par exemple deux versements vers un même Livret A). Une ligne n'a qu'un compte dédié.
- RG4. Le lien fait partie de la ligne et du modèle : il suit « Appliquer le modèle » et « Dupliquer », comme `accountId` (RG11 de 0002). Il se change sur le mois affiché et sur le modèle.
- RG5. Un compte dédié archivé garde son lien et ses soldes ; il n'est plus proposé dans le menu de choix. Le compte principal et Espèces peuvent être dédiés (aucune restriction, même sans cas d'usage actuel), sauf RG2.

Soldes
- RG6. Solde du compte dédié D, fin de mois M : en plus de RG13 de 0002,
  + versements réels (`actual`) des lignes `epa`/`inv` dont D est le compte dédié (entrée) ;
  − sorties d'épargne (`Transaction` de type `epa`) de ces lignes (sortie de D).
  Le compte source de la ligne reste débité du versement (inchangé). Un versement entre deux comptes bancaires est donc une sortie de la source et une entrée du dédié, sans double comptage.
- RG7. Une sortie d'épargne d'une ligne liée sort de D et entre sur le compte choisi à la saisie (`Transaction.accountId`, défaut principal). Si ce compte est D lui-même, la sortie est refusée (RG2 s'applique aussi à la saisie).
- RG8. Le solde de la ligne (`accMonth`, relevé inclus) et le solde de D sont deux chiffres distincts. Quand un relevé de la ligne est saisi, il corrige le solde de la ligne uniquement ; il ne modifie pas D. Décision : les deux soldes restent séparés. À terme, la validation d'une ligne générera un virement imputant le compte associé (spec à part, voir RG33 de 0005) ; ce n'est pas traité ici.
- RG9. Un lien ajouté ou changé en cours d'historique n'agit que sur les mois où D est ouvert (`openingMonth`, RG15 de 0002) ; les versements des mois antérieurs à ce mois ne comptent pas dans son solde. Retirer le lien (« Aucun ») s'applique au mois affiché et au modèle (RG4) : les mois déjà créés gardent leur lien, donc leurs versements restent dans le solde de D. Décision du développeur.
- RG10. Versements de la ligne d'un mois non initialisé ou sans réel (`actual` null) : contribution 0.
- RG11. Les lignes `epa`/`inv` ne sont pas concernées par « Dans le budget » (E4) : lier une ligne à un compte « hors budget » ne change ni le Reste à placer, ni les chiffres du budget, ni le taux d'épargne.
- RG12. Le disponible à placer (spec 0005, RG1) ne change pas : le versement réel de la ligne le fait déjà baisser de (réel − budget), quel que soit le compte dédié.

Affichage
- RG13. Écran Budget, blocs Épargnes et Investissements : chaque ligne porte une pastille « compte dédié » (icône flèche + pastille du compte), cliquable, ouvrant un menu des comptes actifs sauf la source, avec l'option « Aucun ». Deux pastilles côte à côte : le compte source (discret, à gauche) puis le compte dédié (après la flèche). Le compte source reste modifiable séparément.
- RG14. Écran Comptes : un compte qui est dédié d'au moins une ligne affiche la mention « Reçoit : <noms des lignes> ». Le mouvement du mois (entrées, sorties) inclut les versements de ces lignes, ce qui fait évoluer le solde.
- RG15. Évolution : l'écran Comptes montre, pour le compte sélectionné, l'historique mensuel du solde (liste de mois avec début, entrées, sorties, solde), construite à partir de `bankMonth`. Forme retenue : un tableau d'une ligne par mois, pas de courbe. Pas d'affichage sur l'écran Budget.
- RG16. Assistant « Démarrage » : colonne « Compte dédié » (liste déroulante à pastille, option « Aucun ») dans les étapes Épargnes et Investissements, brouillon et `createFirstMonth` étendus.
- RG17. Mois verrouillé (année clôturée, ou mois clôturé si la spec 0005 est livrée) : les pastilles ne sont pas modifiables.
- RG18. Clôture d'année : les soldes des comptes dédiés apparaissent déjà dans la section « Comptes bancaires » (RG26 de 0002) ; rien n'est ajouté.

Colonne « Solde estimé » (blocs Épargnes et Investissements)
- RG19. Dans les blocs Épargnes et Investissements (écran Budget), la colonne « Écart » est remplacée par « Solde estimé ». Les autres blocs gardent leur colonne (Écart, ou Restant pour les variables).
- RG20. Solde estimé d'une ligne liée = solde estimé en fin de mois affiché M du compte dédié D, cumulé sur tous les mois depuis l'ouverture de D jusqu'à M inclus :
  solde de départ de D (`openingBalance`)
  + pour chaque mois initialisé de l'ouverture de D à M, pour chaque ligne `epa`/`inv` liée à D ce mois-là : son réel s'il est saisi, sinon son budget (mois passés comme mois affiché)
  + les autres mouvements de D de ces mois, pris tels quels (réel) : autres entrées, virements « faits », dépenses saisies sur D
  − les sorties d'épargne de ces lignes (transactions `epa`), mois par mois.
  Un mois passé sans réel compte donc son budget ; dès que le réel d'un mois est saisi, il remplace le budget de ce mois-là. Le solde estimé diffère volontairement du solde réel de D (`bankMonth`), qui n'inclut que les réels.
  Exemple : Livret A, départ 1 000 €, novembre budget 200 € sans réel, décembre budget 200 € sans réel : décembre affiche 1 400 € (et novembre 1 200 €). Novembre réel 150 €, décembre budget 200 € sans réel : 1 000 + 150 + 200 = 1 350 €. Novembre budget 200 € sans réel, décembre réel 200 € : 1 400 €.
- RG21. Le chiffre est celui du compte D, pas de la seule ligne : deux lignes liées au même D affichent le même solde estimé (il inclut les deux versements, mois passés compris). Il se recalcule dès la saisie d'un budget, d'un réel ou d'une sortie, sur le mois affiché ou sur un mois passé. Pour un mois passé, chaque ligne compte avec le lien qu'elle porte ce mois-là (comme RG9).
- RG22. Ligne sans compte dédié : même règle cumulée sur la ligne elle-même. Solde estimé = solde de la ligne au début du premier mois suivi + pour chaque mois jusqu'à M inclus (réel sinon budget de la ligne) − sorties d'épargne de la ligne. Un relevé saisi sur un mois repart de ce relevé (cohérent avec `accMonth`) : les budgets des mois précédant ce relevé ne comptent plus. Il n'y a jamais de cellule vide, sauf si le compte n'est pas encore ouvert (RG23).
- RG22bis. Mois passé non initialisé : contribution 0 (RG10). Les budgets des mois antérieurs à l'ouverture de D ne comptent pas (RG9). Seuls les versements des lignes `epa`/`inv` liées prennent leur budget à défaut du réel ; les autres mouvements de D (revenus, fixes, crédits, dépenses, virements) restent au réel.
- RG22ter. Année clôturée : le cumul repart du solde de clôture de l'année (`closes[].overrides`, RG26 de 0002) au 1er janvier suivant ; les budgets sans réel des mois de l'année clôturée ne comptent pas. Si l'année est clôturée sans solde de clôture pour ce compte, le solde réel du `Ledger` continue sa chaîne ; seuls les budgets sans réel repartent du 1er janvier suivant. Un relevé antérieur à ce 1er janvier ne fait pas reculer le point de départ. Mois clôturé (0005) sans clôture d'année : ses budgets sans réel comptent comme ceux de tout mois passé.
- RG23. Compte dédié non ouvert à ce mois (`openingMonth` postérieur) ou mois non initialisé : « — ».
- RG24. Le solde estimé est coloré en neutre ; en alerte (rouge) s'il est négatif. L'écart (réel − budget) reste visible dans l'infobulle de la cellule (« Écart : +X »). Le pied de bloc affiche la somme des soldes estimés des comptes distincts du bloc (un compte dédié commun à deux lignes n'est compté qu'une fois).

## Parcours utilisateur

Nominal 1 : le développeur a un compte bancaire « Livret A » (solde de départ 1 000 €, mois de départ = `firstMonth`). Dans le bloc Épargnes, il clique la pastille de la ligne « Livret A » et choisit le compte « Livret A ». Il saisit un réel de 200 € ce mois-ci. Le compte principal baisse de 200 €, « Livret A » monte à 1 200 € ; l'écran Comptes montre l'entrée de 200 € sur ce mois.

Nominal 2 (investissement) : ligne « PEA » (`inv`) liée à un compte bancaire « PEA ». Réel 300 € : « PEA » +300 €, le principal −300 €.

Sortie : sur la ligne « Livret A », sortie d'épargne de 150 € créditée au principal : « Livret A » −150 €, principal +150 €.

Changement de lien : il passe la ligne « Livret A » d'un compte à « Aucun » : les versements disparaissent du solde du compte pour ce mois et les suivants, les mois déjà créés gardent leur lien, la ligne et ses montants ne changent pas.

Cas limites : source = dédié (refusé) ; compte dédié archivé ; réel vide ; mois avant le mois de départ du dédié ; plusieurs lignes vers le même dédié ; relevé saisi sur la ligne.

## Design

Pas de maquette : design proposé ci-dessous, à valider. Réutilise `AccountDot`, `AccountPicker`, le menu de pastille des lignes rev/fix/cre.

Ligne du bloc Épargnes :

```
  ● Livret A            →  ● Livret A        200,00 €    200,00 €
  nom                   dédié                budget      réel
  (● = pastille du compte, source à gauche si modifiée)
```

Écran Comptes, compte dédié sélectionné :

```
+--------------------------------------------------+
| ● Livret A                       Solde  1 200,00 €|
| Reçoit : Livret A                                |
| Mois        Début    Entrées   Sorties   Solde   |
| Octobre   1 000,00   200,00      0,00  1 200,00  |
| Septembre   900,00   100,00      0,00  1 000,00  |
+--------------------------------------------------+
```

Bloc Épargnes avec la colonne « Solde estimé » :

```
Nom                     Budget    Réel    Solde estimé
● → ● Livret A          200,00   200,00     1 200,00 €
● → ● LDDS Travaux      100,00        —       850,00 €   <- budget pris en attente du réel
● ·· PEL                 50,00    50,00     3 400,00 €   <- sans compte dédié : solde de la ligne
```

États : sans lien (pas de pastille dédiée, ou « Aucun » discret) ; lié ; compte dédié archivé (pastille grisée) ; mois verrouillé (lecture seule). Pas d'état vide ni d'erreur nouveau, hors refus de RG2 (message en ligne : « Choisis un compte différent du compte débité »).

## Impact technique

- Domaine : `Line` et `TemplateLine` gagnent `linkedAccountId?` (inutilisé hors `epa`/`inv`). `bankFlow` (`ledger.ts`) ajoute les versements réels des lignes liées à `in`, et les sorties d'épargne de ces lignes à `out` (RG6). Fonction pure de validation du lien (RG2).
- Application : action « lier une ligne à un compte dédié » (mois + modèle, comme `setLineAccount`), refusée si mois verrouillé, ligne non `epa`/`inv`, compte inconnu ou égal à la source. `addTransaction` refuse un compte de réception égal au dédié (RG7). `createFirstMonth` et `setup.ts` étendus (RG16).
- Migration : aucune (champ absent = pas de lien). Le mécanisme de l'ADR 0003 n'est pas sollicité.
- Infrastructure : `localRepository` inchangé. Supabase repoussé (le champ devra figurer dans le futur schéma).
- Domaine : fonction pure du solde estimé d'une ligne (RG20 à RG22), lisant `Ledger` ; `lineGap` inchangé. Révision : `estimatedBalance` (`budget.ts`) ajoute aujourd'hui seulement les budgets sans réel du mois affiché au solde de fin de mois de `bankMonth`. Elle doit ajouter les budgets sans réel de tous les mois initialisés de l'ouverture de D jusqu'à M inclus (lignes liées à D chaque mois). Cas sans compte dédié : même cumul sur `accMonth` (début + versements − sorties), avec reprise au relevé. Après une année clôturée, le cumul repart du solde de clôture ; les budgets des mois antérieurs à l'ouverture de D sont ignorés ; chaque mois utilise le lien de sa propre ligne. `estimatedBalanceTotal` (pied de bloc) suit, sans changement de règle (un compte commun compté une fois). Le `Ledger` (`bankMonth`, `accMonth`, `bankFlow`) ne change pas : le cumul est calculé dans la fonction du solde estimé, afin de ne pas toucher aux soldes réels.
- Ce qui ne change pas : soldes réels de l'écran Comptes (`bankMonth`, uniquement réalisé), historique mensuel (RG15), mention « Reçoit », disponible à placer (0005), Reste à placer, taux d'épargne, relevé de la ligne (RG8), `lineGap`, clôtures et soldes de clôture, infobulle d'écart (RG24 inchangé : aucune infobulle d'écart quand aucun réel n'est saisi). Aucun changement de modèle de données ni de schéma.
- Présentation : `Budget.tsx` (colonne « Solde estimé » dans `BlockCard` pour `epa`/`inv`, en-tête et pied de bloc, infobulle d'écart ; pastilles des blocs `epa`/`inv`), `Accounts.tsx` (mention, historique), `Setup.tsx` (colonnes), composant de pastille partagé.
- À signaler (reprise de 0005, E3) : `setLineAccount` ne modifie que le mois affiché alors que son commentaire dit le contraire ; la nouvelle action doit, elle, mettre à jour le modèle (RG4).

## Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application). Le reste est vérifié à la relecture de l'UI.

- CA1 (T). Given une ligne `epa` « Livret A » liée au compte Livret A (départ 1 000 €), réel 200 €, When je lis les soldes, Then Livret A = 1 200 € et le principal est débité de 200 € (une seule fois).
- CA2 (T). Given la même ligne sans lien, When je lis les soldes, Then Livret A (compte bancaire) ne bouge pas et le principal est débité de 200 €.
- CA3 (T). Given une ligne `inv` liée à un compte « PEA », réel 300 €, When je lis les soldes, Then PEA +300 € et le principal −300 €.
- CA4 (T). Given une sortie d'épargne de 150 € sur la ligne liée, crédit au principal, When je lis les soldes, Then Livret A −150 € et principal +150 €.
- CA5 (T). Given une ligne liée sans réel (`actual` null), When je lis le solde du dédié, Then rien n'est ajouté.
- CA6 (T). Given une ligne dont la source est le compte A, When je choisis A comme compte dédié, Then c'est refusé et rien ne change. Idem pour une sortie créditée au compte dédié.
- CA7 (T). Given deux lignes liées au même compte dédié, When je lis son solde, Then les deux versements s'additionnent.
- CA8 (T). Given un lien retiré, When je lis le solde du dédié, Then les versements de la ligne n'y figurent plus pour le mois concerné et les mois créés ensuite ; les mois déjà créés gardent leur lien ; les montants de la ligne sont inchangés.
- CA9 (T). Given un dédié dont le mois de départ est postérieur à un versement, When je lis le solde, Then ce versement ne compte pas.
- CA10 (T). Given un dédié « hors budget », When je lis le Reste à placer, le disponible (0005) et le taux d'épargne, Then ils sont identiques à ceux d'une ligne sans lien.
- CA11 (T). Given une ligne liée, When j'utilise « Appliquer le modèle » ou « Dupliquer », Then le mois créé garde le lien.
- CA12 (T). Given un mois verrouillé, When j'appelle l'action de lien, Then elle est refusée.
- CA13 (T). Given un relevé saisi sur la ligne, When je lis le solde du dédié, Then il n'est pas modifié (RG8).
- CA14. Given le bloc Épargnes ou Investissements, When je clique la pastille de lien, Then un menu propose les comptes actifs sauf la source, plus « Aucun » ; la pastille affiche le compte choisi.
- CA15. Given l'écran Comptes, When j'ouvre un compte dédié, Then « Reçoit : <lignes> » et l'historique mensuel (début, entrées, sorties, solde) s'affichent et incluent les versements.
- CA16. Given l'assistant, When j'ouvre les étapes Épargnes et Investissements, Then une colonne « Compte dédié » est proposée avec l'option « Aucun ».
- CA17. Given un mois verrouillé, When je regarde les pastilles de lien, Then elles ne sont pas modifiables.
- CA18 (T). Given Livret A (départ 1 000 €, premier mois, sans autre mouvement) lié à une ligne de budget 200 € sans réel, When je lis le solde estimé, Then il vaut 1 200 € ; Given un réel de 150 €, Then 1 150 € (le réel remplace le budget).
- CA18bis (T). Given Livret A (départ 1 000 €, ouvert en novembre), ligne liée budget 200 € sans réel en novembre et en décembre, When je lis le solde estimé de décembre, Then il vaut 1 400 € (novembre : 1 200 €).
- CA18ter (T). Given le même cas avec un réel de 150 € en novembre et pas de réel en décembre, When je lis décembre, Then 1 350 € ; Given novembre sans réel et décembre réel 200 €, Then 1 400 €.
- CA18quater (T). Given le cas CA18bis, When je lis le solde réel de Livret A (`bankMonth`, écran Comptes) et le disponible (0005), Then ils sont identiques à avant (1 000 € en décembre, sans les budgets) : seul le solde estimé change.
- CA18quinquies (T). Given un mois passé non initialisé entre deux mois, When je lis le solde estimé du dernier, Then ce mois compte 0.
- CA19 (T). Given une sortie d'épargne de 100 € sur la ligne dans un mois (passé ou affiché) jusqu'à M, When je lis le solde estimé de M, Then il baisse de 100 €.
- CA20 (T). Given deux lignes liées au même compte (budgets 200 € et 100 €) sur deux mois, When je lis leur solde estimé, Then il est identique et inclut 300 € par mois.
- CA21 (T). Given une ligne sans compte dédié, budget 50 € sans réel en novembre et en décembre, solde de ligne 3 300 € au début de novembre, When je lis décembre, Then il vaut 3 400 € ; Given un réel de 40 € en novembre, Then 3 390 €.
- CA21bis (T). Given une ligne sans compte dédié avec un relevé saisi en novembre, When je lis décembre, Then le cumul repart du relevé, sans compter les budgets des mois avant novembre. Given la même ligne liée à un compte dédié, Then le relevé ne change pas le solde estimé (RG8).
- CA22 (T). Given un compte dédié non ouvert au mois affiché, When je lis le solde estimé, Then il est absent (« — »). Given un budget de ligne lié à D sur un mois antérieur à l'ouverture de D, Then il ne compte pas.
- CA22bis (T). Given une année clôturée avec un solde de clôture de Livret A de 2 000 € et un budget de 200 € sans réel en décembre de cette année, When je lis janvier suivant avec budget 200 € sans réel, Then 2 200 € (le budget de décembre n'est pas ajouté).
- CA22ter (T). Given une ligne liée à D en novembre puis passée à « Aucun » en décembre, When je lis décembre, Then le budget de novembre compte pour D et celui de décembre non (lien propre à chaque mois).
- CA22quater (T). Given une ligne dont D reçoit aussi une ligne de revenu budgétée sans réel sur D, When je lis le solde estimé, Then ce revenu n'est pas compté (réel uniquement).
- CA23. Given les blocs Épargnes et Investissements, When je les regarde, Then la colonne s'appelle « Solde estimé », les autres blocs gardent « Écart » / « Restant », et l'infobulle de la cellule donne l'écart.

## Questions ouvertes

Aucune. Décisions intégrées :
- Solde estimé cumulé (RG20 à RG22ter) : année clôturée = le cumul repart du solde de clôture ; budgets avant l'ouverture du dédié ignorés ; relevé de la ligne sans dédié remplace le cumul à partir de son mois (sans effet avec un dédié) ; seules les lignes `epa`/`inv` liées prennent leur budget à défaut du réel, les autres mouvements restent au réel ; chaque mois passé compte avec le lien de sa propre ligne. Exemple corrigé : 1 000 + 150 + 200 = 1 350 €.
- Deux pastilles côte à côte, source discrète puis dédié (RG13).
- Solde de la ligne (relevé inclus) et solde du compte dédié séparés (RG8). La validation d'une ligne générera plus tard un virement vers le compte associé, dans une spec à part.
- Évolution : tableau mensuel dans l'écran Comptes, sans courbe ni affichage sur le Budget (RG15).
- Pas de maquette : design proposé.
- Compte principal ou Espèces autorisés comme dédié (RG5).
- Pas de rattachement des versements passés (RG9).
