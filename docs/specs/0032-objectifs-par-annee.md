# 0032 — Objectifs par année et par type

- Statut : implémentée
- Date : 2026-10-28
- Branche prévue : feat/objectifs_par_annee

## Contexte et objectif
Aujourd'hui l'écran Objectifs (spec 0025) montre exactement 3 objectifs écrits en dur (fonds de secours, investir, taux d'épargne), stockés dans les réglages, sans notion d'année ni d'historique. Le développeur veut des objectifs annuels : une liste d'objectifs par année civile, de plusieurs types (montant sur comptes, taux d'épargne, plafond de dépenses, montant épargné dans l'année), en nombre libre, consultables année par année. Cette spec pose le modèle et l'écran. La préparation de l'année suivante est la spec 0033.

## Périmètre
Inclus :
- Un objectif devient une donnée : année, type, nom libre, cible, paramètres du type.
- 4 types : A montant sur comptes, B taux d'épargne, C plafond de dépenses, D épargné dans l'année.
- Écran Objectifs : sélecteur d'année, grille de cartes, création, modification en place, suppression avec confirmation.
- Migration des 3 objectifs actuels en objectifs de l'année en cours, sans perte.
- Cartes « Objectifs annuels » du Budget et du tableau de bord : les 3 premiers de l'année en cours.
- Années passées en lecture seule.

Exclus :
- Préparer l'année suivante, copie des objectifs de N vers N+1 (spec 0033). En 0032, on peut créer un objectif sur n'importe quelle année en cours ou future via le sélecteur.
- Objectif libre à saisie manuelle, objectif « solde de crédit à zéro ».
- Objectifs sur une enveloppe.
- Limite du nombre d'objectifs.

## Règles de gestion
- RG1. Un objectif a : une année civile (janvier à décembre), un type (A, B, C ou D), un nom libre (non vide, 60 caractères maximum), une cible > 0, un ordre de création. Aucune limite de nombre.
- RG2. Type A, montant sur comptes : paramètres = comptes pris en compte (une ou plusieurs lignes `epa` / `inv`, au moins une pour être « défini »), échéance facultative (date libre, comme en 0025). Valeur = somme des soldes de fin de mois des comptes cochés au mois de référence. Plan linéaire, statuts, « Prévu à ce jour », « Écart au plan », « À mettre de côté / mois » : règles de la 0025 (RG8 à RG12), inchangées. Valeur de départ du plan : solde réel au 1er janvier de l'année (solde de fin de décembre précédent, 0 s'il n'existe pas), ou, à défaut de mois géré en janvier, la première valeur de l'année (comportement 0025, RG9).
- RG3. Type B, taux d'épargne : cible en % (0 < cible ≤ 100). Valeur = taux d'épargne réelle du mois de référence ; moyenne, mois au-dessus de la cible, écart en points : règles de la 0025 (RG4, RG13).
- RG4. Type C, plafond de dépenses : paramètres = un périmètre au choix à la création : un bloc de dépenses (crédits, fixes, variables), une section d'un bloc, ou une ligne. Valeur = cumul depuis le 1er janvier de l'année, jusqu'au mois de référence, du réel des lignes du périmètre. Les opérations hors budget ou affectées à un compte d'épargne ne comptent pas (RG8). La cible est un plafond : l'objectif est tenu tant que valeur ≤ cible.
- RG5. Type C, statuts : « Dépassé » (rouge) si valeur > cible ; sinon « Sous contrôle » si le cumul est ≤ à la part du plafond écoulée (cible × mois écoulés de l'année / 12) ; sinon « À surveiller ». Barre = min(100, valeur / cible × 100) ; « Reste X » ou « Dépassé de X ». Pas de plan : une ligne de rythme (cible répartie linéairement sur 12 mois) sert de référence sur la courbe.
- RG6. Type D, épargné dans l'année : paramètres = lignes d'épargne / investissement prises en compte (une ou plusieurs lignes `epa` / `inv`, toutes par défaut). Valeur = cumul depuis le 1er janvier jusqu'au mois de référence du réel versé sur ces lignes (flux, pas solde ; versements bruts, les sorties d'épargne ne sont pas déduites). Opérations hors budget ou affectées exclues (RG8). Plan = cible répartie linéairement sur 12 mois ; statuts et stats comme le type A, avec échéance fixe au 31 décembre.
- RG7. Mois de référence et mois avec données : règles de la 0025 (RG2, RG8). Pour une année passée, le mois de référence est le dernier mois géré de cette année ; pour une année future, il n'y a pas de valeur : la carte affiche 0 et pas de courbe réelle.
- RG8. Sont exclues des types B, C et D les opérations hors budget (spec 0031) et affectées à un compte d'épargne (spec 0028). Le type A les inclut par le solde des comptes.
- RG9. Sélecteur d'année : flèches ‹ › autour de l'année affichée. Plage = de l'année du premier mois géré à l'année en cours + 1. À l'ouverture : l'année en cours. Années passées : lecture seule (ni création, ni modification, ni suppression, ni coche de compte). Année en cours et future : modifiables.
- RG10. Création : bouton « Nouvel objectif » (années en cours et future) ouvre un panneau : 1. type, 2. nom, 3. cible, 4. paramètres du type, 5. échéance (type A). L'objectif est créé pour l'année affichée. Validations : nom non vide, cible numérique > 0 (virgule acceptée, taux ≤ 100), paramètre requis du type renseigné (au moins un compte pour A et D, un périmètre pour C). Erreur sous le champ, panneau ouvert.
- RG11. Modification en place, comme en 0025 : cible (RG6 de la 0025), échéance (type A), puces de comptes (A et D), nom (clic sur le nom). Le type et le périmètre d'un plafond ne se modifient pas : il faut supprimer et recréer.
- RG12. Suppression : bouton sur la carte, avec une confirmation (« Supprimer l'objectif « X » ? Cette action est définitive »). Définitive, aucune corbeille.
- RG13. Ordre d'affichage : ordre de création dans l'année. Grille de 2 colonnes qui défile.
- RG14. État vide : année sans objectif = message « Aucun objectif pour <année> » et bouton « Créer un objectif ». Si l'année précédente a des objectifs, le message propose aussi « Reprendre ceux de <année−1> » (la copie est la spec 0033 ; en 0032 ce bouton n'apparaît pas).
- RG15. Migration : au premier chargement après la mise à jour, les 3 objectifs actuels deviennent 3 objectifs de l'année en cours (le fonds de secours et « Investir » de type A avec leurs comptes, cibles et échéances ; le taux d'épargne de type B), dans cet ordre, avec les mêmes noms qu'aujourd'hui. Aucune perte ; une cible à 0 dans les réglages ne crée pas d'objectif. Les anciens réglages ne sont plus lus après migration.
- RG16. Cartes du Budget (« Objectifs annuels ») et du tableau de bord : affichent les 3 premiers objectifs de l'année en cours, par ordre de création, avec le même calcul que l'écran, et un lien « Voir les objectifs ». Aucun objectif : texte « Aucun objectif <année> » et le lien.
- RG17. Sauvegarde : mécanisme existant (état « Enregistré » / erreur, spec 0012). Lecture tolérante des anciennes données.

