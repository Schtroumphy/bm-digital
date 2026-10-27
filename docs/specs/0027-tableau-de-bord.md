# 0027 — Tableau de bord (Accueil)

- Statut : validée (v2, d'après la maquette)
- Date : 2026-10-25
- Branche prévue : feat/tableau_de_bord

## Contexte et objectif
Le développeur veut un écran d'accueil « Tableau de bord » (entrée de navigation « Accueil ») qui rassemble, pour un mois donné, l'essentiel de ce qu'il faut savoir et faire : combien il reste à placer, comment se répartit chaque euro de revenu, où en sont les dépenses variables et les enveloppes, ce qui est prévu sur l'année, ce qu'il y a à faire ce mois-ci, ses notes, son patrimoine et ses objectifs annuels.

La première version de cette spec (7 blocs en lecture seule, wireframe proposé) est remplacée : l'implémentation qui en découle est jugée non conforme et très incomplète. Cette version est fidèle à la maquette réelle fournie par le développeur (image `images/7.png`, écran « Tableau de bord », décembre 2026). Les données chiffrées de la maquette sont des exemples : l'écran affiche les calculs de l'app : la maquette définit « Dépenses » (enveloppes comprises) et « Taux d'épargne » autrement que le Budget ; le développeur a décidé de conserver les définitions du Budget.

## Ce qui est repris de la v1 (décisions toujours valables)
- Sélecteur de mois dans l'en-tête, **partagé avec le Budget** (même mois mémorisé).
- Les chiffres viennent des calculs existants (`monthSummary`, `goalView`, `envelopeAlerts`, `lineCounted`, `lineCheck`, `isLate`, `variableRemaining`…) : l'écran ne recalcule rien de son côté.
- Fonds de secours et objectifs : valeurs de l'écran Objectifs (mois de référence de la spec 0025, pas le mois choisi).
- Alertes enveloppes : uniquement les alertes existantes de `envelopeAlerts`.
- Revenus, dépenses, épargne : budgétés, avec le réel en sous-ligne.
- « Virements à faire » : lignes d'épargne et d'investissement et allocations d'enveloppes non pointées.
- Nouvelle icône « maison » pour l'entrée de navigation, qui devient la première entrée et l'écran d'accueil.

## Périmètre
Inclus :
- Écran « Tableau de bord » en 2 zones (maquette) : à gauche le bandeau KPI + donut, puis Dépenses variables et Enveloppes côte à côte, puis Dépenses prévues sur l'année ; à droite une colonne « À faire ce mois-ci », « Notes du mois », « Patrimoine », « Objectifs annuels ».
- Boutons « + » de saisie rapide sur les dépenses variables et les enveloppes.
- Notes du mois : ajout, coche, suppression (nouvelle donnée).
- Entrée de navigation « Accueil » avec icône maison, en première position, écran d'ouverture ; l'entrée « Démarrage » reste masquée une fois le premier mois créé (comportement existant).
- Liens « Détail » et chevrons vers les écrans existants.

Exclus :
- Entrée « Simulation » de la maquette : l'écran n'existe pas dans l'app.
- Renommage ou retrait d'entrées de navigation : « Comptes », « Modèle » et le libellé « Opérations » restent, l'icône et le libellé « Budget » aussi.
- Modification des écrans existants, hormis l'entrée de navigation.
- Graphique interactif : pas de survol ni de zoom, le donut et les barres sont informatifs.
- Nouvelle dépendance : donut et barres sont du SVG/CSS écrits à la main, comme la courbe de l'écran Objectifs.

## Règles de gestion
- RG1. Le mois affiché est celui du sélecteur de l'en-tête (boutons précédent / suivant, menu des mois, mois mémorisé, partagé avec le Budget). Titre de l'écran : « Tableau de bord ».
- RG2. Mois non initialisé : bannière « <Mois> n'est pas encore initialisé » avec un bouton « Voir le Budget » ; les blocs qui dépendent du mois (RG3 à RG12, RG14 pour ses virements, RG15) affichent « — » ou un état vide ; Patrimoine, Fonds de secours et Objectifs annuels restent affichés (RG16, RG17). Les boutons « + » sont absents ; les notes restent utilisables (RG12).
- RG3. **Bandeau KPI** (6 chiffres, de gauche à droite), tous budgétés sauf mention :
  - « Reste à placer en <mois> » (grand, violet) = `monthSummary.remaining`, sous-ligne « Disponible (réel) X » = `availableReal` quand il n'est pas null (rouge s'il est négatif, comme le Budget) ;
  - « Revenus » = `income`, sous-ligne « Réel X » = somme des réels des lignes `rev` du mois ;
  - « Dépenses » = `expenses` de `monthSummary` (crédits + fixes + variables, comme le Budget ; les allocations d'enveloppes restent dans l'épargne budgétisée), sous-ligne verte « Restant variables X » = `variableRemaining` (rouge s'il est négatif) ;
  - « Taux d'épargne » en % = `savingsRate` (taux réel du Budget), sous-ligne rouge « Objectif X % » = `settings.savingsRateTarget` (verte une fois l'objectif atteint) ;
  - « Épargne brute » = `grossSavings`, sous-ligne « Budgétisée » ;
  - « Épargne réelle » = `realSavings`, sous-ligne « <écart signé> vs brute » = réelle − brute, rouge s'il est négatif.
  Revenus à 0 : taux à 0 %.
