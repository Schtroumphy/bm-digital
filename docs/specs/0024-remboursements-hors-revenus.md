# 0024 — Remboursements : une entrée d'argent « hors revenus » qui réduit une dépense

- Statut : brouillon (points à valider listés dans « Décisions proposées »)
- Date : 2026-10-23
- Branche prévue : feat/remboursements_hors_revenus
- Dépend de : 0013, 0015, 0016 et 0019 (toutes implémentées sur `feat/virements_internes_lies`). Ne touche pas aux specs 0017, 0021, 0022, 0023.

## Contexte et objectif

Une entrée d'argent de source externe n'est pas toujours un revenu. « Refund Temu +40,58 € » sur le compte Shopping 2026 rembourse en partie des dépenses déjà faites : ce n'est pas un salaire. Aujourd'hui (0015 RG18, 0016 RG23) toute entrée externe est un « Revenu » rattaché à une ligne `rev`. Conséquences : le remboursement gonfle les « Revenus » du mois, le « Disponible à placer » et les « Revenus attendus », alors qu'il ne fait que compenser une dépense ; et la dépense d'origine garde un réel brut trop élevé.

Objectif :
1. Une nature d'entrée dédiée « Remboursement », distincte de « Revenu », proposée et modifiable ligne par ligne dans l'aperçu d'import.
2. Un remboursement crédite le compte (solde réel et solde estimé, à la date bancaire) mais ne compte jamais comme revenu.
3. Il se rattache à une ligne de dépense (ou une enveloppe) du mois, dont il réduit le réel net ; ou à aucune ligne (crédit libre sur le compte).

Principe directeur (0014, 0019) : le budget est une information ; les écritures et les comptes sont la réalité. Le réel d'une ligne reste la somme de ses écritures (0019, RG20), les remboursements s'y retranchent.

## Périmètre

Inclus :
- Nature d'import « Remboursement » (crédit externe), proposée par mots-clés, modifiable, avec cible et source facultative.
- Nouveau type d'écriture « Remboursement » : entrant, rattaché à une ligne de dépense (`var`, `fix`, `cre`), à une enveloppe, ou sans cible.
- Réel net d'une ligne ou d'une enveloppe (dépenses moins remboursements) et effets sur totaux, bilan, clôture, restant des variables.
- Exclusion explicite des revenus : « Revenus », « Disponible à placer », « Revenus attendus ».
- Soldes, déduplication, filtres, récapitulatif, règles mémorisées, schéma (migration additive).
- Amendements des specs 0015, 0016 et 0019.

