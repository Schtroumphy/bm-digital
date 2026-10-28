# 0034 — Onglet Simulation (bac à sable de budget mensuel)

- Statut : implémentée
- Date : 2026-10-28
- Branche prévue : feat/onglet_simulation

> Amendement 2026-10-28 : ajout d'un indicateur « Épargne » (Enveloppes + Épargnes + Investissements, Investissements mis en lumière) dans le panneau « Reste à placer ». Besoin du développeur : « Ajoute un indicateur épargne qui compte enveloppe, épargne, invest en mettant invest en lumière ». Ajouts : RG23 à RG29, section Design « Indicateur Épargne », CA18 à CA24. Le reste de la spec (RG1 à RG22, CA1 à CA17) est inchangé. L'indicateur est une extension du panneau existant : aucune règle nouvelle côté persistance.

## Contexte et objectif
Le développeur veut tester des scénarios de budget (ex. « Passage à 80 % après le déménagement ») sans toucher à son vrai budget : partir du budget modèle ou d'une page vide, modifier des lignes, voir ce qu'il « reste à placer » par mois et par an, comparer au modèle, noter ses hypothèses, et garder plusieurs simulations enregistrées.

La simulation est un bac à sable : elle ne modifie jamais le modèle, ni un mois, ni les soldes, ni les objectifs.

## Périmètre
Inclus :
- Nouvelle entrée de navigation « Simulation » et son écran (design `design/project/Budget Perso (standalone).html`, section `SCREEN : SIMULATION`).
- Édition d'une simulation : nom, lignes (nom + montant mensuel) dans 7 blocs, notes.
- Création « Partir de » : Budget modèle ou Vide.
- Enregistrement, réouverture, duplication et suppression de simulations.
- Panneau « Reste à placer » (mensuel, annuel, revenus, sorties, barres par bloc, écart avec le modèle).
- Persistance des simulations enregistrées dans Supabase (deux tables).

