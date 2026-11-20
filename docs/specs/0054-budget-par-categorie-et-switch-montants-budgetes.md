# 0054 — Budget par catégorie et switch « montants budgétés » dans Indicateurs

- Statut : validée
- Date : 2026-11-19
- Branche prévue : feat/budget_par_categorie

## Note de changement (révision 3)
- Rév. 1 : switch et budgets dans les trois onglets de Catégories.
- Rév. 2 : switch déplacé en vue annuelle, Gérer en cartes.
- Rév. 3 (cette version) : plus aucun budget en vue annuelle (retour à son état d'origine). Les budgets s'affichent dans Catégories > Indicateurs, avec le switch à cet endroit. Les deux tableaux d'Indicateurs restent côte à côte. Migration Supabase `category_budgets` : appliquée.

- Rév. 4 : pour le mois en cours, l'écart à la moyenne n'est plus affiché dans Indicateurs (RG20 à RG22). Cela modifie le comportement de la spec 0052.

## Contexte et objectif
Il n'existait aucun budget par catégorie de dépenses. Objectif : définir un montant budgété par catégorie et par mois (saisie dans Catégories > Gérer), et le comparer au réel dans Catégories > Indicateurs grâce à un switch « Montants budgétés ».

## Périmètre
Inclus :
- Saisie, dans Gérer, du budget mensuel de chaque catégorie pour le mois affiché (champ toujours visible).
- Gérer en grille de cartes.
- Switch « Montants budgétés » dans Indicateurs, mémorisé localement ; colonnes Budget et Écart budget.

Exclus :
- Toute présentation de budget en vue annuelle (retrait complet) et dans Répartition.
- Budget pour « Sans catégorie ».
- Lien avec les lignes du Budget (var, env, fix) : le budget est indicatif et indépendant.
- Comparaison du KPI « Dépenses du mois » à un total de budgets.
- Reprise ou copie du budget d'un mois à l'autre (saisie manuelle chaque mois).
- Alertes de dépassement, import/export.

## Règles de gestion
- RG1 : un budget est un montant en euros, supérieur ou égal à 0, rattaché à un couple (catégorie, mois). Un couple a 0 ou 1 budget. Stockage : table `category_budgets` (migration appliquée).
- RG2 : « Sans catégorie » n'a jamais de budget : pas de carte ni de champ dans Gérer, « — » dans les colonnes budget d'Indicateurs.
- RG3 : un mois sans budget saisi = aucun budget, pas 0. Un budget saisi à 0 est un vrai budget de 0 €.
- RG4 : la saisie dans Gérer concerne le mois affiché dans l'application. Changer de mois change les valeurs. Les autres mois ne sont jamais modifiés.
- RG5 : le champ « Budget mensuel » de Gérer est toujours visible, sans lien avec le switch. Le budget y est lu sur fond léger et devient éditable au clic. Vide = aucun budget ; vider un champ rempli supprime le budget du mois.
- RG6 : saisie valide = nombre décimal (virgule ou point) ≥ 0, arrondi au centime. Texte non numérique ou nombre négatif : refusé avec un message sous le champ, rien n'est enregistré. Entrée valide, Échap annule.
- RG7 : le switch « Montants budgétés » n'existe que dans Catégories > Indicateurs. Éteint par défaut, mémorisé localement au navigateur (clé `categories.showBudgets`), non synchronisé avec Supabase. Changer d'onglet ou de mois ne le modifie pas.
- RG8 : switch éteint = Indicateurs identique à avant cette spec, hormis l'alignement des nombres (colonnes à largeur fixe, montants à droite en chiffres tabulaires, en-têtes numériques centrés) : colonne « Écart » (à la moyenne), aucun budget visible, liste de catégories inchangée.
- RG9 : switch allumé = deux colonnes ajoutées dans chaque tableau : « Budget » (budget du mois, « — » si aucun) et « Écart budget » ; la colonne d'écart à la moyenne est renommée « Écart moy. ».
- RG10 : écart budget = réel du mois − budget du mois, affiché « +20,00 € · +5,0 % ». Rouge au-dessus du budget, vert en dessous, neutre si nul ; le signe est toujours écrit (jamais la couleur seule). Le pourcentage (écart / budget) est omis si le budget vaut 0. « — » si aucun budget.
- RG11 : switch allumé, une catégorie sans dépense ce mois-là mais avec un budget apparaît dans Indicateurs (réel 0,00 €, écart négatif). Switch éteint, elle n'apparaît pas (comportement d'avant).
- RG12 : les deux tableaux d'Indicateurs restent côte à côte, switch allumé comme éteint (plus de passage en une colonne empilée). La place est gagnée sur la colonne Catégorie (plus étroite, libellé tronqué avec infobulle du nom complet).
- RG13 : la vue annuelle, y compris l'onglet « Dépenses par catégorie », est strictement revenue à son état d'origine : ni switch, ni budget, ni total budgété. L'ancienne clé `yearView.showCategoryBudgets` n'est plus utilisée.
- RG14 : Répartition n'affiche jamais de budget. Les KPI d'Indicateurs (« Dépenses du mois », hausse, baisse, « Sans catégorie ») ne changent pas.
- RG15 : Gérer : une carte par catégorie, dans l'ordre actuel : pastille, emoji (cliquable, sélecteur), nom, nombre de dépenses, champ « Budget mensuel », actions « Voir les dépenses », « Renommer », « Supprimer ». Ajout, renommage, erreurs, confirmation et suppression bloquée si la catégorie est utilisée : inchangés. Message « Aucune catégorie, ajoutes-en une » si vide.
- RG16 : cartes en grille fluide (plusieurs colonnes en 1440 px, une seule si étroit) ; un nom long est tronqué avec infobulle.
- RG17 : le budget d'une catégorie supprimée est supprimé avec elle. Renommer ou changer l'emoji ne change pas le budget.
- RG18 : les données sans budget restent valides (tout est « aucun budget »).
- RG19 : le budget ne modifie ni le réel, ni les soldes, ni les lignes du Budget, ni le taux d'épargne.
- RG20 (modifie le comportement de la spec 0052, qui n'est pas réécrite : cette règle la complète) : pour le mois en cours (celui de la date du jour, non terminé), l'écart à la moyenne n'est pas calculé ni affiché, car comparer un mois partiel à une moyenne de mois complets donne de faux écarts. Cela vaut dans le tableau par catégorie (colonne « Écart » / « Écart moy. », cellule « — » avec infobulle « mois en cours ») et dans le KPI « Dépenses du mois » (pas de chip d'écart ; « — » avec la même infobulle). Le montant du mois et la moyenne restent affichés. Les mois passés et futurs sont inchangés (0052).
- RG21 : pour le mois en cours, les KPI « Plus forte hausse » et « Plus forte baisse » ne retiennent aucune catégorie (faute d'écart) : ils affichent « — » et le message « mois en cours ». Le tri par la colonne d'écart place ces lignes en dernier, dans les deux sens (comme « pas de valeur »).
- RG22 : l'« Écart budget » n'est pas concerné par RG20 et RG21 : il reste affiché pour le mois en cours (réel du moment − budget du mois).

## Parcours utilisateur
Nominal :
1. Dans Catégories > Gérer, le développeur saisit 400 pour « Courses » (clic sur le budget, Entrée) : le budget du mois est enregistré.
2. Dans Indicateurs, le switch est éteint : rien n'a changé.
3. Il l'allume : colonnes Budget (« 400,00 € ») et Écart budget (réel 420 : « +20,00 € · +5,0 % » en rouge) apparaissent, les catégories sans budget affichent « — ». Les tableaux restent côte à côte.
4. Il l'éteint, ou recharge la page : l'état est conservé (mémorisé) et les budgets restent enregistrés.

Cas limites :
- Mois suivant : budgets vides, « — ».
- Budget sans dépense du mois : ligne présente avec réel 0,00 €, écart vert.
- Budget à 0 et réel 50 : « +50,00 € », pas de pourcentage.
- Saisie « abc » ou « -5 » : message, valeur précédente conservée.
- Mois sans aucune dépense : message vide existant d'Indicateurs, sauf si le switch est allumé et qu'au moins une catégorie a un budget (RG11) : le tableau s'affiche.
- Nom de catégorie long : tronqué, infobulle.

## Design
Design proposé, à valider (pas de maquette existante).

Switch « Montants budgétés » dans l'en-tête du panneau « Par catégorie » d'Indicateurs (à droite du titre). Switch allumé, chaque moitié (côte à côte) :

```
 ● Catégorie   Mois     Budget    Écart budget        Moy.     Écart moy.  Tendance
 ● Courses…   420 €    400 €     +20 € · +5,0 %      395 €    +6,3 %      ~~~
 ● Loisirs     0 €     120 €     −120 €  (vert)      90 €     −100 %      ~~~
 ● Sport      80 €       —          —                60 €     +33 %       ~~~
```
Colonne Catégorie réduite, nom tronqué avec infobulle ; colonnes numériques compactes pour que les deux moitiés tiennent côte à côte en 1440 px. Switch éteint : tableau actuel, colonne « Écart ».

Gérer : champ d'ajout en haut, puis grille de cartes (`auto-fill`, ~280 px mini). Carte : pastille, emoji, nom, nombre de dépenses, « Budget mensuel » en lecture sur fond léger, éditable au clic, actions. États : liste vide, carte normale, renommage, budget en erreur, suppression désactivée.

Réutilisation : `cat-ind-row` (ajustée en largeur de colonnes), `GapChip` (couleurs/signe), `state-chip`, `panel`, `cat-row`, `emoji-btn`, `popmenu`, `btn-outline`, `text-input`, tokens `organic.css`. Desktop 1440 px : pas de mise en page mobile.

## Impact technique
- Domaine : `categoryIndicators` fournit budget et écart par ligne, et intègre les catégories avec budget sans dépense quand demandé. `categoryYear` revient sans budgets. Écart budgétaire : fonction pure testable.
- Application : actions de définition, de suppression de budget et de suppression en cascade avec la catégorie (inchangées).
- Infrastructure : table `category_budgets` (appliquée sur Supabase), chargement tolérant à l'absence de budgets.
- Présentation : `Categories.tsx` (switch et colonnes dans Indicateurs, largeur des colonnes, tableaux côte à côte, Gérer en cartes, Répartition sans budget) ; `YearView.tsx` retour à l'état d'origine, clé `yearView.showCategoryBudgets` supprimée.

## Critères d'acceptation
(T) = couvert par un test automatisé.
- CA1 (T) : Given un mois sans budget pour une catégorie, When on calcule les indicateurs, Then budget et écart budget sont absents (pas 0).
- CA2 (T) : Given budget 400 et réel 420, Then écart = +20,00 € et +5,0 %.
- CA3 (T) : Given budget 0 et réel 50, Then écart = +50,00 € et aucun pourcentage.
- CA4 (T) : Given un budget défini pour M, When on lit M+1, Then aucun budget n'y est présent.
- CA5 (T) : Given un budget saisi, When on le vide, Then il est supprimé du mois.
- CA6 (T) : Given « abc » ou « -5 », When on valide, Then refus et rien n'est enregistré ; « 12,5 » et « 12.5 » donnent 12,50 €.
- CA7 (T) : Given une catégorie avec budgets, When on la supprime, Then ses budgets sont supprimés.
- CA8 (T) : Given des données sans budgets, When on charge, Then tout fonctionne et tout est « aucun budget ».
- CA9 (T) : Given une catégorie avec budget et sans dépense du mois, When on calcule les indicateurs en demandant les budgets, Then elle est listée avec réel 0 ; sans cette demande, elle ne l'est pas.
- CA10 (T) : Given `categoryYear`, Then le résultat ne contient aucun budget.
- CA11 : Given Indicateurs au premier chargement, Then le switch est éteint, la colonne s'appelle « Écart », aucun budget n'est visible.
- CA12 : Given le switch allumé, Then les colonnes « Budget » et « Écart budget » apparaissent, « Écart moy. » remplace « Écart », rouge au-dessus du budget, vert en dessous, signe écrit, « — » sans budget, pourcentage absent si budget 0.
- CA13 : Given le switch allumé en 1440 px, Then les deux tableaux sont côte à côte, sans débordement horizontal ; les noms longs sont tronqués avec infobulle.
- CA14 : Given le switch éteint en 1440 px, Then les deux tableaux sont côte à côte comme avant.
- CA15 : Given la page rechargée, Then l'état du switch (clé `categories.showBudgets`) est conservé ; changer d'onglet ou de mois ne le modifie pas.
- CA16 : Given « Sans catégorie », Then aucun budget (« — » dans Indicateurs, pas de carte dans Gérer).
- CA17 : Given la vue annuelle > Dépenses par catégorie, Then ni switch, ni budget, ni total budgété ; aucune lecture de `yearView.showCategoryBudgets`.
- CA18 : Given Répartition, Then aucun budget affiché.
- CA19 : Given Gérer, Then chaque catégorie (hors « Sans catégorie ») a une carte avec un champ « Budget mensuel » toujours visible, en lecture sur fond léger et éditable au clic ; Entrée enregistre, Échap restaure.
- CA20 : Given les cartes en 1440 px, Then plusieurs colonnes, sans débordement ; une seule colonne si la fenêtre est étroite.
- CA21 : Given une carte, When on clique sur l'emoji, Then le sélecteur s'ouvre ; un choix s'applique et ferme le sélecteur.
- CA22 : Given un renommage (Entrée / Échap), Then enregistré ou restauré ; nom vide ou en doublon : erreur dans la carte, rien d'enregistré.
- CA23 : Given une catégorie utilisée, Then « Supprimer » est désactivé avec l'infobulle existante ; Given une inutilisée, When on confirme, Then la carte disparaît.
- CA24 : Given « Voir les dépenses », Then l'écran des opérations s'ouvre filtré sur la catégorie.
- CA25 : Given aucune catégorie, Then message « Aucune catégorie, ajoutes-en une ».
- CA27 (T) : Given `categoryIndicators(data, M, today = M)` avec un historique de mois passés, Then l'écart à la moyenne est absent (null) pour chaque catégorie et pour le total, alors que le montant du mois et la moyenne sont fournis.
- CA28 (T) : Given `today = M`, Then `topRise` et `topFall` sont vides (null).
- CA29 (T) : Given `today` postérieur à M (mois passé) ou antérieur à M (mois futur), Then les écarts, `topRise` et `topFall` sont calculés comme avant (non-régression 0052).
- CA30 (T) : Given `today = M` et un budget défini, Then l'écart budget est fourni (inchangé).
- CA31 : Given le mois en cours dans Indicateurs, Then la colonne d'écart à la moyenne et le chip du KPI « Dépenses du mois » affichent « — » (infobulle « mois en cours »), le montant et la moyenne restent visibles, les KPI hausse et baisse affichent « — » et « mois en cours ».
- CA32 : Given le mois en cours, switch allumé, Then la colonne « Écart budget » reste affichée.
- CA33 : Given un mois passé, Then l'affichage est identique à avant.
- CA26 : Given la saisie d'un budget ou un renommage, Then le réel, les soldes et le Budget ne changent pas, et les budgets ne bougent pas au renommage.

## Questions ouvertes
Aucune.