Exclus :
- Lien informatif avec la dépense d'origine (décision du développeur : le remboursement est partiel, aucun lien, aucun choix de dépense précise). Le rattachement est à la LIGNE, pas à une écriture.
- Saisie manuelle libre d'un remboursement depuis l'écran Saisie (hors import) : voir D8.
- Remboursement dont la ligne de dépense est d'un autre mois que le mois de rattachement choisi (le mois de rattachement se règle sur la ligne d'aperçu, comme pour les revenus).
- Création d'une « nouvelle ligne de dépense » depuis l'aperçu (non proposée).
- Lignes `epa`/`inv` comme cible (les sorties d'épargne ont leur spec : 0017).

## État des lieux (vérifié)

- `ImportNature` = `depense | retrait | interne | externe | revenu | recu` (`domain/types.ts`). `revenu` crée une `Transaction` de type `rev`, cible = clé de ligne `rev`, `source` facultative (0016 RG3).
- `TxType` = `var | env | epa | fix | rev`. Seul `rev` est entrant ; les lectures des dépenses distinguent le sens via `type !== 'rev'` (par exemple `spentOf` dans `Expenses.tsx`).
- `lineActuals.ts` : le réel dérivé d'une ligne `var` = somme des `var` ; `fix`/`cre` = somme des `fix` ; `rev` = somme des `rev`. Un réel d'enveloppe (« dépensé ») = somme des `env` (`budget.ts`).
- Contraintes SQL : `transactions.type in ('var','env','epa','fix','rev')` ; `import_rules.nature in ('depense','retrait','interne','externe','revenu','recu')` ; `import_rules.target_kind in ('var','line','env','account')`.
- Solde estimé (0019) : lit les `var`, `env`, `epa` et transferts à leur date ; ne lit PAS les `fix`/`cre`/`rev` (ces lignes entrent par leur pointage, au montant compté).

## Règles de gestion

Nature et proposition à l'import
- RG1. Toute entrée d'argent (crédit externe) a une nature parmi « Revenu », « Remboursement », « Virement interne » (0016). Elle est modifiable ligne par ligne par un sélecteur « Nature » de l'aperçu.
- RG2. Nature proposée, par ordre de priorité : (1) règle mémorisée (RG17) ; (2) appariement ou compte d'enveloppe de la 0016 (« Virement interne ») ; (3) libellé ou notes évoquant un remboursement (mots-clés : « remboursement », « refund », « rembours », « avoir », « rbt ») : « Remboursement » ; (4) « Revenu » sinon, avec l'indice « virement possible » de la 0015 RG17 le cas échéant. Aucune détection n'est définitive : l'utilisateur tranche. Un doute (« avoir » dans un libellé de salaire) se corrige par le sélecteur, puis par la règle mémorisée.
- RG3. Une entrée « Remboursement » est décochée tant que sa cible n'est pas choisie (RG5), comme un revenu sans ligne (0015 RG18). « Aucune ligne » est un choix explicite qui la rend cochable.

Cible
- RG4. Cibles proposées pour un remboursement : (a) les lignes `var`, `fix` et `cre` du mois de rattachement dont le compte (`accountId`, absent = principal) est le compte résolu de la ligne importée (mêmes règles que la 0014 pour les dépenses de ligne) ; (b) l'enveloppe dont le compte est le compte résolu, si celui-ci est un compte d'enveloppe (cible présélectionnée) ; (c) « Aucune ligne (crédit libre sur le compte) ». Ne sont pas proposées : lignes `rev`, `epa`, `inv`, lignes d'un autre compte, et « Nouvelle ligne ».
- RG5. La cible est choisie par l'utilisateur dans l'aperçu (liste groupée « Lignes de dépense », « Enveloppe », « Aucune ligne »). Un remboursement n'a pas de lien avec une dépense précise : aucun sélecteur de dépense, aucun montant maximum, aucune vérification que la dépense d'origine existe.
- RG6. Compte archivé : un remboursement dont le compte résolu est archivé est refusé, comme une dépense de ligne (0014). Compte non rattaché (« Ne pas importer ») : non importable, comme aujourd'hui.

Écriture créée
- RG7. Un remboursement importé crée une écriture entrante « Remboursement » (nouveau type de `Transaction`, montant positif) sur le compte résolu, avec : mois de rattachement (choisi sur la ligne), date bancaire (0015 RG1), cible (clé de ligne, id d'enveloppe, ou aucune), détail (0020), et une « source » facultative.
- RG8. Source facultative (reprise de la 0016, RG3) : texte libre prérempli avec le libellé court (« Temu »), modifiable, enregistré avec l'écriture. Information seulement : hors empreinte, hors calcul. La RG3 de la 0016 s'étend aux deux natures « Revenu » et « Remboursement ».

Effet sur le budget (réel net)
- RG9. Réel d'une ligne de dépense = Σ dépenses de la ligne − Σ remboursements de la ligne, dans le mois de rattachement (extension de 0019 RG20). Une ligne qui n'a que des remboursements a donc un réel négatif.
- RG10. Pas de plancher : le réel net n'est jamais ramené à 0 (décision proposée D1). Un réel négatif s'affiche avec son signe ; le restant d'une ligne `var` (budget − réel, 0008) augmente du montant remboursé et peut dépasser le budget.
- RG11. Réel d'une enveloppe (« dépensé ») = Σ dépenses `env` − Σ remboursements de l'enveloppe, même règle (RG9, RG10). Son solde propre (alloc − dépensé) augmente d'autant.
- RG12. Lecture dérivée : les totaux de l'écran Budget, le bilan du mois, les totaux de dépenses, l'« épargne réelle » et la clôture d'année lisent ce réel net, sans autre changement (0019 RG24, RG23). Mois clos : même règle (somme des écritures).
- RG13. Un remboursement sans cible (crédit libre) n'a aucun effet sur le budget : ni réel de ligne, ni totaux, ni bilan. Seuls les soldes changent.
- RG14. Hors revenus : un remboursement n'entre jamais dans « Revenus » (réel ni budget), « Disponible à placer (réel) » (0005 : il ne lit que les lignes `rev`, `epa`, `inv`), « Revenus attendus » (0009) ni le pointage « reçu ». Il ne crée ni ligne `rev` ni écart de revenu.
- RG15. « Reste à sortir » reste purement budgétaire (0019 RG7) : un remboursement ne le change pas. Seul le « restant des variables » d'une ligne `var` (RG10) et le solde d'une enveloppe (RG11) bougent.
- RG16. Total de la liste « Opérations de {mois} » (0015 RG26) : la somme des dépenses seules, brute, un remboursement n'y est pas retranché ; l'infobulle du total le précise et donne le total des remboursements du mois (décision proposée D2).

Règles mémorisées, déduplication, filtres
- RG17. Règle mémorisée (0013 RG18) : la nature « Remboursement » mémorise le motif du libellé et la cible : une ligne de dépense par sa clé stable, une enveloppe par son id, ou le choix explicite « Aucune ligne ». Une règle dont la ligne n'existe pas dans le mois de rattachement, dont le compte ne correspond plus, ou dont le compte est archivé n'est pas appliquée : la nature est préremplie, la cible reste à choisir. La source (RG8) n'est pas mémorisée (comme 0016, écart RG20).
- RG18. Déduplication : comme un revenu (0015 RG20, RG24) : empreinte avec le sens `+`, rang, compte d'import, unicité (compte d'import, empreinte, rang). Requalifier une même ligne entre « Revenu » et « Remboursement » ne change pas son empreinte : un remboursement déjà importé est un « Doublon » quelle que soit la nature proposée au réimport. Ressemblance (0015 RG23) inchangée.
- RG19. Filtres de nature de l'aperçu : « Remboursement » s'ajoute à « Revenu » et « Virement interne ». Les filtres d'état (« À rattacher », « Doublon », « Mois différent de la date », « Date hors soldes »…) s'appliquent sans changement ; une entrée « Remboursement » sans cible est « À rattacher ».
- RG20. Récapitulatif : une ligne distincte « Remboursements » (nombre et total), à côté de « Entrées d'argent (revenus) », « Virements internes » (0016 RG21). Un compte est « traité » (0013 RG71) quand ses remboursements à importer sont importés ou déjà importés.

Soldes
- RG21. Solde réel (0019 RG1) : le remboursement est une écriture réelle ; il crédite le compte résolu à sa date bancaire (0015 RG2), dans le mois de sa date, même clos.
- RG22. Solde estimé : le remboursement est compté à sa date bancaire (décision du développeur) quand il compense une dépense que l'estimé compte déjà, c'est-à-dire quand sa cible est une ligne `var`, une enveloppe ou aucune ligne. Quand sa cible est une ligne `fix` ou `cre`, la dépense d'origine n'entre pas dans l'estimé (0019, définition : ces lignes entrent par leur pointage) : le remboursement n'y entre pas non plus, pour ne pas compter un crédit sans son débit (décision proposée D3). Aucun autre double compte.
- RG23. Compte hors budget : écriture réelle ; elle crédite son compte dans les deux soldes selon RG21 et RG22. L'isolation de la 0009 (RG92) ne vaut que pour les contreparties fictives, inchangée (0019 RG12).

Gestion après import
- RG24. Un remboursement est visible dans l'écran Saisie (liste « Opérations de {mois} ») avec le type « Remboursement », sa source en détail et sa cible ; supprimable (réel de la ligne recalculé) ; son montant, son libellé et sa cible ne sont pas modifiables hors suppression et réimport, comme les autres écritures importées de ce type (0015 RG5 pour la date). Mois verrouillé ou clos : ajout et suppression refusés ; une écriture existante garde son effet sur les soldes (0015 RG15).
- RG25. Suppression d'une ligne de budget qui porte des remboursements : même comportement que pour ses dépenses (le garde-fou existant s'applique aux deux).
- RG26. Affichage dans les comptes : « <libellé> (remboursement) » en entrée, avec la source ; jamais « Revenu » ni « Dépense ».