## Parcours utilisateur
Nominal :
1. J'ouvre Objectifs : l'année en cours, mes 3 anciens objectifs migrés.
2. Je clique « Nouvel objectif », choisis « Plafond de dépenses », nomme « Restaurants », cible 1 200, périmètre ligne « Restaurants » : la carte apparaît avec cumul et reste.
3. Je clique ‹ : 2025 en lecture seule, sans boutons de modification.
4. Je supprime un objectif : confirmation, puis la carte disparaît.

Cas limites :
- Aucun objectif sur l'année : état vide (RG14).
- Plafond dépassé : statut « Dépassé » rouge.
- Ligne ou compte supprimé après création : l'objectif reste, le périmètre manquant compte 0 et un avertissement « Périmètre introuvable » est affiché.
- Cible invalide : refus avec message.
- Budget neuf sans mois géré : l'écran affiche l'état vide.

## Design
Design proposé et validé par le développeur (pas de maquette fournie). Cartes de la 0025 réutilisées (`panel`, `goal-card`, `progress`, puces `goal-chip`, `toneVars`, `Icon`, champs en place `TargetField` / `DueField`).

```
Objectifs        [‹ 2026 ›]                         [+ Nouvel objectif]
┌─ Fonds de secours ─────┐  ┌─ Taux d'épargne ──────┐
│ 12 400 sur 20 000      │  │ 54,2 % sur 60 %       │
│ ▓▓▓▓▓▓░░░ 62 %         │  │ courbe / stats        │
│ courbe, puces, stats   │  │                       │
└────────────────────────┘  └───────────────────────┘
┌─ Restos ≤ 1 200 € ─────┐
│ 840 dépensés · reste 360│
│ barre « plafond »      │
└────────────────────────┘

Panneau de création : 1. Type [ Montant sur comptes | Taux d'épargne |
 Plafond de dépenses | Épargné dans l'année ]  2. Nom  3. Cible
 4. Paramètres du type (comptes à cocher / bloc-section-ligne)
 5. Échéance (type A)   [Annuler] [Créer]
```
États : année vide (RG14), chargé, édition en place, erreur de saisie sous le champ, année passée en lecture seule (champs non cliquables, bouton « Nouvel objectif » masqué), plafond dépassé (statut rouge « Dépassé »), confirmation de suppression (boîte de dialogue). Teintes : A existantes (fonds de secours HUE.obj, investir HUE.rev) ; B 85 ; C et D : teintes à choisir parmi celles du design system sans nouvelle couleur. Desktop 1440 px uniquement.

