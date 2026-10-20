# 0002 — Comptes bancaires

- Statut : implémentée
- Date : 2026-10-20
- Branche prévue : feat/bank_accounts

Avenant à la spec 0001 (assistant « Démarrage ») : elle ajoute une étape à l'assistant et une colonne « Compte » à l'étape Revenus.

## Contexte et objectif

Aujourd'hui tout l'argent passe par un seul « compte virtuel » et les dépenses ont un moyen de paiement binaire (`vir` / `esp`). Les dépenses payées avec Swile sont donc décomptées du budget où arrive le salaire. L'objectif : modéliser plusieurs comptes bancaires (principal, Espèces, Swile, etc.), savoir sur quel compte chaque revenu et chaque dépense passe, suivre le solde de chaque compte, et pouvoir sortir un compte (Swile) du budget du mois.

Contrainte forte : le développeur a déjà fait son démarrage (`firstMonth` non null, données existantes). Aucune ré-initialisation. Les données existantes sont migrées automatiquement, et les soldes de départ se saisissent dans l'onglet « Comptes ».

## Périmètre

Inclus :
- Entité compte bancaire, compte principal, compte « Espèces ».
- `accountId` sur les revenus, dépenses fixes et crédits (lignes), transactions, et virements (source et destination).
- Solde calculé par compte, réglage « Compte dans le budget du mois ».
- Étape « Comptes » dans l'assistant, colonne « Compte » dans l'étape Revenus, onglet « Comptes ».
- Migration automatique des données existantes.
- Renommage de l'onglet « Soldes des comptes » (écran Dépenses) en « Soldes épargnes ».
- Inclusion des comptes bancaires dans la Clôture d'année.

Exclus :
- Relevé bancaire à saisir par compte (rapprochement), hors périmètre.
- Lien automatique entre le compte Espèces et la part `cash` des enveloppes (deux notions distinctes).
- Schéma Supabase, `SupabaseRepository` : repoussés à la spec Supabase dédiée (`localRepository` seulement).
- Soldes à une date au jour près (la granularité est le mois).

## Règles de gestion

Comptes
- RG1. Un compte bancaire a : un identifiant, un nom, une teinte (`hue`), un indicateur « principal », un solde de départ, un mois de départ, un réglage « Compte dans le budget du mois » (oui/non) et un état archivé.
- RG2. Il y a toujours exactement un compte principal. Il peut être changé : les opérations existantes restent sur l'ancien compte.
- RG3. Il existe toujours un compte « Espèces ». Il ne peut être ni archivé ni supprimé ; son nom reste modifiable.
- RG4. Le compte principal ne peut pas être archivé tant qu'il est principal. Aucun compte n'est supprimé, seulement archivé.
- RG5. On peut archiver un compte dont le solde n'est pas 0, avec un avertissement. Un compte archivé est masqué des listes de saisie (choix du compte, destination de virement) mais son historique reste visible et calculé. Il est désarchivable.
- RG6. La teinte est attribuée automatiquement à la création (parmi une palette fixe) et modifiable dans l'onglet « Comptes ». Chaque compte est représenté partout par une pastille de sa couleur.
- RG7. Solde de départ : montant du compte au 1er jour de son mois de départ. Un nouveau compte a pour mois de départ `firstMonth` ; ce mois est modifiable.

Rattachement
- RG8. Chaque revenu (ligne `rev`), dépense fixe (`fix`), crédit (`cre`), transaction et virement a un compte. Pour les lignes et transactions, l'`accountId` est optionnel : s'il est absent, c'est le compte principal.
- RG9. Pour une sortie d'épargne (`epa`), le compte est celui qui reçoit l'argent. Défaut : principal, modifiable.
- RG10. Le moyen de paiement `vir` / `esp` disparaît. « Payé avec » devient le choix du compte (défaut : principal). Le compte d'une transaction existante est modifiable.
- RG11. Sur l'écran Budget, chaque ligne de revenu, fixe et crédit porte une pastille cliquable qui ouvre un menu des comptes actifs. Le compte d'une ligne se retrouve sur les mois créés ensuite par « Appliquer le modèle » ou « Dupliquer » (il fait partie de la ligne et du modèle).
- RG12. Un virement a un compte source (bancaire) et une destination optionnelle : un autre compte bancaire, ou un compte d'épargne/placement.

