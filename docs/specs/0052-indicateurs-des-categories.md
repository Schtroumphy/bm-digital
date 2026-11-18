# 0052 — Indicateurs des catégories (comparaison à la moyenne annuelle)

- Statut : validée
- Date : 2026-11-18
- Branche prévue : feat/indicateurs_categories

## Contexte et objectif
L'onglet « Répartition » montre où part l'argent d'un mois, mais ne dit pas si c'est normal. Le développeur veut une vue synthétique : pour chaque catégorie, le mois affiché est-il au-dessus ou en dessous de d'habitude ? Le « d'habitude » est la moyenne mensuelle de l'année civile du mois affiché, calculée sur les mois passés uniquement.

Révision (retour du test manuel) : le design du bandeau, du tableau et leur cohérence avec le reste de l'app sont à reprendre ; « Indicateurs » devient l'onglet affiché par défaut à l'arrivée sur l'écran Analyse.

## Périmètre
Inclus :
- Nouvel onglet « Indicateurs » dans l'écran Analyse (`Categories.tsx`), **ouvert par défaut**.
- Bandeau de synthèse du mois.
- Une ligne par catégorie : écart à la moyenne, moyenne mensuelle, tendance (sparkline).
- Calculs en fonctions pures du domaine, réutilisant `categoryBreakdown` sur chaque mois passé.
- Révision : refonte visuelle du bandeau et du tableau, nouvel onglet par défaut.

