# 0029 — Carte « Épargne » du tableau de bord

- Statut : implémentée
- Date : 2026-10-27
- Branche : feat/evolution_patrimoine_dashboard
- Dépend de : 0028 (opérations affectées à un compte d'épargne), 0027 (tableau de bord)

## Contexte et objectif

Le développeur veut voir, sur le tableau de bord, l'évolution du mois de chaque compte d'épargne (positive ou négative), avec le total reçu et le total dépensé, notamment sur LDDS Travaux, où les dépenses de travaux sont sorties du budget par la 0028 (« affectées »). Aujourd'hui, le tableau de bord ne montre les épargnes que dans « Patrimoine » (un total et deux lignes : épargnes, investissements), sans mouvement du mois ni détail par compte.

Objectif : une carte « Épargne » qui, pour le mois choisi, donne par compte d'épargne (puis d'investissement) le mouvement réel du compte, son évolution, et ce qui lui est affecté hors solde.

## État des lieux (vérifié)

- `dashboardView` (`domain/dashboard.ts`) assemble des calculs existants et ne recalcule rien ; chaque bloc est `null` sur un mois non initialisé (RG2 de la 0027), sauf `wealth`, `emergency`, `invest`, `savings`, qui suivent le mois de référence de l'écran Objectifs.
- « Patrimoine » (`wealthAt`, 0027 RG13) additionne les soldes de fin de mois des LIGNES `epa` / `inv` du budget (`ledger.accMonth`), hors lignes archivées et comptes hors budget, au mois de référence. La nouvelle carte, elle, lit des COMPTES BANCAIRES de type `epargne` / `invest` (`ledger.bankMonth`, qui donne `start`, `in`, `out`, `balance`, comme le panneau de l'écran Comptes). Les deux ne sont donc pas forcément égaux.
- Les cartes existantes (« Enveloppes », « Dépenses variables ») ont un en-tête teinté, un titre, un lien « Détail » (`btn-quiet`) et des rangées ; la colonne de droite contient « À faire », « Notes », « Patrimoine » (avec l'encart « Fond de secours »), « Objectifs annuels ».
- La 0028 fournit les opérations affectées d'un compte (dépenses `var` / `fix`, entrées `rev`) et leur calcul « Affecté ce mois-ci : dépenses · entrées · net » du panneau de compte, à réutiliser tel quel.

## Périmètre

Inclus : la carte « Épargne » (lecture seule), son calcul dans `dashboardView`, son affichage dans la colonne de droite sous « Patrimoine ».

Exclus : tout changement des chiffres existants (Patrimoine, objectifs, KPI) ; saisie depuis la carte ; nouvel écran ; graphique ; affectation d'une opération à un compte `invest` (non affectable, 0028 RG2).

## Règles de gestion

- RG1. Emplacement : colonne de droite du tableau de bord, juste sous « Patrimoine » (avec son encart « Fond de secours ») et avant « Objectifs annuels ». Gabarit des cartes existantes : en-tête teinté, titre « Épargne », lien « Détail » vers l'écran Comptes (ne change pas le mois).
- RG2. Mois : celui du sélecteur de l'en-tête (0027 RG1), contrairement à « Patrimoine » qui reste au mois de référence. Mois non initialisé : la carte affiche « — » (comme les autres blocs du mois, 0027 RG2).
- RG3. Comptes affichés : tous les comptes bancaires actifs de type `epargne`, puis ceux de type `invest`, dans l'ordre de l'écran Comptes. Un compte archivé n'est affiché que s'il a un mouvement ou une opération affectée dans le mois. Les autres types (courant, enveloppe) n'apparaissent pas. Les deux groupes sont séparés par un séparateur « Investissements » (sans mention par ligne), affiché seulement s'il y a des comptes d'investissement. Aucun compte à afficher (ni épargne ni investissement, archivés sans mouvement compris) : la carte est masquée.
- RG3b. La carte ne montre que des mouvements : aucun solde (de début ni de fin de mois) par compte, pour ne pas être comparée à Patrimoine, dont le périmètre diffère (lignes `epa` / `inv`, mois de référence).
- RG4. Première ligne d'un compte « mouvements réels » : nom et pastille ; « Reçu » = Entrées du mois (`bankMonth.in` : versements, virements reçus) ; « Dépensé » = Sorties du mois (`bankMonth.out` : retraits, virements émis) ; « Évolution » signée = solde de fin de mois − solde de début de mois (`bankMonth.balance − start`), verte si positive, rouge si négative, neutre si nulle. Reçu − Dépensé = Évolution (à l'arrondi près), ajustements inclus comme dans le panneau du compte.
- RG5. Deuxième ligne, comptes de type `epargne` seulement : « Affecté (hors solde) » avec « Reçu » = total des entrées affectées au compte dans le mois, « Dépensé » = total des dépenses affectées, au sens de la 0028 : opérations dont le MOIS DE RATTACHEMENT budgétaire (`month`) est le mois choisi, quelle que soit leur date bancaire, montants positifs, de tous comptes propres. Ces montants ne sont ni dans le solde, ni dans RG4, ni dans l'évolution. La ligne est absente quand le compte n'a aucune opération affectée dans le mois. Les comptes `invest` n'ont jamais cette ligne (non affectables).
- RG6. Pied de carte « Total » : somme des Évolutions (RG4), du Reçu et du Dépensé réels (RG4) de tous les comptes affichés, et, sur une ligne séparée « Affecté (hors solde) », la somme des Reçu et Dépensé affectés (RG5). Total des Évolutions = somme des soldes de fin − somme des soldes de début.
- RG7. Les virements entre deux comptes affichés comptent dans les deux (sortie de l'un, entrée de l'autre), comme dans le panneau de chaque compte : le total reflète donc la somme des mouvements des comptes, pas un flux externe. Une infobulle sur « Total » le dit (« Les virements entre ces comptes sont comptés des deux côtés »).
- RG8. Lecture seule : aucun bouton « + », aucune écriture, aucun effet sur la sauvegarde. Mois clôturé : carte affichée normalement.
- RG9. Montants avec `money` ; couleurs : vert / rouge des cartes existantes ; ligne « Affecté (hors solde) » en gris pour ne pas être confondue avec un solde.
- RG10. Aucun chiffre existant ne change : Patrimoine, Fonds de secours, objectifs, KPI, donut. Une opération affectée (0028) n'est comptée que dans RG5 et RG6.

## Parcours utilisateur

Nominal : j'ouvre Accueil sur octobre 2026. Sous Patrimoine, la carte « Épargne » liste LDDS Travaux : « Reçu 612,00 € · Dépensé 80,00 € · Évolution +532,00 € » puis en gris « Affecté (hors solde) : reçu 212,50 € · dépensé 1 353,58 € », puis mes autres épargnes (Livret A…) et les investissements, et le total en pied. Je clique « Détail » : j'arrive sur Comptes.

Cas limites : mois non initialisé (« — ») ; compte sans mouvement (reçu 0, dépensé 0, évolution 0, ligne affectée absente) ; évolution négative (rouge) ; compte archivé sans mouvement (non affiché) ; aucun compte d'épargne ni d'investissement (carte masquée) ; opération affectée dont la date bancaire tombe dans un autre mois que son mois de rattachement (comptée dans le mois de rattachement) ; mois de changement de sélecteur (la carte suit, Patrimoine non).

## Design

Design proposé, à valider. Aucune maquette. Réutilise `organic.css`, le gabarit de carte « Enveloppes », les pastilles de compte et `money`. Pas de nouvel écran.

```
┌─ Épargne ───────────────────────── Détail ┐
│ ● LDDS Travaux                +532,00 €   │
│    Reçu 612,00 · Dépensé 80,00            │
│    Affecté (hors solde) : reçu 212,50 ·   │   (gris)
│    dépensé 1 353,58                       │
│ ● Livret A                    +300,00 €   │
│    Reçu 300,00 · Dépensé 0,00             │
│ ── Investissements ────────────────────── │
│ ● Trade Republic              -40,00 €    │
│    Reçu 0,00 · Dépensé 40,00              │
│ ─────────────────────────────────────────  │
│ Total                          +792,00 €  │
│    Reçu 912,00 · Dépensé 120,00           │
│    Affecté (hors solde) : 212,50 · 1 353,58│
└───────────────────────────────────────────┘
```
(Chiffres d'exemple.) États : mois non initialisé (« — »), vide, évolution négative (rouge).

## Impact technique (quoi)

- Domaine : `DashboardView` gagne un bloc `savingsAccounts` (null sur un mois non initialisé) : lignes par compte (nom, teinte, reçu, dépensé, évolution, affecté reçu / dépensé facultatif) et total ; lu depuis `ledger.bankMonth` et la fonction de la 0028 qui additionne les opérations affectées d'un compte et d'un mois. Aucun nouveau calcul de solde.
- Application / infrastructure / schéma Supabase : aucun (pas de nouvelle donnée).
- Présentation : composant de carte dans l'écran Accueil, colonne de droite.
- Documentation : spec 0027 amendée (nouvelle carte, RG1 des cartes), `docs/architecture.md` si la liste des blocs y figure.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given un compte d'épargne avec 300 € de versement et 80 € de retrait dans le mois, Then la carte affiche Reçu 300, Dépensé 80, Évolution +220 (= solde de fin − solde de début). (Auto)
- CA2. Given une évolution négative, Then elle est affichée avec son signe en rouge. (Auto sur le signe, Man sur la couleur)
- CA3. Given des opérations affectées (0028) à LDDS Travaux dans le mois, Then la ligne « Affecté (hors solde) » donne le total des entrées et des dépenses affectées, sans modifier Reçu, Dépensé, Évolution ni le solde du compte. (Auto)
- CA4. Given un compte sans opération affectée, Then la ligne « Affecté » est absente ; Given un compte `invest`, Then elle est toujours absente. (Auto)
- CA5. Given plusieurs comptes, Then le total donne la somme des évolutions, des reçus et des dépensés, et la somme des affectés sur une ligne séparée. (Auto)
- CA6. Given un virement entre deux comptes affichés, Then il est compté dans les deux (RG7) et l'infobulle du total le précise. (Auto sur le calcul, Man sur l'infobulle)
- CA7. Given un mois non initialisé, Then la carte affiche « — » ; Given un autre mois sélectionné, Then la carte suit le mois alors que Patrimoine ne bouge pas. (Auto sur la vue, Man sur l'écran)
- CA8. Given un compte archivé sans mouvement dans le mois, Then il n'est pas affiché ; avec un mouvement ou une opération affectée, il l'est. (Auto)
- CA9. Given l'ajout de la carte, Then Patrimoine, Fonds de secours, objectifs, KPI et donut produisent les mêmes valeurs qu'avant. (Auto, tests existants)
- CA12. Given aucun compte d'épargne ni d'investissement à afficher, Then la carte est masquée ; Given des comptes d'investissement, Then un séparateur « Investissements » les distingue des épargnes ; Given la carte, Then aucun solde par compte n'y figure. (Auto sur la vue, Man sur l'écran)
- CA13. Given une opération affectée rattachée à octobre mais datée du 2 novembre, Then elle est comptée dans « Affecté » d'octobre et pas de novembre. (Auto)
- CA10. Le clic sur « Détail » ouvre l'écran Comptes sans changer le mois. (Man)
- CA11. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur intégrées : mouvements seuls, sans solde par compte (RG3b) ; opérations affectées comptées au mois de rattachement budgétaire (RG5) ; carte masquée sans compte à afficher (RG3) ; séparateur « Investissements » entre les deux groupes (RG3).
