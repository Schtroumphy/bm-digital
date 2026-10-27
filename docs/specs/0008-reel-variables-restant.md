# 0008 — Réel des dépenses variables toutes dépenses comprises, et « Restant »

- Statut : implémentée
- Date : 2026-10-20
- Branche prévue : feat/bank_accounts

Avenant à la spec 0002 (comptes bancaires : RG14, RG17, RG18, CA3, CA4) et à la spec 0006 (mode de paiement par box : RG7, CA7). La spec 0005 (disponible, clôture) n'est pas modifiée.

## Contexte et objectif

Le développeur a saisi une dépense test sur la ligne variable « Alimentation », payée avec le compte Espèces (réglé « Dans le budget » = non). Le réel de la ligne est resté à « — ». C'est le comportement voulu par la RG17 de la spec 0002, confirmé par les tests de diagnostic de `src/application/payment.test.ts`, mais il ne correspond pas à l'usage : une dépense saisie sur une ligne variable doit se voir dans le réel de cette ligne, quel que soit le compte qui paie.

Décisions du développeur :
1. Espèces reste « hors budget », mais ses dépenses variables comptent quand même dans le réel de la ligne variable.
2. Sur l'écran Budget, la colonne « Écart » des lignes variables (et d'elles seules) devient « Restant » : ce qu'il reste à dépenser sur la ligne.
3. Le formulaire « Nouvelle dépense » (bloc d'impact) reste cohérent avec cette règle.

## Constats dans le code

- C1. Le réel d'une ligne variable est stocké sur la ligne (`Line.actual`). Il est recalculé à partir des transactions `var` du mois par `varActualFromTx` (qui exclut aujourd'hui les comptes hors budget), mis à jour par `addTransaction` et `deleteTransaction` (même exclusion) et recalculé en bloc par `refreshVarActuals`, appelé au changement du réglage « Dans le budget » d'un compte (RG18) et au changement de compte d'une transaction.
- C2. Les soldes des comptes lisent les transactions elles-mêmes (RG14 de la spec 0002) : ils ne dépendent pas du réel de la ligne. Aucun risque de double comptage, et rien à changer côté soldes.
- C3. Le « Reste à placer » et le « Disponible (réel) » se calculent sur les budgets des lignes variables, jamais sur leur réel. Le taux d'épargne et l'épargne réelle ne lisent que les enveloppes et les sorties d'épargne. Le réel des lignes variables n'alimente donc que : la colonne Réel, le total « Réel » du bloc, le « Restant » du bloc, la barre de remplissage, le cumul de l'info-bulle, et le bloc d'impact du formulaire de dépense.
- C4. Pour une ligne variable, `lineGap` vaut déjà budget − réel, et est `null` tant que le réel n'est pas saisi. Le « Restant » a donc la même valeur que l'actuel « Écart » ; ce qui change est le libellé et le cas du réel vide (voir question 1).
- C5. Le bloc variable affiche déjà « Restant » dans son en-tête (budget − réel, réel vide compté pour 0).

## Périmètre

Inclus :
- Le réel d'une ligne variable compte toutes les dépenses `var` saisies sur elle, quel que soit le compte payeur (y compris « hors budget »).
- Écran Budget, blocs variables : colonne « Restant » à la place de « Écart ».
- Formulaire « Nouvelle dépense » : bloc d'impact cohérent pour les dépenses variables.
- Remise en phase automatique des lignes existantes dont le réel avait exclu des dépenses (RG18).
- Info-bulle de la case « Dans le budget » (écran Comptes et assistant) précisée (RG19).
- Amendement des critères d'acceptation de 0002 et 0006 devenus faux.

Exclus :
- Dépenses `env` (enveloppes) et sorties d'épargne `epa` : la RG17 de la spec 0002 s'applique toujours (un compte hors budget les exclut des chiffres du budget). Confirmé par le développeur.
- Lignes de revenu, fixes et crédits rattachées à un compte hors budget : toujours exclues des totaux (RG17, CA6ter de 0002).
- Colonne « Écart » des autres blocs (revenus, crédits, fixes, épargnes, placements) et du récapitulatif : inchangée.
- Soldes des comptes, « Reste à placer », « Disponible (réel) », clôture du mois : inchangés (C2, C3).
- Écran Dépenses hors bloc d'impact, schéma Supabase et `SupabaseRepository`.

## Règles de gestion

