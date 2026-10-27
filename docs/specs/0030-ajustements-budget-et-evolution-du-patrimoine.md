# 0030 — Budget sans barres de variables, et carte « Évolution du patrimoine » (tableau de bord)

- Statut : implémentée
- Date : 2026-10-27
- Branche prévue : feat/evolution_patrimoine_dashboard
- Dépend de : 0027 (tableau de bord). Voisine de 0029 (carte « Épargne », mouvements des comptes) : voir « Chevauchement ».

## Contexte et objectif

1. Dans l'onglet Budget, chaque ligne de dépense variable porte une fine barre de progression (consommé / budget). Le tableau de bord montre déjà cette information (carte « Dépenses variables », 0027 RG5) : la barre du Budget est redondante.
2. Sur le tableau de bord, la carte « Dépenses prévues sur l'année » occupe toute la largeur de la colonne gauche. Le développeur la veut sur la moitié gauche de la ligne, et, sur l'autre moitié, un encart qui montre l'évolution de son patrimoine par rapport au mois précédent (« par exemple ou autres évolutions »).

## État des lieux (vérifié)

- Barre du Budget : bloc `fill-bar` rendu seulement pour `block === 'var'` (`Budget.tsx`, vers la ligne 435), styles `.fill-bar` dans `app.css`, variante `.line-row.is-off-budget .fill-bar`. La barre du tableau de bord (`.dash-bar`, carte `VariablesCard`) est un autre composant et n'est pas concernée.
- Carte annuelle : `YearlyCard` (`Dashboard.tsx`), `.dash-yearly { flex: 1 }` dans la colonne gauche, sous la rangée « Dépenses variables / Enveloppes ».
- Patrimoine (0027 RG13) : `wealthAt(d, ledger, ref)` = épargnes + investissements (soldes de fin de mois des lignes `epa` / `inv` du budget), au mois de référence de l'écran Objectifs (spec 0025), pas au mois du sélecteur. `DashboardView.wealth` = total, épargnes, investissements, part d'épargne. Le calcul est déjà paramétré par mois : le patrimoine de fin du mois précédent est calculable avec le même code.
- Le bloc « Patrimoine » (colonne droite) et la carte « Épargne » (0029, mouvements par compte) existent ou sont prévus : l'encart de cette spec ne doit pas les doubler.

## Périmètre

Inclus :
- Retrait de la barre des lignes variables du Budget (A).
- Carte annuelle réduite à la moitié de la largeur de la colonne gauche ; nouvelle carte « Évolution du patrimoine » sur l'autre moitié (B).

Exclus :
- Le tableau de bord, ses barres (`.dash-bar`), le donut et les cartes existantes ne changent pas, hors la largeur de la carte annuelle.
- Toute modification du calcul du patrimoine (`wealthAt`), du Fonds de secours et des objectifs.
- Lignes hors budget (spec 0031).
- Graphique interactif, nouvelle dépendance (SVG / CSS à la main).

## Règles de gestion

A. Budget
- RG1. Les lignes de dépense variable du Budget n'affichent plus de barre de progression. Aucune autre information de la ligne ne change (nom, budget, réel, écart, pointage, mode de paiement, saisie rapide, infobulles).
- RG2. Les lignes des autres blocs n'ont pas de barre aujourd'hui : rien d'autre à retirer. La hauteur des lignes variables (`is-roomy`, 34 px) reste inchangée (décision du développeur).
- RG3. Les styles devenus inutiles sont retirés.

B. Tableau de bord, rangée du bas
- RG4. La carte « Dépenses prévues sur l'année » occupe la moitié gauche de la largeur de la colonne gauche (à 1440 px), la nouvelle carte la moitié droite, mêmes hauteur et alignement : la rangée prolonge toujours la colonne gauche jusqu'au bas de la colonne droite (0027, CA17). Les 12 barres restent lisibles à cette largeur (montant au-dessus, mois en dessous, total et moyenne en en-tête, lien « Détail »).
- RG5. Carte « Évolution du patrimoine » (proposition, à valider) :
  - Mois de comparaison : le mois de référence de l'écran Objectifs (comme « Patrimoine », cohérent avec le total affiché juste à droite) comparé au mois précédent.
  - Grand chiffre : variation du patrimoine total = patrimoine de fin du mois M − patrimoine de fin du mois M−1, signée, verte si positive, rouge si négative, neutre si nulle, avec le pourcentage de variation (une décimale) quand le patrimoine M−1 est > 0, sinon « — ».
  - Détail : deux lignes « Épargnes » et « Investissements », chacune avec son solde de fin de mois M et sa variation vs M−1 (même signe / couleurs).
  - Mini-courbe des 6 derniers mois de patrimoine total, mois M mis en valeur comme dans la carte annuelle.
  - Même définition du patrimoine que « Patrimoine » (`wealthAt`), donc mêmes chiffres : le total de fin M de la carte est égal au total du bloc « Patrimoine ».
- RG6. Pas de mois précédent (premier mois du budget) : variation et pourcentage affichent « — », la mini-courbe n'a qu'un point. Patrimoine nul aux deux mois : variation 0, pourcentage « — ».
- RG7. Mois du sélecteur non initialisé : la carte reste affichée (comme « Patrimoine », qui suit le mois de référence, 0027 RG2).
- RG7b. Carte annuelle à demi-largeur : le montant n'est affiché au-dessus de la barre que pour le mois choisi ; pour les autres mois il est en infobulle (avec la part de l'année).
- RG8. Lecture seule, aucune écriture. Montants avec `money`, pourcentages avec `percent`. Lien « Détail » vers l'écran Objectifs (ne change pas le mois, 0027 RG16).
- RG9. Aucun chiffre existant ne change.