## Parcours utilisateur

Nominal : l'aperçu liste « REFUND TEMU +40,58 € » du compte Shopping 2026 ; la nature proposée est « Remboursement » (mot « refund »), cible à choisir ; je choisis la ligne `var` « Shopping » du mois, source « Temu ». J'importe : le compte Shopping 2026 monte de 40,58 € à la date bancaire ; le réel de « Shopping » baisse de 40,58 € (réel net) et son restant monte d'autant ; « Revenus » et « Disponible à placer » ne bougent pas. Réimport : doublon.

Cas limites :
- Libellé sans mot-clé (« PAYPAL EUROPE ») : proposé « Revenu » ; je passe à « Remboursement » ; la règle mémorisée le fera pour la suite.
- « Avoir » dans un libellé de salaire : proposé « Remboursement » ; je requalifie « Revenu ».
- Remboursement supérieur aux dépenses de la ligne : réel net négatif, accepté et affiché avec son signe (RG10).
- Remboursement d'un achat d'un mois précédent : rattaché au mois choisi, la ligne du mois de rattachement le reçoit ; si la ligne d'origine n'existe plus ce mois-ci, « Aucune ligne » (crédit libre).
- Aucune ligne de dépense convenable : « Aucune ligne » rend l'entrée importable ; seul le solde du compte bouge.
- Cible = ligne `fix`/`cre` : réel net de la ligne réduit ; solde estimé non crédité (D3).
- Compte d'enveloppe : l'enveloppe est présélectionnée ; son dépensé baisse.
- Mois de rattachement clos ou verrouillé : ligne signalée, non importable (0013 RG12).
- Ligne ciblée supprimée avant l'import : cible vide, entrée « À rattacher ».
- Entrée requalifiée entre « Revenu » et « Remboursement » avant validation : la cible choisie est vidée si elle n'est plus proposée par la nouvelle nature.

