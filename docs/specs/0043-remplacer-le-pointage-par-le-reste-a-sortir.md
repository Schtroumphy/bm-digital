# 0043 — Remplacer le pointage par un encart « reste à prélever / à retirer »

- Statut : implémentée
- Date : 2026-11-04
- Branche prévue : refactor/remplacer_pointage_par_reste_a_sortir

## Contexte et objectif

Parole du développeur : depuis qu'il importe régulièrement ses opérations, le pointage (cocher une ligne « l'argent a bougé ») ne lui sert plus. Il lui servait à vérifier que le solde actuel suffira pour les mouvements à venir (retraits, prélèvements, etc.). Il remplace donc le pointage par un encart « reste à prélever / à retirer ».

Valeur : un écran Budget plus simple (plus de case à entretenir à la main) et la même réponse à la vraie question, « mon solde tient-il jusqu'à la fin du mois ? », fondée sur les opérations réelles importées.

## État des lieux (vérifié dans le code)

1. Case à cocher par ligne (`LineCheck.tsx`) et par allocation d'enveloppe (`EnvelopeCheck.tsx`), avec date (`MonthData.checks`, type `LineCheck`).
2. Date prévue (`dueDay`), mode d'exécution (`execMode`) et badge « en retard ».
3. Carte « Pointage par compte » (`PointageCard.tsx`, `accountPointage` dans `domain/checkoff.ts`) : solde réel, solde estimé, écart réel moins estimé, « Reste à sortir », « Revenus attendus », « Marge », relevé, détail Réel / Estimé.
4. Solde estimé (`estimatedMovements`) : lignes pointées et contreparties fictives ; anti-double-compte avec les transferts (`movementTargets.ts`, `transfers.ts`) ; signal « Semblable à un pointage / Rattacher » (écran Dépenses) ; liste grise des comptes hors budget.
5. Autres lecteurs : tableau de bord (`dashboard.ts`), écran Dépenses (filtre « pointées », surbrillance), écrasement des lignes d'un mois, graine, `migrate.ts`, `supabaseRows.ts` et test de contrat.
6. Specs liées : 0009, 0019 (et amendements 0007, 0010, 0011, 0014, 0015, 0037, 0041) ; ADR 0005 et 0017.

Le pointage n'affecte jamais le solde réel (spec 0019, RG6).

## Périmètre

