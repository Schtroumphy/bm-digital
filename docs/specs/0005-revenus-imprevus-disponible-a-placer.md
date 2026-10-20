# 0005 — Revenus imprévus : disponible à placer (réel)

- Statut : brouillon
- Date : 2026-10-20
- Branche prévue : feat/unplanned_income_available

Avenant aux specs 0002 (comptes bancaires), 0003 (allocation depuis le Budget) et 0004 (valider le mois).

## Contexte et objectif

Des revenus non prévisibles arrivent en cours de mois (déblocage de prêt, remboursements de santé…). Le « Reste à placer » du Budget est le plan du mois (calculé sur les budgets) : il ne doit pas bouger. L'utilisateur veut en revanche savoir combien d'argent réel il peut placer maintenant (épargne, enveloppes), en tenant compte de ces entrées imprévues, et aussi des revenus inférieurs au prévu.

Il n'y a pas de notion d'« imprévu » dans les données : un revenu imprévu est un revenu normal, sur une ligne de revenu de budget 0 € et de réel X € (ligne « Exceptionnel » ou créée à la saisie). L'écart réel − budget d'une ligne existe déjà (`lineGap`).

## Constats dans le code (écarts avec les hypothèses de départ)

Vérifiés dans `src/domain/bank.ts`, `budget.ts`, `ledger.ts`, `src/application/bankAccounts.ts`, `Budget.tsx`, `Accounts.tsx`.

- E1. Le « compte par opération » d'un revenu est un attribut de la ligne (`Line.accountId`, absent = compte principal), pas de la saisie du réel. Il n'y a aucun formulaire de saisie d'un revenu avec choix du compte (le formulaire « Nouvelle dépense » ne concerne que les transactions). Le compte se change via la pastille de la ligne (`setLineAccount`), et il vaut pour le budget ET pour le réel de la ligne. Conséquence : « budgété sur le principal mais encaissé sur un compte dédié » ne peut pas exister sur une même ligne ; il faut soit déplacer toute la ligne, soit créer une autre ligne.
- E2. Une ligne a un seul réel par mois : deux versements de comptes différents sur la même ligne ne sont pas représentables.
- E3. `setLineAccount` ne modifie que la ligne du mois affiché, pas le modèle (`template.lines`). Le commentaire de la fonction dit le contraire. La ligne garde son compte aux mois créés ensuite par « Dupliquer le mois précédent » (le modèle est recopié depuis ce mois) mais pas forcément avec « Appliquer le modèle ». Sans effet direct sur cette spec, à signaler.
- E4. Aujourd'hui, le « Reste à placer » (`monthSummary.remaining`) compte les budgets de tous les revenus dont le compte est « dans le budget » (`inBudget`), donc aussi un revenu rattaché à Espèces ou à un compte dédié réglé « oui ». Les lignes d'un compte « hors budget » sont exclues. Le critère « compte principal » demandé ici est donc différent du critère `inBudget` déjà en place.
- E5. Une ligne sans réel saisi a un écart `null` (pas −budget). Pour la règle demandée, cela veut dire qu'un salaire non encore saisi ne fait pas baisser le disponible. C'est aussi ce qui garantit la neutralité de la spec 0004 (la validation copie le budget dans le réel, écart 0).
- E6. « Placer dans le LDDS Travaux ensuite, le disponible redescend » n'est PAS vrai avec la formule demandée seule. Le LDDS est une ligne d'épargne/placement (`epa`/`inv`) : son versement réel débite bien le solde du compte principal (RG13 de 0002), mais il n'entre pas dans « Σ écarts des lignes de revenus ». Un virement (`Transfer`) vers une épargne est informatif et ne bouge rien ; un virement « fait » vers un autre compte bancaire ne touche que les soldes. Voir question Q1.
- E7. Changer de compte principal fige les lignes sans compte sur l'ancien principal (`setMainBankAccount`). Si le critère est « compte principal actuel », les revenus passés de l'ancien principal sortiraient du disponible des anciens mois. Voir question Q5.
- E8. Un compte archivé reste résolu par `bankAccount` : ses lignes gardent leur compte et leur pastille ; seule la liste de choix le masque.

