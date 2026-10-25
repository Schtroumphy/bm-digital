# 0026 — Solde espèces des enveloppes (solde à part)

- Statut : implémentée (tuile du Budget : virtuel en principal et espèces dessous, RG26, D37 à D41)
- Date : 2026-10-25
- Branche prévue : feat/solde_especes_enveloppes (PR vers `develop`)
- Amende : 0011 (Q3, mode Espèces des enveloppes rouvert ; « Exclus » sur la part `cash`), 0002. S'appuie sur 0019 (transfert, deux soldes).
- Révision : le solde espèces est un solde INDÉPENDANT du solde de l'enveloppe, et non une sous-partie (correction du développeur, remplace la décision Q1 A).

## Contexte et objectif

Le solde « actuel » d'une enveloppe est son solde virtuel : le solde de son compte de type `enveloppe`, alimenté par un transfert du compte principal (0019). Aujourd'hui `Envelope.cash` est une part informative saisie à la main, découpant ce solde.

Besoin du développeur : « Le solde actuel ne concerne que le virtuel, la part en espèces ne doit pas l'impacter. C'est un solde à part. » L'enveloppe a donc deux soldes indépendants : virtuel (inchangé) et espèces. Le solde espèces a une valeur d'ouverture, est alimenté par un transfert depuis le compte « Espèces » existant (principal → Espèces → enveloppe), et diminue avec les dépenses payées en espèces.

Décisions du développeur (intégrées) : compte « Espèces » existant comme réservoir ; `Envelope.cash` disparaît et devient un solde d'ouverture ; saisie dans l'assistant ET l'écran Enveloppes, datée du mois de départ du compte de l'enveloppe ; transferts de même mécanique que 0019 ; dépense d'enveloppe payable en espèces ou en virtuel, au choix par dépense ; les `cash` existants sont convertis en solde d'ouverture ; une seule spec.

## Périmètre

Inclus :
- Solde espèces par enveloppe, dérivé : ouverture + transferts Espèces → enveloppe − dépenses payées en espèces.
- Saisie du solde espèces d'ouverture (assistant, écran Enveloppes).
- Alimentation par un transfert du compte « Espèces » vers l'enveloppe (cible « enveloppe »).
- Choix « Payé avec » espèces / virtuel sur une dépense d'enveloppe.
- Affichage de deux soldes séparés.
- Conversion des `cash` existants.
- (Rouverture) Saisie des DEUX soldes de départ (virtuel et espèces), dans l'assistant et l'écran Enveloppes.
- (Rouverture) Historique des mouvements par enveloppe, en deux listes (Virtuel, Espèces), avec le solde après chaque ligne.

Exclus :
- Saisie directe d'un mouvement espèces en dehors du formulaire « Transfert » et du formulaire de dépense.
- Mode Espèces des lignes `var` (spec 0006, inchangé), autres comptes, objectifs.
- Répartition automatique entre espèces et virtuel.
- Règles de l'import CSV.

## Définitions

- Solde virtuel de l'enveloppe : solde de son compte (`bankMonth`, 0011 RG9) ; INCHANGÉ, jamais impacté par les espèces.
- Solde espèces de l'enveloppe, à une date : ouverture espèces + transferts Espèces → enveloppe (cible = l'enveloppe) − dépenses de l'enveloppe payées en espèces, jusqu'à cette date. Ce n'est pas un compte bancaire.
- Total de l'enveloppe : virtuel + espèces. C'est un chiffre d'affichage dérivé (titre des cartes, RG12) ; il n'est jamais stocké et ne remplace aucun des deux soldes.

## Règles de gestion

