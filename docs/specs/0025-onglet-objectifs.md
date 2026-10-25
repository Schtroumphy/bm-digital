# 0025 — Onglet Objectifs

- Statut : validée
- Date : 2026-10-25
- Branche prévue : feat/onglet_objectifs

## Contexte et objectif
L'entrée « Objectifs » de la navigation est aujourd'hui « bientôt ». Le développeur veut un écran qui suit les trois objectifs annuels déjà connus de l'app (fonds de secours, investir, taux d'épargne) : où j'en suis, ce qu'il reste, si je suis dans le plan, et l'évolution sur l'année. Aujourd'hui seule la petite carte « Objectifs annuels » du Budget les montre, sans historique ni réglage.

## Périmètre
Inclus :
- Écran « Objectifs » : grille de 2 colonnes, une carte par objectif (3 cartes), d'après le design Claude Design « Budget Perso.dc.html » (écran `isObj`).
- Cible modifiable en place sur chaque carte.
- Échéance modifiable en place pour le fonds de secours et « Investir ».
- Puces « Comptes pris en compte » cochables pour le fonds de secours et « Investir ».
- Courbe réel vs plan sur les 12 mois de l'année en cours.

Exclus :
- Objectifs libres : la carte « Nouvel objectif » du design n'est pas affichée.
- Sélecteur de mois ou d'année dans l'écran.
- Modification de la carte « Objectifs annuels » du Budget (elle garde ses seuils de statut), hormis ce qui découle de RG3.
- Écran « Placements ».

## Règles de gestion
Les « comptes » des puces sont les lignes d'épargne et d'investissement (`epa` / `inv`) qui portent un solde dans le Ledger, comme dans `emergencyAccounts` aujourd'hui.

- RG1. L'écran affiche exactement 3 cartes, dans l'ordre : Fonds de secours, Investir (« Investir <cible/1000>K »), Taux d'épargne. Aucune carte « Nouvel objectif ».
- RG2. Mois de référence des valeurs courantes : le dernier mois initialisé qui n'est pas dans le futur ; à défaut, le premier mois géré. Année affichée : celle du mois courant (jan. à déc.).
- RG3. Valeur courante du fonds de secours = somme des soldes de fin de mois du mois de référence des comptes cochés (`settings.emergencyAccounts`). Valeur courante d'« Investir » = idem avec un nouveau réglage `settings.investAccounts`. Par défaut (réglage absent) : toutes les lignes `inv`. Ce changement s'applique aussi à la carte du Budget, qui lit la même valeur.
- RG4. Valeur courante du taux d'épargne = taux d'épargne réelle du mois de référence (`savingsRate` de `monthSummary`).
- RG5. Puces : une par ligne `epa` ou `inv` non archivée, avec son nom et son solde au mois de référence. Cocher ou décocher écrit tout de suite dans le réglage de l'objectif (`emergencyAccounts` ou `investAccounts`). Compteur « Comptes pris en compte · n / total ». Le taux d'épargne n'a pas de puces.
- RG6. Cible : clic sur le montant « sur X » ouvre un champ prérempli. Entrée ou sortie du champ valide, Échap annule. La valeur est écrite dans `emergencyTarget`, `investTarget` ou `savingsRateTarget`. Sont refusés avec un message d'erreur sous le champ, le champ restant ouvert : valeur vide, non numérique, ≤ 0, et pour le taux > 100. Le séparateur décimal virgule est accepté.
- RG7. Échéance (fonds de secours et Investir) : champ date saisi en place, stocké dans `settings.emergencyDue` et `settings.investDue` (`YYYY-MM-DD`, optionnel). Libellé « Échéance 31 déc. 2027 » ; si absente : « Échéance à définir ». Une date vide efface l'échéance. Pour le taux d'épargne, le sous-titre est fixe : « Objectif <année> · moyenne mensuelle ».
- RG8. Série réelle (courbe) : pour chaque mois de l'année, somme des soldes de fin de mois des comptes cochés (`ledger.accMonth`) pour les objectifs en montant ; taux d'épargne du mois pour le taux. Mois sans donnée (avant le premier mois géré, après le mois de référence, mois non initialisé) : aucun point, la courbe est interrompue.
- RG9. Valeur de départ = valeur de la série réelle au premier mois de l'année qui a une donnée. Plan linéaire (objectifs en montant) : de la valeur de départ à la cible, entre ce premier mois et le mois de l'échéance. Sans échéance, ou échéance antérieure au premier mois : pas de plan. Le taux d'épargne n'a pas de plan : sa référence est la ligne de cible horizontale.
- RG10. « Prévu à ce jour » = valeur du plan au mois de référence, limitée à la cible. « Écart au plan » = valeur courante − prévu, signé, vert si ≥ 0 et rouge sinon. « À mettre de côté / mois » = max(0, cible − courant) / nombre de mois restants jusqu'à l'échéance (au moins 1). Sans plan, ces trois stats affichent « — ».
- RG11. Statut des objectifs en montant : « Atteint » si courant ≥ cible ; sinon avec un plan, ratio = courant / prévu : « En bonne voie » si ≥ 1, « En progression » si ≥ 0,85, « À rattraper » sinon ; sans plan : « En progression ». Taux d'épargne : « Atteint » si courant ≥ cible, sinon « À rattraper ».
- RG12. Pourcentage et barre = min(100, courant / cible × 100), affichés avec une décimale, virgule. « Reste X » en montant ; pour le taux : « Encore X pts » ou « Atteint ».
- RG13. Stats du taux d'épargne : « Moyenne sur 12 mois » (des mois avec donnée), « Mois au-dessus de <cible> % » (n / nombre de mois avec donnée), « Écart à l'objectif » en points, signé.
- RG14. Cible à 0 (état initial) ou aucune puce cochée : la carte affiche « À définir » comme statut, la cible modifiable, ni pourcentage, ni barre, ni courbe, ni stats chiffrées. Les puces restent cochables.
- RG15. Les montants utilisent le format existant (`money`, `percent`). Les réglages sont sauvegardés par le mécanisme de sauvegarde existant (état « Enregistré » / erreur de la sauvegarde). Écran en lecture seule pour la courbe et les stats : seuls les champs cible, échéance et puces écrivent.

