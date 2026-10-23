# 0020 — Détail des écritures (écran Saisie)

- Statut : validée
- Date : 2026-10-23
- Branche prévue : feat/detail_ecritures
- Ordre : 1re des 4 specs « détail » (0020 écritures, 0021 import, 0022 lignes du budget, 0023 enveloppes). Les autres s'appuient sur les règles communes ci-dessous (RG1 à RG4).

## Contexte et objectif

Besoin du développeur : « mettre un détail / description à chaque ligne pour ajouter du contexte ». Chaque écriture de Saisie a un libellé (titre court). Il manque un second champ libre, « Détail », pour garder le contexte (pourquoi, pour qui, référence) sans alourdir le titre.

Cette spec couvre les écritures de l'écran Saisie : les `Transaction` (types var, env, epa, fix, rev) et les `AccountMovement` (retraits, virements internes).

## Périmètre

Inclus : champ « Détail » à l'ajout et à la modification d'une écriture ; affichage en seconde ligne grise tronquée avec infobulle ; recherche (RG9) ; compatibilité des anciennes données et de la sauvegarde.

Exclus : lignes du budget (0022), enveloppes (0023), reprise automatique à l'import (0021), écarts constatés (`Adjustment`) et pointage fictif (0019), règles mémorisées d'import, catégorie Linxo (reste un champ distinct), plusieurs lignes de texte, mise en forme.

## Règles de gestion

Règles communes à toutes les specs « détail » (0020 à 0023)
- RG1. Le détail est un champ facultatif, distinct du libellé (ou du nom) qui reste le titre court. Absent = pas de détail.
- RG2. Texte brut sur une seule ligne, 200 caractères maximum. La saisie est bloquée au 200e caractère. Les espaces de début et de fin sont retirés ; un détail vide ou fait d'espaces équivaut à « pas de détail ».
- RG3. Affichage : seconde ligne en gris sous le titre, tronquée avec des points de suspension si elle ne tient pas ; le texte complet est dans l'infobulle. Sans détail, aucune seconde ligne n'est réservée (la ligne garde sa hauteur actuelle).
- RG4. Le détail est de l'information : il n'entre dans aucun calcul (budget, soldes, bilans).

Écritures
- RG5. Le formulaire d'ajout de l'écran Saisie propose un champ « Détail » (facultatif) à côté du libellé.
- RG6. Une écriture existante (`Transaction` ou `AccountMovement`) peut voir son détail ajouté, modifié ou vidé, dans le même mode de modification que son libellé. Aucune autre donnée n'est touchée. Le point d'entrée est découvrable : une icône crayon (bouton réel, `aria-label` « Ajouter un détail » ou « Modifier le détail ») apparaît à côté du libellé au survol de la ligne et au focus clavier, sur les lignes avec ou sans détail ; le clic souris sur le libellé reste possible, mais seul le crayon est un arrêt clavier (amendement 2026-10-23).
- RG7. Le détail s'applique à chaque écriture individuellement. Dans un virement lié (spec 0016), chaque écriture a son propre détail : modifier l'un ne modifie pas l'autre.
- RG8. Le détail n'entre pas dans l'empreinte d'une écriture importée (spec 0013, RG20) ni dans son rang ; le modifier ne rend jamais une écriture « nouvelle » au prochain import.
- RG9. La recherche existante de Saisie (« Rechercher un libellé ») portait sur le libellé seul. Elle porte aussi sur le détail (placeholder « Rechercher un libellé ou un détail »). Aucun nouveau filtre.
- RG10. Les écritures sans détail (existantes, importées avant la spec, créées par une autre voie) restent valides et s'affichent comme avant. Aucune migration visible.
- RG11. Mois verrouillé ou clos : le détail reste modifiable, car c'est une information sans effet sur les chiffres.

## Parcours utilisateur

- Nominal : j'ajoute « Pharmacie » 23,40 € avec le détail « Ordonnance du Dr Martin, mutuelle à demander » ; la liste affiche le titre puis le détail en gris ; au survol, l'infobulle montre le texte complet.
- Je modifie une écriture pour vider son détail : la seconde ligne disparaît.
- Je tape plus de 200 caractères : la saisie s'arrête à 200.
- Je cherche « mutuelle » : l'écriture ci-dessus remonte .
- Cas limite : écriture ancienne sans détail, affichage inchangé. Détail de 200 caractères, tronqué visuellement, complet en infobulle.