- RG1. Chaque enveloppe a un solde espèces d'ouverture (≥ 0, 0 par défaut), daté du mois de départ du compte de l'enveloppe. `Envelope.cash` est remplacé par ce solde d'ouverture, dont le sens change (plus une part du solde).
- RG2. Le solde espèces est dérivé à la lecture ; il n'est jamais saisi hors ouverture.
- RG3. Le solde virtuel et le solde du compte de l'enveloppe ne sont jamais modifiés par une opération espèces (ouverture, transfert d'espèces, dépense en espèces).
- RG4. Un transfert dont la source est le compte « Espèces » et dont la destination est le compte de l'enveloppe (cible `env` facultative, 0019 RG14 ; le critère est source Espèces + destination compte de l'enveloppe, D10) augmente le solde espèces de l'enveloppe de son montant et débite le compte « Espèces », dans le solde réel ET le solde estimé, à sa date (mécanique 0019). Il ne crédite pas le compte de l'enveloppe (voir Q1). Un transfert vers l'enveloppe depuis un autre compte n'augmente que le virtuel et ne change pas le solde espèces.
- RG5. Le formulaire « Nouvelle dépense » d'une enveloppe propose « Payé avec » : « Virtuel » ou « Espèces ». Défaut : Virtuel. Le choix est enregistré sur la dépense.
- RG6. Une dépense payée en espèces diminue le solde espèces seul ; elle ne touche ni le solde virtuel, ni le compte de l'enveloppe, ni le compte « Espèces » (déjà débité au transfert). Une dépense payée en virtuel ne diminue que le virtuel (0011 RG10 inchangé).
- RG7. Bornes : le solde espèces est ≥ 0, sans plafond lié au solde virtuel. Une dépense en espèces supérieure au solde espèces est refusée (« Espèces insuffisantes sur cette enveloppe », voir Q3). Le solde virtuel garde son comportement actuel (peut être négatif, 0011 RG13).
- RG8. Mois verrouillé ou clos : le solde espèces d'ouverture n'est pas modifiable ; création et suppression d'écritures selon les règles existantes.
- RG9. Le solde espèces n'a aucun effet sur « Reste à placer », « Disponible » ni sur les totaux budgétaires. Pour les soldes de comptes, son seul effet est le débit du compte « Espèces » de RG4.
- RG10. Conversion : pour chaque enveloppe, `cash` devient son solde espèces d'ouverture, sans borne par le solde virtuel. Le solde virtuel ne change pas (le solde de départ de l'enveloppe est conservé tel quel, voir Q5). Aucune écriture n'est fabriquée. Les dépenses `env` existantes sont considérées payées en virtuel.
- RG12. Cartes d'enveloppe (écran Enveloppes ; la tuile du Budget en est exclue par RG26) : le titre (chiffre en gros) est le total virtuel + espèces ; le sous-titre affiche les deux soldes séparément (« Virtuel X · Espèces Y »). Le total est calculé à l'affichage ; les bornes, refus et transferts s'appliquent à chaque solde séparément (RG3, RG7). Un total négatif est possible si le virtuel est négatif.
- RG11. Le mode Espèces des enveloppes, abandonné en 0011 (Q3), est rouvert uniquement sous cette forme (choix par dépense). Le compte de l'enveloppe reste figé comme compte du solde virtuel.

Soldes de départ (rouverture)
- RG13. Une enveloppe a deux soldes de départ saisissables : « Départ virtuel » (le solde d'ouverture du compte de l'enveloppe, `openingBalance`, qui peut être négatif comme aujourd'hui) et « Départ espèces » (`openingCash`, ≥ 0, RG1). Les deux sont datés du mois de départ du compte de l'enveloppe.
- RG14. Les deux départs se saisissent dans l'assistant (colonnes « Solde au départ » et « Espèces au départ ») ET dans le panneau d'une enveloppe de l'écran Enveloppes (champs « départ » modifiables dans chacune des deux cartes). Chacun est modifiable indépendamment de l'autre. Dans l'écran Enveloppes, le départ virtuel modifie l'ouverture du compte de l'enveloppe (même donnée que celle de l'écran Comptes).
- RG15. Verrouillage : chaque départ n'est modifiable que si le mois de départ du compte de l'enveloppe n'est ni clos ni verrouillé (année clôturée), comme RG8. Sinon le champ est affiché en lecture seule.

- RG20. (Test manuel) Le départ espèces se saisit AUSSI dans le groupe « Enveloppes » de l'écran Comptes (`Accounts.tsx`, cartes de compte d'enveloppe), à côté du départ virtuel (« Solde de départ, au 1er <mois> »). Cette réponse remplace le choix initial « écran Enveloppes seulement ». Le champ a les mêmes règles que RG13 à RG15 et D11 : verrouillé si le mois de départ est clos ou verrouillé, refus d'un départ espèces négatif ou qui rendrait le solde espèces négatif à une date (mêmes messages que dans l'écran Enveloppes). C'est la même donnée (`openingCash`) que dans l'écran Enveloppes et l'assistant : la modifier à un endroit la change partout.
- RG21. Sur cette carte, le solde espèces de l'enveloppe est affiché en lecture seule À CÔTÉ du solde du compte, sur la même rangée (amendement : il n'est plus sur une ligne séparée « Espèces (à part) »). Libellé : « Espèces » (Q33). Le solde du compte, qui est le solde virtuel de l'enveloppe, y est renommé « Solde virtuel » au lieu de « Solde réel » (RG25). L'espèces n'est pas un solde de compte et n'entre pas dans le « Solde virtuel » du compte ni dans les totaux de l'écran Comptes (RG3, D2). L'infobulle de l'espèces reste : « Solde espèces de l'enveloppe : à part du solde du compte, il n'est compté dans aucun total de cet écran. »
- RG22. Le mois de départ du compte (sélecteur « Mois de départ ») est aussi la date du départ espèces (RG1, Q17). Changer ce mois déplace donc les deux départs ; le champ espèces est alors recontrôlé selon RG20 et D11.

- RG23. (Remplace D22) La carte d'une enveloppe dans le groupe « Enveloppes » de l'écran Comptes affiche un « Total » = solde du compte (virtuel) + solde espèces, en plus du « Solde virtuel » (RG25, ex-« Solde réel », même chiffre) et du solde « Espèces » affiché à côté (RG21). La ligne « Total » reste une ligne à part, sous la rangée « Solde virtuel · Espèces ». Le total est un chiffre d'affichage dérivé (comme RG12) ; il ne remplace ni ne modifie aucun des deux soldes. Les cartes des autres comptes n'ont pas de total.

