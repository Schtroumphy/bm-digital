# 0010 — Type de compte (courant, épargne, invest) et clôture sans double compte (étape A)

- Statut : validée
- Date : 2026-10-21
- Branche prévue : feat/account_kind

Étape A de deux. L'étape B (spec 0011, « une enveloppe = un compte ») dépend de celle-ci. Complète les specs 0002 (comptes bancaires), 0006 (compte attribué d'une box), 0007 (compte dédié d'une ligne épargne / invest) et 0009 (pointage, onglet Comptes). Mécanisme de migration : ADR 0003. PR vers `develop`.

## Contexte et objectif

Dans l'onglet Clôture, l'épargne et l'investissement sont comptés deux fois. Des comptes bancaires (Livret A, LDD, Vacances Mada, PEA, Amundi, Trade Republik…) coexistent avec des lignes de budget `epa` / `inv` du même nom. La clôture additionne :
- tous les comptes bancaires (`ledger.bankMonth`, groupe « Comptes bancaires ») ;
- les lignes `epa` / `inv` (`accounts(d)` puis `ledger.accMonth`, groupes « Comptes et épargnes » et « Investissements »).

Le même argent apparaît donc dans deux groupes. Le total de la clôture est surévalué et les bases du 1er janvier sont fausses.

Les comptes dédiés d'une ligne (spec 0006, 0007) ne se suppriment pas : ils portent les versements et les sorties de la ligne et ont leur place dans l'onglet Comptes.

Objectif : donner un type (`kind`) à chaque compte bancaire, classer chaque compte dans un seul groupe de la clôture selon ce type, et lier explicitement une ligne `epa` / `inv` à son compte pour que l'un des deux seulement soit compté.

## Constats dans le code

- C1. `Closing.tsx` construit quatre groupes : « Comptes bancaires » (tous les `data.accounts` ayant un solde ce mois-là, y compris archivés non soldés à zéro), « Comptes et épargnes » (lignes `epa`), « Enveloppes », « Investissements » (lignes `inv`). Aucun filtre ne retire une ligne qui a un compte dédié.
- C2. Le lien explicite ligne ↔ compte existe déjà : `Line.linkedAccountId` (spec 0007, RG1 à RG5), choisi par pastille dans l'écran Budget et dans l'assistant, repris par le modèle. Il n'est pourtant ni exigé ni utilisé par la clôture. Il est facultatif et beaucoup de données existantes ne l'ont pas.
- C3. Le solde de la ligne (`accMonth`, avec relevé) et celui du compte dédié (`bankMonth`) sont deux calculs distincts, volontairement (spec 0007, RG8). Ils peuvent différer.
- C4. Hors clôture, ce double compte existe aussi dans les autres vues qui additionnent comptes bancaires et lignes (ex. `budget.ts`, indicateurs de patrimoine, ligne 197 `accMonth`). Le périmètre de cette spec est la clôture ; les autres vues sont à confirmer (question Q4).
- C5. Le compte propre d'une enveloppe sur un autre compte (spec 0009, RG88 à RG99) est déjà un mouvement de contrepartie. Le double compte des enveloppes a une autre cause : voir spec 0011.
- C6. `BankAccount` n'a aucun type. Le seul qualificatif est `isDefault` (principal) et le compte `Espèces` (identifiant fixe).

## Périmètre

Inclus :
- Champ `kind` sur `BankAccount` : `'courant' | 'epargne' | 'invest' | 'enveloppe'`, absent = `'courant'`.
- Choix du type à la création et à l'édition d'un compte (onglet Comptes), et dans l'assistant lorsqu'il crée des comptes.
- Clôture : un compte est classé dans un seul groupe selon son type ; une ligne `epa` / `inv` liée à un compte n'a pas de ligne propre.
- Règle de correspondance ligne ↔ compte par `linkedAccountId` (lien explicite), jamais par le nom.
- Migration silencieuse idempotente, et proposition de déduction du type à confirmer par l'utilisateur.
- Avertissement quand le nom d'un compte est le même que celui d'une ligne `epa` / `inv`.

Exclus :
- Le groupe « Enveloppes » et le calcul des soldes d'enveloppe : inchangés (spec 0011).
- Suppression ou fusion de comptes bancaires ou de lignes.
- Changement des calculs de solde (`bankFlow`, `accMonth`), du pointage, du réel.
- Correction du double compte dans les vues autres que la clôture (Q4).
- Schéma Supabase (voir Impact technique : à ajouter dans la migration additive de cette spec seulement).

## Règles de gestion

Type de compte
- RG1. Chaque compte bancaire a un type parmi `courant`, `epargne`, `invest`, `enveloppe`. Type absent = `courant`.
- RG2. Le compte principal et le compte Espèces sont toujours `courant` et leur type n'est pas modifiable.
- RG3. Le type se choisit à la création d'un compte et se modifie ensuite. Le type `enveloppe` n'est pas proposé dans cette spec (réservé à la spec 0011, voir Q1) ; la valeur existe dans le modèle pour que la 0011 n'ait pas à le migrer.
- RG4. Un changement de type ne modifie aucun solde, aucune transaction, aucune ligne ni aucun lien. Il ne change que le groupe d'affichage dans la clôture.
- RG5. Un compte archivé garde son type.

Lien ligne ↔ compte
- RG6. Une ligne `epa` / `inv` est « liée » quand son `linkedAccountId` (spec 0007) désigne un compte bancaire existant, actif ou archivé. Le lien se fait uniquement par identifiant, jamais par comparaison de noms.
- RG7. Un compte lié à une ligne `epa` doit être de type `epargne` et un compte lié à une ligne `inv` de type `invest`. Le choix du compte dédié (pastille, spec 0007) ne propose que les comptes du bon type. Un lien déjà existant vers un autre type n'est pas supprimé : il est signalé (état « type à revoir ») dans l'onglet Comptes et la clôture se fie au type du compte (RG9).
- RG8. Plusieurs lignes peuvent être liées au même compte (spec 0007, RG3) ; une ligne n'a qu'un compte.

Clôture
- RG9. Chaque compte bancaire est classé dans un seul groupe, selon son type : `courant` dans « Comptes bancaires », `epargne` dans « Épargnes », `invest` dans « Investissements », `enveloppe` dans « Enveloppes » (inchangé en pratique tant que la spec 0011 n'est pas livrée, Q1). Les groupes ne se chevauchent jamais.
- RG10. Une ligne `epa` ou `inv` liée (RG6) n'a pas de ligne propre dans la clôture : son compte la représente, avec le solde du compte (`bankMonth`). Le total de la clôture compte donc cet argent une seule fois.
- RG11. Une ligne `epa` ou `inv` non liée reste présentée par sa ligne propre (`accMonth`) dans « Épargnes » ou « Investissements », comme aujourd'hui. Les comptes d'épargne et les lignes non liées cohabitent dans le même groupe, chacun une fois.
- RG12. Un compte archivé n'apparaît que s'il a un solde non nul au 31 décembre (comportement actuel conservé). Les comptes dont le mois de départ est postérieur à décembre n'apparaissent pas.
- RG13. Ajustements et bases du 1er janvier : l'ajustement d'une ligne de compte reste enregistré sous la clé `bank:<id>` (inchangée) ; celui d'une ligne `epa` / `inv` non liée sous `acc:<clé>` (inchangée). Aucune clé de clôture n'est renommée, donc les clôtures existantes ne changent pas (RG14).
- RG14. Une année déjà clôturée n'est pas modifiée par cette spec : ses bases ajustées restent celles enregistrées. Seul l'affichage d'une année non clôturée change (le total baisse du montant jusque-là compté deux fois).
- RG15. Texte d'aide de l'onglet : aucune autre modification ; l'en-tête « Solde au 31 déc. », « Base au 1er janv. », « Ajustement » est inchangé.

Migration et déduction du type
- RG16. Migration silencieuse, idempotente, `version` inchangée à 1 (ADR 0003) : au chargement, aucun compte n'est modifié. Un type absent vaut `courant` et rien n'est écrit. Charger deux fois donne le même résultat.
- RG17. Candidat à la déduction : un compte dont le type est absent (jamais décidé), qui n'est ni principal ni Espèces, et dont le nom correspond à une ligne `epa` ou `inv` (modèle ou mois). La correspondance du nom sert uniquement à proposer, jamais à décider : comparaison sans différence de casse, d'accents ni d'espaces en trop. Aucune autre correspondance (nom contenu dans un autre, mots proches) n'est cherchée.
- RG18. Les candidats sont présentés à l'utilisateur (Design) : « Livret A semble être une épargne liée à la ligne Livret A ». Pour chaque candidat, l'utilisateur choisit : confirmer (le type devient `epargne` ou `invest` selon le bloc de la ligne et la ligne reçoit `linkedAccountId` dans le modèle et dans tous les mois non clôturés, RG21), choisir un autre type sans lien, ou « Garder comme compte courant » (le type devient `courant`, écrit explicitement, la proposition ne revient plus).
- RG19. Tant que l'utilisateur n'a pas décidé, rien n'est écrit : le compte reste `courant` et la clôture compte encore à la fois le compte et la ligne. Un bandeau prévient que « n comptes semblent comptés deux fois ». Ce bandeau disparaît quand tous les candidats sont décidés.
- RG20. Deux comptes qui correspondent à la même ligne : seul le premier est proposé comme lié ; l'autre peut être typé sans lien (Q3).
- RG21. Confirmer un lien écrit `linkedAccountId` sur la ligne du modèle et sur les lignes de tous les mois non clôturés et non verrouillés, pour que les mois suivants (« Appliquer le modèle », « Dupliquer ») le reprennent (spec 0007, RG4). Les mois clôturés ou verrouillés ne sont pas touchés (le lien n'y est pas nécessaire : voir Q2 pour la clôture d'une année déjà verrouillée).
- RG22. Un compte dont le type est connu (décidé ou choisi à la création) n'est plus candidat. Un compte créé avec un type explicite n'a pas de proposition.

Création, édition, avertissement de collision
- RG23. À la création d'un compte (onglet Comptes et assistant), le type est un choix obligatoire dont la valeur par défaut est `courant`. À l'édition, le type est modifiable (RG2, RG3).
- RG24. Avertissement de collision : quand le nom saisi (création ou renommage) correspond, selon RG17, à une ligne `epa` / `inv` non liée, un message court non bloquant s'affiche : « Une ligne d’épargne porte déjà ce nom. Liez-la à ce compte pour éviter de la compter deux fois. » avec le bouton « Lier à la ligne » (qui fixe le type selon le bloc et écrit le lien, RG21). Enregistrer sans lier reste possible.
- RG25. Lier (RG24, RG18) est refusé si le compte est déjà le compte source de la ligne (spec 0007, RG2).
- RG26. Mois clôturé ou année clôturée : le type d'un compte reste modifiable (RG4 : pas d'effet sur les soldes) mais le lien d'une ligne d'un mois verrouillé n'est pas écrit (RG21).

## Parcours utilisateur

Nominal (migration). J'ouvre l'application. Un bandeau dit que 6 comptes semblent comptés deux fois dans la clôture. Je clique, je vois « Livret A » ↔ ligne « Livret A (épargne) », je confirme. Le compte devient `epargne`, la ligne Livret A est liée. Dans Clôture, « Livret A » n'apparaît plus qu'une fois, dans « Épargnes », et le total baisse du montant de la ligne.

Nominal (création). Je crée « Vacances Mada » dans Comptes, type « Épargne ». Une ligne « Vacances Mada » existe : l'application me propose de la lier. J'accepte.

Cas limites :
- Compte « PEA » dont la ligne est `inv` : type `invest`, lien écrit.
- Compte sans ligne du même nom : jamais candidat ; reste `courant` sauf choix manuel.
- Ligne `epa` du même nom que le principal : jamais candidat (RG17).
- Compte typé `epargne` sans ligne : apparaît seul dans « Épargnes ».
- Ligne liée à un compte archivé soldé à 0 : ni compte ni ligne dans la clôture (RG10, RG12).
- Le solde de la ligne et celui du compte diffèrent (spec 0007, RG8) : la clôture affiche celui du compte (Q5).
- Année déjà clôturée : aucun changement (RG14).
- Charger les mêmes données deux fois : même résultat, rien d'écrit (RG16).

## Design

Design proposé, à valider (aucune maquette fournie). Composants et tokens existants : `panel-lg`, `group-head`, `chip`, `popmenu`, `alert-pill`, bandeau de rappel des soldes de départ de l'onglet Comptes (spec 0002, RG29), pastille de compte (`dot`), `cell-input`.

Création / édition d'un compte (onglet Comptes) : une rangée de `chip` « Type » : Courant · Épargne · Investissement (pas d'« Enveloppe », RG3), sous le champ nom.

