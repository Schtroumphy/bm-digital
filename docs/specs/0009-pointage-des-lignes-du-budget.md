# 0009 — Pointage des lignes du budget et indicateur « Reste à sortir / Solde / Marge »

- Statut : implémentée
- Date : 2026-10-21
- Branche prévue : feat/budget_line_checkoff

Complète les specs 0002 (comptes bancaires), 0006 (mode de paiement par box) et 0008 (restant des variables). Remplace le bloc « Virements à effectuer » de l'écran Budget.

## Contexte et objectif

Le développeur veut savoir, mois après mois, si l'argent de chaque ligne sortante a réellement bougé, et si le solde de chaque compte suffit pour ce qui reste à sortir. Aujourd'hui l'écran Budget compare le budget au « réel » (dépense constatée), mais rien n'indique « ce prélèvement est-il passé ? ». Le bloc « Virements à effectuer » joue un rôle voisin mais sans lien avec les lignes du budget, et il est jugé sans sens à date.

Deux notions restent distinctes :
- Le **réel** : la dépense constatée sur une ligne (inchangé).
- Le **pointage** : « l'argent a bougé » (prélèvement passé, virement fait, retrait fait). Il ne modifie jamais le réel.

## Constats dans le code (audit du bloc « Virements à effectuer »)

- C1. Le bloc est `TransfersCard` (`Budget.tsx`, 4e colonne, sous « Enveloppes »). Il liste `data.transfers` (nom, compte source, destination, montant) avec une case « fait » par mois (`MonthData.transfersDone`) et un compteur « n / N faits ».
- C2. Il n'existe aucune interface pour créer, renommer, supprimer un virement ni changer son montant. Seuls la source, la destination et la case « fait » se modifient. Les virements viennent uniquement de la donnée de démonstration (`seed.ts`, 9 virements nommés comme des établissements : Boursorama, Caisse d'épargne, Lydia…). `emptyData` et l'assistant n'en créent aucun : pour un vrai utilisateur le bloc est vide.
- C3. Les virements ne sont pas liés aux lignes du budget. Les montants des virements ne sont pas ceux des lignes `epa` / `inv`.
- C4. Un seul effet de calcul : un virement « fait » dont la destination est un autre compte bancaire déplace de l'argent entre les deux soldes (`Ledger.bankFlow`, spec 0002 RG13, RG13bis, RG16). Les virements vers une épargne, un placement ou sans destination sont informatifs et n'ont aucun effet.
- C5. Persistance : `localStorage` seulement. Le schéma Supabase (`transfers`, `transfers_done`) est déjà en retard sur le domaine (pas de compte source, pas de destination, pas de comptes bancaires).
- C6. Tests existants qui s'appuient sur les virements : `bankAccounts.test.ts` (CA6, CA6bis), `availableReal.test.ts`, `monthClosing.test.ts`, `payment.test.ts`, `actions.test.ts` et d'autres (champ `transfersDone`).

Conséquence : la seule fonction réelle du bloc est de déplacer de l'argent entre deux comptes bancaires (ex. principal vers Swile ou Espèces). Le pointage d'une ligne `var` sur un compte dédié (RG9 ci-dessous) couvre ce besoin. Les données `transfers` sont conservées inertes (RG15) ; le virement libre entre comptes est hors périmètre.

## Périmètre

Inclus :
- Case de pointage et date (amendement 5 : plus de montant pointé) sur les lignes `cre`, `fix`, `var` (sous condition), `epa`, `inv`.
- Indicateur par compte : Reste à sortir, Solde (saisi), Marge.
- Retrait du bloc « Virements à effectuer » et de son compteur, remplacé par l'indicateur au même emplacement (Design proposé).
- V2 : jour prévu (1 à 31), reprise mensuelle (récurrence), mode d'exécution, badge « en retard ».
- Table Supabase `line_checks` (migration additive de cette spec seulement, voir Impact technique).

Exclus :
- V3 : pré-rapprochement avec les relevés bancaires.
- Récurrences trimestrielle et annuelle.
- Lignes de revenu (`rev`) : exclues à l'origine, devenues pointables par l'amendement (3) (RG45 à RG56).
- Coche automatique : jamais, même en prélèvement automatique.
- Changement du réel, du « Reste à placer », du « Disponible (réel) », du taux d'épargne (le pointage ne les modifie pas).
- Dépenses `env` (enveloppes), écran Dépenses.

## Règles de gestion