## Chevauchement (tranché)

- Spec 0029 (carte « Épargne », colonne droite, mouvements par compte d'épargne sur le mois du sélecteur) et cette carte montrent toutes deux une « évolution » de l'épargne. Décision du développeur : garder les deux (0029 par compte, 0030 globale). 0029 part des comptes bancaires et de leurs flux ; la présente carte part du patrimoine (lignes `epa` / `inv`) et compare deux fins de mois.
- Spec 0028 : les opérations affectées n'ont aucun effet sur les soldes, donc aucun sur cette carte.

## Parcours utilisateur

Nominal : j'ouvre Accueil sur octobre 2026. En bas à gauche, « Dépenses prévues sur l'année » tient sur la moitié de la largeur ; à droite, « Évolution du patrimoine » indique « +1 240,00 € · +4,1 % vs septembre », ses deux lignes épargnes / investissements et la courbe des 6 derniers mois. Dans le Budget, les lignes variables n'ont plus de filet de progression.

Cas limites : premier mois (« — »), patrimoine à 0, variation négative (rouge), mois non initialisé, année sans prévu (barres minimales).

## Design

Design proposé (wireframe validé par le développeur, pas de maquette). Réutilise `panel dash-card`, `DetailLink`, les couleurs `GOOD` / `BAD`, les teintes épargne (violet) / investissement (bleu) du bloc Patrimoine, le style des 12 barres (`.bars`).

```
 ┌─ Dépenses prévues sur l'année ─┐ ┌─ Évolution du patrimoine ──── Détail ┐
 │ Total 21 340 € · moy. 1 778 €  │ │  +1 240,00 €   +4,1 % vs septembre    │
 │  ▂ ▃ ▂ ▅ ▂ ▃ ▂ ▂ ▂ █ ▃ ▂      │ │  Épargnes        12 400,00 €  +900,00 │
 │ jan fév mar ...      oct ...   │ │  Investissements 18 840,00 €  +340,00 │
 └────────────────────────────────┘ │  ▁▂▃▃▅█   (6 derniers mois)           │
                                    └───────────────────────────────────────┘
```
(Chiffres d'exemple.) À 1440 px : colonne gauche ~930 px, soit ~457 px par carte avec 16 px d'écart. États : chargé, premier mois, patrimoine nul, variation négative. Les 12 barres passent à une largeur réduite : libellés de mois en 3 lettres déjà prévus (0027 RG9), montants en format compact si nécessaire (question 5).

## Impact technique (quoi)

- Domaine : `domain/dashboard.ts` : `DashboardWealth` gagne la variation vs mois précédent (total, épargnes, investissements, pourcentage) et la série des 6 derniers mois, calculées avec `wealthAt` sur plusieurs mois ; aucun nouveau calcul de solde.
- Application / infrastructure / schéma Supabase : aucun.
- Présentation : `Budget.tsx` (retrait de la barre), `Dashboard.tsx` (nouvelle carte, rangée à deux colonnes), `app.css` (styles de barre retirés, rangée 50 / 50, `.dash-yearly`).
- Documentation : spec 0027 amendée (RG9 largeur de la carte, nouvelle carte), `docs/architecture.md` si la liste des blocs y figure.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given le Budget d'un mois initialisé, Then aucune ligne de dépense variable n'affiche de barre de progression, et nom, budget, réel, écart et pointage sont inchangés. (Man)
- CA2. Given le tableau de bord à 1440 px, Then « Dépenses prévues sur l'année » et « Évolution du patrimoine » se partagent la largeur de la colonne gauche à parts égales, sans débordement, et le bas de la rangée est aligné sur le bas de la colonne droite. (Man)
- CA3. Given un patrimoine de 30 000 € fin septembre et 31 240 € fin octobre, Then la carte affiche +1 240,00 € et +4,1 %. (Auto)
- CA4. Given une variation négative, Then le signe « − » et la couleur rouge sont affichés ; positive : vert ; nulle : neutre. (Auto sur le signe, Man sur la couleur)
- CA5. Given deux lignes (épargnes, investissements), Then chacune donne son solde de fin M et sa variation vs M−1, et la somme des variations égale la variation totale. (Auto)
- CA6. Given le total de fin M de la carte, Then il est égal au total du bloc « Patrimoine ». (Auto)
- CA7. Given le premier mois du budget, Then variation et pourcentage affichent « — » sans erreur. (Auto)
- CA8. Given un patrimoine nul aux deux mois, Then variation 0 et pourcentage « — ». (Auto)
- CA9. Given les 6 derniers mois, Then la courbe donne le patrimoine de fin de chaque mois et met M en valeur ; moins de 6 mois d'historique : seulement les mois existants. (Auto sur les données, Man sur l'écran)
- CA10. Given l'ajout de la carte, Then Patrimoine, Fonds de secours, objectifs, KPI et donut produisent les mêmes valeurs qu'avant. (Auto, tests existants)
- CA11. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur intégrées : lignes variables conservées à 34 px ; comparaison sur le mois de référence de l'écran Objectifs vs le précédent ; contenu = variation du total + détail épargnes / investissements + courbe 6 mois ; cartes 0029 et 0030 conservées toutes deux ; montants de la carte annuelle en infobulle sauf le mois choisi ; pas de maquette, wireframe ASCII validé.
