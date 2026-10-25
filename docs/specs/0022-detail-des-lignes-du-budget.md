# 0022 — Détail des lignes du budget

- Statut : validée
- Date : 2026-10-23
- Branche prévue : feat/detail_lignes_budget
- Dépend de : 0020 (règles communes RG1 à RG4 du détail).

## Contexte et objectif

Une ligne du budget (revenu, crédit, fixe, variable, épargne, placement) n'a qu'un nom. Le développeur veut pouvoir noter un contexte permanent (« Bail jusqu'en 2027, révision en janvier », « Virement le 5 »), commun à tous les mois de la ligne.

## Périmètre

Inclus : champ « Détail » sur toutes les lignes (`Line`) de l'écran Budget et du modèle de budget (écran Modèle), tous blocs (`rev`, `cre`, `fix`, `var`, `epa`, `inv`).

Exclus : enveloppes (0023), écritures (0020), détail propre à un seul mois, historique des modifications.

## Règles de gestion

- RG1. Règles communes de la 0020 : facultatif, distinct du nom, 200 caractères, une ligne de texte, sans effet sur les calculs.
- RG2. Le détail appartient à la ligne (sa clé stable), pas à un mois : il est le même dans tous les mois où la ligne existe. Le modifier dans un mois ou dans le modèle le modifie partout.
- RG3. Un mois créé plus tard, ou une ligne ajoutée au modèle, reprend le détail de la ligne. Une ligne créée dans un seul mois (ex. revenu imprévu, spec 0005) a son détail seulement dans ce mois.
- RG4. Le détail se saisit dans l'écran Budget (à côté du nom de la ligne) et dans l'écran Modèle, à l'ajout et à la modification.
- RG5. Affichage : seconde ligne grise tronquée sous le nom, infobulle complète (règle commune 0020, RG3). L'infobulle existante de la ligne (pointage, écritures portées, etc.) n'est pas remplacée : le détail y est ajouté en tête si présent.
- RG6. Mois verrouillé ou clos : le détail reste modifiable, car c'est une information sans effet sur les chiffres.
- RG7. Renommer ou supprimer une ligne : le détail suit la ligne ; supprimer la ligne supprime son détail.
- RG8. Les lignes sans détail (existantes) restent valides, aucune migration visible.
- RG9. Une ligne créée depuis l'import (« Nouvelle ligne de revenu », spec 0015) naît sans détail.

## Parcours utilisateur

- Nominal : dans Budget, sur « Loyer », j'ajoute le détail « Bail jusqu'en 2027 » ; je change de mois, le détail est le même ; je crée un nouveau mois, il l'a aussi.
- Je modifie le détail dans le mois de mars : il change aussi en février (ouvert ou clos) et dans le modèle.
- Cas limite : ligne d'un seul mois, détail limité à ce mois ; détail de 200 caractères, tronqué.

## Design

Design validé (wireframe de référence). Composants : `EditableText` (nom de ligne dans `Budget.tsx`), `cell-input is-text`, `line-name`.

```
Fixes
  Loyer                              850,00 €   [ ] pointé    Principal
  Bail jusqu'en 2027, révision en jan…        (gris, tronqué, infobulle)
  Internet                            30,00 €   [ ]           Principal
```

Édition : clic sur la seconde ligne (ou sur « + détail » discret au survol d'une ligne sans détail) ouvre un champ de texte 200 max, validé par Entrée ou perte de focus, annulé par Échap. États : sans détail (rien, « + détail » au survol), avec détail, édition, verrouillé (même droit que RG6).

## Impact technique

- Domaine : champ facultatif `detail` rattaché à la clé de ligne, commun à tous les mois ; propagation dans le modèle (`TemplateLine`) et dans les mois créés.
- Application : action de modification du détail d'une ligne, sans effet sur budget, réel, pointage ; règle de normalisation de la 0020.
- Infrastructure / Supabase : champ additif, anciennes données valides ; le « comment » (détail porté par chaque ligne et propagé, ou stocké une fois par clé) appartient à l'implementer, le comportement RG2 est imposé.
- Présentation : `Budget.tsx`, `Template.tsx`.

## Critères d'acceptation

- CA1. Given une ligne, When j'ajoute un détail, Then il s'affiche en seconde ligne grise avec infobulle complète. (Manuel)
- CA2. Given une ligne présente sur plusieurs mois, When je modifie son détail dans un mois, Then il est identique dans tous les mois et le modèle. (Auto)
- CA3. Given un détail sur une ligne du modèle, When un nouveau mois est créé, Then la ligne porte le détail. (Auto)
- CA4. Given un détail de plus de 200 caractères ou fait d'espaces, When j'enregistre, Then il est limité à 200 ou absent. (Auto)
- CA5. Given une ligne avec détail, When je calcule budget, réel, pointage, soldes, Then rien ne change. (Auto)
- CA6. Given une ligne supprimée, When je la recrée avec le même nom, Then elle n'a pas l'ancien détail. (Auto)
- CA7. Given un mois clos, When je modifie le détail d'une ligne, Then il est enregistré et aucun chiffre ne bouge. (Auto)
- CA8. Given des données sans détail, When je les charge, Then l'écran Budget s'affiche comme avant. (Auto)
- CA9. Given une ligne `rev` créée par l'import, When elle est créée, Then elle n'a pas de détail. (Auto)

## Questions ouvertes

Aucune.