- RG24. (Amende D25) La ligne de titre du groupe « Enveloppes » de l'écran Comptes (`cpt-group-head`) affiche déjà le « Total » du groupe (somme des soldes réels des comptes d'enveloppe, virtuel seul). Elle gagne un sous-titre qui donne le total AVEC les espèces : somme des soldes réels (`bankMonth`) des enveloppes actives + somme de leurs soldes espèces, au mois affiché. Le chiffre principal du groupe reste le virtuel seul, inchangé. Seul ce sous-titre d'affichage tient compte des espèces ; il n'entre dans aucun KPI de l'écran Comptes ni dans la clôture (D25 maintenue pour tout le reste). Les enveloppes archivées sont exclues. Les autres groupes n'ont pas de sous-titre.

- RG25. (Amende le nom du solde, 0019 RG25 pour ces cartes seulement) Sur les cartes de compte d'enveloppe du groupe « Enveloppes » de l'écran Comptes, le libellé « Solde réel » devient « Solde virtuel », dans la vue lecture (cartes du groupe) ET la vue réglage (pied de la carte de `setupCard`). C'est le même chiffre (solde du compte, `bankMonth`), seul le mot change. Portée précise (D33) : le renommage s'applique à TOUS les endroits de l'écran Comptes où le « Solde réel » désigne un compte d'enveloppe uniquement : (1) les cartes du groupe (vue lecture), (2) le pied de la carte de réglage (`setupCard`), (3) le détail (panneau) d'un compte d'enveloppe, où la ligne « Solde réel » devient « Solde virtuel ». Les KPI de synthèse existants ne portent sur aucun compte d'enveloppe (« Disponible sur les comptes courants » : principal et autres comptes ; « Épargne et investissements » : épargne et investissement) : ils gardent « Solde réel ». Si un KPI ou un total ne portant que sur des comptes d'enveloppe existe ou est ajouté (le total du groupe « Enveloppes » et son sous-titre RG24), son libellé « Solde » suit « virtuel ». Un KPI ou un détail qui mélange des enveloppes et d'autres comptes garde « Solde réel ». Les cartes et détails des autres comptes gardent « Solde réel ». Une infobulle sur chaque « Solde virtuel » précise : « Solde réel du compte de l'enveloppe, hors espèces » (D36).

- RG26. (Amende RG12, D8 et D9 pour la tuile du Budget SEULEMENT) Sur la tuile d'enveloppe de l'écran Budget (`Budget.tsx`, `EnvelopeBalances`), le chiffre principal (`env-tile-solde`) est le solde VIRTUEL seul, et le solde espèces s'affiche sur la ligne juste en dessous, seul (libellé « Espèces X € », masquée si X = 0, Q38/Q39). Il n'y a plus ni total (virtuel + espèces) en titre ni sous-titre « Virtuel X · Espèces Y » sur cette tuile. La ligne « alloué X » reste en dessous des deux (ordre : virtuel, espèces, alloué). Le virtuel de la tuile est celui lu aujourd'hui, le virtuel budgétaire `envMonth.balance` (Q41). Les cartes de l'écran Enveloppes gardent RG12 (total en titre, sous-titre des deux soldes, Q40) ; les cartes de l'écran Comptes gardent RG21, RG23, RG24, RG25.

Historique des mouvements (rouverture)
- RG16. Le panneau d'une enveloppe (écran Enveloppes) affiche un historique en deux listes présentées en deux onglets : « Virtuel » et « Espèces » (D13). La section « Transactions liées » est conservée, les deux listes s'y ajoutent (D15). Chaque ligne a une date, un libellé, un montant signé et le solde de l'enveloppe concernée après cette ligne.
- RG17. Liste « Virtuel » : ligne « Ouverture » (départ virtuel), puis, dans l'ordre chronologique du solde, chaque mouvement du compte de l'enveloppe : allocations réelles et transferts reçus depuis un compte autre qu'Espèces (0019), dépenses payées en virtuel. Le solde après la dernière ligne est le solde virtuel de la fin de la période affichée.
- RG18. Liste « Espèces » : ligne « Ouverture » (départ espèces), puis les transferts Espèces → enveloppe (RG4, entrées) et les dépenses payées en espèces (sorties), avec le solde espèces après chaque ligne.
- RG19. L'historique est en lecture seule et dérivé : aucune saisie de mouvement espèces hors formulaire « Transfert » (bouton « + Alimenter ») et formulaire de dépense (RG5). La suppression d'une dépense ou d'un transfert depuis l'écran Saisie ou Comptes est reflétée à la lecture.

## Parcours utilisateur

