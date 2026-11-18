# 0049 — Taux d'épargne et épargne réelle calculés sur le réel

- Statut : validée (option A retenue par le développeur le 2026-11-13)
- Date : 2026-11-13
- Branche prévue : feat/taux_epargne_reel
- Dépend de : 0028 (opérations affectées à un compte d'épargne), 0035 (dépenses financées par l'épargne), 0038 (écarts dépenses et épargne), 0027 (tableau de bord).

## Contexte et objectif

En novembre 2026, le Budget affiche « Écart épargne +366,21 € » (plus épargné que prévu) mais « Taux d'épargne −24,4 % » et « Épargne budgétisée : réelle −768,60 € ». Les deux chiffres semblent se contredire.

Cause (`monthSummary`, `src/domain/budget.ts`) : l'épargne réelle part de l'épargne **budgétée** (1 520 €), pas des réels des lignes, puis retranche :

| Terme | Novembre 2026 |
|---|---|
| Épargne brute budgétée (épargnes + placements + enveloppes) | 1 520,00 € |
| − dépenses des enveloppes | −66,20 € |
| − dépenses financées par l'épargne (0035) | −18,10 € |
| − opérations affectées à un compte d'épargne (0028) : artisan 1 850 € + matériaux 354,30 € | −2 204,30 € |
| = Épargne réelle | −768,60 € (−24,4 % de 3 150 €) |

Les virements réellement faits (Livret A −100 € au lieu de +400 €, LDDS −1 800 € au lieu de −800 €, Travaux +761,91 € au lieu de +1 100 €) n'y entrent pas. Le développeur veut un taux d'épargne qui reflète ce qui a réellement bougé, sans que le même flux soit compté dans un sens ici et dans l'autre ailleurs.

À noter : les opérations affectées comptent comme un versement dans le réel de la ligne (d'où LDDS = +50 €, Travaux = 1 116,21 €) mais comme une consommation d'épargne dans le taux. Le même flux est compté deux fois, de façon opposée.

## Existant (non dupliqué)

- Réel d'une ligne d'épargne = somme de ses écritures (0019, 0028) : à ne pas modifier.
- « Disponible (réel) » et « Écart épargne » (0038) : inchangés.
- 0035 RG7 et 0028 : l'épargne réelle baisse des dépenses financées par l'épargne. Cette spec les amende si l'option A ou B est retenue.

## Périmètre

Inclus :
- Nouvelle définition de l'« Épargne réelle » du mois et du « Taux d'épargne » (Budget, tableau de bord 0027, objectif « Taux d'épargne » de 0025/0032).
- Mise à jour de l'infobulle ou de l'explication de ces chiffres.

Exclus :
- Modification des réels des lignes, du Disponible, des soldes estimés.
- Rattachement des dépenses payées par l'épargne au budget (sujet distinct).
- Figer la valeur des mois clos : `monthSummary` est calculé à la volée, les mois clos sont donc recalculés avec la nouvelle définition (aucun instantané n'existe).

## Règles de gestion (proposition, option A)

- RG1. Épargne réelle du mois = variation nette réelle de l'épargne : virements entrants − virements sortants des comptes liés aux lignes d'épargne et de placement (hors virements entre deux lignes d'épargne, qui s'annulent), − dépenses financées par l'épargne (0035), + allocations d'enveloppes − dépenses nettes des enveloppes.
- RG2. Les opérations affectées à un compte d'épargne (0028) n'entrent pas dans l'épargne réelle : payées par le compte principal, elles ne font pas varier l'épargne.
- RG3. Taux d'épargne = épargne réelle / revenus budgétés du mois (dénominateur inchangé), 0 % si revenus à 0.
- RG4. L'épargne brute et son taux (budget) restent affichés tels quels.
- RG5. Aucun effet sur budget, réel des lignes, écarts, Disponible, soldes.
- RG6. Le tableau de bord (0027) et l'objectif de taux d'épargne reprennent la même valeur que le Budget.

## Design

Pas de nouvel écran. Les tuiles « Taux d'épargne » et « Épargne budgétisée / Réelle » changent de valeur. Ajouter une bulle d'explication sur « Réelle » : « Variation réelle de l'épargne : virements entrants − sortants − dépenses financées par l'épargne, enveloppes incluses ».

## Impact technique

- Domaine : `monthSummary` (`realSavings`, `savingsRate`), `assignedToSavingsNet` retiré du calcul du taux ; nouvelle somme des virements nets des lignes d'épargne (réutiliser `savingsLineEntries`, sans les opérations affectées).
- Application : aucun changement de données ; mise à jour des tests de 0028 (RG liée) et 0035 (RG7) selon l'option retenue.
- Infrastructure : aucune migration.
- Présentation : `Budget.tsx` (infobulle), `Dashboard.tsx` (valeurs reprises).

## Critères d'acceptation (option A)

- CA1. Given novembre 2026 (données du développeur), When je calcule l'épargne réelle, Then elle vaut −502,39 € et le taux −15,9 %. (Auto) *(valeurs indicatives à confirmer à l'implémentation)*
- CA2. Given un mois où tout est viré comme prévu, sans dépense, Then épargne réelle = épargne brute et taux brut = taux réel. (Auto)
- CA3. Given une opération affectée à un compte d'épargne, When je la crée, Then l'épargne réelle ne change pas. (Auto)
- CA4. Given une dépense financée par l'épargne, Then l'épargne réelle baisse de son montant. (Auto)
- CA5. Given un virement entre deux lignes d'épargne, Then l'épargne réelle ne change pas. (Auto)
- CA6. Given revenus à 0, Then le taux vaut 0 %. (Auto)
- CA7. Given le tableau de bord, Then taux et épargne réelle sont identiques à ceux du Budget. (Auto)
- CA8. Given l'infobulle de « Réelle », Then elle explique la définition. (Manuel)

## Questions ouvertes

Aucune bloquante. Décisions : option A retenue ; mois clos recalculés à la volée (voir Exclus). Le retrait de 800 € du 30/11 est une donnée, pas une règle : s'il s'agit d'un doublon, le développeur le supprime ; les valeurs de CA1 sont à recalculer en conséquence.