Exclus (écartés pour l'instant) : part du budget vs part moyenne, cumul annuel, pic/creux, nombre de catégories au-dessus de leur moyenne. Aucun changement de modèle de données ni de schéma Supabase. Aucune nouvelle dépendance.

## Règles de gestion
- RG1. Mois de référence : les mois de l'année civile du mois affiché, de janvier jusqu'au mois précédant le plus petit des deux : le mois affiché ou le mois en cours (la date du jour), bornes incluses. Le mois affiché, le mois en cours et les mois futurs n'en font jamais partie. Exemples (aujourd'hui en novembre 2026) : mars 2026 → janvier et février ; novembre 2026 → janvier à octobre ; décembre 2026 → janvier à octobre ; janvier 2026 → aucun mois (« pas de référence »).
- RG2. Moyenne mensuelle d'une catégorie = somme de ses dépenses sur les mois de référence ÷ nombre de mois de référence. Un mois de référence sans dépense dans la catégorie compte pour 0 (le diviseur est le nombre de mois de référence, pas le nombre de mois avec dépense).
- RG3. Montants mensuels issus de `categoryBreakdown(d, mois)` : mêmes règles que « Répartition » (types catégorisables, dans le budget, mois budgétaire de l'écriture, `envin` exclu, catégorie supprimée = « Sans catégorie »).
- RG4. S'il n'y a aucun mois de référence (ex. mois affiché en janvier, quelle que soit l'année, ou année entièrement future), aucune moyenne ni écart n'est calculé : l'écran affiche « pas de référence » à la place de la moyenne et de l'écart, partout où ils apparaîtraient (bandeau compris). La tendance et les montants du mois restent affichés.
- RG5. Écart d'une catégorie = montant du mois affiché − moyenne, en € ; en % = écart ÷ moyenne × 100. Si la moyenne vaut 0 et que le montant est > 0, le % n'est pas calculable : afficher « nouveau » à la place du %. Si les deux valent 0, écart 0 € et pas de %.
- RG6. Couleur de l'écart : vert si le montant est en dessous de la moyenne, rouge s'il est au-dessus, neutre si égal. Le signe est toujours affiché (+ / −), la couleur n'est jamais le seul signal.
- RG7. Lignes par catégorie : toute catégorie ayant une dépense dans le mois affiché OU une moyenne > 0 (une catégorie habituelle à 0 ce mois-ci apparaît avec un écart négatif). Catégories à 0 partout : non affichées. La ligne « Sans catégorie » suit les mêmes règles, en dernier, en gris.
- RG8. Tri : par écart en € décroissant (plus forte hausse en premier), puis ordre alphabétique. Sans référence (RG4) : par montant du mois décroissant.
- RG9. Tendance : sparkline des montants mensuels de la catégorie sur les 6 derniers mois se terminant au mois affiché (mois affiché inclus, mois à 0 inclus, y compris à cheval sur l'année précédente). Le point du mois affiché est mis en surbrillance. Les mois futurs au-delà de la date du jour n'ont pas de point.
- RG10. Bandeau de synthèse :
  a. Dépenses du mois vs moyenne : total du mois affiché, moyenne mensuelle du total (RG2 sur `total`), écart € et % (RG5, RG6).
  b. Catégorie qui dérape le plus : celle ayant la plus forte hausse en € (écart > 0). Aucune → « Aucune catégorie au-dessus de sa moyenne ».
  c. Catégorie la plus en baisse : celle ayant la plus forte baisse en € (écart < 0). Aucune → « Aucune catégorie en dessous de sa moyenne ».
  d. Sans catégorie : montant et nombre d'écritures du mois affiché (mêmes valeurs que `none` et `uncategorizedCount`).
  « Sans catégorie » ne participe pas à b et c. En cas d'égalité d'écart, ordre alphabétique.
- RG11. L'onglet suit le sélecteur de mois existant ; changer de mois recalcule tout. Il est en lecture seule.
- RG12. Un mois affiché sans aucune dépense et sans référence : message « Aucune dépense pour <mois> » (comme « Répartition »).
- RG13. Chaque ligne catégorie propose le même lien « Voir les dépenses » que « Répartition » (filtre sur la catégorie).
- RG14. Montants arrondis au centime (`round2`), pourcentages au format `percent` existant.
- RG15 (révision). Onglet par défaut : à chaque arrivée sur l'écran Analyse, l'onglet actif est « Indicateurs » (le dernier onglet n'est pas mémorisé, comme avant). Ordre des onglets : Indicateurs, Répartition, Gérer.
- RG16 (révision). Dans le bandeau, la catégorie de « Plus forte hausse » et celle de « Plus forte baisse » sont cliquables : le clic ouvre les opérations filtrées sur cette catégorie, comme le lien « Voir les dépenses » du tableau (RG13). Quand le bandeau affiche « — » et son message (aucune catégorie concernée) ou « pas de référence », il n'y a rien à cliquer. L'élément cliquable est un bouton accessible au clavier (libellé « Voir les dépenses : <catégorie> »).
- RG17 (révision). Pas de mini-barre « mois vs moyenne » dans le tableau : la pastille d'écart et la sparkline suffisent.

## Parcours utilisateur
- Nominal : l'utilisateur ouvre Analyse, arrive directement sur « Indicateurs » ; novembre 2026 est affiché ; la moyenne est celle de janvier à octobre. Il voit le bandeau, puis les catégories triées de la plus en hausse à la plus en baisse. Un clic sur « Répartition » ouvre la répartition.
- Mois passé : mars 2026 affiché → moyenne sur janvier et février seulement.
- Mois futur : décembre 2026 affiché → moyenne janvier à octobre ; montant du mois à 0.
- Janvier de l'année en cours : « pas de référence » partout, tendance sur les 6 derniers mois visible.
- Catégorie apparue ce mois-ci : moyenne 0, écart « nouveau ».
- Mois sans dépense : message vide.
- Clavier : flèches gauche/droite entre les 3 onglets.

## Design
Design proposé, à valider (révision). Sources de cohérence relues : onglet Répartition (`Categories.tsx`, classes `cat-*`), bandeau KPI du tableau de bord (`Dashboard.tsx` : `dash-kpis`, `dash-kpi`, `dash-hero`, `dash-val`, `dash-sub`, `kpi-label`), pastilles `state-chip`, couleurs `GOOD`/`BAD`/`tone(hue)`, variables `--muted`, `--hairline`, `--violet-ink`.

Constats sur le design actuel : (1) le bandeau est fait de 4 cartes encadrées identiques, alors que le reste de l'app (Budget, Tableau de bord) utilise un bandeau d'indicateurs séparés par un filet, avec un chiffre principal mis en avant ; (2) rien ne hiérarchise les 4 infos (le total du mois ne ressort pas) ; (3) le tableau a une largeur fixe de 880 px avec défilement horizontal, des écarts en texte nu, sans survol ni en-têtes alignés, et le style de la ligne diffère de celui de Répartition (pas de survol, pas de barre).

### Hiérarchie
1. Titre de l'écran + référence (pastille discrète).
2. Bandeau : un chiffre principal (dépenses du mois, grand, violet comme « Reste à placer ») puis 3 indicateurs secondaires de même poids.
3. Tableau par catégorie, trié par écart, lisible d'un coup d'œil : la pastille d'écart est l'élément le plus visible de chaque ligne.

### Wireframe (1440 px, panneau pleine largeur comme Répartition)
```
[ Indicateurs ] [ Répartition ] [ Gérer ]                 (onglet actif en noir, pilule)

+--------------------------------------------------------------------------------------+
| Indicateurs du mois (cat-title)                  (pilule violette) Moyenne janv.–oct. 2026 |
|                                                                                      |
|  Dépenses du mois      | Plus forte hausse    | Plus forte baisse   | Sans catégorie    |
|  1 840,00 €  (28 px,   | 🛒 Alimentation      | 🎮 Loisirs          | 120,00 €          |
|  violet-ink)           | +85,00 € +21,3 %     | −60,00 € −60,0 %    | 4 écritures       |
|  [+190,00 € +11,5 %]   | (rouge, 11 px)       | (vert, 11 px)       | (muted)           |
|  moy. 1 650,00 €       |                      |                     |                   |
+--------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------+
| Par catégorie (cat-title)                                                            |
|  CATÉGORIE            MOIS       MOYENNE     ÉCART                TENDANCE 6 MOIS        |
|  ------------------------------------------------------------------------------------ |
|  ● 🛒 Alimentation    485,00 €   400,00 €   [ +85,00 € · +21,3 % ] ▁▃▂▄▃█          (≡) |
|  ● 🏠 Logement        700,00 €   700,00 €   [ 0,00 € ]             ▅▅▅▅▅▅          (≡) |
|  ● 🎮 Loisirs          40,00 €   100,00 €   [ −60,00 € · −60,0 % ] ▃▅▆▂▃▁          (≡) |
|  ● 📦 Sans catégorie  120,00 €    90,00 €   [ +30,00 € · +33,3 % ] ▂▃▃▄▃▅   (gris) (≡) |
+--------------------------------------------------------------------------------------+
```
Les espacements verticaux entre les deux panneaux sont ceux de `cat-panel` (16 px).

### Bandeau (remplace les 4 cartes)
- Un seul panneau `panel cat-panel` contenant une grille calquée sur `dash-kpis` : première colonne plus large (1,5fr, hero) puis 3 colonnes (1fr), séparées par un filet gauche `--hairline` (pas de cartes encadrées).
- Chaque indicateur : étiquette `kpi-label` (11,5 px, muted), valeur `dash-val` (21 px) ou `dash-hero` (28 px, `--violet-ink`) pour les dépenses du mois, sous-ligne `dash-sub` (11 px, 600).
- Dépenses du mois : valeur hero ; sous-ligne 1 = « moy. X € » (muted) ; sous-ligne 2 = écart (pastille, voir plus bas). Sans référence : « pas de référence » en muted italique.
- Plus forte hausse / baisse : valeur = emoji + nom de la catégorie (21 px, tronqué avec ellipse) ; sous-ligne = écart en rouge / vert. Cliquable (RG16) : ouvre les dépenses de la catégorie, avec focus visible au clavier et survol discret (fond `rgba(32,30,29,0.04)`).
- Sans catégorie : valeur = montant ; sous-ligne = « N écritures » ; en gris (`--muted`) quand 0.
- Messages vides (« Aucune catégorie au-dessus de sa moyenne ») en `dash-sub` muted, la valeur affichant « — ».

### Pastille d'écart (nouvelle, utilisée partout)
- Basée sur `state-chip` : texte = « +85,00 € · +21,3 % » (signe typographique −, « · nouveau » à la place du %).
- Hausse : fond rouge clair / texte `BAD` (nouvelle variante `state-chip is-red`) ; baisse : `state-chip is-green` existant ; nul : `is-neutral`. Le signe reste toujours affiché (RG6).
- Sans référence : pas de pastille, texte « pas de référence » muted italique.

### Tableau
- Même squelette que les lignes de Répartition (`cat-row` : pastille couleur `dot is-9`, nom en 600, montants alignés à droite), pas de défilement horizontal : grille fluide `14px 1fr 110px 110px 190px 130px 28px` à 1440 px (suppression du `min-width: 880px`).
- En-têtes : 11,5 px, muted, majuscules non requises ; colonnes numériques alignées à droite ; Écart aligné à gauche (pastille) ; filet `--hairline` dessous.
- Colonne Mois en gras (comme Répartition), Moyenne en muted ; ligne « Sans catégorie » à 55 % d'opacité (comme `cat-row.is-none`).
- Survol d'une ligne : fond `rgba(32,30,29,0.04)` + coins 8 px (comme `cat-share.is-active`).
- Tendance : sparkline 110 × 28 px, couleur de la catégorie, point du mois affiché plein et plus gros, autres points atténués ; info-bulle par point « mois année : montant » (existante).
- Dernière colonne : icône « Voir les dépenses » (`icon-link`), inchangée.
- Panneau intitulé « Par catégorie » (`cat-title`), séparé du bandeau.

### États
- Vide : « Aucune dépense pour <mois> » (`empty`), bandeau et tableau masqués.
- Sans référence : bandeau et colonnes Moyenne/Écart affichent « pas de référence » ; tri par montant ; pastille de référence remplacée par « Aucune référence ».
- Chargé : comme le wireframe.
- Pas d'état d'erreur ni d'édition (lecture seule, données locales).

### Onglets
- Onglet actif au chargement : « Indicateurs ». Aspect inchangé (`tabs cat-tabs`). Ordre : Indicateurs, Répartition, Gérer (le premier onglet est celui qui s'ouvre).

## Impact technique
- Domaine : aucun changement de calcul (RG1 à RG14). Seule éventuelle adaptation : exposer le signe de l'écart pour choisir la variante de pastille.
- Application : aucune action, aucun port.
- Infrastructure / schéma Supabase : aucun changement.
- Présentation : `Categories.tsx` (onglet initial `indicateurs`, ordre des onglets, bandeau et tableau refaits, composant « pastille d'écart »), `Sparkline` (point du mois plus visible, taille), `app.css` : réutiliser `dash-kpis`/`dash-kpi`/`dash-hero`/`dash-val`/`dash-sub` (grille à 4 colonnes) ou classes `cat-*` équivalentes ; ajouter `state-chip.is-red` ; supprimer les styles `cat-kpis`/`cat-kpi*` devenus inutiles et le `min-width` de `cat-ind-row`.
- Doc : mettre à jour `docs/architecture.md` si l'écran y est décrit.

## Critères d'acceptation
(Domaine = test automatisé ; UI = vérifié par le reviewer.)
1. Given today = 2026-11-18 et mois affiché 2026-11, When on calcule les mois de référence, Then ce sont 2026-01 à 2026-10. (auto)
2. Given mois affiché 2026-03, Then la référence = 2026-01 et 2026-02. (auto)
3. Given mois affiché 2026-12 ou 2027-xx, Then référence = janvier jusqu'au mois précédant le mois affiché et le mois en cours (2026-01 à 2026-10 pour décembre 2026 ; vide pour janvier 2027). (auto)
4. Given une catégorie à 300 € en janvier, 0 en février, 0 en mars et mois de référence = 3, Then sa moyenne = 100 €. (auto)
5. Given mois affiché = janvier de l'année en cours, Then pas de moyenne, l'UI affiche « pas de référence » et aucun écart ni couleur. (auto domaine + reviewer UI)
6. Given montant 485 et moyenne 400, Then écart +85 € et +21,3 %, pastille rouge ; Given montant 40 et moyenne 100, Then −60 € et −60,0 %, pastille verte. (auto pour valeurs, reviewer pour couleurs)
7. Given moyenne 0 et montant > 0, Then « nouveau » à la place du %. (auto)
8. Given une catégorie à 0 ce mois-ci avec moyenne > 0, Then elle est listée avec un écart négatif ; Given une catégorie à 0 partout, Then elle n'est pas listée. (auto)
9. Given plusieurs catégories, Then tri par écart € décroissant puis nom ; sans référence, tri par montant décroissant. (auto)
10. Given des écritures hors budget, `envin`, ou d'un autre mois, Then elles n'entrent ni dans le mois ni dans la moyenne (mêmes chiffres que « Répartition »). (auto)
11. Given le bandeau, Then il affiche total vs moyenne (écart € et %), la catégorie à plus forte hausse, celle à plus forte baisse (hors « Sans catégorie »), et montant + nombre sans catégorie ; les messages « Aucune catégorie au-dessus/en dessous… » quand il n'y en a pas. (auto domaine + reviewer)
12. Given la tendance, Then 6 points se terminant au mois affiché (franchissant l'année si besoin), mois affiché en surbrillance, pas de point pour un mois futur. (auto pour la série, reviewer pour l'affichage)
13. Given l'arrivée sur l'écran Analyse (y compris après être passé sur un autre écran), Then l'onglet actif est « Indicateurs » ; les onglets sont dans l'ordre Indicateurs, Répartition, Gérer ; les flèches clavier circulent entre les trois. (reviewer ; test de rendu si la structure de test le permet)
14. Given un changement de mois dans le sélecteur, Then l'onglet se recalcule. (reviewer)
15. Given le lien « Voir les dépenses » d'une ligne, Then il ouvre les opérations filtrées sur la catégorie. (reviewer)
16. Given un mois sans dépense ni référence, Then « Aucune dépense pour <mois> ». (reviewer)
17. Given le bandeau, Then il n'est plus composé de 4 cartes encadrées : un panneau unique, colonnes séparées par un filet, total du mois en valeur hero violette (même rendu que le bandeau du tableau de bord). (reviewer)
18. Given le tableau à 1440 px, Then aucun défilement horizontal ; colonnes numériques alignées à droite ; écart affiché en pastille (rouge, verte ou neutre) ; survol de ligne visible ; ligne « Sans catégorie » atténuée. (reviewer)
19. Given le bandeau avec une catégorie en « Plus forte hausse » (ou « Plus forte baisse »), When on clique sur son nom (ou Entrée/Espace au clavier), Then les opérations s'ouvrent filtrées sur cette catégorie, comme le lien du tableau. (reviewer)
20. Given aucune catégorie en hausse (ou en baisse) ou « pas de référence », Then le bandeau affiche « — » et le message, sans élément cliquable. (reviewer)
21. Given le tableau, Then il n'y a pas de mini-barre « mois vs moyenne ». (reviewer)
22. Given les styles, Then les classes et tokens existants sont réutilisés ; seule nouveauté de style : la variante `state-chip is-red` ; aucun style mort (anciens `cat-kpi*`). (reviewer)

## Questions ouvertes
Aucune. Décisions de la révision : ordre Indicateurs, Répartition, Gérer ; total du mois en grand (violet) + 3 indicateurs secondaires ; écart en pastille rouge/vert/neutre (`state-chip is-red` créé) ; hausse et baisse du bandeau cliquables ; pas de mini-barre.
