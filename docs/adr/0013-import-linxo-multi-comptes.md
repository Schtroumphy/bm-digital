# 0013 — Import Linxo multi-comptes : compte par ligne, empreinte avec notes, catégorie hors empreinte

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-23
- Spec liée : [0013-import-csv-depenses](../specs/0013-import-csv-depenses.md) (amendement 1)

## Contexte
L'export Linxo remplace celui de la banque : un seul fichier contient les lignes de plusieurs comptes, le montant est signé, le libellé ne commence plus par un type d'opération, et Linxo peut changer la catégorie d'une même opération d'un export à l'autre. Complète l'[ADR 0010](0010-deduplication-de-l-import-par-compte-d-import-empreinte-et-rang.md).

## Décision
- Le compte d'une ligne est donné par une correspondance mémorisée (`BudgetData.importAccountLinks`, table `import_account_links`) entre le couple (nom du compte, nom de la connexion) du fichier et un compte actif de l'app, ou « Ne pas importer ». Aucun compte n'est déduit : un couple inconnu doit être rattaché dans l'aperçu, et les correspondances ne sont enregistrées qu'à la validation.
- Ce compte résolu est `importAccountId` : la déduplication et les rangs sont calculés par (compte résolu, empreinte, rang). Deux couples rattachés au même compte partagent donc leurs rangs.
- L'empreinte est date + montant + libellé + notes normalisés. La catégorie est conservée (`category`) hors empreinte et hors unicité ; elle sert seulement aux indices « Semblable déjà importée » et « Doublon probable » (même compte, jour et montant, autre empreinte), qui ne bloquent rien.
- Les natures sont proposées par une courte table de mots entiers (« retrait », « virement emis »), modifiable ligne par ligne ; les règles mémorisées l'emportent.

## Alternatives écartées
- Compte choisi à chaque import : impossible avec un fichier multi-comptes.
- Déduire le compte du nom du compte : risque d'importer sur un mauvais compte.
- Catégorie dans l'empreinte : une recatégorisation par Linxo créerait des doublons.

## Conséquences
- Changer une correspondance plus tard ne modifie pas les lignes déjà importées ; un réimport peut alors créer des doublons (limite acceptée, atténuée par les indices).
- Les indices « Semblable déjà importée » et « Doublon probable » comparent le mois de rattachement et le jour stockés : une ligne rattachée à un autre mois que celui de sa date n'est pas détectée (limite acceptée).
- Linxo peut reformuler un libellé entre deux exports : doublon non détecté, d'où les indices.
- Corriger un couple dans l'aperçu refait les lignes de ce compte en gardant les corrections des lignes inchangées.
- Un compte du fichier peut être rattaché au compte d'une enveloppe (les dépenses se font aussi depuis les enveloppes). Les lignes de ce compte ne peuvent alors être dépensées que depuis cette enveloppe (spec 0011, RG2 : jamais de ligne variable sur le compte d'une enveloppe), proposée par défaut ; seuls les comptes archivés sont exclus de la liste.