- RG4. **Donut « Où va chaque euro de revenu »** : sept parts du revenu budgété, dans cet ordre, avec montant et % du revenu (une décimale, virgule) : Crédits, Variables, Épargnes, Reste à placer (colonne 1), Dépenses fixes, Enveloppes (allocations du mois), Investissements (colonne 2). Au centre : « Revenus » et son montant. Un reste à placer négatif n'est pas dessiné comme une part (il reste dans la légende, en rouge). Revenus à 0 : donut vide gris et « — » en pourcentage. Les lignes hors budget ne comptent pas (comportement existant).
- RG5. **Carte « Dépenses variables »** (en-tête teinté salmon, lien « Détail » vers le Budget) : grand chiffre vert = restant total (`variableRemaining`), « restant sur X € » = budget total des lignes `var` du budget. Une rangée par ligne `var` du budget : nom, barre (part consommée = réel / budget, plafonnée à 100 %), restant (`lineRemaining`, vert s'il est positif, rouge sinon, signé), bouton « + ». Barre rouge quand le restant est ≤ 0, saumon sinon.
- RG6. Bouton « + » d'une ligne variable : ajoute une dépense sans quitter la page, directement sur la ligne. Il ouvre la saisie rapide existante (composant `LineQuickEntry`, formulaire « Nouvelle écriture · <ligne> » : montant, jour, libellé, `addLineEntry`, spec 0019 RG21), même validation et même effet que sur le Budget : une vraie écriture (compte imposé par la ligne) qui alimente le réel de la ligne ; restant de la ligne, restant total et KPI se mettent à jour aussitôt. Entrée valide, clic à côté ferme sans rien écrire, montant ≤ 0 ou jour hors du mois : validation refusée. Absent sur un mois verrouillé ou non initialisé.
- RG7. **Carte « Enveloppes »** (en-tête teinté violet, lien « Détail » vers Enveloppes) : grand chiffre = solde cumulé de toutes les enveloppes (même total que l'en-tête du Budget, `EnvelopesTotal`), « solde cumulé · X € alloués ce mois » = somme de `monthAlloc`. Une rangée par enveloppe : pastille et barre dans la teinte de l'enveloppe, solde (`ledger.envMonth(...).balance`, comme la tuile du Budget), bouton « + » teinté. Barre = part consommée, comme les lignes variables : dépensé du mois / (solde réel actuel + dépensé), le solde réel étant celui de la tuile (départ + entrées − dépenses), plafonnée à 100 % ; rouge quand le solde est négatif.
- RG8. Bouton « + » d'une enveloppe : même principe que RG6, directement sur la ligne de l'enveloppe, sans quitter la page. Le même formulaire de saisie rapide (« Nouvelle écriture · <enveloppe> » : montant, jour, libellé) enregistre une dépense `env` sur le compte de l'enveloppe, identique à celle de l'écran Opérations (`addTransaction`) ; le solde de l'enveloppe, le solde cumulé et les alertes se mettent à jour. Le composant de saisie rapide est rendu réutilisable pour une enveloppe (voir Impact technique). Absent sur un mois verrouillé ou non initialisé.
- RG9. **Carte « Dépenses prévues sur l'année »** (lien « Détail » vers Prévisionnel) : 12 barres verticales janvier à décembre de l'année du mois choisi, montant au-dessus de chaque barre, mois en dessous (minuscules, sans point : jan, fév, mar, avr, mai, juin, juil, aoû, sep, oct, nov, déc). Hauteur proportionnelle au plus grand mois ; mois à 0 : barre minimale. Le mois choisi est mis en valeur (barre foncée, libellé en gras). En en-tête : « Total X € · moyenne Y € / mois » (total sur 12 mois, moyenne sur 12). Données : `planned` (prévisionnel annuel) de l'année, toutes enveloppes cumulées. Couleur : violet pâle pour tous les mois, violet vif pour le mois choisi (les autres teintes de la maquette n'ont pas de signification reprise).
- RG10. **Colonne « À faire ce mois-ci »**, trois types de lignes cliquables avec chevron, dans cet ordre, chacun absent s'il n'a rien à dire :
  1. une ligne par alerte d'enveloppe (`envelopeAlerts`) : texte « <Libellé> <prévu> prévu, il manque ~<manque> », sous-ligne « Enveloppe <nom> · prévu au budget annuel » ; fond orangé, pastille orange. Clic : écran Enveloppes ;
  2. « N virement(s) à effectuer » (pastille turquoise), sous-ligne « <total à virer> € · <faits> / <total> faits » : « faits » = lignes concernées pointées, « total » = lignes concernées du mois (RG14). Absent s'il n'y a rien à virer. Clic : Budget ;
  3. « N solde(s) de compte à saisir » (pastille grise), sous-ligne = noms séparés par des virgules. Sont à saisir les lignes `epa` et `inv` du mois (non archivées, comptes dans le budget) qui n'ont pas de solde saisi dans `statements` pour le mois choisi. Clic : écran Opérations, sur les soldes.
  Aucun des trois : message « Rien à faire ce mois-ci ».
- RG11. Les virements (RG10-2) sont : les lignes du mois d'épargne et d'investissement (hors « informatif », comptes dans le budget) et les allocations d'enveloppes supérieures à 0 ; à faire = non pointées, montant compté (`lineCounted` pour une ligne, l'allocation pour une enveloppe).
- RG12. **« Notes du mois »** (nouvelle donnée) : liste de notes du mois choisi, modifiables même sur un mois clôturé ou non initialisé, chacune avec case à cocher, texte (barré et grisé une fois cochée) et croix de suppression. Compteur « faites / total » en haut à droite (« 1 / 4 »). Champ « + Ajouter une note, puis Entrée » : Entrée ajoute la note en fin de liste ; texte vide (espaces compris) refusé sans message ; plus de 200 caractères (après retrait des espaces autour) refusé, sans troncature ni message (même limite que `normalizeDetail`). Cocher et supprimer écrivent tout de suite. Sans note : seul le champ d'ajout, compteur « 0 / 0 ». Les notes d'un mois ne sont pas copiées sur un autre.
- RG13. **« Patrimoine »** : total en grand = épargnes + investissements ; barre à deux segments proportionnels (violet épargnes, bleu investissements) ; deux lignes « Épargnes X € », « Investissements Y € ». Épargnes = somme des soldes de fin de mois (`ledger.accMonth`) des lignes `epa`, investissements = idem `inv` (hors lignes archivées, comptes dans le budget), au mois de référence de l'écran Objectifs. Total à 0 : barre grise.
- RG14. Sous Patrimoine, encart turquoise « Fond de secours » : pourcentage (`goalView('emergency')`), barre, sous-ligne « X € sur Y € · il reste Z € ». « À définir » (sans barre) si cible à 0 ou aucun compte coché.
- RG15. **« Objectifs annuels »** : trois lignes (Fond de secours, Investir <cible/1000>K, Taux d'épargne > <cible> %), chacune avec nom, % à droite (`goalView().pct`, une décimale) et barre fine (turquoise, turquoise, jaune). Cible non définie : « À définir ». Aucun lien d'écriture : clic sur le bloc ouvre Objectifs.
- RG16. Liens et chevrons : « Détail » des trois cartes (Budget, Enveloppes, Prévisionnel) et bloc Objectifs annuels (Objectifs) ouvrent l'écran concerné ; ils ne changent pas le mois.
- RG17. Les montants utilisent `money` et `percent`. L'écran n'est pas en lecture seule : ses seules écritures sont la saisie rapide d'une dépense sur une ligne variable ou une enveloppe (RG6, RG8) et les notes (RG12) ; elles passent par le mécanisme de sauvegarde existant. Sur un mois verrouillé (clôturé), les « + » sont absents ; les notes restent modifiables, même sur un mois clôturé ou non initialisé (la première note d'un mois non initialisé crée son enregistrement de mois sans l'initialiser).
- RG18. Navigation : l'entrée « Accueil » (icône maison) est la première de la barre latérale, l'écran actif à l'ouverture (hors assistant). L'entrée « Démarrage » reste masquée une fois le premier mois créé (comportement existant, conservé). Premier lancement (`firstMonth` null) : seul l'assistant est accessible, comme aujourd'hui.

## Parcours utilisateur
Nominal :
1. J'ouvre l'app : j'arrive sur le Tableau de bord, au mois mémorisé.
2. Je lis le reste à placer, le taux d'épargne et le donut ; je vois que Loisirs est dépassé (restant rouge).
3. Je clique « + » sur Alimentation, je saisis 12,50 € ; le restant d'Alimentation, le restant total et les KPI changent.
4. Dans « À faire », je vois une alerte sur Santé et « 1 virement à effectuer · 3 / 4 faits » ; je clique et arrive sur le Budget.
5. J'ajoute la note « Appeler la banque », je la coche, puis je la supprime.
6. Je change de mois : tout ce qui dépend du mois change, Patrimoine et Objectifs ne bougent pas.

Cas limites :
- Mois non initialisé (RG2), mois clôturé (pas de « + »), budget neuf (revenus 0, cibles à 0 : donut vide, « À définir »).
- Aucune ligne variable, aucune enveloppe, aucun prévu : cartes avec message vide (« Aucune dépense variable », « Aucune enveloppe », barres à zéro).
- Reste à placer négatif : valeur rouge, absent du donut (RG4).
- Note vide ou de plus de 200 caractères : refusée.

## Design
Source : maquette fournie par le développeur (`images/7.png`, écran « Tableau de bord » du 25/10/2026), fidèle à la charte Organic existante. La maquette complète la navigation : « Simulation » n'est pas reprise, les autres entrées de la barre latérale actuelle sont conservées.

Grille à 1440 px (zone principale, sidebar à gauche) : colonne gauche large (~ 930 px), colonne droite étroite (~ 380 px), gap 16 px, comme `budget-grid`.

```
 Tableau de bord        [<  Décembre 2026 v  >]
 ┌───────────────────────────────────────────────────┐ ┌─ À faire ce mois-ci ──┐
 │ Reste à placer │ Revenus │ Dépenses │ Taux │ Ép.br│ │ ● Dentiste …      [>] │
 │   2 950 €      │ 8 000 € │ 3 856 €  │ 51,8%│ 1194 │ │ ● 1 virement…     [>] │
 │ ┌─────┐  Où va chaque euro de revenu              │ │ ● 2 soldes …      [>] │
 │ │donut│  ● Crédits … ● Variables … | ● Fixes …    │ ├─ Notes du mois   1/4 ─┤
 │ └─────┘  ● Épargnes … ● Reste à placer …          │ │ ☐ note…            x  │
 └───────────────────────────────────────────────────┘ │ + Ajouter une note    │
 ┌─ Dépenses variables ─────┐ ┌─ Enveloppes ──────────┐ ├─ Patrimoine 31 239 € ─┤
 │ 201 € restant sur 910 €  │ │ 2 457 € solde cumulé  │ │ ▬▬▬▬▬▬▬▬▬▬ épargnes   │
 │ Alimentation ▬▬▬ 137 [+] │ │ Perso    ▬▬▬   294 [+]│ │ Fond de secours 60,8% │
 └──────────────────────────┘ └───────────────────────┘ ├─ Objectifs annuels ───┤
 ┌─ Dépenses prévues sur l'année ──── Total · moyenne ┐ │ 3 barres              │
 │ 12 barres jan. … déc.                              │ └───────────────────────┘
 └────────────────────────────────────────────────────┘
```

- Cartes : `panel` ; KPI : valeurs 21 px (« Reste à placer » en 36 px violet) séparées par un filet vertical ; sous-lignes 11 px (rouge pour l'écart défavorable, vert pour le favorable, gris sinon). Toutes les teintes viennent de `tone` / `HUE` et `toneVars`, rien de nouveau.
- Cartes Dépenses variables et Enveloppes : en-tête teinté (`block-head`), titre en gras, lien « Détail » (`btn-quiet`) à droite. Bouton « + » : disque 22 px teinté, comme `line-add`, visible en permanence.
- Alertes et tâches : lignes arrondies teintées (orange pour une alerte, turquoise pour les virements, gris pour les soldes) avec chevron, comme `alert-box`.
- Notes : cases arrondies `LineCheck`-like, croix discrète ; texte barré une fois cochée.
- Hauteur : la carte « Dépenses prévues sur l'année » s'étire sur toute la hauteur restante de la colonne gauche (la colonne est une grille ou un flex vertical, la carte prend `flex: 1`), pour que le bas de la colonne gauche s'aligne sur le bas de la colonne de droite ; les 12 barres occupent la hauteur disponible (la plus haute proportionnelle au plus grand mois) et les libellés de mois restent au bas de la carte.
- État ouvert d'un « + » : au clic, le formulaire de saisie rapide existant (`popmenu check-menu line-add-menu`, `backdrop` transparent pour fermer) s'ouvre à côté de la ligne, titre « Nouvelle écriture · <ligne ou enveloppe> », champs Montant (focus automatique, `0,00`), Jour (aujourd'hui dans le mois courant, sinon dernier jour d'un mois passé, 1er d'un mois futur), Libellé facultatif (prérempli par le nom), puis « Enregistrer » / « Fermer » (libellés du formulaire existant). Montant invalide : bouton « Enregistrer » inactif. À la validation, le formulaire se ferme et la ligne se met à jour ; la ligne reste sur place.
- Barres : `progress` existant ; donut en SVG écrit à la main (anneau 14 px, 7 parts, teintes cohérentes avec `HUE` : crédits et fixes `dep`, variables saumon, épargnes violet, enveloppes lavande, investissements bleu, reste à placer turquoise).
- États : chargé (maquette) ; mois non initialisé (`banner` + « — », contenu en `is-preview`) ; vides (messages en gris) ; erreur : pas d'état propre (la bannière d'erreur de sauvegarde existe déjà).
- Desktop 1440 px uniquement, français.

## Impact technique
Hors de l'existant (à signaler) : **notes du mois**, **donut**, **barres annuelles**, **saisie rapide d'une dépense d'enveloppe**, **liste « soldes à saisir »**, **entrée de navigation Accueil**.
- Domaine : `types.ts` gagne `MonthData.notes?: MonthNote[]` avec `MonthNote { id, text, done }` ; nouveau module pur `domain/dashboard.ts` (`dashboardView(data, ledger, month, today)`) qui assemble le bandeau, le donut, les lignes variables, les enveloppes, les 12 mois prévus, les tâches (alertes, virements, soldes), le patrimoine, les objectifs, en s'appuyant sur `monthSummary`, `goalView`, `envelopeAlerts`, `variableRemaining`, `lineCounted`, `lineCheck`, `isLate`, `planned`. Texte de note normalisé comme `normalizeDetail`.
- Application : `application/monthNotes.ts` (`addNote`, `toggleNote`, `deleteNote`) ; saisie rapide de ligne : `addLineEntry` existant (`application/quickEntry.ts`) ; saisie rapide d'enveloppe : nouvelle fonction `addEnvelopeEntry` dans `quickEntry.ts`, mêmes règles de validation, qui s'appuie sur `addTransaction` (type `env`, compte de l'enveloppe), sans nouveau port. Présentation : `LineQuickEntry` est généralisé (ou un composant frère partageant le formulaire) pour accepter une ligne ou une enveloppe, avec un bouton « + » visible en permanence sur l'écran (le Budget garde son icône au survol).
- Infrastructure / Supabase : persistance des notes : nouvelle table `month_notes` (`user_id`, `month`, `id`, `text`, `done`, `position`) avec RLS « own rows », migration dans `supabase/migrations/`, `supabaseRows.ts`, `supabaseSchema.ts`, `database.types.ts` régénéré, contrat du repository étendu ; lecture tolérante des anciennes données (notes absentes).
- Présentation : `screens/Dashboard.tsx` (et petits composants : donut, barres, notes), `Icon.tsx` (nouvelle icône maison dédiée ; `home` et l'icône du Budget inchangées), `App.tsx` (type `Screen`, entrée « Accueil » première, titre « Tableau de bord », écran d'ouverture, navigation depuis les chevrons), `app.css`.
- Doc : `README.md` et `docs/architecture.md` (écrans, module `dashboard`, notes du mois) ; [ADR 0023](../adr/0023-notes-du-mois-dans-une-table-month-notes.md) pour la table `month_notes`.

## Critères d'acceptation
Tests automatisés (T) pour le domaine, les cas d'usage et la persistance ; le reste vérifié par le reviewer dans l'app.
1. (T) Given un mois initialisé, When je calcule la vue, Then reste à placer, revenus, réel des revenus, épargne brute, épargne réelle, écart vs brute et restant variables égalent les valeurs des calculs existants du même mois (RG3).
2. (T) Given des revenus à 0, Then le taux vaut 0 % et le donut est vide (RG3, RG4).
3. (T) Given un mois, Then les parts du donut sont celles de la légende (crédits, variables, épargnes, reste à placer, fixes, enveloppes, investissements), leurs % sont rapportés aux revenus, et un reste à placer négatif n'est pas dessiné (RG4).
4. (T) Given des lignes variables, Then chaque rangée porte nom, part consommée plafonnée à 100 %, restant signé de `lineRemaining` ; une ligne hors budget n'y figure pas ; le total « restant sur X » est le budget des lignes `var` du budget (RG5).
5. (T) Given des enveloppes, Then la vue donne solde cumulé, total alloué du mois, et par enveloppe son solde et sa part par rapport au plus grand (RG7).
6. (T) Given des `planned` sur plusieurs mois, Then les 12 mois de l'année du mois choisi ont leur total, le total annuel et la moyenne (total / 12) sont corrects, et le mois choisi est repéré (RG9).
7. (T) Given une alerte d'enveloppe, Then la tâche reprend le prévu et le manque de `envelopeAlerts` ; sans alerte, aucune tâche de ce type (RG10).
8. (T) Given des lignes d'épargne, d'investissement et des allocations d'enveloppes dont certaines sont pointées, Then « à effectuer » = les non pointées, avec le total à virer et « faits / total » ; lignes « informatif », comptes hors budget et allocations à 0 sont exclus (RG10, RG11).
9. (T) Given les notes d'un mois, When j'ajoute une note, la coche, la décoche, la supprime, Then la liste et le compteur « faites / total » suivent ; texte vide ou > 200 caractères refusé (non tronqué) ; les notes d'un mois ne se retrouvent pas dans un autre (RG12).
10. (T) Given des notes enregistrées puis rechargées via le repository (mémoire et Supabase), Then elles sont restituées ; absentes dans d'anciennes données, aucun plantage (contrat du repository).
11. (T) Given des soldes d'épargne et de placement, Then Patrimoine = épargnes + investissements, la barre est proportionnelle, et le fonds de secours reprend `goalView('emergency')` (valeur, cible, reste) (RG13, RG14).
12. (T) Given une cible à 0, Then Fonds de secours et l'objectif concerné sont « À définir », sans barre (RG14, RG15).
13. Given l'app ouverte avec un premier mois, Then l'écran actif est « Tableau de bord », l'entrée « Accueil » (icône maison) est la première de la navigation, et le sélecteur de mois est celui du Budget (RG1, RG18).
14. Given l'écran, Then la mise en page correspond à la maquette : bandeau de 6 chiffres, donut et légende à 2 colonnes, deux cartes côte à côte, 12 barres, colonne droite à 4 cartes, sans débordement à 1440 px.
15. Given un « + » sur une ligne variable, When je saisis et valide, Then une écriture est créée (même effet que sur le Budget) et les chiffres de l'écran se mettent à jour ; absent sur un mois clôturé (RG6, RG17).
16. (T pour `addEnvelopeEntry`) Given un « + » sur une enveloppe, When je saisis un montant valide et valide, Then une dépense `env` est créée sur le compte de l'enveloppe, son solde et le solde cumulé baissent du montant ; montant ≤ 0, jour hors du mois ou mois verrouillé : refusé (RG8).
17. Given l'écran, Then la carte « Dépenses prévues sur l'année » s'étire jusqu'au bas de la colonne gauche, alignée sur le bas de la colonne de droite.
18. Given un mois non initialisé, Then la bannière et les « — » apparaissent, et Patrimoine / Objectifs restent affichés (RG2).
19. Given les liens « Détail » et les chevrons, Then l'écran source s'ouvre sans changer le mois (RG16).
20. Given les modifications de l'écran (écriture, note), Then l'indicateur de sauvegarde passe à « Enregistrement… » puis « Enregistré » (RG17).

## Questions ouvertes
Aucune. Toutes les questions de cadrage ont été tranchées par le développeur :
1. KPI : option A, les calculs du Budget sont conservés ; les chiffres de la maquette sont des exemples.
2. Notes : par mois, table Supabase `month_notes` avec migration ; modifiables aussi sur un mois clôturé ou non initialisé.
3. Soldes à saisir : lignes d'épargne et d'investissement du mois sans solde saisi (`statements`) ; le clic ouvre l'écran Opérations, sur les soldes.
4. « + » d'une enveloppe : dépense de l'enveloppe.
5. Barres d'enveloppes : proportionnelles au plus grand solde.
6. Barres annuelles : violet pâle, violet vif pour le mois choisi.
7. Notes sur mois verrouillé ou non initialisé : voir 2.
8. « Simulation » : hors périmètre.
9. et 10. Navigation : toutes les entrées et libellés actuels conservés, « Accueil » en première position avec une icône maison dédiée ; icône et libellé « Budget » inchangés. Chevrons : alertes vers Enveloppes, virements vers Budget, soldes vers Opérations.
11. Patrimoine et fonds de secours : au mois de référence de l'écran Objectifs.

### Historique des questions posées (pour mémoire)
1. **Définitions des KPI**. Les chiffres de la maquette ne correspondent pas aux calculs actuels du Budget : (a) « Dépenses » = 3 856 € inclut les allocations d'enveloppes (866 €), alors que le Budget les compte dans l'épargne budgétisée (Dépenses = crédits + fixes + variables = 2 990 € ici) ; (b) « Taux d'épargne » 51,8 % = (épargne brute + reste à placer) / revenus, alors que le Budget calcule le taux d'épargne réel (épargne réelle / revenus, ici 7,1 %) et affiche le brut à part. Options : (A) garder les calculs du Budget et les mêmes chiffres que lui sur ce nouvel écran (recommandé : un chiffre ne change pas d'un écran à l'autre) ; (B) adopter les définitions de la maquette sur le tableau de bord seulement (l'écran affiche alors des chiffres différents de ceux du Budget) ; (C) adopter les définitions de la maquette partout (modifie le Budget et la spec 0025, hors périmètre).
2. **Notes du mois : persistance**. Nouvelle donnée, donc migration Supabase. Notes propres à chaque mois (recommandé, comme la maquette « Notes du mois »), ou une seule liste reportée d'un mois à l'autre ? Stockage : nouvelle table `month_notes` (recommandé), ou colonne `notes` (jsonb) sur la table des mois ? Ordre : celui de création, sans réordonner ?
3. **« Soldes de compte à saisir »** (« Vacances copines, Trade Republic » dans la maquette, ce sont des noms d'épargne / placement). Quel suivi existant ? Options : (a) lignes `epa` / `inv` du mois sans solde de relevé saisi dans `statements` (suivi des épargnes et placements, que tu saisis à la clôture) ; (b) comptes bancaires sans relevé (`accountBalances`, « Solde relevé » du pointage). Recommandation : (a), éventuellement (b) en plus. Et clic : vers quel écran (Comptes, Clôture, Budget) ?
4. (Tranchée par le développeur, RG6 et RG8) Les « + » ajoutent une dépense sans quitter la page, directement sur la ligne variable ou l'enveloppe, avec la saisie rapide existante. Reste à confirmer : pour une enveloppe, la dépense est bien une dépense `env` (pas une alimentation de l'enveloppe) ?
5. **Barre d'une enveloppe** : proportionnelle au plus grand solde (déduit de la maquette : Impôts a la barre la plus longue, Santé la plus courte) : OK ? Autre option : solde / (solde de début + allocation).
6. **Couleur des barres « Dépenses prévues sur l'année »** : la maquette montre des teintes différentes (septembre orange, octobre violet foncé, décembre violet vif). Qu'expriment-elles ? Options : (a) violet pâle pour tous les mois et violet vif pour le mois choisi, le reste sans signification ; (b) couleur selon le niveau de la dépense (par exemple orange au-dessus de la moyenne) ; (c) autre règle de ta part. Recommandation : (a).
7. **Notes et mois verrouillé / non initialisé** : peut-on ajouter, cocher et supprimer des notes sur un mois clôturé (recommandé : oui, ce sont des notes personnelles) et sur un mois non initialisé (recommandé : oui, elles ne dépendent pas des lignes, ce qui oblige à créer le `MonthData` à la première note) ?
8. **« Simulation »** (flacon dans la barre latérale de la maquette) : l'écran n'existe pas dans l'app. Hors périmètre (aucune entrée ajoutée, recommandé), ou à ajouter comme entrée « bientôt disponible » comme « Placements » ?
9. **Barre latérale** : la maquette montre Accueil, Budget, Dépenses, Enveloppes, Simulation, Prévisionnel, Démarrage, Clôture, Objectifs, Placements, sans « Comptes » ni « Modèle », et « Dépenses » à la place de « Opérations ». Recommandation : garder toutes les entrées actuelles et leurs libellés (Budget, Opérations, Comptes, Enveloppes, Prévisionnel, Modèle, Objectifs, Placements bientôt, Démarrage, Clôture) et seulement ajouter « Accueil » en première position. Tu confirmes, ou la maquette fait foi (renommer Opérations en Dépenses, retirer Comptes et Modèle) ?
10. **Icône du Budget et libellé** : la maquette change l'icône de « Budget » (portefeuille). Aujourd'hui `budget` est l'icône de l'entrée Budget et la maison (`home`) sert déjà aux « Dépenses fixes » du Budget. Recommandation : ajouter une icône « maison » dédiée à l'Accueil (ne touche pas `home`) et garder l'icône et le libellé « Budget » inchangés. OK ? Et destinations des chevrons de « À faire » : alerte → Enveloppes, virements → Budget, soldes → voir la question 3.
11. **Patrimoine et fonds de secours** : au mois de référence de l'écran Objectifs (comme les objectifs, recommandé), ou au mois choisi dans le sélecteur ?
