# 0001 — Initialisation du budget (assistant « Démarrage »)

- Statut : implémentée
- Date : 2026-10-20
- Branche prévue : feat/initialize_budget

## Contexte et objectif

Aujourd'hui l'application démarre avec un jeu de démonstration (décembre 2026, `seedData`) et un mois s'initialise seulement par un bandeau « Appliquer le modèle de budget ». Le design mis à jour (`design/project/Budget Perso.dc.html`, écran `setup`) ajoute un onglet « Démarrage » : un assistant en plusieurs étapes qui crée le tout premier mois du budget (lignes, montants mensuels, soldes de départ). L'application doit démarrer vide, sans donnée de démonstration.

## Périmètre

Inclus :
- Nouvelle entrée « Démarrage » dans la barre latérale et écran associé (assistant en 8 étapes).
- Création du premier mois à partir des saisies de l'assistant.
- Démarrage de l'application sans données de démonstration.
- Persistance via le `localRepository` existant (Supabase, authentification et migration : spec séparée).

Exclus :
- Budget sans détail de dépenses : voir Questions ouvertes, rien n'est traité.
- Authentification Supabase (préalable à cette feature) et migration des données `localStorage` existantes.
- Capital restant dû des crédits (ignoré pour l'instant ; la colonne est retirée de l'écran).
- Historique antérieur au premier mois (relevés, historique d'enveloppes).

## Règles de gestion

Étapes (ordre du design) : 1 Période, 2 Revenus, 3 Crédits et dettes, 4 Dépenses, 5 Épargnes, 6 Enveloppes, 7 Investissements, 8 Récapitulatif.

- RG1. L'onglet « Démarrage » est une entrée de la barre latérale, entre « Prévisionnel » et « Clôture ». Son titre d'écran est « Initialisation ». Le sélecteur de mois et d'année du header est masqué sur cet écran.
- RG2. Le header de l'écran affiche « Tout vider » (remet l'assistant à zéro, à l'étape 1) et « Remplir avec un exemple » (pré-remplit les listes avec des données d'exemple et passe à l'étape 2).
- RG3. L'écran est découpé en une colonne d'étapes à gauche (« Mise en route ») et le contenu de l'étape à droite. Cliquer une étape y accède directement. Boutons « Précédent » (désactivé à l'étape 1) et « Continuer » en bas.
- RG4. Chaque étape affiche un état : coche si terminée, numéro sinon. Sous-titre : « Vide » ou « N ligne(s) · total » ; pour l'étape 1, le mois choisi ; pour la 8, « À valider » puis « Budget créé ».
- RG5. Étape 1 « Période » : l'utilisateur choisit le premier mois du budget dans une liste de mois allant du mois courant moins 1 an au mois courant plus 1 an (passés compris). Le design montre 6 puces fixes, remplacées par cette liste. Les soldes saisis sont ceux du 1er jour de ce mois. Trois cartes d'introduction (Lignes du budget, Soldes de départ, Reste à placer).
- RG6. Étapes 2 à 7 : un tableau éditable par étape, avec les colonnes ci-dessous. Ajout d'une ligne (« Ajouter … »), suppression par la croix, total par colonne monétaire.
  - Revenus : Nom, Montant mensuel.
  - Crédits et dettes : Nom, Mensualité (sans la colonne « Capital restant dû » du design).
  - Dépenses : Nom, Type (Fixe ou Variable), Budget mensuel.
  - Épargnes : Nom, Horizon (LT ou MT), Solde au départ, Versement mensuel.
  - Enveloppes : Nom, Solde au départ, dont espèces, Alloué par mois.
  - Investissements : Nom, Solde au départ, Versement mensuel.