## Parcours utilisateur
Nominal :
1. Je clique sur « Objectifs » : 3 cartes, valeurs au mois de référence, courbes sur l'année.
2. Je clique sur la cible du fonds de secours, saisis 25000, valide : la carte, le pourcentage, le reste et la carte du Budget se mettent à jour.
3. Je décoche un compte d'investissement : la valeur courante, la courbe et les stats d'« Investir » sont recalculées.
4. Je saisis l'échéance d'« Investir » : le plan et le statut apparaissent.

Cas limites :
- Budget neuf (cibles à 0) : trois cartes « À définir » (RG14).
- Cible invalide (0, négatif, texte) : erreur, rien n'est écrit.
- Échéance dépassée : « À mettre de côté / mois » divise par 1 mois.
- Année en cours avec peu de mois gérés : courbe courte, interrompue.
- Aucun compte `epa`/`inv` : pas de puces, carte « À définir ».

## Design
Source : design Claude Design « Budget Perso.dc.html », écran `isObj` (copie : `scratchpad/design.html`, lignes 328-371 pour le markup, 1033-1050 pour la logique, 1077 pour le toggle des comptes).
- Grille 2 colonnes (gap 18 px) ; carte : en-tête teinté (icône 30 px, nom, échéance, pastille de statut), valeur courante 30 px avec « sur » + cible modifiable (soulignée en tirets), barre 9 px, % et reste, courbe SVG 118 px (cible en pointillé fin, plan en tirets gris, réel plein avec aire), axe Jan. à Déc., légende « Réel » / « Plan linéaire » (ou « Objectif »), puces de comptes, 3 stats.
- Teintes : fonds de secours HUE.obj, Investir HUE.rev, taux d'épargne 85, comme `GoalsCard`. Teinte du statut : 85 « À rattraper », 190 « En progression », 150 « En bonne voie ».
- Carte « Nouvel objectif » du design : non reprise (RG1).
- Écarts au design à valider : champ échéance en place (absent du design) ; état « À définir » (absent du design) ; état erreur du champ cible (message sous le champ). Design proposé, à valider pour ces trois points : le champ échéance reprend le style du champ cible (même bordure teintée) et se place sous le nom, à la place du texte d'échéance.
- Composants réutilisés : `panel`, `progress`, `toneVars`, `tone`, `Icon`, éditeur de montant comme `AllocEditor`. Pas de dépendance ajoutée : la courbe est un SVG écrit à la main. Desktop 1440 px uniquement.

