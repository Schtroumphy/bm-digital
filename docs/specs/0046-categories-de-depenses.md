# 0046 — Catégories de dépenses

- Statut : validée
- Date : 2026-11-05
- Branche prévue : feat/categories_depenses

## Contexte et objectif
Le développeur veut savoir dans quoi il dépense le plus. Chaque dépense peut recevoir une catégorie (Alimentation, Logement…). Un nouvel onglet « Catégories » permet de gérer la liste des catégories et de voir, mois par mois, la répartition des dépenses par catégorie.

À ne pas confondre avec `Transaction.category` : c'est le texte libre du fichier Linxo, conservé à titre d'information (spec 0013, RG37). Il reste inchangé et n'est ni réutilisé ni migré. La catégorie de cette spec est un champ distinct, propre à l'application.

## Périmètre
Inclus :
- Liste de catégories gérée par le développeur : ajout, renommage, suppression (si inutilisée). Liste par défaut au premier chargement.
- Choix de la catégorie d'une dépense : formulaire de saisie et d'édition, et classement groupé de plusieurs écritures.
- Import CSV : l'assistant propose une catégorie par ligne ; les règles mémorisées retiennent aussi la catégorie.
- Onglet « Catégories » : section « Gérer » et section « Répartition du mois ».

- Détail des écritures d'une catégorie, déplié dans la répartition (RG28).

Exclus :
- Archivage ou fusion de catégories.
- Vue multi-mois ou annuelle de la répartition, comparaison avec un autre mois (spec suivante possible).
- Ventilation d'une dépense sur plusieurs catégories.
- Migration du texte Linxo vers les catégories.
- Édition de la couleur d'une catégorie.

## Règles de gestion
Catégories :
- RG1. Une catégorie a un identifiant stable et un nom. Le nom est obligatoire, rogné, de 40 caractères au plus, et unique sans tenir compte de la casse ni des accents. Un doublon est refusé avec un message.
- RG2. Liste par défaut, créée quand les données n'ont encore aucune liste de catégories : Alimentation, Logement, Transport, Loisirs, Santé, Abonnements, Autres. Une fois créée, elle n'est plus recréée, même si le développeur la vide (la liste vide est distincte de l'absence de liste).
- RG3. Chaque catégorie a une teinte attribuée automatiquement à la création, non modifiable et conservée au renommage. Les teintes se répartissent pour que deux catégories voisines de la liste se distinguent.
- RG4. Ajout et renommage sont possibles à tout moment, y compris quand des mois sont clôturés (ils ne modifient aucun mois). Renommer ne change aucune association (elle se fait par identifiant).
- RG5. Suppression : autorisée uniquement si aucune écriture n'est associée à la catégorie, tous mois confondus (clôturés compris). Sinon le bouton est désactivé avec l'explication « Utilisée par N dépense(s) » ; aucune suppression forcée, aucun archivage, aucune fusion. La suppression demande une confirmation.

Association à une dépense :
- RG6. Une écriture porte au plus une catégorie (`categoryId`). Absente = « Sans catégorie ». La catégorie est facultative.
- RG7. Sont catégorisables les écritures de types `var`, `env`, `fix` et `epd`. Les autres types (`epa`, `rev`, `envin`, `accin`), les transferts (`AccountMovement`) et les ajustements ne le sont pas. Une entrée `envin` ne porte donc jamais de catégorie.
- RG8. Une dépense affectée à un compte d'épargne ou hors budget (specs 0028, 0031) peut porter une catégorie, mais n'est pas comptée dans la répartition (RG17).
- RG9. Les dépenses existantes n'ont aucune catégorie (« Sans catégorie »). Aucune migration automatique, le texte Linxo n'est pas utilisé.
- RG10. Mois clôturé : la catégorie d'une dépense d'un mois clôturé n'est modifiable qu'après « Rouvrir le mois » (mécanisme existant, `monthClosing`). Le classement groupé (RG12) ignore les mois clôturés et le dit. Aucune exception.
- RG11. Le choix de la catégorie est une liste déroulante dans le formulaire de saisie et d'édition d'une écriture, avec en premier choix « Sans catégorie ». Elle n'apparaît que pour les types de RG7.
- RG12. Classement groupé : l'utilisateur sélectionne plusieurs écritures catégorisables (cases à cocher dans la liste de l'écran Saisie), choisit une catégorie (ou « Sans catégorie ») et applique. Une seule action ; toutes les écritures sélectionnées reçoivent la catégorie. Les écritures non catégorisables ou d'un mois clôturé sont refusées, avec message du nombre ignoré.