Solde par compte (fin de mois M, depuis le mois de départ du compte)
- RG13. Solde = solde de départ
  + revenus réels (ligne `rev` avec `actual` saisi) du compte
  + sorties d'épargne (`epa`) créditées au compte
  + virements « faits » dont le compte est la destination bancaire (autre compte bancaire)
  − transactions `var` et `env` du compte
  − réel des lignes `fix` et `cre` du compte
  − versements réels vers épargnes et placements (lignes `epa` et `inv`, `actual`) débités du compte
  − virements « faits » dont le compte est la source et dont la destination est un autre compte bancaire.
- RG13bis. Un virement dont la destination est une épargne ou un placement, ou dont la destination est vide, est informatif : il ne bouge aucun solde bancaire. Seul le versement réel de la ligne `epa`/`inv` débite le compte (pas de double débit).
- RG14. Les transactions `var` sont comptées une seule fois, via leurs transactions (pas via le réel de la ligne variable).
- RG15. Les mois antérieurs au mois de départ du compte ne comptent pas dans son solde.
- RG16. Un virement entre comptes bancaires n'a d'effet sur les soldes que lorsqu'il est coché « fait » (case existante de l'écran Budget, par mois).
- RG16bis. Le réglage « Compte dans le budget du mois » vaut « oui » par défaut, pour Espèces, le principal et tout nouveau compte.