Réel des lignes variables
- RG1. Le réel d'une ligne variable est la somme des transactions `var` du mois qui ciblent cette ligne, quel que soit leur compte, « dans le budget » ou non. Sans transaction, le réel n'est pas modifié par cette règle (une saisie manuelle du réel reste possible, comme aujourd'hui).
- RG2. Ajouter, supprimer ou changer le compte d'une transaction `var` met à jour le réel de sa ligne en conséquence, sans condition sur le réglage « Dans le budget » du compte.
- RG3. Le réglage « Dans le budget » d'un compte n'a plus aucun effet sur le réel des lignes variables. Changer ce réglage (RG18 de 0002) ne recalcule plus le réel des variables ; il continue de recalculer les chiffres des revenus, fixes, crédits, enveloppes et sorties d'épargne.
- RG4. Les totaux du bloc variable (Budget, Réel, Restant) comptent le réel de toutes les lignes variables, hors budget compris. Le « Reste à placer » et le « Disponible (réel) » ne changent pas (ils lisent les budgets, C3).
- RG5. Enveloppes (`env`) et sorties d'épargne (`epa`) : inchangé. Une dépense sur un compte hors budget n'entre ni dans le dépensé de l'enveloppe, ni dans l'épargne réelle, ni dans les sorties d'épargne du budget, et reste comptée dans le solde du compte.
- RG6. Les soldes des comptes ne changent pas (les transactions `var` y sont comptées une fois, RG14 de 0002).
- RG7. Cette règle remplace la RG17 de la spec 0002 pour les seules transactions `var`. La spec 0006 (RG7, CA7) s'applique désormais ainsi : une dépense dont le compte résolu est hors budget compte dans le réel de la ligne variable et reste exclue pour une enveloppe.

Colonne « Restant » (écran Budget, lignes variables uniquement)
- RG8. Dans chaque bloc de lignes variables, l'en-tête de la colonne « Écart » devient « Restant ». Les autres blocs gardent « Écart ».
- RG9. Restant d'une ligne = budget − réel, arrondi à 2 décimales. Positif ou nul : il reste de l'argent à dépenser. Négatif : la ligne est dépassée.
- RG10. Affichage : même format que l'écart actuel (montant signé, `money(x, true)` ; 0 affiché « 0,00 € » sans signe). Couleur : verte pour un restant ≥ 0, rouge pour un restant < 0 (couleurs de `gapColor`). Un dépassement reste visible aussi par la barre de remplissage rouge existante.
- RG11. Réel vide (« — », ni dépense ni réel saisi) : le restant affiche le budget entier (rien n'est dépensé), en couleur neutre (gris `MUTED`, comme le « — » actuel).
- RG12. Pied du bloc : la cellule sous « Restant » est budget total − réel total (réel vide compté pour 0). Elle vaut la valeur déjà affichée en « Restant » dans l'en-tête du bloc (C5). Rouge si négatif, vert sinon.
- RG13. Info-bulle d'historique (survol d'une ligne) : inchangée dans sa forme. La ligne « Solde mois préc. » affiche le restant du mois précédent pour cette ligne (budget − réel du mois précédent, signé ; budget entier si son réel y était vide, comme RG11), « — » seulement si la ligne n'existait pas le mois précédent. Le libellé reste « Solde mois préc. ».
- RG14. Le « Restant » d'une ligne n'est pas modifiable (affichage seul), comme l'écart aujourd'hui.

Formulaire « Nouvelle dépense » (écran Dépenses)
- RG15. Dépense variable : le bloc « Impact sur le réel » affiche toujours le montant saisi en entier, quel que soit le compte choisi dans « Payé avec », y compris un compte hors budget. Les deux lignes restent : « <ligne> · réel » (avant → après) et « Restant des variables » (avant → après).
- RG16. Dépense d'enveloppe ou sortie d'épargne sur un compte hors budget : le bloc d'impact continue d'afficher l'impact à 0 (le montant n'entre pas dans le budget, RG5).
- RG17. Le bloc d'impact reste en phase avec ce qui est enregistré : après « Ajouter la dépense », le réel de la ligne vaut la valeur « après » annoncée.

Lignes existantes
- RG18. Au chargement des données, le réel de chaque ligne variable (modèle exclu, mois initialisés) ayant au moins une dépense `var` payée avec un compte hors budget est recalculé comme la somme de toutes ses dépenses, seulement si son réel est détectablement périmé : réel vide, ou réel égal à la somme des seules dépenses « dans le budget » de la ligne (l'ancien calcul). Tout autre réel est une saisie manuelle et est conservé. C'est silencieux, idempotent, sans changement de `version` ni saisie, selon le mécanisme de l'ADR 0003. Les autres lignes ne sont pas touchées. Les mois verrouillés (année ou mois clôturés) sont aussi remis en phase : c'est une correction de calcul, pas une saisie.

Libellé
- RG19. L'info-bulle de la case « Dans le budget » (écran Comptes et étape « Comptes » de l'assistant) devient : « Les revenus, charges, enveloppes et sorties d'épargne de ce compte ne comptent pas dans le budget. Les dépenses variables comptent dans le réel de leur ligne. »

