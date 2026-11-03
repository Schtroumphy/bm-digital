# 0031 — Les anciennes données « Espèces » sont converties côté client au chargement

- Statut : acceptée (confirmée par le développeur)
- Date : 2026-11-03
- Spec liée : [0037-retrait-especes-comme-virement-sortant](../specs/0037-retrait-especes-comme-virement-sortant.md)

## Contexte
Il existe des retraits vers le compte Espèces, des transferts Espèces → enveloppe, des dépenses sur ce compte et des règles d'import vers lui.

## Décision
`migrateCashWithdrawals` (`domain/migrate.ts`), pure et idempotente, est appelée par `loadBudget` : retraits → `CASH_ID`, transferts d'alimentation → part du mois, dépenses `var` du compte → `payMode: 'especes'` sans compte, règles d'import → `CASH_ID`. Si elle a changé quelque chose, `loadBudget` enregistre aussitôt, comme pour les objectifs ; le diff écrit les lignes modifiées.

Précisions :
- Un ancien transfert `Espèces → enveloppe` tombant dans un mois sans allocation (ou à l'allocation plus petite que la part) garde sa part entière ; l'allocation du mois est relevée à la part. Le virement d'allocation (allocation − part) vaut alors 0, sans montant négatif, et le solde virtuel ne baisse pas du fait de la conversion.
- Un ancien transfert `Espèces →` autre chose qu'une enveloppe (par exemple Espèces → principal) n'est volontairement pas converti : aucun cas réel n'a été trouvé. Il reste tel quel sur le compte réservé.

## Alternatives écartées
- Script SQL de conversion : la logique serait dupliquée hors du domaine et non testée.

## Conséquences
- Aucune reprise de données en SQL ; la migration SQL reste additive.
- La conversion tourne à chaque chargement mais ne fait rien une fois les données converties.
