# 0003 — Migration des comptes bancaires au chargement, dans le store

- Statut : acceptée
- Date : 2026-10-20
- Spec liée : [0002-comptes-bancaires](../specs/0002-comptes-bancaires.md)

## Contexte
Les comptes bancaires s'ajoutent à des données déjà enregistrées (`firstMonth` non nul, transactions avec `source`). Il ne faut ni ré-initialisation, ni changement de `version`, et le repository doit rester un simple `load`/`save`.

## Décision
- **Migration dans le store** : `StoreProvider` appelle `migrateBankAccounts` (fonction pure du domaine) juste après `repository.load()`. Le repository n'en sait rien, `version` reste 1. Elle est idempotente (déclenchée par l'absence de comptes) et enregistrée au prochain `save`.
- **`accountId` absent = compte principal**. Pour que changer de principal ne déplace pas l'historique, `setMainBankAccount` (`application/bankAccounts.ts`) écrit d'abord l'ancien principal sur toutes les lignes, lignes du modèle et transactions sans compte.
- **`openingConfirmed?` sur `BankAccount`** : champ optionnel qui pilote le bandeau « saisis les soldes de départ » (RG29). Il passe à vrai dès qu'un solde de départ est saisi (même 0) ou que le bandeau est validé.
- **Assistant sur un budget déjà démarré** : quand `firstMonth` est non nul, `mergeAccounts` n'ajoute que les comptes nouveaux du brouillon. Les soldes saisis pour les comptes existants (principal, Espèces) sont ignorés, sans changement d'UI ; ils se règlent dans l'onglet « Comptes ».

## Alternatives écartées
- Migration dans `localRepository` : dupliquerait la règle pour chaque repository futur (Supabase).
- Passer `version` à 2 : migration par version inutile, la détection par l'absence de comptes suffit.
- Écraser les comptes existants avec le brouillon : perdrait des soldes déjà saisis.

## Conséquences
- Le store dépend d'une fonction du domaine, le repository reste simple.
- Le champ `openingConfirmed` fait partie du modèle et devra figurer dans le futur schéma Supabase.
- Un utilisateur qui retape un solde dans l'assistant (budget démarré) ne verra pas son effet : à surveiller si cela prête à confusion.