## Périmètre

Inclus :
- Calcul et affichage d'un chiffre « Disponible à placer (réel) » par mois, écran Budget.
- Règle sur le compte d'encaissement (principal inclus, autre compte exclu).
- Détail du cas « versement direct sur un compte dédié » : écart, soldes, affichage, validation du mois.
- Tests du calcul (domaine).

Exclus :
- Colonne ou notion « imprévu » dans les données, nouvelle table, schéma Supabase.
- Report du disponible d'un mois sur l'autre (le chiffre est mensuel). Voir Q6.
- Répartition d'un même revenu sur plusieurs comptes (E2).
- Formulaire dédié de saisie d'un revenu avec choix du compte (E1), sauf si le développeur le demande (Q2).
- Modification du « Reste à placer » budgété, de `monthSummary.remaining` et du Taux d'épargne.
- Écran Clôture annuelle.

## Règles de gestion

Calcul
- RG1. Disponible à placer (réel) du mois M = Reste à placer budgété de M + Σ des écarts (réel − budget) des lignes de revenus de M qui comptent (RG2), positifs et négatifs.
- RG2. Une ligne de revenu compte si son compte est le compte principal (absence de `accountId` = principal) ET si ce compte est « dans le budget » (cas du principal en général, mais à garder explicite). Les revenus d'un autre compte (Espèces, Swile, compte dédié) ne comptent pas, même si ce compte est « dans le budget ». Voir Q3 pour la base du calcul.
- RG3. Une ligne de revenu sans réel saisi (écart `null`) contribue pour 0.
- RG4. Un revenu inférieur au prévu a un écart négatif et fait baisser le disponible.
- RG5. Le chiffre est recalculé dès la saisie d'un budget ou d'un réel de revenu, d'un changement de compte de la ligne, ou d'une allocation d'enveloppe (spec 0003), sans attendre « Valider le mois ».
- RG6. Le « Reste à placer » budgété n'est pas modifié et reste affiché. Le disponible est un chiffre en plus.
- RG7. Valider le mois (0004) ne change pas le disponible : la validation ne remplit que des lignes à réel `null` et à budget ≠ 0, dont l'écart passe de « absent » (0) à 0. Annuler la validation ne le change pas non plus.
- RG8. Mois non initialisé : le disponible n'est pas affiché (aperçu du modèle : réel absent donc égal au Reste à placer, affichage inutile).
- RG9. Le chiffre ne dépend pas du solde bancaire (Comptes) mais des lignes du mois ; il peut donc différer du solde réel du principal.

