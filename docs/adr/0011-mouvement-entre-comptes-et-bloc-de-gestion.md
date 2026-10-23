# 0011 — Mouvement entre comptes créé par l'import, géré dans l'onglet Saisie

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-23
- Spec liée : [0013-import-csv-depenses](../specs/0013-import-csv-depenses.md)

## Contexte
Aucune écriture libre « du compte A vers le compte B » n'existait. Un retrait au distributeur ou un transfert interne importé doit débiter un compte et en créditer un autre, sans être une dépense ni toucher un réel, une allocation ou le « Reste à sortir ».

## Décision
- Nouvelle entité `AccountMovement` dans `BudgetData.accountMovements` (facultatif, sans migration de version), nouvelle table `account_movements`.
- `bankMovements` la lit (source, destination, jour) avec `counterpart: true`, dans les deux modes de mois : Ledger, Solde estimé et détail des comptes s'alignent sans autre changement. L'isolation des comptes hors budget (spec 0009, RG92) s'applique comme pour les anciens virements ; `ignoredMovements` liste en gris le côté ignoré du compte principal.
- Après import, le mouvement se gère dans un bloc « Mouvements entre comptes de <mois> » sous les dépenses de l'onglet Saisie : modification du libellé et du montant, suppression (refusées sur un mois verrouillé). Il n'y a pas de création libre.
- Les règles mémorisées sont dans `BudgetData.importRules` (table `import_rules`) ; la nature « À qualifier » n'existe que dans l'aperçu et n'est jamais stockée.

## Alternatives écartées
- Réutiliser `Transfer` : concept inerte depuis la spec 0009, sans jour ni empreinte.
- Gérer le mouvement seulement dans le détail des comptes (lecture seule) : ne permet ni correction ni suppression.

## Conséquences
- Le modèle de données et le schéma gagnent deux tables.
- Une saisie libre de mouvement reste à décider dans une spec ultérieure.
- Un retrait vers une enveloppe change seulement le solde de son compte (spec 0013, P7) : risque connu de double compte si l'allocation de l'enveloppe est aussi pointée.
