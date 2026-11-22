# 0056 — Emojis des enveloppes

- Statut : implémentée
- Date : 2026-11-22
- Branche prévue : feat/emojis_enveloppes

## Contexte et objectif
Le développeur veut mieux distinguer ses enveloppes d'un coup d'œil. Comme pour les catégories (spec 0054), chaque enveloppe peut porter un emoji, choisi après coup, affiché partout où son nom apparaît.

## Périmètre
Inclus :
- Un emoji optionnel par enveloppe, choisi dans une liste de pastilles prédéfinies, avec « Réinitialiser ».
- Choix depuis la carte de l'enveloppe et depuis son tiroir (écran Enveloppes).
- Affichage de l'emoji devant le nom de l'enveloppe partout où ce nom apparaît (Enveloppes, Budget, Dépenses, Planning, Modèle, Année, import, saisie rapide, listes de choix).
- Persistance (données locales et Supabase).

Exclus :
- Choix de l'emoji à la création de l'enveloppe.
- Emoji suggéré d'après le nom (pas de valeur par défaut).
- Saisie libre d'un emoji, plusieurs emojis par enveloppe.
- Simulations (le bloc « Enveloppes » des simulations n'affiche pas l'emoji).
- Modification des catégories.

## Règles de gestion
- RG1 : une enveloppe a zéro ou un emoji. Sans emoji, rien ne s'affiche de plus qu'aujourd'hui.
- RG2 : à la création, une enveloppe n'a pas d'emoji.
- RG3 : l'emoji se choisit parmi la liste prédéfinie (la même que celle des catégories, qui compte aussi 🧡, 💙, 💛 et 👩🏿), une seule valeur à la fois.
- RG4 : « Réinitialiser » retire l'emoji de l'enveloppe.
- RG5 : choisir un nouvel emoji remplace l'ancien.
- RG6 : l'emoji est purement visuel : il ne change ni le nom, ni les soldes, ni les recherches ou tris par nom, ni les montants.
- RG7 : partout où le nom de l'enveloppe est affiché, l'emoji le précède, séparé par une espace. Dans les listes d'options, il est dans le libellé (« 🛒 Courses »).
- RG8 : renommer l'enveloppe conserve son emoji.
- RG9 : supprimer l'enveloppe supprime son emoji avec elle. Dans l'historique, un nom d'enveloppe supprimée s'affiche comme avant, sans emoji.
- RG10 : l'emoji est conservé après rechargement et synchronisation Supabase. Les données existantes (sans emoji) restent valides.
- RG11 : les simulations n'affichent pas l'emoji.

## Parcours utilisateur
Nominal :
1. Sur l'écran Enveloppes, le développeur clique sur le bouton emoji à gauche du nom d'une carte.
2. Un menu de pastilles s'ouvre. Il en choisit une : le menu se ferme, l'emoji s'affiche devant le nom.
3. L'emoji apparaît ensuite dans les autres écrans devant le nom de l'enveloppe.

Variantes et cas limites :
- Depuis le tiroir de l'enveloppe, le même bouton et le même menu sont disponibles.
- « Réinitialiser » : l'emoji disparaît, le bouton revient à son état neutre.
- Clic en dehors du menu : fermeture sans changement.
- Enveloppe sans emoji : affichage identique à aujourd'hui.
- Enveloppe renommée : l'emoji reste.
- Enveloppe supprimée : voir RG9.

## Design
Design proposé, à valider (aucune maquette fournie). Réutilise les classes existantes de l'écran Catégories : `btn-outline emoji-btn`, `popmenu emoji-menu`, `emoji-choice` (avec `is-on`), `emoji-reset`, et `EMOJI_CHOICES`.

Carte d'enveloppe :
```
┌──────────────────────────────┐
│ [🛒]  Courses            ⋯   │   [🛒] = bouton emoji, à gauche du nom
│  Solde …                     │   sans emoji : bouton neutre (icône emoji / « + »)
└──────────────────────────────┘
```
Tiroir : même bouton à gauche du titre éditable (`drawer-name`).

Menu ouvert :
```
[🛒]▾
┌─────────────────────┐
│ 🛒 🍽 🚗 🏠 🎁 ✈️ …  │  grille de pastilles, la sélection marquée
│ Réinitialiser        │
└─────────────────────┘
```
États : sans emoji (bouton neutre) ; avec emoji ; menu ouvert ; pas d'état vide ni d'erreur (aucune saisie libre).
Accessibilité : `aria-label` « Choisir l’emoji de <nom> », `title` « Choisir un emoji ».

## Impact technique
- Domaine : `Envelope` gagne un champ optionnel `emoji`. Un helper de libellé « emoji + nom » pour les enveloppes, absent = rien.
- Application : une action de définition de l'emoji d'une enveloppe (vide = retrait), calquée sur celle des catégories. `renameEnvelope` conserve l'emoji.
- Infrastructure : lecture et écriture de l'emoji (valeur vide stockée comme null) ; migration Supabase ajoutant une colonne optionnelle `emoji` à la table des enveloppes, et mise à jour des types de base.
- Présentation : bouton et menu sur la carte et dans le tiroir ; emoji devant le nom dans les écrans listés au périmètre et dans les listes de choix d'enveloppe. Pas d'ajout de dépendance.

## Critères d'acceptation
(T = couvert par un test automatisé)
- CA1 (T) : Given une enveloppe sans emoji, When on définit un emoji, Then l'enveloppe porte cet emoji et son nom est inchangé.
- CA2 (T) : Given une enveloppe avec emoji, When on le remplace, Then seul le nouvel emoji est conservé.
- CA3 (T) : Given une enveloppe avec emoji, When on le réinitialise (valeur vide), Then le champ est absent.
- CA4 (T) : Given une nouvelle enveloppe, When elle est créée, Then elle n'a pas d'emoji.
- CA5 (T) : Given une enveloppe avec emoji, When on la renomme, Then l'emoji est conservé.
- CA6 (T) : Given une enveloppe avec emoji, When les données sont écrites puis relues (Supabase), Then l'emoji est identique ; Given une enveloppe sans emoji, Then aucun champ emoji après relecture.
- CA7 (T) : Given des données existantes sans emoji, When on les charge, Then elles sont valides et inchangées.
- CA8 : Given l'écran Enveloppes, When je clique sur le bouton emoji d'une carte et choisis une pastille, Then le menu se ferme et l'emoji précède le nom.
- CA9 : Given le tiroir d'une enveloppe, When je choisis un emoji, Then il est mis à jour sur la carte et dans le tiroir.
- CA10 : Given une enveloppe avec emoji, When je consulte Budget, Dépenses, Planning, Modèle, Année, l'import, la saisie rapide et les listes de choix d'enveloppe, Then son nom est précédé de l'emoji.
- CA11 : Given une enveloppe sans emoji, When je consulte ces écrans, Then l'affichage est identique à aujourd'hui.
- CA12 : Given une simulation, When j'affiche le bloc « Enveloppes », Then aucun emoji n'est affiché.
- CA13 : Given le menu ouvert, When je clique en dehors, Then il se ferme sans changement.
- CA14 : Given une enveloppe supprimée, When je consulte l'historique, Then son nom s'affiche sans emoji.

## Questions ouvertes
Aucune.