Nominal : « Loisirs » démarre avec 100 € virtuels et 40 € en espèces. Je retire 50 € au distributeur (principal → Espèces). Je transfère 20 € d'Espèces vers Loisirs (cible Loisirs) : espèces 60 €, virtuel 100 € (inchangé). Je dépense 15 € en espèces : espèces 45 €, virtuel 100 €. Je dépense 10 € en virtuel : virtuel 90 €, espèces 45 €.

Cas limites : dépense en espèces supérieure au solde espèces (refusée) ; solde virtuel négatif (sans effet sur les espèces) ; mois clos ; suppression d'une dépense ou d'un transfert (recalcul) ; enveloppe supprimée ; année clôturée.

## Design (proposé, à valider ; la barre Espèces/Virtuel est revue)

Précision du développeur : titre de la carte = total (virtuel + espèces) ; sous-titre = les deux soldes. Réutilise `split-card`, `cell-input is-cash`, `chip`, formulaire « Transfert » (0019). La barre qui découpait un total est supprimée.

Carte d'enveloppe (écran Enveloppes ; la tuile du Budget est différente, voir plus bas, RG26) :
```
 Loisirs                          160,00 €      <- titre : total
 Virtuel 100,00 €  ·  Espèces 60,00 €           <- sous-titre : les deux soldes
 alloué 150,00 €
```
Détail (écran Enveloppes), sous la carte :
```
 +-----------------------+  +-----------------------+
 | Virtuel               |  | Espèces (à part)      |
 | 100,00 €              |  | 60,00 €               |
 | alloué 150,00 €       |  | départ [ 40,00 ]      |
 +-----------------------+  | [ + Alimenter ]       |
                            +-----------------------+
```
Le bouton « Alimenter » ouvre le formulaire « Transfert » prérempli (De Espèces, Vers l'enveloppe, cible l'enveloppe). Tuile du Budget (RG26, remplace le total en gros et le sous-titre « Virtuel X · Espèces Y » de D8) :
```
 +---------------------+
 | Loisirs        [x]  |
 | 100,00 €            |   <- solde virtuel seul (gros)
 | Espèces 60,00 €     |   <- nouvelle ligne, seul le solde espèces ; masquée si 0
 | alloué 150,00 €     |
 +---------------------+
```
Réutilise `env-tile`, `env-tile-solde`, `env-tile-alloc`.

Formulaire « Nouvelle dépense » (enveloppe) : « Payé avec » : `[ Virtuel | Espèces ]`, erreur sous le champ si espèces insuffisantes.

Assistant : colonne « dont espèces » renommée « Espèces au départ » (sans contrôle contre le solde).

États : sans espèces (carte à 0, bouton visible), espèces insuffisantes, mois clos (ouverture non éditable), virtuel négatif.

Rouverture, panneau d'une enveloppe : chaque carte porte son départ modifiable, puis l'historique en deux onglets s'ajoute au-dessus de la section « Transactions liées », conservée :
```
 +-----------------------+  +-----------------------+
 | Virtuel     100,00 €  |  | Espèces      60,00 €  |
 | départ [ 80,00 ]      |  | départ [ 40,00 ]      |
 +-----------------------+  | [ + Alimenter ]       |
                            +-----------------------+
 Mouvements   [ Virtuel | Espèces ]   (deux onglets, un seul affiché à la fois, tri chronologique croissant)
 Date   Libellé               Montant    Solde
 01/10  Ouverture             +80,00     80,00
 03/10  Alloc. Loisirs       +150,00    230,00      (transfert du principal)
 07/10  Cinéma                -130,00   100,00      (dépense en virtuel)
```
Même structure pour la liste Espèces : Ouverture, « Alimentation espèces » (+), dépenses en espèces (-). Réutilise `drawer-tx`, `hist-grid`, `num`. Assistant : colonnes « Solde au départ » (virtuel) et « Espèces au départ » côte à côte. États : historique vide (« Aucun mouvement »), mois de départ clos (départs en lecture seule).