Inclus :
- Suppression de la case de pointage (lignes et allocations d'enveloppe) et de tout calcul qui lit un pointage.
- Nouvel encart « À venir ce mois-ci » sur l'écran Budget, qui remplace la carte « Pointage par compte ».
- Suppression du solde estimé (budget), de l'écart réel moins estimé, de la vue « Estimé » du détail d'un compte, de la liste grise des mouvements ignorés des comptes hors budget et du signal « Semblable à un pointage / Rattacher ».
- Retard, tâches du tableau de bord, écran Dépenses alignés sur la nouvelle règle.

Exclus :
- Solde réel, écritures, import, relevé, régularisation, clôture : inchangés (spec 0041, 0019).
- Réel dérivé d'une ligne : inchangé (spec 0019 RG20, spec 0028).
- Données de pointage existantes : conservées inertes en base, ignorées ; leur nettoyage (suppression en base, types) fera l'objet d'une spec ultérieure.
- Tableau de bord : pas de nouvel encart (seulement l'alignement de ses tâches).

## Règles de gestion

- RG1. Plus aucune case de pointage sur une ligne du budget ni sur une allocation d'enveloppe.
- RG2. Solde réel, écritures, relevé, écart de relevé, régularisations et clôture du mois : valeurs identiques avant et après la spec pour les mêmes données.
- RG3. Aucun calcul ne lit plus l'état « pointé » d'une ligne ni d'une allocation.
- RG4. L'encart est purement informatif : il n'écrit aucune donnée et n'entre dans aucun solde.
- RG5. (Amendé le 2026-11-05.) Reste d'une ligne : pour une ligne **fixe**, un **crédit** ou une **variable à compte dédié**, le budget entier tant qu'elle n'a aucune écriture ; dès qu'elle en a une, **0** (le budget non dépensé est un bonus, pas un reste à sortir). Pour toute autre ligne (variable du compte principal, revenu, épargne, investissement) : budget − réel dérivé de ses écritures, plancher à 0. Un dépassement ne donne jamais de reste négatif et ne diminue pas le reste des autres lignes.
- RG6. (Précision validée : une ligne `var` à compte dédié compte comme une `var` du compte principal, budget − réel.) Lignes comptées : `fix`, `cre`, `epa`, `inv`, allocations d'enveloppe, et lignes `var` du compte principal (budget − réel, comme aujourd'hui). Les lignes en mode `informatif` sont exclues. Les revenus ne comptent pas dans le reste.
- RG7. (Amendé le 2026-11-05.) Les restes sont regroupés par mode d'exécution du compte payeur : « À prélever », « À virer », « 💵 À retirer en espèces », « Autres à sortir » (sans mode ; allocations d'enveloppe et lignes `var` sans mode). La rubrique **« À retirer en espèces »** du compte principal regroupe en plus : les lignes `var` gérées en espèces (quel que soit leur mode d'exécution, avec leur reste budget − réel, sans doublon dans les autres rubriques) et, pour chaque enveloppe ayant une part espèces, un élément « Alloc. espèces <enveloppe> » du montant de cette part. Les retraits du mois (`cashWithdrawalSummary.withdrawn`) sont **déduits** du total de la rubrique, jamais en dessous de 0, avec une ligne grisée « Déjà retiré −X € ». Le 💵 est sur le titre de la rubrique (affichage seulement).
- RG8. (Amendé le 2026-11-05.) Par compte : Marge après les mouvements à venir = solde réel de référence − total des restes. Montant en rouge s'il est négatif. Solde de référence : solde réel à la date du jour pour le mois en cours ; pour un mois passé non clos, solde réel en fin de période ; pour un mois futur, solde réel de début de période. Sans solde de référence, les marges ne sont pas calculées.
- RG9. (Amendé le 2026-11-05.) « Revenus attendus » reste affiché en ligne séparée (budget − réel dérivé des entrées, plancher à 0, lignes `rev` non `informatif`). Quand il y en a, une ligne « Marge après les revenus attendus » = marge + revenus attendus s'affiche juste après, avec la même couleur et le même signe − (RG19). Sans revenu attendu, cette ligne est absente (elle serait identique).
- RG10. Comptes affichés : tous les comptes qui ont au moins une ligne à payer dans le mois, hors comptes d'enveloppe et hors Espèces (`acc-cash`, ADR 0029). Un compte sans ligne n'est pas affiché. Compte hors budget : traité comme les autres s'il a des lignes à payer.
- RG11. Retard : une ligne est « en retard » quand son jour prévu (`dueDay`, ramené au dernier jour d'un mois court) est passé, que son reste est > 0, qu'elle n'est pas `informatif` et que le mois n'est pas clos. Le badge et le compteur « n lignes en retard » restent, sur la ligne et dans l'encart.
- RG12. Le jour prévu et le mode d'exécution restent saisissables comme aujourd'hui.
- RG13. Le tableau de bord aligne ses tâches de lignes sur RG5 et RG11 : une ligne est « faite » quand son reste est 0, « en retard » selon RG11. Les allocations d'enveloppe suivent la même règle.
- RG14. Écran Dépenses : le filtre « pointées », la surbrillance des opérations rattachées à un pointage et le signal « Semblable à un pointage / Rattacher » sont supprimés.
- RG15. Écran Comptes et page Relevé : seul le solde réel est affiché ; plus de « Solde estimé (budget) », d'écart réel moins estimé, de vue « Estimé » ni de liste grise.
- RG16. Les données de pointage déjà enregistrées se chargent sans erreur, ne sont ni lues par un calcul ni affichées, et sont conservées telles quelles en base (aucune migration). Aucun bandeau.
- RG17. Écraser les lignes d'un mois (modèle, mois précédent) n'efface plus de pointage et la confirmation ne mentionne plus « Les pointages des lignes remplacées seront effacés ».
- RG18. Mois clos ou année clôturée : l'encart reste consultable, en lecture seule, sans action (il n'en a aucune). Pour un mois clos, aucune ligne n'est « en retard ».
- RG20. (Ajouté le 2026-11-05.) Chaque compte affiche son « Solde de départ » avec la date de début de période (ex. « Solde de départ (30/10) ») : le solde réel du compte au premier jour de la période, point de départ du solde réel et de la marge. Absent avant l'ouverture du compte. Montant au format monétaire, signe − s'il est négatif (RG19).
- RG21. (Ajouté le 2026-11-05.) Pour expliquer la marge, le résumé enchaîne : « Solde de départ (JJ/MM) », « Mouvements déjà passés » (= solde réel de référence − solde de départ, signe + ou − explicite), « = Solde réel » (le même montant que l'en-tête), puis les restes à sortir et les marges. Ces deux lignes ne s'affichent que si le solde de départ et le solde de référence existent.
- RG22. (Ajouté le 2026-11-05.) La ligne « Mouvements déjà passés » est cliquable : une bulle de détail (comme les « Détails » du Budget, fermée par la croix, un clic extérieur ou Échap) liste, une ligne par mouvement, « JJ/MM  libellé : +/−montant », triés par date, puis le total. Ce sont les mouvements réels comptés dans le solde de référence : jusqu'à aujourd'hui pour le mois en cours, tous pour un mois passé, aucun pour un mois futur. Leur somme est égale à la valeur de la ligne.
- RG19. Accessibilité : chaque montant a son libellé texte ; la couleur rouge du reste négatif est doublée du signe « − ».

## Parcours utilisateur

Nominal : j'ouvre l'écran Budget du mois en cours. L'encart me donne, par compte, le solde réel du jour, ce qui reste à prélever, virer et retirer, et ce qu'il me resterait. J'importe mes opérations : le prélèvement EDF est rattaché à sa ligne, son reste tombe à 0 et le total baisse sans aucune case à cocher.

Cas limites : prélèvement dont le montant réel diffère du budget (réel inférieur : le reste est la différence ; réel supérieur : reste 0) ; ligne sans écriture ; ligne `informatif` ; mois futur ; mois clos ; compte hors budget ; ligne `var` du compte principal ; allocation d'enveloppe ; versement d'épargne ; plusieurs comptes ; solde insuffisant ; données contenant d'anciens pointages.

## Design (proposé, validé par le développeur ; aucune maquette fournie)

Réutiliser `organic.css` (`panel block`, `pt-line`, `pt-row`), même emplacement que `PointageCard` (4e colonne de l'écran Budget, sous les enveloppes). Le détail d'un compte se déplie au clic.

```
┌ À venir ce mois-ci ─────────────────── 2 lignes en retard ┐
│ ● Compte principal            Solde réel          1 240,00 │
│   Solde de départ (30/10)                         1 500,00 │
│   Mouvements déjà passés                           -260,00 │
│   = Solde réel                                    1 240,00 │
│   À prélever (3 lignes)                            -310,00 │
│   À virer (1 ligne)                                -150,00 │
│   À retirer en espèces                              -80,00 │
│   Marge après les mouvements à venir                750,00 │  (rouge si négatif)
│   Revenus attendus                                  +50,00 │
│   Marge après les revenus attendus                 800,00 │  (rouge si négatif ; absente sans revenu attendu)
│   ▸ détail : EDF le 5 (62,00) · Assurance le 12 (48,00) …  │
│ ● Livret A  …                                              │
└────────────────────────────────────────────────────────────┘
```

États : rien à venir (« Rien à sortir »), solde insuffisant (marge en rouge), mois futur, mois clos (lecture seule), compte sans ligne (non affiché).

## Impact technique (quoi)

- Domaine : fonction pure du reste par ligne et par compte, avec regroupement par mode et marge ; retrait de la lecture des pointages dans `estimatedMovements`, `pendingLines`, `isLate`, `dashboard.ts`, `transfers.ts` ; suppression du solde estimé, de l'écart, de `ignoredMovements` et de la détection « Semblable à un pointage ». Les types de pointage restent dans le modèle (données inertes).
- Application : retrait des actions de pointage et de dépointage de ligne et d'allocation ; plus d'effacement de pointage à l'écrasement des lignes.
- Infrastructure / Supabase : aucune migration ; la sauvegarde continue de lire et écrire les anciens pointages tels quels pour ne pas les perdre.
- Présentation : suppression de `LineCheck` (case) et `EnvelopeCheck`, remplacement de `PointageCard` par l'encart, écrans Budget, Dépenses, Comptes, Relevé, tableau de bord, graine.
- Documentation : amendements des specs 0009 et 0019 ; nouvel ADR amendant les ADR 0005 et 0017 (plus de solde estimé).
- Tests : `checkoff.test.ts` et les tests qui s'appuient sur le pointage sont supprimés ou réécrits ; nouveaux tests du reste, du regroupement, de la marge et du retard.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given l'écran Budget, Then aucune ligne ni allocation d'enveloppe n'a de case de pointage. (Man)
- CA2. Given les mêmes données qu'avant la spec, Then solde réel, relevé, écart de relevé et clôture ont les mêmes valeurs. (Auto)
- CA3. Given une ligne `fix` de 62 € sans écriture, Then son reste est 62 € ; When une écriture de 62 € lui est rattachée, Then son reste est 0. (Auto)
- CA4. (Amendé le 2026-11-05.) Given une ligne `fix` de 100 € avec 40 € d'écritures, Then son reste est 0 (surplus budgété = bonus) ; avec 130 € d'écritures, son reste est 0 et le total des autres lignes ne change pas ; sans écriture, 100 €. Given une ligne `var` à compte dédié avec une dépense, Then son reste est 0. Given une ligne `var` du compte principal de 100 € avec 40 € de dépenses, un revenu de 100 € reçu à 40 € ou une ligne d'épargne de 100 € avec 40 € virés, Then leur reste est 60 €. (Auto)
- CA5. Given des lignes en modes prélèvement, virement et retrait, Then l'encart les range sous « À prélever », « À virer » et « À retirer » avec le bon total ; une ligne `informatif` n'est comptée nulle part. (Auto)
- CA6. Given un compte à solde réel 1 000 € et 1 200 € de restes, Then la marge vaut −200 € et s'affiche en rouge avec le signe −. (Auto sur le calcul, Man sur la couleur)
- CA7. (Amendé le 2026-11-05.) Given un revenu attendu de 50 € sans entrée, un solde de référence de 1 000 € et 100 € de restes, Then « Revenus attendus » affiche 50 €, la marge vaut 900 € et « Marge après les revenus attendus » vaut 950 €. (Auto)
- CA8. Given une ligne `var` du compte principal de 200 € avec 150 € de dépenses, Then son reste est 50 €. (Auto)
- CA9. Given une allocation d'enveloppe de 60 € sans transfert, Then son reste est 60 € ; avec un transfert de 60 €, 0. (Auto)
- CA10. Given une ligne dont le jour prévu est passé avec un reste > 0, Then elle est « en retard » ; avec un reste de 0, ou sur un mois clos, elle ne l'est pas. (Auto)
- CA11. Given le tableau de bord, Then une ligne dont le reste est 0 est « faite » et une ligne en retard (RG11) est signalée. (Auto)
- CA12. Given l'écran Dépenses, Then le filtre « pointées », la surbrillance et le signal « Rattacher » n'existent plus. (Man)
- CA13. Given les écrans Comptes et Relevé et le détail d'un compte, Then aucun solde estimé, écart réel − estimé, vue « Estimé » ni liste grise n'apparaît. (Man)
- CA14. Given un compte d'enveloppe, Espèces, ou un compte sans ligne à payer, Then il n'apparaît pas dans l'encart. (Auto sur la liste, Man sur l'écran)
- CA15. Given des données contenant d'anciens pointages, When je charge, modifie et sauvegarde le budget, Then aucune erreur, aucun chiffre ne dépend des pointages et ils sont toujours présents en base. (Auto)
- CA16. Given un mois clos, Then l'encart s'affiche en lecture seule et aucune ligne n'est en retard. (Auto, Man)
- CA17. Given l'écrasement des lignes d'un mois, Then la confirmation ne parle plus de pointages. (Man)
- CA19. (Ajouté le 2026-11-05.) Given un compte ouvert, Then l'encart affiche « Solde de départ (JJ/MM) » égal au solde réel au premier jour de la période ; avant l'ouverture du compte, la ligne est absente. (Auto sur le calcul)
- CA20. (Ajouté le 2026-11-05.) Given un compte ouvert, Then solde de départ + « Mouvements déjà passés » = solde réel de référence ; les deux lignes sont absentes sans solde de départ ou sans référence. (Auto sur le calcul)
- CA21. (Ajouté le 2026-11-05.) Given un compte avec des mouvements réels dans la période, When je clique sur « Mouvements déjà passés », Then une bulle liste ces mouvements par date et leur somme égale la ligne. (Auto sur le calcul, Man sur la bulle)
- CA18. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Historique des amendements
- 2026-11-05 : RG5 et CA4 amendés (décision du développeur) : le budget non dépensé d'une ligne fixe, d'un crédit ou d'une variable à compte dédié ayant au moins une écriture n'est plus un reste à sortir. Les variables du compte principal, les revenus et l'épargne/investissement gardent budget − réel. Effets : retard (RG11) et « ligne faite » (RG13) pour les lignes concernées. Les allocations d'enveloppe ne changent pas. Statut inchangé.
- 2026-11-05 : RG8, RG9, CA7 amendés (décision du développeur, remplace l'amendement « marge incluant les revenus ») : on garde les deux marges. « Marge après les mouvements à venir » = référence − restes ; une ligne « Marge après les revenus attendus » = marge + revenus attendus s'ajoute après « Revenus attendus », seulement s'il y a des revenus attendus. Statut inchangé.
- 2026-11-05 : RG7 amendé (décision du développeur) : rubrique « À retirer en espèces » = lignes `var` en espèces + parts espèces des allocations, retraits du mois déduits (ligne « Déjà retiré »), 💵 sur le titre de la rubrique. RG6 : les lignes `var` en espèces vont dans cette rubrique. Statut inchangé.
- 2026-11-05 : RG20 et CA19 ajoutés (décision du développeur) : ligne « Solde de départ » avec la date de début de période, pour expliquer le calcul de la marge. Statut inchangé.
- 2026-11-05 : RG21 et CA20 ajoutés (décision du développeur) : lignes « Mouvements déjà passés » et « = Solde réel » entre le solde de départ et les restes. Statut inchangé.
- 2026-11-05 : RG22 et CA21 ajoutés (décision du développeur) : détail en bulle des mouvements déjà passés. Statut inchangé.

## Questions ouvertes

Aucune.