## Impact technique
- Domaine : `Settings` gagne `investAccounts?: string[]`, `emergencyDue?: string`, `investDue?: string`. `monthSummary` : `investTotal` lit `investAccounts` (défaut : lignes `inv`). Nouvelles fonctions pures pour la série mensuelle, le plan, le statut et les stats (testables sans UI).
- Application : actions pour modifier une cible, une échéance, cocher un compte d'objectif ; pas de nouveau port.
- Infrastructure : `supabaseRows.ts` et `database.types.ts` ; migration Supabase ajoutant `invest_accounts text[]`, `emergency_due date`, `invest_due date` (nullables) sur la table des réglages ; lecture tolérante des données existantes ; contrat du repository étendu.
- Présentation : nouvel écran `Objectifs`, `App.tsx` (entrée active, type `Screen`, titre « Objectifs », sans sélecteur de mois, `soon` retiré pour cette entrée), styles dans `app.css`.
- Doc : README / architecture si la liste des écrans y figure.

## Critères d'acceptation
Tests automatisés (T) pour le domaine et la persistance, le reste vérifié par le reviewer dans l'app.
1. (T) Given un budget avec `investAccounts` absent, When je calcule la valeur d'« Investir », Then elle égale la somme des soldes de toutes les lignes `inv` (RG3).
2. (T) Given `investAccounts` contenant une seule ligne, Then la valeur courante ne compte que celle-ci, et `GoalsCard` du Budget affiche la même valeur.
3. (T) Given des soldes mensuels, When je calcule la série réelle, Then les mois avant le premier mois géré et après le mois de référence n'ont pas de valeur (RG8).
4. (T) Given départ 9 000, cible 21 000, échéance à 24 mois, When je calcule le plan, Then il est linéaire entre le premier mois de l'année et l'échéance, et « Prévu à ce jour » vaut la valeur du plan au mois de référence (RG9, RG10).
5. (T) Given courant 13 950 et prévu 14 000, Then statut « En bonne voie » si ratio ≥ 1, « En progression » si ≥ 0,85, « À rattraper » sinon ; « Atteint » si courant ≥ cible ; sans plan « En progression » (RG11).
6. (T) Given pas d'échéance, Then « Prévu à ce jour », « Écart au plan » et « À mettre de côté / mois » valent « — » (RG10).
7. (T) Given une échéance dépassée, Then « À mettre de côté / mois » = reste à faire sur 1 mois.
8. (T) Given un taux d'épargne mensuel connu pour 8 mois, Then moyenne, nombre de mois ≥ cible (n / 8) et écart en points sont corrects (RG13).
9. (T) Given une cible saisie à 0, négative, vide, texte ou taux > 100, Then la saisie est refusée et le réglage inchangé ; « 25 000,5 » est accepté (RG6).
10. (T) Given les nouveaux réglages, When j'enregistre puis recharge via le repository (mémoire et Supabase), Then `investAccounts`, `emergencyDue`, `investDue` sont restitués ; absents dans d'anciennes données, aucun plantage (contrat du repository).
11. Given l'app ouverte, When je clique « Objectifs » dans la nav, Then l'écran s'ouvre avec titre « Objectifs », 3 cartes dans l'ordre, sans carte « Nouvel objectif », sans sélecteur de mois (RG1).
12. Given une carte, When je clique la cible, saisis une valeur valide et presse Entrée, Then la cible, le %, le reste et la carte du Budget se mettent à jour ; Échap annule ; une valeur invalide affiche une erreur et garde le champ ouvert (RG6).
13. Given les puces, When je (dé)coche un compte, Then la valeur, la courbe, le compteur et les stats changent, et le choix persiste après rechargement (RG5).
14. Given une échéance saisie, Then le sous-titre et le plan apparaissent ; vidée, retour à « Échéance à définir » (RG7).
15. Given des cibles à 0, Then les cartes sont en « À définir » sans barre ni courbe (RG14).
16. Given l'écran à 1440 px, Then la grille a 2 colonnes et rien ne déborde ; build, lint et tests passent.

## Questions ouvertes
Aucune bloquante. À valider avec le design : les trois écarts listés dans la section Design (champ échéance, état « À définir », message d'erreur).