- RG7. Une étape sans ligne affiche un état vide avec deux actions : « Ajouter les lignes suggérées » (liste de suggestions propre à l'étape) et « Ligne vide ». Les étapes Crédits et dettes peuvent rester vides (« Passe cette étape si tu n'en as pas »).
- RG8. Enveloppes : « dont espèces » ne peut pas dépasser « Solde au départ ». En cas de dépassement, la cellule est signalée en rouge et le message « La part en espèces dépasse le solde sur une enveloppe. » s'affiche en bas.
- RG9. Étape 8 « Récapitulatif » : deux cartes. « Chaque mois » : Revenus, Crédits et dettes, Dépenses fixes et variables, Épargnes et investissements, Enveloppes allouées, Reste à placer (vert si ≥ 0, rouge sinon). « Soldes au 1er <mois> » : Épargnes, Enveloppes, Investissements, Total de départ. Les étapes vides sont listées (« Étapes vides : … »).
- RG10. Le bouton de l'étape 8 est « Créer le budget de <mois> ». À la validation, le mois choisi devient initialisé avec les lignes saisies ; les soldes de départ deviennent les soldes du 1er jour du mois ; `firstMonth` est ce mois. Un message de succès s'affiche : « Budget créé. Les lignes et les soldes de départ sont enregistrés. » avec le lien « Ouvrir le budget mensuel » vers l'écran Budget.
- RG11. Démarrage sans donnée : sans budget enregistré, l'application n'utilise plus `seedData` et redirige automatiquement vers l'onglet « Démarrage » tant que le premier mois n'est pas créé.
- RG12. Le mois cible est choisi dans l'onglet. Tant qu'aucun budget n'existe, tout mois de la liste est autorisé (RG5). Une fois `firstMonth` défini, un mois futur est autorisé et un mois antérieur à `firstMonth` ne l'est pas.
- RG13. Si le mois cible est déjà initialisé, la validation demande confirmation : « Remplacer les lignes de <mois> ? Les montants réels saisis seront effacés. »
- RG14. Les montants se saisissent au format français (virgule), affichés en euros.
- RG15. L'onglet « Démarrage » reste visible après la création du budget. Pour les mois suivants, le bandeau « Appliquer le modèle de budget » et le menu « Dupliquer / appliquer le modèle » de l'écran Budget sont conservés.
- RG16. « Remplir avec un exemple » et « Ajouter les lignes suggérées » sont livrés en production.
- RG17. Aucun blocage à la création : « Reste à placer » négatif et étapes vides donnent un avertissement seulement.
- RG18. Le brouillon de l'assistant (étape en cours, mois, lignes saisies) est conservé après rechargement de la page. « Tout vider » demande une confirmation avant d'effacer.
- RG19. Correspondances : Fixe/Variable = blocs `fix`/`var` ; LT/MT = sections « Épargne long terme »/« Épargne moyen terme » ; « Solde au départ » = valeur de départ de chaque compte, enveloppe ou placement.
- RG20. L'assistant initialise aussi le modèle de budget (`template`) avec les lignes et allocations saisies.
- RG21. La colonne « Capital restant dû » du design (Crédits et dettes) est retirée de l'écran : ni saisie, ni stockée, ni affichée (voir Exclus).

## Parcours utilisateur

Nominal : l'utilisateur ouvre une application vide, arrive sur « Démarrage », choisit le mois, saisit ou ajoute les lignes suggérées étape par étape, vérifie le récapitulatif, clique « Créer le budget de … », puis ouvre le budget mensuel.

Cas limites :
- Étapes laissées vides : création possible, avertissement affiché (RG9).
- « dont espèces » > solde (RG8).
- Reste à placer négatif : affiché en rouge, création possible (RG17).
- Mois déjà initialisé : confirmation (RG13).
- « Tout vider » : confirmation avant effacement (RG18).
- Rechargement de la page en cours de saisie : le brouillon est conservé (RG18).

## Design