Écran Comptes, groupe « Enveloppes » (carte de compte d'enveloppe), proposé :
```
 ● Loisirs                                    [Confirmé]
 Solde de départ, au 1er octobre (i)
 80,00 €     [ octobre v ]
 Espèces au départ (à part) (i)               <- nouveau, même mois de départ
 40,00 €
 ----------------------------------------------
 Solde virtuel   100,00 €     Espèces   60,00 €   <- côte à côte, même rangée ; espèces en lecture seule, hors solde du compte
 Total           160,00 €                         <- solde virtuel + espèces (D23, D24)
```
Vue lecture (cartes du groupe) : la rangée « Solde virtuel · Espèces » remplace le « Solde réel » en gros et la ligne « Espèces (à part) » :
```
 ● Loisirs                          [Enveloppe]
 Solde virtuel          Espèces
 100,00 €               60,00 €
 ...
 Total                  160,00 €
```
Vue réglage (pied de la carte de `setupCard`) : « Solde virtuel 100,00 € » (ex-« Solde réel »), avec le champ « Espèces au départ » et, à côté du solde virtuel, « Espèces 60,00 € » en lecture seule. Réutilise `kpi-label`, `cpt-solde`, `cpt-flow` (sur deux colonnes de même taille, D32). Détail (panneau) d'un compte d'enveloppe : la ligne « Solde virtuel 100,00 € » remplace « Solde réel » ; ses autres libellés sont inchangés.
Ligne de titre du groupe « Enveloppes » (RG24, proposé) :
```
 Enveloppes                                          Total
 Budgets mis de côté, dépensés au fil du mois        300,00 €      <- virtuel seul, inchangé
                                                     avec espèces 360,00 €   <- nouveau, petit, sous le total
```
Réutilise `cpt-group-head`, `cpt-group-total-label` et le style `muted is-small`. Infobulle : « Soldes réels des enveloppes + espèces. Chiffre d'affichage : il n'entre dans aucun total de cet écran. » Visible seulement pour le groupe « Enveloppes » ; masqué si la somme des espèces vaut 0 (Q28).
Réutilise `EditableAmount` (`cpt-opening`, `cell-input is-stmt`), `kpi-label cpt-label-tip` et l'infobulle « i ». Pas de sélecteur de mois propre au départ espèces. Infobulle : « Espèces détenues par l'enveloppe au 1er jour du mois de départ, en plus du solde de départ. Elles ne font pas partie du solde du compte. » Seules les cartes d'enveloppe ont ce champ (ni le principal, ni les autres comptes). États : mois de départ clos ou verrouillé (champ en lecture seule), refus avec message (négatif, solde espèces négatif à une date).

## Impact technique

- Domaine : `Envelope.cash` repris comme solde espèces d'ouverture ; indicateur de paiement (espèces / virtuel) sur les dépenses `env` ; fonction pure du solde espèces (ouverture + transferts Espèces → enveloppe − dépenses en espèces) ; `cashExceedsBalance` supprimé ; le calcul du virtuel (`bankMonth`, `envMonth`) exclut les dépenses payées en espèces et ignore le crédit du transfert Espèces → enveloppe ; `bankMovements` : ce transfert débite Espèces sans créditer le compte de l'enveloppe.
- Application : édition de l'ouverture ; `addTransaction` pour `env` accepte le mode de paiement et refuse les espèces insuffisantes ; conversion RG10.
- Infrastructure / schéma Supabase : NOUVELLE migration additive : colonne du mode de paiement sur les transactions d'enveloppe (nullable, défaut virtuel) ; `envelopes.cash` réutilisée comme ouverture espèces ; `supabaseRows`, `database.types.ts`, test de contrat.
- (Rouverture 2) Présentation : `Accounts.tsx` (`setupCard`) : champ du départ espèces pour les comptes d'enveloppe et solde espèces en lecture seule dans le pied de carte ; il réutilise `openingCashRefusal` / `setEnvelopeOpeningCash` (aucune nouvelle règle de domaine). À investiguer à l'implémentation : le développeur dit NE PAS pouvoir modifier le départ espèces dans l'écran Enveloppes actuel. À vérifier : mois de départ verrouillé ou clos (`openingLocked`), champ désactivé à tort (`disabled`), `EditableAmount` qui ne s'ouvre pas, refus silencieux (`negative`, seule une `window.alert` est émise), bug. La cause est à établir avec un test avant d'ajouter le champ dans l'écran Comptes.
- (Rouverture) Domaine : fonction pure de l'historique par enveloppe (lignes Virtuel et Espèces avec solde cumulé) lisant les mêmes sources que les soldes ; application : édition du départ virtuel de l'enveloppe depuis l'écran Enveloppes (réutilise `setBankAccountOpening`, déjà autorisé pour un compte d'enveloppe) avec le même verrouillage que l'ouverture espèces ; aucun changement de schéma supplémentaire.
- Présentation : `Envelopes.tsx` (deux cartes, retrait de la barre), `Budget.tsx` (tuile), `Expenses.tsx` (« Payé avec »), `Setup.tsx` (libellé, retrait du contrôle), formulaire de transfert (préremplissage), données de démonstration.

## Critères d'acceptation

(Auto = test automatisé ; Man = manuel.)