Pointage
- RG1. Chaque ligne `cre`, `fix`, `epa`, `inv` a une case « pointée ». Cocher enregistre la date (défaut = aujourd'hui, modifiable). Décocher efface la date. (Amendement 5 : le montant pointé n'existe plus ; le montant compté est le réel s'il existe, sinon le budget, RG76 et RG77.)
- RG2. Le pointage est par mois et par ligne (une ligne pointée en octobre ne l'est pas en novembre). Il est indépendant du réel : cocher ne change pas `actual`, et saisir un réel ne coche rien.
- RG3. (Remplacée par RG45, amendement 3.) Une ligne `rev` avait à l'origine pas de case.
- RG4. Ligne `var` dont le compte résolu (spec 0006 RG3, RG4) est le compte principal : pas de case. Elle est comptée au Reste à sortir pour max(budget − réel, 0) (spec 0008).
- RG5. Ligne `var` dont le compte résolu est un autre compte (Espèces, Swile, autre compte actif) : case présente. Cocher signifie « le budget a été viré ou retiré sur le compte dédié ».
- RG6. Les revenus non pointés ne sont pas dans le solde. Amendement 3 : un revenu non reçu n'entre ni dans le Solde estimé ni dans la Marge ; il est affiché à part (« Revenus attendus », RG49).
- RG7. Mois clôturé (ou année clôturée, `isMonthLocked`) ou mois non initialisé : cases, date, montant, jour prévu et mode en lecture seule. Les valeurs déjà pointées restent affichées.
- RG8. (Abrogée, amendement 5 : plus de montant pointé.)

Effet d'une ligne `var` pointée sur compte dédié
- RG9. (Amendement 6 : si le compte dédié est hors budget, le principal n'est ni débité ni crédité, RG92.) Une ligne `var` pointée sur un compte dédié déplace son budget (amendement 5 : plus de montant pointé) du compte principal vers le compte dédié dans le calcul des soldes (même effet que l'ancien virement « fait » entre deux comptes, spec 0002 RG13). Les dépenses saisies ensuite sur le compte dédié consomment ce montant, comme n'importe quelle dépense du compte (spec 0002 RG14), sans double comptage. Décocher annule le mouvement. La source est toujours le compte principal.
- RG10. Le pointage d'une ligne autre que `var` ne déplace aucun solde calculé (le réel reste la seule source, spec 0002 RG14).

Indicateur par compte
- RG11. Pour chaque compte actif concerné (au moins une ligne sortante du mois ou un solde saisi), l'indicateur affiche :
  - **Reste à sortir** = somme, pour les lignes sortantes de ce compte non pointées, de leur budget (RG12) ;
  - ~~**Solde** = valeur saisie à la main pour ce compte, avec la date de dernière mise à jour~~ (abrogé, amendement 4 : plus de Solde saisi ; remplacé par le Solde relevé, RG62) ;
  - **Solde estimé** = solde de départ du compte + tous les mouvements depuis son mois de départ, calculé en continu (amendement 4, RG57 à RG61) ;
  - **Marge** = Solde estimé − Reste à sortir, verte si ≥ 0, rouge si < 0. Elle utilise le Solde estimé et non le Solde saisi : sinon une ligne pointée sortirait du Reste à sortir sans baisser le solde, et la Marge serait gonflée.
- RG12. (Amendement 8 : une ligne `var` vers un compte hors budget n'entre jamais dans le Reste à sortir, RG105.) Composition du Reste à sortir d'un compte : lignes `cre`, `fix`, `epa`, `inv` non pointées dont le compte est ce compte, au montant du budget ; lignes `var` du compte principal (RG4) au montant max(budget − réel, 0) ; lignes `var` d'un compte dédié non pointées au montant de leur budget, rattachées au compte principal car c'est lui qui doit les verser. Une ligne pointée sort du Reste à sortir.
- RG13. (Abrogée, amendement 4.) Le Solde saisi par compte et par mois, daté, avec reprise du mois précédent, n'existe plus : il est remplacé par le solde de départ unique du compte (RG57) et par le Solde relevé de comparaison (RG62).
- RG14. Mois clôturé : le Solde estimé, le Reste à sortir et la Marge sont affichés mais non modifiables (valeurs figées à la clôture). (Les mentions « Solde » et sa date sont abrogées.)
- RG15. L'indicateur remplace le bloc « Virements à effectuer » : aucun nouveau bandeau fixe n'est ajouté (Design). Les données `transfers` / `transfersDone` sont conservées inertes (sans interface ni création) pour que les soldes calculés des mois passés ne changent pas (décision 1) ; elles n'entrent pas dans le Solde estimé (RG26) (amendement 4 : les virements anciens « faits » entre comptes bancaires entrent dans le Solde estimé comme dans le Ledger, RG60).

Solde estimé et détail par compte
- RG23. (Abrogée, amendement 4 : plus d'ancre mensuelle ni de coupure par date.) Ancienne définition : Solde saisi du mois + mouvements datés strictement après sa date de mise à jour. Remplacée par RG58 : solde de départ + tous les mouvements depuis le mois de départ du compte.
- RG24. Sorties du compte : montant compté (RG76) des lignes `cre`, `fix`, `epa`, `inv` pointées dont c'est le compte, à la date de pointage ; dépenses `var` et `env` imputées à ce compte (compte de la transaction), à leur jour ; budget (RG82) d'une ligne `var` à destination d'un compte dédié, côté compte principal (source, décision 3).
- RG25. Entrées du compte : budget (RG82) d'une ligne `var` sur ce compte dédié, à la date de pointage ; sorties d'épargne (`epa`) saisies en dépense et créditées sur ce compte (transaction `epa`), à leur jour. Amendement 3 : montant compté (RG76, reçu) des lignes `rev` du compte, à la date de pointage (RG47). Un revenu non reçu n'est jamais compté.
- RG26. (Amendée, amendement 4 : le réel n'entre pas dans le Solde estimé des mois en mode pointage mais y entre dans les mois en mode réel, RG59 et RG60 ; les anciens `transfersDone` entre comptes bancaires y entrent, RG60.) Ancien texte : n'entrent pas dans le Solde estimé : le réel des lignes (le pointage est la seule source des lignes fixes, crédits, épargnes, placements ; les dépenses `var` ne sont comptées qu'une fois, par leurs transactions) et les anciens `transfersDone` (sans date).
- RG27. Articulation avec le « solde attendu du compte dédié » : c'est le même chiffre. Le Solde estimé d'un compte dédié (Swile, Espèces) = son solde de départ + mouvements (amendement 4 : plus de Solde saisi), dont le budget viré (ligne `var` pointée) − dépenses imputées. Il n'y a donc pas de second indicateur.
- RG28. Détail au clic : cliquer sur l'en-tête d'un compte déplie sous lui le détail du mois (Design). Il liste : (a) les mouvements comptés dans le Solde estimé, triés par date, signés (pointages avec nom de ligne, dépenses avec libellé), (b) les lignes restant à sortir (non pointées, avec jour prévu et badge « en retard »), (c) la formule : début de mois (fin du mois précédent, calculé, amendement 4), + entrées, − sorties, = Solde estimé. Un seul compte déplié à la fois. Lecture seule ; mois clôturé : le détail s'affiche aussi.
- RG29. (Reformulée, amendement 4.) Avant le mois de départ du compte, le Solde estimé est absent (« — ») ; le détail liste quand même les lignes restant à sortir.
- RG30. (Abrogée, amendement 4.) Plus de mouvements grisés « déjà compris dans le Solde » : tous les mouvements du mois comptent.

V2 : jour prévu, récurrence, mode, retard
- RG16. Chaque ligne sortante peut porter un jour prévu (1 à 31, facultatif). Si le mois est plus court, le jour prévu est ramené au dernier jour du mois (28, 29, 30).
- RG17. Récurrence mensuelle : le jour prévu et le mode d'exécution font partie de la ligne et du modèle. Ils sont repris dans les mois créés ensuite (« Appliquer le modèle », « Dupliquer »). Le pointage et la date pointée ne sont jamais repris (il n'y a plus de montant pointé, RG77). Un changement de jour prévu ou de mode s'applique au mois affiché et au modèle seulement, pas aux autres mois existants.
- RG18. Mode d'exécution (liste fermée) : prélèvement automatique, virement automatique, virement manuel, retrait d'espèces, informatif. Absent = non précisé (aucun défaut imposé).
- RG19. Badge « en retard » : une ligne non pointée, avec jour prévu, est en retard dès le lendemain du jour prévu (jour prévu 10, en retard le 11). Dans un mois passé encore ouvert, toute ligne non pointée avec jour prévu est en retard. Pas de badge sans jour prévu, sur une ligne pointée, sur une ligne en mode informatif, ni sur un mois clôturé. Mode informatif : pas de case, pas de retard, hors Reste à sortir (RG18).
- RG20. Aucune coche automatique : un prélèvement automatique reste non pointé tant que l'utilisateur ne le coche pas.

Migration
- RG21. Les données existantes sont chargées sans erreur (mécanisme de l'ADR 0003, silencieux, idempotent, `version` inchangée à 1). Une ligne sans pointage ni jour ni mode est non pointée et sans mode.
- RG22. `transfers` / `transfersDone` : conservés inertes (RG15). Un virement libre entre comptes non lié à une ligne `var` est hors périmètre.

## Parcours utilisateur

Nominal : le 5 du mois, mon loyer (`fix`, prélèvement automatique, jour prévu 5) est passé. Je coche sa case : la date proposée est aujourd'hui. Le montant compté est le budget (650 €), ou le réel s'il est saisi (par exemple 652,40 €, amendement 5). La ligne sort du Reste à sortir du compte principal et la Marge se recalcule.

Variable sur compte dédié : « Cantine » (`var`, compte Swile). Le 1er je vire 120 € sur Swile et je coche : le solde attendu de Swile augmente de 120 €, mes dépenses Swile le consomment. « Alimentation » (`var`, principal) n'a pas de case : sa part restante entre dans le Reste à sortir du principal.

Retard : une assurance prévue le 10, non pointée le 12 : badge « en retard ». Je coche : le badge disparaît.

Cas limites :
- Jour prévu 31 dans un mois de 30 jours : ramené au 30 (RG16).
- Montant pointé à 0 : accepté (la ligne est considérée traitée).
- Je décoche une ligne : date et montant effacés, la ligne revient dans le Reste à sortir.
- Le compte d'une ligne change après pointage : le pointage est conservé, il suit la ligne.
- Compte archivé : ses lignes restent pointables, l'indicateur du compte reste affiché tant que des lignes y sont rattachées.
- Reste à sortir = 0 et Solde non saisi : Marge affichée « — » (Solde absent).
- Mois clôturé / année clôturée : lecture seule (RG7, RG14).
- Mois non initialisé : aperçu seul (comme les autres blocs).

## Design

Design proposé, à valider (aucune maquette fournie). Composants et tokens existants : `panel block`, `block-head`, `block-strip`, `check`, `chip`, pastille de compte (`dot`), `popmenu`, `cell-input`, `alert-pill`, tokens de `organic.css`. Aucun nouveau bandeau fixe.

Emplacement. L'indicateur prend exactement la place de `TransfersCard` : 4e colonne de `budget-grid`, sous « Enveloppes ». Le titre devient « Pointage par compte ». Les cases se placent dans les lignes de chaque bloc existant.

Ligne de bloc (écran Budget), colonnes existantes inchangées, case ajoutée en tête, badge et jour à droite du nom :

```
[ ] Loyer          [prél.] le 5   650,00 €  ...
[x] Assurance      [prél.] le 10  42,00 €   ...  pointé 10/10 · 42,00 €
[ ] Électricité    [prél.] le 8   55,00 €   [en retard]
    Alimentation   ●              400,00 €  ... (compte principal : pas de case)
[ ] Cantine        [billet]       120,00 €  ... (compte Swile : case)
```

Clic sur la case : coche avec les valeurs par défaut. Clic sur le texte « pointé 10/10 · 42,00 € » ou sur un petit crayon au survol : ouvre un `popmenu` avec champ date, champ montant, jour prévu (1 à 31), mode d'exécution, bouton « Décocher ».

Carte « Pointage par compte » (une ligne-bloc par compte concerné) :

```
┌─ Pointage par compte ─────────────────────────────┐
│ v ● Compte principal        Solde estimé 1 488,00 │
│   Reste à sortir     1 842,00 €                   │
│   Solde saisi        [ 2 300,00 € ]  maj 18/10    │
│   Marge                -354,00 €          (rouge) │
│   ┌ Détail d'octobre ───────────────────────────┐ │
│   │ Solde saisi (maj 18/10)        2 300,00 €   │ │
│   │ 20/10  Loyer (pointé)           -650,00 €   │ │
│   │ 21/10  Courses (dépense)         -42,00 €   │ │
│   │ 21/10  Cantine → Swile (pointé) -120,00 €   │ │
│   │ = Solde estimé                  1 488,00 €  │ │
│   │ Reste à sortir                              │ │
│   │ Électricité  le 8  [en retard]    55,00 €   │ │
│   │ ...                                         │ │
│   └─────────────────────────────────────────────┘ │
│ > ● Swile                   Solde estimé   205,00 │
│ > ● Espèces                 Solde estimé    40,00 │
└───────────────────────────────────────────────────┘
```

(Chiffres illustratifs.) Détail : ligne dépliable sous l'en-tête du compte, au clic (chevron v / >), plutôt qu'un `popmenu` ou un panneau : la 4e colonne est étroite, la carte reste à son emplacement et on voit le compte en contexte. Les comptes repliés montrent seulement nom et Solde estimé ; les champs Solde saisi, Reste à sortir et Marge se voient dans le compte déplié. Mouvements entrants en vert, sortants en neutre, mouvements antérieurs à la date de mise à jour grisés (RG30).

En-tête de carte : « n lignes en retard » (`alert-pill`) quand n > 0. Solde : champ `cell-input` éditable (EditableText), date de mise à jour en gris. Marge : verte ≥ 0, rouge < 0 (`gapColor`).

États : mois ouvert avec lignes ; aucune ligne pointée ; toutes pointées (Reste à sortir 0) ; Solde jamais saisi (« Saisir le solde », Marge « — ») ; ligne en retard ; mois clôturé (lecture seule) ; mois non initialisé (aperçu). Pas d'état d'erreur nouveau (champs invalides refusés avec retour à la valeur précédente).

## Impact technique

- Domaine : `MonthData` gagne les pointages par ligne (date, montant) ; `Line` et `TemplateLine` gagnent un jour prévu et un mode d'exécution ; solde saisi et sa date par compte (par compte et par mois, RG13) ; fonctions pures de calcul du Reste à sortir, du Solde estimé, de la Marge et de la liste des mouvements du détail par compte (hors `Ledger.bankFlow`, qui garde ses soldes calculés) ; `Ledger.bankFlow` lit les lignes `var` pointées sur compte dédié (RG9) ; test de retard à partir d'une date injectée (horloge non figée). `transfers` / `transfersDone` : selon réponses 1 et 2.
- Application : actions pointer / dépointer une ligne (refus sur mois verrouillé ou non initialisé, comme `setTransferDone`), modifier date / montant / jour prévu / mode, saisir le solde d'un compte ; reprise du jour prévu et du mode par `applyTemplate` et `duplicatePrevious` ; migration silencieuse au chargement (ADR 0003).
- Infrastructure : `localRepository` inchangé (sérialise l'agrégat). Table `line_checks` (user_id, month, line_key, done_on, amount) à ajouter dans une nouvelle migration additive (sans rattraper le retard des autres specs). Colonnes jour prévu / mode à prévoir sur `template_lines` et `budget_lines`, et stockage du solde saisi par compte.
- Présentation : `Budget.tsx` (cases, badge, jour, retrait de `TransfersCard`, nouvelle carte), `TransferRoute.tsx` retiré de l'écran Budget (les virements n'ont plus d'interface), `app.css` (classes `.transfers` / `.transfer`), seed de démonstration.
- Schéma Supabase : `line_checks` ; `transfers_done` conservé tel quel (données inertes).

## Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application). Le reste est vérifié à la relecture de l'UI.

Amendement 4 : les critères CA7, CA7bis, CA7ter, CA7quinquies, CA8, CA19, CA21, CA24 à CA38, CA40 et CA42 sont abrogés (voir la liste en fin de spec) ; CA7quater et CA7sexies sont à relire avec « début de mois » à la place de « Solde saisi » (CA7sexies ne vaut qu'en mode pointage) ; CA43 à CA46 restent valables, avec « Solde estimé augmente du montant pointé » pour un mois en mode pointage.

- CA1 (T). Given une ligne `fix` de budget 650 € non pointée, When je la coche sans rien modifier, Then elle est pointée avec la date du jour et 650 €, et son réel est inchangé.
- CA2 (T). Given une ligne pointée à 652,40 €, When je la décoche, Then date et montant sont effacés et elle réapparaît dans le Reste à sortir à son budget.
- CA3 (remplacé par CA39). Une ligne `rev` n'est pas pointable à l'origine ; voir l'amendement 3.
- CA4 (T). Given une ligne `var` dont le compte résolu est le principal, When j'essaie de la pointer, Then c'est refusé ; Then son Reste à sortir vaut max(budget − réel, 0) (400 € de budget et 450 € de réel donnent 0).
- CA5 (T). Given une ligne `var` dont le compte résolu est Swile, When je la pointe pour 120 €, Then le solde calculé du principal baisse de 120 € et celui de Swile augmente de 120 € ; Then une dépense de 20 € sur Swile baisse le solde de Swile de 20 € une seule fois.
- CA6 (T). Given cette ligne pointée, When je la décoche, Then les soldes reviennent à leur valeur d'avant.
- CA7 (T). Given un compte avec deux lignes `fix` de 100 € et 50 €, dont celle de 100 € pointée après la date de mise à jour, et un Solde saisi de 300 €, When je calcule, Then le Reste à sortir vaut 50 €, le Solde estimé 200 € et la Marge +150 € ; avec un Solde saisi de 130 €, le Solde estimé vaut 30 € et la Marge −20 €.
- CA7bis (T). Given un Solde saisi de 300 € le 18/10, When je pointe une ligne de 100 € le 20/10 puis ajoute une dépense de 42 € payée avec ce compte le 21/10, Then le Solde estimé vaut 158 € ; When je décoche la ligne, Then 258 €.
- CA7ter (T). Given un pointage daté du 15/10 et un Solde saisi daté du 18/10, When je calcule le Solde estimé, Then ce pointage n'est pas compté (déjà compris dans le Solde) ; daté du 18/10 : non compté non plus ; daté du 19/10 : compté.
- CA7quater (T). Given une ligne `var` « Cantine » sur Swile de 120 € pointée le 20/10 et une dépense de 20 € sur Swile le 21/10, Then le Solde estimé du principal baisse de 120 €, celui de Swile = Solde saisi + 120 − 20, et la dépense n'est comptée qu'une fois.
- CA7quinquies (T). Given un mois sans Solde saisi mais dont le mois précédent en a un, When je lis le mois, Then il reprend sa valeur et sa date ; Given un mois clôturé, Then le Solde saisi n'est plus modifiable.
- CA7sexies (T). Given un réel saisi sur une ligne `fix` non pointée, Then le Solde estimé ne change pas (le réel n'est pas une source).
- CA8 (T). Given un compte sans Solde saisi, When je lis l'indicateur, Then le Solde et la Marge sont absents (« — »).
- CA9 (T). Given un mois clôturé, When j'essaie de pointer, dépointer ou saisir un solde, Then c'est refusé et les valeurs restent affichées.
- CA10 (T). Given un jour prévu 31 dans un mois de 30 jours, When je calcule le jour effectif, Then c'est le 30.
- CA11 (T). Given une ligne avec jour prévu 10, non pointée, mode non informatif, When la date injectée est le 11 ou le 12, Then la ligne est en retard le 11 et le 12, et pas le 10 ; Given une ligne pointée, sans jour prévu, ou en mode informatif, Then jamais en retard.
- CA12 (T). Given une ligne avec jour prévu et mode, When je crée un mois par « Appliquer le modèle » ou « Dupliquer », Then le jour prévu et le mode sont repris et la ligne est non pointée.
- CA13 (T). Given un prélèvement automatique dont le jour prévu est passé, When je charge ou j'ouvre le mois, Then la ligne reste non pointée.
- CA14 (T). Given des données sans aucun pointage ni jour ni mode, When elles sont chargées, Then aucune erreur, `version` vaut 1, rien n'est modifié ; relancer ne change rien.
- CA15 (T). Given le pointage d'une ligne autre que `var`, When je lis les soldes calculés, le réel, le « Reste à placer » et le « Disponible (réel) », Then ils sont identiques à ceux d'avant le pointage.
- CA16. Given l'écran Budget, When je le regarde, Then le bloc « Virements à effectuer » n'existe plus et la carte « Pointage par compte » occupe sa place, sous « Enveloppes ».
- CA17. Given une ligne sortante pointable, When je clique la case, Then elle se coche immédiatement, et le survol / crayon ouvre la date, le montant, le jour prévu et le mode.
- CA18. Given un compte avec Marge négative, When je le regarde, Then la Marge est rouge ; positive ou nulle, verte.
- CA19. Given la carte, When je modifie le Solde d'un compte, Then la date « maj » devient celle du jour, le Solde estimé et la Marge se recalculent.
- CA20. Given la carte, When je clique sur l'en-tête d'un compte, Then le détail du mois se déplie sous lui (mouvements triés par date, lignes restant à sortir, formule) ; un second clic le replie ; en ouvrir un autre replie le premier.
- CA21. Given un mouvement antérieur à la date de mise à jour, When j'ouvre le détail, Then il est grisé avec la mention « déjà compris dans le Solde ».
- CA22. Given un mois clôturé, When j'ouvre le détail, Then il s'affiche en lecture seule.
- CA23. Given un pointage ou une dépense ajouté pendant que le détail est ouvert, When il est enregistré, Then le Solde estimé et le détail se mettent à jour sans rechargement.

## Questions ouvertes

Décisions du développeur intégrées (13 questions du premier tour) : transfers / transfersDone conservés inertes (RG15, RG22) ; virement libre entre comptes hors périmètre ; source d'un virement `var` = compte principal, ligne non pointée comptée au Reste à sortir du principal (RG12) ; Solde saisi indépendant du solde calculé (RG13) et par compte et par mois, figé à la clôture, valeur de départ = mois précédent (RG13, RG14) ; jour prévu / mode : mois affiché + modèle (RG17) ; mode sans défaut, « informatif » sans case ni retard (RG18, RG19) ; retard dès le lendemain, tout mois passé ouvert non pointé en retard (RG19) ; migration SQL additive de cette spec seulement ; montant pointé supérieur au budget : la ligne sort entièrement du Reste à sortir, aucun écart reflété ; epa / inv rattachés au compte de la ligne, pointage attaché à la ligne ; date de pointage libre ; numérotation des specs hors périmètre.

À valider (nouvelle exigence « Solde estimé », propositions de l'analyste) :

Résolues (Solde estimé) : Marge = Solde estimé − Reste à sortir (RG11) ; coupure stricte, seuls les mouvements datés après la date de mise à jour du Solde saisi comptent (RG23) ; le Solde estimé ne compte que les mouvements du mois, l'utilisateur ressaisit son Solde en début de mois ; détail d'un compte en ligne dépliable dans la carte (Design, RG28).

Aucune question ouverte.

## Amendement du 2026-10-21 — Date de mise à jour du Solde modifiable

> Abrogé par l'amendement 4 (RG31 à RG37 et CA24 à CA31), à l'exception de la règle de bornes de date (RG32), réutilisée pour la date d'un relevé ou d'une régularisation (RG62, RG65). Le texte ci-dessous est conservé pour l'historique.

Demande du développeur : « Pouvoir modifier la date de MAJ du solde d'un compte ». Complète RG13 et RG23 ; n'altère aucune autre règle. Numérotation à la suite (RG31 à RG37, CA24 à CA31).

Contexte : aujourd'hui la date « maj » vaut la date de la saisie du Solde (RG13) et ne se corrige pas. Or c'est elle qui fixe la coupure du Solde estimé (RG23, RG30). Quand le relevé consulté date d'un autre jour que la saisie, le Solde estimé compte ou ignore à tort certains mouvements.

### Règles de gestion

- RG31. La date de mise à jour du Solde saisi d'un compte est modifiable, séparément du montant, dans le mois affiché.
- RG32. Bornes : la nouvelle date doit être dans le mois affiché (du 1er au dernier jour, bornes incluses) et ne doit pas être dans le futur (au plus la date du jour). Pour un mois passé, c'est donc tout le mois ; pour le mois en cours, du 1er au jour même ; un mois futur n'a aucune date possible, la date y est non modifiable.
- RG33. Date invalide (hors du mois affiché, future, vide ou mal formée) : la modification est refusée, la date précédente est conservée, et un message court sous le champ indique la raison (« Date hors du mois » ou « Date dans le futur »). Rien n'est enregistré.
- RG34. Modifier la date ne change pas le montant du Solde saisi. Seule la coupure de RG23 bouge : les mouvements du mois datés strictement après la nouvelle date sont comptés dans le Solde estimé, les autres passent en « déjà compris dans le Solde » (RG30). Solde estimé, Marge et détail se recalculent à l'instant, sans rechargement. Il en va de même pour une date identique à la précédente (aucun changement).
- RG35. Reprise du mois précédent (RG13) : tant que le mois n'a pas de saisie propre, il affiche le montant et la date du mois précédent, qui est hors du mois affiché. Modifier alors la date crée la saisie du mois affiché : le montant repris est copié, la nouvelle date (dans le mois affiché, RG32) est enregistrée. Le mois précédent n'est jamais modifié. Un mois qui reprend le Solde du précédent n'a donc pas de « date hors du mois » éditable tant qu'on n'a pas saisi une date valide.
- RG36. Mois clôturé ou année clôturée (`isMonthLocked`) ou mois non initialisé : la date est en lecture seule, comme le montant (RG14). L'action est refusée côté application.
- RG37. Comptes sans Solde saisi : pas de champ date (rien à dater, RG29). Saisir un montant fixe la date à aujourd'hui (RG13 inchangée), modifiable ensuite par RG31. Si le mois affiché est passé et que « aujourd'hui » est hors du mois, la date proposée à la première saisie est le dernier jour du mois affiché.

### Parcours

Nominal : le relevé du principal date du 12/10 mais j'ai saisi le Solde le 18/10. Je clique « maj 18/10 », je choisis 12/10. Le montant ne bouge pas ; le pointage du 15/10, jusque-là « déjà compris dans le Solde », est maintenant compté dans le Solde estimé, qui baisse en conséquence.

Cas limites : date = jour du Solde (aucun changement) ; date du 1er ou du jour même (bornes valides) ; date future ou du mois précédent (refusée) ; mois clôturé (lecture seule) ; Solde repris du mois précédent (RG35).

### Design (ajout, à valider)

Carte « Pointage par compte », compte déplié : sur la ligne « Solde saisi », le texte gris « maj 18/10 » devient cliquable (curseur main, soulignement au survol). Au clic il se transforme en champ date `cell-input` (`input type="date"`, `min` = 1er du mois, `max` = min(dernier jour du mois, aujourd'hui)) à la place du texte ; Entrée ou perte du focus valide, Échap annule. En cas d'erreur (RG33), la date précédente revient et un texte rouge court apparaît sous la ligne (classe d'erreur/alerte existante), effacé à la prochaine action. Mois clôturé / non initialisé : « maj jj/mm » reste du texte non cliquable. Aucun nouveau composant ; le détail du compte (RG30) se recalcule en direct.

```
Solde saisi        [ 2 300,00 € ]  maj [12/10/2026]
Date dans le futur                                  (erreur, texte rouge)
```

### Impact technique

- Domaine : fonction de validation de la date (bornes de RG32, date du jour injectée comme pour le retard, RG19). Aucun changement de type : la date de mise à jour existe déjà dans le stockage du Solde par compte et par mois.
- Application : action « modifier la date de mise à jour du Solde d'un compte pour un mois », refus si mois verrouillé, non initialisé, date invalide ou compte sans Solde saisi (hors reprise, RG35) ; création de la saisie du mois lors d'une modification sur un Solde repris.
- Infrastructure / Supabase : aucun changement (la date est déjà stockée).
- Présentation : `Budget.tsx`, carte « Pointage par compte ».

### Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application).

- CA24 (T). Given un Solde saisi de 300 € daté du 18/10 et un pointage de 100 € daté du 15/10, When je passe la date au 12/10, Then le montant reste 300 € et le Solde estimé passe de 300 € à 200 € (le pointage est désormais compté).
- CA25 (T). Given le même cas, When je repasse la date du 12/10 au 18/10, Then le Solde estimé revient à 300 €.
- CA26 (T). Given un Solde daté du 18/10, When je le re-date au 18/10, Then rien ne change (montant, date, Solde estimé, détail).
- CA27 (T). Given un pointage daté du 19/10 et un Solde daté du 18/10 (pointage compté), When je re-date le Solde au 19/10, Then le pointage du 19/10 n'est plus compté (coupure stricte, RG23, RG30) ; au 20/10, il reste non compté.
- CA28 (T). Given octobre affiché et une date au 01/10 ou au jour même (bornes), Then la date est acceptée ; Given 30/09, 01/11 ou une date postérieure à aujourd'hui, Then elle est refusée, la date et le montant précédents sont conservés, et la raison (hors du mois / futur) est retournée.
- CA29 (T). Given un mois clôturé, une année clôturée ou un mois non initialisé, When je tente de modifier la date, Then c'est refusé et la date reste affichée.
- CA30 (T). Given un mois dont le Solde est repris de septembre (240 €, daté du 28/09), When je re-date le Solde au 05/10, Then octobre a sa propre saisie (240 €, 05/10), septembre reste inchangé à 240 € / 28/09 ; Given une date invalide, Then aucune saisie n'est créée.
- CA31. Given l'écran Budget et un compte déplié, When je clique « maj jj/mm », Then un champ date apparaît limité au mois et à aujourd'hui ; valider met à jour la date, le Solde estimé, la Marge et le détail à l'instant ; Échap annule ; une date invalide affiche le message sous le champ ; sur un mois clôturé le texte n'est pas cliquable.

## Amendement du 2026-10-21 (2) — Solde de départ des comptes = Solde saisi du premier mois

> Abrogé par l'amendement 4 (RG38 à RG43 et CA32 à CA38). Seule RG44 (le calcul du solde de départ et des soldes du Ledger est inchangé) reste vraie. L'intention de la demande (le solde de départ de l'onglet Comptes est la base de tout) est reprise, sans lien ni Solde saisi, par RG57. Le texte ci-dessous est conservé pour l'historique.

Demande du développeur : « D'ailleurs pour le premier mois du budget, ce solde est celui de départ des comptes (onglet compte) sinon ils ne servent à rien ». Complète RG13 (reprise du mois précédent) ; numérotation RG38 à RG44, CA32 à CA38. Décisions du développeur intégrées.

Constat : la reprise de RG13 repose sur le mois précédent, qui n'existe pas pour le premier mois. Le Solde saisi y serait vide et la carte inutilisable. Or l'onglet Comptes porte déjà un solde de départ par compte (`openingBalance`, au 1er jour de `openingMonth`, spec 0002 RG7). Le Ledger l'utilise pour les soldes calculés ; cela ne change pas.

### Règles de gestion

- RG38. Pour un compte, dans son mois de départ (`openingMonth`), tant qu'aucun Solde n'a été saisi à la main pour ce mois, le Solde saisi affiché est le solde de départ du compte (onglet Comptes) et sa date de mise à jour est le 1er jour du mois. À défaut de saisie, les mois suivants reprennent ensuite de proche en proche (RG13).
- RG39. Lien : ce Solde initial reste lié au solde de départ tant qu'il n'a pas été saisi à la main. Si le solde de départ change dans l'onglet Comptes, le Solde saisi du mois de départ suit, sans écriture dans la donnée du mois. Dès qu'une saisie manuelle (montant, ou seule modification de la date, RG31) existe pour ce mois, elle prend le pas : le montant effectif est copié dans la saisie du mois, le lien est rompu pour ce mois, et le solde de départ n'est jamais réécrit (indépendance de RG13). Le mécanisme est le même que celui de la reprise du mois précédent (RG35), avec comme source le solde de départ au lieu du mois précédent.
- RG40. Les mois suivants qui reprennent le Solde (RG13) reprennent la valeur effective du mois précédent, y compris le solde de départ lié. Ils suivent donc aussi un changement du solde de départ tant qu'aucune saisie n'existe entre-temps.
- RG41. Comptes créés plus tard : le même principe s'applique au mois de départ du compte (pas seulement `firstMonth`). Un compte créé en cours d'année avec un mois de départ de mars a, en mars, un Solde initial égal à son solde de départ. Avant son mois de départ, le compte n'a pas de Solde (« — », RG29). Changer le mois de départ d'un compte déplace cette règle au nouveau mois.
- RG42. Solde de départ à 0 non confirmé (`openingConfirmed` absent) : le Solde initial vaut 0 et est affiché comme les autres (le rappel de l'onglet Comptes reste la façon de le renseigner).
- RG43. Coupure du Solde estimé (RG23), exception pour le Solde initial lié : le solde de départ est celui d'avant mouvements. Tant que le Solde du mois de départ est lié (RG39), les mouvements datés du 1er jour du mois comptent dans le Solde estimé (coupure « à partir du 1er inclus »), la date affichée restant « 01/jj ». Dès que le Solde devient une saisie manuelle (RG39, RG35), la coupure stricte de RG23 s'applique (mouvements datés strictement après la date de MAJ). L'exception ne vaut que pour le mois de départ du compte ; les mois suivants (reprise, RG40) n'ont pas de mouvement antérieur au 1er. Dans le détail (RG30), un mouvement du 1er d'un Solde lié n'est donc pas grisé.
- RG44. Le calcul du solde de départ et des soldes calculés (Ledger, écran Comptes) est inchangé. Mois clôturé : la valeur effective est figée avec le reste (RG14) ; lecture seule (RG36).

### Critères d'acceptation

- CA32 (T). Given un compte au solde de départ de 1 200 € et au mois de départ d'octobre, sans saisie, When je lis le Solde du mois, Then il vaut 1 200 € daté du 01/10, et le Solde estimé = 1 200 € + entrées − sorties du mois à partir du 01/10 inclus (RG43).
- CA33 (T). Given ce Solde non saisi, When le solde de départ passe à 1 500 € dans l'onglet Comptes, Then le Solde du mois vaut 1 500 € (lien).
- CA34 (T). Given une saisie manuelle de 1 300 € au 12/10, When le solde de départ passe à 1 500 €, Then le Solde reste 1 300 € / 12/10 et le solde de départ de l'onglet Comptes reste 1 500 €.
- CA35 (T). Given une simple modification de la date de MAJ (RG31) sur un Solde lié, Then le montant (valeur effective) est copié avec la nouvelle date et le lien est rompu pour ce mois.
- CA36 (T). Given un compte créé avec un mois de départ de mars, When je lis le Solde de février, Then il est absent (« — ») ; en mars, il vaut son solde de départ au 01/03 ; en avril sans saisie, il reprend la valeur de mars (RG40).
- CA37 (T). Given un Solde lié (solde de départ 1 200 €) et des mouvements de −50 € le 01/10 et −30 € le 02/10, When je calcule le Solde estimé, Then il vaut 1 120 € (les deux comptent) ; When le Solde devient une saisie manuelle de 1 200 € au 01/10, Then il vaut 1 170 € (seul le mouvement du 02/10 compte, coupure stricte) ; Given un Solde lié et un mois suivant sans saisie, Then la coupure stricte s'applique.
- CA38 (T). Given un solde de départ à 0 non confirmé, When je lis le Solde, Then il vaut 0 € daté du 1er, sans erreur ; given un mois clôturé, Then la valeur est en lecture seule.

### Cohérence avec l'amendement (1) et la spec

- Le Solde « absent » de RG29 et l'absence de champ date de RG37 ne concernent plus que les mois antérieurs au mois de départ du compte (RG41). Dans le mois de départ, le compte a toujours un Solde (lié, RG38) et sa date « 01/jj » est modifiable (RG31 à RG35, CA35). Une saisie du montant dans ce mois prend la date de RG37 (aujourd'hui ; dernier jour du mois si le mois affiché est passé). Un mois de départ futur affiche son Solde lié sans date modifiable (RG32).
- RG35 (reprise du mois précédent) et RG39 (solde de départ) suivent le même mécanisme : modifier la seule date ou le montant crée la saisie du mois avec le montant effectif copié, sans jamais modifier la source (mois précédent ou solde de départ).
- RG43 est la seule exception à la coupure stricte de RG23 et RG30.

## Amendement du 2026-10-21 (3) — Les revenus sont pointables (« reçus »)

Demande du développeur : « Les revenus également doivent être pointables ». Numérotation RG45 à RG56, CA39 à CA47. Remplace RG3 et amende RG6, RG25 et le périmètre (textes d'origine corrigés plus haut). Décisions du développeur intégrées.

### Règles de gestion

- RG45. Les lignes `rev` sont pointables, avec les mêmes règles que les autres lignes : case, date, jour prévu, mode d'exécution, badge « en retard » (RG1, RG2, RG7, RG8, RG16 à RG20). Seuls les libellés changent : « reçu » au lieu de « pointé » (case « reçu », « reçu le 05/10 · 2 400,00 € »), « Décocher » devient « Marquer non reçu ». Valeurs par défaut : date = aujourd'hui, montant = budget. Une ligne `rev` en mode « informatif » n'a pas de case ni de retard et n'est pas comptée en « Revenus attendus ».
- RG46. Compte de réception : le compte de la ligne, sinon le compte principal (comme les autres lignes).
- RG47. Un revenu reçu entre dans le Solde estimé du compte de réception comme une entrée, pour son montant compté (RG76), daté de sa date de pointage. (Amendement 4 : plus de coupure par date, RG23 et RG43 abrogées ni grisé RG30 ; un revenu reçu compte dans les mois en mode pointage, RG59, RG60 ; dans les mois en mode réel c'est son réel qui compte, comme dans le Ledger.)
- RG48. Un revenu non reçu (attendu) ne compte pas dans le Solde estimé ni dans la Marge. Marge = Solde estimé − Reste à sortir (RG11), inchangée. Le Reste à sortir reste inchangé : seules les lignes sortantes y entrent (RG12).
- RG49. Revenus attendus : le compte affiche, à part, une ligne « Revenus attendus » = somme des budgets des lignes `rev` du compte non reçues et hors mode informatif, avec le détail des lignes dans le compte déplié. Elle n'entre dans aucun autre total. Les lignes attendues dont le jour prévu est dépassé portent le badge « en retard » (RG19) ; elles comptent dans le compteur « n lignes en retard » de l'en-tête de la carte.
- RG50. (Abrogée, amendement 5 : le réel prime sur le montant pointé, RG78.) Ancien texte : montant reçu ≠ budget : le Solde estimé utilise le montant pointé ; l'écart avec le budget n'est reflété nulle part ailleurs (comme RG12 pour les sorties). La ligne sort entièrement des « Revenus attendus ».
- RG51. Le réel d'un revenu reste indépendant du pointage (RG2) : marquer reçu ne modifie pas `actual`, saisir un réel ne marque rien reçu. Le réel n'est pas une source du Solde estimé (RG26).
- RG52. Calcul du Ledger : un revenu reçu ne modifie pas les soldes calculés de l'écran Comptes (`bankFlow` continue de lire le réel, RG10). Aucun changement du « Reste à placer », du « Disponible (réel) » ni des totaux de revenus du budget.
- RG53. Mois clôturé, année clôturée, mois non initialisé : cases, date, montant, jour et mode des revenus en lecture seule (RG7) ; les valeurs reçues restent affichées et comptent dans le Solde estimé affiché (figé, RG14).
- RG54. Reprise mensuelle : jour prévu et mode d'un revenu sont repris dans les mois créés (RG17) ; le « reçu » ne l'est jamais.
- RG55. Détail du compte (RG28) : les revenus reçus apparaissent dans les mouvements, en entrée (montant signé + en vert), triés par date comme les autres ; les revenus attendus apparaissent dans une section « Revenus attendus » distincte de « Reste à sortir ». La formule reste Solde saisi + entrées − sorties = Solde estimé, les entrées incluant les revenus reçus.
- RG56. Migration : aucun changement de données requis. Les revenus existants sont non reçus, sans jour ni mode (RG21).

### Design (ajout, à valider)

Écran Budget, bloc Revenus : mêmes cases et mêmes badges que les autres blocs, libellé « reçu ».

```
[x] Salaire   [vir. auto] le 28   2 400,00 €   reçu 28/10 · 2 400,00 €
[ ] Prime     [vir. manuel] le 5  300,00 €      [en retard]
```

Carte « Pointage par compte », compte déplié (en plus du détail existant) :

```
│   Revenus attendus                 300,00 €   │
│     Prime  le 5  [en retard]       300,00 €   │
│   ┌ Détail d'octobre ───────────────────────┐ │
│   │ 28/10  Salaire (reçu)         +2 400,00 € │ │  (vert)
```

### Impact technique

- Domaine : le calcul du Solde estimé et la liste des mouvements du détail intègrent les lignes `rev` reçues en entrée ; nouveau calcul pur « Revenus attendus » par compte ; `Ledger.bankFlow` inchangé.
- Application : l'action de pointage, de modification et de reprise du jour / mode accepte désormais les lignes `rev` (plus de refus par type de bloc).
- Présentation : `Budget.tsx` (case et libellé « reçu » dans le bloc Revenus, ligne « Revenus attendus » et section du détail).
- Schéma Supabase : `line_checks` est déjà indexé par `line_key`, aucune colonne nouvelle ; aucune contrainte de bloc à lever. Pas de migration SQL supplémentaire.
- Seed de démonstration : ajouter un jour prévu et un mode au revenu principal ; aucun revenu reçu (voir l'amendement 4 pour les pointages d'exemple et `pointageStart`).

### Critères d'acceptation

- CA39 (T). Given une ligne `rev` de budget 2 400 €, When je la marque reçue sans rien modifier, Then elle est pointée à la date du jour pour 2 400 €, son réel est inchangé, et l'action n'est plus refusée ; When je la marque non reçue, Then date et montant sont effacés.
- CA40 (T). Given un Solde de 1 000 € daté du 18/10 sur le compte principal et un salaire de 2 400 € reçu le 28/10 sur ce compte, Then le Solde estimé vaut 3 400 € ; reçu sur un autre compte (ligne rattachée à un compte dédié), Then seul ce compte augmente.
- CA41 (T). Given un revenu sans compte, Then il est reçu sur le compte principal.
- CA42 (T). Given un revenu reçu le 15/10 et un Solde daté du 18/10, Then il n'est pas compté (grisé « déjà compris dans le Solde » dans le détail) ; daté du 18/10 : non compté ; daté du 19/10 : compté ; Given un Solde lié (RG43) et un revenu reçu le 1er du mois de départ, Then il est compté.
- CA43 (T). Given un revenu non reçu de 300 €, Then le Solde estimé, la Marge et le Reste à sortir ne changent pas ; la ligne « Revenus attendus » du compte vaut 300 € ; reçu, elle vaut 0 € et le Solde estimé augmente du montant compté de la ligne (RG76 : réel sinon budget).
- CA44 (T). Given un revenu de budget 2 400 € reçu pour 2 350 €, Then le Solde estimé augmente de 2 350 € et la ligne sort des revenus attendus.
- CA45 (T). Given un revenu avec jour prévu 28 en mode virement automatique, non reçu, When la date injectée est le 29, Then il est en retard et compté dans l'en-tête ; en mode informatif, jamais en retard ni compté en attendu ; le 28 : pas en retard ; reçu : jamais en retard.
- CA46 (T). Given un revenu reçu, When je lis les soldes calculés de l'écran Comptes, le réel, le « Reste à placer » et le « Disponible (réel) », Then ils sont identiques à ceux d'avant ; Given un mois clôturé, When je tente de marquer reçu ou non reçu, Then c'est refusé et les valeurs reçues restent affichées et comptées.
- CA47. Given l'écran Budget, When je regarde le bloc Revenus et un compte déplié, Then les cases portent le libellé « reçu », les revenus reçus apparaissent en vert dans les mouvements du détail et les revenus attendus dans une section « Revenus attendus » avec leur total.

### Questions ouvertes

Aucune. Décisions du développeur : les mouvements du 1er jour comptent tant que le Solde est lié (RG43) ; lien permanent tant qu'il n'est pas saisi à la main (RG39) ; règle valable pour le mois de départ de chaque compte (RG41) ; modifier la seule date d'un Solde lié crée une saisie manuelle (RG39, CA35). (Décisions remplacées par l'amendement 4.)

## Amendement du 2026-10-21 (4) — Solde estimé continu, relevé bancaire et régularisation

Décisions du développeur intégrées. Numérotation : RG57 à RG75, CA48 à CA66.

Demande du développeur (mot pour mot) : « Je n'aime pas trop l'idée de pouvoir bidouiller par mois le solde de départ car cela suggère que quelque chose s'est passé mais que ce n'est pas tracé ou que le solde de départ n'était pas bon dès le début... J'aurais préféré avoir un unique solde de départ avec une dépense rattrapage si vraiment il y avait un écart visible entre le réel et l'estimé. » Précision : la régularisation ne concerne pas l'épargne (comptes `epa` / `inv`), qui garde son rapprochement dans Dépenses > Solde épargne (`statements`, `setStatement`), inchangé.

### Ce qui est abrogé, ce qui reste

Abrogé (devenu sans objet) :
- Le Solde saisi par mois comme point de départ : RG13, la mention « Solde » de RG11 et de RG14, RG29 (remplacée), RG37.
- La coupure par date : RG23, RG30 (mouvements grisés « déjà compris »), RG43, et la coupure de RG47.
- Le lien avec l'onglet Comptes et la reprise mois à mois : RG38, RG39, RG40, RG41, RG42, RG35.
- La date de MAJ modifiable : RG31, RG33, RG34, RG36 ; RG32 (bornes : dans le mois affiché, jamais dans le futur) est conservée, mais pour la date d'un relevé ou d'une régularisation (RG62, RG65).
- Critères : CA7, CA7bis, CA7ter, CA7quinquies, CA8, CA19, CA21, CA24 à CA38, CA40, CA42.

Conservé : pointage des lignes (RG1 à RG10), Reste à sortir (RG12), Marge = Solde estimé − Reste à sortir (RG11), jour prévu, mode, badge « en retard » (RG16 à RG20), revenus reçus et attendus (RG45 à RG56, sauf la coupure de RG47), détail dépliable (RG28), `transfers` / `transfersDone` inertes (RG15, RG22), RG44 (le Ledger garde ses soldes). Reformulés : RG26, RG27, RG28, RG29.

### Règles de gestion

Un solde de départ, un solde estimé continu
- RG57. Un compte bancaire (`BudgetData.accounts`) a un seul solde de départ : celui de l'onglet Comptes (`openingBalance` au 1er jour de `openingMonth`). Il se modifie uniquement dans l'onglet Comptes. Il n'existe plus aucune saisie de solde par mois, de date de MAJ ni de reprise. Avant son mois de départ, le compte n'a pas de Solde estimé (« — »).
- RG58. Solde estimé continu : le Solde estimé de fin de mois M = Solde estimé de fin de M−1 + mouvements de M (RG59 à RG61) + régularisations actives de M (RG65). Pour le mois de départ, M−1 est remplacé par le solde de départ. Le début d'un mois est la fin du précédent, calculé, jamais saisi. Le Solde estimé affiché pour le mois choisi est celui de fin de ce mois (tous les mouvements du mois, y compris datés plus tard que le jour). Ce qui est reporté d'un mois à l'autre est le Solde estimé, pas une saisie.
- RG59. Deux façons de compter les mouvements d'un mois, selon le « début du pointage » (RG61) : mois en mode réel (mois antérieurs à ce début) et mois en mode pointage (ce mois et les suivants).
- RG60. Mouvements d'un mois :
  - mode réel : exactement les mouvements que lit aujourd'hui le Ledger pour ce compte (`bankFlow` : réel des lignes `rev`, `fix`, `cre`, `epa`, `inv`, transactions, virements anciens « faits » entre comptes) ;
  - mode pointage : pointages des lignes à leur date et au montant compté (RG76) (RG24, RG25, RG47) et transactions du compte, sans le réel des lignes ; une ligne non pointée ne compte pas (elle est dans le Reste à sortir) ;
  - dans les deux modes : les transactions du compte comptent une fois, et les virements anciens « faits » (inertes, RG15) comptent comme dans le Ledger, datés du 1er du mois ; et le report de base de la clôture d'année (`overrides` `bank:<id>`) s'applique comme dans le Ledger.
- RG61. Début du pointage : un mois (`settings.pointageStart`, facultatif). Il est posé automatiquement au mois du tout premier pointage ou « reçu » jamais fait ; il ne bouge jamais ensuite tout seul (décocher tous les pointages ne l'efface pas). Absent : tous les mois sont en mode réel. Il se modifie explicitement dans l'onglet Comptes (ligne « Pointage depuis : <mois> »). Sa modification est refusée si elle change le mode d'un mois clôturé (mois figé). Un pointage fait dans un mois antérieur au début du pointage est accepté et reste enregistré, sans effet sur le Solde estimé (ce mois reste compté au réel) ; le détail le signale (RG72).

Relevé bancaire et écart
- RG62. Pour un compte bancaire, l'utilisateur saisit le Solde relevé : le solde affiché par sa banque, avec la date de ce relevé (même vocabulaire que Dépenses > Solde épargne : « Solde relevé », « écart »). Bornes de la date : dans le mois affiché, jamais dans le futur (RG32). Un seul relevé par compte et par mois ; le nouveau remplace l'ancien. Le relevé ne modifie jamais le Solde estimé : il sert à comparer.
- RG63. Écart = Solde relevé − Solde estimé à la date du relevé (solde de départ + mouvements et régularisations actives datés au plus tard à cette date, y compris ce jour). Signé. Vert à 0, rouge sinon. Sans relevé : pas d'écart.
- RG64. L'écart n'est jamais corrigé tout seul. S'il est différent de 0, un bouton « Régulariser l'écart » propose de créer une régularisation (RG65).
- RG65. Régularisation : mouvement du compte, daté de la date du relevé, de libellé fixe « écart constaté », de signe + ou −, montant ≠ 0 (proposé = l'écart, modifiable avant validation). Elle compte dans le Solde estimé dès sa date, et dans la chaîne des mois suivants. Elle s'applique dans les deux modes. Elle est visible dans le détail du compte avec la mention « régularisation » et sa date de création.
- RG66. Traçabilité : une régularisation n'est jamais supprimée ni modifiée. On l'annule : elle reste listée dans le détail, barrée, avec « annulée le jj/mm », et ne compte plus. Une régularisation annulée n'est pas réactivable (on en crée une nouvelle).
- RG67. Mois clôturé ou année clôturée, mois non initialisé : relevé, régularisation et annulation en lecture seule ; une régularisation d'un mois clôturé ne peut ni être créée ni annulée.
- RG68. Épargne : les comptes `epa` / `inv` n'ont ni relevé de ce type ni régularisation. Dépenses > Solde épargne (`statements`, `setStatement`, Ledger `acc`) est inchangé.

Relation avec l'écran Comptes
- RG69. Il y a deux chiffres : le Solde estimé (carte « Pointage par compte », qui suit le pointage) et le solde calculé de l'écran Comptes (Ledger, qui suit le réel). Ils ne fusionnent pas. Garantie : pour tout mois en mode réel, le Solde estimé de fin de mois est égal au solde calculé de l'écran Comptes (même solde de départ, mêmes mouvements, mêmes reports de clôture d'année `bank:<id>`, mêmes anciens virements « faits » datés du 1er du mois, mêmes régularisations actives : une régularisation compte dans les deux chiffres, donc un écart constaté ne les fait pas diverger). Dans un mois en mode pointage ils peuvent légitimement différer (montant pointé ≠ réel [abrogée en partie, amendement 5 : il n'y a plus de montant pointé], ligne non encore dépensée, budget `var` viré vers un compte dédié). Le détail du compte affiche, en gris, « Solde de l'écran Comptes : X » quand il diffère.
- RG70. Ce qui ne change pas : `Ledger.bankFlow` et tous les soldes calculés d'avant l'amendement, l'écran Comptes, le « Reste à placer », le « Disponible (réel) », tous les chiffres du budget. « Aucun solde passé ne change » vaut tant qu'aucune régularisation n'existe et qu'aucune ligne `var` n'est pointée vers un compte dédié. Évolutions du Ledger : (a) le pointage d'une ligne `var` vers un compte dédié déplace son budget (RG82) du principal vers le compte dédié (RG9), dans les deux modes ; (b) une régularisation active est un mouvement d'entrée ou de sortie du compte dans son solde calculé (hors chiffres du budget) ; annulée, elle n'a plus d'effet. Une régularisation ne peut être créée que dans un mois non verrouillé (RG67), donc elle ne modifie jamais un mois clôturé.

Historique : règle mois par mois (critère simple : « avant ou après le début du pointage »)
- RG71. Un mois antérieur au début du pointage est compté au réel (Ledger). Un mois à partir du début du pointage est compté au pointage. Cas limites :
  - mois partiellement pointé : seules les lignes pointées comptent, les autres sont dans le Reste à sortir (elles ne sont jamais complétées par leur réel) ;
  - ligne pointée dont le réel existe : le réel est compté, sinon le budget (RG76, RG78) ;
  - ligne non pointée avec un réel, dans un mois en mode pointage : non comptée (visible dans « Reste à sortir ») ; l'oubli se règle en pointant, ou par une régularisation si l'écart apparaît au relevé ;
  - revenus : reçus comptés en mode pointage, au réel en mode réel (RG45 à RG47) ;
  - mois clôturé : son mode est figé (RG61) et son Solde estimé ne change plus ;
  - mois sans aucune donnée entre deux mois : seules les transactions éventuelles comptent (comme le Ledger).
- RG72. Détail d'un compte : pour un mois en mode réel, il indique « Mois compté au réel (avant le pointage) » et liste les mouvements du Ledger ; pour un mois en mode pointage, il liste les pointages et transactions. Un pointage d'un mois en mode réel (antérieur au début du pointage) est affiché avec la mention « pointé, sans effet sur le Solde estimé (mois compté au réel) ». Exception validée : le pointage d'une ligne `var` vers un compte dédié (RG9) garde son effet sur les soldes dans les deux modes, même avant `pointageStart`, le Ledger le lit désormais via `bankMovements` ; c'est ce qui garantit Solde estimé = écran Comptes en mode réel (RG69). La mention « sans effet » ne vaut donc que pour les autres lignes.
- RG73. Migration des données locales (ADR 0003, silencieuse, idempotente, `version` inchangée à 1) : les `accountBalances` déjà écrits sont conservés tels quels (montant et date) et deviennent des relevés (RG62) ; ils n'ont plus d'effet de calcul, seul l'écart s'affiche et il est à examiner par l'utilisateur. Aucune donnée n'est supprimée (décision définitive du développeur). `settings.pointageStart` est posé au plus ancien mois contenant un pointage s'il est absent et s'il existe au moins un pointage ; sinon il reste absent. `adjustments` absent = aucune régularisation.
- RG74. Données : `BudgetData` gagne une liste facultative de régularisations (identifiant, compte, date, montant signé, libellé « écart constaté », date de création, date d'annulation facultative) et `Settings` un début de pointage facultatif. `MonthData.accountBalances` reste, avec le sens « relevé ».
- RG75. Supabase : la migration `20261021000000_line_checks.sql` (additive de cette spec, non appliquée) est adaptée : `account_balances` garde ses colonnes avec le sens de relevé ; ajout d'une table des régularisations (clé utilisateur et identifiant, compte, date, montant, libellé, créée le, annulée le) et d'une colonne `pointage_start` sur `settings`. Pas de rattrapage des autres specs.

### Design (ajout, à valider)

Même carte « Pointage par compte », même emplacement. Dans le compte déplié, le champ « Solde saisi » devient « Solde relevé » (avec date) et un écart apparaît ; le détail commence à « Début de mois » (fin du mois précédent). Composants existants : `cell-input`, `popmenu`, `chip`, `alert-pill`, `gapColor` ; vocabulaire de l'écran Dépenses > Solde épargne.

```
│ v ● Compte principal         Solde estimé 1 488,00 │
│   Reste à sortir     1 842,00 €                    │
│   Marge                -354,00 €           (rouge) │
│   Solde relevé    [ 1 500,00 € ]  au 21/10         │
│   Écart               +12,00 €     [Régulariser]   │
│   ┌ Détail d'octobre ───────────────────────────┐  │
│   │ Début de mois (fin septembre)    2 300,00 € │  │
│   │ 20/10  Loyer (pointé)             -650,00 € │  │
│   │ 21/10  Courses (dépense)           -42,00 € │  │
│   │ 21/10  Écart constaté (régularisation,      │  │
│   │        créée le 21/10)   [Annuler]  +12,00 €│  │
│   │ 05/10  Écart constaté, annulée le 22/10     │  │
│   │        (barré)                      +30,00 €│  │
│   │ = Solde estimé                     1 488,00 │  │
│   │ Solde de l'écran Comptes : 1 460,00 € (gris)│  │
│   │ Reste à sortir ...                          │  │
│   └─────────────────────────────────────────────┘  │
```

« Régulariser l'écart » ouvre un `popmenu` : « Ajouter un mouvement “écart constaté” de +12,00 € au 21/10 », champ montant prérempli, boutons « Valider » et « Fermer ». « Annuler » sur une régularisation demande une confirmation en ligne (« Annuler cette régularisation ? Elle restera visible, barrée »). Onglet Comptes : une ligne « Pointage depuis : <mois> » (champ mois, modifiable, sauf conséquences sur un mois clôturé). Mois en mode réel : étiquette grise « compté au réel » sous le titre du détail. États : sans relevé (champ « Saisir le solde relevé », pas d'écart) ; écart nul (vert) ; écart non nul (rouge + bouton) ; régularisation active ; régularisation annulée ; mois clôturé (lecture seule, pas de bouton) ; avant le mois de départ du compte (« — »).

### Impact technique

- Domaine : suppression de l'ancre (le calcul de solde effectif, la notion `linked` / `carried` / `manual`, la validation de date de MAJ et l'entrée de date par défaut de l'amendement 1 ne servent plus, sauf les bornes de date réutilisées) ; calcul pur du Solde estimé continu par compte et par mois (mode réel / pointage), de l'écart à une date, de la liste des mouvements du détail avec régularisations ; `Settings` gagne `pointageStart` ; `BudgetData` gagne `adjustments?` ; `Ledger` lit les régularisations actives (RG70).
- Application : actions « saisir le relevé » (remplace la saisie de Solde), « créer une régularisation », « annuler une régularisation » (refus mois verrouillé, non initialisé, compte épargne ou inconnu, date invalide, montant nul), « modifier le début du pointage » (refus si un mois clôturé change de mode) ; pose automatique de `pointageStart` au premier pointage ; migration silencieuse (RG73). L'action de modification de la date de MAJ de l'amendement 1 est supprimée.
- Infrastructure : `localRepository` inchangé. SQL adapté (RG75).
- Présentation : `Budget.tsx` (carte : relevé, écart, bouton, régularisations, mention mode réel), onglet Comptes (ligne « Pointage depuis »).
- Seed : aucun relevé, aucune régularisation ; `settings.pointageStart` vaut `2026-12` (décision du développeur) et décembre 2026 garde ses 3 pointages d'exemple ; octobre et novembre restent comptés au réel.
- Tests existants à adapter : tests du Solde saisi, de la reprise, du lien et de la date de MAJ de `checkoff.test.ts` (abrogés) ; garder les tests de pointage, de retard, de revenus et du Ledger.
- ADR : ce changement est structurant (solde estimé continu, deux chiffres, régularisation tracée, bascule réel / pointage). Un ADR 0005 est souhaité ; il est écrit par l'implementer après l'implémentation, avec confirmation de son contenu par le développeur.

### Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application).

- CA48 (T). Given un compte au solde de départ de 1 000 € en septembre, un mois de septembre au réel de −200 € et octobre en mode réel de −100 €, When je lis le Solde estimé, Then fin septembre = 800 €, début octobre = 800 € (calculé), fin octobre = 700 €.
- CA49 (T). Given des données avec transactions, réels, virements anciens « faits », report de clôture d'année et, dans un second cas, une régularisation active et une annulée, sans pointage, When je compare pour chaque mois et chaque compte (principal, Espèces, autre) le Solde estimé de fin de mois et le solde calculé de l'écran Comptes, Then ils sont égaux.
- CA50 (T). Given le début du pointage en octobre, une ligne `fix` pointée à 650 € dont le réel est 640 €, une ligne `fix` non pointée dont le réel est 100 €, Then le Solde estimé d'octobre compte −650 € pour la première, 0 pour la seconde, et la seconde reste dans le Reste à sortir.
- CA51 (T). Given un mois en mode pointage, Then les transactions du compte comptent une fois, le réel de la ligne `var` ne compte pas, et un virement ancien « fait » compte comme dans le Ledger.
- CA52 (T). Given aucun pointage, When je lis `pointageStart`, Then il est absent et tous les mois sont au réel ; When je pointe une première ligne en octobre, Then `pointageStart` vaut octobre ; When je décoche tous les pointages, Then il reste octobre.
- CA53 (T). Given un mois M avant le mois de départ d'un compte, Then son Solde estimé est absent ; Given un pointage fait dans un mois antérieur à `pointageStart`, Then il est enregistré et le Solde estimé de ce mois ne change pas.
- CA54 (T). Given un relevé de 1 500 € au 21/10 et un Solde estimé à cette date de 1 488 €, Then l'écart vaut +12 € ; un mouvement daté du 22/10 ne compte pas dans cet écart, un mouvement daté du 21/10 compte.
- CA55 (T). Given cet écart, When je régularise, Then une régularisation « écart constaté » de +12 € datée du 21/10 existe, l'écart devient 0, le Solde estimé de fin de mois augmente de 12 € et le début du mois suivant aussi.
- CA56 (T). Given une régularisation active, When je l'annule, Then elle reste listée avec sa date d'annulation, ne compte plus, l'écart réapparaît, et aucune suppression ni réactivation n'est possible.
- CA57 (T). Given un mois clôturé ou une année clôturée, When je saisis un relevé, crée ou annule une régularisation, Then c'est refusé et le Solde estimé est figé.
- CA58 (T). Given une date de relevé ou de régularisation hors du mois affiché ou future, Then elle est refusée et rien n'est enregistré ; un montant de régularisation égal à 0 est refusé.
- CA59 (T). Given un compte d'épargne (`epa` / `inv`), When j'essaie de créer une régularisation, Then c'est refusé ; Given Dépenses > Solde épargne, Then son calcul et `setStatement` sont inchangés.
- CA60 (T). Given une régularisation active, Then le solde calculé de l'écran Comptes du compte change du même montant, aucun chiffre du budget (« Reste à placer », « Disponible (réel) », totaux) ne change ; annulée, plus d'effet ; sans régularisation, tous les soldes d'avant sont identiques.
- CA61 (T). Given des données avec des `accountBalances` existants et des pointages, When elles sont chargées, Then les relevés sont conservés tels quels, `pointageStart` vaut le plus ancien mois pointé, `version` vaut 1, rien d'autre n'est modifié ; relancer ne change rien ; sans pointage `pointageStart` reste absent.
- CA62 (T). Given un mois clôturé en mode réel, When je tente de mettre `pointageStart` à un mois qui le passerait en mode pointage, Then c'est refusé.
- CA63 (T). Given un revenu reçu en mode pointage et en mode réel, Then le Solde estimé compte le montant compté (RG76 : réel sinon budget) en mode pointage et le réel en mode réel.
- CA64 (T). Given une ligne `var` d'un compte dédié pointée en mode pointage, Then le principal baisse du budget de la ligne, le compte dédié augmente, et ses dépenses ne sont comptées qu'une fois.
- CA65. Given la carte, When je déplie un compte, Then je vois Solde relevé, Écart, bouton « Régulariser l'écart » si l'écart est non nul, le détail depuis « Début de mois », les régularisations (actives, ou annulées et barrées), la mention « compté au réel » pour un mois antérieur au pointage, et la ligne grise « Solde de l'écran Comptes » quand il diffère.
- CA66. Given l'onglet Comptes, When je regarde un compte, Then je ne peux pas saisir de solde par mois ; le solde de départ y reste modifiable ; la ligne « Pointage depuis » est visible.

### Questions ouvertes de l'amendement 4

Aucune. Décisions du développeur : début du pointage enregistré (`settings.pointageStart`), posé une fois au premier pointage, modifiable à la main, mois clôturé protégé, pointage antérieur accepté sans effet et signalé (RG61, RG72) ; deux chiffres distincts, régularisation comptée dans les deux (RG69, RG70) ; `accountBalances` existants conservés comme relevés, définitivement (RG73) ; écart jusqu'au jour du relevé inclus, un relevé par compte et par mois, régularisation annulable ni supprimable ni réactivable (RG62, RG63, RG66) ; mêmes reports de clôture d'année et mêmes anciens virements « faits » que le Ledger (RG60).

## Amendement du 2026-10-21 (5) — Le réel prend le pas sur le budget ; le montant pointé est supprimé

Décisions du développeur intégrées. Numérotation : RG76 à RG87, CA67 à CA79.

Retour du test manuel du développeur (mot pour mot) : « Le pointage prend en compte le pointage même lorsque le réel est différent (or le réel devrait prendre le pas sur le budget dans ces cas) ». Décision initiale : le réel prend le pas sur le budget (Reste à sortir, Solde estimé, valeur proposée). Décision structurante qui en découle, confirmée par le développeur (« Ce montant pointé n'a donc plus d'utilité », choix « Le supprimer ») : **le montant pointé est supprimé**. Un pointage devient une case et une date (le jour prévu et le mode d'exécution restent portés par la ligne). Le montant compté d'une ligne est toujours calculé : réel s'il existe, sinon budget. Le pointage reste « l'argent a bougé » ; le réel reste la dépense constatée (RG2 inchangée : cocher ne crée ni ne modifie jamais un réel).

Lecture du texte antérieur : partout où la spec parle de « montant pointé », « pointé pour X € » ou d'un montant saisi à la coche, lire « montant compté de la ligne » (RG76) ; le champ montant du menu de pointage et la saisie du montant n'existent plus.

### Ce qui est abrogé ou modifié

- RG1 : la coche n'enregistre plus qu'une date (défaut = aujourd'hui, modifiable) ; le montant pointé disparaît (RG77). RG45 (revenus) : même chose. RG8 (montant pointé ≥ 0, arrondi) : abrogée.
- RG12 (Reste à sortir) : le montant d'une ligne `cre`, `fix`, `epa`, `inv` non pointée devient « réel s'il existe, sinon budget » (RG79) ; la ligne `var` du principal (max(budget − réel, 0)) et la ligne `var` vers compte dédié (budget) sont inchangées. RG11 (Marge = Solde estimé − Reste à sortir) est inchangée dans sa formule, ses deux termes changent.
- RG24 et RG25 : le montant des pointages comptés est le montant compté de la ligne (RG76, RG78), calculé à la lecture ; pour une ligne `var` vers compte dédié c'est son budget (RG9, RG82).
- RG26 : l'exclusion du réel dans le Solde estimé est abrogée pour les lignes pointées (le réel y entre quand il existe) ; elle reste vraie pour les lignes non pointées.
- RG47 : un revenu reçu compte pour son réel s'il existe, sinon pour son budget (plus de montant pointé).
- RG49 : « Revenus attendus » au réel s'il existe, sinon au budget.
- RG50 : abrogée (il n'y a plus de montant pointé ; le montant reçu compté est le réel, sinon le budget). RG51, dernière phrase (« le réel n'est pas une source du Solde estimé ») : abrogée pour les lignes pointées ; le reste de RG51 (aucune coche déduite d'un réel) est conservé.
- RG60, 2e puce (mode pointage) : « au montant pointé » devient « au montant compté de la ligne » (réel sinon budget).
- RG69 : la cause « montant pointé ≠ réel » est retirée des différences légitimes entre le Solde estimé et l'écran Comptes.
- RG71 : le cas limite « ligne pointée avec un montant ≠ réel : le montant pointé prime » est abrogé (RG78) ; « mois partiellement pointé » est précisé : les lignes non pointées ne comptent toujours pas dans le Solde estimé, mais comptent au réel-ou-budget dans le Reste à sortir ; « revenus » : reçus au réel sinon au budget en mode pointage.
- RG9 : « montant pointé » devient « budget de la ligne » (le montant viré est calculé, RG82). RG50 et RG8 : abrogées.
- Données : `LineCheck.amount` (type), la colonne `line_checks.amount` (SQL) et le champ montant du menu de pointage sont supprimés (Impact technique, RG87).
- Critères : CA1, CA2, CA7 à CA7quater, CA39, CA44, CA50, CA63, CA64 sont modifiés ou lus selon la règle de lecture ci-dessus ; voir la liste en fin d'amendement.

Conservé : RG2, RG4, RG10, RG59, RG61, RG62 à RG68, RG70, RG72, RG73 à RG75, le mode réel avant `pointageStart`, `Ledger.bankFlow` (source `actual`) et tous les soldes de l'écran Comptes.

### Règles de gestion

- RG76. Montant compté d'une ligne `rev`, `cre`, `fix`, `epa`, `inv` = son réel (`actual`) s'il existe, sinon son budget. Un réel « existe » quand il n'est pas vide : un réel à 0 saisi explicitement existe et vaut 0. Les lignes `var` suivent RG82.
- RG77. Le pointage ne contient plus de montant : cocher enregistre une date (défaut = aujourd'hui, modifiable) et rien d'autre. Il n'y a ni montant proposé, ni montant modifiable. Décocher efface la date.
- RG78. Solde estimé en mode pointage : une ligne pointée (`rev`, `cre`, `fix`, `epa`, `inv`) compte pour son montant compté (RG76), à sa date de pointage. Ce montant est calculé à chaque lecture, jamais enregistré.
- RG79. Reste à sortir et Revenus attendus : une ligne non pointée compte pour son montant compté (RG76) : réel s'il existe, sinon budget. Le mode « informatif » reste hors Reste à sortir (RG19).
- RG80. Conséquence : il n'y a aucun cas « montant pointé différent du réel ». Un réel saisi, modifié ou vidé après le pointage change immédiatement le montant compté (réel, ou budget si le réel est vidé) ; le pointage n'est jamais modifié par un changement de réel.
- RG81. Le pointage ne crée ni ne modifie jamais un réel, et saisir un réel ne coche rien (RG2).
- RG82. Lignes `var` : le réel de la ligne est la somme de ses dépenses (spec 0008), déjà comptées une fois par leurs transactions. Ligne `var` du principal : sans case, Reste à sortir = max(budget − réel, 0) (RG4), inchangé. Ligne `var` vers compte dédié : exclue de la règle « le réel prime ». Le pointage (case et date) signifie que le budget de la ligne a été viré ; le montant viré est toujours le budget de la ligne, calculé à la lecture (principal moins le budget, compte dédié plus le budget) ; non pointée, elle compte pour son budget au Reste à sortir du principal (RG12). Le réel (les dépenses) ne remplace pas le montant viré : le compte dédié reçoit le budget et en retire les dépenses par leurs transactions.
- RG83. Un réel qui change : le Solde estimé, le Reste à sortir, la Marge, l'écart du relevé et la chaîne des mois suivants se recalculent à l'instant, à chaque lecture (rien n'est enregistré dans le pointage). Un mois ou une année verrouillé : le réel et les pointages ne sont plus modifiables (RG7), donc le Solde estimé du mois reste figé.
- RG84. Une seule source de vérité : le montant compté d'une ligne (RG76) est calculé par une unique fonction du domaine, utilisée par les mouvements de compte en mode pointage (`bankMovements`, source pointage), le Reste à sortir et les Revenus attendus. Le Ledger (source réel) est inchangé.
- RG85. Mode réel (mois avant `pointageStart`) : inchangé, réel de toutes les lignes (RG60 ; un pointage antérieur reste sans effet sauf `var` vers compte dédié, RG72). En mode pointage, les seules différences restantes entre le Solde estimé et l'écran Comptes sont : les lignes non pointées avec un réel (comptées par le Ledger, pas par le Solde estimé), le budget viré vers un compte dédié, et les lignes pointées sans réel (comptées au budget par le Solde estimé, rien pour le Ledger).
- RG86. Affichage (voir Design) : l'utilisateur voit quand le réel a pris le pas sur le budget, sur la ligne, dans le Reste à sortir et dans le détail du compte.
- RG87. Migration (ADR 0003, silencieuse, idempotente, `version` inchangée à 1) : les montants pointés déjà écrits en local (`amount` d'un pointage) sont ignorés dès le chargement puis retirés de la donnée ; la date de pointage est conservée. Conséquence assumée : le Solde estimé des mois en mode pointage se recalcule pour les lignes pointées dont le réel existe et diffère de l'ancien montant pointé ; les régularisations déjà créées ne sont pas touchées. L'ADR 0005 (écrit après implémentation) mentionne cette suppression.

### Design (ajout, à valider)

Composants et tokens existants : texte de ligne, `chip`, infobulle native, `popmenu`, `cell-input`. Libellé court « réel » en gris, comme l'étiquette « compté au réel » déjà présente.

Ligne de bloc (écran Budget), ligne pointée dont le réel existe :

```
[x] Loyer   [prél.] le 5   650,00 €   640,00 €  -10,00 €   pointé 05/10
[x] Assurance [prél.] le 10  42,00 €      —                 pointé 10/10
```
Retour du développeur après test visuel : les lignes étant trop chargées (chevauchement avec la colonne Budget), la ligne de bloc ne porte plus aucun texte de pointage : ni « pointé jj/mm », ni montant, ni « le jj », ni pastille de mode ; il ne reste que la case, la pastille de compte, le nom, le badge « en retard » et une petite icône calendrier qui ouvre la fenêtre de pointage. Toute l'information est dans l'infobulle, posée sur toute la ligne (et sur la case et l'icône), toujours présente quand l'information existe, y compris pour une ligne non pointée (jour prévu et mode seuls) et une ligne hors budget : « Pointé le jj/mm » (« Reçu le jj/mm » pour un revenu), « Prévu le jj du mois », « Mode d'exécution : <libellé complet> » (prélèvement automatique, virement automatique, virement manuel, retrait d'espèces, informatif), « En retard », puis : date de pointage (« reçu » pour un revenu), jour prévu, mode d'exécution, et le montant compté (RG76) avec sa provenance : « Montant compté : 640,00 € (réel). Le réel (640,00 €) prime sur le budget (650,00 €). » ou « Montant compté : 42,00 € (budget). Pas de réel : le budget est compté. », avec le mode d'exécution. Le Reste à sortir et les Revenus attendus de la carte gardent « (réel) » / « (budget) ».

Fenêtre de pointage (`popmenu`) : plus de champ montant. Elle contient la date, le jour prévu, le mode et « Décocher ». Sous la date, une ligne informative en gris : « Montant compté : 640,00 € (réel) » ou « Montant compté : 42,00 € (budget) ».

Carte « Pointage par compte », détail du compte :

```
│   │ 05/10  Loyer (pointé, réel)          -640,00 €   │
│   │ 08/10  Assurance (pointé)             -42,00 €   │
│   │ Reste à sortir                                   │
│   │ Électricité  le 8  [en retard]  57,00 € (réel)   │
│   │ Internet                        29,00 € (budget) │
```
Étiquettes « (réel) » et « (budget) » sur chaque ligne du Reste à sortir et des Revenus attendus ; « (pointé, réel) » ou « (pointé) » sur les mouvements. Infobulle sur une ligne du Reste à sortir au réel : « Réel 57,00 € ; budget 55,00 € ».

États ajoutés : ligne pointée au réel, ligne pointée sans réel, ligne non pointée au réel, ligne non pointée au budget, réel à 0.

### Impact technique

- Domaine : le type `LineCheck` ne garde que la date de pointage (`amount` supprimé) ; une fonction pure « montant compté d'une ligne » (RG76, RG84, avec sa provenance réel ou budget pour l'affichage) remplace la lecture du budget dans le Reste à sortir et les Revenus attendus, et la lecture du montant pointé dans les mouvements en source pointage ; le montant viré d'une ligne `var` vers compte dédié est son budget (RG82). `Ledger.bankFlow` (source réel) et `bankMovements` en source réel inchangés.
- Application : l'action de pointage ne prend plus de montant (date seulement) ; l'action de modification du montant pointé est supprimée ; migration silencieuse qui retire `amount` des pointages locaux (RG87).
- Infrastructure : `localRepository` inchangé (la migration au chargement retire le champ). Supabase : retirer la colonne `amount` de `line_checks` dans `supabase/migrations/20261021000000_line_checks.sql` (migration additive de cette spec, non appliquée), la table ne garde que l'utilisateur, le mois, la ligne et `done_on`.
- Seed de démonstration : aucun pointage n'y est écrit avec un montant ; rien à changer, sauf à retirer le champ si un pointage de démonstration en porte un.
- Présentation : `Budget.tsx` (texte de pointage avec « (réel) » / « (budget) », fenêtre de pointage sans champ montant, détail du compte, Reste à sortir et Revenus attendus).
- ADR : l'ADR 0005 (écrit par l'implementer après implémentation) mentionne la suppression du montant pointé.
- Tests existants à adapter : ceux qui posent un montant pointé (Solde estimé, Reste à sortir, valeur par défaut, revenus reçus, pointage `var` vers compte dédié).

### Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application).

- CA67 (T). Given une ligne `fix` de budget 650 € et de réel 640 €, When je la coche, Then le pointage enregistré ne contient qu'une date (aucun montant) ; Given le montant compté, Then il vaut 640 € ; sans réel 650 € ; pour un revenu de budget 2 400 € et de réel 2 350 €, 2 350 €.
- CA68 (T). Given un mois en mode pointage, une ligne `fix` pointée de budget 650 € dont le réel est 640 €, Then le Solde estimé compte −640 € ; Given le réel vidé, Then −650 € ; Given un réel changé de 640 € à 645 €, Then −645 € à l'instant, sans modifier le pointage enregistré.
- CA69 (T). Given une ligne pointée de budget 650 € avec un réel à 0 saisi explicitement, Then elle compte 0 € ; Given un réel vide, Then 650 €.
- CA70 (T). Given une ligne `fix` non pointée de budget 650 € et de réel 640 €, Then son poids dans le Reste à sortir est 640 € ; sans réel 650 € ; avec un réel à 0, 0 €.
- CA71 (T). Given ces lignes, Then la Marge = Solde estimé − Reste à sortir avec les montants des CA68 et CA70.
- CA72 (T). Given un revenu « reçu » de budget 2 400 € dont le réel est 2 350 €, Then le Solde estimé augmente de 2 350 € ; sans réel, de 2 400 € ; Given un revenu non reçu de budget 2 400 € et de réel 2 350 €, Then « Revenus attendus » compte 2 350 € ; sans réel, 2 400 €.
- CA73 (T). Given une ligne `var` « Cantine » de budget 120 € sur Swile, pointée, et des dépenses de 45 € sur Swile, Then le principal baisse de 120 €, Swile augmente de 120 € puis baisse de 45 €, sans double comptage, et le réel de la ligne (45 €) ne remplace pas le montant viré ; non pointée, la ligne compte 120 € au Reste à sortir du principal.
- CA74 (T). Given une ligne `var` du principal (budget 400 €, réel 450 €), Then son Reste à sortir vaut 0 € (inchangé).
- CA75 (T). Given un mois en mode réel (avant `pointageStart`), Then les montants comptés sont ceux du réel pour toutes les lignes et le Solde estimé reste égal à l'écran Comptes (CA49 inchangé) ; un pointage antérieur reste sans effet sauf `var` vers compte dédié.
- CA76 (T). Given un mois en mode pointage et une ligne pointée dont le réel existe, Then le montant que le Solde estimé retient est égal à celui que lit le Ledger pour cette ligne, seule la date diffère (date de pointage contre 1er du mois).
- CA76bis (T). Given des données locales dont des pointages portent un `amount`, When elles sont chargées, Then `amount` est ignoré dans les calculs et retiré de la donnée, la date de pointage est conservée, `version` vaut 1, relancer ne change rien, et le Solde estimé d'une ligne pointée dont le réel existe vaut ce réel.
- CA77 (T). Given un mois clôturé, Then le réel et le pointage ne sont pas modifiables et le Solde estimé reste identique.
- CA78 (T). Given un pointage, Then `actual` de la ligne n'est pas modifié ; Given un réel saisi sur une ligne non pointée, Then elle n'est pas cochée.
- CA79. Given l'écran Budget, Then une ligne pointée n'affiche aucun texte de pointage (case, nom, badge « en retard » et icône seulement), son infobulle donnant la date, le montant compté, sa provenance (réel ou budget), le jour prévu et le mode ; la fenêtre de pointage n'a plus de champ montant et indique « Montant compté : X (réel|budget) » ; le détail du compte et le Reste à sortir portent « (réel) » ou « (budget) ».

Critères existants modifiés ou abrogés (règle de lecture : « montant pointé » devient « montant compté ») :
- CA1 : la coche n'enregistre qu'une date ; le montant compté est le réel sinon le budget (CA67). CA2 : décocher efface la date ; la ligne revient au Reste à sortir à son réel ou à son budget.
- CA7 à CA7quater, CA39, CA64 : les « montants pointés » de leurs énoncés sont lus comme le montant compté (réel sinon budget ; pour une ligne `var` vers compte dédié, le budget).
- CA44 : abrogé et remplacé par CA72 (reçu au réel, sinon au budget). CA50 : une ligne pointée dont le réel est 640 € compte −640 €, sans réel son budget. CA63 : revenu reçu en mode pointage au réel, sinon au budget.

### Questions ouvertes de l'amendement 5

Aucune. Décisions du développeur : le montant pointé est supprimé, le pointage devient une case et une date (RG77, RG87) ; un réel « existe » quand il n'est pas vide, un réel à 0 explicite compte pour 0 € (RG76) ; les lignes `var` vers compte dédié sont exclues de la règle, le montant viré est leur budget (RG82) ; recalcul à chaque lecture, mois verrouillé figé (RG83) ; Revenus attendus au réel sinon au budget (RG79) ; le Solde estimé des mois en mode pointage se recalcule, régularisations existantes non touchées (RG87).

## Amendement du 2026-10-21 (6) — Les allocations d'enveloppes sont des mouvements de compte ; comptes hors budget isolés

Décisions du développeur intégrées (allocation comptée au pointage, isolation des comptes hors budget, « Reste à placer » inchangé, part `cash` hors périmètre, version légère « compte par défaut des enveloppes »). Numérotation : RG88 à RG99, CA80 à CA95. Cohérence avec les amendements 1 à 5 : l'amendement 6 ne réutilise que `bankMovements` (RG58, RG69), les pointages (RG1, RG77), le mode réel / pointage (RG59, RG61, RG72) et RG9, RG82 ; il ne modifie ni le Solde estimé continu, ni le relevé, ni la régularisation, ni le montant compté (RG76).

Retour du test manuel du développeur sur l'écran Comptes (« Compte principal » : départ 80,04 € au 1er octobre 2026, entrées 5 566,66 €, sorties 5 103,03 €, solde 543,67 €, soit un écart d'environ 543 € avec la banque), mots du développeur : « Une fois le virement (vers un autre compte ou espèce pointé), il devrait compter dans les sorties ici. Car l'argent ne se trouve plus sur le compte principal mais en solde sur l'autre » ; « Pareil pour les allocations des enveloppes. Elles sortent bien du principal donc devraient compter. Contrairement à Swile qui est complètement à part (hors budget) donc ne devrait pas affecter le solde du principal ». Le développeur confirme que les lignes `var` concernées sont pointées et apparaissent comme pointées dans le détail du compte ; hors Swile et « extras » (environ 130 € à deux, non pointés). Le cas des lignes `var` vers un compte dédié est déjà couvert (RG9, RG72, RG82, `bankMovements`).

### Constat dans le code

- C1. `bankMovements` (source unique du Ledger et du Solde estimé) produit : réel ou pointages des lignes hors `var`, pointage d'une ligne `var` vers un compte dédié (principal moins, compte dédié plus), transactions, anciens virements « faits », régularisations. L'allocation d'une enveloppe (`MonthData.alloc`, par enveloppe et par mois) n'y figure pas : seules les dépenses `env` comptent, sur le compte de la transaction.
- C2. Une enveloppe porte `accountId` et `payMode` comme une ligne `var` (spec 0006) ; son compte est `resolveBoxAccountId` (Espèces → compte Espèces ; Virtuel → compte attribué, sinon principal ; archivé → principal). La part `cash` de l'enveloppe est une autre notion (spec 0002, Exclus).
- C3. Les chiffres du budget comptent déjà toutes les allocations (« Reste à placer », « Épargne budgétisée »), quel que soit le compte ; ils ne changent pas (RG93).
- C4. Aujourd'hui `bankMovements` débite le principal pour une ligne `var` pointée vers n'importe quel compte dédié, hors budget compris (RG9) : ce qui contredit la règle du développeur sur Swile.

### Règles de gestion

- RG88. Principe : l'allocation mensuelle d'une enveloppe dont le compte résolu (spec 0006 RG3, RG4) n'est pas le principal est un mouvement de contrepartie : elle sort du compte principal et entre dans le compte résolu. Elle compte dans les Sorties du principal et les Entrées du compte résolu, dans l'écran Comptes (Ledger) ET dans le Solde estimé, par la même fonction `bankMovements`, en mode réel comme en mode pointage.
- RG89. Pas de double comptage : règle exacte par configuration (dépenses `env` inchangées : elles débitent le compte de leur transaction). Le compte d'une enveloppe est celui de RG98.
  - enveloppe dont le compte résolu est le principal (Virtuel sans compte attribué et compte par défaut des enveloppes non réglé ou égal au principal, ou compte attribué au principal) : l'allocation n'est pas un mouvement (l'argent reste sur le principal, simplement réservé) ; ses dépenses débitent le principal une seule fois ;
  - enveloppe sur un autre compte X dans le budget (mode Espèces, ou compte attribué) : l'allocation est un mouvement (principal moins, X plus) ; ses dépenses débitent X (compte de la transaction, spec 0006 RG5) ; aucun doublon ;
  - enveloppe sur un compte hors budget : RG92.
  - une dépense saisie sur un autre compte que celui de l'enveloppe (exception ponctuelle, spec 0006 RG5) débite son propre compte ; l'allocation n'est pas corrigée (le détail de chaque compte la montre).
- RG90. Quand elle compte : l'allocation compte quand elle est pointée. Chaque enveloppe dont l'allocation du mois est > 0 et dont le compte résolu n'est pas le principal reçoit une case de pointage (même principe que RG5 pour une ligne `var`). Cocher enregistre la date de pointage et le compte de destination au moment du pointage ; décocher annule le mouvement. L'effet vaut dans les deux modes (comme RG72 pour la ligne `var`). Une enveloppe sur le principal n'a pas de case (RG89).
- RG91. Montant et date du mouvement : le montant est l'allocation de l'enveloppe pour le mois, lue à chaque lecture (`md.alloc`) ; la date est la date de pointage. Mois ou année verrouillé : case en lecture seule (RG7), valeur affichée.
- RG92. Comptes hors budget isolés : un mouvement de contrepartie (allocation pointée, ligne `var` pointée vers un compte dédié, anciens virements « faits ») dont l'autre côté est un compte hors budget (`inBudget` = non) ne touche jamais le compte principal, ni en sortie ni en entrée ; seul le compte hors budget enregistre son côté (entrée pour une allocation ou un pointage `var` vers ce compte, sortie pour un ancien virement qui en part). Tous les autres mouvements (transactions, lignes, régularisations) restent sur le compte de l'opération.
- RG93. Ce qui ne change pas : « Reste à placer », « Disponible (réel) », « Épargne budgétisée », taux d'épargne, dépensé des enveloppes, et le solde des enveloppes du Ledger ; la règle `inBudget` de la spec 0002 (RG17, RG18) et de la spec 0006 (RG7) vise ces chiffres du budget, pas les soldes de compte, et reste inchangée. Seule la contrepartie sur le principal des soldes de compte est amendée (RG92).
- RG94. La part `cash` des enveloppes (spec 0002, Exclus) reste hors périmètre : elle n'a aucun effet sur les soldes de compte. Seul le mode de paiement de la box (spec 0006) décide du compte.
- RG95. Détail du compte : le mouvement s'intitule « Allocation <enveloppe> → <compte> (pointée) » sur le principal (sortie) et « Allocation <enveloppe> (pointée) » sur le compte destinataire (entrée), à la date de pointage. L'étiquette « compté au réel » d'un mois en mode réel n'est pas modifiée.
- RG96. Non-régression et migration : sans pointage d'allocation, aucun solde ne change (ni écran Comptes, ni Solde estimé, ni années clôturées `bank:<id>`). Aucune donnée n'est écrite à la migration : une enveloppe sur le principal, un seed sans compte attribué, ou un compte par défaut des enveloppes non réglé ne produit aucun mouvement (RG89, RG99). Le réglage RG98 est facultatif : absent, il vaut le principal. `version` reste 1. L'égalité Solde estimé = écran Comptes sur tout mois au réel est conservée (les deux lisent `bankMovements`). Les pointages d'allocation sont stockés avec les pointages du mois, sous une clé propre à l'enveloppe, avec le compte de destination.
- RG97. Effet de RG92 sur l'existant (décision ferme : règle unique, y compris pour les pointages `var` vers un compte hors budget et les anciens virements « faits ») : ces opérations cessent de débiter (ou créditer) le principal. Impact : le solde calculé du principal (écran Comptes) et son Solde estimé changent, dans le sens d'une hausse pour une sortie supprimée et d'une baisse pour une entrée supprimée, pour chaque mois où une telle opération existe, et la chaîne des mois suivants (`bank:<id>` des années clôturées inclus : la base ajustée écrite à la clôture reste celle de l'utilisateur, mais le solde calculé qui précède change). Le compte hors budget garde son côté. Aucune donnée n'est réécrite ; aucun changement de `version`. Le seed n'est pas concerné (ses virements n'ont pas de destination). Les mois clôturés dont le solde du principal change sont signalés dans les notes de version et la régularisation reste l'outil de rattrapage.
- RG98. Compte de réception par défaut des enveloppes : un réglage unique (`settings`, facultatif). Il se règle dans l'onglet Comptes, sur une ligne « Compte des enveloppes » à côté de « Pointage depuis », par une liste des comptes bancaires actifs hors Espèces (le principal en premier). Valeur par défaut = le compte principal ; absent = principal. Résolution du compte d'une enveloppe (amende spec 0006 RG3 pour les enveloppes seulement) : mode Espèces → compte Espèces ; Virtuel avec compte attribué actif → ce compte (le compte propre de l'enveloppe prime sur le défaut) ; sinon le compte par défaut des enveloppes s'il est actif ; sinon le principal. Un compte par défaut archivé retombe sur le principal. Le réglage s'applique à la valeur proposée à « Payé avec » d'une dépense d'enveloppe (spec 0006 RG5) et à RG88, RG89. Il n'est pas rétroactif : les transactions gardent leur compte (spec 0006 RG6) et les pointages d'allocation gardent leur destination (RG90).
- RG99. Tant que le réglage n'est pas modifié, rien ne change pour l'utilisateur : toutes les enveloppes sans compte attribué résolvent au principal (RG89, aucun mouvement, aucune case). Il n'existe pas de proposition automatique de création d'un compte « Enveloppes » : l'utilisateur le crée lui-même dans l'onglet Comptes, puis le choisit. La spec « comptes typés » (suite prévue, hors de cette spec) pourra reprendre ce réglage comme première brique.

### Design (ajout, à valider)

Onglet Comptes : sous la ligne « Pointage depuis », une ligne « Compte des enveloppes » avec une liste déroulante à pastille (composants de liste de comptes existants, comme la colonne « Compte » de l'assistant), valeur par défaut « Compte principal » ; texte d'aide gris : « Les enveloppes sans compte propre utilisent ce compte. Une allocation pointée sort du principal vers lui. » Mois verrouillé : le réglage reste modifiable (il n'est pas rétroactif).

Écran Budget, bloc « Enveloppes » : sur la tuile d'une enveloppe dont l'allocation est > 0 et le compte résolu n'est pas le principal, une case de pointage (composant `check` existant) en haut à droite de la tuile, avec la pastille du compte (billet pour Espèces) ; infobulle « Virement de l'allocation (120,00 €) vers Espèces ». Cochée : la date de pointage et le compte de destination sont dans l'infobulle seulement (retour du développeur après test visuel : tuiles trop chargées). Aucune case sur une enveloppe du principal.

```
Santé      alloué 120,00 €                    [x] ● Boursorama   (case en haut à droite)
Loisirs    alloué  60,00 €                    [ ] [billet]
Courses    (principal : pas de case)
```

Détail du compte (principal, puis destinataire) :

```
│ 05/10  Allocation Loisirs → Espèces (pointée)   -60,00 € │
│ 05/10  Allocation Loisirs (pointée)             +60,00 € │   (compte Espèces)
```
Décision du développeur : la date d'un pointage d'allocation n'est pas modifiable (case + date du jour ; pour la refaire, décocher puis recocher).

États : enveloppe sur le principal (pas de case), enveloppe sur autre compte non pointée, pointée, allocation à 0 (pas de case), compte destinataire hors budget (case, mention « compte hors budget : le principal n'est pas touché »), mois verrouillé (lecture seule).

### Impact technique

- Domaine : `bankMovements` gagne les allocations pointées (RG88 à RG92) et la règle d'isolation des comptes hors budget pour les contreparties ; elle remplace le test actuel qui débite le principal pour toute ligne `var` pointée. Le Ledger et le Solde estimé n'ont rien à changer d'autre (source unique). `Line` / `Envelope` : aucun nouveau champ ; `Settings` gagne un compte de réception par défaut des enveloppes, facultatif (RG98) ; la résolution du compte d'une enveloppe (`resolveBoxAccountId` pour une enveloppe) tient compte de ce réglage ; `MonthData.checks` reçoit des pointages d'enveloppe (date et compte de destination).
- Application : actions pointer / dépointer l'allocation d'une enveloppe (refus mois verrouillé, non initialisé, allocation à 0, enveloppe sur le principal).
- Infrastructure / Supabase : dans `supabase/migrations/20261021000000_line_checks.sql` (additive, non appliquée), `line_checks` gagne une colonne facultative `account_id` (compte de destination d'un pointage d'enveloppe) et `settings` une colonne facultative `envelope_account_id` (compte de réception par défaut). `localRepository` inchangé.
- Seed : aucun réglage de compte par défaut, aucun pointage d'enveloppe ; rien à changer (les enveloppes du seed résolvent au principal).
- Application (suite) : action de réglage du compte des enveloppes (refus d'un compte archivé, inconnu ou Espèces).
- Présentation : `Budget.tsx` (tuile d'enveloppe : case, pastille, état), `Accounts.tsx` (ligne « Compte des enveloppes »), détail du compte (libellés RG95), ligne informative pour le compte hors budget.
- ADR 0005 : à compléter par l'implementer après implémentation, avec confirmation du contenu par le développeur : mouvements de contrepartie, isolation des comptes hors budget, allocation d'enveloppe pointée, compte de réception par défaut des enveloppes, et suite prévue « comptes typés » (non écrite).
- Tests existants à adapter : ceux qui supposent qu'un pointage `var` vers un compte hors budget débite le principal.

### Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application).

- CA80 (T). Given une enveloppe sur le principal, une allocation de 100 € et une dépense `env` de 30 € payée avec le principal, Then le principal compte −30 € une seule fois ; l'allocation n'est pas un mouvement ; aucune case de pointage sur l'enveloppe.
- CA81 (T). Given une enveloppe en mode Espèces avec une allocation de 100 € pointée le 05/10 et une dépense `env` de 30 € payée avec Espèces, Then le principal compte −100 € le 05/10, Espèces +100 € puis −30 €, et le solde calculé de l'écran Comptes est égal au Solde estimé pour un mois au réel.
- CA82 (T). Given la même enveloppe non pointée, Then aucun mouvement d'allocation n'existe ; Given l'allocation décochée, Then les soldes reviennent à ceux d'avant.
- CA83 (T). Given un mois en mode réel (avant `pointageStart`) avec une allocation pointée, Then le Ledger et le Solde estimé comptent le même mouvement ; CA49 reste vrai.
- CA84 (T). Given une enveloppe sur un compte hors budget (Swile) avec une allocation de 100 € pointée, Then le solde du principal ne change pas, Swile augmente de 100 €, le « Reste à placer » et le « Disponible (réel) » ne changent pas.
- CA85 (T). Given une ligne `var` vers Swile (hors budget) pointée, Then le principal ne change pas et Swile augmente de son budget.
- CA86 (T). Given un ancien virement « fait » du principal vers un compte hors budget, Then le principal n'est pas débité (RG92, RG97) ; vers un compte dans le budget, il l'est comme avant.
- CA87 (T). Given une allocation pointée vers Espèces puis un changement du mode de l'enveloppe, Then le mouvement déjà pointé garde son compte de destination d'origine.
- CA88 (T). Given des données sans pointage d'allocation (seed, enveloppes sur le principal), When elles sont chargées, Then tous les soldes de l'écran Comptes et tous les Soldes estimés sont identiques à ceux d'avant, `version` vaut 1, et le report de clôture d'année est inchangé.
- CA89 (T). Given un mois clôturé, Then pointer ou dépointer une allocation est refusé et la valeur reste affichée ; Given une allocation à 0, Then pas de case ni de mouvement.
- CA90. Given l'écran Budget, Then seules les enveloppes dont l'allocation est > 0 et dont le compte résolu n'est pas le principal ont une case, en haut à droite de la tuile (date et destination dans l'infobulle) ; le détail des comptes affiche « Allocation <enveloppe> → <compte> (pointée) » et « Allocation <enveloppe> (pointée) ».
- CA91 (T). Given un changement de montant d'allocation d'une enveloppe pointée, Then le mouvement suit la nouvelle allocation à la lecture ; mois verrouillé : figé.
- CA92 (T). Given un compte par défaut des enveloppes non réglé, Then une enveloppe sans compte attribué résout au principal et n'a ni case ni mouvement d'allocation ; Given ce réglage mis à « Enveloppes » (compte dans le budget), Then une enveloppe sans compte attribué résout à « Enveloppes », son allocation pointée sort du principal vers « Enveloppes », et ses dépenses débitent « Enveloppes » une seule fois.
- CA93 (T). Given une enveloppe avec son propre compte attribué (ou en mode Espèces) et un compte par défaut réglé, Then son propre compte prime sur le défaut.
- CA94 (T). Given un compte par défaut archivé, Then les enveloppes sans compte attribué retombent sur le principal ; Given une tentative de régler Espèces ou un compte archivé comme défaut, Then c'est refusé.
- CA95 (T). Given un changement du compte par défaut après un pointage d'allocation et des dépenses, Then ni la destination du pointage ni le compte des transactions ne changent ; la valeur proposée à « Payé avec » d'une nouvelle dépense d'enveloppe est le nouveau compte résolu.

### Questions ouvertes de l'amendement 6

Décisions fermes du développeur déjà intégrées : l'allocation compte au pointage, avec case sur la tuile, destination enregistrée au pointage, date du pointage, aucun solde passé modifié (RG90, RG91) ; le principal n'est jamais touché par un compte hors budget, qui enregistre son propre côté, pour les allocations, les pointages `var` et les anciens virements (RG92, RG97) ; les allocations d'enveloppes hors budget restent comptées dans le « Reste à placer » (RG93) ; la part `cash` des enveloppes reste hors périmètre (RG94).

Aucune question ouverte. Cadrage tranché par le développeur : ses enveloppes n'ont pas de compte attribué, et « une enveloppe est un compte à part entière au même titre que les épargne et investissement » ; option (iii) retenue : version légère d'abord (réglage « compte de réception par défaut des enveloppes », valeur par défaut = compte principal, RG98, RG89), puis, plus tard, une spec « comptes typés » (courant, épargne, investissement, enveloppe, avec soldes propres et compte par défaut des enveloppes), qui n'est pas écrite ici.

**Suite prévue : « comptes typés » (analyse conservée pour la future spec)**

Aujourd'hui trois modèles distincts :
- les comptes bancaires (`BudgetData.accounts`, spec 0002) : solde de départ, mouvements, Ledger `bank`, écran Comptes, Solde estimé, relevé, régularisation, clôture d'année `bank:<id>` ;
- les comptes d'épargne et de placement (lignes `epa` / `inv`, `statements`, Ledger `acc`) : solde attendu, solde relevé, écart (Dépenses > Solde épargne), clôture `acc:<clé>` ;
- les enveloppes (`envelopes[]`, allocations par mois, dépenses `env`, historique importé) : Ledger `env`, écran Enveloppes, clôture `env:<id>`, « Reste à placer ».

Les rendre des « comptes typés » touche : le type de données, le Ledger (trois calculs à fusionner ou à relier), les écrans Comptes, Dépenses, Enveloppes, Clôture, Prévisionnel, l'assistant (étapes Comptes, Épargnes, Enveloppes, Investissements), les chiffres du budget (« Reste à placer », taux d'épargne, « Épargne budgétisée »), le seed, la migration des données locales et le schéma Supabase (tables `account_statements`, `envelope_*`, `year_closes`), la spec 0002 (RG1 à RG26, notamment RG5 et la liste des exclus), la spec 0005 (clôture) et la spec 0006 (compte de paiement d'une box), plus les ADR 0003 (migration) et 0005 (à écrire). C'est un chantier de plusieurs specs, pas un amendement.

Options examinées (décision : (iii)) :
- **(i) Spec dédiée « comptes typés » (0010, voire 0010 à 0012) avant de finaliser l'amendement 6.** Coût : élevé (plusieurs écrans, Ledger, migration, schéma Supabase, tests, ADR). Risque : élevé (modifie des soldes et des clôtures existants, trois modèles à unifier, refonte de l'assistant). Ce que cela permet pour l'écart de 543 € : tout, avec un modèle propre (enveloppes comme comptes, compte par défaut, soldes propres, allocations comme virements entre comptes). Laisse de côté : rien, mais l'écart de 543 € reste visible tant que la livraison n'a pas lieu ; l'amendement 6 se réécrit sur le nouveau modèle.
- **(ii) Version légère dans l'amendement 6 : un compte de réception par défaut des enveloppes, sans typage global.** Un réglage unique « compte des enveloppes » (par défaut le principal ; proposition d'en créer un, par exemple « Enveloppes », dans l'écran Comptes), utilisé quand une enveloppe n'a pas de compte attribué ; une enveloppe peut toujours avoir son propre compte (spec 0006). Si ce compte est un compte bancaire distinct du principal, ses allocations pointées sortent du principal et entrent sur lui, ses dépenses `env` le débitent : il y a un solde « Enveloppes » à comparer au solde réel d'un sous-compte ou d'une réserve. Coût : faible à moyen (un réglage, une valeur par défaut dans la résolution de compte, la case sur les tuiles, `bankMovements`). Risque : faible (aucune donnée réécrite ; sans ce réglage rien ne change). Ce que cela permet pour l'écart de 543 € : les allocations pointées sortent du principal dès que l'utilisateur choisit un compte autre que le principal par défaut. Laisse de côté : le typage des comptes, les soldes propres des enveloppes dans l'écran Comptes comme comptes à part entière, la fusion avec épargne / investissement.
- **(iii) Autre (étapes).** Faire (ii) d'abord, puis une spec « comptes typés » qui reprend le modèle ensuite, en réutilisant le compte par défaut des enveloppes comme première brique (le champ et la règle de résolution subsistent, seule la présentation évolue). Coût : (ii) puis (i) à plus tard ; risque : un second changement de modèle de données à gérer, mais chaque étape est livrable et réversible séparément.

Décision : (iii). Le compte par défaut des enveloppes est le compte principal : aucun mouvement d'allocation tant que l'utilisateur ne choisit pas un autre compte de réception. Il peut choisir un autre compte (par exemple un compte « Enveloppes » créé lui-même dans l'onglet Comptes) ; l'application ne propose pas de le créer. La spec « comptes typés » est une suite prévue, non écrite ; elle sera mentionnée dans l'ADR 0005.

## Amendement du 2026-10-21 (7) — Mouvements ignorés listés en gris dans le détail du compte principal

Décisions du développeur intégrées. Numérotation : RG100 à RG104, CA96 à CA103. Complète RG92, RG95 et RG97 (amendement 6) ; ne modifie aucun calcul. Cet amendement REMPLACE les versions précédentes de l'amendement 7.

Décision de cadrage : il n'y a qu'un seul réglage « Dans le budget » par compte. Un compte réglé « non » (hors budget) est à la fois exclu des chiffres du budget (spec 0002 RG17, RG18) et isolé du principal (RG92, RG97, amendement 6) : il n'existe pas de notion « isolé » séparée. Mots du développeur : « C'est le “hors budget” flag » ; pour Espèces : « Espèces “oui” (dans le budget) ». Aucune modification des règles RG92 et RG97 n'est nécessaire.

Diagnostic du test manuel : dans le détail du Compte principal, les quatre lignes `var` pointées vers Espèces (230 €) n'apparaissaient pas parce qu'Espèces était réglé « hors budget » chez le développeur, donc isolé du principal par RG92. Espèces vaut « oui » (dans le budget) par défaut (spec 0002 RG16bis) : le développeur remet ce réglage à « oui » dans l'onglet Comptes. Aucun changement de code ni de données. Avec Espèces « oui », ces quatre lignes sont de vrais mouvements comptés : le Solde estimé attendu du principal est 213,67 € (443,67 € − 230 €). Le développeur accepte que les soldes des mois concernés changent, y compris clos, car l'application n'est pas encore utilisée en production. Swile reste « non » : hors budget et isolé du principal. Demande : lister en gris, dans le détail du principal, ce que l'isolation ne compte pas, pour éviter de croire à un défaut (« Oui, l'ajouter »).

### Règles de gestion

- RG100. Dans le détail du Compte principal (carte « Pointage par compte »), les mouvements de contrepartie qui ne touchent pas le principal parce que l'autre compte est hors budget (RG92) sont listés en gris parmi les mouvements du mois, à leur date, avec leur libellé et le montant signé qu'ils auraient eu. Trois cas : (a) ligne `var` pointée vers un compte hors budget (« <ligne> → <compte> (pointé) »), (b) allocation d'enveloppe pointée vers un compte hors budget (« Allocation <enveloppe> → <compte> (pointée) », RG95), (c) ancien virement « fait » entre le principal et un compte hors budget (« <nom du virement> (virement) », daté du 1er du mois).
- RG101. Chaque ligne grise porte la mention « compte hors budget, sans effet sur ce compte ». Elle n'entre dans aucun total : ni le Solde estimé, ni les entrées et sorties, ni la formule de RG28(c), ni l'écart du relevé, ni les régularisations, ni le Reste à sortir, ni la Marge, ni le solde de l'écran Comptes. Affichage seulement.
- RG102. Elle s'affiche dans les deux modes (au réel et au pointage, comme les pointages concernés par RG72) et sur un mois ou une année verrouillé (lecture seule, valeurs affichées).
- RG103. Un mouvement n'est gris que si le compte concerné est réellement hors budget (`inBudget` = non). Vers un compte dans le budget (Espèces « oui »), c'est un vrai mouvement compté (RG9, RG88) et il n'est pas gris. Quand un compte passe de « non » à « oui », ses lignes cessent d'être grises et sont comptées ; à l'inverse, elles deviennent grises et ne sont plus comptées (comportement déjà défini par RG92).
- RG104. Le compte hors budget lui-même affiche son côté comme un mouvement normal, compté (RG92) ; aucune ligne grise n'y est ajoutée. La liste grise est une fonction pure séparée de `bankMovements` : l'égalité Solde estimé = écran Comptes sur tout mois au réel est donc inchangée.

### Design (ajout, à valider)

Même détail du compte principal, même liste triée par date. Les lignes grises réutilisent le style gris déjà présent dans le détail (celui de la ligne « Solde de l'écran Comptes » et de l'étiquette « compté au réel » ; le grisé « déjà compris dans le Solde » de RG30 n'existe plus) :

```
│ 05/10  Loyer (pointé)                          -650,00 € │
│ 08/10  Alimentation → Swile (pointé)    -120,00 € (gris) │
│        compte hors budget, sans effet sur ce compte      │
│ 09/10  Alimentation → Espèces (pointé)         -120,00 € │   (compté, pas gris : Espèces « oui »)
│ 10/10  Courses (dépense)                        -42,00 € │
```
Infobulle sur la ligne grise : « Ce compte est hors budget : le mouvement est enregistré sur lui seul et ne modifie pas le solde du compte principal. » Le montant est affiché en gris, sans signe de couleur et sans rejoindre la formule du détail. L'onglet Comptes ne change pas : un seul réglage « Dans le budget » par compte. États : aucune ligne grise (cas courant), une ou plusieurs lignes grises, mois verrouillé.

### Impact technique

- Domaine : une fonction pure séparée « mouvements ignorés d'un compte pour un mois » renvoie la liste grise avec sa raison ; elle lit les mêmes données que `bankMovements` mais n'est jamais mélangée à sa liste (liste séparée plutôt qu'un champ « ignoré » dans `bankMovements`, pour que `flowOf`, le Ledger, le Solde estimé et l'égalité Solde estimé = écran Comptes n'aient aucune chance de les compter). `bankMovements` et `Ledger.bankFlow` ne changent pas.
- Application, infrastructure, Supabase, données, seed, migration : aucun changement.
- Présentation : le détail du compte de `PointageCard.tsx` fusionne la liste grise avec les mouvements par date, sans l'inclure dans la formule ni les totaux.
- ADR 0005 : une ligne à ajouter (affichage des mouvements ignorés, liste grise séparée de `bankMovements`), à écrire par l'implementer après implémentation.

### Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application).

- CA96 (T). Given Espèces réglé « dans le budget » (« oui ») et quatre lignes `var` pointées vers Espèces pour 230 €, Then ce sont de vrais mouvements comptés : le principal est débité de 230 € (Solde estimé 443,67 € → 213,67 € sur les données du développeur), Espèces est crédité de 230 €, aucune ligne grise n'est listée ; même résultat pour une allocation d'enveloppe pointée et pour un ancien virement « fait » vers Espèces.
- CA97 (T). Given Swile réglé « hors budget » (« non ») et une ligne `var`, une allocation d'enveloppe et un ancien virement « fait » vers Swile, Then le principal n'est pas touché (soldes, Solde estimé, entrées et sorties inchangés) et Swile enregistre son côté ; When je lis les mouvements ignorés du principal, Then ils contiennent « <ligne> → Swile (pointé) », « Allocation <enveloppe> → Swile (pointée) » et l'ancien virement daté du 1er, chacun avec la raison « compte hors budget, sans effet sur ce compte ».
- CA98 (T). Given Espèces « oui » et Swile « non », sur un mois au réel et sur un mois au pointage, When je compare le solde calculé de l'écran Comptes et le Solde estimé du principal, d'Espèces et de Swile, Then ils sont égaux au réel (régularisations actives incluses) ; la liste des mouvements ignorés n'entre dans aucune somme ni dans `bankMovements`, et ajouter ou retirer ces lignes grises ne change ni le Solde estimé, ni les entrées et sorties, ni l'écart du relevé, ni le Reste à sortir, ni la Marge, ni le solde de l'écran Comptes.
- CA99 (T). Given Espèces, When son réglage « Dans le budget » passe de « non » à « oui », Then ses lignes cessent d'être grises et sont comptées (le principal est débité) ; When il repasse à « non », Then elles redeviennent grises et ne sont plus comptées ; les chiffres du budget suivent spec 0002 RG18.
- CA100 (T). Given un mois clôturé ou une année clôturée, un mois en mode réel et un mois en mode pointage, Then les lignes grises sont listées dans tous ces cas (lecture seule) ; Given le compte hors budget lui-même, Then son détail montre son côté comme un mouvement compté et aucune ligne grise.
- CA101 (T). Given des données dont aucun mouvement ne va vers un compte hors budget, When elles sont chargées, Then tous les soldes du Ledger, les Soldes estimés et la base `bank:<id>` sont identiques à ceux d'avant, `version` vaut 1, rien n'est réécrit.
- CA102. Given le détail du Compte principal, Then les lignes grises sont à leur date parmi les mouvements, en gris, avec « compte hors budget, sans effet sur ce compte » et l'infobulle, un mouvement vers Espèces « oui » apparaît comme un mouvement normal, et la formule Début de mois + entrées − sorties = Solde estimé ne les inclut pas.
- CA103 (T). Given une ligne `var` pointée vers Swile, When je comparerais le Solde estimé du principal avec la liste grise ajoutée puis retirée, Then il est identique (preuve que l'affichage ne change aucun solde ni `bankMovements`).

### Questions ouvertes de l'amendement 7

Aucune. Décisions du développeur : un seul réglage hors budget, qui reste à la fois « exclu des chiffres du budget » et « isolé du principal » ; Espèces réglé « oui » par le développeur ; Swile « non » ; soldes des mois concernés acceptés comme changeants, y compris clos ; liste grise dans le détail du principal (« Oui, l'ajouter »).

## Amendement du 2026-10-21 (8) — Les lignes `var` vers un compte hors budget sont informatives et hors budget ; virements à 0 € ignorés

Décisions du développeur intégrées. Numérotation : RG105 à RG119, CA104 à CA118. Amende RG12 (poids des lignes non pointées) et la spec 0008 (RG4, RG12, RG15 pour ces lignes) ; étend la spec 0002 RG17 aux lignes `var`. Ne modifie aucun solde de compte.

Retours du développeur après test :
- « Les 100 € de la Swile sont comptabilisés dans le “reste à sortir” à tort au niveau du compte principal » (réponse : « Oui, exclure »).
- « Cette ligne hors budget ne doit pas compter dans le total des dépenses variables ni dans le reste à placer. Elle est juste informative et “hors budget” » (exemple : Swile, budget 100 €, réel 1,58 €), en conciliation avec : « Je veux compter ces dépenses dans le réel mais étant hors budget, sa somme ne doit pas impacter le compte principal mais seulement son propre compte de manière isolée ».
- « Le réel est lui aussi exclu des totaux » ; « Il voit mais grisé car hors budget ».

Note de rédaction : une version précédente de cet amendement, annoncée comme écrite, n'avait pas été enregistrée dans le fichier (échec d'édition) ; le texte ci-dessous est le seul valable.

### Audit des agrégats des lignes `var` (code et spec)

- `isLineInBudget` (`bank.ts`) n'exclut aujourd'hui que `rev` / `fix` / `cre` (`ACCOUNT_BLOCKS`) d'un compte hors budget. `budgetLines` s'appuie dessus et alimente : les totaux du bloc (Budget, Réel, Restant, pied de bloc et en-tête « Restant ») via `blockTotals`, le « Reste à placer » (`remainingToPlace`), le « Disponible (réel) » (`availableReal`), les « Dépenses » du récapitulatif (`monthSummary`). Étendre la règle aux lignes `var` suffit donc pour ces agrégats.
- Le taux d'épargne et l'épargne réelle ne lisent aucune ligne `var` (enveloppes et sorties d'épargne seulement) : inchangés.
- Hors `budgetLines` : le bloc d'impact du formulaire « Nouvelle dépense » (`Expenses.tsx`, « Restant des variables ») additionne toutes les lignes `var` ; l'historique d'une ligne (cumul, « Solde mois préc. ») est informatif ; l'export CSV liste toutes les lignes du mois ; le récapitulatif de l'assistant (`setup.ts`) agrège les lignes variables du brouillon ; la clôture et le prévisionnel ne lisent aucune ligne `var`.
- Spec 0002 RG17 liste `env`, `epa`, `rev` / `fix` / `cre` ; spec 0008 RG1 (réel d'une ligne = toutes ses dépenses), RG4 (totaux du bloc variable : réel de toutes les lignes, hors budget compris), RG12 (pied de bloc), RG15 (bloc d'impact) : RG4, RG12 et RG15 ne valent plus pour une ligne `var` hors budget ; RG1 reste vraie pour l'affichage de la ligne.

### Règles de gestion

- RG105. Une ligne `var` hors budget (RG110) ne compte ni dans le Reste à sortir ni dans la Marge du compte principal, qu'elle soit pointée ou non. Elle reste pointable (case conservée) : la ligne grise de l'amendement 7 (RG100) continue de s'afficher quand elle est pointée. Une ligne `var` dans le budget (dont Espèces « oui ») compte inchangée : non pointée, son budget est au Reste à sortir du principal (RG12) ; pointée, elle en sort. Une ligne `var` du principal reste inchangée (max(budget − réel, 0), RG4). Amende RG12.
- RG106. Une ligne `var` hors budget est informative : son budget, son réel et son restant sont exclus de TOUS les chiffres du budget, comme les lignes `rev` / `fix` / `cre` d'un compte hors budget (spec 0002 RG17 étendue) : total des dépenses variables (colonnes Budget, Réel, Restant du pied de bloc), en-tête « Restant » du bloc, « Dépenses », « Reste à placer », « Disponible (réel) ». Le taux d'épargne et l'épargne réelle sont inchangés (RG93 : ils ne lisent pas les lignes `var`). Remplace l'ancien principe « le budget reste dans la répartition ».
- RG107. Pour la compréhension (à reprendre dans l'explication de l'écran) : une ligne hors budget n'entre dans aucun total ; ses dépenses comptent dans son propre réel (affiché) et n'affectent que le solde de leur propre compte, jamais celui du principal ; le principal n'est pas débité de son budget (le compte est alimenté ailleurs). Ce n'est pas un défaut.
- RG108. Un ancien virement « fait » de 0 € est ignoré : il n'apparaît ni dans `bankMovements` (donc ni dans le Ledger, le Solde estimé et les totaux) ni dans la liste grise (RG100). Aucun solde ne change.
- RG109. Mois ou année verrouillé, mode réel ou mode pointage : RG105 à RG108 et RG110 à RG115 valent partout (lecture seule, valeurs affichées).
- RG110. Définition : une ligne `var` est hors budget quand son compte résolu (`resolveBoxAccountId`, spec 0006 RG3 et RG4 : mode Espèces → compte Espèces ; Virtuel → compte attribué actif, sinon principal) est un compte bancaire dont `inBudget` est « non ». Une ligne sur Espèces « oui », sur le principal, sur un compte attribué archivé (qui retombe sur le principal) ou sur un compte inconnu est dans le budget, inchangée. Même règle pour les lignes du modèle d'un mois non créé.
- RG111. Affichage (écran Budget) : une ligne `var` hors budget reste visible, grisée, regroupée sous un sous-titre « Hors budget » (même style que les titres de section « Épargne long terme » / « Épargne moyen terme » du bloc Épargnes), placé après les autres lignes du bloc et affiché seulement s'il existe au moins une telle ligne ; le regroupement est calculé à l'affichage (aucune donnée écrite, l'ordre des lignes dans les données est inchangé) ; la ligne porte l'infobulle « Ligne hors budget : elle ne compte dans aucun total ni dans le reste à placer. » Son budget, son réel et son restant restent affichés (en gris) ; la case de pointage et la pastille de compte restent actives ; la barre de remplissage reste affichée (grise). Les totaux du bloc, l'en-tête « Restant » et le pied de bloc ne la comptent pas.
- RG112. Dépenses : les transactions de la ligne restent saisies et portées par leur compte (Swile…), comptent dans le réel de la ligne affiché (spec 0008 RG1, inchangé) et dans le solde de leur compte, sans effet sur les totaux du budget. Formulaire « Nouvelle dépense » : pour une ligne hors budget, le bloc d'impact annonce le réel de la ligne (X → X + montant) mais « Restant des variables » ne change pas ; pour les autres lignes, inchangé (spec 0008 RG15 amendée). Une dépense saisie sur la ligne avec un autre compte (« Payé avec ») suit le compte de la transaction pour les soldes ; la classification de la ligne ne dépend que de son compte résolu.
- RG113. Bascule : la classification est calculée à partir du réglage « Dans le budget » du compte (aucune donnée écrite). Passer un compte de « non » à « oui » remet ses lignes `var` dans tous les totaux et dans le Reste à sortir ; l'inverse les en sort. Comme pour les lignes `rev` / `fix` / `cre` (spec 0002 RG18), le recalcul porte sur tous les mois existants, y compris les mois clos (décision : rétroactif partout, y compris le « Disponible (réel) » de clôture ; aucune donnée écrite).
- RG114. Mois existants, mois clos, seed, assistant : aucune donnée, migration ni SQL. Le seed n'a pas de compte hors budget : inchangé. Le récapitulatif de l'assistant applique la même règle aux lignes variables dont le compte du brouillon est hors budget. L'export CSV garde toutes les lignes et gagne une colonne « Hors budget » (RG119). Les allocations d'enveloppes dont le compte est hors budget restent comptées dans le « Reste à placer » (décision : on garde RG93 de l'amendement 6 ; l'écart avec les lignes `var` hors budget sera traité à part si besoin).
- RG115. Cohérence : l'isolation des soldes (RG92, RG97) et la ligne grise (amendement 7) ne changent pas ; l'égalité Solde estimé = écran Comptes est inchangée (le budget n'a jamais touché ces soldes, et `bankMovements` ne lit une ligne `var` que par ses pointages et ses transactions) ; RG105 et RG106 utilisent le même prédicat (RG110) que l'isolation, pour qu'une ligne soit hors budget et isolée en même temps.
- RG116. Finalité du hors budget (contexte du développeur : « Le hors budget me permet de tracer mes dépenses sur ces comptes qui ne sont pas alimentés par moi mais qui restent intéressants pour une analyse annuelle »). L'exclusion des totaux du budget (RG106) ne supprime rien : les transactions restent saisies et portées par leur compte (Swile), listées dans l'écran Dépenses, les lignes restent visibles (grisées, « hors budget », RG111), leur réel et leur historique (cumul de l'année) restent calculés et affichés, le solde du compte et son détail restent calculés (soldes, Solde estimé, relevé, régularisation). Seuls les totaux et indicateurs du budget les ignorent.
- RG117. Audit des vues qui montrent ces dépenses, vérifié sur le code : (a) écran Dépenses : liste toutes les transactions du mois, hors budget comprises ; inchangé ; (b) info-bulle d'une ligne (« Cumul <année> », « Solde mois préc. ») : lit directement les lignes, le cumul annuel de la ligne hors budget reste affiché ; inchangé ; (c) écran Comptes et carte « Pointage par compte » : soldes et détails du compte hors budget ; inchangé ; (d) export CSV : liste toutes les lignes du mois, hors budget comprises ; il gagne une colonne « Hors budget » (RG119) ; (e) Clôture, Prévisionnel, Objectifs, Enveloppes : ne lisent aucune ligne `var` ; inchangés ; (f) il n'existe pas aujourd'hui de vue annuelle qui additionne les lignes `var` : aucune dépense hors budget ne disparaît d'une vue. Le seul point où la distinction « dans le budget » / « hors budget » manquait était l'export CSV : colonne ajoutée (RG119) ; pas de marque dans l'écran Dépenses (décision).
- RG119. Export CSV (dialecte français : séparateur point-virgule, virgule décimale, BOM, retours à la ligne `\r\n`) : une colonne « Hors budget » est ajoutée en dernière position, soit l'en-tête `Bloc;Section;Nom;Budget;Réel;Hors budget`. Sa valeur est « oui » pour une ligne hors budget et « non » sinon, sur chaque ligne du mois. « oui » : une ligne `var` dont le compte résolu est hors budget (RG110) et une ligne `rev` / `fix` / `cre` rattachée à un compte hors budget (spec 0002 RG17) ; « non » : toutes les autres lignes (lignes `var` dans le budget dont Espèces « oui », lignes du principal, `epa`, `inv`). Même prédicat que l'exclusion des totaux (RG106 : une ligne est « oui » si et seulement si elle est exclue des totaux du budget). Les autres colonnes et le contenu des lignes ne changent pas ; aucune ligne n'est supprimée de l'export. Aucune autre vue ne distingue « dans le budget » / « hors budget » (écran Dépenses sans marque, décision).
- RG118. Aucune nouvelle vue d'analyse n'est créée par cet amendement. Une vue d'analyse annuelle des dépenses des comptes hors budget (par compte, par mois, par ligne) est une suite possible, à spécifier séparément.

### Impact technique

- Domaine : `isLineInBudget` étendu aux lignes `var` par le compte résolu (RG110) ; `pendingLines` (Reste à sortir) écarte ces lignes ; `bankMovements` et la fonction des mouvements ignorés écartent les virements de 0 € ; le bloc d'impact de `Expenses.tsx` (« Restant des variables ») utilise les lignes dans le budget. Aucune donnée, migration, SQL ni seed.
- Export CSV : `monthCsv` (`src/application/actions.ts`) gagne la colonne « Hors budget » ; il reçoit en plus un prédicat « ligne hors budget » (le même que `isLineInBudget` négé) fourni par l'appelant (`Budget.tsx`, qui appelle `monthCsv` avec les lignes du mois), l'en-tête devient `Bloc;Section;Nom;Budget;Réel;Hors budget`, le dialecte français (point-virgule, virgule décimale, BOM) est conservé.
- Présentation : `Budget.tsx` (ligne grisée, étiquette, infobulle ; appel de `monthCsv`), `Expenses.tsx` (bloc d'impact), récapitulatif de l'assistant si besoin.
- Specs : avenants à reporter : spec 0002 RG17 (ajouter les lignes `var` à la liste des opérations exclues des chiffres du budget d'un compte hors budget) ; spec 0008 RG4 (totaux du bloc variable : plus le réel des lignes hors budget), RG12 (pied de bloc) et RG15 (bloc d'impact du formulaire : « Restant des variables » inchangé pour une ligne hors budget) ; RG1 de 0008 reste vraie pour l'affichage de la ligne.
- Tests existants à adapter : ceux de la spec 0008 qui supposent que le réel d'une ligne hors budget entre dans le total du bloc. Pas d'ADR.

### Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application).

- CA104 (T). Given une ligne `var` de budget 100 € et de réel 1,58 € vers Swile (« non »), non cochée, Then son poids au Reste à sortir et à la Marge du principal est 0 € ; cochée, identique.
- CA105 (T). Given la même ligne, Then le total Budget, le total Réel, le Restant du pied de bloc, l'en-tête « Restant », les « Dépenses », le « Reste à placer » et le « Disponible (réel) » sont identiques à ceux d'un mois où la ligne n'existerait pas ; le taux d'épargne est inchangé.
- CA106 (T). Given une ligne `var` vers Espèces « oui », non cochée, Then 100 € au Reste à sortir du principal et la ligne compte dans tous les totaux ; cochée, elle sort du Reste à sortir mais reste dans les totaux ; Given Espèces repassé à « non », Then elle sort des totaux et du Reste à sortir (bascule, RG113).
- CA107 (T). Given une ligne `var` du principal (budget 400 €, réel 450 €), Then son Reste à sortir vaut 0 € et elle compte dans les totaux (inchangé).
- CA108 (T). Given une ligne vers Swile cochée, Then la case reste active, le détail du principal affiche la ligne grise de l'amendement 7 et le Solde estimé du principal n'est pas modifié.
- CA109 (T). Given un ancien virement « fait » de 0 €, Then il n'apparaît ni dans `bankMovements` ni dans les mouvements ignorés, aucun solde ni total ne change ; non nul, il suit RG92 et l'amendement 7.
- CA110 (T). Given une dépense de 1,58 € payée avec Swile sur la ligne, Then le réel de la ligne vaut 1,58 € (affiché), le solde de Swile baisse de 1,58 €, le solde du principal et tous les totaux du budget sont inchangés ; Given une dépense de 5 € sur cette ligne payée avec le principal (exception), Then le solde du principal baisse de 5 € et les totaux du budget restent inchangés.
- CA111 (T). Given le formulaire « Nouvelle dépense » sur la ligne vers Swile, Then le bloc d'impact annonce le réel de la ligne et laisse « Restant des variables » inchangé ; Given une ligne dans le budget, Then inchangé (spec 0008 RG15).
- CA112 (T). Given un mois clôturé ou non initialisé, un mois en mode réel et un mois en mode pointage, Then RG105 à RG108 donnent les mêmes résultats.
- CA113 (T). Given Espèces « oui », Swile « non », des lignes `var` vers chacun et des virements à 0 €, When je compare le solde calculé de l'écran Comptes et le Solde estimé de chaque compte sur un mois au réel, Then ils sont égaux ; l'isolation et la ligne grise sont inchangées.
- CA114 (T). Given des données sans compte hors budget, When elles sont chargées, Then tous les totaux, tous les soldes et la base `bank:<id>` sont identiques à ceux d'avant, `version` vaut 1, rien n'est écrit.
- CA115. Given l'écran Budget, Then la ligne vers Swile est grisée, rangée sous le sous-titre « Hors budget » en fin de bloc (absent s'il n'y a aucune telle ligne), avec l'infobulle, ses montants sont affichés, la case reste active, et les totaux et l'en-tête « Restant » ne la comptent pas.
- CA116 (T). Given une ligne `var` hors budget (Swile) avec une dépense saisie, Then la transaction reste dans la liste de l'écran Dépenses, le réel et le cumul de l'année de la ligne restent calculés, le solde de Swile, son Solde estimé et son détail comptent la dépense, et seuls les totaux et indicateurs du budget l'ignorent.
- CA117 (T). Given l'export CSV d'un mois contenant une ligne `var` vers Swile (« non »), une ligne `var` vers Espèces « oui », une ligne `fix` rattachée à un compte hors budget, une ligne `fix` du principal, une ligne `epa` et une ligne `inv`, Then la première ligne du fichier est `Bloc;Section;Nom;Budget;Réel;Hors budget` (après le BOM) ; la ligne vers Swile et la ligne `fix` du compte hors budget ont « oui » ; les quatre autres ont « non » ; toutes les lignes figurent avec leurs montants (virgule décimale, séparateur point-virgule).
- CA118 (T). Given un compte hors budget repassé à « oui » puis à « non », Then la colonne « Hors budget » des lignes concernées passe à « non » puis à « oui » ; Given un mois clos, Then l'export suit la même règle (rétroactive) ; Given une ligne en « oui », Then elle est aussi exclue des totaux du budget (même prédicat, RG106).

### Questions ouvertes de l'amendement 8

Aucune. Décisions du développeur : classement « hors budget » calculé et rétroactif sur tous les mois, clos compris, sans donnée écrite (RG113) ; allocations d'enveloppes hors budget conservées dans le « Reste à placer » (RG93 de l'amendement 6, RG114) ; colonne « Hors budget » (oui / non) ajoutée à l'export CSV, sans marque dans l'écran Dépenses (RG119).

## Amendement du 2026-10-21 (9) — Réconciliation avec la spec 0007 (ligne épargne vers compte dédié)

Numérotation : RG120 à RG125, CA119 à CA125. La spec 0007 (compte dédié d'une ligne `epa` / `inv`, champ `linkedAccountId`) a été livrée dans `develop` pendant le développement de cette spec ; cet amendement fixe comment les deux se combinent. Aucun changement de données, de migration ni de SQL.

### Règles de gestion

- RG120. Source unique : les mouvements d'un compte dédié d'une ligne `epa` / `inv` liée (spec 0007 RG6) sont produits par `bankMovements` (`domain/bankMovements.ts`), lu par le `Ledger` et par le Solde estimé. `Ledger.bankFlow` ne les calcule plus à part.
- RG121. Mode réel : le compte dédié est crédité du réel de la ligne au 1er du mois et débité des sorties d'épargne (transactions `epa` sur la ligne) à leur jour ; le compte source est débité du réel (RG60). Inchangé par rapport à la spec 0007.
- RG122. Mode pointage : une ligne liée pointée crédite le compte dédié du montant compté (RG76 : réel sinon budget) à la date du pointage, et débite le compte source du même montant ; une ligne liée non pointée ne bouge rien. Les sorties d'épargne débitent le dédié à leur jour comme au réel. Un compte dédié hors budget est crédité de la même façon ; le principal n'est débité que par la ligne elle-même (RG92 ne concerne pas ce cas : ce n'est pas une contrepartie hors budget).
- RG123. Divergences voulues : le solde d'un compte dédié au pointage peut différer du solde de la ligne `Ledger.acc`, qui reste au réel ; le « solde estimé » des blocs Épargnes et Investissements (spec 0007 RG19 à RG24, `estimatedBalance`) lit le `Ledger` au réel et n'est pas modifié ; un compte dédié sans ligne liée pointée n'apparaît pas dans la carte « Pointage par compte » en mois au pointage (la carte n'affiche que les comptes ayant une ligne, un relevé ou un mouvement).
- RG124. Ventilation par signe : `flowOf` répartit les mouvements en entrées (montants positifs) et sorties (montants négatifs). Un réel négatif apparaît donc dans l'autre colonne que sa nature ne le suggère ; le solde net (entrées − sorties) est identique.
- RG125. Pas de double comptage : une ligne liée à la fois avec un réel et pointée compte une seule fois en mode pointage (le montant compté, pas le réel en plus).

### Critères d'acceptation

(T) = test automatisé (Vitest).

- CA119 (T). Ligne liée pointée avec réel : le dédié reçoit le réel à la date de pointage, le principal est débité du même montant.
- CA120 (T). Ligne liée pointée sans réel : le budget est crédité sur le dédié et débité sur le principal.
- CA121 (T). Ligne liée non pointée en mode pointage : rien ne bouge.
- CA122 (T). Dédié hors budget : crédité, le principal n'est débité que par la ligne, aucune ligne grise.
- CA123 (T). Transaction `epa` sur une ligne liée en mode pointage : sort du dédié à son jour.
- CA124 (T). Mois au réel avec un compte dédié : crédit au 1er du mois, retraits à leur jour, Solde estimé = écran Comptes.
- CA125 (T). Non-double-comptage (RG125) et ventilation de `flowOf` par signe (RG124).

## Amendement du 2026-10-23 (10) — spec 0019 (pointage fictif et soldes réels, implémentée)

- Le pointage (« reçu », « fait », versement, allocation, ligne `var` vers un compte dédié) est un débit ou crédit **fictif** : il alimente le solde estimé et les indicateurs budgétaires, jamais un solde réel.
- `pointageStart`, les modes « au réel » / « au pointage » (RG59 à RG61, RG72, RG73) et leur réglage sont supprimés : le solde estimé est toujours calculé au pointage. L'égalité « écran Comptes = solde estimé » (CA49 et suivants) est remplacée par les propriétés de la 0019.
- L'écart du relevé se calcule contre le **solde réel** ; la régularisation ne corrige que le solde réel.
- RG92 (isolation des comptes hors budget) est limité aux contreparties fictives et à la liste grise ; un transfert compte toujours ses deux faces. Les anciens virements « faits » sont ignorés.
- « Reste à sortir » et « Revenus attendus » pèsent le budget des lignes.
