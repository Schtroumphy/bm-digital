# 0042 — Saisir une entrée d'argent sur un compte hors budget (ex. Swile)

- Statut : validée (hypothèses par défaut, à confirmer au test)
- Date : 2026-11-03
- Branche prévue : feat/entree_argent_compte_hors_budget
- S'appuie sur : 0036 (entrée sur enveloppe, type `envin`, ADR 0035), 0015 (revenus, date bancaire), 0019 (soldes), 0031 (opération hors budget), explications 0002 et 0009 (compte hors budget isolé du principal).

## Contexte et objectif

Besoin du développeur : « Je dois pouvoir ajouter une entrée d'argent sur Swile également ». Swile est un compte `kind 'courant'` avec `in_budget false` : ce n'est pas une enveloppe. Un crédit externe (titres-restaurant versés par l'employeur) doit pouvoir y être enregistré, à la saisie comme à l'import, sans devenir un revenu du budget.

## État des lieux (vérifié dans le code)

- Écran Saisie : l'« Entrée d'argent » (`rev`) cible une ligne de revenu ; depuis 0036, elle peut aussi cibler une enveloppe (`envin`, `addEnvelopeInflow`, `envelopeEntryAccount`). Aucun compte hors budget n'est proposable.
- `addLineExpense` exige une ligne de revenu et refuse les comptes d'enveloppe.
- Import (`statementImport.ts`) : un crédit externe est `revenu`, `envin` ou `recu` (virement interne). Rien pour un compte hors budget.
- Les mouvements bancaires (`bankMovements.ts`) créditent déjà le compte d'une écriture entrante `envin` ; le même mécanisme sert de modèle.

## Hypothèses retenues (le développeur ne peut pas répondre)

- H1. Comptes concernés : comptes actifs, de type Courant, « hors budget » (`inBudget false`), ni principal ni enveloppe. Les comptes d'épargne ou d'investissement hors budget ne sont pas concernés.
- H2. Saisie : le sélecteur de l'« Entrée d'argent » gagne un groupe « Comptes hors budget » (après « Enveloppes »). Choisir un compte crée une « entrée sur compte hors budget ». Le compte « Reçu sur » est ce compte, non modifiable.
- H3. L'entrée crédite ce compte seul (comme 0036 RG8, décision B1). Elle n'entre jamais dans les revenus, le budget, « Disponible à placer », « Revenus attendus », le pointage, ni dans aucune enveloppe.
- H4. Import : nature dédiée « Entrée sur compte hors budget » pour un crédit externe, proposée dans le fichier de tout compte actif ; le compte est choisi dans « Rattacher à » (groupe « Comptes hors budget »), prérempli et ligne cochée d'office si le fichier est celui d'un tel compte et que la ligne n'a pas d'autre problème. Sinon « À rattacher ».
- H5. Représentation : nouveau type d'écriture (ex. `accin`) ou généralisation de `envin` : au choix de l'implementer, sans changer le comportement décrit. Une migration Supabase additive est permise (élargir le `check` de `transactions.type`).
- H6. Pas de modification après coup (montant, libellé, cible) : suppression puis recréation, comme 0036.
- H7. Pas de règle d'import mémorisée pour cette nature.

## Périmètre

Inclus :
- Saisie d'une entrée sur un compte hors budget (Courant) ; import d'un crédit externe avec nature dédiée ; effet sur les soldes réel et estimé du compte ; affichage dans Opérations et Comptes ; suppression ; déduplication à l'import.

Exclus :
- Dépenses sur Swile (déjà gérées par le mécanisme existant), virements vers Swile (déjà couverts par les virements internes).
- Entrée sur compte d'épargne, d'investissement ou en budget (autres mécanismes).
- Solde espèces, bouton « + » des tuiles, règles mémorisées, modification d'une entrée existante.

## Règles de gestion

- RG1. Saisie : sur le type « Entrée d'argent », le sélecteur propose les lignes de revenu, le groupe « Enveloppes » (0036) et un groupe « Comptes hors budget » (absent s'il n'y en a aucun). Le label reste « Revenu ou enveloppe » ou devient « Revenu, enveloppe ou compte » (au choix de l'implementer).
- RG2. Quand un compte hors budget est choisi : « Reçu sur » affiche ce compte (non modifiable). Champs : montant (> 0), jour, libellé (défaut : nom du compte), détail (0020), source facultative (texte libre, hors calcul).
- RG3. Refus, rien n'est écrit : mois verrouillé, clos ou non initialisé ; compte archivé, inconnu, ou ne répondant pas à H1 (donc compte principal, enveloppe, en budget, épargne, investissement) ; montant ≤ 0 ; jour hors du mois.
- RG4. Import : pour un crédit externe, la nature « Entrée sur compte hors budget » s'ajoute à « Revenu », « Entrée sur enveloppe » et « Virement interne ». Écriture créée : entrante, montant positif, mois de rattachement, date bancaire (0015 RG1), détail, source facultative préremplie par le libellé court et modifiable. Compte invalide (RG3) : ligne non importable avec un message explicite.
- RG5. Effet sur les soldes (0019) : crédit du compte choisi, à la date bancaire, une seule fois, dans le solde réel et le solde estimé. Aucun double compte. Même quand le crédit vient du fichier d'un autre compte, seul le compte choisi est crédité (cohérent avec 0036 RG8).
- RG6. Hors budget : l'entrée n'entre jamais dans « Revenus » (réel ni budget), « Disponible à placer », « Revenus attendus », le pointage « reçu », le dépensé ou le solde d'une enveloppe, ni le bilan et la clôture du mois. Elle ne crée ni ne modifie aucune ligne `rev`.
- RG7. Déduplication à l'import comme un revenu : empreinte avec le sens `+`, rang, compte d'import (0015 RG20, RG24). Un doublon reste « Doublon » quelle que soit la nature proposée au réimport.
- RG8. Aperçu d'import : le filtre de nature gagne « Entrée sur compte hors budget » ; le récapitulatif a une ligne « Entrées sur compte hors budget » (nombre, total) distincte des revenus et des entrées sur enveloppe.
- RG9. Opérations : type affiché « Entrée sur compte hors budget », montant en entrée (positif), source en détail, filtre de type. Le total de dépenses de la liste ne l'inclut pas ; l'infobulle donne le total de ces entrées. Supprimable (soldes recalculés, clés de déduplication libérées). Non modifiable hors suppression.
- RG10. Comptes : l'écriture s'affiche « <libellé> (entrée sur compte hors budget) » en entrée, avec la source ; jamais « Revenu » ni « Dépense ».
- RG11. Si le compte est archivé après coup, ou repassé « dans le budget », l'écriture existante reste affichée et comptée dans son solde sans erreur ; seuls les nouveaux ajouts sont refusés.
- RG12. Les données existantes se chargent sans changement ; sauvegarder puis recharger redonne le même `BudgetData`.

