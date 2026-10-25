# 0024 — Entrée d'argent sur une enveloppe (hors revenus)

- Statut : brouillon (amendée le 2026-10-25, périmètre restreint au cas enveloppe ; à valider)
- Date : 2026-10-23, amendée 2026-10-25
- Branche prévue : feat/entree_sur_enveloppe
- Dépend de : 0011, 0013, 0015, 0016 et 0019 (implémentées sur `feat/virements_internes_lies`). Ne touche pas aux specs 0017, 0021, 0022, 0023.
- Note : le nom de fichier est conservé (`0024-remboursements-hors-revenus`) ; le titre et le périmètre ont changé. La version large (remboursement sur ligne `var`/`fix`/`cre`, « Aucune ligne », réel négatif de ligne, règles mémorisées, solde estimé `fix`/`cre`) est renvoyée à une spec ultérieure (voir « Reporté »).

## Contexte et objectif

Import de `refund_temu.csv` : « Refund Temu +40,58 € » sur le compte d'enveloppe « Shopping 2026 ». L'aperçu le classe « Revenu », mais un compte d'enveloppe n'a aucune ligne de revenu et « Nouvelle ligne de revenu » n'y est pas proposée. L'entrée reste « À rattacher », le bouton affiche « Importer 0 ligne » : impossible d'importer. Même blocage en saisie manuelle : la puce « Entrée d'argent » de l'écran Opérations ne cible que des lignes de revenu.

Objectif : pouvoir enregistrer une entrée d'argent sur une enveloppe, à l'import et à la main. Elle crédite le compte de l'enveloppe, réduit le « dépensé » net de l'enveloppe et ne compte jamais comme revenu.

## Périmètre

Inclus :
- Nature d'import « Entrée sur enveloppe » pour un crédit externe sur un compte d'enveloppe ; « Revenu » n'y est plus proposé.
- Nouveau type d'écriture « Entrée sur enveloppe » (entrant, rattaché à une enveloppe).
- Source facultative.
- Saisie manuelle depuis l'écran Opérations, via la puce « Entrée d'argent ».
- Dépensé net d'enveloppe (sans plancher), soldes, déduplication, filtres, récapitulatif, affichage, suppression, schéma (migration additive).

Exclus (voir « Reporté ») :
- Cible ligne `var`/`fix`/`cre`, « Aucune ligne », réel négatif de ligne de budget, sélecteur de dépense d'origine.
- Entrée sur une enveloppe depuis un compte autre que le sien (compte principal, etc.).
- Règles mémorisées pour cette nature.
- Détection par mots-clés (refund, avoir…).
- Requalification d'une écriture existante.

## État des lieux (vérifié)

- `ImportRow.tsx` : pour un compte d'enveloppe, `revenueLines` est vide et « + Nouvelle ligne de revenu » est masquée ; `natureOptions` d'un crédit = `revenu`, `recu`.
- `TxType` = `var | env | epa | fix | rev`; `rev` seul est entrant. `spentOf` (`Expenses.tsx`) filtre `type !== 'rev'`; `signedAmount` signe `rev` et `epa` en positif.
- Contraintes SQL : `transactions.type in ('var','env','epa','fix','rev')`; `import_rules.nature` sans nouvelle valeur dans ce lot (règles reportées).
- Dépensé d'enveloppe = somme des `env` (`budget.ts`). Solde estimé (0019) lit les `env` à leur date.
- Écran Opérations : puce `Entrée d’argent` (type `rev`), cible = lignes de revenu, libellé de champ « Ligne de revenu », « Reçu sur », bouton « Ajouter l’entrée ».

## Règles de gestion

