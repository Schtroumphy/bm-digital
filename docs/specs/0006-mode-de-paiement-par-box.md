# 0006 — Mode de paiement (Virtuel / Espèces) par box

- Statut : implémentée
- Date : 2026-10-20
- Branche prévue : feat/bank_accounts

Avenant à la spec 0002 (comptes bancaires). Elle réintroduit, au niveau de la box, la distinction Virtuel / Espèces supprimée de la saisie par la RG10 de la spec 0002, sans revenir au champ `source`.

## Contexte et objectif

Une dépense variable est tantôt payée en virtuel (carte du compte Boursorama), tantôt en espèces. Aujourd'hui, le compte se choisit dépense par dépense (« Payé avec », défaut compte principal). Le développeur veut fixer ce comportement une fois pour toute la box (ligne variable ou enveloppe) : savoir si elle se paie en Virtuel ou en Espèces, et sur quel compte quand c'est du Virtuel. Les dépenses s'imputent alors automatiquement sur le bon compte, tout en restant corrigeables à la saisie.

Une « box » désigne ici une ligne de dépense variable (`var`) ou une enveloppe.

## Périmètre

Inclus :
- Un « compte attribué » facultatif et un « mode » (Virtuel / Espèces) sur chaque box.
- Résolution du compte d'une dépense à partir du mode de la box.
- Préremplissage de « Payé avec » à la saisie, toujours modifiable.
- Pastille cliquable sur la box (écran Budget et écran Enveloppes) avec menu de choix.
- Colonne « Compte » sur les dépenses variables de l'assistant.
- Migration des box existantes.

Exclus :
- Modification du compte des transactions déjà enregistrées (pas de rétroactivité).
- Lien avec la part `cash` des enveloppes (notion distincte, voir spec 0002 « Exclus »).
- Sorties d'épargne (`epa`), revenus, fixes et crédits : inchangés (RG9 et RG11 de la spec 0002).
- Schéma Supabase, `SupabaseRepository` (repoussés, comme en spec 0002).

## Règles de gestion

- RG1. Chaque box porte : un compte attribué (facultatif ; absent = compte principal) et un mode, `Virtuel` ou `Espèces`. Le mode absent vaut `Virtuel`.
- RG2. Le mode et le compte attribué se modifient à tout moment, au niveau de la box, et non par mois. Aucun historique de mode n'est conservé.
- RG3. Résolution du compte d'une dépense : mode Espèces → compte « Espèces » ; mode Virtuel → compte attribué de la box, ou compte principal s'il n'y en a pas.
- RG4. Si le compte attribué est archivé, la résolution en mode Virtuel retombe sur le compte principal (le compte attribué reste affiché comme archivé dans le menu).
- RG5. À la saisie d'une dépense (`var` ou `env`), « Payé avec » est prérempli avec le compte résolu par RG3 pour la box choisie. Il reste modifiable dépense par dépense. Changer de box dans le formulaire met à jour le préremplissage tant que l'utilisateur n'a pas choisi lui-même un compte.
- RG6. Une dépense enregistrée garde son compte. Changer le mode ou le compte attribué d'une box ne modifie aucune transaction existante (cohérent avec la RG2 de la spec 0002).
- RG7. Les règles de budget de la RG17 de la spec 0002 s'appliquent au compte résolu : si le compte de la dépense est « hors budget », la dépense reste exclue des chiffres du budget (enveloppes, sorties d'épargne) et comptée dans le solde du compte. Amendement (spec 0008) : une dépense `var` hors budget compte dans le réel de sa ligne.
- RG8. Écran Budget (lignes `var`) et écran Enveloppes : la box affiche une pastille cliquable, sans nom visible (pastille du compte résolu ; icône billet si le mode est Espèces ; le nom du compte ou « Espèces » apparaît en infobulle). Le clic ouvre un menu avec : « Virtuel (compte X) », « Espèces », et le choix du compte attribué (comptes actifs).
- RG9. Assistant, étape « Dépenses » : les lignes variables ont une colonne « Compte » (liste déroulante à pastille, option Espèces comprise). Elle alimente le compte attribué et le mode de la ligne au démarrage.
- RG10. Pour une ligne `var`, un changement de mode ou de compte attribué s'applique au mois affiché et au modèle (pas aux autres mois existants) : ils font partie de la ligne et du modèle et se retrouvent sur les mois créés ensuite par « Appliquer le modèle » ou « Dupliquer » (comme la RG11 de la spec 0002).
- RG11. Mois verrouillé (année clôturée) : le mode et le compte attribué ne sont pas modifiables sur ce mois.
- RG12. Migration : toute box existante sans mode devient Virtuel avec le compte principal (pas de compte attribué écrit). Aucune transaction n'est modifiée. La migration reste silencieuse, idempotente, sans changement de `version` (1) (cf. ADR 0003).
- RG13. Le compte « Espèces » n'est pas proposé comme compte attribué : il n'est utilisable que via le mode Espèces.
- RG14. Changer de compte principal fige sur l'ancien principal toutes les lignes sans compte attribué, lignes `var` comprises (modèle et mois), comme les autres lignes et les transactions (RG20 de la spec 0005). Une box sans compte attribué ne suit donc pas le nouveau principal : l'historique des mois passés reste inchangé.

## Parcours utilisateur

Nominal : la box « Courses » est en Virtuel (Boursorama). Je saisis 40 € : « Payé avec » propose Boursorama. Le week-end je passe la box « Marché » en Espèces : la saisie suivante propose Espèces, le solde du compte Espèces baisse. Les dépenses déjà saisies de « Marché » restent sur Boursorama.