## Parcours utilisateur

Saisie : Swile est à 20 €. J'ouvre Saisie, type « Entrée d'argent », cible « Swile » (groupe « Comptes hors budget »), montant 150 €, libellé « Titres-restaurant novembre ». Le solde Swile passe à 170 €. Revenus, disponible à placer et enveloppes ne bougent pas.

Import : le fichier Swile contient « CREDIT EMPLOYEUR 150,00 » ; nature « Entrée sur compte hors budget », compte Swile prérempli, ligne cochée ; importée, même effet.

Cas limites : mois clos ; compte archivé ; montant 0 ; réimport (doublon) ; suppression de l'entrée ; aucun compte hors budget (le groupe est absent).

## Design

Design proposé, à valider (aucune maquette). Réutilise le formulaire Saisie de 0036 et les `<select>` à groupes de l'import.

```
 Type            ( ... | Entrée d'argent )
 Revenu ou enveloppe  [ Swile                 v ]
                        Lignes de revenu
                          Salaire
                        Enveloppes
                          Voiture
                        Comptes hors budget
                          Swile
 Reçu sur         Swile (non modifiable)
 Montant [ 150,00 ]  Libellé [ Titres-restaurant ]  Source (facultatif) [ Employeur ]
 [ Ajouter l'entrée ]
```

