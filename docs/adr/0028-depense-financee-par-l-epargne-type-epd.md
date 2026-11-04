# 0028 — Dépense financée par l'épargne : type de transaction `epd`, catégorie ligne d'épargne

- Statut : acceptée
- Date : 2026-10-30
- Spec liée : [0035-depenses-rattachees-a-l-epargne](../specs/0035-depenses-rattachees-a-l-epargne.md)

## Contexte
Des dépenses sont payées depuis un compte d'épargne (compte tampon « Lydia Vacances ») et doivent être rattachées à la ligne d'épargne du mois (`epa`, « Lydia Holidays »), pas à une ligne variable ou fixe. Elles comptent comme des dépenses, baissent l'Épargne réelle et le taux d'épargne, et laissent « Disponible à placer » inchangé. Le type `epa` existant est une sortie d'épargne qui crédite un compte récepteur (`accountId` = récepteur) ; il ne doit pas changer (spec 0007).

## Décision
Nouveau type de transaction `epd` (« dépense d'épargne ») : `target` = clé de la ligne `epa`, `accountId` = compte PAYEUR (le compte dédié de la ligne, de type `epargne`), aucun compte crédité. La migration recrée le `check` de `transactions.type` avec `'epd'` et celui de `import_rules.target_kind` avec `'savings'` (nouvelle cible d'import `{ kind: 'savings', key }`).
- Effets : `realMovements` / `estimatedMovements` débitent le compte payeur (comme toute dépense) ; `monthSummary` ajoute `fundedBySavings` (retiré de `realSavings`) et `expensesReal` ; `availableReal`, « Reste à placer », surplus et lignes variables/fixes ne lisent pas `epd`.
- Exception à l'[ADR 0014](0014-ligne-portee-par-ses-depenses.md) RG3 : le critère de validité de la cible compare `linkedAccountId` de la ligne `epa` au compte de la ligne importée (`savingsExpenseAccountId`), et non le compte de la ligne.
- Une `epd` reste une `epd` : `updateTransaction` refuse de la convertir vers un autre type (et l'inverse) ; seule la ligne `epa` cible (liée au même compte) peut changer.

## Alternatives écartées
- Colonne nullable sur `epa` (par exemple `funded_by_savings`) : plus légère côté base, mais `accountId` changerait de sens (payeur ou récepteur) selon un drapeau, et chaque lecteur de `epa` (`savingsOut`, crédit du récepteur, défaut au compte principal) devrait penser à le tester, sans aide du compilateur.
- Import en `var` + « hors budget » (0031) ou affectation (0028) : sort la dépense des dépenses et ne réduit pas l'Épargne réelle.

## Conséquences
- Positives : sens de `accountId` sans ambiguïté, CA8 garanti par construction, TypeScript signale les `Record<TxType, …>` à compléter.
- Négatives : la migration `20261030120000_savings_funded_expense.sql` doit être appliquée AVANT de déployer le code ; tout nouveau lecteur de `TxType` doit décider quoi faire de `epd`.
- À surveiller : le solde de la ligne `epa` et celui de son compte dédié restent deux chiffres distincts (spec 0007 RG8) ; l'`epd` ne touche que le second.
