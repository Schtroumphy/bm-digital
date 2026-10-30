# 0035 — Dépenses rattachées à une ligne d'épargne (payées depuis un compte d'épargne)

- Statut : validée (révision 2 : une dépense catégorisée par la ligne d'épargne, et non plus une sortie `epa` externe)
- Date : 2026-10-30
- Branche prévue : feat/depenses_rattachees_epargne

## Contexte et objectif

Demande du développeur : « Je devrais pouvoir rattacher une dépense à une épargne. J'ai des dépenses rattachées à Lydia vacances mais je ne peux les rattacher qu'à une enveloppe ou dépense variable à tort. »

Cas d'usage immédiat : reprise de l'historique de septembre 2026, 11 opérations du compte Lydia « Vacances » (= Lydia Holidays, compte tampon, type épargne) à importer. Ce sont de vraies dépenses payées depuis ce compte.

Décisions du développeur : la dépense reste une DÉPENSE (elle compte dans les dépenses du mois), financée par l'épargne (l'Épargne réelle et le taux d'épargne baissent de son montant, « Disponible à placer » ne bouge pas, le solde du compte baisse). Sa CATÉGORIE est la ligne d'épargne du mois (bloc `epa`, ex. « Lydia Holidays », « Vacances Mada »), pas une ligne variable ni fixe. Les lignes d'épargne serviront de catégories à une future vue annuelle « où part mon argent » (hors périmètre ici).

## État des lieux (vérifié dans le code et les specs)

- Une dépense `var` payée depuis un compte d'épargne existe déjà (« Payé avec ») : elle débite le compte, alimente sa ligne variable et compte dans les dépenses. Elle ne fait PAS baisser « Disponible à placer » (`availableReal` est budgétaire ; confirmé par CA13). Elle ne touche pas l'Épargne réelle (`savingsOut` ne lit que le type `epa`).
- Le type `epa` (spec 0007) est une sortie d'épargne qui crédite un compte de l'app (`accountId` = récepteur), n'est pas une dépense et n'a pas de catégorie. Elle reste inchangée.
- Affectation (0028) et « hors budget » (0031) sortent une opération de tous les chiffres du budget : ce n'est pas le besoin et ces options ne s'appliquent pas ici.
- À l'import, `targetIsValid` ne connaît pas de cible ligne d'épargne. Les règles mémorisées stockent la cible (`import_rules.target_kind`, contrainte `check`).
- Anti double compte (ADR 0018/0020) : cette dépense n'a qu'une face, elle ne s'apparie à aucun virement.

Ce qui manque : (1) une catégorie « ligne d'épargne » pour une dépense ; (2) l'effet « financée par l'épargne » (Épargne réelle −, Disponible inchangé) ; (3) l'affichage dans le détail du compte et Opérations.

## Périmètre

Inclus :
- Nouvelle cible d'import « ligne d'épargne du compte » pour une dépense (nature Dépense ou Transfert externe) d'un compte de type épargne.
- Création d'une dépense dont la catégorie est cette ligne `epa`, distinguable des sorties `epa` existantes.
- Modification de cette dépense dans Opérations ; règle d'import mémorisée vers cette cible.
- Effets sur dépenses, Épargne réelle, taux d'épargne, Disponible à placer ; affichage.
- Migration Supabase additive.

Exclus :
- Saisie manuelle (formulaire Saisie inchangé).
- Vue annuelle « où part mon argent » (le modèle la permet : la dépense garde sa ligne d'épargne comme catégorie).
- Motifs (0017), lignes `inv` et comptes `invest`, enveloppes.
- Les dépenses `var`/`fix` déjà payées depuis un compte d'épargne : elles gardent leur ligne et leur comportement actuel, sans reprise.
- Repli sans ligne d'épargne liée, création de ligne à la volée.

## Règles de gestion

- RG1. Dans l'aperçu d'import, pour une ligne de nature Dépense ou Transfert externe dont le compte est de type épargne et actif, les lignes `epa` du mois de rattachement dont le compte dédié (`linkedAccountId`) est ce compte sont proposées comme cibles (groupe « Sorties d'épargne du compte »).
- RG2. Critère de validité : `linkedAccountId` = compte de la ligne importée (exception assumée à l'ADR 0014 RG3, qui compare le compte de la ligne au compte importé).
- RG3. Le mois n'a aucune ligne `epa` liée au compte : aucune cible de ce type, la ligne reste « À rattacher ». Rien n'est créé automatiquement, aucun repli. Plusieurs lignes liées au même compte : toutes proposées (spec 0007 RG3).
- RG4. La validation crée une dépense : compte payeur = compte de la ligne importée, catégorie = la ligne `epa` choisie, sans compte récepteur (aucun compte n'est crédité, le principal non plus). Elle se distingue des sorties `epa` à récepteur, qui restent inchangées (effets identiques à avant).
- RG5. Solde du compte payeur : baisse du montant à la date bancaire (solde réel et solde estimé), une seule fois.
- RG6. Dépenses : elle s'ajoute aux dépenses réelles du mois de rattachement (totaux de dépenses du bilan du mois et du tableau de bord), sous sa catégorie « ligne d'épargne ». Elle n'entre dans le réel d'aucune ligne variable, fixe ou crédit et ne change pas « Restant des variables ». Les montants budgétés ne changent pas.
- RG7. Épargne réelle et taux d'épargne du mois baissent du montant de la dépense, comme pour une sortie d'épargne.
- RG8. « Disponible à placer », « Reste à placer » et surplus ne changent pas (l'argent vient de l'épargne). Identité conservée : Revenus = Dépenses + Épargne réelle + Disponible.
- RG9. Elle compte comme les autres écritures quand son compte payeur est dans le budget ; elle n'est ni affectable (0028) ni « hors budget » (0031).
- RG10. Le solde de la ligne `epa` et le solde du compte dédié restent deux chiffres distincts (spec 0007 RG8). Le pointage de la ligne n'est pas modifié.
- RG11. Déduplication, empreinte et rang de l'import inchangés. Mois verrouillé ou clos : non importable ni modifiable.
- RG12. Modification dans Opérations (`updateTransaction`) : libellé, montant, date, détail et ligne `epa` cible (parmi celles liées au compte payeur). Le compte payeur est conservé. Changer vers une autre catégorie (variable, fixe, enveloppe) ou une ligne `epa` non liée au compte est refusé, écriture inchangée. Suppression comme toute écriture.
- RG13. Règle mémorisée « libellé contient X → Dépense, ligne d'épargne <ligne> ». Une règle dont la ligne n'existe pas dans le mois, ou n'est plus liée au compte de la ligne importée, n'est pas appliquée : la ligne reste « À rattacher ».
- RG14. Données existantes lues comme aujourd'hui (aucune reprise).
- RG15. Schéma : migration additive (ce qui distingue cette dépense des sorties `epa` : nouveau type de transaction avec `check` de `transactions.type` élargi, ou colonne nullable, au choix de l'implementer ; `check` de `import_rules.target_kind` élargi à la nouvelle cible) ; `supabaseRows` (aller et retour), `database.types.ts`, test de contrat.

## Parcours utilisateur

Nominal : import de `2026-09.csv`, 11 débits du compte Lydia « Vacances ». Pour chacun, le menu de rattachement propose « Lydia Holidays (sortie d'épargne) » ; je la choisis et je mémorise la règle pour les libellés récurrents. Exemple 30 € : solde de Lydia −30 €, dépenses du mois +30 €, Épargne réelle −30 €, Disponible à placer inchangé, Loisirs inchangé.

Cas limites : mois sans ligne `epa` liée (« À rattacher ») ; deux lignes liées (choix) ; règle dont la ligne a disparu (non appliquée) ; mois clos ; doublon déjà importé (verrouillé) ; compte courant (cible absente) ; crédits d'un compte d'épargne (inchangés).

## Design

Design proposé, à valider. Aucune maquette fournie. Réutilise les `<select>` à groupes et pastilles de l'aperçu d'import (`ImportRow`, `ImportWizard`), le panneau « Mouvements » (`Accounts.tsx`) et la liste Opérations (`Expenses.tsx`).

Aperçu d'import (dépense du compte Lydia) :
```
 Rattacher à  [ À rattacher                         v ]
                Lignes variables
                  Loisirs
                Enveloppes
                  Voiture
                Sorties d'épargne du compte
                  Lydia Holidays (sortie d'épargne)
 (infobulle : « Dépense financée par l'épargne : baisse l'épargne réelle, pas le disponible »)
```
Le groupe est absent si le mois n'a aucune ligne `epa` liée au compte.

Panneau « Mouvements » du compte Lydia : `12/09  Billets avion (dépense depuis l'épargne · Lydia Holidays)  -80,00`, en sortie.

Liste Opérations : pastille de la ligne `epa` comme catégorie, mention « Dépense d'épargne ». Formulaire Saisie inchangé.

États : aucun groupe (RG3), règle non applicable, mois verrouillé (non modifiable).

## Impact technique

- Domaine : forme distinguable de la dépense (RG15) ; `ImportTarget` gagne la cible « ligne d'épargne » ; `targetIsValid` (RG1, RG2) ; `realMovements` / `estimatedMovements` : débit du compte payeur sans crédit ailleurs, sans repli sur le principal ; `monthSummary` : dépenses réelles +, `realSavings` −, `availableReal` / `remainingToPlace` / `surplus` inchangés (RG6 à RG8) ; le ledger lit la dépense dans le solde du compte dédié. Les consommateurs du total de dépenses réelles (bilan, tableau de bord) sont à recenser par l'implementer.
- Application : `prepareImport` (propositions), `validateImport` (création), `lineProblem`, `withValidAssignment`, règles d'import (RG13), `updateTransaction` (RG12).
- Infrastructure : migration additive (RG15), `supabaseRows`, `database.types.ts`, `budgetRepository.contract.ts`.
- Présentation : `ImportRow` / `ImportWizard`, `Accounts.tsx`, `Expenses.tsx`.
- Documentation : `docs/architecture.md`, ADR (« dépense financée par l'épargne : catégorie ligne d'épargne, Disponible inchangé » ; exception à l'ADR 0014 RG3).
- Alternative écartée : import en `var` + « hors budget » (0031) ou affectation (0028) : sort la dépense des dépenses et ne réduit pas l'Épargne réelle.

## Critères d'acceptation

(Auto = test automatisé ; Man = manuel.)

- CA1. Given un mois avec une ligne `epa` « Lydia Holidays » liée au compte Lydia et un débit de ce compte, Then cette ligne est proposée comme cible ; Given un compte courant, Then non. (Auto)
- CA2. Given un mois sans ligne `epa` liée, Then aucune cible de ce type et la ligne est « À rattacher ». (Auto)
- CA3. Given deux lignes liées au compte, Then les deux sont proposées ; Given une ligne `epa` liée à un autre compte, Then refusée. (Auto)
- CA4. Given un débit de 30 € rattaché à la ligne, When je valide, Then le solde réel et estimé de Lydia baisse de 30 € à la date bancaire et aucun autre compte ne change. (Auto)
- CA5. Given cette dépense, Then les dépenses réelles du mois augmentent de 30 € et le réel d'aucune ligne variable, fixe ou crédit ni « Restant des variables » ne change. (Auto)
- CA6. Given cette dépense, Then l'Épargne réelle et le taux d'épargne baissent de 30 €. (Auto)
- CA7. Given cette dépense, Then « Disponible à placer », « Reste à placer » et surplus sont inchangés. (Auto)
- CA8. Given les sorties `epa` à récepteur existantes, Then leurs effets sont identiques à avant. (Auto, tests existants)
- CA9. Given une règle mémorisée vers la ligne d'épargne, Then elle préremplit la cible ; Given une ligne absente du mois ou non liée au compte, Then elle n'est pas appliquée. (Auto)
- CA10. Given une telle dépense importée, When je modifie libellé, montant, date ou ligne `epa` cible, Then c'est accepté et les chiffres sont recalculés ; Given un changement vers une ligne `var` ou une ligne `epa` non liée au compte, Then refusé, écriture inchangée. (Auto)
- CA11. Given un mois clos, Then import et modification sont refusés. (Auto)
- CA12. Given un réimport du même fichier, Then la ligne est « Déjà importée » (empreinte et rang inchangés). (Auto)
- CA13. Given une dépense `var` déjà payée depuis un compte d'épargne, Then ses effets sont inchangés. (Auto)
- CA14. Given le détail du compte, Then la dépense apparaît en sortie avec « dépense depuis l'épargne » et sa ligne ; Given l'aperçu, Then le groupe n'apparaît que s'il existe une cible. (Man)
- CA15. Given la migration, Then la colonne ou le `check` élargi existent, les anciennes données se chargent sans changement, sauvegarder puis recharger redonne le même `BudgetData`. (Auto sur la conversion et le contrat, Man sur la base)
- CA16. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur intégrées : dépense comptée dans les dépenses ; Épargne réelle et taux d'épargne baissent, Disponible inchangé ; attribution par le compte payeur de type épargne (tout compte d'épargne actif) ; catégorie = ligne d'épargne du mois ; cible non proposée sans ligne liée ; import + modification + règle mémorisée, pas de saisie manuelle ; vue annuelle plus tard ; design proposé conservé.
