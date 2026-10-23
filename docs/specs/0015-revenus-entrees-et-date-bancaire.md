# 0015 — Revenus, entrées d'argent et date bancaire

- Statut : implémentée (corrections de revue intégrées : « Date hors soldes », sens dans la ressemblance, libellés). Implémentation : APRÈS la 0013 et la 0014 (livrées), AVANT la 0019 (pointage fictif et soldes réels).
- Date : 2026-10-23
- Branche prévue : feat/revenus_entrees_date_bancaire

## Contexte et objectif

L'import de la 0013 liste les entrées d'argent (amendement 4) mais ne les importe pas : le solde d'un compte ne reflète donc pas les versements (salaire, remboursement, cagnotte). Par ailleurs, une écriture n'a qu'un mois de rattachement budgétaire (`month`) et un jour (`day`) : un salaire reçu le 28/09 et rattaché à octobre serait daté 28/10 dans les soldes, et de même une dépense prélevée le dernier jour du mois précédent mais rattachée au mois courant.

Objectif :
1. Pouvoir importer une entrée d'argent en la rattachant à une ligne de revenu (`rev`) du mois, avec le modèle de la 0014 pour `fix`/`cre` (type d'écriture, ligne portée par ses écritures, réel alimenté, remplacement après confirmation).
2. Donner aux écritures importées (dépenses, retraits, transferts, revenus) une date bancaire réelle, distincte du mois de rattachement : le budget suit le mois de rattachement, les soldes suivent la date bancaire.

Principe directeur (celui de la 0014) : « le budget est une information et une estimation ; les écritures et les comptes sont la réalité ».

## Périmètre