- CA1. Given une enveloppe à 100 € virtuels et 40 € d'espèces d'ouverture, Then virtuel 100 € et espèces 40 €, indépendants. (Auto)
- CA2. Given un transfert de 20 € du compte « Espèces » vers le compte de l'enveloppe, avec ou sans cible enveloppe, Then espèces +20 €, le compte « Espèces » −20 € dans les deux soldes, et le solde virtuel inchangé. (Auto)
- CA3. Given un transfert de 20 € du principal vers l'enveloppe, Then le virtuel +20 € et le solde espèces inchangé. (Auto)
- CA4. Given une dépense de 15 € payée en espèces, Then espèces −15 € et virtuel inchangé ; payée en virtuel, Then virtuel −15 € et espèces inchangé. (Auto)
- CA5. Given une dépense en espèces supérieure au solde espèces, Then elle est refusée avec un message, quel que soit le solde virtuel. (Auto sur l'action, Man sur le message)
- CA6. Given un solde virtuel négatif, Then le solde espèces est inchangé et n'est pas borné par lui. (Auto)
- CA7. Given l'assistant et l'écran Enveloppes, Then l'ouverture espèces est saisissable aux deux endroits ; sur mois verrouillé ou clos, elle ne l'est pas. (Man)
- CA8. Given des enveloppes avec `cash` existant, When je charge l'application, Then `cash` devient l'ouverture espèces, le virtuel est inchangé et aucune écriture n'est créée. (Auto)
- CA9. Given le bouton « Alimenter », Then le formulaire de transfert s'ouvre prérempli (De Espèces, Vers l'enveloppe, cible l'enveloppe). (Man)
- CA10. Given une enveloppe à 100 € virtuels et 60 € d'espèces, Then sa carte affiche 160,00 € en titre et « Virtuel 100,00 € · Espèces 60,00 € » en sous-titre, sans barre découpant un total ; la tuile du Budget fait exception (CA10b). (Auto sur le calcul du total, Man sur l'écran)
- CA10b. Given une enveloppe à 100 € de virtuel (budgétaire) et 60 € d'espèces, Then sa tuile de l'écran Budget affiche 100,00 € en principal, « Espèces 60,00 € » sur la ligne en dessous (seul solde espèces, sans « Virtuel » ni total), puis « alloué X » ; Given des espèces à 0, Then la ligne « Espèces » est masquée ; Given l'écran Enveloppes, Then la carte garde le total en titre et les deux soldes en sous-titre. (Man sur l'écran, Auto sur le choix des valeurs)
- CA10a. Given un virtuel de -20 € et des espèces de 60 €, Then le titre affiche 40,00 € et le sous-titre les deux soldes réels. (Auto)
- CA11. Given le solde espèces, Then « Reste à placer », « Disponible » et les totaux budgétaires sont inchangés. (Auto)
- CA12. Given la migration, Then sauvegarder puis recharger redonne le même `BudgetData` ; `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

- CA13. Given l'assistant, Then je peux saisir pour une enveloppe un départ virtuel ET un départ espèces, indépendants. (Man)
- CA14. Given le panneau d'une enveloppe sur un mois de départ ouvert, When je modifie le départ virtuel, Then l'ouverture du compte de l'enveloppe change (visible à l'écran Comptes) et le solde espèces ne change pas ; When je modifie le départ espèces, Then le solde virtuel ne change pas. (Auto sur les actions, Man sur l'écran)
- CA15. Given un mois de départ clos ou verrouillé, Then les deux départs sont en lecture seule. (Auto sur la règle, Man sur l'écran)
- CA15a. Given le panneau d'une enveloppe, Then l'historique a deux onglets « Virtuel » et « Espèces » (un seul affiché à la fois) et la section « Transactions liées » est toujours présente. (Man)
- CA16. Given une enveloppe avec ouverture, un transfert reçu et une dépense en virtuel, Then la liste Virtuel affiche ces trois lignes avec le solde après chacune, et le dernier solde égale le solde virtuel. (Auto)
- CA17. Given une enveloppe avec ouverture espèces, une alimentation Espèces → enveloppe et une dépense en espèces, Then la liste Espèces affiche ces trois lignes avec le solde après chacune, et le dernier solde égale le solde espèces. (Auto)
- CA18. Given une dépense en espèces, Then elle figure dans la liste Espèces et pas dans la liste Virtuel ; Given une dépense en virtuel, Then l'inverse. (Auto)
- CA19. Given l'historique, Then il ne propose aucune saisie de mouvement ; supprimer un transfert ou une dépense le retire de la liste. (Auto sur le calcul, Man sur l'écran)

- CA20. Given la carte d'une enveloppe dans le groupe « Enveloppes » de l'écran Comptes sur un mois de départ ouvert, When je saisis un départ espèces valide, Then `openingCash` de l'enveloppe change, le « Solde réel » du compte et le solde virtuel ne changent pas, et la valeur est la même dans l'écran Enveloppes et l'assistant. (Man sur l'écran, Auto sur l'action)
- CA21. Given un mois de départ clos ou verrouillé, Then le champ du départ espèces est en lecture seule dans l'écran Comptes ; Given une valeur négative ou qui rendrait le solde espèces négatif à une date, Then elle est refusée avec un message et rien n'est modifié. (Auto sur l'action, Man sur le message)
- CA22. Given une carte d'enveloppe de l'écran Comptes, Then le solde espèces y est affiché en lecture seule, libellé « Espèces », sur la même rangée que le « Solde virtuel » (pas sur une ligne séparée), et n'est inclus ni dans le « Solde virtuel » du compte ni dans les totaux et KPI de l'écran Comptes (D25) ; les cartes des autres comptes n'ont pas ce champ. (Man)
- CA22a. Given une enveloppe à 100 € de solde du compte (virtuel) et 60 € d'espèces, Then sa carte de l'écran Comptes affiche « Solde virtuel 100,00 € » et « Espèces 60,00 € » côte à côte, et « Total 160,00 € » en dessous ; Given un solde virtuel de -20 €, Then le total affiche 40,00 € ; les cartes des autres comptes n'ont pas de total. (Auto sur le calcul du total, Man sur l'écran)
- CA22b. Given une carte d'enveloppe dans la vue lecture, dans la vue réglage et dans le détail (panneau) d'un compte d'enveloppe, Then le libellé « Solde réel » y est remplacé par « Solde virtuel » (même chiffre) avec l'infobulle « Solde réel du compte de l'enveloppe, hors espèces » ; Given une carte ou un détail d'un autre compte, ou les KPI « Disponible sur les comptes courants » et « Épargne et investissements », Then « Solde réel » est inchangé. (Man)
- CA23. Given le départ espèces à modifier dans l'écran Enveloppes sur un mois de départ ouvert, Then il est modifiable ; si ce n'est pas le cas, la cause est établie et corrigée (test de régression). (Auto sur le domaine, Man sur l'écran)

- CA24b. Given deux enveloppes actives de soldes réels 100 € et 200 € et d'espèces 60 € et 0 €, When j'ouvre l'écran Comptes, Then la ligne de titre du groupe « Enveloppes » affiche 300,00 € comme total principal et un sous-titre « avec espèces 360,00 € » ; Given aucune espèces, Then le sous-titre est masqué (Q28). (Auto sur le calcul, Man sur l'écran)
- CA24c. Given ce sous-titre, Then « Disponible sur les comptes courants », « Épargne et investissements » et la clôture sont inchangés, et les autres groupes n'ont pas de sous-titre. (Auto sur le calcul, Man sur l'écran)
- CA24d. Given une enveloppe archivée avec des espèces, Then ni son virtuel ni ses espèces n'entrent dans le total principal ni dans le sous-titre. (Auto)

## Décisions du développeur (ex-questions ouvertes, intégrées)

D1 à D21 et D23 à D26 sont validées ; D22 est annulée et remplacée par RG23 ; D25 est amendée par RG24 (sous-titre du groupe). D27 à D31 : appliquées à la demande du développeur, sans validation formelle. D32 à D41 sont validées. Aucune question ouverte.

D1 (ex-Q1). Le transfert Espèces → enveloppe débite le compte « Espèces » et crédite le solde espèces de l'enveloppe, sans toucher au compte de l'enveloppe (RG3, RG4). Cet argent sort du compte « Espèces » et n'existe plus que dans le solde espèces de l'enveloppe, qui n'est pas un compte.
D2 (ex-Q2). Le solde espèces des enveloppes est hors clôture dans cette spec. Limite connue : l'argent débité d'« Espèces » par un transfert n'apparaît plus dans les totaux de la clôture (0010, 0011 RG14). Suite à spécifier dans une spec ultérieure.
D3 (ex-Q3). Une dépense en espèces supérieure au solde espèces est refusée (RG7).
D4 (ex-Q4). Une dépense en espèces compte dans le « dépensé » des cartes budgétaires et du bilan, sans toucher au solde virtuel de l'enveloppe.
D5 (ex-Q5). Conversion : le solde de départ virtuel est conservé tel quel et `cash` devient un solde espèces additionnel (le total affiché augmente).
D6 (ex-Q6). Import CSV : une dépense importée sur une enveloppe est considérée payée en virtuel.
D7 (ex-Q7). Hors périmètre : transfert d'une enveloppe vers une autre et retour des espèces vers le compte « Espèces » ; seule l'alimentation Espèces → enveloppe existe.
D8 (ex-Q8). Tuile du Budget : sous-titre « Virtuel X · Espèces Y », « Espèces » masqué si Y = 0. AMENDÉE par RG26 pour la tuile du Budget : virtuel seul en principal et ligne « Espèces X € » dessous (masquée si 0).
D10. Un transfert dont la source est le compte « Espèces » et la destination le compte de l'enveloppe compte comme alimentation en espèces, même sans cible « enveloppe ». Ce transfert ne crédite pas le compte de l'enveloppe : le crédit va au solde espèces (D1, RG3). La cible reste utile pour l'anti-double-compte (0019 RG10).
D9 (ex-Q9). Le total (virtuel + espèces) est affiché partout où l'enveloppe est une carte (cartes, liste Enveloppes ; la tuile du Budget en est exclue par RG26) ; les calculs (clôture, « Disponible », projections `envAvailable`) lisent le virtuel seul.

D11 (ex-Q10). Modifier un départ est autorisé tant que le mois de départ est ouvert ; les soldes suivants se recalculent. Un départ espèces qui rendrait le solde espèces négatif à une date est refusé (RG7).
D12 (ex-Q11). Période de l'historique : de l'ouverture jusqu'au mois affiché dans l'écran.
D13 (ex-Q12). Les deux listes sont présentées en deux onglets (Virtuel, Espèces), un seul affiché à la fois.
D14 (ex-Q13). Tri chronologique croissant, le solde après chaque ligne en découle.
D15 (ex-Q14). La section « Transactions liées » est conservée ; l'historique s'y ajoute.
D16 (ex-Q15). Les allocations budgétaires pointées (fictives, 0019 RG6) ne figurent pas dans la liste Virtuel, qui ne contient que les mouvements du compte de l'enveloppe (allocations réelles, transferts reçus, dépenses en virtuel).
D17 (ex-Q16). Mois clos : les lignes restent affichées en lecture seule ; un départ daté d'un mois clos n'est pas corrigeable depuis l'écran Enveloppes (RG15).

D18 (ex-Q17). Le mois de départ du départ espèces est celui du compte de l'enveloppe : le sélecteur « Mois de départ » de la carte déplace aussi le départ espèces (RG1, RG22).
D19 (ex-Q18). Le solde espèces est affiché sur la carte de l'écran Comptes, en lecture seule, à côté du « Solde réel » (RG21).
D20 (ex-Q19). Les trois endroits de saisie (assistant, écran Enveloppes, écran Comptes) sont conservés, tous sur la même donnée.
D21 (ex-Q20). Sur la carte d'une enveloppe archivée (enveloppe supprimée), le départ espèces est en lecture seule (0011 RG22).
D22 (ex-Q21). ANNULÉE et remplacée par RG23 (décision du développeur du 2026-10-25 : « Ajoute total dans les cartes de comptes (virtuel + espèces) »). Le « Solde réel » de la carte reste celui du compte.

D23 (ex-Q22). Le total est une ligne « Total » en gras sous « Solde réel · Espèces », dans le pied de la carte (RG23, wireframe).
D24 (ex-Q23). Le total est le solde réel du compte (`bankMonth`, virtuel) plus le solde espèces, au mois affiché. Il peut donc différer du total des cartes de l'écran Enveloppes, qui part du virtuel budgétaire.
D25 (ex-Q24). Le total d'enveloppe est un affichage seulement : il n'entre dans aucun total ni KPI de l'écran Comptes ni dans la clôture (cohérent avec D2 et D19).
D26 (ex-Q25). Enveloppe archivée : pas de carte dans l'écran Comptes, donc rien à afficher ; sinon le total est affiché en lecture seule comme les autres lignes (D21).

D27 à D31 (ex-Q26 à Q30). Appliquées à la demande du développeur (« Appliques la »), sans validation formelle de chaque point :
D27 (ex-Q26). Libellé du sous-titre du groupe : « avec espèces X € ».
D28 (ex-Q27). Le chiffre principal du groupe reste le virtuel seul.
D29 (ex-Q28). Sous-titre masqué quand la somme des espèces vaut 0.
D30 (ex-Q29). Calcul : somme des soldes réels (`bankMonth`) des enveloppes actives plus somme des soldes espèces, au mois affiché ; enveloppes archivées exclues.
D31 (ex-Q30). Le sous-titre n'entre dans aucun KPI global ni dans la clôture (D25 maintenue).

D32 (ex-Q31). Mise en page de la rangée : « Solde virtuel » et « Espèces » à la même taille, côte à côte ; le « Total » en gras dessous.
D33 (ex-Q32, ÉTENDU). Le renommage « Solde réel » → « Solde virtuel » s'applique aux cartes d'enveloppe (lecture et réglage), au détail (panneau) d'un compte d'enveloppe et à tout KPI ou total de l'écran Comptes qui ne porte que sur des comptes d'enveloppe. Aucun KPI de synthèse existant n'est dans ce cas (« Disponible sur les comptes courants » et « Épargne et investissements » ne contiennent pas d'enveloppe) ; les autres comptes gardent « Solde réel ». Précisé en RG25.
D34 (ex-Q33). Libellé du côté espèces : « Espèces ».
D35 (ex-Q34). En vue réglage, « Espèces » est aussi affiché en lecture seule à côté du « Solde virtuel », en plus du champ « Espèces au départ ».
D36 (ex-Q35). Accepté : « Solde virtuel » avec l'infobulle « Solde réel du compte de l'enveloppe, hors espèces ».

Décisions sur la tuile du Budget (demande du développeur : « Dans l'onglet budget mets juste le solde espèces des enveloppes sur la ligne en dessous du virtuel ») :
D37 (ex-Q37). Pas de total (virtuel + espèces) sur la tuile du Budget : le virtuel en principal, les espèces dessous (RG26).
D38 (ex-Q38). Libellé de la ligne : « Espèces X € ».
D39 (ex-Q39). La ligne est masquée quand les espèces valent 0.
D40 (ex-Q40). L'écran Enveloppes (carte avec total en titre et sous-titre des deux soldes, RG12) reste inchangé.
D41 (ex-Q41). Le virtuel de la tuile reste le solde budgétaire `envMonth.balance` (début + allocation − dépensé). Le « Solde virtuel » de l'écran Comptes (RG25) est, lui, le solde réel du compte ; les deux chiffres peuvent donc différer d'un écran à l'autre.