Cas limites :
- Exception ponctuelle : je change « Payé avec » dans le formulaire sans toucher à la box.
- Compte attribué archivé : retombée sur le principal (RG4).
- Compte résolu « hors budget » (Swile) : dépense hors budget (RG7).
- Mode Espèces et compte attribué conservé : repasser en Virtuel restaure le compte attribué.
- Année clôturée : pastille en lecture seule (RG11).

## Design

Design proposé, à valider (aucune maquette fournie à ce stade). Composants réutilisés : pastille de compte (`dot`), `popmenu`, `chip`, tokens `organic.css`. Seule nouveauté : une icône billet (SVG inline) sur la pastille en mode Espèces.

Pastille sur la box (Budget, ligne variable) :

```
Courses        ●           budget 400 €   réel 120 €   (infobulle : Boursorama)
Marché         [billet]    budget 80 €    réel 30 €    (infobulle : Espèces)
```

Menu au clic (`popmenu`) :

```
┌───────────────────────────┐
│ Mode de paiement          │
│ (•) Virtuel · Boursorama  │
│ ( ) Espèces               │
│ ─────────────────────────│
│ Compte attribué           │
│ ● Compte principal  (défaut)│
│ ● Boursorama        ✓     │
│ ● Swile                   │
└───────────────────────────┘
```

Le bloc « Compte attribué » est grisé quand le mode est Espèces (valeur conservée). Formulaire « Nouvelle dépense » : rangée de `chip` « Payé avec » inchangée, avec le compte résolu présélectionné. Assistant : colonne « Compte » ajoutée aux lignes variables, liste déroulante à pastille avec l'option « Espèces ».

États : box sans réglage (pastille du principal) ; Virtuel ; Espèces ; compte attribué archivé ; mois verrouillé (lecture seule). Aucun état vide ni erreur nouveau.

## Impact technique

- Domaine : `Line` et `TemplateLine` (var) gagnent un mode (`payMode?: 'virtuel' | 'especes'`), `accountId?` existant servant de compte attribué ; `Envelope` gagne `accountId?` et `payMode?`. Fonction pure de résolution du compte d'une box (RG3, RG4). Calcul des soldes et du budget inchangé : ils lisent déjà `Transaction.accountId`.
- Application : actions de changement de mode et de compte attribué d'une box (ligne + modèle, ou enveloppe) ; `addTransaction` reçoit le compte résolu quand la saisie n'en précise pas ; `createFirstMonth` et le brouillon (`setup.ts`) étendus (colonne « Compte » des variables).
- Migration : valeurs par défaut au chargement (RG12), via le mécanisme de l'ADR 0003 ; sans écriture nécessaire puisque l'absence de mode vaut Virtuel.
- Infrastructure : `localRepository` inchangé. Supabase repoussé (les champs devront figurer dans le futur schéma).
- Présentation : `Budget.tsx`, écran Enveloppes, `Expenses.tsx` (préremplissage), `Setup.tsx`, pastille de compte partagée (variante billet).

## Critères d'acceptation

Tests automatisés (Vitest, domaine et application) : CA1 à CA8 et CA14. Le reste est vérifié à la relecture de l'UI.

- CA1. Given une box en mode Espèces, When je résous son compte, Then c'est le compte « Espèces ». Test automatisé.
- CA2. Given une box en Virtuel avec un compte attribué Boursorama, When je résous son compte, Then c'est Boursorama. Test automatisé.
- CA3. Given une box en Virtuel sans compte attribué, When je résous son compte, Then c'est le principal. Test automatisé.
- CA4. Given une box en Virtuel dont le compte attribué est archivé, When je résous son compte, Then c'est le principal. Test automatisé.
- CA5. Given une dépense enregistrée sur Boursorama, When je passe la box en Espèces, Then la dépense reste sur Boursorama et les soldes ne changent pas. Test automatisé.
- CA6. Given une box en Espèces, When j'ajoute une dépense sans toucher à « Payé avec », Then elle est sur Espèces et le solde Espèces baisse. Test automatisé.
- CA7. Given une box dont le compte résolu est « hors budget », When j'ajoute une dépense, Then le réel de la ligne compte la dépense (spec 0008), le « Reste à placer » ne change pas et le solde du compte baisse. Test automatisé.
- CA8. Given des données dont les box n'ont pas de mode, When elles sont chargées, Then chaque box est Virtuel sur le principal et aucune transaction n'est modifiée ; relancer ne change rien. Test automatisé.
- CA9. Given le formulaire « Nouvelle dépense », When je choisis une box en Espèces, Then « Payé avec » présélectionne Espèces et je peux choisir un autre compte avant d'enregistrer.
- CA10. Given une ligne variable ou une enveloppe, When je clique sa pastille, Then un menu propose Virtuel (compte X), Espèces et le choix du compte attribué ; la pastille affiche le billet en mode Espèces.
- CA11. Given une ligne variable avec un mode, When j'utilise « Appliquer le modèle » ou « Dupliquer », Then le mois créé garde le mode et le compte attribué.
- CA12. Given l'assistant, When j'ouvre l'étape Dépenses, Then les lignes variables ont une colonne « Compte » avec l'option Espèces.
- CA13. Given un mois d'une année clôturée, When je regarde la pastille d'une box, Then elle n'est pas modifiable.
- CA14. Given une ligne variable sans compte attribué, When je change de compte principal, Then la ligne est figée sur l'ancien principal. Test automatisé.

## Questions ouvertes

Aucune. Décisions du développeur intégrées : portée = mois affiché + modèle (RG10) ; Espèces non proposé comme compte attribué (RG13) ; `cash` et mode Espèces distincts ; enveloppes sans colonne dans l'assistant ; pas de maquette, design à valider avec la spec.
Ajouts de l'analyste à valider ou écarter : RG4 (compte attribué archivé → principal) et RG11 (lecture seule sur année clôturée).