## Design

Design proposé, à valider (aucune maquette fournie). Réutiliser `organic.css`, les pastilles, filtres et lignes d'aperçu de la 0013 (amendement 3), 0015 et 0016.

Aperçu d'import, ligne de remboursement :
```
 ☐ 14 oct.  REFUND TEMU                      +40,58  [Shopping 2026]  Nature [Remboursement v]  Rattacher à [Choisir… v]  Source [Temu ____]  Mois [oct. v]   [À rattacher]
 ☑ 14 oct.  REFUND TEMU                      +40,58  [Shopping 2026]  Nature [Remboursement v]  Rattacher à [Shopping (variable) v]  Source [Temu ____]  Mois [oct. v]
 ☑ 15 oct.  AVOIR DARTY                     +120,00  [Compte principal]  Nature [Remboursement v]  Rattacher à [Aucune ligne (crédit libre) v]  Source [Darty ____]  Mois [oct. v]
```
Sélecteur « Nature » : Revenu, Remboursement, Virement interne (les autres natures de débit restent propres aux débits). Sélecteur « Rattacher à » d'un remboursement :
```
 Rattacher à [ v ]
   Lignes de dépense   Shopping (variable) · Assurance auto (fixe) · Crédit auto
   Enveloppe           Shopping 2026
   Sans ligne          Aucune ligne (crédit libre sur le compte)
```
Pastille de nature « Remboursement » : teinte neutre distincte de « Revenu » (pas la teinte revenu), pour qu'on ne la confonde pas.