Inclus :
- Date bancaire sur les écritures importées (dépenses, retraits, mouvements entre comptes, entrées d'argent) et sa lecture dans les soldes.
- Import des entrées d'argent : nature « Revenu », rattachement à une ligne `rev` (existante ou créée à budget 0), mois de rattachement.
- Ligne de revenu « portée par ses écritures » et anti-double-compte avec le pointage « reçu » (spec 0009), comme la 0014 pour `fix`/`cre`.
- Déduplication des crédits avec le sens ; règles mémorisées vers une ligne `rev`.
- Virements reçus : nature disponible à la main, non importée ; indice « virement possible » ; appariement renvoyé à la 0016.
- Schéma : migration additive.

Exclus : saisie manuelle d'une entrée d'argent hors import (viendra avec la 0019, icône « + Écriture » sur la ligne), qualification et liaison des virements internes (spec 0016), sorties d'épargne et motifs (0017), double pointage et rapprochement budget ↔ réalité (0018), pointage fictif et soldes réels (0019), lignes `fix`/`cre` (0014, livrée), épargne/invest, plusieurs comptes pour une même ligne, bilan annuel, revue comptes/objectifs.

## État des lieux (vérifié)

- Une `Transaction` est une sortie (types `var`, `env`, `epa`, et `fix` pour les lignes fixes et crédits, spec 0014 livrée, cible = clé de ligne). Le module `domain/lineExpenses.ts` porte le modèle de la 0014 : `isLineCarried`, `lineExpensesTotal`, `carriedLineNote` (infobulle), `expenseLineBlocker` (compte archivé), `actualReplacedBy` (réel remplacé après confirmation, option `replaceActual` de `addTransaction`). Aucune écriture « entrée » n'existe. `AccountMovement` exige une source et une destination.
- Un revenu est une ligne `rev` (spec 0005, revenu imprévu = ligne de budget 0 et de réel X). `bankMovements` la crédite à son compte au réel le 1er du mois ou au pointage « reçu » (spec 0009), sauf les lignes `fix`/`cre` portées (0014).
- `bankMovements` classe les écritures par mois via `t.month` et les date `month-day`.
- Les « Revenus attendus » (spec 0009) lisent le pointage « reçu » des lignes `rev` ; le « Disponible à placer (réel) » (spec 0005) lit leur réel.

## Règles de gestion

Date bancaire
- RG1. Toute écriture importée porte une date bancaire facultative `bankDate` (`AAAA-MM-JJ`) : la date de la ligne du fichier. Elle est distincte du mois de rattachement (`month`), qui reste le mois du budget (spec 0013, RG11).
- RG2. Les soldes (écran Comptes, solde estimé, mouvements d'un compte) rangent et datent une écriture par sa date bancaire : une écriture appartient au mois de sa date bancaire. Une écriture sans date bancaire (saisie manuelle, import antérieur) se range comme aujourd'hui, au mois de rattachement et au jour `day` (repli, aucune migration de données).
- RG3. Les calculs du budget (réel d'une ligne, totaux de l'écran Budget, bilan du mois, « Disponible à placer ») continuent de suivre le mois de rattachement, jamais la date bancaire.
- RG4. Quand le mois de rattachement diffère du mois de la date bancaire, l'écriture l'indique : l'aperçu d'import affiche l'état « Mois différent de la date » (0013) et, dans les listes d'écritures et le détail d'un compte, la date affichée est la date bancaire et « rattachée à octobre » figure dans l'infobulle de la ligne (rien n'est ajouté visiblement sur la ligne).
- RG5. La date bancaire n'est pas modifiable après import (hors suppression et réimport).
- RG6. Les soldes suivent la date bancaire même dans un mois déjà clos : l'import d'un salaire du 28/09 rattaché à octobre (ouvert) change le solde de fin septembre ; les chiffres du budget du mois clos ne changent pas (accepté, comme les soldes changeants déjà admis en spec 0009). Une écriture dont la date bancaire sort de la plage des soldes n'est pas perdue en silence : elle est signalée (RG6a).
- RG6a. État d'aperçu « Date hors soldes » (livré). Quand la date bancaire d'une ligne l'écarte des soldes, la ligne reçoit l'état « Date hors soldes » : non bloquant (la ligne reste importable), filtrable avec compteur (famille « état » de l'amendement 3 de la 0013), avec une infobulle qui donne la raison. Raisons : « Date avant le premier mois du budget » ; « Date avant l'ouverture du compte » ; « Année clôturée avec un solde de report ajusté » ; et, pour une date après la fin de la plage affichée par les soldes, la même mécanique avec la raison « Date après la fin de la plage des soldes ». La troisième raison ne s'applique que si le compte a un report ajusté pour l'année clôturée (override `bank:<id>`) ; sans report ajusté, la chaîne des soldes continue et l'écriture est reportée dans le solde suivant, donc aucune alerte. La vraie date bancaire est toujours gardée sur l'écriture. Une seule règle de bornes, partagée par le calcul des soldes et par l'avertissement (`balanceRange`), décide si une date est dans les soldes : l'avertissement ne peut pas diverger du calcul.
- RG6b. Le récapitulatif (étape finale de l'import) compte « Importées avec une date hors soldes » (lignes importées dont l'état était « Date hors soldes »).

Entrées d'argent importées
- RG7. Une entrée d'argent (crédit du fichier) peut être qualifiée « Revenu » dans l'aperçu : elle devient une écriture d'entrée (nouveau type de `Transaction`, `rev`, cible = clé de ligne, sens entrant, montant positif) sur le compte résolu de la ligne, rattachée à une ligne `rev` du mois de rattachement.
- RG8. Rattachement : l'utilisateur choisit une ligne `rev` existante du mois dont le compte (`accountId`, absent = compte principal) est le compte résolu de la ligne importée, ou « Nouvelle ligne de revenu » (RG9). Lignes d'un autre compte, `fix`, `cre`, `var`, enveloppes : non proposées. Une entrée d'un compte d'enveloppe n'accepte pas de ligne `rev` (spec 0011, RG2) : elle reste non importable.
- RG9. « Nouvelle ligne de revenu » crée, dans le mois de rattachement seulement, une ligne du bloc `rev` à budget 0 (revenu imprévu, spec 0005), de compte égal au compte résolu, portant le libellé court de la ligne importée (nom modifiable dans l'aperçu). Elle n'est pas ajoutée au modèle de budget et n'a aucun effet sur les mois suivants.
- RG10. Réel (comme la 0014, RG5 à RG7) : le réel (`actual`) d'une ligne `rev` portant des écritures est la somme de ses écritures. Si un réel est déjà saisi et que la ligne n'a aucune écriture, la première écriture le remplace après confirmation explicite (« Cette ligne a un réel saisi de X €. L'importer le remplacera par le montant des entrées et il ne sera pas restauré si vous supprimez ensuite l'écriture. »), une seule confirmation par import pour l'ensemble des lignes concernées (comme la 0014). Annuler n'écrit rien. Tant que la ligne porte des écritures, son réel n'est pas modifiable à la main. Supprimer la dernière écriture remet le réel à vide.
- RG11. Ligne « portée par ses écritures » (anti-double-compte, modèle de la 0014) : dès qu'une ligne `rev` porte une écriture, ses mouvements d'argent viennent de ses écritures, à leur date bancaire ; son propre mouvement (réel du 1er, montant « reçu » au pointage) n'est plus compté dans les soldes. Sans écriture, rien ne change.
- RG12. Le pointage « reçu » (spec 0009) reste possible, toujours cochable, et garde son rôle de statut ; il est sans effet sur les soldes tant que la ligne porte des écritures. Pointer ou dépointer ne change aucun solde. Cette information est dans l'infobulle de la ligne et de la case (voir Design).
- RG13. Mêmes garde-fous que la 0014 pour une ligne `rev` : le compte d'une ligne qui porte des écritures ne peut pas être changé (message adapté : « Cette ligne porte des écritures : supprimez-les ou déplacez-les avant de changer son compte. », sélecteur de compte désactivé) ; une entrée est refusée si le compte de la ligne est archivé ; l'annulation de « Valider le mois » ne vide pas le réel d'une ligne portée.
- RG14. « Revenus attendus » reste un indicateur purement budgétaire, non modifié par les entrées : une ligne `rev` portée et non pointée y pèse son BUDGET, jamais le réel alimenté par ses entrées ; une ligne non portée avec un réel saisi garde la règle de la spec 0009 (RG76) ; une ligne pointée en sort. Risque accepté par le développeur : le solde estimé compte déjà l'entrée alors que « Revenus attendus » compte encore la ligne tant qu'elle n'est pas pointée (même logique que « Reste à sortir » de la 0014, simplifié par la 0019). Le « Disponible à placer (réel) » lit le réel de la ligne, donc reflète les entrées importées (RG3).
- RG15. Mois verrouillé ou clos (spec 0004/0010) : ajout et suppression d'écriture refusés, comme pour les autres ; une écriture existante garde son effet sur les soldes.
- RG16. Plusieurs entrées sur une même ligne s'additionnent ; un montant différent du budget est accepté.

Virements reçus
- RG17. [Amendé après test : l'heuristique « virement » classait d'office en « Virement reçu », trop agressif] Indice « virement possible ». Quand le libellé ou les notes d'une entrée évoquent un virement (même détection qu'avant, `isTransferReceived`), la ligne porte l'indice « Virement possible : vérifiez que ce n'est pas un virement entre vos comptes ». L'indice est dans l'infobulle de la ligne ou de la pastille, jamais en texte permanent sur la ligne (principe « information de ligne de liste dans l'infobulle »). Il ne qualifie rien, ne change pas la nature proposée et ne désactive pas la case.
- RG18. Toute entrée (crédit) est proposée par défaut avec la nature « Revenu », à rattacher, qu'elle évoque un virement ou non. Sa case est décochée par défaut tant qu'aucune ligne `rev` (ou « Nouvelle ligne de revenu ») n'est choisie, et devient cochable dès que la ligne est choisie, comme pour les autres natures ; aucune désactivation automatique de la case.
- RG19. La nature « Virement reçu » existe toujours mais n'est plus jamais attribuée automatiquement : l'utilisateur la choisit pour les virements entre ses propres comptes. Un « Virement reçu » n'écrit rien (case désactivée tant que la nature est « Virement reçu ») : le mouvement entre comptes vient du débit de l'autre compte (spec 0013, RG10c), donc pas de double compte. Une entrée laissée « Revenu » alors qu'elle est un virement entre ses comptes serait comptée deux fois si le débit de l'autre compte est aussi importé : c'est le rôle de l'indice RG17 et de la qualification manuelle ; l'appariement automatique est l'objet de la 0016.
- RG19a. Effets : (1) Déduplication et réimport : une entrée importée comme « Revenu » est dédupliquée comme toute entrée (empreinte avec le sens, RG20) ; une entrée requalifiée « Virement reçu » n'est jamais écrite, donc elle ressort à chaque import avec l'indice et la nature proposée « Revenu » (à requalifier à nouveau, sauf règle mémorisée, point 3). (2) Récapitulatif : « Virements reçus (non importés) » ne contient que les lignes requalifiées à la main ; « Entrées d'argent (revenus) » compte les entrées importées. (3) Règles mémorisées : une règle de nature « Virement reçu » est possible pour une entrée qui revient régulièrement (sans cible) ; elle préremplit la nature, la case reste désactivée. (4) Compte « traité » (spec 0013, RG71) : toutes les entrées à importer (nature « Revenu », non encore importées) comptent comme lignes restantes ; les entrées requalifiées « Virement reçu » n'en font pas partie. (5) Filtres : le filtre de nature « Virement reçu » ne liste que les lignes requalifiées ; l'indice « virement possible » n'est pas un état filtrable.

Déduplication et règles
- RG20. Le sens entre dans l'empreinte des crédits (par exemple un préfixe `+`), de sorte qu'un crédit et un débit de même date, montant et libellé ne se confondent pas. L'empreinte des débits est inchangée (les empreintes déjà stockées restent valides). Le rang, le compte d'import et l'unicité (compte d'import, empreinte, rang) s'appliquent aux entrées.
- RG21. Les règles mémorisées (spec 0013, RG18) acceptent la nature « Revenu » avec pour cible une ligne `rev` par sa clé stable. Une règle dont la ligne n'existe pas dans le mois de rattachement, ou dont le compte ne correspond plus, n'est pas appliquée et la ligne reste à rattacher. Elle ne peut pas viser « Nouvelle ligne de revenu ».
- RG22. La catégorie Linxo reste une information facultative et un indice « Semblable déjà importée » / « Doublon probable », hors empreinte, comme pour les débits.
- RG23. Le sens (débit ou crédit) entre aussi dans la ressemblance : « Semblable déjà importée », « Doublon probable » et « Saisie manuelle semblable » ne rapprochent jamais un crédit d'un débit de mêmes compte, jour et montant.
- RG24. Doublon forcé d'une entrée : une entrée forcée prend le prochain rang libre de son empreinte (comme les dépenses, spec 0013, RG22).
- RG25. Aperçu, récapitulatif et filtres (livré) : le nom d'une « Nouvelle ligne de revenu » se saisit dans une ligne sous la ligne d'aperçu ; deux entrées rattachées à « Nouvelle ligne de revenu » créent deux lignes de revenu de même nom (une par entrée) ; les libellés du récapitulatif sont « Entrées d'argent (revenus) » (entrées importées) et « Virements reçus (non importés) » ; les filtres de nature gagnent « Revenu » et « Virement reçu » (voir RG19a) ; un compte est « traité » (spec 0013, RG71) quand ses dépenses et ses entrées à importer sont importées ou déjà importées (les entrées à importer comptent).
- RG26. Libellé de la liste de l'écran Saisie : « Opérations de {mois} » (elle contient aussi des entrées d'argent). Le total affiché reste la somme des dépenses seules, avec une infobulle qui le précise.

## Parcours utilisateur

Nominal : l'aperçu liste le salaire du 28/09 (état « Entrée d'argent », nature « Revenu », à rattacher) ; je choisis la ligne « Salaire » et le mois d'octobre ; à la validation, l'écriture est créée : le réel de « Salaire » d'octobre se met à jour, le solde du compte augmente le 28/09 (date bancaire), le budget d'octobre inclut le salaire.

Cas limites :
- Revenu sans ligne : « Nouvelle ligne de revenu » (budget 0), nom modifiable, mois de rattachement seulement.
- Ligne `rev` pointée « reçu » ET entrée importée : un seul mouvement (RG11, RG12).
- Réel déjà saisi : confirmation de remplacement (RG10).
- Suppression de la dernière écriture : réel vide, mouvement propre repris.
- Mois de rattachement clos : refus. Date bancaire dans un mois déjà clos : le solde de ce mois change, pas le budget (RG6).
- Date bancaire hors de la plage des soldes (avant le premier mois ou l'ouverture du compte, année clôturée à report ajusté, après la fin de la plage) : l'écriture est importée avec sa vraie date, la ligne porte l'état « Date hors soldes » et le récapitulatif la compte (RG6a, RG6b) ; elle ne disparaît pas silencieusement des soldes.
- Entrée évoquant un virement : proposée « Revenu » avec l'indice « virement possible » dans l'infobulle, case cochable une fois la ligne choisie (RG17, RG18). Virement entre ses propres comptes : l'utilisateur la requalifie « Virement reçu », elle n'est pas importée ; l'appariement avec le débit de l'autre compte vient avec la 0016 (RG19).
- Réimport du même fichier : les entrées déjà importées sont des doublons (RG20).
- Écritures existantes sans date bancaire : repli sur `month`/`day` (RG2).
- Entrée d'un compte non rattaché ou d'enveloppe : non importable.
- Changement du compte d'une ligne `rev` portée, ou compte archivé : refusés (RG13).

## Design

Design proposé, à valider (aucune maquette). Réutiliser `organic.css`, les pastilles et filtres de l'amendement 3 de la 0013.

Principe (décision du développeur, 0014 et 0019) : toute nouvelle information d'une ligne de liste est dans l'infobulle, jamais ajoutée sur la ligne. Il vaut pour les lignes de l'écran Budget et des listes ; pas pour les formulaires, confirmations ni bandeaux. Accessibilité : texte visuellement masqué rattaché à la case (`aria-describedby`) et `aria-label`.

Aperçu d'import (suite de l'amendement 4 de la 0013, états déjà visibles sous forme de pastilles) : les entrées deviennent cochables dès qu'elles sont complètes.
```
 ☐ 22 oct.  EN VOTRE FAVEUR Envoi cagnotte…   +1 600,00  Nature [Revenu v]  Rattacher à [Salaire v]        Mois [oct. v]  [À rattacher]
            (infobulle de la ligne : « Virement possible : vérifiez que ce n'est pas un virement entre vos comptes » ; nature proposée : Revenu, case cochable une fois la ligne choisie)
 ☑ 28 sept. VIREMENT SALAIRE ACME             +2 480,00  Nature [Revenu v]  Rattacher à [Salaire v]        Mois [oct. v]  [Mois différent de la date]
 ☑ 12 oct.  REMBOURSEMENT MUTUELLE               +42,10  Nature [Revenu v]  Rattacher à [+ Nouvelle ligne de revenu v] Nom [Remb. mutuelle ____] Mois [oct. v]  [Nouveau]
```
Rattacher à : groupe « Lignes de revenu » (lignes `rev` du compte résolu) puis « + Nouvelle ligne de revenu ». Nature : Revenu (par défaut pour toute entrée), Virement reçu (choisie à la main, non importée, case désactivée). Si un réel est saisi sur la ligne choisie, la pastille « Réel saisi à remplacer » apparaît et la confirmation unique est demandée à la validation.

Écran Budget, ligne de revenu portant des écritures : rien de nouveau n'est visible (une seule ligne, mêmes hauteur et alignement qu'une ligne sans écriture). L'infobulle de la ligne et de la case donne le nombre d'entrées (« n entrées, le réel est leur somme »), le compte, et « Pointage sans effet : la ligne est portée par ses écritures » (sur le modèle de `carriedLineNote`). La case « reçu » reste cochable ; lecteurs d'écran : texte masqué et `aria-describedby`.

Listes d'écritures et détail d'un compte : la date affichée est la date bancaire ; « rattachée à octobre » est dans l'infobulle quand le mois diffère (RG4).

États : aperçu (revenu à rattacher, réel saisi à remplacer, nouvelle ligne, virement reçu requalifié), listes (écriture sans date bancaire = date de rattachement).

## Impact technique (quoi, pas comment)

- Domaine : champ facultatif `bankDate` sur `Transaction` et `AccountMovement` ; nouveau type d'écriture `rev` dans `TxType` (à côté de `var`, `env`, `epa`, `fix`), sens entrant, cible = clé de ligne ; `domain/lineExpenses.ts` généralisé aux entrées de lignes `rev` (écritures de la ligne, ligne portée, total, note d'infobulle, refus de compte archivé, réel remplacé) ; fonction unique donnant la date bancaire d'une écriture (repli `month`/`day`) ; `bankMovements` classe et date par date bancaire, compte l'écriture `rev` en crédit, et ne produit plus le mouvement propre d'une ligne `rev` portée ; `Ledger` (écran Comptes, `bankFlow`) en découle ; `checkoff.ts` : « Revenus attendus » d'une ligne `rev` portée non pointée pèse son budget (RG14) ; toutes les lectures de `Transaction` qui additionnent des sorties (totaux de dépenses, réel des lignes `var`, dépensé des enveloppes, listes de l'écran Dépenses, `monthSummary`) distinguent le sens (une entrée n'est jamais une dépense) ; soldes recoupés (spec 0009, CA49 et suivants).
- Application : `addTransaction` accepte l'écriture `rev` (refus mois verrouillé, ligne hors bloc `rev`, compte différent de la ligne, compte archivé, remplacement du réel après confirmation via `replaceActual`) ; `deleteTransaction` retire la part du réel ; création de la ligne `rev` à budget 0 dans le mois ; `updateLine` refuse le réel et le compte d'une ligne `rev` portée ; `undoValidateMonth` ne vide pas une ligne portée ; import : nature « Revenu », cible `rev` / « nouvelle ligne » (`ImportNature`, `ImportTarget`), empreinte avec le sens, règles mémorisées (`ImportRule`), `prepareImport` (nature « Revenu » par défaut pour toute entrée, `isTransferReceived` ne fournit plus qu'un indice d'infobulle et n'attribue plus la nature « Virement reçu », cochage des entrées complètes sans désactivation automatique, état « Réel saisi à remplacer »), `validateImport` (bankDate sur toutes les écritures importées, confirmation unique de remplacement).
- Infrastructure / schéma : NOUVELLE migration additive (à écrire à l'implémentation) : colonne `bank_date date` nullable sur `transactions` et `account_movements` ; élargissement du `check` sur `transactions.type` au type `rev`, en repartant du `check` en vigueur après la 0014 (`var`, `env`, `epa`, `fix`) ; adaptation de la nature / cible des règles `import_rules` si elles sont typées en base ; conversion domaine ↔ lignes (`supabaseRows`), `database.types.ts`, test de contrat avec une entrée et une date bancaire. Aucune reprise de données : les écritures existantes restent valides sans date bancaire (repli).
- Présentation : aperçu d'import (`ImportWizard`, ligne d'import : nature Revenu, rattachement, nom de la nouvelle ligne, confirmation), ligne de revenu de l'écran Budget (infobulle, sans élément visible ajouté), listes et détail de compte (date bancaire, infobulle de rattachement).
- Règle de bornes des soldes : une fonction unique (`balanceRange`) décide de la plage couverte par les soldes ; le calcul des soldes (`bankMovements`, `Ledger`, `monthBalance`) et l'avertissement « Date hors soldes » de l'aperçu la partagent.
- Impact sur le code livré : `statementImport.ts`, `ImportWizard.tsx`, `bankMovements.ts`, `Ledger`, `checkoff.ts`, `lineExpenses.ts`, `actions.ts` (`addTransaction`, `updateLine`, `undoValidateMonth`), `Expenses.tsx`, `ImportRule` ; les écritures déjà écrites restent valides (repli de date).
- Documentation : architecture et ADR (date bancaire contre mois de rattachement ; ligne `rev` portée par ses écritures).

## Ce que la 0019 simplifiera (sans l'anticiper ici)

La 0019 (implémentée après la 0015) supprimera la notion de ligne « portée » et la saisie du réel : RG10 (réel remplacé après confirmation et état « Réel saisi à remplacer »), RG11 et RG12 (ligne portée, pointage sans effet), RG13 (garde-fous de compte et d'annulation de « Valider le mois »), CA5 à CA9 et les parties de CA19 liées. La date bancaire (RG1 à RG6), l'écriture d'entrée, le rattachement et la création de ligne de revenu restent. La saisie manuelle d'une entrée viendra avec la 0019.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given une entrée de 2 480 € du 28/09 rattachée à la ligne « Salaire » d'octobre, When j'importe, Then l'écriture a pour date bancaire le 28/09 et pour mois de rattachement octobre. (Auto)
- CA2. Given cette écriture, When je calcule les soldes, Then le compte augmente de 2 480 € le 28/09, dans le mois de septembre (même clos), le réel de « Salaire » d'octobre vaut 2 480 € et les chiffres du budget de septembre ne changent pas. (Auto)
- CA3. Given une dépense importée le 30/09 et rattachée à octobre, Then son effet sur le solde est le 30/09 et son effet sur le budget est en octobre. (Auto)
- CA4. Given une écriture sans date bancaire (saisie manuelle ou ancien import), Then elle se range au mois de rattachement et au jour `day`, comme avant ; les soldes existants ne changent pas. (Auto)
- CA5. Given une ligne `rev` « Salaire » de 2 480 € non pointée sans écriture, Then son propre mouvement est compté ; When elle reçoit une entrée de 2 480 €, Then le compte n'augmente qu'une fois. (Auto)
- CA6. Given la même ligne pointée « reçu » ET portant une entrée, When je pointe ou dépointe, Then aucun solde ne change. (Auto)
- CA7. Given un mois « au pointage » et un mois « au réel », When une ligne `rev` porte une entrée, Then les deux modes comptent l'entrée à sa date bancaire et pas le mouvement propre de la ligne. (Auto)
- CA8. Given une ligne `rev` avec un réel saisi de 2 400 € et sans écriture, When j'importe une entrée de 2 480 € dessus, Then la pastille « Réel saisi à remplacer » apparaît et, à la validation, une confirmation unique annonce le remplacement sans restauration ; annuler n'écrit rien ; confirmer met le réel à 2 480 €. (Auto sur le domaine, Man sur le message)
- CA9. Given une ligne portant une entrée, When je tente de modifier son réel ou son compte à la main, Then c'est refusé ; When je supprime la dernière entrée, Then le réel redevient vide et le mouvement propre est de nouveau compté. (Auto)
- CA10. Given une entrée et « Nouvelle ligne de revenu », When j'importe, Then une ligne `rev` à budget 0, au compte résolu et au nom saisi est créée dans le mois de rattachement avec un réel égal à l'entrée ; le modèle de budget et les autres mois ne sont pas modifiés. (Auto)
- CA11. Given une entrée d'un autre compte que celui de la ligne `rev`, ou d'un compte d'enveloppe, Then aucune ligne `rev` n'est proposée pour elle et elle n'est pas importable ; Given une ligne dont le compte est archivé, Then l'entrée est refusée. (Auto)
- CA12. Given une entrée sans cible, When je valide, Then elle n'est pas importée et ne compte pas dans « Importer N lignes ». (Auto)
- CA13. Given un crédit « virement » et un débit de même date, montant et libellé, Then leurs empreintes diffèrent ; Given un débit déjà importé avant cette spec, Then son empreinte est inchangée et un réimport le reconnaît comme doublon. (Auto)
- CA14. Given un réimport du même fichier, Then les entrées déjà importées sont des doublons décochés ; Given une entrée requalifiée « Virement reçu » (jamais écrite), Then elle ressort à l'import suivant avec la nature « Revenu » proposée et l'indice, sauf règle mémorisée. (Auto)
- CA15. Given une règle mémorisée « ACME → Salaire », Then la nature « Revenu » et la ligne sont préremplies ; Given une ligne `rev` absente du mois ou d'un autre compte, Then la règle n'est pas appliquée ; Given une règle de nature « Virement reçu » pour une entrée régulière, Then la nature est préremplie, la case est désactivée et rien n'est écrit. (Auto)
- CA16. Given une entrée dont les notes contiennent « VIREMENT EN VOTRE FAVEUR », Then sa nature proposée est « Revenu », son infobulle porte « Virement possible : vérifiez que ce n'est pas un virement entre vos comptes », rien de permanent n'est ajouté sur la ligne, et sa case est cochable dès que sa ligne de revenu est choisie (décochée tant qu'aucune n'est choisie) ; When je la requalifie « Virement reçu », Then la case est désactivée et rien n'est écrit pour elle ; When je la laisse « Revenu » et la rattache, Then elle est importée. (Auto sur la nature, la case et l'indice, Man sur l'infobulle)
- CA16a. Given des entrées requalifiées « Virement reçu » à la main, Then le récapitulatif « Virements reçus (non importés) » ne compte qu'elles, et un compte dont il ne reste que des entrées « Virement reçu » est « traité » alors qu'un compte avec une entrée « Revenu » non importée ne l'est pas. (Auto)
- CA17. Given un mois clos, When j'ajoute ou supprime une entrée sur une ligne `rev`, Then c'est refusé ; une écriture existante garde son effet sur les soldes. (Auto)
- CA18. Given le « Disponible à placer (réel) », When une entrée alimente le réel d'une ligne `rev`, Then il reflète ce réel. (Auto)
- CA19. Given les soldes d'un compte avec entrées, dépenses importées et lignes `rev`, Then en mois au réel le solde calculé de l'écran Comptes est égal au solde estimé de l'écran de pointage (égalité garantie) ; Given un mois au pointage (non-régression), Then le solde estimé compte l'entrée une seule fois et pointer ou dépointer ne le change pas. (Auto)
- CA20. Given une ligne `rev` non pointée de 2 400 € budgétés portant une entrée de 2 480 €, Then « Revenus attendus » compte 2 400 € (budget, jamais le réel) ; Given une ligne non portée avec un réel saisi de 2 450 €, Then elle compte 2 450 € ; Given la ligne pointée, Then elle sort des « Revenus attendus ». (Auto)
- CA21. Given l'annulation de « Valider le mois », Then le réel d'une ligne `rev` portée n'est pas vidé. (Auto)
- CA22. Given l'aperçu d'import, Then la nature Revenu, la liste des lignes `rev`, « Nouvelle ligne de revenu » et les pastilles « Mois différent de la date » et « Réel saisi à remplacer » s'affichent comme dans les wireframes. (Man)
- CA23. Given une ligne de revenu du Budget portant une écriture, Then elle ne change ni de hauteur ni d'alignement par rapport à une ligne sans écriture, aucun texte n'est ajouté en permanence, l'infobulle de la ligne et de la case donne le nombre d'entrées, le compte et « Pointage sans effet : la ligne est portée par ses écritures », la case reste cochable et porte un `aria-label` et un `aria-describedby` vers un texte masqué. (Man)
- CA24. Given les listes d'écritures et le détail d'un compte, Then la date affichée est la date bancaire et « rattachée à octobre » figure dans l'infobulle quand le mois diffère. (Man)
- CA25. Given la migration, Then la colonne de date bancaire et le type `rev` sont acceptés en base et les anciens types restent valides ; sauvegarder puis recharger redonne le même `BudgetData`, dates bancaires comprises. (Auto sur la conversion, Man sur la base)
- CA26. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)
- CA27. Given une ligne dont la date bancaire est avant le premier mois du budget, Then elle a l'état « Date hors soldes » avec la raison « Date avant le premier mois du budget », reste importable et garde sa vraie date. (Auto)
- CA28. Given une date avant l'ouverture du compte, Then l'état « Date hors soldes » porte la raison « Date avant l'ouverture du compte ». (Auto)
- CA29. Given une date dans une année clôturée dont le compte a un report ajusté (override `bank:<id>`), Then l'état porte la raison « Année clôturée avec un solde de report ajusté » ; Given le même cas sans report ajusté, Then aucune alerte et l'écriture est reportée dans le solde suivant. (Auto)
- CA30. Given une date après la fin de la plage affichée par les soldes, Then l'état « Date hors soldes » est posé avec sa raison. (Auto)
- CA31. Given les états « Date hors soldes », Then le filtre d'état les liste avec un compteur exact, l'infobulle donne la raison, l'import n'est pas bloqué, et le récapitulatif affiche « Importées avec une date hors soldes ». (Auto sur le filtrage et les compteurs, Man sur l'écran)
- CA32. Given une date juste dans la plage ou juste hors plage, Then l'avertissement et le calcul des soldes sont d'accord (même règle `balanceRange`) : une écriture signalée est bien absente des soldes, une écriture non signalée y est comptée. (Auto)
- CA33. Given un crédit et un débit de mêmes compte, jour et montant, Then « Semblable déjà importée », « Doublon probable » et « Saisie manuelle semblable » ne les rapprochent pas. (Auto)
- CA34. Given l'écran Saisie, Then la liste s'intitule « Opérations de {mois} », contient les entrées, et son total est la somme des dépenses seules avec une infobulle qui le précise. (Man)
- CA35. Given le récapitulatif, Then il affiche « Entrées d'argent (revenus) » et « Virements reçus (non importés) » ; Given les filtres de nature, Then « Revenu » et « Virement reçu » filtrent. (Auto, Man)
- CA36. Given un compte dont les dépenses sont importées et dont des entrées restent à importer, Then il n'est pas « traité » ; Given les entrées importées, Then il l'est. (Auto)
- CA37. Given deux entrées rattachées à « Nouvelle ligne de revenu », When j'importe, Then deux lignes de revenu de même nom sont créées ; Given un nom saisi dans la ligne sous la ligne d'aperçu, Then il est celui de la ligne créée. (Auto, Man)
- CA38. Given un doublon d'entrée forcé, Then il prend le prochain rang libre de son empreinte, sans conflit d'unicité. (Auto)

## Décisions du développeur (intégrées)

Soldes suivant la date bancaire même dans un mois déjà clos (RG6) ; « Revenus attendus » inchangé et budgétaire, risque de marge accepté jusqu'à la 0019 (RG14) ; ligne de revenu à budget 0 créée dans le mois de rattachement seulement, sans toucher au modèle de budget (RG9) ; saisie manuelle d'une entrée exclue, elle viendra avec la 0019 ; numéros : virements internes 0016, sorties d'épargne 0017, double pointage 0018, pointage fictif 0019.

## Questions ouvertes

Aucune.
