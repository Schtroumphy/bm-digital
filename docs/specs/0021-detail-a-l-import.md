# 0021 — Détail des lignes de l'import

- Statut : validée
- Date : 2026-10-23
- Branche prévue : feat/detail_import
- Dépend de : 0020 (champ « Détail » sur les écritures et règles communes RG1 à RG4).

## Contexte et objectif

À l'import d'un relevé (spec 0013), le libellé court sert de titre à l'écriture. Le texte brut de la banque (libellé et notes) est aujourd'hui perdu à l'écriture, hors infobulle de l'aperçu. Objectif : le garder dans le détail de l'écriture, modifiable dans l'aperçu avant validation.

## Périmètre

Inclus : détail prérempli et modifiable sur chaque ligne de l'aperçu d'import, enregistré sur l'écriture créée (`Transaction` ou `AccountMovement`).

Exclus : catégorie Linxo (reste séparée, pas reprise dans le détail), règles mémorisées (elles ne portent pas de détail), changement de l'empreinte, détail sur les lignes de revenu créées (« Nouvelle ligne de revenu » garde son nom, voir 0022), colonnes `Labels` et `N° de chèque`.

## Règles de gestion

- RG1. Le titre (libellé) de l'écriture importée reste le libellé court actuel de la ligne (spec 0013, RG31 : colonne `Libellé`).
- RG2. Le détail prérempli est le libellé brut du relevé : le libellé complet de la ligne (`Libellé` + `Notes`, spec 0013, RG31), tel qu'il est lu, sans normalisation d'empreinte (casse et accents conservés, espaces multiples réduits à un).
- RG3. Si ce texte est identique au titre (notes vides), le détail prérempli est vide : on ne répète pas le titre.
- RG4. Si le texte dépasse 200 caractères, il est coupé à 200 (règle commune 0020, RG2) ; la coupure est silencieuse mais le champ de l'aperçu montre le texte coupé, donc visible avant validation.
- RG5. Chaque ligne de l'aperçu permet de modifier le détail (champ une ligne, 200 max) avant l'import ; vider le champ importe sans détail.
- RG6. Le détail saisi ou prérempli est enregistré sur l'écriture créée, qu'elle soit une dépense, un revenu, un retrait ou un virement interne. Pour un virement interne lié (spec 0016), chaque écriture reçoit le détail de sa propre ligne d'aperçu.
- RG7. Le détail n'entre pas dans l'empreinte ni dans le rang (spec 0013, RG20, RG21) : le préremplissage ou la modification n'a aucun effet sur la déduplication.
- RG8. Réimporter un fichier n'écrase jamais le détail d'une écriture existante : les lignes déjà importées restent « déjà importées » et inchangées.
- RG9. Les règles mémorisées (« libellé contient X → cible ») ne stockent ni n'appliquent de détail.
- RG10. Les lignes ignorées, en erreur ou décochées ne créent rien : leur détail est perdu avec la ligne.

## Parcours utilisateur

- Nominal : je charge un fichier ; la ligne « Carrefour Market » a le détail « Carrefour Market PAIEMENT CB 12/10 CARTE 4970 » ; je l'allège en « Courses de la semaine » ; je valide ; l'écriture a ce détail dans Saisie.
- Limite : ligne sans notes, détail vide ; ligne dont le texte brut dépasse 200 caractères, détail coupé ; réimport du même fichier, détails saisis conservés.

## Design

Design validé (wireframe de référence). Composants existants : `ImportRow.tsx`, `text-input`, styles d'aperçu de `app.css`. Pour garder la ligne de l'aperçu lisible, le détail n'est pas une colonne de plus : une seconde ligne dans la ligne de l'aperçu, sous le libellé, avec le champ de saisie.

```
[x] 12/10  Carrefour Market        -61,10 €  Dépense  Courses  Octobre   Nouvelle
           Détail [ Carrefour Market PAIEMENT CB 12/10 CARTE 4970         ] 38/200
[x] 14/10  Salaire                +2 400 €   Revenu   Salaire  Octobre   Nouvelle
           Détail [                                                        ] 0/200
```

États : prérempli, vide, modifié, tronqué à 200, ligne déjà importée (champ absent), ligne non cochée (champ grisé).

## Impact technique

- Domaine : champ `detail` de la 0020, règle de normalisation commune.
- Application : la construction d'écritures depuis les lignes d'aperçu (`statementImport`) fournit le détail ; ligne d'aperçu porte un détail éditable, prérempli par RG2 à RG4 ; aucun changement de l'empreinte, du rang ni des règles.
- Infrastructure : aucun changement de schéma au-delà de la 0020.
- Présentation : `ImportRow.tsx`, `ImportWizard.tsx`.

## Critères d'acceptation

- CA1. Given une ligne avec `Libellé` et `Notes`, When l'aperçu est construit, Then son détail prérempli est le libellé complet et son titre le libellé court. (Auto)
- CA2. Given une ligne sans notes, When l'aperçu est construit, Then son détail est vide. (Auto)
- CA3. Given un texte brut de plus de 200 caractères, When l'aperçu est construit, Then le détail fait 200 caractères. (Auto)
- CA4. Given un détail modifié dans l'aperçu, When je valide l'import, Then l'écriture créée porte ce détail (`Transaction` et `AccountMovement`). (Auto)
- CA5. Given un détail vidé, When je valide, Then l'écriture est créée sans détail. (Auto)
- CA6. Given deux fichiers identiques à un détail près, When j'importe le second, Then les lignes sont reconnues comme déjà importées. (Auto)
- CA7. Given une écriture importée dont j'ai modifié le détail, When je réimporte le fichier, Then le détail est conservé. (Auto)
- CA8. Given un virement interne lié, When je valide, Then chaque écriture porte le détail de sa ligne. (Auto)
- CA9. Given une règle mémorisée créée à l'import, When je consulte ses données, Then elle ne contient aucun détail. (Auto)
- CA10. Given l'aperçu, When je regarde une ligne, Then le champ « Détail » est visible sous le libellé, avec compteur. (Manuel)

## Questions ouvertes

Aucune.