Compte de la ligne de revenu
- RG10. Cas général (prêt) : le déblocage est saisi sur une ligne de revenu du compte principal (budget 0, réel X) ; son écart +X augmente le disponible de X, le solde du principal augmente de X (RG13 de 0002, déjà en place).
- RG11. Versement direct sur un compte dédié : la ligne de revenu est rattachée au compte dédié (pastille de la ligne). Le réel crédite le solde de ce compte (déjà en place, `Entrées` de l'écran Comptes). L'écart de la ligne est affiché comme pour toute ligne, mais n'entre pas dans le disponible (RG2).
- RG12. Budget 0 / réel X sur compte dédié : écart +X sur la ligne, disponible inchangé, solde du compte dédié +X, « Reste à placer » inchangé.
- RG13. Ligne budgétée B > 0 et encaissée sur un compte dédié (la ligne entière est sur le dédié, E1) : l'écart (réel − B) s'affiche sur la ligne ; il n'entre pas dans le disponible. La question de B dans la base du calcul est Q3.
- RG14. Budgété sur le principal, encaissé sur un dédié : impossible sur une même ligne (E1). Deux manières de le représenter, à choisir (Q4) : (a) basculer la ligne sur le dédié (le budget bascule avec) ; (b) laisser la ligne du principal à budget B et réel vide ou 0, et créer une ligne « Exceptionnel » sur le dédié.
- RG15. Changement de compte après coup (principal vers dédié ou inverse) : le disponible, les soldes des deux comptes et le Reste à placer (si le critère `inBudget` change) sont recalculés immédiatement. Aucun montant de la ligne n'est modifié.
- RG16. Compte dédié archivé : ses lignes gardent leur compte, leurs pastilles et leurs soldes ; le disponible les exclut toujours (ce n'est pas le principal). Le compte reste absent des listes de choix. Un compte ne peut pas être supprimé.
- RG17. Compte dédié « hors budget » : ses lignes sont déjà exclues du Reste à placer (RG17 de 0002) et du disponible ; elles restent listées.
- RG18. Mois verrouillé (année clôturée) : le disponible reste calculé et affiché, en lecture seule.

Affichage
- RG19. Écran Budget : « Disponible à placer (réel) » s'affiche dans la carte héros « Reste à placer », en sous-ligne (Q7 pour l'emplacement).
- RG20. Quand le disponible est égal au Reste à placer (aucun écart de revenu), la sous-ligne reste visible mais neutre (pas d'alerte).
- RG21. Disponible négatif : même présentation que le Reste à placer négatif (couleur d'alerte existante).
- RG22. Écran Comptes : pas de nouvelle colonne. Le revenu d'un compte dédié figure dans ses « Entrées » et son solde (déjà en place). Une info-bulle sur la ligne de revenu (pastille d'un compte non principal) précise « Ne compte pas dans le disponible à placer ».
- RG23. Montants affichés au format existant (`money`).

## Parcours utilisateur

Nominal 1 (remboursement santé sur le principal) : Reste à placer 500 €, ligne « Exceptionnel » (principal) à budget 0 €. L'utilisateur saisit 120 € de réel. Disponible = 620 €, Reste à placer inchangé = 500 €.

Nominal 2 (déblocage de prêt, cas général) : la ligne « Déblocage prêt » (principal) reçoit 20 000 €. Disponible = Reste + 20 000 €, solde du principal +20 000 €. Il place ensuite l'argent dans LDDS Travaux : le résultat dépend de Q1.

Nominal 3 (versement direct sur un compte dédié) : l'utilisateur a un compte « Travaux ». Il crée une ligne de revenu « Prêt travaux » (budget 0), clique sur sa pastille et choisit « Travaux », puis saisit 20 000 € de réel. Le solde « Travaux » passe de 0 à 20 000 € (écran Comptes, Entrées +20 000). Le disponible et le Reste à placer ne bougent pas. L'écart de la ligne affiche +20 000 € (info-bulle : hors disponible).

Revenu inférieur au prévu : salaire principal budgété 2 950 €, réel 2 800 €. Écart −150 €, disponible = Reste − 150 €.

Cas limites :
- Revenu budgété sur le principal, non encore reçu (réel vide) : contribue 0 (RG3).
- « Valider le mois » : disponible identique avant/après (RG7).
- Ligne déplacée du principal vers un dédié après la saisie : le disponible perd son écart, le solde du dédié gagne le réel, le principal le perd.
- Compte dédié archivé ensuite : rien ne change dans les chiffres (RG16).
- Changement de compte principal : voir Q5.
- Mois non initialisé : pas de chiffre (RG8).

## Design

Design proposé, à valider (aucune maquette fournie). Réutilise la carte `kpi kpi-hero` du Budget, `kpi-sub`, les couleurs d'alerte existantes, `AccountPicker`, `AccountDot`.

Budget, carte « Reste à placer » (1440 px) :

```
+---------------------------------+
| Reste à placer                  |
| 500,00 €                        |   <- plan du mois, inchangé
| Disponible (réel) 620,00 €      |   <- nouvelle sous-ligne
+---------------------------------+
```

Variante B (Q7) : sixième KPI dédié « Disponible (réel) » après « Reste à placer ». Non retenue par défaut : la grille a déjà 6 cartes.

Ligne de revenu rattachée à un compte non principal :

```
[● Travaux] Prêt travaux        0,00 €     20 000,00 €   +20 000,00 €
                                           (info-bulle : « Encaissé sur Travaux : ne compte pas dans le disponible »)
```

États : vide (mois non initialisé : masqué), chargé, négatif (alerte), verrouillé (affiché, lecture seule). Erreur : sans objet (calcul local).

## Impact technique

- Domaine : une fonction pure (par exemple dans `budget.ts`) qui calcule le disponible d'un mois à partir de `monthSummary.remaining` et des écarts des lignes `rev` du compte principal ; ajout éventuel d'un champ à `MonthSummary` (nom indicatif `availableReal`). Aucun changement de type de données, aucune migration. `Line.accountId`, `lineGap`, `isLineInBudget`, `accountIdOf` suffisent.
- Application : aucune nouvelle action. `validateMonth` / `undoValidateMonth` inchangés. Si Q2 retient un formulaire de saisie, une action de création de ligne de revenu avec compte.
- Infrastructure / schéma Supabase : aucun changement (`actual`, `account_id` de la ligne existent ou sont hors périmètre de la spec 0002).
- Présentation : `Budget.tsx` (carte héros, info-bulle sur la pastille des lignes de revenu hors principal). L'écran Comptes est inchangé.

## Critères d'acceptation

(T) = test automatisé (Vitest, domaine).

- CA1 (T). Given Reste à placer 500 € et une ligne de revenu principal budget 0, réel 120, When je calcule, Then disponible = 620 € et Reste à placer = 500 €.
- CA2 (T). Given un revenu principal budget 2 950, réel 2 800, When je calcule, Then l'écart est −150 et disponible = Reste − 150.
- CA3 (T). Given plusieurs revenus principaux (+120 et −150), When je calcule, Then disponible = Reste − 30.
- CA4 (T). Given un revenu principal budgété sans réel, When je calcule, Then sa contribution est 0.
- CA5 (T). Given une ligne de revenu budget 0, réel 20 000 sur un compte dédié « dans le budget », When je calcule, Then le disponible = Reste, le solde du dédié vaut son départ + 20 000, et le solde du principal est inchangé.
- CA6 (T). Given une ligne de revenu budget 1 000, réel 1 200 sur un compte dédié, When je calcule, Then l'écart de ligne est +200, le disponible n'inclut pas ces +200. (Base du budget 1 000 : selon Q3.)
- CA7 (T). Given une ligne de revenu principale de réel 120 déplacée sur un compte dédié, When je recalcule, Then le disponible perd 120, le solde du dédié gagne 120 et celui du principal perd 120.
- CA8 (T). Given le même cas dans l'autre sens, When je recalcule, Then l'inverse se produit.
- CA9 (T). Given un compte dédié archivé portant un revenu de 500, When je calcule, Then le disponible l'exclut et le solde du compte inclut toujours 500.
- CA10 (T). Given un compte dédié « hors budget » portant un revenu, When je calcule, Then le disponible et le Reste à placer l'excluent, son solde l'inclut.
- CA11 (T). Given des lignes éligibles à la validation (0004) et un revenu principal budget 2 950 sans réel, When je valide le mois, Then le disponible est identique avant et après ; When j'annule, Then il l'est encore.
- CA12 (T). Given un revenu principal budget 0, réel vide, When je valide le mois, Then la ligne n'est pas modifiée et le disponible ne change pas.
- CA13 (T). Given une allocation d'enveloppe modifiée (0003), When je recalcule, Then Reste à placer et disponible varient du même montant.
- CA14 (T). Given un mois non initialisé, When je calcule, Then le disponible n'est pas affiché ou est égal au Reste à placer (selon RG8).
- CA15. Given le Budget d'un mois initialisé, When je regarde la carte « Reste à placer », Then la sous-ligne « Disponible (réel) » affiche le chiffre avec le même format, en alerte si négatif.
- CA16. Given une ligne de revenu rattachée à un compte non principal, When je survole sa pastille/écart, Then l'info-bulle « ne compte pas dans le disponible » apparaît.
- CA17. Given un mois d'une année clôturée, When je l'ouvre, Then le disponible est affiché et rien n'est éditable.
- CA18. Given un revenu sur un compte dédié, When j'ouvre l'écran Comptes, Then ses « Entrées » et son solde l'incluent et aucun autre chiffre de l'écran n'a changé.
- CA19 (T, selon Q1). Given un déblocage de 20 000 sur le principal puis un versement sur la ligne LDDS, When je calcule, Then le disponible suit la réponse à Q1.

## Questions ouvertes

1. Le disponible doit-il « redescendre » quand l'argent est placé (E6) ? La formule demandée ne compte que les écarts de revenus.
   - A. Formule inchangée : il ne redescend que si l'utilisateur augmente le budget de la ligne d'épargne/placement (ce qui baisse aussi le Reste à placer). Le réel versé sur une ligne `epa`/`inv` à budget 0 ne change rien.
   - B. Retirer aussi l'écart défavorable des lignes `epa`/`inv` du principal : disponible = formule + Σ (budget − réel) des lignes d'épargne/placement du principal (versement > budget fait baisser). Neutre à la validation (même raisonnement que RG7).
   - C. B + dépenses fixes, crédits, variables et sorties d'enveloppe hors prévu.
   - Recommandation : B, c'est la seule option qui rend vrai « le disponible redescend » avec la mécanique d'épargne existante. Un virement du principal vers un autre compte bancaire « fait » devrait-il aussi le faire baisser ? À confirmer (aujourd'hui il ne touche que les soldes).
2. Faut-il un vrai formulaire de saisie d'un revenu imprévu avec choix du compte (E1), ou garde-t-on la mécanique actuelle (créer une ligne, régler sa pastille, saisir le réel) ? Recommandation : mécanique actuelle (KISS), et une ligne « Exceptionnel » préremplie dans le modèle ? (oui/non).
3. Pour un revenu rattaché à un compte autre que le principal mais « dans le budget » (Espèces, dédié) : son budget B reste-t-il dans le Reste à placer (comportement actuel, E4) ? Dans ce cas, le disponible doit-il retirer ce B de sa base (Disponible = Reste − Σ budgets des revenus non principaux + Σ écarts des revenus principaux) ? Sinon un revenu budgété sur un dédié gonfle le disponible d'un argent qui n'arrive jamais sur le principal.
   - A. Retirer B de la base (cohérent avec « seuls comptent les revenus du principal »). Recommandé.
   - B. Ne rien retirer (formule littérale RG1).
4. Pour « budgété sur le principal, encaissé sur un dédié » (RG14) : option (a) basculer la ligne, ou (b) une ligne budget et une ligne « Exceptionnel » sur le dédié ? Recommandation : (a) si tout le montant change de compte, (b) sinon. Dans les deux cas, quel est le comportement attendu pour la ligne du principal restée à réel vide (écart 0, donc budget B « fantôme » dans le Reste à placer) ?
5. Changement de compte principal (E7) : accepter que les mois passés soient recalculés selon le principal actuel, ou figer chaque ligne sur le principal de l'époque ? Les lignes des anciens mois sont déjà figées sur l'ancien principal, donc elles sortiraient du disponible passé. Recommandation : accepter, cas très rare.
6. Le disponible est-il mensuel strictement (RG9), ou doit-il reporter le non-placé du mois précédent ? Recommandation : mensuel strict.
7. Emplacement du disponible dans le Budget : A. sous-ligne dans la carte héros « Reste à placer » (recommandé, pas de 7e carte) ; B. KPI séparé après « Reste à placer ».
8. Disponible = plafond d'allocation aux enveloppes (spec 0003) ? Aujourd'hui l'avertissement « Dépasse le reste à placer de X » (RG8 de 0003) est non bloquant, comparé au Reste à placer. Faut-il le comparer au disponible (réel) à la place, en plus (deux messages), ou ne rien changer ? Recommandation : le comparer au disponible quand il est affiché, toujours non bloquant ; le Reste à placer budgété restant la référence du plan. Si oui, 0003 reçoit un avenant (statut « validée »).
9. Mois non initialisé (RG8) : masquer le disponible ou l'afficher égal au Reste à placer ? Recommandation : masquer.
10. Info-bulle (RG22/CA16) : l'avez-vous voulue sur les lignes de revenu hors principal, ou préférez-vous une mention fixe (« hors dispo ») à côté de la pastille ?