Exclus :
- Appliquer une simulation au modèle ou à un mois (aucun lien d'écriture vers le vrai budget).
- Comparer deux simulations entre elles.
- Simulation à l'année ou mois par mois (une simulation = un mois type, l'annuel = mensuel × 12).
- Lien avec les enveloppes, comptes, lignes réelles (les lignes d'une simulation sont du texte libre + un montant).
- Historique, partage, export.

## Règles de gestion
- RG1. Blocs, dans cet ordre : Revenus, Crédits et dettes, Dépenses fixes, Dépenses variables, Épargnes, Investissements, Enveloppes. Les 6 premiers sont les `BlockKey` existants (`rev`, `cre`, `fix`, `var`, `epa`, `inv`) ; « Enveloppes » est un 7e bloc propre à la simulation.
- RG2. Une ligne = un nom (libre, peut être vide) et un montant mensuel (facultatif). Montant vide = 0. Le montant annuel affiché d'une ligne = mensuel × 12, vide si le montant est vide.
- RG3. Saisie du montant : chiffres, espace, virgule ou point uniquement (pas de signe moins) ; la virgule est le séparateur décimal affiché. Un montant illisible compte 0.
- RG4. Totaux d'un bloc = somme de ses lignes (mensuel) ; annuel = mensuel × 12. Affichés dans l'en-tête du bloc (« 2 060 € · 24 720 €/an »).
- RG5. Sorties = crédits + fixes + variables + enveloppes + épargnes + investissements. Reste à placer = revenus − sorties (comme le « Reste à placer » du budget et `templateSummary`, l'épargne et les placements sont donc des sorties). Reste annuel = reste × 12.
- RG6. Le reste à placer s'affiche en couleur d'alerte (rouge) quand il est négatif, sinon en violet.
- RG7. Barres du panneau : une par bloc hors Revenus (6 barres), largeur = bloc / revenus (plafonnée à 100 %, 0 si revenus ≤ 0), avec le montant mensuel et annuel.
- RG8. « Budget modèle » = Reste à placer du modèle de budget de l'écran Modèle (`BudgetData.template`), indépendant du mois affiché, hors lignes d'un compte « hors budget » (`templateSummary(d).remaining`). « Écart avec le modèle » = reste de la simulation − reste du modèle, signé (+ vert si positif, rouge si négatif, gris si nul). Les deux sont calculés à l'affichage avec le modèle courant : modifier le modèle modifie l'écart d'une simulation déjà enregistrée.
- RG9. « Partir de Budget modèle » remplace la simulation en cours par une nouvelle (non enregistrée, sans nom, sans notes) pré-remplie avec les lignes du modèle, hors lignes d'un compte « hors budget » (même périmètre que `templateSummary`) : chaque ligne du modèle devient une ligne du bloc correspondant, chaque enveloppe devient une ligne libre du bloc Enveloppes avec son allocation du modèle (0 si absente), sans lien ensuite avec l'enveloppe réelle. « Vide » crée une simulation sans aucune ligne. Dans les deux cas les modifications non enregistrées de la simulation précédente sont perdues, sans confirmation.
- RG10. La puce « Partir de » active reflète la source de la simulation en cours (Modèle ou Vide) ; aucune n'est active pour une simulation rouverte ou dupliquée.
- RG11. Ajouter : ajoute une ligne vide (nom et montant vides) à la fin du bloc. Retirer : supprime la ligne, sans confirmation. Un bloc sans ligne affiche « Aucune ligne ».
- RG12. Enregistrer exige un nom non vide (espaces de début et de fin retirés). Sinon : message « Donne un nom à la simulation. » et rien n'est enregistré. Réussite : message « Simulation enregistrée ». Le message disparaît à la prochaine modification.
- RG22. Unicité du nom : deux simulations enregistrées ne peuvent pas porter le même nom. La comparaison ignore la casse et les espaces de début et de fin (« Plan A » = « plan a  »), pas les accents. Si une AUTRE simulation enregistrée a déjà ce nom, l'enregistrement est refusé avec le message « Une simulation porte déjà ce nom. » et rien n'est enregistré. Réenregistrer la même simulation sous son propre nom (même modifié en casse ou en espaces) est autorisé. Une simulation non enregistrée (neuve, copie) peut porter provisoirement un nom déjà pris ; le refus a lieu à l'enregistrement. Le message disparaît à la prochaine modification.
- RG13. Enregistrer une simulation neuve la crée (elle apparaît en tête des « Enregistrées ») ; enregistrer une simulation rouverte la met à jour. Elle reste ouverte et devient « enregistrée » (le bouton Dupliquer apparaît).
- RG14. « Dupliquer » (visible seulement si la simulation ouverte est enregistrée) ouvre une copie non enregistrée : nom « <nom> (copie) » (vide si le nom est vide), mêmes lignes et mêmes notes. La simulation d'origine n'est pas modifiée.
- RG15. Les simulations enregistrées sont des pastilles : nom, reste à placer mensuel (rouge si négatif), croix de suppression. Cliquer sur la pastille l'ouvre (remplace la simulation en cours, modifications non enregistrées perdues). La pastille de la simulation ouverte est mise en évidence. « aucune » s'affiche s'il n'y en a pas.
- RG16. Supprimer (croix) retire la simulation sans ouvrir la pastille. Si c'était la simulation ouverte, elle reste affichée à l'écran mais redevient non enregistrée (le bouton Dupliquer disparaît).
- RG17. Notes : texte libre multi-ligne, enregistré avec la simulation. Pas de limite de longueur.
- RG18. Le montant « reste » d'une pastille est recalculé à l'affichage depuis les lignes enregistrées de la simulation ; il n'est jamais stocké.
- RG19. L'écran n'écrit jamais dans le modèle, les mois, les transactions ni les réglages. Une simulation non enregistrée n'est pas persistée : elle reste en mémoire tant que l'application est ouverte (changer d'onglet ne la perd pas) et est perdue au rechargement de la page. Écraser ou supprimer se fait sans confirmation.
- RG20. À l'ouverture de l'écran sans simulation en cours, une simulation neuve « Partir du Budget modèle » est affichée (comme le design).
- RG21. L'écran est accessible dès que le premier mois existe (comme les autres onglets) ; il n'a pas de sélecteur de mois ni d'année dans l'en-tête.
- RG23. Indicateur Épargne : total épargne = Enveloppes + Épargnes + Investissements de la simulation (les 3 blocs `env`, `epa`, `inv`), en mensuel ; annuel = mensuel × 12. Il s'ajoute à l'affichage existant sans le modifier : ces 3 blocs restent des sorties (RG5), le reste à placer ne change pas.
- RG24. Part de l'épargne = total épargne mensuel / revenus × 100, valeur 0 si les revenus sont ≤ 0 (pas de division par zéro). Lecture littérale : aucun plafonnement à 100 % (contrairement aux barres de RG7), la part peut dépasser 100 % si l'épargne dépasse les revenus. Arrondi `round2` côté domaine.
- RG25. Détail : trois lignes, dans l'ordre Enveloppes, Épargnes, Investissements, chacune avec son montant mensuel (annuel = mensuel × 12). Chaque ligne reprend le total de son bloc (RG4). La somme des 3 lignes = total épargne.
- RG26. Investissements mis en avant : sa ligne est visuellement distincte des deux autres (couleur de son bloc, taille et graisse de texte plus fortes) et affiche en plus sa part du total épargne = investissements / total épargne × 100, valeur 0 si le total épargne est nul. Arrondi `round2` côté domaine. Les lignes Enveloppes et Épargnes n'affichent pas cette part.
- RG27. Tous les calculs de l'indicateur (total mensuel et annuel, part des revenus, détail, part des investissements dans l'épargne) sont faits par une fonction pure de `src/domain/simulation.ts`, arrondis `round2` ; l'écran n'affiche que ces valeurs. Les montants illisibles ou vides comptent 0 (RG2, RG3).
- RG28. L'indicateur se met à jour à chaque saisie, comme le reste du panneau, et vaut 0 € / 0 % pour une simulation sans ligne. Il suit la simulation ouverte (neuve, rouverte, dupliquée) et n'est jamais stocké.
- RG29. Position : dans le panneau « Reste à placer », sous les 6 barres et avant « Reste à placer sur l'année ». Aucun changement de modèle de données, de schéma Supabase, de port ni d'action d'enregistrement.

## Parcours utilisateur
Nominal :
1. J'ouvre « Simulation » : le modèle est chargé, je vois par exemple Reste à placer 2 950 €, 35 400 €/an, écart 0 €.
2. Je baisse un revenu de 400 € et j'ajoute une ligne « Nouveau loyer » en dépenses fixes : le reste, les barres et l'écart se mettent à jour à chaque saisie.
3. Je nomme « Passage à 80 % », j'écris mes hypothèses en notes, j'enregistre : « Simulation enregistrée », la pastille apparaît avec son reste.
4. Je clique « Dupliquer », je modifie, j'enregistre sous un autre nom.
5. Plus tard, je clique sur une pastille pour la rouvrir ; je supprime celles qui ne servent plus.

Cas limites :
- Enregistrer sans nom : message d'erreur, rien d'enregistré.
- Revenus à 0 : reste négatif ou nul, barres à 0 %, pas de division par zéro.
- Aucune ligne dans un bloc ou dans tout l'écran (Vide) : totaux à 0 €, reste 0 €.
- Montant avec virgule (« 1 234,5 ») ou espace : lu correctement. Caractère interdit saisi : ignoré.
- Modèle vide (aucune ligne) : « Partir du Budget modèle » donne une simulation vide.
- Erreur de sauvegarde Supabase : bannière habituelle « Réessayer ».
- Nom déjà pris par une autre simulation enregistrée (casse et espaces ignorés) : message « Une simulation porte déjà ce nom. », rien d'enregistré. Une copie (« X (copie) ») doit être renommée si ce nom existe déjà.
- Ligne de nom vide avec un montant : comptée dans les totaux.
- Indicateur Épargne : revenus à 0 : part des revenus = 0 %. Aucune épargne : total 0 €, part des investissements 0 %. Seulement des investissements : leur part vaut 100 %. Épargne supérieure aux revenus : part des revenus > 100 %, sans plafond.

## Design
Source : `design/project/Budget Perso (standalone).html`, section `SCREEN : SIMULATION` (maquette validée, ne pas la redessiner). Transcription sur le design system Organic (`src/presentation/ds/organic.css`) et l'icône « Simulation » (fiole) du prototype, à ajouter à `Icon`.

Structure (1440 px) :
- Carte du haut : champ nom (placeholder « Nom de la simulation (ex. Passage à 80 % après le déménagement) »), bouton « Dupliquer » (si enregistrée), bouton « Enregistrer » (violet, icône disquette). Dessous : « Partir de » + puces Budget modèle / Vide ; séparateur ; « Enregistrées » + pastilles (nom, reste, croix) ou « aucune » ; message d'enregistrement ou d'erreur à droite.
- Grille de 4 colonnes : 6 blocs de lignes (teinte propre à chaque bloc : revenus 150, crédits 20, fixes 38, variables 75, épargnes 300, investissements 250), chacun avec en-tête (icône, titre, total mensuel · annuel/an), lignes (nom, montant mensuel avec « € », annuel en lecture seule, croix « Retirer »), pied « Ajouter un revenu / un crédit / une dépense fixe / une dépense variable / un compte / un placement ». Le bloc Enveloppes (teinte 330, « Ajouter une enveloppe ») occupe 3 colonnes avec ses lignes sur 3 colonnes.
- Colonne de droite (colonne 4, sur 2 rangées) : panneau « Reste à placer » (gros montant, tuiles Revenus / Sorties avec annuel, 6 barres, puis « Reste à placer sur l'année », « Budget modèle », « Écart avec le modèle »), puis bloc « Notes » (zone de texte, placeholder « Hypothèses, objectifs, points à vérifier… »).
- États : simulation neuve, enregistrée (Dupliquer visible, pastille active), reste négatif (rouge), bloc vide, erreur de nom, aucune simulation enregistrée.
- Titre d'en-tête : « Simulation ». Pas de sélecteur de mois.

Indicateur Épargne (amendement 2026-10-28, extension du panneau de la maquette ; reste cohérent avec son style, sans nouvelle maquette) :
- Emplacement : dans le panneau « Reste à placer », sous les 6 barres, séparé par le même filet que les lignes existantes, avant « Reste à placer sur l'année ».
- En-tête : libellé « Épargne » ; à droite le total mensuel (ex. « 1 500 € ») et dessous le total annuel (« 18 000 €/an »), même style que les tuiles Revenus / Sorties ; à côté, la part des revenus (« 36 % des revenus »).
- Détail, trois lignes (libellé à gauche, montant mensuel à droite, annuel en petit gris) :
  - Enveloppes : couleur et teinte du bloc Enveloppes (330), taille et graisse normales.
  - Épargnes : couleur et teinte du bloc Épargnes (300), taille et graisse normales.
  - Investissements (mis en lumière) : couleur et teinte du bloc Investissements (250), libellé et montant plus grands et en gras, fond ou liseré léger de sa teinte, et sa part du total épargne (« 60 % de l'épargne »).
- Les couleurs viennent des teintes déjà utilisées par les blocs ; aucun token nouveau. Les puces de teinte et le style de libellé reprennent ceux des barres.
- États : simulation vide (0 € · 0 %, détail à 0 €, part des investissements 0 %) ; revenus nuls (part 0 %) ; chargé ; pas d'état d'erreur propre (calcul local).

Écarts à valider avec le prototype : le prototype utilise des styles en ligne et un état en mémoire ; l'implémentation réutilise les classes Organic existantes. Les 7 blocs ne reprennent pas le composant du Budget (lignes plus simples : pas de réel, pointage, jour ni mode).

## Impact technique
Domaine :
- Nouveaux types `Simulation` (id, nom, notes, lignes) et `SimulationRow` (id, bloc parmi les 7, nom, montant mensuel ou vide), dans `domain/types.ts` ; `BudgetData.simulations?` facultatif (aucune migration de version).
- Amendement : nouvelle fonction pure dans `domain/simulation.ts` (indicateur épargne : total mensuel et annuel, part des revenus, détail Enveloppes / Épargnes / Investissements, part des investissements dans le total), arrondis `round2`, à partir des totaux existants. Aucun changement de type, de `BudgetData`, de schéma Supabase, de port ni d'action ; `Simulation.tsx` / `SimulationBlock.tsx` n'affichent que ces valeurs.
- Fonction pure de totaux d'une simulation (par bloc, sorties, reste, annuel) et de création d'une simulation depuis le modèle (`domain/simulation.ts`). Le reste du modèle réutilise `templateSummary.remaining`, sans recalcul séparé, pour que l'écart soit cohérent avec l'écran Modèle.

Application :
- Cas d'usage purs sur `BudgetData` : enregistrer (créer ou mettre à jour, nom requis et unique selon RG22), supprimer. L'édition d'une simulation en cours (lignes, nom, notes, puces) vit dans l'état de l'application (mémoire, conservé en changeant d'onglet, perdu au rechargement), pas dans `BudgetData`.
- Aucun nouveau port (même agrégat et même `BudgetRepository`).

Infrastructure et schéma Supabase :
- Deux tables, avec `user_id` et RLS « own rows » : `simulations` (nom, notes, ordre/date de création) et `simulation_rows` (simulation, bloc, nom, montant, position). Migration additive à écrire, à faire valider puis appliquer par le développeur ; `supabaseRows.ts`, `database.types.ts`, test de contrat du repository à compléter. ADR à écrire (forme des tables, comme l'ADR 0023).

Présentation :
- `App.tsx` : `Screen` + `'simulation'`, entrée `NAV` « Simulation » placée après « Objectifs » et avant « Placements », `TITLES`, pas de sélecteur de mois dans l'en-tête.
- `screens/Simulation.tsx` (+ composants de bloc au besoin) : n'affiche que des valeurs calculées par le domaine. Icône `flask` à ajouter dans `components/Icon.tsx`.

## Critères d'acceptation
(Tests automatisés = domaine et application, Vitest ; l'UI n'a pas de tests, vérification par le reviewer.)

- CA1 (auto). Given une simulation avec revenus 3 000, fixes 1 000, variables 500, épargnes 200, When on calcule les totaux, Then sorties = 1 700, reste = 1 300, reste annuel = 15 600.
- CA2 (auto). Given une ligne dont le montant est vide ou illisible, When on calcule, Then elle compte 0 et son annuel est vide si le montant est vide.
- CA3 (auto). Given revenus = 0, When on calcule les parts de chaque bloc, Then elles valent 0 et le reste est ≤ 0, sans erreur.
- CA4 (auto). Given un modèle avec lignes de tous les blocs et des allocations d'enveloppes, When on crée une simulation depuis le modèle, Then chaque ligne du modèle est une ligne du bon bloc, chaque enveloppe est une ligne « Enveloppes » avec son allocation, et le reste vaut `templateSummary(d).remaining`.
- CA5 (auto). Given un modèle quelconque, When on crée une simulation « Vide », Then elle n'a aucune ligne, aucun nom, aucune note.
- CA6 (auto). Given une simulation sans nom (ou avec des espaces), When on l'enregistre, Then l'action est refusée et `simulations` est inchangé.
- CA7 (auto). Given une simulation nommée neuve, When on l'enregistre, Then elle est ajoutée en tête avec un id ; When on l'enregistre de nouveau modifiée, Then elle est mise à jour sans doublon.
- CA7b (auto). Given une simulation enregistrée « Plan A », When on enregistre une autre simulation nommée « plan a » ou « Plan A  », Then l'action est refusée (« Une simulation porte déjà ce nom. ») et `simulations` est inchangé ; When on réenregistre « Plan A » elle-même, même renommée « PLAN A », Then c'est accepté.
- CA8 (auto). Given une simulation enregistrée, When on la supprime, Then elle disparaît de `simulations` et aucun autre champ de `BudgetData` (modèle, mois, transactions) n'est modifié.
- CA9 (auto). Given l'écart avec le modèle, When le reste de la simulation vaut 2 500 et celui du modèle 2 950, Then l'écart vaut −450.
- CA10 (auto, contrat repository). Given des simulations avec lignes, When on sauvegarde puis recharge, Then on retrouve les mêmes simulations (noms, notes, lignes dans le même ordre) ; supprimer une simulation supprime ses lignes.
- CA11. Given l'application connectée, When je clique sur « Simulation » dans la barre latérale, Then l'écran s'affiche avec le titre « Simulation », sans sélecteur de mois, et une simulation neuve partie du modèle.
- CA12. Given un champ montant, When je tape des lettres ou un signe moins, Then ils sont refusés ; When je tape « 1 234,5 », Then le total du bloc se met à jour.
- CA13. Given une simulation modifiée non enregistrée, When je clique sur « Vide », Then les lignes sont effacées et la modification précédente est perdue.
- CA14. Given une simulation enregistrée ouverte, When je clique « Dupliquer », Then le nom devient « <nom> (copie) », le bouton Dupliquer disparaît, et l'original reste inchangé dans les pastilles.
- CA15. Given un reste négatif, Then le montant « Reste à placer » est rouge ; positif, il est violet.
- CA16. Given une simulation enregistrée, When je recharge la page et reviens sur Simulation, Then sa pastille est présente et son ouverture restitue lignes et notes.
- CA17. Given une session, When j'utilise l'écran Simulation, Then ni le modèle, ni le Budget, ni les Objectifs n'ont changé.

Amendement (indicateur Épargne) :
- CA18 (auto). Given enveloppes 300, épargnes 200, investissements 500, revenus 3 000, When on calcule l'indicateur, Then total mensuel = 1 000, annuel = 12 000, part des revenus = 33,33, détail = 300 / 200 / 500, part des investissements dans l'épargne = 50.
- CA19 (auto). Given revenus = 0 et de l'épargne, When on calcule, Then la part des revenus vaut 0, sans erreur.
- CA20 (auto). Given aucune ligne en Enveloppes, Épargnes et Investissements, When on calcule, Then total, annuel, détail et parts valent 0 (pas de division par zéro sur la part des investissements).
- CA21 (auto). Given revenus 1 000 et épargne totale 1 500, When on calcule, Then la part des revenus vaut 150 (aucun plafond).
- CA22 (auto). Given des montants vides ou illisibles dans les 3 blocs, When on calcule, Then ils comptent 0 ; Given une épargne seulement en investissements, Then leur part vaut 100. Given les montants 0,1 + 0,2 en épargnes, Then le total est arrondi `round2` (0,3).
- CA23 (auto). Given une simulation quelconque, When on calcule l'indicateur, Then sorties et reste à placer sont identiques à ceux d'avant l'amendement (CA1 reste vrai) et la somme des 3 lignes de détail = total épargne.
- CA24. Given l'écran Simulation, When je regarde le panneau « Reste à placer », Then sous les barres je vois « Épargne » avec total mensuel, annuel et part des revenus, puis les lignes Enveloppes, Épargnes, Investissements ; la ligne Investissements est plus grande, en gras, dans la couleur de son bloc et affiche sa part de l'épargne, les deux autres non ; Given je modifie un montant d'un de ces blocs, Then l'indicateur se met à jour à la saisie ; Given une simulation vide, Then il affiche 0 € et 0 %.

## Questions ouvertes
Aucune. Décisions du développeur : persistance Supabase (deux tables) ; budget modèle = `BudgetData.template` hors lignes « hors budget » ; Enveloppes = lignes libres ; reste d'une pastille recalculé ; simulation non enregistrée en mémoire sans confirmation ; entrée de navigation après « Objectifs » ; noms uniques (casse et espaces de début/fin ignorés, accents conservés ; précision de comparaison proposée par le PA).
