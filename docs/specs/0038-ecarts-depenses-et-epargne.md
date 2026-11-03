# 0038 — Écarts dépenses et épargne (remplacent le Surplus)

- Statut : implémentée (amendée le 2026-11-03)
- Date : 2026-11-03
- Branche prévue : feat/ecarts_depenses_epargne

## Contexte et objectif
Le KPI « Surplus » de l'écran Budget vaut revenus réels − toutes les sorties réelles. Il compte l'épargne comme une sortie : épargner plus que prévu le fait baisser, alors que c'est positif. On le remplace par deux indicateurs mesurés contre le budget, sans les revenus : « Écart dépenses » et « Écart épargne ». Chacun dit clairement si l'on fait mieux ou moins bien que prévu.

## Périmètre
Inclus :
- Suppression du Surplus (calcul, champ du résumé du mois, KPI, libellé « Marge négative », étoile jaune).
- Ajout des deux écarts dans le résumé du mois et de deux cartes KPI sur l'écran Budget.
- Remplacement du test du Surplus.

Exclus :
- La « Marge » de la carte Pointage par compte (PointageCard), qui reste inchangée.
- Les autres KPI (Reste à placer, Revenus, Dépenses, Épargne budgétisée, Taux d'épargne, Fond de secours).
- Les revenus : ils n'entrent dans aucun des deux écarts.
- Tout changement du modèle de données ou du schéma Supabase.

## Règles de gestion
- RG1. Une ligne « compte dans le budget » si elle passe le filtre actuel (`budgetLines`) : les lignes d'un compte hors budget sont exclues.
- RG2. Une ligne sans réel (réel vide) compte à son budget, comme à la validation du mois. Son écart est donc 0.
- RG3. Écart dépenses = somme du budget − somme du réel, sur les blocs crédits, fixes et variables. Positif = on a dépensé moins que prévu.
- RG4. Écart épargne = somme du réel − somme du budget, sur les blocs épargnes et placements, plus les allocations d'enveloppes du mois. Positif = on a épargné plus que prévu.
- RG5. Les allocations d'enveloppes n'ont pas de réel : elles comptent à leur budget et n'ont aucun effet sur la valeur de l'écart épargne. Elles restent dans sa définition.
- RG6. Les montants sont arrondis à 2 décimales.
- RG7. Les revenus (budget ou réel) n'influencent aucun des deux écarts.
- RG8. Affichage : montant avec signe explicite, au format existant de `money(n, true)` (centimes omis pour un montant entier) : « +120 € », « −35 € », « +12,50 € ». Si la valeur est > 0 elle est en vert (`GOOD`, déjà importé dans `Budget.tsx` depuis `components/tone`), si elle est < 0 elle est en rouge (`BAD`). À 0 : couleur neutre, montant « 0 € » sans signe, pas de ligne `kpi-sub`. `money()` n'est pas modifié.
- RG9. Ligne `kpi-sub` explicative, seulement si l'écart ≠ 0 :
  - Écart dépenses > 0 : « Moins dépensé que prévu » ; < 0 : « Plus dépensé que prévu ».
  - Écart épargne > 0 : « Plus épargné que prévu » ; < 0 : « Moins épargné que prévu ».
  - Texte en rouge si l'écart est < 0. Texte en vert (`GOOD`) si l'écart est > 0, comme la valeur.
- RG10. Chaque libellé de carte a une infobulle (`title`) qui explique le calcul et rappelle qu'une ligne sans réel compte à son budget.
- RG11. Le Surplus et son libellé « Marge négative » n'existent plus nulle part dans l'application.
- RG12. Un mois non initialisé affiche les cartes en aperçu, comme les autres KPI (valeurs à 0, donc neutres).

## Parcours utilisateur
- Nominal : le mois est initialisé, aucun réel saisi. Les deux écarts valent 0 (neutres). L'utilisateur saisit un réel de variable inférieur au budget : l'écart dépenses devient positif, avec « Moins dépensé que prévu ».
- Épargne plus élevée que prévu : un réel d'épargne supérieur au budget donne un écart épargne positif. L'ancien Surplus aurait baissé dans ce cas.
- Dépassement : un crédit réel supérieur à son budget donne un écart dépenses négatif, en rouge, avec « Plus dépensé que prévu ».
- Cas limite : une ligne d'un compte hors budget est ignorée. Un mois sans ligne donne deux écarts à 0.
- Cas limite : mois clôturé ou année clôturée. Les cartes s'affichent normalement, en lecture seule.

## Design
Design proposé, validé par le développeur (pas de maquette).

```
┌──────────┬─────────┬─────────┬────────┬────────┬────────┬────────┬───────────┐
│ Reste à  │ Écart   │ Écart   │Revenus │Dépenses│Épargne │Taux    │ Fond de   │
│ placer   │dépenses │ épargne │        │        │budgét. │d'épargne│ secours  │
│ 1 200 €  │ +45 €   │ −10 €   │ 2 800 €│ 1 600 €│ 900 €  │ 28 %   │ 1200/3000 │
│ Dispo... │Moins dép│Moins ép.│        │        │Réelle..│Brut .. │ ▓▓▓░░     │
└──────────┴─────────┴─────────┴────────┴────────┴────────┴────────┴───────────┘
```

- La rangée `.summary` passe de 7 à 8 cartes, sur une seule ligne. La grille de colonnes de `.summary` (`app.css`) est à adapter pour que tout tienne à 1440 px, sans retour à la ligne des montants ni des libellés (à vérifier visuellement).
- Les deux cartes `panel kpi` prennent la place du Surplus, juste après « Reste à placer », avec `kpi-label`, `kpi-value` et `kpi-sub` comme le KPI actuel.
- L'étoile jaune (et la constante `STAR` si elle n'a plus d'usage) disparaît.
- Aucune icône n'est requise.
- États : à 0 (neutre, sans sous-texte), positif (vert + sous-texte vert), négatif (rouge + sous-texte rouge), aperçu d'un mois non initialisé.
- Maquette ci-dessus : « +45 € » est en vert, « −10 € » en rouge.
- Le format `money(n, true)` existe déjà pour le signe explicite.

## Impact technique
- Domaine (`domain/budget.ts`) : suppression de `surplus()` et du champ `MonthSummary.surplus`. Ajout d'un calcul de l'écart dépenses et de l'écart épargne, exposés dans `MonthSummary` (par exemple `expenseGap` et `savingsGap`). Le calcul utilise les lignes comptant dans le budget et les allocations du mois.
- Application : aucun changement d'action ni de port.
- Infrastructure et schéma Supabase : aucun changement.
- Présentation (`Budget.tsx`, `app.css`) : remplacement de la carte Surplus par les deux cartes, ajustement de la grille `.summary`, nettoyage des constantes devenues inutiles.
- Tests : le `describe('surplus')` de `budget.test.ts` est remplacé par des tests des deux écarts.

## Critères d'acceptation
(AC1 à AC7 : tests automatisés sur le domaine, `budget.test.ts` ; AC8 à AC11 : vérification par le reviewer sur l'écran.)

- AC1. Given un mois initialisé sans aucun réel, When on calcule le résumé, Then l'écart dépenses et l'écart épargne valent 0.
- AC2. Given une variable de budget 100 € et de réel 80 €, When on calcule, Then l'écart dépenses = +20 €.
- AC3. Given un crédit de budget 80 € et de réel 90 €, When on calcule, Then l'écart dépenses = −10 €.
- AC4. Given une épargne de budget 200 € et de réel 250 €, When on calcule, Then l'écart épargne = +50 €.
- AC5. Given une allocation d'enveloppe de 10 €, When on calcule, Then elle ne modifie pas l'écart épargne.
- AC6. Given un revenu dont le réel est différent du budget, When on calcule, Then les deux écarts sont inchangés.
- AC7. Given une ligne d'un compte hors budget avec un réel différent du budget, When on calcule, Then elle n'influence aucun écart.
- AC8. Given l'écran Budget, When on le consulte, Then il n'y a plus de « Surplus », de « Marge négative » ni d'étoile, et les cartes « Écart dépenses » et « Écart épargne » sont présentes (8 cartes sur une ligne à 1440 px).
- AC9. Given un écart < 0, When la carte s'affiche, Then la valeur et le `kpi-sub` sont en rouge, avec un signe « − ».
- AC10. Given un écart > 0, When la carte s'affiche, Then la valeur porte un signe « + », est en vert (`GOOD`), et le `kpi-sub` correspondant est affiché, lui aussi en vert (`GOOD`).
- AC11. Given un écart = 0, When la carte s'affiche, Then la valeur « 0 € » est neutre, sans signe, et aucun `kpi-sub` n'est affiché.
- AC11bis. Given un écart entier (par exemple 120) et un écart avec centimes (par exemple 12,5), When la carte s'affiche, Then on lit « +120 € » et « +12,50 € » (format de `money(n, true)`).
- AC12. Given la carte Pointage par compte, When on la consulte, Then sa « Marge » est inchangée.

## Amendement du 2026-11-03
Demandé par le développeur après la revue :
1. Un écart positif s'affiche en vert (`GOOD`) et non plus dans la couleur par défaut (RG8, AC10, maquette). Le `kpi-sub` d'un écart positif est aussi en vert. Le rouge pour un écart négatif et le neutre à 0 ne changent pas.
2. Le format des montants est celui de `money(n, true)` : pas de centimes pour un montant entier (« +120 € », « 0 € »). RG8 et ses exemples sont alignés, AC11bis ajouté.

## Questions ouvertes
Aucune.
