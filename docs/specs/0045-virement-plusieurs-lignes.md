# 0045 — Virement associé à plusieurs lignes variables

- Statut : validée
- Date : 2026-11-05
- Branche prévue : feat/virement_plusieurs_lignes

## Contexte et objectif
Certaines lignes variables (Alimentation, Loisirs, Carburant…) sont payées depuis un compte dédié (ex. Boursorama). Le budget du mois est alimenté par **un seul virement** vers ce compte. Aujourd'hui un virement (`AccountMovement`) ne peut être rattaché qu'à un seul élément (`target`), et l'encart « À venir ce mois-ci » (spec 0043) n'affiche pas ce virement comme « déjà sorti » du compte source de façon lisible.

Objectif : pouvoir associer un virement à **plusieurs lignes variables** du compte de destination, à la saisie comme après coup (virement importé du CSV, rattaché ensuite), et, dans « À venir ce mois-ci > Déjà sorti », voir une ligne « Virement → Boursorama : 360 € » dépliable sur les lignes liées et leurs dépenses réelles.

## Périmètre
Inclus :
- Association d'un virement à plusieurs lignes variables à compte dédié (écran Dépenses, création et édition d'un virement existant).
- Montant du virement saisi à la main = somme des budgets des lignes associées.
- Verrouillage du budget des lignes associées dans l'écran Budget.
- Affichage dans « Déjà sorti » de l'encart « À venir ce mois-ci », en remplacement du premier jet de `comingUp.ts`.
- Remplacement de `target` par une liste `targets` (domaine, migration, Supabase).

Exclus :
- Enveloppes et lignes d'épargne/investissement : elles gardent un seul rattachement (même comportement qu'aujourd'hui, sans changement d'écran).
- Association dans l'assistant d'import CSV (`ImportRow`) : non modifié.
- Répartition du montant entre lignes : il n'y en a pas.
- Impact sur le « reste » des lignes variables : aucun (informatif).

