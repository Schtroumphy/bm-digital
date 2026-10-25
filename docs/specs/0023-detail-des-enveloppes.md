# 0023 — Détail des enveloppes

- Statut : validée
- Date : 2026-10-23
- Branche prévue : feat/detail_enveloppes
- Dépend de : 0020 (règles communes RG1 à RG4 du détail). Indépendante de 0021 et 0022.

## Contexte et objectif

Une enveloppe n'a qu'un nom. Le développeur veut y noter un contexte (« Vacances d'été, partagé avec Julie », « Cadeaux de Noël »).

Les sorties d'une enveloppe sont des écritures (type `env`) : leur détail est couvert par la 0020. Cette spec ne couvre que l'enveloppe elle-même.

## Périmètre

Inclus : champ « Détail » sur chaque enveloppe (`Envelope`), à la création, à la modification, dans l'écran Enveloppes et dans les tuiles d'enveloppes de l'écran Budget.

Exclus : écritures (0020), compte d'enveloppe (compte automatique, spec 0011, sans détail), allocations mensuelles, éléments prévus (`PlannedItem`).

## Règles de gestion

- RG1. Règles communes de la 0020 : facultatif, distinct du nom, 200 caractères, une ligne, sans effet sur les calculs.
- RG2. Une enveloppe a un seul détail, valable pour tous les mois.
- RG3. Il se saisit à la création et se modifie dans le panneau de l'enveloppe (écran Enveloppes), à côté du nom.
- RG4. Affichage : seconde ligne grise tronquée sous le nom dans la carte et dans le panneau de l'enveloppe ; texte complet en infobulle (règle commune, 0020 RG3). Dans la tuile de l'écran Budget, l'infobulle existante est conservée et le détail y est ajouté en tête ; pas de seconde ligne dans la tuile, trop étroite.
- RG5. Renommer l'enveloppe conserve le détail ; supprimer l'enveloppe le supprime avec elle (le compte archivé n'en garde pas).
- RG6. Les enveloppes sans détail restent valides, aucune migration visible.
- RG7. Mois clos : le détail reste modifiable (information sans effet sur les chiffres).

## Parcours utilisateur

- Nominal : j'ouvre « Vacances », j'ajoute le détail « Été 2027, partagé avec Julie » ; la carte l'affiche en gris sous le nom.
- Je vide le détail : la seconde ligne disparaît.
- Limite : 200 caractères maximum ; enveloppe sans détail inchangée.

## Design

Design validé (wireframe de référence). Composants : `EditableText` (`env-card-name`, `drawer-name`), `text-input`.

```
Carte                       Panneau
+------------------+        Vacances                    [x]
| Vacances         |        Détail [ Été 2027, partagé avec Julie       ] 26/200
| Été 2027, part…  |        Solde 420 €  Alloué 100 €/mois  ...
| 420 €            |
+------------------+
```

États : sans détail (une seule ligne de titre, champ vide dans le panneau), avec détail, édition, tronqué.

## Impact technique

- Domaine : champ facultatif `detail` sur `Envelope`, règle de normalisation de la 0020.
- Application : création et modification d'enveloppe (`envelopes.ts`, `renameEnvelope` voisin) acceptent le détail.
- Infrastructure / Supabase : champ additif ; anciennes données valides.
- Présentation : `Envelopes.tsx`, tuile d'enveloppe de `Budget.tsx` (infobulle).

## Critères d'acceptation

- CA1. Given une enveloppe, When j'ajoute un détail, Then la carte et le panneau l'affichent en seconde ligne grise. (Manuel)
- CA2. Given un détail, When je survole, Then l'infobulle montre le texte complet. (Manuel)
- CA3. Given un détail de plus de 200 caractères ou vide, When j'enregistre, Then il est limité à 200 ou absent. (Auto)
- CA4. Given une enveloppe avec détail, When je la renomme, Then le détail est conservé. (Auto)
- CA5. Given une enveloppe avec détail, When je calcule soldes et allocations, Then rien ne change. (Auto)
- CA6. Given une enveloppe supprimée, When je consulte les données, Then son détail n'existe plus. (Auto)
- CA7. Given des données sans détail, When je les charge, Then les écrans Enveloppes et Budget s'affichent comme avant. (Auto)

## Questions ouvertes

Aucune.