## Impact technique
- Domaine : type `Goal` (id, année, type, nom, cible, paramètres, échéance, ordre) dans `BudgetData`, `goals?: Goal[]`. Calcul pur par type (valeur, série mensuelle, plan / rythme, statut, stats) testable sans UI ; `goalView` généralisé à un objectif. Fonction de migration des réglages vers `goals`. `Settings` : champs d'objectifs conservés en lecture seule pour la migration.
- Application : actions pour créer, modifier (nom, cible, échéance, comptes), supprimer un objectif ; validation partagée. Pas de nouveau port.
- Infrastructure : table Supabase `goals` (migration additive : id, année, type, nom, cible, échéance, paramètres, ordre), lecture / écriture par le repository, contrat étendu ; lecture tolérante des données sans `goals`.
- Présentation : écran Objectifs (sélecteur d'année, panneau de création, suppression avec confirmation), cartes Budget et tableau de bord, styles dans `app.css`.
- Doc : README / architecture si la liste des fonctionnalités l'exige ; ADR pour le passage des réglages vers une table `goals`.

## Critères d'acceptation
Tests automatisés (T) pour le domaine, la migration et la persistance ; le reste vérifié par le reviewer dans l'app.
1. (T) Given des réglages avec 3 objectifs définis, When le budget est chargé, Then 3 objectifs existent pour l'année en cours avec les mêmes cibles, comptes, échéances et noms ; une cible à 0 ne crée rien (RG15).
2. (T) Given un type A avec un solde au 1er janvier de 9 000, cible 21 000, échéance à 24 mois, Then le plan part de 9 000 et « Prévu à ce jour » vaut la valeur du plan au mois de référence (RG2).
3. (T) Given un plafond sur une ligne avec 840 € de réel cumulé et cible 1 200, Then valeur 840, reste 360 ; à 1 300, statut « Dépassé » et « Dépassé de 100 » (RG4, RG5).
4. (T) Given une opération hors budget et une opération affectée sur la ligne du plafond, Then elles ne comptent ni dans C, ni dans B, ni dans D, mais sont incluses dans le solde d'un type A (RG8).
5. (T) Given des versements de 500 € par mois sur une ligne d'épargne pendant 6 mois, cible 8 000, Then le type D vaut 3 000 et le statut suit le rythme linéaire (RG6).
6. (T) Given un plafond de 1 200 et le mois de référence en juin (part écoulée 600), When le cumul est 700, Then statut « À surveiller » ; When le cumul est 500, Then « Sous contrôle » (RG5).
7. (T) Given un nom vide, une cible ≤ 0, un taux > 100 ou aucun compte / périmètre, When je crée, Then refus et rien n'est enregistré (RG10).
8. (T) Given des objectifs enregistrés puis rechargés via le repository (mémoire et Supabase), Then ils sont restitués à l'identique ; absents dans d'anciennes données, aucun plantage (RG17).
9. (T) Given une année passée, Then les actions de création, modification et suppression sont refusées par l'application (RG9).
10. Given l'écran, When je clique ‹ et ›, Then l'année change dans la plage autorisée ; l'année passée n'affiche aucun bouton de modification.
11. Given « Nouvel objectif », When je remplis le panneau avec chacun des 4 types, Then la carte correspondante apparaît avec ses valeurs ; un champ invalide affiche l'erreur sous le champ.
12. Given une carte, When je clique la suppression et confirme, Then l'objectif disparaît et reste absent après rechargement ; annuler ne supprime rien (RG12).
13. Given une année sans objectif, Then le message « Aucun objectif pour <année> » et le bouton de création s'affichent (RG14).
14. Given plus de 3 objectifs en année en cours, Then la carte du Budget et celle du tableau de bord montrent les 3 premiers par ordre de création avec le lien « Voir les objectifs » (RG16).
15. Given l'écran à 1440 px, Then la grille a 2 colonnes et rien ne déborde ; build, lint et tests passent.

## Questions ouvertes
Aucune. (Tranché par le développeur : le type D compte les versements bruts, les sorties d'épargne ne sont pas déduites.)