Import (crédit externe) : Nature [ Entrée sur compte hors budget v ], Rattacher à [ Swile v ], Source [ CREDIT EMPLOYEUR ]. Récapitulatif : lignes « Entrées d'argent (revenus) », « Entrées sur enveloppe », « Entrées sur compte hors budget ».

États : vide (aucun compte éligible : groupe absent), mois verrouillé (refusé), compte invalide (non proposé / non importable), erreur de montant.

## Impact technique

- Domaine : écriture entrante portant l'id du compte (type dédié ou `envin` généralisé) ; fonction d'éligibilité d'un compte (H1) à côté de `envelopeEntryAccount` (`bank.ts`) ; mouvements réels et estimés (`bankMovements.ts`) ; exclusion de tout calcul de revenus, budget, enveloppes.
- Application : `addTransaction` (`actions.ts`) accepte l'entrée (RG1 à RG3) ; `statementImport.ts` : nature, cible, validation, déduplication, récapitulatif ; suppression.
- Infrastructure : migration additive (élargir le `check` de `transactions.type`), `supabaseRows`, `database.types.ts`, test de contrat.
- Présentation : `Expenses.tsx`, `ImportRow.tsx`, `ImportWizard.tsx`, `Accounts.tsx`.
- Documentation : `docs/architecture.md`, ADR si le type d'écriture change (cf. ADR 0035).

## Critères d'acceptation

(Auto = test automatisé ; Man = manuel.)

- CA1. Given le type « Entrée d'argent » et un compte Courant hors budget actif, Then le sélecteur propose le groupe « Comptes hors budget » avec ce compte ; Given aucun, Then le groupe est absent. (Man)
- CA2. Given Swile à 20 €, When j'ajoute une entrée de 150 € dessus, Then son solde réel et estimé est 170 €, crédité une seule fois à la date bancaire. (Auto)
- CA3. Given cette entrée, Then « Revenus », « Disponible à placer », « Revenus attendus », le pointage, le solde et le dépensé de toute enveloppe sont inchangés et aucune ligne `rev` n'est créée ou modifiée. (Auto)
- CA4. Given un mois verrouillé, clos ou non initialisé, un compte archivé, principal, d'enveloppe, en budget, d'épargne ou d'investissement, un montant ≤ 0 ou un jour hors du mois, Then l'ajout est refusé et rien n'est écrit. (Auto)
- CA5. Given un crédit externe dans un fichier, Then « Entrée sur compte hors budget » est proposée ; Given le fichier Swile, Then Swile est prérempli et la ligne cochée d'office si elle n'a pas d'autre problème ; Given aucun compte choisi, Then « À rattacher ». (Auto sur l'aperçu)
- CA6. Given un crédit du fichier du principal importé vers Swile, Then le solde du principal est inchangé et celui de Swile monte du montant. (Auto)
- CA7. Given l'import validé, Then l'écriture a les effets de CA2 et CA3, avec mois de rattachement, date bancaire et source facultative. (Auto)
- CA8. Given un réimport du même fichier, Then la ligne est « Doublon » quelle que soit la nature proposée. (Auto)
- CA9. Given l'aperçu et le bilan d'import, Then le filtre de nature et la ligne « Entrées sur compte hors budget » existent, distincts des revenus et des entrées sur enveloppe. (Man)
- CA10. Given Opérations, Then le type s'affiche en entrée, est filtrable, supprimable (soldes recalculés, clés libérées) et absent du total de dépenses ; Given Comptes, Then « (entrée sur compte hors budget) » en entrée. (Man, suppression en Auto)
- CA11. Given un compte portant de telles écritures puis archivé ou repassé « dans le budget », Then les écritures restent affichées sans erreur et nouvel ajout refusé. (Auto)
- CA12. Given les données existantes, Then elles se chargent sans changement et sauvegarder puis recharger redonne le même `BudgetData` ; `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Les choix H1 à H7 sont des défauts à confirmer au test.
