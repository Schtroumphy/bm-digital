# 0036 — Saisir une entrée d'argent pour une enveloppe (saisie et import)

- Statut : validée (Q7 = B1, wireframe validé)
- Date : 2026-10-30
- Branche prévue : feat/entree_argent_enveloppe
- S'appuie sur : 0024 (« Entrée d'argent sur une enveloppe », statut brouillon, JAMAIS implémentée), 0011, 0015, 0019. Cette spec reprend le périmètre « enveloppe » de 0024 et le livre ; 0024 reste la référence des règles RG10 à RG14 citées ci-dessous.

## Contexte et objectif

Besoin du développeur : « Je dois pouvoir saisir une entrée d'argent pour une enveloppe » : un retour d'argent (remboursement, vente, etc.) sur une enveloppe. Il réduit le dépensé de l'enveloppe, son solde monte, et ce n'est PAS un revenu.

## État des lieux (vérifié dans le code)

Correction d'un constat précédent : 0024 n'est pas implémentée (statut « brouillon »). Dans le code :
- Écran Saisie (`Expenses.tsx`) : pour le type « Entrée d'argent » (`rev`), les cibles proposées sont uniquement les lignes de revenu du mois (`block === 'rev'`) ; le compte « Reçu sur » est celui de la ligne. Aucune enveloppe n'est proposable.
- `addTransaction` (`actions.ts`, `addLineExpense`) refuse une entrée `rev` sur un compte d'enveloppe et exige une ligne de revenu.
- Import (`statementImport.ts`) : un crédit externe ne peut devenir qu'un `rev` sur une ligne de revenu (ou un virement interne) ; la nature « Entrée sur enveloppe » n'existe pas.
- Dépensé d'enveloppe (`budget.ts`) = somme des seules dépenses `env` : aucune entrée n'est retranchée.
- Le « + » de la tuile du Budget (0027, `addEnvelopeEntry`) ne crée qu'une dépense (hors périmètre ici, voir Exclus).

Le constat du développeur est donc exact : ni la saisie ni l'import ne permettent une entrée sur enveloppe.

## Périmètre

Inclus :
- Écran Saisie : choisir une enveloppe comme cible d'une « Entrée d'argent ».
- Import CSV : nature « Entrée sur enveloppe » pour un crédit externe du fichier de n'importe quel compte (principal, autre compte ou compte d'enveloppe), enveloppe choisie dans « Rattacher à ».
- Effet sur le dépensé net et le solde virtuel de l'enveloppe, soldes de compte, affichage dans Opérations et Comptes, suppression.
- Migration Supabase additive si le choix d'implémentation en demande une.

Exclus :
- Solde espèces (0026) : l'entrée va au virtuel seul.
- Bouton « + » de la tuile du Budget (reste dépense seule).
- Remboursement sur ligne variable, fixe ou crédit (reporté, voir 0024 « Reporté »).
- Règles d'import mémorisées pour cette nature ; modification du montant, du libellé ou de la cible après coup (suppression puis recréation).

## Règles de gestion

