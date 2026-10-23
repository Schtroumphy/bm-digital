# 0021 — « Enveloppes (global) » : valeur réservée dans un mouvement, et le virement remplace les allocations du mois

- Statut : acceptée (écarts validés par le développeur)
- Date : 2026-10-23
- Spec liée : [0016-virements-internes-et-liaison-des-ecritures](../specs/0016-virements-internes-et-liaison-des-ecritures.md)

## Contexte
Le développeur envoie un virement global du compte principal vers un compte qui contient toutes les enveloppes (Lydia), puis répartit entre les enveloppes. Ce compte n'est pas importé (R9) : le débit global n'a pas de face crédit, et les crédits par enveloppe sont des lignes du fichier sur des comptes d'enveloppe sans débit correspondant. Il ne doit pas devenir un compte (R8, R12). La spec 0019 (RG10) retire déjà la contrepartie fictive d'une allocation pointée quand un transfert lui est rattaché.

## Décision
- « Enveloppes (global) » est la valeur réservée `ENVELOPES_ID = 'enveloppes'` dans `AccountMovement.fromAccountId` / `toAccountId` (`domain/internalTransfers.ts`). Débit « vers enveloppes » : `toAccountId = 'enveloppes'`. Crédit d'un compte d'enveloppe : `fromAccountId = 'enveloppes'`. Aucune colonne de plus (les colonnes sont du texte sans clé étrangère), aucun `BankAccount` créé, rien dans Comptes ni dans la clôture. `bankMovements.transferMovements` ne produit aucun mouvement pour ce côté ; `movementAccountName` l'affiche.
- Le choix est proposé comme destination d'un débit (hors compte d'enveloppe) et comme source d'un crédit sur un compte d'enveloppe (proposé par défaut) : `canUseEnvelopesPool`.
- Réconciliation avec la 0019 : tant qu'un mois a au moins un débit « vers enveloppes » (`hasEnvelopesDebit`), `estimatedMovements` ne compte la contrepartie fictive d'aucune allocation pointée de ce mois, comme si chaque allocation avait un transfert rattaché (RG10 de la 0019). Le solde réel n'a jamais compté d'allocation (0019, RG1), il n'est pas touché. Le principal est donc débité une fois, par le virement. Le montant d'allocation du budget n'est pas modifié ; supprimer le dernier débit rétablit les contreparties. Les crédits individuels n'ont pas de cible (ils ne remplacent pas une allocation en particulier).
- « Réparti : X sur Y » (`envelopeSplit`) est calculé, jamais stocké.

## Alternatives écartées
- Un compte `BankAccount` technique « Enveloppes » : ligne dans Comptes et la clôture, solde à tenir (refusé par R8, R12).
- Une colonne ou un champ `toEnvelopes: boolean` : deux représentations de la même chose (compte absent), pour un gain de lisibilité faible.
- Cibler une seule enveloppe par crédit pour remplacer son allocation : le virement global ne dit pas quelle enveloppe il alimente (R10 : remplacement mois par mois).

## Conséquences
- Une valeur réservée dans une colonne de texte : tout code qui lit `fromAccountId` / `toAccountId` doit passer par `isEnvelopesPool` / `movementAccountName` (les lectures actuelles le font).
- Un mois avec un débit global et des enveloppes sans crédit importé montre un solde estimé des enveloppes sans allocation : c'est voulu (R9), l'indication « Réparti » le signale.