Import CSV :
- RG13. Dans l'assistant d'import, chaque ligne de nature `depense` ou `externe` (et celles qui deviennent un type de RG7) propose une liste déroulante de catégorie, vide par défaut. La catégorie choisie est portée par l'écriture créée. Elle ne fait pas partie de l'empreinte de la ligne (spec 0013, RG20, RG21).
- RG14. Une règle mémorisée « libellé contient X » (spec 0013, RG18) retient aussi la catégorie choisie. Quand une règle s'applique à une ligne, la catégorie de la règle est présélectionnée, modifiable. Une règle existante sans catégorie présélectionne « Sans catégorie ». Si la catégorie d'une règle est supprimée, la règle perd sa catégorie (cas rare, une règle seule ne compte pas comme « utilisée » pour RG5).

Répartition du mois :
- RG27. L'écran « Catégories » a deux sous-onglets (style des onglets de l'app, role tablist/tab/tabpanel, flèches ← → pour passer de l'un à l'autre) : « Répartition » (ouvert par défaut) et « Gérer ». Le dernier sous-onglet n'est pas mémorisé. Aucune règle métier ne change.
- RG15. Section « Répartition du mois » (sous-onglet « Répartition ») avec un sélecteur de mois (flèches ‹ › et libellé, mêmes mois que le reste de l'app, par défaut le mois en cours ou le dernier mois géré).
- RG16. Le total par catégorie est la somme, pour le mois budgétaire de l'écriture (`month`, pas la date bancaire), des montants bruts des écritures de RG7 portant cette catégorie. Les entrées d'argent (`envin`) ne sont jamais comptées : la catégorie d'une dépense d'enveloppe affiche son montant brut, sans déduction (décision du développeur, lecture stricte de H3).
- RG17. Sont exclues du calcul les écritures affectées à l'épargne ou hors budget, comme dans tous les chiffres du budget.
- RG18. Affichage : catégories triées par montant décroissant (égalité : ordre alphabétique). Pour chacune : pastille de teinte, nom, montant, part en % du total des dépenses du mois (une décimale, virgule), nombre d'écritures, et une barre proportionnelle. Une ligne « Sans catégorie » est affichée en fin de liste si son montant n'est pas nul, grisée. Les catégories à 0 sont masquées de la répartition (elles restent dans « Gérer »).
- RG19. En tête de la section : total des dépenses du mois, et nombre d'écritures sans catégorie (avec lien pour les retrouver dans Saisie, si le filtre existant le permet ; sinon simple texte).
- RG20. Mois non initialisé, futur, ou sans aucune dépense : état vide « Aucune dépense pour <mois> ». Un mois clôturé est consultable normalement.
- RG21. La section « Gérer » affiche chaque catégorie avec sa pastille, son nom, le nombre de dépenses associées (tous mois), un bouton « Renommer » et un bouton « Supprimer » (RG5), plus un champ d'ajout.
- RG22. La répartition est en lecture seule. Elle se met à jour dès qu'une dépense, une catégorie ou un mois change.
- RG24. Tableau des opérations (écran Saisie / Opérations) : une colonne « Catégorie » affiche pour chaque écriture catégorisable (RG7) une pastille colorée (teinte de la catégorie, comme dans l'écran Catégories et le camembert ; pastille grise « Sans catégorie »), qui ouvre au clic la liste des choix (« Sans catégorie » en premier, sans boîte blanche ni flèche) et change la catégorie immédiatement, sans ouvrir le formulaire d'édition. Les écritures non catégorisables affichent « — ». Sur un mois clôturé (RG10), la liste est désactivée avec l'infobulle « Rouvrir le mois pour modifier ». Elle remplace l'étiquette de catégorie qui était affichée dans la colonne Imputation.
- RG25. Camembert (anneau SVG, sans dépendance) dans « Répartition du mois », à gauche de la liste qui lui sert de légende (nom, montant, %, pastille de même teinte). Il lit les mêmes données que la liste (`categoryBreakdown`) pour le mois du sélecteur de l'en-tête, courant par défaut : mêmes tris, « Sans catégorie » grisée en dernier, catégories à 0 absentes. Texte alternatif listant chaque part ; infobulle par part. Mois sans dépense : « Aucune dépense pour <mois> » et pas de camembert.
- RG26. Filtre « Sans catégorie » (case à cocher dans « Affichage » du tableau des opérations) : n'affiche que les écritures catégorisables (RG7) qui n'ont pas de catégorie. Les écritures non catégorisables (entrées d'argent `rev`, `envin`, `accin`, sorties d'épargne `epa`) n'y figurent jamais. Il se combine avec les autres filtres et avec le mois affiché. Le lien de RG19 reste un simple texte.
- RG28. Le camembert et la liste de répartition sont interactifs. Survol d'une part : infobulle (nom, montant, %) et mise en évidence de la part, les autres s'atténuent ; la ligne correspondante de la liste est mise en évidence, et inversement (survol ou focus d'une ligne : la part). Clic sur une part ou sur une ligne : déplie sous la ligne le détail des écritures de la catégorie pour le mois affiché (date, libellé, montant, plus récentes d'abord ; « Sans catégorie » comprise), un nouveau clic referme. Une seule ligne est dépliée à la fois ; le changement de mois referme tout. Mêmes écritures que le calcul de la répartition (RG16, RG17) : leur somme égale le montant de la ligne. Clavier : chaque ligne est un bouton (Entrée ou Espace déplie, `aria-expanded`, focus visible) et sert d'équivalent clavier aux parts. L'ouverture de l'onglet Opérations filtré n'est pas retenue.
- RG23. Desktop 1440 px uniquement, textes en français, montants au format euro de l'app. Accessibilité : barres avec texte équivalent (montant et %), boutons nommés.

## Parcours utilisateur
Nominal :
1. Le développeur ouvre « Catégories » : les 7 catégories par défaut sont listées.
2. Il ajoute « Cadeaux », la renomme « Cadeaux et fêtes ».
3. Dans Saisie, il crée une dépense variable, choisit « Alimentation » dans la liste.
4. Il retourne dans « Catégories », choisit le mois : « Alimentation » apparaît avec son montant, sa part et sa barre.
5. Il sélectionne 12 écritures dans Saisie, choisit « Transport », applique : les 12 passent en « Transport ».
6. À l'import CSV, une ligne « CARREFOUR » est présélectionnée « Alimentation » grâce à la règle mémorisée.

Cas limites :
- Supprimer une catégorie utilisée : bouton désactivé « Utilisée par 8 dépense(s) ».
- Dépense d'un mois clôturé : le sélecteur de catégorie est désactivé avec « Rouvrir le mois pour modifier » ; après réouverture il est modifiable.
- Nom en double (« alimentation ») : refusé.
- Vider toute la liste : la liste par défaut n'est pas recréée ; les dépenses restent « Sans catégorie ».
- Dépense hors budget catégorisée : n'apparaît pas dans la répartition.

## Design
Design proposé, à valider (aucune maquette existante). Composants et tokens à réutiliser : cartes, boutons, champs et sélecteur de mois de `src/presentation/ds/organic.css` et `src/presentation/components/` ; teintes comme celles des enveloppes.

```
Catégories                      (sélecteur de mois global de l'en-tête : ‹  Novembre 2026  ›)
  [ Répartition ]  [ Gérer ]            ← sous-onglets (un seul visible à la fois)
┌─ Sous-onglet Répartition : Répartition du mois ───────────────────────────────────────────────────┐
│ Dépenses du mois : 1 842,30 €     14 écritures sans catégorie           │
│  ◔ anneau (survol : part + ligne en évidence ; clic : détail)           │
│ ● Alimentation      612,40 €   33,2 %  (21)  ████████████░░░░░░         │
│ ▾ Logement          540,00 €   29,3 %  ( 2)  ██████████░░░░░░░░         │
│      05/11  Loyer ........................... 540,00 €  (ligne dépliée)  │
│ ● Transport         238,90 €   13,0 %  ( 9)  █████░░░░░░░░░░░░░         │
│ ○ Sans catégorie     91,00 €    4,9 %  (14)  ██░░░░░░░░░░░░░░░░ (gris) │
└─────────────────────────────────────────────────────────────────────────┘
┌─ Sous-onglet Gérer ─────────────────────────────────────────────────────────────────┐
│ [ Nouvelle catégorie…            ] [Ajouter]                            │
│ ● Alimentation   21 dépenses   [Renommer] [Supprimer ⛔ désactivé]      │
│ ● Santé           0 dépense    [Renommer] [Supprimer]                   │
└─────────────────────────────────────────────────────────────────────────┘
```
États :
- Vide : « Aucune dépense pour novembre 2026 » (répartition) ; « Aucune catégorie, ajoutes-en une » (gérer, liste vidée).
- Chargé : comme ci-dessus.
- Erreur : message sous le champ d'ajout (nom vide, doublon, trop long) ; message de refus de suppression.
- Édition : le nom devient un champ avec « Enregistrer » / « Annuler » (Entrée valide, Échap annule).
- Saisie : liste déroulante « Catégorie » dans le formulaire d'écriture ; case à cocher par ligne et barre d'action « Classer N écritures : [Catégorie ▾] [Appliquer] » en classement groupé.
- Import : colonne « Catégorie » (liste déroulante) dans chaque ligne importée.

## Hypothèses à valider
Le développeur n'a pas tranché ces points ; ils reprennent les recommandations du PA et sont à valider.
- H1 (5). Une seule catégorie par écriture, pas de ventilation. Une dépense multi-lignes (spec 0045) porte la catégorie de chaque écriture créée ; aucun lien particulier avec 0045 n'est prévu.
- H2 (9). Catégorie non modifiable sur un mois clôturé sans le rouvrir ; création et renommage toujours possibles ; répartition d'un mois clôturé consultable.
- H3 (11). Répartition calculée par mois budgétaire (`month`), en montants bruts : les entrées `envin` ne sont ni catégorisables ni déduites (confirmé par le développeur) ; mois non initialisé ou futur vide.
- H4 (12, corrigée). Le dépôt n'enregistre pas `BudgetData` comme un document JSON mais table par table : une migration est nécessaire (table `categories`, colonnes `transactions.category_id`, `import_rules.category_id`, `settings.categories_initialized`), voir [ADR 0039](../adr/0039-categories-de-depenses-table-dediee.md).

## Impact technique
Domaine : `Category { id, name, hue }` ; `Transaction.categoryId?` ; `BudgetData.categories?` (absent = pas encore initialisé, liste par défaut RG2) ; `ImportRule.categoryId?` ; fonction de répartition d'un mois (somme par catégorie, exclusions RG17), règles de nom (RG1) et de suppression (RG5) ; contrôle du mois clôturé (RG10).
Application : actions ajouter, renommer, supprimer une catégorie ; affecter une catégorie à une écriture et à une sélection ; ajout de la catégorie à l'import et aux règles mémorisées. Ports : aucun nouveau, mais le dépôt convertit `BudgetData` en lignes table par table (voir H4).
Infrastructure : conversion lignes ↔ domaine étendue (`supabaseRows.ts`, `supabaseSchema.ts`, `database.types.ts`) ; champs optionnels, donc lecture rétrocompatible.
Présentation : nouvel écran « Catégories » et entrée de menu ; modification du formulaire d'écriture et de la liste de Saisie (cases à cocher, barre d'action) ; assistant d'import (colonne catégorie).
Schéma Supabase : migration `20261105180000_categories.sql` (appliquée), voir H4.

## Critères d'acceptation
Les cas marqués (T) seront couverts par un test automatisé (domaine ou application).
- CA1 (T). Given des données sans liste de catégories, When elles sont chargées, Then les 7 catégories par défaut existent, chacune avec une teinte ; Given la liste vidée par l'utilisateur, When on recharge, Then elle reste vide.
- CA2 (T). Given une catégorie « Santé », When j'ajoute « sante » ou « SANTÉ », Then l'ajout est refusé ; When j'ajoute un nom vide ou de plus de 40 caractères, Then il est refusé.
- CA3 (T). Given une catégorie utilisée par 1 dépense, When je tente de la supprimer, Then elle reste ; Given une catégorie sans dépense, When je la supprime après confirmation, Then elle disparaît.
- CA4 (T). Given une catégorie associée à une dépense, When je la renomme, Then la dépense garde l'association et la teinte ne change pas.
- CA5 (T). Given une dépense `var`, `env`, `fix` ou `epd`, When je choisis une catégorie, Then elle est enregistrée ; Given une écriture `rev` ou un virement, Then aucune catégorie n'est proposée ni acceptée.
- CA6 (T). Given une dépense d'un mois clôturé, When je tente de changer sa catégorie, Then c'est refusé ; When le mois est rouvert, Then c'est accepté.
- CA7 (T). Given 5 écritures sélectionnées dont 1 d'un mois clôturé et 1 non catégorisable, When j'applique « Transport », Then 3 sont modifiées et le message indique 2 ignorées.
- CA8 (T). Given un mois avec des dépenses réparties sur 3 catégories et sans catégorie, When j'ouvre la répartition, Then les totaux par catégorie sont corrects, triés par montant décroissant, les % somment 100 % du total du mois, et « Sans catégorie » est en fin de liste.
- CA9 (T). Given une dépense hors budget ou affectée à l'épargne portant une catégorie, When je consulte la répartition, Then elle n'est pas comptée.
- CA10 (T). Given une dépense d'enveloppe de 50 € catégorisée et une entrée `envin` de 20 € de la même enveloppe, When je consulte la répartition, Then la catégorie de la dépense affiche 50 € (montant brut) et l'entrée `envin` n'est ni catégorisable ni comptée (voir H3).
- CA11. Given un mois futur, non initialisé ou sans dépense, When je le sélectionne, Then « Aucune dépense pour <mois> » s'affiche sans erreur.
- CA12 (T). Given l'import d'une ligne dont le libellé correspond à une règle mémorisée avec catégorie, When j'ouvre l'assistant, Then la catégorie est présélectionnée ; When je valide, Then l'écriture porte la catégorie et la règle l'a retenue ; l'empreinte de la ligne est inchangée.
- CA13 (T). Given une règle dont la catégorie est supprimée, When on l'applique, Then la ligne est présélectionnée « Sans catégorie ».
- CA14. Given les dépenses existantes avant la fonctionnalité, When je les ouvre, Then elles sont « Sans catégorie » et le champ Linxo est intact.
- CA16 (T). Given une dépense `var` dans le tableau des opérations, When je change la catégorie dans la liste en ligne, Then seule sa catégorie change (montant, libellé, date, compte inchangés) ; Given une entrée `rev`, Then aucune liste n'est proposée (« — ») et le changement est refusé ; Given un mois clôturé, Then la pastille n'est pas interactive (infobulle « Rouvrir le mois pour modifier ») et le changement refusé.
- CA17 (T). Given un mois de dépenses réparties sur 3 catégories et sans catégorie, When j'ouvre la répartition, Then les parts du camembert suivent l'ordre de la liste, couvrent 100 % du cercle, une part grise « Sans catégorie » est en dernier ; Given un mois sans dépense, Then aucune part.
- CA18 (T). Given un mois avec des dépenses `var`, `fix`, `env` sans catégorie, une dépense catégorisée, une entrée `rev` et une entrée `envin`, When j'active le filtre « Sans catégorie », Then seules les dépenses sans catégorie sont listées.
- CA19. Given l'écran « Catégories », When je l'ouvre, Then « Répartition » est actif et seul son contenu est visible ; When je clique « Gérer » ou j'appuie sur →, Then la gestion s'affiche, `aria-selected` suit l'onglet actif.
- CA20 (T). Given une catégorie avec 3 écritures comptées, une hors budget et une entrée `envin` dans le mois, When je déplie sa ligne, Then les 3 écritures sont listées (date, libellé, montant), leur somme égale le montant de la ligne ; When je survole la part ou la ligne, Then l'autre est mise en évidence.
- CA15. Given l'écran « Catégories » en 1440 px, Then il est entièrement lisible, en français, avec le design proposé validé.

## Questions ouvertes
Aucune. Hypothèses H1 à H4 validées par le développeur (H3 en lecture stricte, H4 corrigée).