## Règles de gestion
- RG1. Un virement peut être associé à 0, 1 ou plusieurs **lignes variables à compte dédié** (`isDedicatedVarLine`) du mois du virement. Seules sont proposables les lignes dont le compte dédié est la **destination** du virement et qui comptent dans le budget (`isLineInBudget`).
- RG2. Un virement vers une enveloppe ou une ligne d'épargne/investissement garde **un seul** rattachement (une cible). Un virement ne mélange pas les deux familles : soit une cible enveloppe/épargne, soit des lignes variables.
- RG3. Modèle : `AccountMovement.targets` (liste de `MovementTarget`) remplace `target`. Les calculs existants (reste d'allocation, réel de l'épargne, remplacement de la contrepartie pointée) lisent la liste et se comportent comme avant pour une liste d'un élément.
- RG4. Virement **saisi à la main** (sans trace d'import) : à l'association de lignes, son montant est fixé à la somme des budgets des lignes cochées (arrondie à 2 décimales). Tant qu'au moins une ligne est associée, le champ « Montant » est en lecture seule.
- RG5. Le montant est **figé** à l'association : il n'est pas recalculé ensuite. Ajouter une ligne à un virement à la main déjà associé le recalcule à cet instant sur l'ensemble des lignes cochées ; retirer une ligne **ne change pas** le montant.
- RG6. Retirer **toutes** les lignes d'un virement saisi à la main rend son montant à nouveau modifiable ; il garde sa dernière valeur.
- RG7. Virement **importé** (avec trace d'import, y compris « Lié » ou « Une face ») : l'association est autorisée, son montant (celui du relevé) **n'est jamais modifié** par l'association.
- RG8. Écart : quand un virement a au moins une ligne associée et que la somme des budgets des lignes associées diffère du montant du virement, l'écart est affiché dans l'écran Dépenses, sous le champ montant : « Budget lignes 350 € / virement 360 € ». Pas d'écart affiché s'ils sont égaux.
- RG9. Les budgets d'une ligne associée à au moins un virement du mois sont **non modifiables** dans l'écran Budget, avec une indication (« Verrouillé : ligne associée au virement <libellé>. Retire-la du virement pour la modifier. »). Retirer la ligne du virement (ou supprimer le virement) la déverrouille.
- RG10. Une même ligne peut être associée à plusieurs virements du mois ; elle reste verrouillée tant qu'elle est associée à au moins un.
- RG11. Si une ligne associée n'existe plus dans le mois ou ne compte plus dans le budget, le lien est ignoré à l'affichage et dans la somme proposée ; il n'empêche rien.
- RG12. Mois clos : toute association, dissociation et modification de montant est refusée, comme pour les transferts (spec 0019, RG17).
- RG13. Un changement de destination du virement retire les lignes qui ne correspondent plus au nouveau compte (comme aujourd'hui pour `target`) et, si le virement est saisi à la main et garde au moins une ligne, recalcule le montant selon RG5.
- RG14. « À venir ce mois-ci > Déjà sorti » : pour le compte source du virement, un virement associé à au moins une ligne variable à compte dédié apparaît dans le groupe **« À virer »** sous la forme « Virement → <compte de destination> : <montant> ». Le total « Déjà sorti » du groupe compte **le montant du virement seul**.
- RG15. Cette ligne est dépliable (chevron). Dépliée, elle liste les lignes associées et, pour chacune, ses dépenses réelles du mois (toutes les dépenses de la ligne, sans filtre de compte), avec leur total. Ces dépenses sont **indicatives** : elles n'entrent dans aucun total ni dans aucun reste.
- RG16. Si une même ligne est associée à plusieurs virements du mois, ses dépenses ne s'affichent que sous le **premier** virement (par jour croissant, puis ordre de saisie) ; sous les suivants la ligne apparaît sans détail de dépenses.
- RG17. (Amendé le 2026-11-05.) Le virement ne modifie pas le reste d'une ligne variable associée (spec 0043 RG5 amendée : le reste d'une ligne fixe, d'un crédit ou d'une variable à compte dédié est 0 dès qu'elle a une écriture, qu'elle soit associée ou non). Mais dans « À venir ce mois-ci », une ligne variable associée à au moins un virement du mois (lien valide, RG11) n'est **plus comptée comme « à sortir »** du compte principal : ni dans les éléments de son groupe, ni dans le total du groupe, ni dans la marge. Le virement (son montant) est sa sortie, déjà comptée dans « Déjà sorti » (RG14). Ses dépenses déjà sorties ne sont pas non plus listées à part (elles sont indicatives sous le virement, RG15).
- RG18. Reprise des données : tout virement existant avec `target` devient `targets: [target]`, sans changement de montant ni de solde. Un rattachement existant à une ligne variable est donc repris tel quel (RG4 ne s'applique qu'à la prochaine association).
- RG19. Les anciennes lignes « <ligne> → <compte> » (une par ligne, sans dépliage) du premier jet de `comingUp.ts` disparaissent au profit de RG14.

## Parcours utilisateur
1. Nominal, saisie : dans Dépenses > Transfert, De « Compte principal », Vers « Boursorama ». « Lignes associées » propose Alimentation, Loisirs, Carburant (cases à cocher). Le développeur les coche : le montant passe à la somme des budgets (ex. 360 €), en lecture seule. Il valide.
2. Nominal, après coup : un virement de 360 € importé du CSV est ouvert en édition. Il coche trois lignes. Le montant reste 360 €. Si la somme des budgets est 350 €, « Budget lignes 350 € / virement 360 € » s'affiche.
3. Nominal, encart : dans « À venir ce mois-ci », le compte principal déplié montre dans « À virer > Déjà sorti » « Virement → Boursorama : 360 € ». Le déplier montre Alimentation, Loisirs, Carburant et leurs dépenses réelles.
4. Retrait d'une ligne : le développeur décoche Carburant sur un virement à la main de 360 € : le montant reste 360 €, « Budget lignes 315 € / virement 360 € » s'affiche, la ligne Carburant est déverrouillée dans Budget.
5. Retrait de toutes les lignes : le montant redevient modifiable.
6. Budget : la ligne Alimentation associée est verrouillée avec l'indication de RG9.
7. Cas limites : mois clos (refus), ligne supprimée, ligne hors budget, ligne liée à deux virements (RG10, RG16), virement sans ligne (comme aujourd'hui), destination changée (RG13).

## Design
Validé par le développeur (proposé par le PA, pas de maquette fournie). Composants et tokens existants (`ds/organic.css`, `Choice`, `field-label`, `alert-box`, chevron de `ComingUpCard`).

Encart « À venir ce mois-ci » (compte déplié, groupe « À virer », sous-section « Déjà sorti ») :
```
Déjà sorti
  > Virement → Boursorama ............ 360 €
      Alimentation ..... 212 € dépensés
        (détail des dépenses)
      Loisirs ........... 80 € dépensés
      Carburant ......... 45 € dépensés
```

Écran Dépenses, type Transfert (création et édition d'un virement) :
```
De: [Compte principal]   Vers: [Boursorama]
Lignes associées (facultatif)
  [x] Alimentation   200 €
  [x] Loisirs         80 €
  [x] Carburant       80 €
Montant: 360 €  (lecture seule, somme des budgets)
```
États : sans ligne proposable (« Aucune ligne variable pour ce compte » ; montant libre) ; avec écart (texte « Budget lignes X € / virement Y € » en ton d'avertissement) ; mois clos (champs désactivés, message existant) ; virement importé (montant en lecture seule non imposé par la somme, écart affiché).

Écran Budget : budget d'une ligne associée non modifiable, avec une courte indication de déverrouillage (RG9).

## Impact technique
- Domaine : `AccountMovement.targets` (remplace `target`), `types.ts` ; `movementTargets.ts` (`transfersTargeting`, `isItemTransferred`, `sameTarget` lisent la liste) ; `transfers.ts` (lignes proposables : variables à compte dédié, dans le budget, destination = compte du virement) ; `lineActuals.ts` ; somme des budgets, écart, ligne « verrouillée » (nouvelle fonction de domaine pure) ; `comingUp.ts` (remplace le premier jet : ligne virement dépliable, dépenses par ligne, règle RG16) ; `migrate.ts` (`target` → `targets`).
- Application : `accountMovements.ts` (création et édition avec plusieurs lignes, montant selon RG4 à RG7, refus mois clos) ; refus de modifier le budget d'une ligne verrouillée dans l'action de modification du budget.
- Infrastructure : `supabaseRows.ts` ; colonne `targets` (jsonb) à la place de `target`, migration de données ; contrat `budgetRepository.contract.ts` à jour.
- Présentation : `Expenses.tsx` (`TransferFields` et édition d'un virement : cases à cocher, montant en lecture seule, écart) ; `Budget.tsx` (ligne verrouillée) ; `ComingUpCard.tsx` (ligne dépliable).

## Critères d'acceptation
- CA1. Given un virement à la main Principal → Boursorama et trois lignes variables du compte (budgets 200, 80, 80), When je coche les trois lignes, Then le montant vaut 360 € et est en lecture seule. (Auto)
- CA2. Given ce virement, When je retire une ligne, Then le montant reste 360 € et l'écart « Budget lignes 280 € / virement 360 € » est calculé. (Auto, affichage manuel)
- CA3. Given ce virement, When je retire toutes les lignes, Then le montant est modifiable et vaut 360 €. (Auto)
- CA4. Given un virement importé de 360 € sans ligne associée, When j'associe trois lignes dont la somme des budgets est 350 €, Then son montant reste 360 € et l'écart est affiché. (Auto)
- CA5. Given une ligne associée à un virement, When je tente de modifier son budget dans Budget, Then c'est refusé et l'indication de déverrouillage est affichée ; When je la retire du virement, Then le budget redevient modifiable. (Auto pour la règle, manuel pour l'UI)
- CA6. Given une ligne associée à deux virements, When j'en retire un seul, Then elle reste verrouillée. (Auto)
- CA7. Given une ligne hors budget (`isLineInBudget` faux) ou d'un autre compte dédié, Then elle n'est pas proposée ni comptée dans la somme. (Auto)
- CA8. Given un mois clos, When j'associe, dissocie ou modifie le montant d'un virement, Then c'est refusé. (Auto)
- CA9. Given un virement associé à trois lignes, When je déplie le compte source dans l'encart « À venir ce mois-ci », Then « À virer > Déjà sorti » affiche « Virement → Boursorama : 360 € » et le total du groupe compte 360 €. (Auto)
- CA10. Given cette ligne dépliée, Then on voit les trois lignes avec leurs dépenses réelles du mois, et ces dépenses ne modifient aucun total ni reste. (Auto)
- CA11. Given une ligne associée à deux virements, Then ses dépenses ne s'affichent que sous le premier (par jour). (Auto)
- CA12. Given une ligne variable associée à un virement, Then son reste (budget − dépenses) est inchangé par le virement. (Auto)
- CA17. Given une ligne variable associée à un virement du mois, When j'ouvre « À venir ce mois-ci », Then elle n'est ni dans les éléments à sortir, ni dans le total du groupe, ni dans la marge ; When je la retire du virement (ou si elle n'est plus dans le budget), Then elle redevient à sortir. (Auto)
- CA13. Given des données avec `target` (ligne var, enveloppe, épargne), When elles sont migrées, Then `targets` contient le même élément, les montants et soldes sont inchangés, et les restes d'allocation et le réel de l'épargne ne bougent pas. (Auto)
- CA14. Given un virement vers une enveloppe ou une ligne d'épargne, Then il n'accepte qu'une cible et se comporte comme avant. (Auto)
- CA15. Given un changement de destination d'un virement associé, Then les lignes qui ne correspondent plus sont retirées. (Auto)
- CA16. Given la sauvegarde Supabase, When j'enregistre puis recharge, Then `targets` est restauré. (Auto, contrat du dépôt)

## Historique des amendements
- 2026-11-05 : la spec 0043 RG5 est amendée (reste des lignes fixes, crédits et variables à compte dédié) ; RG17 et CA12 restent vrais (le virement ne change pas le reste d'une ligne).
- 2026-11-05 : RG17 amendée (le développeur révise sa réponse Q4) : une ligne variable associée n'est plus comptée « à sortir » du compte principal dans l'encart ; CA17 ajouté. Statut inchangé.

## Questions ouvertes
Aucune.