Import
- RG1. Pour un crédit externe dont le compte résolu est un compte d'enveloppe, la nature proposée est « Entrée sur enveloppe » (aucun mot-clé). Le sélecteur Nature propose « Entrée sur enveloppe » et « Virement interne » (0016, inchangé). « Revenu » n'est pas proposé pour ce compte.
- RG2. Pour un compte non enveloppe, le comportement actuel est inchangé (« Revenu » ou « Virement interne »; « Entrée sur enveloppe » n'est pas proposée).
- RG3. La cible est fixe : l'enveloppe dont le compte est le compte résolu. Aucun sélecteur « Rattacher à » n'est affiché pour cette nature (texte non modifiable avec le nom de l'enveloppe). L'entrée est donc cochée d'office dès qu'elle n'a pas d'autre problème (doublon, mois clos, etc.).
- RG4. Si le compte d'enveloppe n'a plus d'enveloppe associée, ou si le compte est archivé ou non rattaché, l'entrée est non importable avec le même message que pour une dépense d'enveloppe (0014, 0013).
- RG5. Écriture créée : entrante, montant positif, type « Entrée sur enveloppe », compte résolu, cible = id de l'enveloppe, mois de rattachement (choisi sur la ligne), date bancaire (0015 RG1), détail (0020), source facultative.
- RG6. Source facultative (reprise de 0016 RG3) : texte libre prérempli avec le libellé court (« Temu »), modifiable, enregistré avec l'écriture, hors empreinte et hors calcul. Affichée sur la ligne d'aperçu pour cette nature.

Saisie manuelle (écran Opérations)
- RG7. La puce « Entrée d’argent » permet de choisir comme cible soit une ligne de revenu (comportement actuel, type `rev`), soit une enveloppe (groupe « Enveloppes » du sélecteur), qui crée une entrée sur enveloppe.
- RG8. Quand une enveloppe est choisie, le compte « Reçu sur » est le compte de l'enveloppe, affiché non modifiable. Libellé, montant, jour, détail et source facultative comme pour les autres entrées. Le bouton reste « Ajouter l’entrée ».
- RG9. Refus : mois verrouillé ou clos, enveloppe sans compte ou compte archivé, montant nul ou négatif (mêmes règles que les autres ajouts).

Effets
- RG10. Dépensé d'enveloppe = Σ dépenses `env` − Σ entrées sur enveloppe, dans le mois, sans plancher. Il peut être négatif et s'affiche avec son signe. Le solde de l'enveloppe (alloc − dépensé) augmente du montant de l'entrée.
- RG11. Lecture dérivée : les totaux de dépensé de l'écran Budget, le bilan du mois, l'« épargne réelle » et la clôture d'année lisent ce dépensé net, sans autre changement. Mois clos : somme des écritures.
- RG12. Hors revenus : cette écriture n'entre jamais dans « Revenus » (réel ni budget), « Disponible à placer (réel) », « Revenus attendus » ni le pointage « reçu ». Elle ne crée aucune ligne `rev`.
- RG13. « Reste à sortir » reste budgétaire : inchangé.
- RG14. Soldes : solde réel (0019) : crédit du compte de l'enveloppe à la date bancaire, dans le mois de cette date, même clos. Solde estimé : même chose (compense des `env` que l'estimé compte déjà). Aucun double compte.
- RG15. Déduplication : comme un revenu (0015 RG20, RG24) : empreinte avec le sens `+`, rang, compte d'import. Un doublon reste « Doublon » quelle que soit la nature proposée au réimport.
- RG16. Filtres de nature de l'aperçu : « Entrée sur enveloppe » s'ajoute. Récapitulatif : ligne « Entrées sur enveloppe » (nombre, total) distincte de « Entrées d'argent (revenus) ». Un compte est « traité » (0013 RG71) quand ses entrées à importer sont importées ou déjà importées.
- RG17. Écran Opérations : type « Entrée sur enveloppe », montant en entrée (positif), source en détail, filtre de type. Le total de la liste (0015 RG26) reste la somme des dépenses seules, brute; l'infobulle donne le total des entrées sur enveloppe du mois. Supprimable (dépensé recalculé, clés de déduplication libérées); montant, libellé et cible non modifiables hors suppression/réimport.
- RG18. Comptes : « <libellé> (entrée sur enveloppe) » en entrée, avec la source; jamais « Revenu » ni « Dépense ».
- RG19. Suppression d'une enveloppe qui porte de telles écritures : même garde-fou que pour ses dépenses.

## Parcours utilisateur

Nominal (import) : l'aperçu liste « REFUND TEMU +40,58 € » du compte Shopping 2026 ; nature « Entrée sur enveloppe », cible « Shopping 2026 » fixe, source « Temu », case cochée. J'importe : le compte monte de 40,58 € à la date bancaire, le dépensé de l'enveloppe baisse de 40,58 €, « Revenus » et « Disponible à placer » ne bougent pas. Réimport : doublon.

Nominal (saisie) : sur Opérations, je clique « Entrée d’argent », je choisis l'enveloppe « Shopping 2026 », le compte « Reçu sur » se fixe sur son compte, je saisis 40,58 € et j'ajoute.

Cas limites :
- Entrée supérieure au dépensé : dépensé négatif affiché avec son signe.
- Mois de rattachement clos ou verrouillé : ligne signalée, non importable ; saisie refusée.
- Crédit sur un compte d'enveloppe qui est en fait un virement : le choix « Virement interne » reste disponible.
- Changement de compte ou de nature dans l'aperçu : la nature est recalculée selon RG1/RG2.

## Design

Design proposé, validé par le développeur (aucune maquette). Réutiliser `organic.css`, pastilles, filtres et lignes d'aperçu (0013, 0015, 0016).

Aperçu, compte d'enveloppe :
```
 ☑ 14 oct.  REFUND TEMU   +40,58  [Shopping 2026]  Nature [Entrée sur enveloppe v]  Enveloppe : Shopping 2026  Source [Temu ____]  Mois [oct. v]
```
Pas de sélecteur « Rattacher à » pour cette nature. Pastille de nature distincte de « Revenu ».

Saisie, puce « Entrée d’argent » :
```
 Cible  [ v ]
   Lignes de revenu   Salaire · Prime
   Enveloppes         Shopping 2026 · Vacances
 Reçu sur  Shopping 2026 (compte de l'enveloppe, fixe)
```
Le libellé du champ devient « Ligne de revenu ou enveloppe ». États : vide, rempli, refus (mois clos), liste Opérations (type, montant en entrée), Budget (dépensé négatif, infobulle « dépensé = dépenses − entrées »).

## Impact technique (quoi)

- Domaine : `TxType` gagne un type entrant « Entrée sur enveloppe » (code proposé `ienv`) ; `ImportNature` gagne `entree_enveloppe` ; `budget.ts` : dépensé net d'enveloppe ; `bankMovements` : crédit réel et estimé ; `checkoff` et « Disponible à placer » ne le lisent pas ; toutes les lectures qui additionnent des sorties distinguent le sens (`spentOf`, `signedAmount`, filtres, `monthSummary`, `envelopeSpent`, `Accounts.tsx`, `quickEntry.ts`).
- Application : `natureOptions`, `targetIsValid`, `prepareImport`, `validateImport` (création de l'écriture), `addTransaction`/`deleteTransaction` (refus mois verrouillé/clos, compte archivé, enveloppe sans compte), récapitulatif et « traité ».
- Infrastructure / schéma : NOUVELLE migration additive : élargir `transactions_type_check` à `ienv` (en repartant de `var, env, epa, fix, rev`) ; la colonne `source` existe (0016) ; `supabaseRows`, `database.types.ts`, test de contrat. `import_rules` inchangé. Aucune reprise de données.
- Présentation : `ImportRow` (option, cible fixe sans sélecteur, source, pastille), `ImportWizard` (filtre, récapitulatif), `Expenses.tsx` (groupe « Enveloppes » de la puce, libellé de type, filtre, infobulle du total), Budget (dépensé négatif), `Accounts.tsx` (libellé).
- Documentation : architecture et ADR (entrée sur enveloppe = hors revenus, dépensé net sans plancher).

## Amendements nécessaires aux specs existantes (à écrire à la validation)

- 0015 : RG18 (« toute entrée est proposée Revenu ») : « sauf compte d'enveloppe (0024 RG1) » ; récapitulatif et filtres étendus ; RG26 renvoie à 0024 RG17.
- 0016 : RG3 (source facultative) s'applique aussi à l'entrée sur enveloppe ; RG23 (« remboursements = revenus ») : exception pour un compte d'enveloppe (0024) ; récapitulatif gagne la ligne RG16.
- 0011 : mention qu'une enveloppe peut recevoir une entrée externe qui réduit son dépensé.
- 0019 : réel d'enveloppe = dépenses − entrées sur enveloppe ; définition du solde estimé : ajouter ces entrées.

## Décisions prises par le développeur (2026-10-25)

- D1. Pas de plancher : dépensé négatif accepté (RG10).
- D2. Total de la liste Opérations brut, avec infobulle (RG17).
- D3. Sans objet dans ce lot (cible `fix`/`cre` reportée).
- D4. Cible = enveloppe du compte importé, fixe, sans sélecteur (RG3).
- D5. Sans objet (« Aucune ligne » reportée) ; l'entrée est cochée d'office (RG3).
- D6. Aucun mot-clé ; nature générale « Entrée sur enveloppe ».
- D7. Aucune reprise de données.
- D8. Saisie manuelle incluse (RG7 à RG9), amende l'ancienne exclusion.

## Reporté (spec ultérieure)

Remboursement sur ligne `var`/`fix`/`cre` avec réel négatif de ligne, « Aucune ligne (crédit libre) », solde estimé des cibles `fix`/`cre`, entrée sur enveloppe depuis un autre compte, mots-clés de détection, règles mémorisées, source mémorisée.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given un crédit « REFUND TEMU +40,58 € » sur un compte d'enveloppe, Then sa nature proposée est « Entrée sur enveloppe », sa cible est l'enveloppe du compte, il est coché, « Revenu » n'est pas proposé, « Importer 1 ligne ». (Auto sur la nature/état, Man sur l'écran)
- CA2. Given l'aperçu de cette ligne, Then aucun sélecteur « Rattacher à » n'est affiché et le nom de l'enveloppe est montré. (Man)
- CA3. Given un crédit sur un compte non enveloppe, Then « Entrée sur enveloppe » n'est pas proposée et le comportement actuel est inchangé. (Auto)
- CA4. Given l'import de CA1, Then une écriture entrante est créée avec compte, enveloppe, date bancaire, mois et source ; aucune ligne `rev` n'est créée. (Auto)
- CA5. Given une enveloppe dont le dépensé vaut 80 €, When 40,58 € sont importés, Then son dépensé vaut 39,42 € et son solde augmente de 40,58 €. (Auto)
- CA6. Given une entrée supérieure au dépensé, Then le dépensé est négatif, affiché avec son signe, sans plancher. (Auto sur le calcul, Man sur l'affichage)
- CA7. Given l'import, Then « Revenus », « Disponible à placer (réel) », « Revenus attendus » et « Reste à sortir » sont inchangés. (Auto)
- CA8. Given l'import, Then le solde réel du compte monte à la date bancaire (même dans un mois clos, sans changer les chiffres budget du mois clos) et le solde estimé monte à la même date, sans double compte. (Auto)
- CA9. Given un mois clos/verrouillé, un compte archivé ou une enveloppe sans compte, Then la ligne est non importable et l'ajout manuel est refusé. (Auto)
- CA10. Given un réimport, Then la ligne est un « Doublon » décoché quelle que soit la nature proposée ; un crédit et un débit identiques ont des empreintes différentes. (Auto)
- CA11. Given une source « Temu », Then elle est enregistrée avec l'écriture et absente de l'empreinte et des calculs. (Auto)
- CA12. Given le récapitulatif et les filtres, Then « Entrées sur enveloppe » (nombre, total) est distinct des revenus et filtre la nature ; un compte avec une entrée à importer n'est pas « traité ». (Auto sur les compteurs, Man sur l'écran)
- CA13. Given la puce « Entrée d’argent » de l'écran Opérations, Then le sélecteur propose les lignes de revenu et les enveloppes ; Given une enveloppe choisie, Then « Reçu sur » est fixe sur son compte et l'ajout crée l'entrée sur enveloppe ; Given une ligne de revenu, Then le comportement actuel est inchangé. (Auto sur l'action, Man sur l'écran)
- CA14. Given la liste « Opérations de {mois} », Then l'entrée est étiquetée « Entrée sur enveloppe », en entrée, le total reste la somme des dépenses seules et l'infobulle donne le total des entrées. (Man)
- CA15. Given la suppression d'une telle entrée, Then le dépensé revient à sa valeur précédente et ses clés de déduplication sont libérées ; mois verrouillé/clos : refus. (Auto)
- CA16. Given toute lecture de dépenses (totaux, bilan, enveloppes, `monthSummary`, liste Opérations), Then l'écriture n'est jamais comptée comme une dépense positive. (Auto)
- CA17. Given la migration, Then `ienv` est accepté en base, les anciennes valeurs restent valides, et sauvegarder puis recharger redonne le même `BudgetData`. (Auto sur la conversion/contrat, Man sur la base)
- CA18. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune.
