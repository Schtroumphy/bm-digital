# 0020 — Un virement interne garde la trace de ses deux lignes du fichier (seconde trace) et l'import apparie les faces

- Statut : acceptée (écarts validés par le développeur)
- Date : 2026-10-23
- Spec liée : [0016-virements-internes-et-liaison-des-ecritures](../specs/0016-virements-internes-et-liaison-des-ecritures.md)

## Contexte
Un virement entre deux comptes de l'app apparaît deux fois dans les exports : un débit sur le compte émetteur, un crédit sur le compte récepteur. Avant la 0016, seul le débit créait un `AccountMovement` et le crédit était ignoré : la face crédit n'était pas tracée, un virement dont l'autre compte n'est pas exporté ne pouvait pas être importé côté crédit, et le crédit « Virement reçu » (par exemple sur un compte d'enveloppe) ne pouvait pas être importé du tout.

## Décision
- `AccountMovement` garde ses champs plats `importAccountId` / `fingerprint` / `rank` / `bankDate` comme **trace de la face débit** (rien ne change pour les données existantes) et gagne `creditTrace?: ImportTrace` pour la **face crédit**. Un mouvement né d'un crédit seul n'a pas de trace plate ; son `bankDate` est celui du crédit. Deux traces = « Lié », une = « Une face », zéro = saisi à la main (`domain/internalTransfers.linkStateOf`).
- Chaque face a sa propre date (`debitDateOf`, `creditDateOf`) : `bankMovements.transferMovements` débite l'émetteur à la date du débit et crédite le récepteur à la date du crédit. Le mouvement garde un seul mois de rattachement.
- Une clé (compte d'import, empreinte, rang) ne sert qu'une fois, toutes traces confondues (`tracesOf`). La base garantit l'unicité de chaque colonne de trace (index unique `account_movements_credit_import_key`) ; l'unicité croisée débit / crédit est garantie par l'application (`prepareImport`, `validateImport`).
- Nature « Virement interne » côté crédit : la nature `recu` (déjà dans `ImportNature`) devient importable avec, pour cible, le compte source (ou « Enveloppes (global) », ADR 0021).
- L'appariement est une fonction pure du domaine (`pairFaces`, tolérance 3 jours, une seule correspondance de chaque côté). À l'aperçu, il n'est proposé que si l'une des deux lignes « ressemble à un virement » (débit qualifié ou libellé « virement émis », crédit dont le libellé évoque un virement ou déjà qualifié), pour qu'une dépense et un salaire de même montant ne soient jamais reliés. Une paire est écrite en un seul mouvement, ou pas du tout (les deux cases sont liées). La liaison tardive (`findCompletable`) ajoute la trace manquante à un mouvement « une face » existant, sans créer d'écriture.
- Schéma : migration additive `20261023200904_internal_transfers.sql` (quatre colonnes `credit_*` tout-ou-rien, `transactions.source`, nature `recu` pour les règles).

## Alternatives écartées
- Une table de traces séparée (une ligne par face) : plus de jointures pour au plus deux faces, sans second besoin.
- Un tableau JSON de traces : perd l'unicité en base.
- Symétrie parfaite (traces `debit_*` et `credit_*`, colonnes plates abandonnées) : migration de données des mouvements existants, sans gain.

## Conséquences
- Le montant d'un virement lié ne se modifie pas (les deux lignes du fichier ont ce montant) ; délier une face retire sa trace.
- La nature `recu` change de sens : « Virement reçu » non importable (spec 0015, RG15 à RG17) devient « Virement interne » importable. Les règles `recu` sans cible déjà stockées sont ignorées (la base les refusait de toute façon).
