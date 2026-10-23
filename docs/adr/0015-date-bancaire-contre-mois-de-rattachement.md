# 0015 — Date bancaire des écritures contre mois de rattachement

- Statut : acceptée (décisions validées par le développeur)
- Date : 2026-10-23
- Spec liée : [0015-revenus-entrees-et-date-bancaire](../specs/0015-revenus-entrees-et-date-bancaire.md)

## Contexte
Une écriture n'avait qu'un mois de rattachement (`month`) et un jour (`day`). Un salaire reçu le 28/09 et rattaché à octobre était donc daté du 28/10 dans les soldes.

## Décision
- `Transaction` et `AccountMovement` portent un `bankDate` facultatif (`AAAA-MM-JJ`), posé par l'import (date de la ligne du fichier).
- Les soldes (`bankMovements`, donc Ledger, solde estimé et détail des comptes) rangent et datent une écriture par `bankDateOf` : sa `bankDate`, sinon `month`/`day` (repli, aucune reprise de données). Cela vaut même pour un mois déjà clos : le solde de ce mois change, pas son budget.
- Le budget (réel d'une ligne, totaux, bilan, « Disponible à placer ») continue de suivre `month`.
- La date bancaire n'est pas modifiable après import.

## Alternatives écartées
- Remplacer `month`/`day` par la date : le budget suivrait la date et le salaire de fin de mois irait au mauvais mois.
- Bloquer l'import dans un mois clos pour les soldes : refusé, la date bancaire est un fait.

## Conséquences
- Une écriture dont la date bancaire tombe avant le premier mois du budget, avant l'ouverture du compte, ou dans une année clôturée dont le report du compte a été ajusté, n'apparaît pas (ou plus dans les soldes suivants). L'aperçu d'import la signale par l'état « Date hors soldes » (non bloquant, la vraie date est gardée) ; `domain/balanceRange.ts` porte la règle commune au Ledger, au solde estimé et à l'avertissement.
- `BankMovement.attachedMonth` permet d'afficher « rattachée à octobre » en infobulle.