```
Nom      [ Livret A                   ]
Type     (Courant) (Épargne) (Investissement)
⚠ Une ligne d'épargne porte déjà ce nom.   [Lier à la ligne]
```

Bandeau de déduction (haut de l'onglet Comptes, même style que le rappel des soldes de départ) :

```
┌ 6 comptes semblent comptés deux fois dans la clôture.           [Vérifier] ┐
```

Panneau « Vérifier » (liste, une ligne par candidat) :

```
● Livret A     ligne « Livret A » (épargne)   [ Confirmer épargne ] [ Autre ] [ Garder courant ]
● PEA          ligne « PEA » (invest)         [ Confirmer invest  ] [ Autre ] [ Garder courant ]
```

Clôture : groupes dans cet ordre : Comptes bancaires, Épargnes, Enveloppes, Investissements (les titres actuels « Comptes et épargnes » devient « Épargnes »). Chaque ligne affiche la pastille du compte quand c'est un compte.

États : aucun candidat (pas de bandeau) ; candidats à décider (bandeau) ; tous décidés ; lien « type à revoir » (RG7) ; année clôturée (lecture seule de la clôture, type modifiable) ; groupe vide (masqué, comme aujourd'hui).

## Impact technique

- Domaine (types, Ledger) : `BankAccount.kind?: AccountKind`. Fonction pure de rangement des lignes de clôture par groupe (compte ou ligne), et de recherche des candidats (normalisation du nom, RG17). Fonctions de lecture « lien d'une ligne » basées sur `linkedAccountId`. `Ledger` inchangé.
- Application : actions « changer le type d'un compte », « confirmer le lien et le type d'un candidat », « garder courant » ; la création de compte reçoit le type ; l'action de liaison (RG21) écrit le modèle et les mois ouverts. Refus sur le principal et Espèces (RG2).
- Migration : fonction pure du domaine appelée par `StoreProvider` après `load()` (ADR 0003) ; ici elle n'écrit rien (RG16), la déduction vit dans la lecture des candidats. Aucune nouvelle `version`.
- Infrastructure : `localRepository` inchangé. Supabase : colonne `kind` (texte, valeurs contrôlées, défaut `courant`) sur la table des comptes bancaires, si cette table existe au moment de la migration (sinon à prévoir dans la spec qui la crée ; Q6).
- Présentation : `Closing.tsx` (groupes, suppression des lignes liées), `Accounts.tsx` (type, bandeau, panneau, avertissement), `Setup.tsx` (assistant : type à la création), `LinkedAccountPicker.tsx` (filtre par type), pastille / `ds` existants.
- Schéma Supabase : voir ci-dessus.

## Critères d'acceptation

(T) = test automatisé (Vitest, domaine et application). Le reste est vérifié à la relecture de l'UI.

- CA1 (T). Given un compte sans `kind`, When je lis son type, Then il vaut `courant`.
- CA2 (T). Given des comptes courant, épargne et invest, When je construis les groupes de la clôture, Then chaque compte apparaît dans un seul groupe, celui de son type.
- CA3 (T). Given une ligne `epa` « Livret A » liée (`linkedAccountId`) à un compte `epargne` « Livret A », When je construis la clôture, Then une seule ligne « Livret A » est présente, au solde du compte (`bankMonth`), et le total ne compte pas `accMonth` de la ligne.
- CA4 (T). Given une ligne `epa` non liée, When je construis la clôture, Then elle est présentée par sa ligne propre dans « Épargnes ».
- CA5 (T). Given deux lignes liées au même compte, When je construis la clôture, Then le compte apparaît une seule fois et aucune des deux lignes n'est présentée.
- CA6 (T). Given un compte `invest` lié à une ligne `inv`, Then il est dans « Investissements » et la ligne n'a pas de ligne propre.
- CA7 (T). Given un compte archivé au solde nul au 31 décembre, Then il n'est pas dans la clôture ; With solde non nul, il y est (comportement actuel).
- CA8 (T). Given les données d'exemple (Livret A, LDD, Vacances Mada, PEA, Amundi, Trade Republik et lignes homonymes) après confirmation de toutes les déductions, When je calcule le total de la clôture, Then il est égal à la somme des soldes de chaque compte une fois + lignes non liées, sans montant en double.
- CA9 (T). Given un compte dont le nom (sans casse ni accents) correspond à une ligne `epa` / `inv`, When je cherche les candidats, Then il est proposé ; Given un nom proche mais non identique (« Livret A+ »), Then il n'est pas proposé ; Given le principal ou Espèces, Then jamais.
- CA10 (T). Given un candidat, When je confirme, Then le type du compte vaut `epargne` (ligne `epa`) ou `invest` (ligne `inv`), le lien est écrit sur le modèle et sur les mois ouverts, et aucun solde ne change.
- CA11 (T). Given un candidat, When je choisis « Garder courant », Then le type vaut explicitement `courant` et le compte n'est plus candidat.
- CA12 (T). Given des données chargées, When la migration s'exécute deux fois, Then les données sont identiques et rien n'est écrit sans confirmation (ADR 0003).
- CA13 (T). Given une ligne `epa`, When je lui lie un compte de type `invest`, Then c'est refusé (RG7) ; When le compte est son compte source, Then c'est refusé (RG25).
- CA14 (T). Given le principal ou Espèces, When je change leur type, Then c'est refusé.
- CA15 (T). Given un changement de type d'un compte, When je lis les soldes, Then ils sont inchangés.
- CA16 (T). Given une année clôturée, When je calcule la clôture, Then ses bases ajustées sont inchangées.
- CA17. Given l'onglet Comptes, When je crée ou renomme un compte avec le nom d'une ligne `epa` / `inv` non liée, Then l'avertissement s'affiche avec « Lier à la ligne », et je peux enregistrer sans lier.
- CA18. Given des candidats non décidés, When j'ouvre Comptes, Then le bandeau « n comptes semblent comptés deux fois » est visible ; après la dernière décision, il disparaît.
- CA19. Given l'onglet Clôture, When je le regarde, Then les groupes sont « Comptes bancaires », « Épargnes », « Enveloppes », « Investissements » et aucun montant n'apparaît dans deux groupes.

## Questions ouvertes

Q1. Le type `enveloppe` : le rend-on choisissable dès cette étape ? Recommandation : non (RG3). Il créerait un double compte avec les lignes d'enveloppe tant que la spec 0011 n'est pas livrée. Option : le proposer et masquer alors les lignes d'enveloppe de la clôture (déconseillé : fait de la 0010 une moitié de la 0011).

   **Décision du développeur (2026-10-21) : non, le type `enveloppe` n'est pas choisissable dans la 0010 (RG3 confirmée).**

Q2. Une année déjà verrouillée contient des lignes `epa` / `inv` qui seront dédoublées à la lecture. RG21 ne réécrit pas les mois verrouillés. Faut-il quand même réécrire le lien sur ces mois pour que la clôture de cette année-là se calcule sans double compte, ou la considère-t-on figée (RG14) ? Recommandation : figée.

   **Décision du développeur (2026-10-21) : année verrouillée figée (RG14), aucune réécriture ; il n'existe aucun cas aujourd'hui.**

Q3. Deux comptes de même nom normalisé que la même ligne (RG20) : proposer de lier le premier seulement, ou demander lequel lier ? Recommandation : demander lequel lier.

   **Décision du développeur (2026-10-21) : demander à l'utilisateur lequel lier.**

Q4. Le double compte existe-t-il aussi hors clôture (patrimoine, indicateurs, écran Comptes, `budget.ts`) ? Faut-il les corriger dans cette spec ou dans une suivante ? Recommandation : suite séparée, après audit.

Q5. Pour une ligne liée, la clôture affiche le solde du compte (`bankMonth`) et non le solde de la ligne (`accMonth`, avec relevé) alors que les deux peuvent différer (spec 0007, RG8). Confirmer le solde du compte comme référence, ou préférer celui de la ligne (relevé inclus) ? Recommandation : le compte.

   **Décision du développeur (2026-10-21) : le solde du compte (`bankMonth`) est la référence pour une ligne liée.**

Q6. Existe-t-il déjà une table Supabase des comptes bancaires ? Le schéma est en retard sur le domaine (spec 0009, C5). Ajouter `kind` dans la migration de cette spec ou attendre ?

   **Décision du développeur (2026-10-21) : ajouter la colonne `kind` dans la migration Supabase de cette spec.**

Q7. Les groupes « Épargnes » / « Investissements » mélangent comptes et lignes non liées. Faut-il rendre visibles les lignes encore non liées (pastille « non lié ») pour inciter à lier ? Recommandation : oui, simple libellé gris.

Q8. Sur un budget démarré, l'assistant ignore les soldes des comptes existants (ADR 0003). Faut-il aussi ignorer le type d'un compte existant redéclaré dans l'assistant ? Recommandation : oui, il se règle dans l'onglet Comptes.

## Amendement — spec 0019 (implémentée)

Les soldes de la clôture (`bank:<id>`) viennent du **solde réel** (écritures), plus du réel des lignes ; une ligne `epa`/`inv` liée n'a toujours pas de ligne propre.
