# 0003 — Allouer des sous à une enveloppe depuis l'écran Budget

- Statut : validée
- Date : 2026-10-20
- Branche prévue : à définir à la livraison (décision du développeur)

## Contexte et objectif

Dans l'écran Budget, l'encart « Enveloppes » affiche, pour chaque enveloppe, son solde actuel (chiffre en gros) et « alloué X » en petit, en lecture seule. Aujourd'hui, définir l'allocation d'une enveloppe n'est possible que dans l'écran Enveloppes. Objectif : pouvoir définir l'allocation du mois d'une enveloppe directement depuis la tuile, dans l'écran du mois.

L'allocation est une valeur unique par enveloppe et par mois : chaque saisie la remplace, elle ne s'additionne pas.

## Périmètre

Inclus :
- Écran Budget, encart « Enveloppes » : saisie sur place, dans la tuile, de l'allocation du mois (remplacement).
- Mise à jour du modèle de budget (`template.envAlloc`) avec la nouvelle valeur.
- Avertissement (non bloquant) quand le « Reste à placer » devient négatif.
- État vide (aucune enveloppe) : invitation à en créer une.

Exclus :
- Écran Enveloppes (inchangé, il permet aussi de modifier l'allocation du mois).
- Assistant « Démarrage », autres blocs de l'écran Budget.
- Nouveau champ de données ou migration Supabase.

## Règles de gestion

- RG1. Un clic sur une tuile d'enveloppe, ailleurs que sur le nom, met en édition un champ contenant l'allocation actuelle du mois, sélectionnée. Un clic sur le nom reste l'édition du nom (comportement actuel).
- RG2. À la validation (Entrée ou perte de focus), la valeur saisie remplace l'allocation du mois de cette enveloppe : « alloué X » devient « alloué N » (N = valeur saisie).
- RG3. Le solde affiché en gros varie de la différence N - X (le solde inclut l'allocation du mois), à la hausse ou à la baisse. Le « Reste à placer » varie de la différence inverse, X - N (les allocations sont retirées du « Reste à placer »). **Amendement** : la carte « Dépenses » ne compte plus les allocations ; elles ne figurent que dans « Épargne budgétisée », de sorte que Dépenses + Épargne budgétisée = Revenus quand le « Reste à placer » est à 0 €.
- RG4. Échap annule la saisie : rien n'est modifié.
- RG5. Les montants négatifs sont refusés : la saisie n'est pas validée, un message d'erreur court est affiché dans la tuile (par exemple « Montant positif ou nul requis ») et le champ reste ouvert. 0 est valide : il vide l'allocation du mois. Une saisie vide ne modifie rien (ni le mois, ni le modèle).
- RG6. Si le mois est verrouillé (année clôturée) ou non initialisé, les tuiles ne sont pas éditables (pas de curseur d'édition, pas de champ).
- RG7. S'il n'existe aucune enveloppe, l'encart affiche un message invitant à en créer une, avec le bouton « Ajouter » existant. Aucune tuile n'est éditable.
- RG8. (Avenant spec 0005 : la comparaison se fait avec le « Disponible (réel) » du mois, pas avec le Reste à placer ; message « Dépasse le disponible de X ». Le texte ci-dessous est l'énoncé d'origine.) Dépassement : si, après la saisie, le « Reste à placer » du mois est négatif, la valeur est quand même enregistrée et un avertissement visible s'affiche (par exemple « Dépasse le reste à placer de X »), même si la saisie vient de réduire le dépassement. Rien n'est bloqué. L'avertissement disparaît dès que le reste à placer est positif ou nul.
- RG9. Mise à jour du modèle : en plus du mois affiché, `template.envAlloc[id]` prend la valeur saisie N (remplacement). Le modèle sert de valeur de départ quand un mois est rempli avec « Appliquer le modèle de budget ». Conséquences :
  - Les mois déjà initialisés (passés, courant ou futurs) ne sont pas modifiés par le changement du modèle, hormis le mois affiché.
  - Les mois remplis ensuite par « Appliquer le modèle de budget » reprendront la nouvelle valeur. « Dupliquer le mois précédent » reprend l'allocation du mois précédent, pas le modèle.
  - Si le mois est verrouillé ou non initialisé, rien n'est modifié (RG6), donc le modèle non plus.
  - Si la valeur saisie est identique à l'allocation actuelle du mois, le mois ne change pas mais `template.envAlloc[id]` est quand même aligné sur cette valeur.
- RG10. Les montants sont affichés avec le format existant (`money`, euros, français).

## Parcours utilisateur

Nominal : le mois est initialisé, l'enveloppe « Voiture » affiche 520 € et « alloué 150 € ». L'utilisateur clique sur la tuile (hors nom), le champ affiche 150, il saisit 200 et valide. La tuile affiche 570 € (520 + 50) et « alloué 200 € ». Le « Reste à placer » baisse de 50 €. Le modèle de budget vaut maintenant 200 € pour « Voiture ».

Baisse : même situation, il saisit 100 et valide. La tuile affiche 470 € (520 - 50) et « alloué 100 € ». Le « Reste à placer » augmente de 50 €.

Cas limites :
- Annulation par Échap : tuile et modèle inchangés.
- Saisie vide : rien ne change.
- Saisie 0 : l'allocation du mois et du modèle passe à 0.
- Saisie négative : refus avec message, champ ouvert, rien n'est enregistré.
- Dépassement du reste à placer : enregistré, avec avertissement.
- Mois verrouillé ou non initialisé : clic sans effet.
- Aucune enveloppe : message d'invitation, création via « Ajouter ».
- Texte non numérique : traité comme pour les autres champs montant (`EditableAmount`).

## Design

Design proposé, à valider (aucune maquette fournie).

Tuile en lecture (inchangée) :

```
+---------------------+
| Voiture             |
| 520,00 €            |   <- solde (gros)
| alloué 150,00 €     |   <- petit
+---------------------+
```

Tuile en édition (clic hors nom) :

```
+---------------------+
| Voiture             |
| 520,00 €            |
| alloué [ 150,00  ]  |   <- champ prérempli avec l'allocation actuelle, focus auto, sélectionné
+---------------------+
```

Le champ remplace la ligne « alloué X » pendant l'édition. Après validation de 200 : solde 570,00 €, « alloué 200,00 € ».

Saisie négative refusée :

```
| alloué [ -20     ]  |
| Montant positif ou nul requis |   <- texte d'erreur, couleur BAD
```

Après validation avec dépassement :

```
+----------------------------------------+
| ! Dépasse le reste à placer de 30,00 € |   <- bandeau d'avertissement non bloquant, style alert-box existant
+----------------------------------------+
```

État vide :

```
Aucune enveloppe. Créez-en une pour y allouer des sous.
[+ Ajouter]
```

États : lecture, édition, erreur de saisie, avertissement de dépassement, désactivé (verrouillé ou non initialisé, curseur par défaut), vide.

Composants et styles réutilisés : `EditableAmount` (champ montant, comme dans `Envelopes.tsx`), classes `env-tile`, `env-tile-solde`, `env-tile-alloc`, `cell-input is-alloc`, `env-add`, `alert-box` (avertissement), `alert-pill`. Le nom de l'enveloppe reste éditable (`EditableText`).

## Impact technique

- Domaine : aucun nouveau type. Utilise `MonthData.alloc[envelopeId]` et `Template.envAlloc[envelopeId]`.
- Application : une action pure de remplacement, par exemple `setEnvelopeAllocation(d, month, envelopeId, amount)` (nom indicatif), dans `src/application/actions.ts`, avec test unitaire. Elle fixe `months[month].alloc[id]` et `template.envAlloc[id]` à `amount`, refuse un montant négatif, accepte 0, ne fait rien pour un mois verrouillé ou non initialisé. Il n'y a plus d'action « ajouter ».
- Persistance / Supabase : aucune migration. Le schéma a déjà une allocation par mois (`envelope_allocations.alloc`) et une allocation modèle par enveloppe (`template_alloc`). L'implementer vérifie que `template.envAlloc` est bien sauvegardé et rechargé.
- Présentation : `EnvelopesCompact` dans `src/presentation/screens/Budget.tsx` (tuile cliquable hors nom, champ prérempli, message d'erreur, avertissement, état vide, désactivation selon `locked` et `uninit`). Le composant doit recevoir l'information de verrouillage.

## Critères d'acceptation

- CA1. Given un mois initialisé et ouvert, une enveloppe avec alloué 150 € et solde 520 €, When j'ouvre sa tuile, saisis 200 et valide, Then « alloué » affiche 200 € (et non 350 €) et le solde 570 €. (test automatisé : action + solde via Ledger)
- CA2. Given la même situation, When je valide 200, Then le « Reste à placer » diminue de 50 €. (test automatisé)
- CA3. Given alloué 150 € et solde 520 €, When je valide 100, Then « alloué » affiche 100 €, le solde 470 € et le « Reste à placer » augmente de 50 €. (test automatisé)
- CA4. Given une saisie en cours, When j'appuie sur Échap, Then l'allocation du mois, le solde et le modèle sont inchangés. (manuel)
- CA5. Given une saisie vide, When je valide, Then ni le mois ni le modèle ne changent. Given une saisie 0, When je valide, Then l'allocation du mois et celle du modèle passent à 0. (test automatisé sur l'action)
- CA6. Given un montant négatif saisi, When je valide, Then rien n'est enregistré, un message d'erreur est affiché et le champ reste ouvert. (test automatisé sur l'action, manuel pour le message)
- CA7. Given une saisie qui rend le « Reste à placer » négatif, When je valide, Then la valeur est enregistrée et un avertissement de dépassement s'affiche. (manuel ; calcul du dépassement en test automatisé si extrait en fonction pure)
- CA8. Given un remplacement validé, When j'ouvre la tuile de nouveau, Then le champ affiche la nouvelle allocation. (manuel)
- CA9. Given une valeur validée, When je clique « Appliquer le modèle de budget » sur un mois non initialisé, Then l'allocation de cette enveloppe reprend la valeur du modèle, égale à la valeur saisie. (test automatisé)
- CA10. Given une valeur validée, When je consulte un mois déjà initialisé autre que celui modifié, Then son allocation n'a pas changé. (test automatisé)
- CA11. Given un mois d'une année clôturée, When je clique sur une tuile, Then aucun champ ne s'ouvre et le modèle n'est pas modifié. (manuel)
- CA12. Given un mois non initialisé, When je clique sur une tuile, Then aucun champ ne s'ouvre. (manuel)
- CA13. Given aucune enveloppe, When j'ouvre l'écran Budget, Then le message d'invitation et le bouton « Ajouter » sont visibles. (manuel)
- CA14. Given un clic sur le nom de la tuile, When je clique, Then c'est le nom qui passe en édition, pas le montant. (manuel)
- CA16. Given une allocation du mois de 150 € et un modèle à 120 €, When je valide 150 (valeur identique), Then l'allocation du mois reste 150 € et le modèle passe à 150 €. (test automatisé sur l'action)
- CA15. Given une valeur validée, When je recharge l'application, Then l'allocation du mois et le modèle sont conservés. (manuel)

## Questions ouvertes

Aucune. La branche est à définir par le développeur à la livraison.