## Design

Design validé (aucune maquette fournie, wireframe de référence). Composants et tokens existants : `text-input`, `field-w`, `field-label`, `tx-filters`, styles de `src/presentation/ds/organic.css` ; une classe de texte secondaire gris tronqué (ellipsis), à réutiliser si elle existe.

Amendement 2026-10-23 (retour du test manuel : l'édition d'un détail existant n'était pas trouvée). Icône crayon discrète (`.entry-edit`, composant `EntryLabel`) à droite du libellé, sur les deux listes (transactions et mouvements entre comptes). Invisible au repos (opacité 0, place réservée donc hauteur et alignement inchangés), visible au survol de la ligne et au focus clavier (contour), toujours visible à opacité réduite sous `@media (hover: none)`. Utilisable en mois clos ou verrouillé (RG11), même ouverture que le clic sur le libellé (`openDetail`).

Formulaire d'ajout :

```
Libellé [ Pharmacie        ]  Montant [ 23,40 ]  Type [..]  Cible [..]  Compte [..]
Détail  [ Ordonnance du Dr Martin, mutuelle à demander         ] (facultatif, 200 max)  [Ajouter]
```

Liste :

```
[ ] 12  Pharmacie                         Variables · Santé     -23,40 €
        Ordonnance du Dr Martin, mutuelle à d…   (gris, tronqué, infobulle = texte complet)
[ ] 14  Carrefour                         Variables · Courses   -61,10 €
```

États : vide (aucune seconde ligne), chargé (seconde ligne grise), édition (champ texte avec compteur « 12/200 » discret), erreur (aucune : la saisie est bloquée à 200).

## Impact technique

- Domaine : champ facultatif `detail` sur `Transaction` et `AccountMovement` ; règle de normalisation partagée (trim, 200, vide = absent) réutilisable par 0021 à 0023.
- Application : ajout (`addTransaction`) et modification (`updateAccountMovement` et son équivalent pour les `Transaction`) acceptent le détail ; aucun changement de l'empreinte ni du rang.
- Infrastructure / Supabase : champ facultatif de plus dans les données sauvegardées ; migration additive, aucune réécriture des données existantes ; les anciennes données sans détail restent valides.
- Présentation : `Expenses.tsx` (formulaire, liste, filtre de recherche).

## Critères d'acceptation

- CA1. Given le formulaire de Saisie, When j'ajoute une écriture avec un détail, Then elle est enregistrée avec ce détail et la liste l'affiche en seconde ligne grise. (Auto pour l'enregistrement)
- CA2. Given une écriture avec détail, When je survole la seconde ligne ou la ligne, Then l'infobulle montre le détail complet. (Manuel)
- CA3. Given un détail de plus de 200 caractères, When je le saisis ou le fournis à l'action, Then il est limité à 200. (Auto)
- CA4. Given un détail fait d'espaces ou vide, When j'enregistre, Then l'écriture n'a pas de détail et aucune seconde ligne n'apparaît. (Auto)
- CA5. Given une `Transaction` ou un `AccountMovement` existant, When je modifie ou vide son détail, Then seul le détail change (montant, date, cible, solde inchangés). (Auto)
- CA6. Given un virement lié, When je modifie le détail d'une des deux écritures, Then l'autre garde le sien. (Auto)
- CA7. Given une écriture importée, When je modifie son détail puis réimporte le même fichier, Then la ligne est toujours reconnue « déjà importée » et son détail est conservé. (Auto)
- CA8. Given des données sans détail, When je charge l'application, Then toutes les écritures s'affichent comme avant, sans seconde ligne. (Auto)
- CA9. Given une écriture avec le détail « mutuelle », When je saisis « mutuelle » dans la recherche, Then elle s'affiche . (Auto)
- CA10. Given une écriture avec détail, When je calcule soldes, budget et bilan, Then les résultats sont identiques à ceux sans détail. (Auto)
- CA11. Given une dépense ou un mouvement entre comptes (avec ou sans détail), When je survole la ligne ou j'y place le focus clavier, Then un crayon « Ajouter un détail » / « Modifier le détail » apparaît, atteignable au clavier (seul arrêt de tabulation du libellé) ; il ouvre l'édition du détail, y compris en mois clos ou verrouillé ; sur écran tactile il reste visible en permanence, atténué. (Manuel)

## Questions ouvertes

Aucune.
