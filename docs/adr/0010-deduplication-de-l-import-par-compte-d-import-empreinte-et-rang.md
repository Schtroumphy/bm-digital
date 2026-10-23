# 0010 — Déduplication de l'import par compte d'import, empreinte et rang

- Statut : acceptée (validée par le développeur), complétée par [0013](0013-import-linxo-multi-comptes.md) pour l'import multi-comptes
- Date : 2026-10-23
- Spec liée : [0013-import-csv-depenses](../specs/0013-import-csv-depenses.md)

## Contexte
Le fichier de la banque n'a aucun identifiant de transaction. Deux fichiers peuvent se chevaucher et deux achats identiques peuvent tomber le même jour. De plus, le compte d'une transaction importée n'est pas toujours le compte du fichier : une dépense vers une enveloppe suit le compte de l'enveloppe (spec 0011), une dépense `var` vers une box à compte attribué suit ce compte (spec 0006).

## Décision
- `Transaction` et `AccountMovement` portent trois champs facultatifs, toujours ensemble : `importAccountId` (le compte résolu de la ligne, par la correspondance de comptes), `fingerprint` (date + montant + libellé normalisé) et `rank` (rang parmi les lignes de même empreinte dans le fichier).
- La clé de déduplication est (`importAccountId`, `fingerprint`, `rank`), garantie unique par un index unique partiel en base (transactions et mouvements entre comptes).
- Un doublon forcé par l'utilisateur prend le prochain rang libre de son empreinte (maximum des rangs pris + 1, les nouvelles lignes du même import étant servies d'abord). La clé reste unique et la ligne reste retrouvable.

## Alternatives écartées
- Dédupliquer sur `Transaction.accountId` : une dépense vers enveloppe ou vers une box à compte attribué se compare alors à un autre compte que celui du fichier, d'où des faux doublons ou des doublons manqués.
- Index non unique, rang conservé pour un doublon forcé : la base ne protège plus contre les vrais doublons et la déduplication peut se tromper sur les rangs.

## Conséquences
- Une colonne de plus dans la migration (`import_account_id`) par rapport au texte initial de la spec.
- Limite acceptée (RG24) : deux fichiers dont les rangs divergent pour des achats identiques le même jour peuvent produire un faux doublon ou un doublon manqué ; la case « forcer » sert de recours.
- Le rang d'une ligne forcée ne correspond plus à sa position dans le fichier.
- Supprimer une transaction importée puis réimporter le même fichier la fait revenir : voulu, il n'y a pas de liste noire des lignes supprimées.