Budget du mois
- RG17. Réglage « Compte dans le budget du mois » (oui/non). Quand il est « non » (Swile), les opérations de ce compte sont exclues des chiffres du budget : `env` (dépensé de l'enveloppe), `epa` (sorties), et lignes `rev`/`fix`/`cre` rattachées au compte. Elles restent comptées dans le solde du compte (RG13). Amendement (spec 0008) : les transactions `var` d'un compte hors budget ne sont plus exclues, elles comptent dans le réel de leur ligne variable.
- RG18. Changer le réglage recalcule les chiffres du budget sur tout l'historique.

Assistant et onglet
- RG19. L'assistant passe à 9 étapes : 1 Période, 2 Comptes, 3 Revenus, 4 Crédits et dettes, 5 Dépenses, 6 Épargnes, 7 Enveloppes, 8 Investissements, 9 Récapitulatif. Les RG de la spec 0001 s'appliquent avec cette nouvelle numérotation.
- RG20. Étape « Comptes » : tableau Nom, Couleur, Solde au départ, Principal (choix unique), Dans le budget. Le compte « Espèces » est pré-rempli et non supprimable. Un compte principal est obligatoire. État vide non applicable (au moins 2 lignes).
- RG21. Étape « Revenus » : nouvelle colonne « Compte » (défaut principal). Les dépenses fixes et crédits reçoivent aussi leur colonne « Compte » dans leurs étapes.
- RG22. Récapitulatif (étape 9) : la carte « Soldes au 1er <mois> » ajoute « Comptes bancaires » au total de départ.
- RG23. Nouvel onglet « Comptes » dans la barre latérale, entre « Enveloppes » et « Prévisionnel » ; titre d'écran « Comptes ». Le sélecteur de mois reste visible.
- RG24. L'onglet « Comptes » liste les comptes (actifs puis archivés) avec : pastille, nom, solde du mois sélectionné, solde de départ éditable, mouvement du mois (entrées, sorties). Actions : ajouter, renommer, changer la couleur, choisir le principal, régler « Dans le budget », modifier le mois de départ, archiver/désarchiver.
- RG25. L'onglet « Soldes des comptes » de l'écran Dépenses est renommé « Soldes épargnes ». Son contenu ne change pas.
- RG26. Clôture d'année : les comptes bancaires apparaissent dans une section dédiée de l'écran Clôture (solde au 31 décembre, ajustable pour le 1er janvier), comme les épargnes et enveloppes.

Migration
- RG27. Au chargement, si les données n'ont pas de liste de comptes, elles sont migrées automatiquement : création de « Compte principal » (principal, renommable) et « Espèces », tous deux avec un solde de départ de 0 et pour mois de départ `firstMonth`. Les transactions `esp` passent sur Espèces, les `vir` sur le principal, le champ `source` est supprimé. Revenus, fixes, crédits et virements existants sont rattachés au principal. La destination des virements existants reste vide (le développeur la renseigne à la main) ; ils sont donc informatifs (RG13bis). Le réglage « dans le budget » des deux comptes créés vaut « oui ».
- RG28. La migration est idempotente, déclenchée par l'absence de comptes, ne change pas `version` (1), ne demande aucune saisie et ne touche pas `firstMonth`, les lignes ni les mois. Elle est enregistrée au prochain `save`.
- RG29. Après migration, un bandeau sur l'onglet « Comptes » invite à saisir les soldes de départ du principal et d'Espèces tant qu'ils valent 0 et n'ont pas été confirmés.

## Parcours utilisateur

Nominal (utilisateur déjà démarré) : ouvre l'application, les données sont migrées sans action ; ouvre « Comptes », saisit les soldes de départ du principal et d'Espèces ; ajoute « Swile » avec « Dans le budget » = non ; rattache sa ligne de revenu « Tickets restaurant » à Swile ; saisit une dépense payée avec Swile : le budget du mois ne bouge pas, le solde Swile baisse.

Nominal (nouvel utilisateur) : l'assistant propose l'étape « Comptes » avant les revenus.

Cas limites :
- Archiver le principal : refusé (RG4). Le changer d'abord de principal.
- Archiver un compte non nul : avertissement, archivage possible.
- Compte archivé utilisé par des opérations : elles restent affichées avec la pastille du compte.
- Transaction sur un compte archivé ensuite : conservée.
- Mois verrouillé (année clôturée) : le compte d'une opération n'est pas modifiable.
- Fermeture du navigateur après migration, avant `save` : la migration se rejoue (idempotente).

## Design

Design proposé, à valider. Composants réutilisés : `panel-lg`, `tabs`, `chip`, `pill`, `dot`, `btn-dark`/`btn-outline`, `banner`, `popmenu`, `EditableAmount`, `toneVars`, tokens `organic.css`. Aucun nouveau composant de base ; seule la pastille de compte est nouvelle (un `dot` de 10 px à la teinte du compte, avec le nom en infobulle).

Onglet « Comptes » (1440 px) :

```
Comptes                                  [ < Décembre 2026 v > ]            [+ Ajouter un compte]
┌ bandeau (jaune) ─────────────────────────────────────────────────────────────────────────┐
│ Saisis les soldes de départ de ton compte principal et d'Espèces.                     [x] │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌ panel-lg ────────────────────────────────────────────────────────────────────────────────┐
│ Compte            Départ (1er mois)  Entrées   Sorties   Solde      Budget   Principal    │
│ ● Compte principal  0,00 € (éditable) +2 950 € -1 820 €  1 130 €    [oui]     (•)       ⋯  │
│ ● Espèces           0,00 €            +0 €     -45 €     -45 €      [oui]     ( )       ⋯  │
│ ● Swile             120,00 €          +150 €   -60 €     210 €      [non]     ( )       ⋯  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
┌ Archivés (repliable) ────────────────────────────────────────────────────────────────────┐
│ ● Ancien livret     35,00 €   ...                                         [Désarchiver]  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Le menu « ⋯ » d'une ligne (`popmenu`) : Renommer, Changer la couleur (palette), Mois de départ, Archiver (grisé et motif affiché pour le principal et Espèces).

Écran Dépenses, formulaire « Nouvelle dépense » : le groupe « Payé avec » devient une rangée de `chip` avec pastille + nom de chaque compte actif (défaut principal). Tableau : colonne « Moyen » remplacée par « Compte » (pastille + nom) ; clic sur la pastille ouvre un `popmenu` pour changer le compte.

Écran Budget : pastille cliquable à gauche du nom sur les lignes `rev`, `fix`, `cre`, menu des comptes actifs.

Assistant : étape « Comptes » (tableau éditable, style des autres étapes, teinte de bloc dédiée) ; colonne « Compte » (liste déroulante à pastille) dans les étapes Revenus, Crédits et Dépenses fixes.

États : vide non applicable (Principal et Espèces toujours présents) ; chargé ; édition inline du solde de départ ; erreur : nom vide refusé, avertissement d'archivage d'un compte non nul ; année clôturée : tout en lecture seule.

## Impact technique

- Domaine : nouveau type `BankAccount { id, name, hue, isDefault, openingBalance, openingMonth, inBudget, archived }`, ajouté à `BudgetData` (`accounts`). `accountId?` sur `Line` et `TemplateLine` (rev, fix, cre) et sur `Transaction` ; `Transfer` gagne `fromAccountId` et `to?` (compte bancaire ou ligne épargne/placement). `PaymentSource` et `Transaction.source` supprimés. Le `Ledger` expose le solde de chaque compte par mois (`bankMonth`). `monthSummary`, les actuals des lignes variables et le dépensé des enveloppes excluent les comptes « hors budget » (RG17).
- Domaine (migration) : fonction pure de migration appliquée au chargement (RG27, RG28).
- Application : actions de gestion des comptes (créer, renommer, couleur, principal, budget, mois/solde de départ, archiver) avec les garde-fous RG2 à RG5 ; action de changement de compte d'une ligne, transaction ou virement ; `createFirstMonth` et le brouillon (`setup.ts`) étendus (étape « Comptes », colonne « Compte »). `addTransaction` et le recalcul du réel des variables tiennent compte de RG17 pour les enveloppes et sorties d'épargne ; depuis la spec 0008, les dépenses `var` comptent dans le réel de leur ligne quel que soit le compte.
- Infrastructure : `localRepository` inchangé. La migration est faite au chargement par le store. Supabase repoussé.
- Présentation : `App.tsx` (nouvel écran `comptes`, nav, titre), nouvel écran Comptes, `Expenses.tsx`, `Budget.tsx` (pastilles, virements), `Setup.tsx`, `Closing.tsx`, pastille de compte partagée.
- Schéma Supabase : hors de cette spec.

## Critères d'acceptation

Tests automatisés (Vitest, domaine et application) : CA1 à CA11, CA13. Le reste est vérifié à la relecture de l'UI.

- CA1. Given des données sans comptes (cas du développeur), When elles sont chargées, Then il existe un compte principal et un compte Espèces à 0, les transactions `esp` sont sur Espèces, les `vir` sur le principal, `firstMonth` et les lignes sont inchangés. Test automatisé.
- CA2. Given des données migrées, When la migration est relancée, Then le résultat est identique. Test automatisé.
- CA3. Given un compte Swile avec solde de départ 120 € et « Dans le budget » = non, When je saisis une dépense `var` de 60 € dessus, Then le solde Swile vaut 60 €, le réel de la ligne variable vaut 60 € (spec 0008) et le « Reste à placer » ne change pas. Test automatisé.
- CA4. Given le même compte réglé sur « oui », When je change le réglage, Then les chiffres du budget (enveloppes, revenus, fixes, crédits, sorties d'épargne) sont recalculés sur tout l'historique, et le réel de la ligne variable ne change pas (spec 0008). Test automatisé.
- CA5. Given un revenu réel de 2 950 € sur le principal (départ 100 €), When je lis le solde, Then il vaut 3 050 €. Test automatisé.
- CA6. Given un virement principal → Swile de 150 € non « fait », When je lis les soldes, Then rien n'a bougé ; coché « fait », Then principal −150 € et Swile +150 €. Test automatisé.
- CA6bis. Given un virement principal → épargne ou à destination vide, coché « fait », When je lis le solde du principal, Then il n'a pas bougé. Test automatisé.
- CA6ter. Given un revenu ou une ligne fixe rattaché à un compte « hors budget », When je lis les totaux du budget, Then ils l'excluent. Test automatisé.
- CA7. Given une ligne fixe de réel 400 € sans `accountId`, When je lis le solde du principal, Then il est débité de 400 € une fois. Test automatisé.
- CA8. Given des versements réels de 300 € vers un compte d'épargne, When je lis le solde du compte débité, Then il est débité de 300 €. Test automatisé.
- CA9. Given une sortie d'épargne de 100 € sans compte choisi, When je lis le principal, Then il est crédité de 100 €. Test automatisé.
- CA10. Given le principal, When je tente de l'archiver, Then c'est refusé ; Given Espèces, Then archivage et suppression refusés ; Given un autre compte non nul, Then l'archivage est possible, l'historique reste calculé ; il est désarchivable. Test automatisé.
- CA11. Given un changement de compte principal, When je change, Then un seul compte est principal et les opérations existantes gardent leur compte. Test automatisé.
- CA12. Given l'écran Dépenses, When j'ouvre le formulaire, Then « Payé avec » liste les comptes actifs avec pastille, défaut principal ; le tableau affiche une pastille de compte, modifiable au clic.
- CA13. Given un compte créé après coup, When je regarde son mois de départ, Then c'est `firstMonth`, modifiable ; les mois antérieurs ne comptent pas dans son solde. Test automatisé.
- CA14. Given la barre latérale, When je la regarde, Then « Comptes » est entre « Enveloppes » et « Prévisionnel » et l'onglet de l'écran Dépenses s'appelle « Soldes épargnes ».
- CA15. Given l'assistant, When je l'ouvre, Then il a 9 étapes, « Comptes » en 2e position, avec Espèces pré-rempli, et la colonne « Compte » existe dans Revenus.
- CA16. Given un budget déjà démarré, When j'ouvre l'application, Then aucune ré-initialisation n'est demandée et un bandeau invite à saisir les soldes de départ.
- CA17. Given l'écran Clôture, When je l'ouvre, Then une section liste les comptes bancaires avec leur solde au 31 décembre, ajustable.

## Questions ouvertes

Aucune.