## Parcours utilisateur

Nominal : « Alimentation » a un budget de 400 €, réel vide. Le développeur saisit 40 € payés avec Espèces (hors budget) : le formulaire annonce « réel — → 40,00 € » et « Restant des variables … → … » ; une fois ajouté, la ligne affiche Réel 40,00 € et Restant 360,00 € en vert. Le solde d'Espèces baisse de 40 €. Le « Reste à placer » ne bouge pas.

Dépassement : budget 400 €, 450 € dépensés (dont 40 € en Espèces) : Restant « -50,00 € » en rouge, barre rouge.

Suppression : le développeur supprime la dépense de 40 € : le réel de la ligne revient à la somme des autres dépenses.

Changement du réglage d'Espèces : passer Espèces en « dans le budget » ou l'inverse ne change plus aucun réel de ligne variable.

Cas limites :
- Aucune dépense sur la ligne : le Restant affiche le budget entier, en gris (RG11).
- Dépense d'enveloppe payée avec Espèces (hors budget) : n'entre pas dans le dépensé de l'enveloppe, comme avant (RG5).
- Mois clôturé ou année clôturée : ajout et suppression refusés comme avant ; les chiffres restent affichés.
- Ligne variable supprimée après saisie : la transaction reste (« Supprimé » à l'affichage), comme avant.

## Design

Design proposé, à valider (aucune maquette fournie). Aucun nouveau composant : seuls des libellés et des valeurs changent. Tokens et classes existants (`line-grid`, `gap`, `gapColor`, `block-strip`, `impact`).

Bloc variable, écran Budget (colonnes inchangées) :

```
Dépenses variables                                        Restant 1 280,00 €
Nom                     Budget       Réel        Restant
[●] Alimentation         400,00 €    40,00 €     360,00 €   (vert)
[billet] Marché           80,00 €    95,00 €     -15,00 €   (rouge, barre rouge)
[●] Loisirs              150,00 €       —        150,00 €   (réel vide : budget entier, gris)
                       ------------------------------------------
+ Ajouter               630,00 €   135,00 €     495,00 €
```

Bloc revenus (exemple, inchangé) : `Nom  Budget  Réel  Écart`.

Info-bulle (survol d'une ligne variable) :

```
Alimentation
Cumul 2026            1 120,00 €
Solde mois préc.        +35,00 €   (restant du mois précédent)
```

Formulaire « Nouvelle dépense » (dépense variable, Espèces hors budget) :

```
Impact sur le réel
Alimentation · réel            0,00 € → 40,00 €
Restant des variables      1 280,00 € → 1 240,00 €
```

États : ligne sans dépense (réel « — »), avec dépenses, en dépassement, compte payeur hors budget, mois verrouillé (lecture seule). Pas d'état vide ni d'erreur nouveau.

## Impact technique

- Domaine : aucun changement de type. Une fonction pure fournit le restant d'une ligne variable (budget − réel, réel vide compté pour 0) ; `lineHistory` renvoie le restant du mois précédent pour une ligne variable. `monthSummary`, `availableReal` et le Ledger ne changent pas.
- Application : le calcul du réel d'une ligne variable à partir des transactions (`varActualFromTx`), `addTransaction` et `deleteTransaction` cessent de filtrer par réglage « Dans le budget ». `refreshVarActuals` n'est plus nécessaire au changement du réglage d'un compte (RG3) ; il reste utile au changement de compte d'une transaction `var` si le réel est recalculé depuis les transactions. Remise en phase des lignes existantes au chargement (RG18, fonction pure appliquée par le store). Les autres usages de `isTransactionInBudget` (enveloppes, sorties d'épargne) sont conservés.
- Infrastructure : `localRepository` inchangé. Pas de changement de `version` ni de schéma. Supabase repoussé.
- Présentation : `Budget.tsx` (libellé de colonne pour le bloc variable, valeur du Restant, info-bulle), `Expenses.tsx` (bloc d'impact des dépenses variables), info-bulle de la case « Dans le budget » dans `Accounts.tsx` et `Setup.tsx` (RG19).
- Tests existants à modifier : le diagnostic (b) de `src/application/payment.test.ts` et les tests CA3 / CA4 de la spec 0002 et CA7 de la spec 0006 qui affirment aujourd'hui que le réel de la ligne ne bouge pas.
- Schéma Supabase : hors de cette spec.

## Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application). Le reste est vérifié à la relecture de l'UI.

- CA1 (T). Given une ligne variable sans réel et un compte Espèces « hors budget », When j'ajoute une dépense `var` de 40 € payée avec Espèces, Then le réel de la ligne vaut 40 € et le solde d'Espèces baisse de 40 €.
- CA2 (T). Given la même dépense, When je la supprime, Then le réel de la ligne revient à sa valeur précédente (somme des autres dépenses ; s'il n'y en a plus, le réel est vide et le restant égale le budget).
- CA3 (T). Given deux dépenses `var` sur une ligne, l'une payée avec le principal, l'autre avec un compte hors budget, When je lis le réel, Then il est la somme des deux, et chaque dépense n'est comptée qu'une fois dans les soldes.
- CA4 (T). Given une dépense `var` déjà saisie, When je change le réglage « Dans le budget » de son compte, Then le réel de la ligne ne change pas.
- CA5 (T). Given une dépense `var` sur le compte principal, When je change son compte vers un compte hors budget, Then le réel de la ligne ne change pas et les soldes des deux comptes sont mis à jour.
- CA6 (T). Given une dépense `var` payée avec un compte hors budget, When je lis le « Reste à placer » et le « Disponible (réel) », Then ils sont identiques à ceux d'avant la saisie.
- CA7 (T). Given une dépense `env` ou une sortie `epa` payée avec un compte hors budget, When je lis le dépensé de l'enveloppe et les sorties d'épargne du budget, Then ils ne bougent pas (RG5) et le solde du compte baisse.
- CA8 (T). Given une ligne variable de budget 400 € et de réel 450 €, When je calcule son restant, Then il vaut −50 €. Given un réel de 40 €, Then il vaut 360 €.
- CA9 (T). Given une ligne variable de budget 400 € sans réel, When je calcule son restant, Then il vaut 400 €.
- CA10 (T). Given le mois précédent d'une ligne variable (budget 400 €, réel 365 €), When je lis l'historique de la ligne, Then « Solde mois préc. » vaut +35 € ; Given un réel vide, Then 400 € ; Given une ligne absente le mois précédent, Then « — ».
- CA11 (T). Given une ligne variable à réel vide (ou égal à la somme de ses seules dépenses dans le budget) ayant une dépense de 40 € payée avec Espèces (hors budget), When les données sont chargées, Then son réel vaut 40 € ; relancer ne change rien ; un réel saisi à la main (50 €) est conservé, y compris après plusieurs chargements ; une ligne sans dépense hors budget n'est pas modifiée ; `version` reste 1.
- CA11bis. Given l'écran Comptes et l'étape « Comptes » de l'assistant, When je survole la case « Dans le budget », Then l'info-bulle du RG19 s'affiche.
- CA12. Given l'écran Budget, When je regarde un bloc de dépenses variables, Then la colonne s'appelle « Restant » ; Given les blocs revenus, crédits, fixes, épargnes et placements, Then la colonne s'appelle toujours « Écart ».
- CA13. Given une ligne variable avec un restant positif, nul ou négatif, When je la regarde, Then le restant est vert (positif), vert (0,00 €), rouge (signe moins), gris si le réel est vide ; le total du pied de bloc correspond à la valeur « Restant » de l'en-tête du bloc.
- CA14. Given l'info-bulle d'une ligne variable, When je la survole, Then « Solde mois préc. » affiche le restant du mois précédent (signé) ou « — ».
- CA15. Given le formulaire « Nouvelle dépense » en type « Dépense variable » avec Espèces choisi, When je saisis 40 €, Then le bloc d'impact annonce le réel de la ligne passant de X à X + 40 € et le restant des variables baissant de 40 €, et ces valeurs correspondent à ce qui est enregistré à l'ajout.
- CA16. Given le formulaire en type « Enveloppe » ou « Sortie épargne » avec un compte hors budget, When je saisis un montant, Then le bloc d'impact n'affiche aucun impact sur le budget (comme avant).

## Questions ouvertes

Aucune. Décisions du développeur intégrées : restant d'une ligne sans réel = budget entier en gris (RG11, RG13) ; recalcul silencieux des lignes existantes concernées au chargement (RG18) ; enveloppes et sorties d'épargne toujours exclues quand le compte est hors budget (RG5) ; info-bulle de la case « Dans le budget » précisée (RG19) ; pas de maquette, design à valider avec la spec.

Amendement (spec 0028, [ADR 0024](../adr/0024-une-operation-sort-du-budget-par-son-affectation.md)) : le réel d'une ligne variable est la somme de ses dépenses NON affectées à un compte d'épargne ; une dépense affectée n'y compte plus, ni dans « Restant des variables ».