Source : `design/project/Budget Perso.dc.html`, bloc « SCREEN : INITIALISATION » (colonne d'étapes 260 px, cartes d'étape teintées par couleur de bloc, bandeau de bienvenue jaune à l'étape 1, états vides en pointillés). Composants existants à réutiliser : `panel`, `banner`, `btn-dark`, `btn-outline`, `btn-quiet`, `pill`, `popmenu`, tokens de `src/presentation/ds/organic.css`. Aucun design à proposer.

## Impact technique

- Domaine : `BudgetData` doit pouvoir représenter l'absence de premier mois (aujourd'hui `firstMonth` est obligatoire). Les lignes saisies (revenus, crédits, dépenses fixes/variables, épargnes, investissements) alimentent `template.lines` / `months[m].lines` ; envelopes, `cash` et `template.envAlloc` viennent de l'étape Enveloppes ; les soldes de départ des comptes et enveloppes doivent être stockés (relevés `statements` ou base de départ, choix technique à confirmer à l'implémentation). Le capital restant dû n'est pas modélisé.
- Application : un cas d'usage de création du premier mois à partir des saisies de l'assistant (lignes, `template`, `firstMonth`, enveloppes, soldes de départ) ; `main.tsx` et le store ne chargent plus `seedData` par défaut ; redirection vers « Démarrage » quand aucun mois n'est initialisé.
- Infrastructure : persistance via `localRepository` (le `SupabaseRepository` avec sync par diff, voir `docs/architecture.md` §5, et l'authentification sont traités dans une spec séparée). Le brouillon de l'assistant est conservé au rechargement (emplacement du stockage à confirmer à l'implémentation).
- Présentation : nouvel écran « Démarrage » dans `App.tsx` (`Screen` + `NAV` + `TITLES`).
- Schéma Supabase : hors de cette spec, repoussé avec la spec dédiée (migration dans `supabase/migrations/`, puis régénération de `database.types.ts`).

## Critères d'acceptation

Tests automatisés (Vitest, `application/actions.test.ts`) : CA3, CA6, CA7, CA8, CA9, CA12. Le reste est vérifié à la relecture de l'UI (pas de tests UI dans le projet).

- CA1. Given l'application ouverte, When je regarde la barre latérale, Then une entrée « Démarrage » existe entre « Prévisionnel » et « Clôture » et ouvre l'écran « Initialisation » sans sélecteur de mois.
- CA2. Given l'écran Démarrage, When je clique sur une étape de la colonne de gauche, Then son contenu s'affiche ; « Précédent » est inactif à l'étape 1.
- CA3. Given une application sans aucune donnée enregistrée, When elle démarre, Then aucune donnée de démonstration n'est chargée et aucun mois n'est initialisé.
- CA4. Given l'étape Enveloppes, When « dont espèces » dépasse « Solde au départ », Then la cellule est en rouge et le message d'avertissement s'affiche.
- CA5. Given une étape sans ligne, When je clique « Ajouter les lignes suggérées », Then les lignes suggérées de l'étape sont ajoutées ; « Ligne vide » ajoute une ligne vide.
- CA6. Given des lignes saisies à l'étape 2, When je lis le récapitulatif, Then « Reste à placer » = Revenus − Crédits − Dépenses − (Épargnes + Investissements versés) − Enveloppes allouées.
- CA7. Given un récapitulatif validé pour Janvier 2027, When je clique « Créer le budget de Janvier 2027 », Then ce mois est initialisé avec les lignes saisies, `firstMonth` vaut `2027-01` et les soldes de départ saisis sont les soldes au 1er janvier 2027.
- CA8. Given un mois déjà initialisé, When je valide la création pour ce mois, Then la confirmation de remplacement est demandée et un refus ne modifie rien.
- CA9. Given un `firstMonth` existant, When je choisis un mois antérieur, Then ce choix est refusé ; un mois futur est accepté. Given aucun budget, When j'ouvre l'étape 1, Then la liste va du mois courant moins 1 an au mois courant plus 1 an et un mois passé est sélectionnable.
- CA16. Given l'étape Crédits et dettes, When je l'ouvre, Then seules les colonnes Nom et Mensualité sont présentes.
- CA12. Given un budget créé par l'assistant, When j'ouvre le mois suivant non initialisé et clique « Appliquer le modèle de budget », Then ses lignes et allocations reprennent celles saisies dans l'assistant.
- CA13. Given aucun mois initialisé, When l'application s'ouvre, Then l'écran « Démarrage » s'affiche.
- CA14. Given des lignes saisies dans l'assistant, When je recharge la page, Then l'étape, le mois et les lignes sont conservés ; When je clique « Tout vider », Then une confirmation est demandée et un refus ne modifie rien.
- CA15. Given un reste à placer négatif ou des étapes vides, When je valide à l'étape 8, Then le budget est créé et l'avertissement reste affiché.
- CA10. Given le budget créé, When je clique « Ouvrir le budget mensuel », Then l'écran Budget s'affiche sur le premier mois, avec les chiffres du récapitulatif.
- CA11. Given le budget créé, When je recharge l'application, Then les données sont relues depuis le repository local et inchangées.

## Notes d'implémentation

- Le `SupabaseRepository` et l'authentification ne sont pas livrés avec cette spec (décision du développeur) : la persistance reste `localRepository`. CA11 est donc vérifié contre le repository local seulement ; la migration Supabase (`settings.first_month` nullable) est repoussée avec la spec dédiée.
- Soldes de départ : ADR 0001. Brouillon : ADR 0002.

## Questions ouvertes

Hors périmètre, à traiter plus tard : budget sans détail de dépenses (le développeur y réfléchira). Aucune autre question ouverte.
