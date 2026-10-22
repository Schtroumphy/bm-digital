# 0006 — Une enveloppe est un compte bancaire

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-22
- Spec liée : [0011-une-enveloppe-un-compte](../specs/0011-une-enveloppe-un-compte.md)

## Contexte
Une enveloppe était un solde calculé à part (début + allocation − dépensé), sans lien avec un compte. Son argent restait aussi dans le compte principal : il était compté deux fois dans la clôture. La spec 0009 (amendement 6) avait déplacé l'argent vers un « compte des enveloppes » seulement quand l'allocation était pointée, sans supprimer le double compte.

## Décision
1. **Une enveloppe = un compte** `BankAccount` de `kind: 'enveloppe'`, référencé par `Envelope.accountId`. Il est créé, renommé et archivé avec l'enveloppe, toujours dans le budget, et absent des listes de choix.
2. **Solde dérivé du compte** dès son mois d'ouverture. Avant ce mois, l'ancien calcul `Ledger.envMonth` (historique `envHistory`) reste en lecture seule.
3. **L'allocation est un mouvement** du compte principal vers le compte de l'enveloppe, lu par `bankMovements` pour l'écran Comptes comme pour le Solde estimé : au 1er du mois en mode réel, au pointage en mode pointage.
4. **`BankAccount.envelopeId`** garde le lien du compte vers son enveloppe, y compris après sa suppression. Le mouvement est lu depuis les comptes d'enveloppe : supprimer une enveloppe vide n'enlève pas ses allocations passées de l'historique du principal.
5. **Pas de migration de données** : l'application n'est pas encore utilisée.

## Alternatives écartées
- Convertir l'historique (`envHistory`) en opérations de compte : réécrirait les soldes passés du principal (Q5).
- Lire l'allocation depuis `Envelope` : la suppression d'une enveloppe ferait disparaître ses allocations passées de l'historique du principal.
- Migrer les données existantes : code inutile, rien de réel à convertir.

## Conséquences
- Un seul calcul de solde pour les comptes ; la clôture compte chaque montant une fois.
- `BankAccount` gagne `envelopeId?` (et la colonne `bank_accounts.envelope_id` dans le futur schéma Supabase).
- Deux calculs coexistent pour les enveloppes (historique avant l'ouverture, compte ensuite) tant que l'historique importé existe.
- Une enveloppe ne se supprime que vide ; le transfert pour la vider reste à faire.
