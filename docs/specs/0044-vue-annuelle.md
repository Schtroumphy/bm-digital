# 0044 — Vue annuelle

- Statut : validée
- Date : 2026-11-04
- Branche prévue : feat/vue_annuelle

## Contexte et objectif
Le développeur veut voir son année d'un coup d'œil : pour chaque mois, ce qui était budgété ou ce qui s'est réellement passé, par bloc et par ligne, avec le reste à placer et le taux d'épargne. Aujourd'hui, seul le « Prévisionnel annuel » (dépenses prévues par mois) existe ; il ne montre ni le budget, ni le réel, ni l'épargne.

Source : design `design/project/Budget Perso (standalone).html`, écran « Vue annuelle » (état `ya`).

## Périmètre
Inclus :
- Nouvel onglet « Vue annuelle » dans le menu, à côté de « Prévisionnel » (qui reste inchangé).
- Sélecteur d'année, bascule Budgété / Réel, bascule Total / Moyenne.
- Tableau 12 mois + total : blocs dépliables (revenus, crédits et dettes, dépenses fixes, dépenses variables, épargnes, enveloppes, investissements) et récapitulatif (reste à placer, taux d'épargne, épargne brute, épargne réelle, total investi, revenus totaux, dépenses totales).
- Vue en lecture seule.

Exclus :
- Comparaison de 1 à 3 mois (sélection par en-tête, barre « Comparer », panneau côte à côte) : spec suivante. Dans cette spec, un clic sur un en-tête de mois ne fait rien.
- Toute édition de montant, toute donnée stockée, tout changement du schéma Supabase.
- Modification de l'onglet « Prévisionnel ».

## Écart avec le design (décision du développeur)
Le design a un seul bloc « Dépenses » (fixes et variables regroupées en sections). Ici, deux blocs séparés « Dépenses fixes » et « Dépenses variables », comme dans l'app. « Crédits et dettes » reste un bloc séparé.

## Règles de gestion
- RG1. Menu : entrée « Vue annuelle » (titre d'écran « Vue annuelle »), placée juste après « Prévisionnel ».
- RG2. Sélecteur d'année : mêmes flèches ‹ › et même plage que « Prévisionnel » (de l'année du premier mois géré à l'année du dernier mois du calendrier). À l'ouverture, l'année en cours (ou l'année déjà choisie dans l'app pour ces écrans).
- RG3. Bascule « Budgété / Réel », par défaut « Réel » (modifié à la demande du développeur). Budgété = budget ajusté du mois (spec 0030). Réel = valeurs de `monthSummary` et réels des lignes.
- RG4. Colonnes : janvier à décembre, puis « Total ». Un clic sur l'en-tête « Total » bascule en « Moyenne » (et inversement) ; le libellé de l'en-tête change.
- RG5. Mois « renseigné » ou non, selon le mode (remplace la version initiale) :
  - Budgété : un mois initialisé est renseigné, même s'il est futur : son budget ajusté s'affiche. Un mois non initialisé affiche « — ».
  - Réel : un mois futur affiche « — ». Un mois qui précède le premier mois du budget affiche « — » et n'est jamais compté. Les autres mois (passés ou en cours, y compris non initialisés) affichent leurs valeurs réelles.
  - Un mois « — » est exclu des totaux, moyennes et courbes.
  - Légendes d'en-tête : « en cours » (mois en cours), « non init. » (mois non initialisé), « avant le début » (mois précédant le premier mois du budget).
- RG6. Total = somme des mois renseignés (RG5). Moyenne = total divisé par le nombre de mois renseignés, jamais par 12. Aucun mois renseigné : « — ».
- RG7. Une valeur nulle d'une ligne de bloc s'affiche « — ». Cette règle ne vaut pas pour le récapitulatif : « Reste à placer », taux et totaux nuls s'affichent « 0 € » / « 0 % » (RG12).
- RG8. Blocs, dans l'ordre : Revenus, Crédits et dettes, Dépenses fixes, Dépenses variables, Épargnes, Enveloppes, Investissements. Chaque bloc a une ligne de total par mois. Plié par défaut ; un clic sur la ligne du bloc le déplie (chevron). Déplié : les sections du bloc (titre) puis les lignes de chaque section, avec leur valeur par mois.
- RG9. Lignes d'un bloc de budget : celles des mois de l'année pour ce bloc, regroupées par nom de section et de ligne ; une ligne absente d'un mois (ou présente avec une valeur nulle, RG7) affiche « — » ce mois-là. Le total d'une ligne est la somme de ses mois où elle existe ; sa moyenne est calculée sur les seuls mois où elle existe et où le mois est renseigné (RG5), jamais sur les autres mois. La moyenne d'un bloc reste calculée sur les mois renseignés ; elle peut donc différer de la somme des moyennes de ses lignes. Seules les lignes comptées dans le budget le sont (hors budget et informatives exclues, comme `budgetLines`).
- RG10. Bloc Enveloppes : une ligne par enveloppe. Budgété = allocation mensuelle de l'enveloppe. Réel = dépenses nettes de l'enveloppe (dépenses moins entrées d'argent, comme `envelopeSpent`). Total du bloc = somme des enveloppes.
- RG11. Totaux de blocs en Réel : réel des lignes du bloc (crédits, fixes, variables, épargnes, investissements, revenus) ; les dépenses réelles incluent les dépenses financées par l'épargne, comme `expensesReal`.
- RG12. Récapitulatif (même règle pour chaque mois, voir RG3/RG5) :
  - Reste à placer : `remaining` (Budgété) ; en Réel, la valeur réelle disponible de `monthSummary` (`availableReal`). Une valeur égale à 0 s'affiche « 0 € » et est comptée dans la moyenne et le total ; « — » seulement si le mois n'est pas renseigné (RG5) ou si la valeur n'est pas calculable (`null`, mois non initialisé), auquel cas elle est exclue.
  - Taux d'épargne : en Budgété, taux d'épargne brut ; en Réel, taux d'épargne réel (`savingsRate`).
  - Épargne brute : `grossSavings` ; Épargne réelle : `realSavings` (en Budgété, l'épargne réelle est affichée « — »).
  - Total investi : `investTotal`.
  - Dépenses totales : `expenses` (Budgété) ou `expensesReal` (Réel). Pas de ligne « Revenus totaux » : doublon du total du bloc Revenus (retirée à la demande du développeur).
  - Colonne « Total » du récapitulatif : somme des mois pour les montants de flux ; pour « Reste à placer » et « Taux d'épargne », la colonne affiche la moyenne des mois renseignés (taux = moyenne des taux) ; « Total investi » affiche le dernier mois renseigné. En mode « Moyenne », tout est moyenné sur les mois renseignés.
- RG13. Taux d'épargne et objectif : si l'année affichée a au moins un objectif de type « taux d'épargne » (spec 0032), le premier (ordre de création) donne l'objectif : libellé « Taux d'épargne · objectif X % », trait d'objectif sur la barre de chaque mois, barre de couleur d'accent quand le mois atteint l'objectif. Sans objectif : ni trait, ni mention, la barre reste neutre.
- RG14. Barre du taux d'épargne : largeur = taux borné entre 0 et 100 %. Mini-courbe dans la colonne « Total » si au moins 2 mois ont un taux.
- RG15. Lecture seule : aucune édition, aucune écriture ; même comportement pour une année clôturée ou passée.
- RG16. Format : montants en euros comme le reste de l'app, taux avec une décimale et virgule (« 12,5 % »).
- RG17. Accessibilité : chaque bloc dépliable est un bouton avec `aria-expanded` ; la bascule Budgété / Réel est un groupe nommé avec `aria-pressed`.
- RG18. Desktop 1440 px : le tableau (232 px de libellé, 12 colonnes de 82 px, total 108 px) défile horizontalement si besoin, la colonne libellé reste visible.

### Éléments du design omis dans la première version (amendement)
Le design contient deux écrans annuels voisins : « Vue annuelle » (`ya`, le tableau détaillé déjà spécifié ci-dessus) et « Annuel · Répartition annuelle » (`year`, groupe « Analyse »). Les éléments suivants de `year` manquaient à la spec et à l'implémentation. Ils sont ajoutés à ce même onglet « Vue annuelle » (voir question Q1), au-dessus du tableau, et suivent la même bascule Budgété / Réel et le même sélecteur d'année.

- RG19. Quatre cartes chiffrées (KPI) en tête de l'onglet, avec les valeurs de l'année (mois renseignés, règles RG5/RG6) :
  - Revenus : total de l'année, sous-texte « soit X par mois » (moyenne des mois renseignés).
  - Dépenses : total (crédits + dépenses fixes + dépenses variables + dépenses prévues), sous-texte « dont X prévues ».
  - Épargne et placements : total, sous-texte « X % des revenus ».
  - Reste à vivre : revenus − dépenses − épargne et placements, sous-texte « après épargne ».
- RG20. « Dépenses prévues » : somme par mois des dépenses prévues de l'onglet « Prévisionnel » (`data.planned`) pour l'année. Elles sont affichées comme une ligne de bloc supplémentaire dans le tableau (entre « Dépenses variables » et « Épargne et placements »), dépliable en une ligne par dépense prévue. Elles sont les mêmes en Budgété et en Réel (c'est une prévision).
- RG21. Graphique en courbes coloré, à gauche sous les cartes : 12 mois en abscisse, montants en ordonnée (graduations à pas rond, axe borné par la plus grande valeur), une courbe par série avec sa couleur et une légende (pastille + nom) : Revenus, Crédits, Charges fixes (dépenses fixes), Dépenses variables, Dépenses prévues, Épargne et placements. Les points d'un mois non renseigné (RG5) ne sont pas tracés. Un survol d'un point affiche mois, série et montant. Les couleurs sont celles des blocs de l'app (via `tone`), identiques à celles du camembert.
- RG22. Panneau de droite « Répartition annuelle » : camembert (anneau) des revenus de l'année, avec le sous-titre « Emploi des revenus budgétés sur l'année » (ou « réels » en mode Réel), le total des revenus au centre, et une légende en liste : pastille de couleur, nom, montant, part en % des revenus. Parts, dans cet ordre : Crédits, Charges fixes, Dépenses variables, Dépenses prévues, Épargne et placements, Reste à vivre (RG19). Une part négative ou nulle n'est pas dessinée mais reste listée à 0. Survol d'une part ou d'une ligne de légende : la part ressort, les autres s'atténuent, montant et pourcentage s'affichent.
- RG23. Camembert et courbes se mettent à jour avec la bascule Budgété / Réel et le changement d'année ; la bascule « Total / Moyenne » ne change que le tableau (le camembert reste sur les totaux de l'année).
- RG24. Colonne du mois en cours mise en évidence (couleur d'accent sur l'en-tête, comme dans le design) dans le tableau.
- RG25. Sans aucun mois renseigné : les cartes affichent « — », le graphique et le camembert un état vide (« Aucune donnée pour <année> »), sans erreur.
- RG26. Accessibilité : graphique et camembert ont un libellé texte (`aria-label`) et chaque part/série est aussi donnée en texte dans la légende ; l'information n'est jamais portée par la couleur seule.
- RG27. Mise en page 1440 px (proposée) : cartes sur une ligne ; en dessous, graphique (≈ 2/3) et panneau de répartition (≈ 1/3) côte à côte ; en dessous, le tableau de RG18.

## Parcours utilisateur
Nominal :
1. Ouvrir « Vue annuelle » : année en cours, mode Réel, blocs pliés, récapitulatif visible.
2. Passer en « Réel » : les mois futurs passent à « — », les autres affichent le réel.
3. Déplier « Dépenses variables » : sections et lignes avec leurs montants mensuels.
4. Cliquer « Total » : bascule en « Moyenne ».
5. Changer d'année avec les flèches.

Cas limites :
- Année sans mois géré ou année future : tout est « — », pas d'erreur.
- Mois non initialisé au milieu de l'année : « — » en Budgété, légende « non init. », exclu des totaux et moyennes.
- Aucun objectif de taux d'épargne : pas de trait ni de mention.
- Revenus nuls : taux d'épargne à 0 %, comme `monthSummary`.
- Année clôturée : affichage identique.

## Design
Source : design/project/Budget Perso (standalone).html, état `ya`. Écart assumé : deux blocs de dépenses (voir plus haut). Structure : en-tête (sélecteur d'année, bascule Budgété/Réel), tableau de grille (libellé + 12 mois + total), lignes de bloc dépliables, puis lignes de synthèse sur fond teinté, avec barre de taux. Réutiliser `picker` et les tokens de `src/presentation/ds/organic.css` ; styles de la grille ajoutés à `app.css`.

## Impact technique (complément)
- Domaine : en plus de la vue annuelle, séries mensuelles (revenus, crédits, fixes, variables, prévues, épargne et placements), reste à vivre, et parts du camembert (montant, % des revenus), calculées pour Budgété et Réel.
- Présentation, réutilisable : `SimulationPie.tsx` (camembert en SVG fait main avec survol et légende liée, mais lié aux types de la simulation : à généraliser ou à dupliquer en un composant à parts génériques), `Spark.tsx` (mini-courbe), `tone` pour les couleurs, classes `panel`, `kpi-box`, `kpi-label`, `legend`, `dot` (comme `Planning.tsx`). Aucun composant de graphique en courbes multi-séries n'existe : à créer en SVG fait main, sans nouvelle dépendance.
- Données : `data.planned` (spec du Prévisionnel) lu pour « Dépenses prévues », sans modification.

## Impact technique (version initiale)
- Domaine : nouveau calcul de la vue annuelle (par mois : totaux de blocs, lignes par section, enveloppes, récapitulatif), s'appuyant sur `monthSummary`, `blockTotals`, `budgetLines` et le budget ajusté. Pas de nouveau type stocké ; objectif lu via les objectifs de l'année (spec 0032).
- Application : aucune action d'écriture.
- Infrastructure / Supabase : aucun changement.
- Présentation : nouvel écran `YearView` (ou équivalent), entrée de menu et titre dans `App.tsx`, réutilisation du sélecteur d'année.

## Critères d'acceptation
(A = test automatisé du domaine ; M = vérification manuelle par le reviewer)
- CA1. Given l'app, When j'ouvre le menu, Then « Vue annuelle » apparaît après « Prévisionnel » et « Prévisionnel » est inchangé. (M)
- CA2. Given l'onglet ouvert, Then année en cours, mode Réel, blocs pliés, 12 mois + Total. (M)
- CA3. Given un mois initialisé, When mode Budgété, Then les totaux de blocs égalent les budgets ajustés du mois (spec 0030). (A)
- CA4. Given un mois passé avec réel, When mode Réel, Then revenus, dépenses, épargne réelle, taux d'épargne et total investi égalent ceux de `monthSummary`. (A)
- CA5. Given un mois futur ou non initialisé, When mode Budgété, Then toutes ses cellules sont « — ». (A)
- CA6. Given un mois futur, When mode Réel, Then ses cellules sont « — ». (A)
- CA7. Given 3 mois renseignés sur 12, When Total puis Moyenne, Then total = somme des 3 mois et moyenne = total / 3. (A)
- CA8. Given aucun mois renseigné, Then total et moyenne valent « — ». (A)
- CA9. Given un bloc plié, When je clique dessus, Then ses sections et lignes s'affichent avec leurs valeurs par mois ; un nouveau clic les masque. (M)
- CA10. Given les dépenses fixes et variables, Then elles apparaissent en deux blocs distincts, « Crédits et dettes » restant séparé. (M)
- CA11. Given des enveloppes, Then le bloc Enveloppes a une ligne par enveloppe, budgété = allocation, réel = `envelopeSpent`. (A)
- CA12. Given une valeur nulle sur une ligne, Then « — » est affiché. (A)
- CA13. Given un objectif « taux d'épargne » 60 % pour l'année, Then le libellé mentionne « objectif 60 % » et le trait est tracé ; Given plusieurs, Then le premier créé est utilisé ; Given aucun, Then ni trait ni mention. (A pour le choix de l'objectif, M pour l'affichage)
- CA14. Given une année clôturée, Then la vue s'affiche et ne permet aucune modification. (M)
- CA15. Given un clic sur un en-tête de mois, Then rien ne se passe (comparaison hors périmètre). (M)
- CA16. Given les flèches d'année, Then la plage est la même que « Prévisionnel ». (M)

- CA17. Given une année avec des mois renseignés, Then quatre cartes (Revenus, Dépenses, Épargne et placements, Reste à vivre) affichent les totaux de l'année et leurs sous-textes (RG19). (A pour les valeurs, M pour l'affichage)
- CA18. Given des dépenses prévues dans « Prévisionnel », Then la ligne « Dépenses prévues » du tableau, la carte Dépenses et le camembert les comptent. (A)
- CA19. Given l'onglet ouvert, Then un graphique en courbes colorées avec légende affiche les 6 séries sur 12 mois, sans point pour un mois non renseigné. (M)
- CA20. Given le panneau de droite, Then le camembert a les 6 parts, le total des revenus au centre, et la somme des parts vaut les revenus de l'année (identité Revenus = dépenses + épargne et placements + reste à vivre, tant que le reste est ≥ 0). (A pour l'identité, M pour l'affichage)
- CA21. Given le survol d'une part ou d'une ligne de légende, Then la part ressort, les autres s'atténuent, montant et % s'affichent. (M)
- CA22. Given la bascule Budgété / Réel ou un autre exercice, Then cartes, courbes, camembert et tableau se mettent à jour ; la bascule Total / Moyenne ne change que le tableau. (M)
- CA23. Given aucun mois renseigné, Then cartes à « — » et état vide pour graphique et camembert, sans erreur. (A pour le calcul, M pour l'affichage)
- CA24. Given le mois en cours dans l'année affichée, Then son en-tête est mis en évidence. (M)

- CA25. Given un mois qui précède le premier mois du budget, When mode Réel, Then toutes ses cellules sont « — », il est exclu des totaux, moyennes et courbes, et son en-tête porte « avant le début ». (A)
- CA26. Given un mois futur initialisé, When mode Budgété, Then son budget ajusté s'affiche et il compte dans totaux et moyennes ; When mode Réel, Then ses cellules sont « — ». Given un mois non initialisé, When mode Budgété, Then « — ». (A) (remplace CA5 pour les mois futurs initialisés)
- CA27. Given une ligne présente en mars et en avril seulement, When Moyenne, Then sa moyenne = total / 2, ses autres mois affichent « — », et la moyenne de son bloc reste calculée sur les mois renseignés. (A)
- CA28. Given un mois renseigné dont le reste à placer réel vaut 0, Then la cellule affiche « 0 € » et ce mois compte dans la moyenne et le total du récapitulatif ; Given un reste à placer non calculable, Then « — » et exclu. (A)

Impact sur les tests : les tests du domaine de la vue annuelle écrits pour les anciennes règles (mois futur initialisé en Budgété = « — », ligne absente = 0 compté dans la moyenne, reste à placer à 0 = « — » compté dans la moyenne, mois avant le début compté comme 0) sont à mettre à jour selon CA25 à CA28 et RG5, RG7, RG9, RG12.

## Questions ouvertes
Aucune : Q1 à Q8 tranchées par le développeur (Q1 à Q4 : valeurs retenues dans RG19 à RG27 ; Q5 à Q8 : RG5, RG7, RG9, RG12). Historique des questions ci-dessous.

Spec suivante prévue : comparaison de 1 à 3 mois (sélection par en-tête, barre « Comparer », panneau côte à côte).

A. Éléments du design (valeurs par défaut retenues dans les RG19 à RG27, à confirmer ou corriger)
- Q1. Le design a deux écrans (« Annuel » avec cartes, courbes et camembert ; « Vue annuelle » avec le grand tableau). Un seul onglet « Vue annuelle » qui réunit les deux (retenu, RG19 à RG27), ou deux onglets distincts (« Annuel » et « Vue annuelle »), ou « Annuel » seul avec son propre tableau ?
- Q2. « Dépenses prévues » (lues dans « Prévisionnel ») entrent dans les dépenses, les courbes et le camembert comme dans le design (retenu), ou sont exclues ?
- Q3. « Épargne et placements » = épargne brute (épargnes + investissements + enveloppes) en Budgété et épargne réelle en Réel (retenu) ? « Reste à vivre » = revenus − dépenses − épargne et placements (retenu), à ne pas confondre avec « Reste à placer » ?
- Q4. Mise en page de RG27 (cartes, puis courbes à gauche et camembert à droite, puis tableau) : validée ?

B. Choix d'interprétation à modifier (alternatives ; seule la recommandation sera appliquée si tu ne tranches pas)
- Q5. Mois avant le premier mois du budget, en Réel (aujourd'hui « — »).
  - a) « — » et exclu des totaux et moyennes, avec la légende « avant le début » (recommandé : rien n'a été géré avant, et l'import d'historique a déjà été tenté puis abandonné).
  - b) Afficher les opérations déjà importées avant le premier mois, s'il y en a.
  - c) Afficher 0 compté dans les moyennes.
- Q6. Mois futur déjà initialisé, en Budgété (aujourd'hui « — », RG5).
  - a) Afficher son budget ajusté dès que le mois est initialisé, même futur ; « — » seulement pour un mois non initialisé (recommandé : c'est le but d'une vue annuelle budgétée, le budget y est déjà saisi ; en Réel, un mois futur reste « — » ; les totaux et moyennes comptent ces mois).
  - b) Garder « — » pour tout mois futur.
- Q7. Ligne absente d'un mois affiché (aujourd'hui 0, affiché « — », compté dans la moyenne).
  - a) « — » et exclu de la moyenne de cette ligne, qui se calcule sur les mois où elle existe (recommandé : une ligne créée en mars n'a pas été « à 0 » en janvier). La moyenne d'un bloc reste calculée sur les mois renseignés ; elle peut donc différer de la somme des moyennes de ses lignes.
  - b) 0 compté dans la moyenne (comportement actuel, la somme des moyennes de lignes égale celle du bloc).
  - c) « — » mais compté comme 0 dans la moyenne.
- Q8. « Reste à placer » en Réel égal à 0 (aujourd'hui « — » mais compté dans la moyenne).
  - a) Afficher « 0 € » et le compter dans la moyenne (recommandé : un zéro réel est une information, la règle « — » de RG7 ne vaut que pour les lignes).
  - b) Afficher « — » et l'exclure de la moyenne.
  - c) Garder le comportement actuel.