Écran Budget, ligne de dépense avec remboursement : aucune modification visible (principe 0019 : l'information est dans l'infobulle). Infobulle de la ligne : « 3 écritures, réel = dépenses − remboursements (dont 1 remboursement de 40,58 €) ». Réel négatif affiché avec son signe. Aucune pastille, aucun élément ajouté, hauteur et alignement inchangés. Texte masqué pour les lecteurs d'écran (`aria-describedby`).

Écran Saisie : type « Remboursement » dans la liste (étiquette « Remboursement », montant en entrée), filtre de type.

Récapitulatif : `Remboursements   2 · 160,58 €` à côté de `Entrées d'argent (revenus)` et `Virements internes`.

États : aperçu (à rattacher, rattaché, crédit libre, doublon, mois clos), Budget (réel net, réel négatif), Saisie (liste), comptes.

## Impact technique (quoi, pas comment)

- Domaine : nouveau `TxType` « Remboursement » (code proposé `rbt`), entrant, montant positif, cible = clé de ligne `var`/`fix`/`cre`, id d'enveloppe, ou vide ; fonction pure de réel net d'une ligne (dépenses − remboursements) dans `lineActuals.ts` (`lineEntryAmounts` signe les remboursements en négatif) ; `budget.ts` : dépensé d'enveloppe net ; `ImportNature` gagne `remboursement` ; `ImportTarget` gagne le choix explicite « aucune ligne » pour la mémorisation ; `bankMovements` crédite l'écriture à sa date bancaire dans le solde réel et, selon RG22, dans l'estimé ; `checkoff.ts` (« Revenus attendus ») et `availableReal` (« Disponible à placer ») ne lisent jamais ce type ; toutes les lectures qui additionnent des sorties distinguent le sens de ce type (aujourd'hui `type !== 'rev'`) : `spentOf` et filtres de `Expenses.tsx`, `monthSummary`, `budget.ts` (`envelopeSpent`, `savingsOut`), `Accounts.tsx` (`IMPUTATION_KIND`), `quickEntry.ts`.
- Application : `prepareImport` (nature proposée par mots-clés et priorité RG2, cibles RG4, source prérempli, état « À rattacher », filtre de nature, indice), `validateImport` (création de l'écriture, réel net resynchronisé via `syncLineActual`), `addTransaction`/`deleteTransaction` (refus mois verrouillé ou clos, compte archivé, ligne hors `var`/`fix`/`cre`), règles mémorisées (`rememberRule`, application avec les garde-fous RG17), récapitulatif et compte « traité » (RG20).
- Infrastructure / schéma : NOUVELLE migration additive (à écrire à l'implémentation) : élargir `transactions_type_check` à `rbt` (en repartant de `var, env, epa, fix, rev`) ; élargir `import_rules_nature_check` à `remboursement` ; élargir `import_rules.target_kind` au choix « aucune ligne » si la règle le mémorise (valeur réservée, sans colonne en plus, comme `'enveloppes'` en ADR 0021) ; la colonne `source` des `transactions` existe déjà (0016) ; `supabaseRows`, `database.types.ts`, test de contrat avec un remboursement ciblé et un libre. Aucune reprise de données : les entrées déjà importées « Revenu » restent des revenus (voir D7).
- Présentation : `ImportWizard`/`ImportRow` (option « Remboursement », sélecteur de cible groupé, source, pastille), écran Budget (infobulle du réel net, réel négatif), `Expenses.tsx` (libellé de type, filtre, total brut + infobulle), `Accounts.tsx` (libellé d'imputation), récapitulatif.
- Documentation : architecture et ADR (remboursement = entrée hors revenus, réel net par ligne, pas de plancher).

## Amendements nécessaires aux specs existantes

À écrire à la validation de cette spec (ne pas modifier maintenant) :
- 0015 : RG18 (« toute entrée est proposée Revenu par défaut ») devient « Revenu, sauf libellé de remboursement (0024 RG2) » ; RG19a et son récapitulatif/filtres s'étendent à « Remboursement » ; RG26 (total « Opérations ») renvoie à 0024 RG16 ; CA16 inchangé pour les entrées « virement ».
- 0016 : RG1 gagne la troisième nature « Remboursement » ; RG2 gagne l'étape mots-clés ; RG3 (source facultative) s'applique aux deux natures ; RG23 (« remboursements et avoirs = revenus ») est REMPLACÉE par 0024 ; « Exclus » et R4 : le lien informatif reste exclu, mais les remboursements ne sont plus comptés comme revenus ; CA7a est remplacé : « un avoir ou un remboursement qualifié « Remboursement » et rattaché à une ligne de dépense réduit son réel net et ne compte pas dans les revenus » ; RG21 (récapitulatif) gagne la ligne « Remboursements ».
- 0019 : RG20 (réel de ligne) : « somme des écritures » devient « dépenses − remboursements » pour `var`, `fix`, `cre` et enveloppes ; définition du solde estimé : ajouter « et les remboursements de lignes `var`, d'enveloppes et sans cible » (RG22) ; CA13 et CA17 inchangés pour le cas sans remboursement ; RG13 (aucune écriture comptée deux fois) respectée par RG22.

## Décisions proposées (à valider par le développeur)

- D1. Pas de plancher du réel net (RG10) : un réel de ligne peut être négatif. Option B : plancher à 0, mais les totaux ne seraient plus la somme des écritures (perte d'additivité, incohérence avec le solde). Recommandation : A (pas de plancher).
- D2. Total de la liste « Opérations » (RG16) : brut (dépenses seules) avec infobulle. Option B : net (dépenses − remboursements). Recommandation : A, cohérent avec 0015 RG26.
- D3. Solde estimé (RG22) : remboursement compté si la cible est `var`, enveloppe ou aucune ligne ; non compté si la cible est `fix`/`cre` (dépense non comptée dans l'estimé). Cela s'écarte légèrement de « solde estimé à la date bancaire » pour tous les cas. Option B : toujours compter (risque : crédit estimé sans débit pour `fix`/`cre`).
- D4. Cibles autorisées (RG4) : lignes `var`/`fix`/`cre` et enveloppe du compte, plus « Aucune ligne ». L'enveloppe est ajoutée parce que le compte Shopping 2026 est probablement un compte d'enveloppe. À confirmer.
- D5. « Aucune ligne » est un choix explicite (entrée décochée tant qu'aucune cible n'est choisie, RG3), pour éviter qu'un remboursement perde son rattachement budgétaire par oubli. Option B : « Aucune ligne » par défaut (cochée d'office).
- D6. Mots-clés de proposition (RG2) : remboursement, refund, rembours, avoir, rbt, vérifiés dans le libellé et les notes. Liste à compléter.
- D7. Les revenus déjà importés qui sont en réalité des remboursements ne sont pas migrés automatiquement ; l'utilisateur les supprime et réimporte, ou les requalifie à la main (aucun outil de requalification d'une écriture existante dans cette spec).
- D8. Pas de saisie manuelle libre d'un remboursement (hors import) : l'écriture rapide « + Écriture » (0019 RG21) reste une dépense. À réévaluer en spec ultérieure.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given une entrée « REFUND TEMU +40,58 € », Then sa nature proposée est « Remboursement », sa case est décochée, l'état « À rattacher » est affiché, et le sélecteur Nature propose Revenu, Remboursement, Virement interne. (Auto sur la proposition, Man sur l'écran)
- CA2. Given une entrée sans mot-clé de remboursement (« VIREMENT SALAIRE ACME »), Then sa nature proposée reste « Revenu ». Given « AVOIR DARTY », Then « Remboursement ». Given une règle mémorisée, Then elle prime sur les mots-clés. (Auto)
- CA3. Given un remboursement et la ligne `var` « Shopping » (budget 100 €, dépenses 80 €) choisie, When j'importe 40,58 €, Then le réel de « Shopping » vaut 39,42 € et son restant 60,58 €. (Auto)
- CA4. Given le même cas, Then « Revenus », « Disponible à placer (réel) » et « Revenus attendus » sont inchangés, aucune ligne `rev` n'est créée et « Reste à sortir » est inchangé. (Auto)
- CA5. Given un remboursement de 150 € sur une ligne dont les dépenses valent 80 €, Then son réel vaut −70 €, affiché avec son signe, et les totaux le prennent tel quel (pas de plancher). (Auto sur le calcul, Man sur l'affichage)
- CA6. Given un remboursement sur une ligne `fix` ou `cre`, Then son réel net est réduit de son montant. (Auto)
- CA7. Given un compte d'enveloppe, Then l'enveloppe est présélectionnée et son dépensé est réduit du montant. (Auto)
- CA8. Given « Aucune ligne (crédit libre) », When j'importe, Then aucun réel de ligne, total, bilan ni clôture ne change et le solde du compte monte. (Auto)
- CA9. Given un remboursement non encore rattaché, Then il n'est pas importable et ne compte pas dans « Importer N lignes » ; les lignes `rev`, `epa`, `inv` et d'un autre compte ne sont pas proposées. (Auto)
- CA10. Given un remboursement du 14/10, Then le solde réel du compte monte à cette date bancaire, même dans un mois clos, et les chiffres du budget d'un mois clos ne changent pas. (Auto)
- CA11. Given une cible `var`, enveloppe ou aucune ligne, Then le solde estimé monte à la date bancaire ; Given une cible `fix`/`cre`, Then le solde estimé ne bouge pas ; dans tous les cas aucun crédit n'est compté deux fois. (Auto)
- CA12. Given un compte hors budget, Then le remboursement le crédite dans les deux soldes selon CA10 et CA11, et le compte principal n'est pas touché. (Auto)
- CA13. Given un remboursement importé, When je réimporte le fichier, Then la ligne est un « Doublon » décoché quelle que soit la nature proposée ; un crédit et un débit de mêmes compte, jour, montant et libellé ont des empreintes différentes. (Auto)
- CA14. Given une règle « REFUND TEMU → Remboursement, ligne Shopping », Then nature et cible sont préremplies ; Given une ligne absente du mois, d'un autre compte ou un compte archivé, Then la nature est préremplie et la cible reste à choisir. (Auto)
- CA15. Given un remboursement, When je le supprime, Then le réel de la ligne revient à sa valeur précédente et ses deux clés de déduplication sont libérées ; Given un mois verrouillé ou clos, Then ajout et suppression sont refusés. (Auto)
- CA16. Given une source saisie « Temu », Then elle est enregistrée avec l'écriture, absente de l'empreinte et de tout calcul. (Auto)
- CA17. Given le récapitulatif, Then il affiche « Remboursements » (nombre, total) distinct de « Entrées d'argent (revenus) » ; Given les filtres, Then « Remboursement » filtre la nature ; Given un compte avec un remboursement à importer, Then il n'est pas « traité ». (Auto sur les compteurs, Man sur l'écran)
- CA18. Given la liste « Opérations de {mois} », Then le remboursement est étiqueté « Remboursement », le total est la somme des dépenses seules et l'infobulle indique le total des remboursements. (Man)
- CA19. Given une ligne du Budget avec remboursement, Then elle ne change ni de hauteur ni d'alignement, rien n'est ajouté en permanence, l'infobulle donne « réel = dépenses − remboursements » et le nombre de remboursements. (Man)
- CA20. Given la migration, Then le type `rbt`, la nature `remboursement` et le choix « aucune ligne » sont acceptés en base, les anciennes valeurs restent valides, et sauvegarder puis recharger redonne le même `BudgetData` (remboursement ciblé et libre). (Auto sur la conversion et le contrat, Man sur la base)
- CA21. Given une écriture « Remboursement », Then aucune lecture de dépenses (totaux, bilan, enveloppes, `monthSummary`, liste Saisie) ne la compte comme une dépense positive. (Auto)
- CA22. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune bloquante. Les points D1 à D8 sont des décisions proposées qui attendent la validation du développeur.