- RG1. Saisie : sur le type « Entrée d'argent », le sélecteur de cible propose les lignes de revenu (comportement actuel) ET un groupe « Enveloppes ». Choisir une enveloppe crée une « entrée sur enveloppe ». Le bouton reste « Ajouter l'entrée ».
- RG2. Quand une enveloppe est choisie, « Reçu sur » est le compte de l'enveloppe, affiché non modifiable. Champs : montant (> 0), jour, libellé (défaut : nom de l'enveloppe), détail (0020) et source facultative (texte libre, hors calcul).
- RG3. Refus, écriture inchangée : mois verrouillé, clos ou non initialisé ; enveloppe sans compte ou compte archivé ; montant nul ou négatif ; jour hors du mois.
- RG4. Import : pour un crédit externe, la nature « Entrée sur enveloppe » est proposée en plus de « Revenu » et « Virement interne ». La proposition vaut pour le fichier de tout compte actif (principal, autre compte, compte d'enveloppe). L'enveloppe est choisie dans « Rattacher à » (groupe « Enveloppes ») ; si le fichier est celui d'un compte d'enveloppe, elle est préremplie avec l'enveloppe de ce compte et la ligne est cochée d'office dès qu'elle n'a pas d'autre problème. Sinon, tant qu'aucune enveloppe n'est choisie, la ligne reste « À rattacher ». Écriture créée : entrante, montant positif, mois de rattachement, date bancaire (0015 RG1), détail, source facultative préremplie par le libellé court et modifiable.
- RG5. Enveloppe sans compte actif, ou archivée, à l'import : ligne non importable avec le même message que pour une dépense d'enveloppe.
- RG6. Dépensé d'enveloppe = somme des dépenses `env` − somme des entrées sur enveloppe, dans le mois, sans plancher ; il peut être négatif et s'affiche avec son signe. Le solde de l'enveloppe monte du montant de l'entrée (0024 RG10). Les totaux de dépensé du Budget, le bilan du mois, l'épargne réelle et la clôture lisent ce dépensé net (0024 RG11).
- RG7. Hors revenus (0024 RG12) : l'entrée n'entre jamais dans « Revenus » (réel ni budget), « Disponible à placer », « Revenus attendus », ni le pointage « reçu ». Elle ne crée ni ne modifie aucune ligne `rev`. « Reste à sortir » (budgétaire) est inchangé (0024 RG13).
- RG8. Soldes de compte (0024 RG14, 0019) : crédit du compte de l'enveloppe à la date bancaire, une seule fois, dans le solde réel et le solde estimé. Aucun double compte. Seule l'enveloppe est créditée (décision B1) : même quand le crédit vient du fichier du compte principal ou d'un autre compte, ce compte n'est pas crédité par cette écriture. Conséquence assumée : le solde de ce compte dans l'app ne reflète pas ce crédit bancaire.
- RG8b. Saisie cohérente : « Reçu sur » est toujours le compte de l'enveloppe (RG2), sans choix d'un autre compte.
- RG9. Déduplication à l'import comme un revenu : empreinte avec le sens `+`, rang, compte d'import (0015 RG20, RG24). Un doublon reste « Doublon » quelle que soit la nature proposée au réimport.
- RG10. Aperçu d'import : le filtre de nature gagne « Entrée sur enveloppe » ; le récapitulatif a une ligne « Entrées sur enveloppe » (nombre, total) distincte de « Entrées d'argent (revenus) ».
- RG11. Opérations : type affiché « Entrée sur enveloppe », montant en entrée (positif), source en détail, filtre de type. Le total de la liste reste la somme des dépenses seules ; l'infobulle donne le total des entrées sur enveloppe du mois. Supprimable (dépensé recalculé, clés de déduplication libérées) ; montant, libellé et cible non modifiables hors suppression.
- RG12. Comptes : l'écriture s'affiche « <libellé> (entrée sur enveloppe) » en entrée, avec la source ; jamais « Revenu » ni « Dépense ».
- RG13. Supprimer une enveloppe qui porte de telles écritures : même garde-fou que pour ses dépenses.
- RG14. Les écritures et enveloppes existantes se chargent sans changement ; sauvegarder puis recharger redonne le même `BudgetData`.

## Parcours utilisateur

Saisie : « Voiture » est à 520 € (alloué 150 €). J'ouvre Saisie, type « Entrée d'argent », cible « Voiture », montant 40 €, libellé « Remboursement pneu ». Voiture passe à 560 €, son dépensé baisse de 40 €, les revenus du mois ne bougent pas.

Import : un crédit « REMB PNEU 40,00 » apparaît ; je choisis la nature « Entrée sur enveloppe » et l'enveloppe ; elle est cochée et importée ; même effet.

Cas limites : mois clos ; enveloppe sans compte ; montant 0 ; dépensé net négatif (enveloppe plus remboursée que dépensée) ; doublon au réimport ; suppression de l'entrée.

## Design

Design proposé, à valider (aucune maquette fournie). Réutilise le formulaire Saisie et les `<select>` à groupes de l'aperçu d'import.

Saisie :
```
 Type            ( Dépense variable | Enveloppe | ... | Entrée d'argent )
 Ligne de revenu  [ Salaire                 v ]
                    Lignes de revenu
                      Salaire
                      Prime
                    Enveloppes
                      Voiture
                      Loisirs
 Reçu sur         Compte Voiture (non modifiable, si une enveloppe est choisie)
 Montant [ 40,00 ]  Libellé [ Remboursement pneu ]  Source (facultatif) [ Garage ]
 [ Ajouter l'entrée ]
```
Le label du sélecteur devient « Revenu ou enveloppe ».

Aperçu d'import (crédit externe) :
```
 Nature        [ Entrée sur enveloppe  v ]   (Revenu | Entrée sur enveloppe | Virement interne)
 Rattacher à   [ Voiture               v ]   (groupe « Enveloppes » ; prérempli si fichier de compte d'enveloppe)
 Source        [ REMB PNEU ]
```
Récapitulatif : « Entrées d'argent (revenus) 2 » puis « Entrées sur enveloppe 1 ».

États : vide (aucune enveloppe : le groupe « Enveloppes » est absent), mois verrouillé (cible refusée), enveloppe sans compte (non proposée / non importable), erreur de montant.

## Impact technique

- Domaine : écriture entrante distincte d'un revenu et d'une dépense, portant l'id de l'enveloppe (forme, nouveau type ou colonne : au choix de l'implementer) ; dépensé d'enveloppe net (`budget.ts`, `envMonth`) ; mouvements bancaires réels et estimés (`bank.ts`, `bankMovements.ts`) ; aucune lecture par les revenus.
- Application : `addTransaction` accepte l'entrée sur enveloppe (RG1 à RG3) ; `statementImport` : nature, cible, validation, problème de ligne, déduplication, récapitulatif ; suppression.
- Infrastructure : migration additive si nouveau type ou colonne (élargir le `check` de `transactions.type`) ; `supabaseRows`, `database.types.ts`, test de contrat.
- Présentation : `Expenses.tsx`, `ImportRow.tsx`, `ImportWizard.tsx`, `Accounts.tsx`.
- Documentation : `docs/architecture.md` ; passer 0024 en « remplacée par 0036 ».

## Critères d'acceptation

(Auto = test automatisé ; Man = manuel.)

- CA1. Given le type « Entrée d'argent », Then le sélecteur propose les lignes de revenu et un groupe « Enveloppes ». (Man)
- CA2. Given une enveloppe à 520 € de solde et un dépensé de 100 €, When j'ajoute une entrée de 40 € sur elle, Then le solde est 560 € et le dépensé 60 €. (Auto)
- CA3. Given cette entrée, Then « Revenus », « Disponible à placer », « Revenus attendus », le pointage « reçu » et « Reste à sortir » sont inchangés et aucune ligne `rev` n'est créée ou modifiée. (Auto)
- CA4. Given cette entrée, Then le compte de l'enveloppe est crédité de 40 € à la date bancaire, une seule fois, en solde réel et estimé. (Auto)
- CA5. Given un mois verrouillé, clos ou non initialisé, une enveloppe sans compte ou archivée, un montant ≤ 0 ou un jour hors du mois, Then l'ajout est refusé et rien n'est écrit. (Auto)
- CA6. Given un dépensé de 30 € et une entrée de 50 €, Then le dépensé est −20 € et s'affiche avec son signe. (Auto)
- CA7. Given un crédit externe dans le fichier du compte principal, d'un autre compte ou d'un compte d'enveloppe, Then « Entrée sur enveloppe » est proposée ; Given une enveloppe choisie dans « Rattacher à », Then la ligne est cochée d'office si elle n'a pas d'autre problème ; Given le fichier d'un compte d'enveloppe, Then l'enveloppe est préremplie ; Given aucune enveloppe choisie, Then « À rattacher ». (Auto sur l'aperçu)
- CA7b. Given un crédit de 40 € du fichier du principal importé en « Entrée sur enveloppe », Then le solde du principal est inchangé et celui de l'enveloppe monte de 40 €. (Auto)
- CA8. Given l'import validé, Then l'écriture a les mêmes effets que CA2 à CA4, avec mois de rattachement, date bancaire et source facultative. (Auto)
- CA9. Given un réimport du même fichier, Then la ligne est « Doublon » quelle que soit la nature proposée. (Auto)
- CA10. Given l'aperçu et le bilan d'import, Then le filtre de nature et la ligne « Entrées sur enveloppe » existent, distincts des revenus. (Man)
- CA11. Given Opérations, Then le type « Entrée sur enveloppe » s'affiche en entrée, est filtrable, supprimable (dépensé recalculé, clés libérées) et absent du total de dépenses de la liste ; Given Comptes, Then « (entrée sur enveloppe) » en entrée. (Man, suppression en Auto)
- CA12. Given une enveloppe portant de telles écritures, When je la supprime, Then le même garde-fou que pour ses dépenses s'applique. (Auto)
- CA13. Given les données existantes, Then elles se chargent sans changement et sauvegarder puis recharger redonne le même `BudgetData` ; `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décision Q7 = B1 intégrée (import depuis tout compte, enveloppe choisie dans « Rattacher à », seule l'enveloppe créditée). Wireframe validé. Le « + » de la tuile du Budget reste hors périmètre.
