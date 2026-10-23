# 0013 — Import des dépenses par fichier CSV

- Statut : implémentée
- Date : 2026-10-23
- Branche prévue : feat/csv_expense_import

## Contexte et objectif

Aujourd'hui chaque dépense est saisie à la main (`Transaction`, types `var`, `env`, `epa`). Le développeur veut importer l'export CSV de sa banque pour ne plus ressaisir, et préparer une automatisation future (hors périmètre).

Valeur : gagner du temps, éviter les oublis, sans créer de doublons quand deux fichiers se chevauchent.

## Périmètre

Inclus :
- Choix d'un fichier CSV d'une seule banque (format fixe), lecture et aperçu avant import.
- Choix du compte bancaire à chaque import.
- Rattachement de chaque dépense à une ligne `var` ou à une enveloppe, avec règles mémorisées « libellé contient X → cible ».
- Choix du mois de rattachement de chaque ligne.
- Détection des doublons.
- Qualification de chaque débit : dépense, retrait (vers Espèces ou une enveloppe), transfert interne (vers un de ses comptes), transfert externe (dépense à catégoriser), modifiable ligne par ligne.
- Un nouveau « mouvement entre comptes » (retraits et transferts internes), enregistré, pris en compte dans les soldes des comptes.
- Enregistrement comme `Transaction` (dépenses) ou mouvement entre comptes via le mécanisme de sauvegarde existant (spec 0012).
- Briques séparées de l'écran (lecture, normalisation, déduplication, rattachement) réutilisables par une automatisation.

Exclus : « double pointage » (spec 0015 prévue), dépenses sur lignes fixes et crédits (spec 0014 prévue, voir « Suite prévue »), saisie manuelle d'un mouvement entre comptes hors import (le modèle est créé ici, l'écran de saisie libre reste à décider), automatisation (connexion bancaire, import planifié), revenus et virements reçus, pointage des lignes fixes ou crédits (spec 0009), autres banques ou formats (OFX, PDF) tout en gardant la table de correspondance des colonnes isolée, annulation d'un import validé (suppression à la main), identifiant de lot, pagination de l'aperçu, revue comptes/objectifs, bilan annuel.

## Format du fichier (observé sur un exemple anonymisé)

- Un préambule précède l'en-tête : ligne « Téléchargement du … », lignes vides, titulaire, « Compte de Dépôt carte n° … », « Solde au … », « Liste des opérations du compte entre le … et le … ».
- En-tête : `Date;Libellé;Débit euros;Crédit euros;` (point-virgule final : colonne vide en bout de ligne).
- Séparateur `;`, dates JJ/MM/AAAA (une seule date par ligne), décimale `,`, montants non signés en deux colonnes (Débit / Crédit).
- Le libellé est entre guillemets sur plusieurs lignes (retours à la ligne et lignes vides possibles). Première ligne : type d'opération (« Paiement par carte », « Virement émis », « Avoir », « Cotisation », « Retrait au distributeur », « Virement en votre faveur »). Lignes suivantes : détail (commerce, date d'achat « 28/03 », numéro de carte masqué).
- Pas d'identifiant de transaction, pas de solde après opération.
- Un export peut être tronqué en fin de fichier.

## Règles de gestion

Lecture
- RG1. L'import exige une session valide et un budget démarré (`firstMonth` non nul).
- RG2. Le fichier est lu dans le navigateur ; il n'est ni envoyé ni conservé. Encodage : UTF-8, avec repli sur Windows-1252 si le texte n'est pas de l'UTF-8 valide (proposé, voir points à valider).
- RG3. Le lecteur ignore le préambule : les enregistrements commencent après la ligne d'en-tête reconnue (colonnes `Date`, `Libellé`, `Débit euros`, `Crédit euros`). Sans en-tête reconnu, le fichier est refusé avec un message clair.
- RG4. Le lecteur gère les champs entre guillemets sur plusieurs lignes, la colonne vide finale, les guillemets doublés, les fins de ligne `\n` et `\r\n`.
- RG5. Un enregistrement illisible ou tronqué (date ou montant invalide, guillemet non fermé) est signalé avec son numéro d'enregistrement et n'est jamais importé. Le reste du fichier est lu normalement.
- RG6. La correspondance entre noms de colonnes et champs (date, libellé, débit, crédit) est isolée dans une table de correspondance, pour ajouter une banque plus tard sans toucher au reste.
- RG7. Une ligne normalisée contient : date, libellé complet, libellé court, montant positif, sens (débit ou crédit). Le libellé court (affiché dans l'aperçu) est le type d'opération suivi de la première ligne de détail ; le libellé complet sert à l'empreinte et aux règles.

Sélection des lignes
- RG8. Seuls les débits sont des dépenses importables. Les crédits (« Avoir », « Virement en votre faveur », etc.) ne sont jamais importés ; ils sont listés « ignorés (entrées) » dans l'aperçu et le récapitulatif.
- RG9. Qualification : chaque débit porte une nature, modifiable ligne par ligne dans l'aperçu : « Dépense » (rattachée à une ligne `var` ou une enveloppe, RG15), « Retrait » (de l'argent passe du compte importé vers le compte Espèces ou une enveloppe), « Transfert interne » (de l'argent passe du compte importé vers un autre de vos comptes), « Transfert externe » (dépense vers un tiers, à catégoriser : même traitement qu'une dépense).
- RG10. Nature proposée d'après le type d'opération (première ligne du libellé) : « Retrait au distributeur » → Retrait, destination proposée = compte Espèces ; « Virement émis » → « À qualifier » (ni interne ni externe tant que l'utilisateur n'a pas choisi), décochée et signalée « virement possible vers un de vos comptes » ; tout autre débit (« Paiement par carte », « Cotisation », …) → Dépense. Une règle mémorisée (RG18) peut proposer une autre nature. Une ligne « À qualifier » n'est pas importable (RG17).
- RG10a. Retrait et Transfert interne créent chacun un « mouvement entre comptes » (nouveau, distinct d'une `Transaction`) : montant positif, date (mois de rattachement et jour, RG11), libellé, compte source (le compte importé) et compte destination choisi dans la liste des comptes actifs, hors compte source. La destination d'un Retrait est le compte Espèces ou le compte d'une enveloppe ; celle d'un Transfert interne est n'importe quel autre compte actif. Une ligne sans destination n'est pas importable.
- RG10b. Un mouvement entre comptes débite le compte source et crédite le compte destination à sa date, dans les soldes de l'écran Comptes et le détail des mouvements. Il compte dans les deux modes de mois (réel et pointage) puisque c'est un fait saisi. Il suit la règle d'isolation des comptes hors budget (spec 0009, RG92 : le compte principal n'est pas touché par un compte hors budget). Il ne modifie ni les réels des lignes, ni l'allocation d'une enveloppe, ni « Reste à sortir » ; seul le solde de l'enveloppe, qui est celui de son compte (spec 0011, RG1), change (voir P7).
- RG10c. Les crédits correspondants (« Virement en votre faveur » vers le compte importé) restent ignorés (RG8) : le mouvement entre comptes crédite déjà la destination ; importer aussi l'entrée du côté de l'autre compte compterait deux fois.
- RG10d. Un mouvement entre comptes porte l'empreinte, le rang et le compte d'import de sa ligne (RG20 à RG24) et est dédupliqué comme une dépense. Il est modifiable et supprimable à la main après import (pas d'annulation de lot). Cette gestion se fait dans un bloc « Mouvements entre comptes de <mois> » placé sous les dépenses du mois, dans l'onglet Saisie : une ligne par mouvement (date, libellé, source → destination, montant), avec modification du libellé et du montant et suppression. Ces actions sont refusées sur un mois verrouillé. Le bloc ne permet aucune création libre.
- RG10e. Un « Transfert externe » est une dépense ordinaire (une `Transaction`) : l'utilisateur la rattache à une ligne `var` ou une enveloppe.

Mois de rattachement
- RG11. Chaque ligne a un mois de rattachement, proposé par défaut égal au mois de sa date, modifiable à la main (le salaire du dernier jour du mois précédent compte dans le mois courant). Le jour de la transaction est celui de la date de la ligne.
- RG12. Quand la date de la ligne tombe dans un mois clos, antérieur à `firstMonth` ou non créé, la ligne est signalée (pas exclue) : l'utilisateur doit choisir un autre mois de rattachement pour qu'elle soit importable.
- RG13. Le mois de rattachement doit être un mois existant et non clos. La liste n'offre que ces mois. Aucun mois n'est créé par l'import (proposé).
- RG14. Un mois de rattachement différent du mois de la date est affiché de façon visible dans l'aperçu.

Rattachement
- RG15. La cible d'une dépense est une ligne `var` du mois de rattachement ou une enveloppe. Les lignes fixes, crédits, épargne et invest ne sont pas proposées.
- RG16. Ordre de proposition : règle mémorisée dont le motif est contenu dans le libellé complet normalisé (la plus spécifique, c'est-à-dire le motif le plus long, l'emporte), sinon la nature par défaut de RG10 et « à rattacher ».
- RG17. Une ligne sans nature définie (« À qualifier »), sans cible (dépense, transfert externe) ou sans destination (retrait, transfert interne) ne peut pas être importée : l'utilisateur complète ou décoche la ligne.
- RG18. Au choix d'une cible ou d'une destination, une case « Mémoriser la règle » propose un motif modifiable, prérempli avec la première ligne de détail du libellé (le commerce) ou, à défaut, le type d'opération. À la validation, les règles cochées sont enregistrées ; un motif identique existant est mis à jour. Une règle porte une nature et sa cible : ligne `var` (clé stable, valable d'un mois à l'autre), enveloppe (id) pour une dépense ou un transfert externe ; compte destination (id) pour un retrait ou un transfert interne. Une règle dont la cible n'existe plus (ou dont le compte est archivé) est ignorée et n'est pas appliquée.
- RG19. Compte de la transaction : une dépense vers une enveloppe suit toujours le compte de l'enveloppe (spec 0011). Une dépense vers une ligne `var` prend le compte attribué de sa box (`fixedTransactionAccountId`, spec 0006), sinon le compte choisi pour l'import. L'aperçu affiche « Compte de la box : X » quand ce compte diffère du compte d'import.
- RG19a. Chaque transaction et chaque mouvement importé garde, dans un champ facultatif `importAccountId`, le compte bancaire choisi à l'import. Il peut différer de `accountId` (RG19) et sert à la déduplication.

Déduplication
- RG20. Empreinte d'une ligne : date + montant + libellé complet normalisé (minuscules, sans accents, espaces et retours à la ligne réduits à un espace). Le fichier n'ayant pas d'identifiant, c'est la seule clé.
- RG21. Deux lignes de même empreinte dans un fichier reçoivent un rang d'occurrence (1, 2, …) dans l'ordre du fichier ; (empreinte, rang) est la clé de déduplication, par compte d'import (`importAccountId`, RG19a), et non par `accountId`.
- RG22. Une ligne dont (empreinte, rang, compte d'import) existe déjà parmi les transactions et mouvements importés est un doublon : décochée par défaut, marquée « Doublon », forçable par l'utilisateur. Un doublon forcé prend le prochain rang libre de son empreinte (plus grand rang déjà pris + 1) ; les lignes nouvelles du même import sont servies d'abord.
- RG23. Une transaction saisie à la main, de même compte, montant et date, est signalée « Saisie manuelle semblable » sans bloquer ni décocher.
- RG24. L'empreinte, le rang et le compte d'import sont enregistrés avec chaque transaction et chaque mouvement importé. Un doublon forcé ne réutilise jamais un rang déjà pris (RG22), ce qui garde l'unicité. Limite acceptée : deux fichiers dont les rangs divergent pour des achats identiques le même jour peuvent produire un faux doublon ou un doublon manqué ; la case forçable sert de recours.

Validation
- RG25. Rien n'est écrit avant la validation explicite. Annuler ne modifie aucune donnée.
- RG26. À la validation, les lignes cochées et complètes deviennent des `Transaction` (dépense, transfert externe) ou des mouvements entre comptes (retrait, transfert interne), enregistrés en une seule modification du budget. L'échec de sauvegarde suit la bannière de la spec 0012.
- RG27. Le récapitulatif donne : dépenses importées, retraits et transferts importés (détaillés), doublons ignorés, entrées ignorées, lignes décochées ou ignorées par l'utilisateur, lignes en erreur.
- RG28. Les règles de lecture, normalisation, empreinte, déduplication et proposition de cible sont des fonctions pures, sans React ni Supabase. Seul l'enregistrement passe par `BudgetRepository`.

## Parcours utilisateur

Nominal : bouton « Importer » sur l'écran Dépenses, puis choisir le fichier et le compte, puis aperçu (cibles et mois proposés, doublons décochés), corrections, « Importer N lignes », récapitulatif.

Cas limites : fichier vide ou sans en-tête reconnu ; accents cassés (repli Windows-1252) ; dernier enregistrement tronqué ; même fichier importé deux fois (tout en doublons) ; fichier chevauchant le précédent ; deux achats identiques le même jour ; salaire de fin de mois précédent (crédit ignoré, ou débit à rattacher au mois courant) ; ligne dans un mois clos ; règle dont la cible a disparu ; échec de sauvegarde après import.

## Design

Design proposé, validé dans son principe par le développeur (pas de maquette) : assistant à étapes, ouvert par un bouton « Importer » sur l'écran Dépenses. Réutiliser `organic.css` et les composants existants (tableaux, sélecteurs de compte, boutons). Aperçu sur une seule page, sans pagination (jusqu'à environ 200 lignes).

```
Importer des dépenses
Étape 1  [ Choisir un fichier .csv ]   Compte : [ Compte principal v ]
Étape 2  Aperçu : 42 lignes · 3 doublons · 12 entrées ignorées · 5 à rattacher · 1 erreur
 [x] Date    Libellé                      Montant  Rattacher à        Mois      État
 [x] 03/10  Paiement par carte CARREFOUR   54,20  [Courses (var)  v] [oct. v]  Nouveau
 [ ] 05/10  Paiement par carte BOULANGERIE  3,40  [Courses (var)  v] [oct. v]  Doublon
 [ ] 06/10  Virement émis                 188,58  [À qualifier    v] [oct. v]  Virement possible vers un de vos comptes
 [x] 08/10  Retrait au distributeur        40,00  [Retrait -> Espèces v] [oct. v]  Nature modifiable (liste : Dépense, Retrait, Transfert interne, Transfert externe)
 [x] 28/09  Cotisation                      2,50  [Frais (var)    v] [oct. v]  Mois différent de la date
 [x] 07/10  Paiement par carte ???         18,00  [Choisir…       v] [oct. v]  À rattacher
      [ ] Mémoriser la règle « CARREFOUR » -> Courses
 Erreur : enregistrement 43 tronqué, non importé
                                        [Annuler]  [Importer 38 lignes]
Étape 3  Récapitulatif : 38 importées · 3 doublons · 12 entrées ignorées · 1 erreur
```
États : vide, lecture, aperçu, erreur de fichier (message), import en cours, récapitulatif.

## Impact technique (quoi, pas comment)

- Constat sur l'existant : aujourd'hui l'argent ne passe d'un compte à l'autre que par des mécanismes dérivés du budget (pointage d'une ligne `var` vers son compte, allocation d'enveloppe, spec 0009 ; régularisations ; anciens virements inertes). Il n'existe aucune écriture libre « du compte A vers le compte B ». Qualifier un retrait ou un transfert interne exige donc un nouveau concept : le mouvement entre comptes (`AccountMovement`), qui alimente `bankMovements` comme les autres mouvements.
- Domaine : `AccountMovement` (id, mois, jour, libellé, montant, compte source, compte destination, et facultatifs `importAccountId`, empreinte, rang) ajouté à `BudgetData.accountMovements?` (liste facultative) ; règles de rattachement (`ImportRule`, motif, nature, cible) dans `BudgetData.importRules?` (liste facultative) ; lecture CSV (préambule, guillemets multilignes), normalisation, empreinte, rang, détection de doublons, proposition de cible par règles. `Transaction` reçoit les champs facultatifs `importAccountId`, empreinte et rang (modifie `BudgetData`).
- Application : cas d'usage « préparer l'import » (texte du fichier, compte, données du budget, règles → aperçu) et « valider l'import » (lignes retenues → transactions + règles). Port « source de transactions » : le CSV en est la première implémentation, une automatisation en fournirait une autre.
- Infrastructure : lecteur CSV maison, pas de dépendance ajoutée. Schéma Supabase, migration additive : colonnes `import_account_id`, `fingerprint` et `rank` sur `transactions`, à renseigner toutes ensemble ou aucune, avec unicité (user_id, import_account_id, fingerprint, rank) pour les lignes importées ; nouvelle table `account_movements` (mêmes colonnes et mêmes contraintes) ; nouvelle table `import_rules` avec unicité (user_id, pattern) ; les deux nouvelles tables ont `user_id`, RLS « own rows » et clé primaire incluant `user_id` (spec 0012, RG3, RG4). `SupabaseRepository` et son diff couvrent la nouvelle table ; régénération de `database.types.ts`.
- Présentation : bouton sur l'écran Dépenses, assistant à étapes ; bloc « Mouvements entre comptes de <mois> » sous les dépenses du mois, dans l'onglet Saisie (RG10d).
- Documentation : architecture (import CSV), éventuellement un ADR sur la déduplication par empreinte.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given un fichier avec préambule, en-tête et libellés multilignes, When je le charge, Then le préambule est ignoré et chaque opération donne une ligne avec date, libellé, montant et sens corrects. (Auto)
- CA2. Given un montant « 1 234,56 » ou « 54,20 », When il est lu, Then il vaut respectivement 1234.56 et 54.2. (Auto)
- CA3. Given un dernier enregistrement tronqué, When je charge le fichier, Then il est signalé avec son numéro et exclu, et les autres lignes sont lues. (Auto)
- CA4. Given un fichier sans en-tête reconnu, When je le charge, Then un message d'erreur s'affiche et rien n'est proposé à l'import. (Auto)
- CA5. Given un fichier en Windows-1252, When je le charge, Then les accents sont corrects. (Auto sur le décodage)
- CA6. Given des crédits dans le fichier, When je charge, Then ils sont comptés « ignorés (entrées) » et jamais importés. (Auto)
- CA7. Given un « Virement émis », When j'ouvre l'aperçu, Then il est « À qualifier », signalé et décoché ; Then il n'est pas importable avant que je choisisse Transfert interne (avec un compte destination) ou Transfert externe (avec une cible). (Auto sur la règle, Man sur l'écran)
- CA7a. Given un « Retrait au distributeur » de 40 €, When j'ouvre l'aperçu, Then il est qualifié Retrait vers le compte Espèces, modifiable vers une enveloppe, un autre compte, ou vers Dépense. (Auto)
- CA7b. Given un retrait de 40 € importé du compte principal vers Espèces, Then le solde du principal baisse de 40 €, celui d'Espèces monte de 40 € à la date du jour de la ligne, dans les deux modes de mois, et le réel des lignes ne change pas. (Auto)
- CA7c. Given un transfert interne de 188,58 € vers un compte hors budget, Then le compte principal n'est pas touché au sens de la spec 0009 RG92 et le compte hors budget enregistre sa face. (Auto)
- CA7d. Given un transfert externe, When je valide, Then une dépense ordinaire est créée sur la cible choisie et aucun mouvement entre comptes n'est créé. (Auto)
- CA7e. Given un retrait ou un transfert importé, When je réimporte le fichier, Then il est un doublon comme une dépense. (Auto)
- CA7f. Given un « Virement en votre faveur » du fichier, Then il reste ignoré (entrée) et le compte destination n'est pas crédité deux fois. (Auto)
- CA8. Given un fichier déjà importé, When je le recharge, Then toutes les dépenses sont marquées « Doublon » et décochées ; si je les force, elles sont créées avec le prochain rang libre de leur empreinte, sans conflit d'unicité. (Auto)
- CA9. Given deux achats identiques le même jour, When j'importe, Then deux transactions sont créées ; When je réimporte le fichier, Then les deux sont des doublons. (Auto)
- CA10. Given un fichier chevauchant le précédent, When j'importe, Then seules les nouvelles lignes sont créées. (Auto)
- CA11. Given une saisie manuelle de même compte, montant et date, When j'ouvre l'aperçu, Then la ligne est signalée sans être décochée. (Auto)
- CA12. Given une ligne datée du dernier jour du mois précédent, When j'ouvre l'aperçu, Then son mois de rattachement par défaut est celui de sa date, je peux le changer pour le mois courant, et la transaction est créée dans ce mois avec le jour de la date. (Auto sur le domaine, Man sur l'écran)
- CA13. Given une ligne dans un mois clos, antérieur à `firstMonth` ou non créé, When j'ouvre l'aperçu, Then elle est signalée et non importable tant que je n'ai pas choisi un mois existant non clos. (Auto)
- CA14. Given un mois de rattachement différent du mois de la date, When j'ouvre l'aperçu, Then l'écart est visible. (Man)
- CA15. Given une règle « CARREFOUR → Courses », When je charge un fichier contenant ce libellé, Then la cible est préremplie ; le motif le plus long l'emporte si plusieurs règles correspondent. (Auto)
- CA16. Given une ligne sans cible, When je valide, Then elle n'est pas importée avant que je choisisse une cible ou la décoche. (Auto, Man)
- CA17. Given « Mémoriser la règle » cochée, When je valide, Then la règle existe après rechargement de l'application et s'applique à l'import suivant. (Man sur base réelle, Auto sur le domaine)
- CA18. Given une règle dont la cible a été supprimée, When je charge un fichier, Then elle n'est pas appliquée et ne provoque pas d'erreur. (Auto)
- CA19. Given une dépense vers une enveloppe d'un autre compte que celui de l'import, When j'importe, Then la transaction porte le compte de l'enveloppe ; vers une ligne `var`, le compte attribué de la box, sinon le compte de l'import. (Auto)
- CA20. Given l'aperçu affiché, When j'annule, Then aucune donnée n'est modifiée. (Auto)
- CA21. Given un import validé puis un rechargement, Then les transactions, empreintes et rangs sont conservés et un nouvel import ne les duplique pas. (Man sur base réelle)
- CA22. Given un import validé, Then le récapitulatif affiche les compteurs de RG27, et le réel de la ligne `var` ou le solde de l'enveloppe reflète les transactions. (Man)
- CA23. Given un utilisateur B, When il interroge la table des règles et les empreintes, Then il ne voit rien de A. (Man, requêtes sur la base)
- CA24. `npm run build` et les tests passent, sans nouvelle dépendance dans `package.json`. (Auto)

## Amendement 1 — schéma d'export Linxo, plusieurs comptes (validable)

Demande du développeur au test manuel : passer par Linxo pour exporter les dépenses de plusieurs comptes avec un schéma fixe. Toutes les questions de l'amendement sont tranchées (voir « Décisions de l'amendement »). Une fois validé, il remplace les règles et critères listés dans « Règles et critères remplacés ». Jusqu'à l'implémentation de l'amendement, le code livré suit encore le format d'origine.

### Nouveau format observé (copier-coller, retours à la ligne perdus)

- En-tête simple en première ligne, sans préambule : `Date`, `Libellé`, `Catégorie`, `Montant`, `Notes`, `N° de chèque`, `Labels`, `Nom du compte`, `Nom de la connexion`. Séparateur : tabulation (confirmé sur un échantillon propre).
- Une seule date JJ/MM/AAAA. Montant signé dans une seule colonne : négatif = débit (dépense), positif = crédit. Décimale `,` observée (`217,8`, `-2,95`), entier sans décimale possible (`1600`).
- `Nom du compte` identifie le compte de la ligne, avec un numéro masqué (`… (x1111)`). `Nom de la connexion` identifie la banque.
- `Notes` contient souvent le texte brut de la banque (`PAIEMENT PAR CARTE X2222 LA CREPERIE EXEMPLE 21/10`) ; `N° de chèque` et `Labels` souvent vides. Pas d'identifiant de transaction.
- `Catégorie` est attribuée par Linxo et peut être fausse (un paiement carte classé « Remb. prêt conso »).
- Le libellé ne commence plus par un type d'opération (« Paiement par carte », « Virement émis »). Le texte brut de la banque se trouve plutôt dans `Notes`, ou dans le libellé lui-même (`REALISATION DE PRET …`).

### Règles de l'amendement

- RG29. Format : en-tête en première ligne reconnu par les noms de colonnes `Date`, `Libellé`, `Montant`, `Nom du compte`, `Nom de la connexion` (les autres colonnes sont lues si présentes). Séparateur : tabulation (confirmé sur l'échantillon propre du développeur) ; `;` accepté en repli. Un fichier sans ces colonnes est refusé avec un message clair (reprend RG3, RG6).
- RG30. Montant signé : valeur négative = débit, importé avec le montant positif ; valeur positive = crédit, ignoré (RG8) ; zéro ou illisible = enregistrement en erreur (RG5). Décimale `,` ou `.` acceptée ; aucun séparateur de milliers n'est géré (non observé). Encodage : UTF-8 (BOM toléré), avec repli sur Windows-1252 si le texte n'est pas de l'UTF-8 valide (reprend RG2).
- RG31. Libellé complet d'une ligne = `Libellé` + `Notes` (texte unique, normalisé). Il sert à l'empreinte, aux règles mémorisées et à la détection des natures. Libellé court affiché = `Libellé`. `Catégorie` est conservée comme information facultative (RG37) et n'entre ni dans l'empreinte ni dans la proposition de cible. `Labels`, `N° de chèque` ne sont ni stockés ni utilisés ; `Nom de la connexion` ne sert qu'à la correspondance de compte (RG32).
- RG32. Compte de la ligne (décision du développeur) : chaque ligne porte son compte via le couple (`Nom du compte`, `Nom de la connexion`). Cela remplace « compte choisi à chaque import » : le sélecteur de compte de l'étape 1 disparaît. Un tableau de correspondance mémorisé, propre à l'utilisateur, associe chaque couple (valeurs exactes après suppression des espaces en bordure, numéro masqué compris) à un compte de l'app, ou à « Ne pas importer ». La liste des comptes proposés contient tous les comptes non archivés, comptes d'enveloppe compris (marqués « (enveloppe) ») ; seuls les comptes archivés sont exclus.
  - Structure : une correspondance = id, nom de compte Linxo, nom de connexion Linxo, compte de l'app (ou « ne pas importer »). Unique par (user_id, nom de compte, nom de connexion). Stockée dans une nouvelle table avec `user_id`, RLS « own rows » et clé primaire incluant `user_id`, comme `import_rules`.
  - Obligation (décision du développeur) : tant qu'aucune correspondance n'existe pour un couple, l'utilisateur doit obligatoirement préciser le compte de l'app (ou « Ne pas importer ») ; aucun compte n'est déduit ni proposé par défaut. Les lignes de ce couple ne sont importables qu'après ce choix, et le bouton d'import ne les compte pas avant. La correspondance est ensuite mémorisée.
  - Première rencontre d'un couple inconnu : l'aperçu s'ouvre avec un bandeau « N comptes à rattacher » en tête ; chaque couple inconnu est listé une fois (nombre de lignes concernées) avec un sélecteur de compte et l'option « Ne pas importer ». Les correspondances choisies sont enregistrées à la validation de l'import (comme les règles, RG18), pas avant (RG25).
  - Ligne dont le compte n'est pas rattaché : visible dans l'aperçu, décochée, état « Compte à rattacher », non importable (RG17) tant que le couple n'est pas rattaché. Un couple « Ne pas importer » : ses lignes sont retirées de l'aperçu et comptées à part dans le récapitulatif.
  - Fichier multi-comptes : les lignes de tous les comptes sont dans le même aperçu, chacune avec la pastille de son compte ; un couple connu ne redemande rien.
  - Modification et suppression : une liste « Correspondances de comptes » (accessible depuis l'assistant d'import) permet de changer le compte d'une correspondance, de la passer à « Ne pas importer » ou de la supprimer (le couple sera redemandé au prochain import). Modifier une correspondance n'altère aucune transaction ou mouvement déjà importé. Un compte de l'app archivé ou supprimé rend la correspondance « à rattacher » (c'est le seul cas où un compte est refusé à la correspondance).
- RG33. Le compte résolu joue le rôle de l'ancien compte d'import : il devient `importAccountId` (RG19a), détermine la source des retraits et transferts internes (RG10a) et le compte par défaut d'une dépense `var` quand sa box n'a pas de compte attribué (RG19, inchangé dans son principe : box d'abord, sinon compte résolu de la ligne).
  - Compte d'enveloppe : quand le compte résolu est celui d'une enveloppe, une dépense de la ligne est une dépense de cette enveloppe, proposée par défaut et seule cible possible : ni ligne `var`, ni autre enveloppe (spec 0011, RG2). Les retraits et transferts internes sont autorisés depuis ce compte, avec une destination différente de la source (RG10a).
  - La déduplication reste par (compte d'import, empreinte, rang) (RG21, RG22), donc compte par compte dans un fichier multi-comptes. Si une correspondance est modifiée plus tard vers un autre compte, les lignes déjà importées gardent leur ancien `importAccountId` : un réimport du même fichier pourrait alors créer des doublons (limite acceptée, atténuée par les indices de RG37).
- RG34. Les rangs d'occurrence (RG21) se calculent par compte et empreinte. L'empreinte (RG20) est calculée sur date + montant + libellé complet (RG31). Limite nouvelle : Linxo peut reformuler un libellé entre deux exports, ce qui produirait des doublons non détectés ; l'indice de RG37 sert de filet.
- RG35. Natures : aucun mot-clé propre à Linxo n'est supposé (aucun exemple réel observé). Par défaut tout débit est une « Dépense » à rattacher. Une détection prudente, isolée dans une table de mots-clés facile à modifier, ne propose une autre nature que sur des mots entiers non ambigus du libellé complet normalisé : « retrait » → Retrait vers Espèces ; « virement emis » → « À qualifier ». Toute nature proposée reste modifiable ligne par ligne. La première fois, le développeur qualifie à la main (retrait, virement vers soi-même, vers un tiers) et les règles mémorisées (RG16, RG18), prioritaires, prennent le relais. La table de mots-clés pourra être complétée sur des exemples réels.
- RG36. Un transfert entre deux comptes exportés apparaît deux fois (débit sur A, crédit sur B). Le crédit reste ignoré (RG8, RG10c) : le mouvement créé à partir du débit crédite déjà la destination.
- RG37. Catégorie et indices de doublon (décision du développeur) : la catégorie Linxo est stockée comme information facultative (`category`) sur la transaction ou le mouvement importé, hors empreinte. Une ligne de même compte d'import, même jour et même montant qu'une transaction ou un mouvement déjà importé, d'une autre empreinte, est signalée « Semblable déjà importée » ; si de plus la catégorie est la même, « Doublon probable ». Ces signaux ne bloquent pas et ne décochent pas. Ils complètent RG23 (saisie manuelle semblable).
- RG38. Comptes d'épargne ou d'investissement : leurs débits sont importables comme ceux des autres comptes, la nature étant choisie ligne par ligne ; l'utilisateur peut aussi régler le couple sur « Ne pas importer ».
- RG39. Les données de test importées avec l'ancien format sont supprimées à la main par le développeur ; aucune migration de données n'est prévue. Les données déjà stockées restent valides (`importAccountId`, empreinte, rang inchangés dans leur forme).

### Impact sur ce qui est implémenté

- Lecteur CSV (`src/infrastructure/csvStatement.ts`, son fixture et son test) : remplacé par un lecteur Linxo unique (l'ancien lecteur Crédit Agricole est retiré) pour le nouvel en-tête, le séparateur tabulation (repli `;`), le montant signé, les colonnes compte, connexion, notes et catégorie. La lecture des champs entre guillemets multilignes et la tolérance aux enregistrements tronqués restent utiles. Le fixture de test devient un export Linxo anonymisé (plusieurs comptes, crédit, retrait, virement, ligne tronquée, libellé avec guillemets).
- Domaine (`src/domain/statement.ts`) : `StatementRow` gagne le nom de compte, le nom de connexion, les notes et la catégorie ; `operationType`, `shortLabel`, `fingerprintOf` et `suggestedPattern` sont revus (RG31, RG34, RG35).
- Application (`src/application/statementImport.ts`) : `prepareImport`, `validateImport`, `lineProblem`, `changeNature`, `changeMonth` et `previewCounts` reçoivent aujourd'hui un `sourceId` unique ; le compte devient propre à chaque ligne. Le calcul des signaux « semblable » (RG23, RG37) se fait par compte. Nouveaux cas d'usage : rattacher, modifier, supprimer une correspondance de compte. La liste des comptes de la correspondance inclut les comptes d'enveloppe (seuls les archivés sont exclus) ; une ligne d'un compte d'enveloppe n'accepte que cette enveloppe comme cible de dépense (RG33).
- Présentation (`ImportWizard.tsx`, `Expenses.tsx`) : le sélecteur de compte de l'étape 1 est remplacé par le bandeau « N comptes à rattacher » de l'aperçu et la liste « Correspondances de comptes » ; l'aperçu affiche le compte de chaque ligne (pastille) ; le compteur « Compte de la box » (RG19) reste.
- Données et schéma : nouvelle liste facultative `BudgetData.importAccountLinks?` ((nom de compte Linxo, nom de connexion Linxo) → compte de l'app ou « Ne pas importer ») et nouvelle table Supabase correspondante (user_id, RLS « own rows », unique (user_id, nom de compte, nom de connexion)) par une NOUVELLE migration (la migration déjà appliquée n'est pas modifiée) ; `supabaseRows` / schéma / `database.types.ts` / test de contrat `BudgetRepository` à étendre. Champ facultatif `category` ajouté à `Transaction` et `AccountMovement`, avec une colonne dans `transactions` et `account_movements` (même migration), hors contrainte d'unicité. Transactions, mouvements et règles déjà stockés restent valides (`importAccountId`, empreinte et rang inchangés dans leur forme).
- Documentation : ADR 0010 (déduplication) à compléter pour le multi-comptes et l'empreinte Linxo ; ADR 0012 inchangé ; architecture (format d'import).

### Critères d'acceptation de l'amendement

- CA25. Given un export Linxo à en-tête simple, tabulation, plusieurs comptes, When je le charge, Then chaque enregistrement donne date, libellé, notes, montant positif, sens et nom de compte corrects. (Auto)
- CA26. Given `-2,95`, `217,8` et `1600`, When ils sont lus, Then ils valent -2.95 (débit de 2.95), 217.8 et 1600 (crédits ignorés pour les deux derniers). (Auto)
- CA27. Given un fichier sans colonne `Date` ou `Montant`, When je le charge, Then un message d'erreur s'affiche et rien n'est proposé. (Auto)
- CA28. Given un dernier enregistrement tronqué, Then il est signalé et exclu, les autres lignes sont lues. (Auto)
- CA29. Given deux couples (compte, connexion) jamais vus, When j'ouvre un fichier, Then l'aperçu affiche le bandeau « 2 comptes à rattacher » et leurs lignes sont décochées, « Compte à rattacher », non importables ; When je les rattache et valide, Then les correspondances sont enregistrées et un second fichier ne les redemande plus. (Auto sur le domaine, Man sur l'écran)
- CA29d. Given un couple sans correspondance, When je tente d'importer sans choisir de compte, Then ses lignes ne sont pas écrites, le compteur « Importer N lignes » ne les inclut pas et aucun compte par défaut n'est appliqué ; When je choisis un compte, Then elles deviennent importables. (Auto)
- CA29a. Given deux couples de même nom de compte mais de connexions différentes, Then ils sont deux correspondances distinctes. (Auto)
- CA29e. Given une correspondance vers le compte d'une enveloppe, When je la choisis, Then elle est acceptée et enregistrée ; When j'importe, Then les dépenses de ce compte deviennent des dépenses de cette enveloppe (cible proposée par défaut). Given un compte archivé, Then il n'est pas proposé et une correspondance existante vers lui redevient « à rattacher ». (Auto)
- CA29f. Given une ligne dont le compte résolu est celui d'une enveloppe, When je tente de la rattacher à une ligne `var` ou à une autre enveloppe, Then c'est refusé et la ligne reste non importable. Given un retrait ou un transfert interne depuis ce compte, Then il est accepté avec une destination différente de la source. (Auto)
- CA29b. Given une correspondance modifiée, supprimée ou passée à « Ne pas importer », Then les transactions déjà importées ne changent pas, et le couple est redemandé après suppression. (Auto)
- CA29c. Given un fichier multi-comptes, When j'importe, Then chaque transaction a pour `importAccountId` le compte résolu de sa ligne, et une dépense `var` prend le compte de sa box sinon ce compte (RG19). (Auto)
- CA30. Given un couple associé à « Ne pas importer », Then ses lignes n'apparaissent pas dans l'aperçu et sont comptées à part dans le récapitulatif. (Auto)
- CA31. Given un fichier de deux comptes avec deux achats identiques le même jour sur chacun, When j'importe puis réimporte, Then quatre transactions sont créées puis toutes sont des doublons. (Auto)
- CA32. Given un débit sans mot-clé reconnu, Then sa nature est « Dépense » à rattacher ; Given un libellé contenant le mot entier « retrait », Then Retrait vers Espèces ; Given « virement emis », Then « À qualifier » ; la nature reste modifiable et une règle mémorisée l'emporte. (Auto)
- CA33. Given une ligne de même compte d'import, jour et montant qu'une ligne déjà importée d'une autre empreinte, Then elle est signalée « Semblable déjà importée » sans être décochée ; Given de plus la même catégorie, Then « Doublon probable », toujours sans bloquer. (Auto)
- CA33a. Given deux exports où Linxo a changé la catégorie d'une même opération, Then l'empreinte est identique et la ligne est un doublon (la catégorie n'est pas dans l'empreinte). (Auto)
- CA33b. Given un compte épargne ou invest rattaché, Then ses débits sont proposés avec une nature à choisir ; Given « Ne pas importer », Then ils sont écartés. (Auto)
- CA34. Given la migration, Then la table des associations existe avec `user_id`, RLS « own rows » et l'unicité ; sauvegarder puis recharger redonne les associations. (Auto sur la conversion, Man sur la base)
- CA35. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

### Règles et critères remplacés par l'amendement

Ces éléments de la spec d'origine sont REMPLACÉS (ne plus s'y référer) :
- « Compte choisi à chaque import » (Périmètre, Parcours, Design étape 1 et wireframe) : remplacé par RG32 et RG33.
- Section « Format du fichier » (Crédit Agricole : préambule, colonnes Débit/Crédit, libellé multiligne) : remplacée par « Nouveau format observé ».
- RG2 (encodage) : précisée par RG30. RG3 et RG4 (préambule, guillemets multilignes, colonne vide finale) : remplacées par RG29. RG5 conservée.
- RG7 (libellé court = type d'opération + détail) : remplacée par RG31.
- RG9 et RG10 (nature d'après le « type d'opération » en tête de libellé, exemples « Retrait au distributeur » / « Virement émis ») : remplacées par RG35. RG9 (liste des natures) reste valable.
- RG20 (empreinte sur le libellé multiligne) : remplacée par RG31 et RG34. RG23 (saisie manuelle semblable) : complétée par RG37.
- CA1 à CA5 (lecture Crédit Agricole) et CA7a (retrait détecté par « Retrait au distributeur ») : remplacés par CA25 à CA28 et CA32. P3 et P4 : précisés par RG35 et RG30.
Inchangés : RG1, RG5, RG8, RG10a à RG10e, RG11 à RG19a, RG21 à RG28 (sauf mentions ci-dessus), CA6 et CA7 à CA24 hors ceux cités.

### Décisions de l'amendement (validées par le développeur)

- Un seul lecteur : le format Crédit Agricole est remplacé par Linxo.
- Correspondance (Nom du compte, Nom de la connexion) → compte de l'app, mémorisée, rattachement obligatoire à la première rencontre, option « Ne pas importer », choix dans l'aperçu (RG32).
- Catégorie Linxo : information facultative et indice de doublon, hors empreinte (RG37).
- Empreinte = date + montant + libellé + notes (RG34). Encodage et décimale par défaut (RG30).
- Natures : détection prudente et modifiable, qualification manuelle la première fois (RG35).
- Données de test de l'ancien format supprimées à la main, sans migration (RG39). Comptes épargne et invest importables ou « Ne pas importer » (RG38).
Risque noté sur la catégorie : Linxo peut recatégoriser une même opération entre deux exports ; c'est pourquoi elle reste hors de l'empreinte (CA33a).

## Suite prévue : dépenses sur lignes fixes et crédits (spec 0014, hors périmètre)

Le développeur veut pouvoir rattacher une ligne importée à une ligne fixe (`fix`) ou crédit (`cre`, remboursements et assurances de prêt : des sorties d'argent) du budget, indépendamment du pointage, pour que le solde réel tienne compte des prélèvements. Décision : la 0013 est livrée telle quelle, avec les cibles `var` et enveloppes uniquement (RG15 inchangée). Ce besoin est traité par la spec `0014-depenses-lignes-fixes-et-credits.md` (modèle de saisie, Ledger, « Reste à sortir », schéma, import et saisie manuelle). Le code de la 0013 n'est pas modifié ici ; la 0014 listera son impact sur lui.

## Questions ouvertes

Aucune question bloquante, y compris sur l'amendement 1. Le développeur a confirmé : mouvement entre comptes créé dans cette spec, P7, dépenses sur lignes fixes et crédits en spec 0014, double pointage en spec 0015. Points proposés (tranchés par défaut pour avancer), à confirmer à la validation de la spec :
- P1. Virement émis : « À qualifier », signalé, décoché et non importable tant que le développeur n'a pas choisi interne ou externe (RG10). Validé sur le principe par le développeur.
- P2. Avoirs et tous les crédits : ignorés, jamais rattachés à une dépense pour la réduire (RG8).
- P3 (remplacé par décision du développeur). Retrait au distributeur : qualifié Retrait, destination proposée Espèces, modifiable ligne par ligne (RG9, RG10, RG10a).
- P4 (confirmé). Encodage : UTF-8 (BOM toléré) avec repli Windows-1252 (RG2, RG30).
- P5. Mois de rattachement : mois existant et non clos uniquement ; aucun mois créé par l'import (RG12, RG13).
- P6 (amendé par le développeur). Dépense vers une ligne `var` : compte attribué de la box, sinon compte d'import (RG19).
- P7 (confirmé par le développeur). Un retrait ou transfert vers une enveloppe change seulement le solde de son compte, sans toucher à son allocation du mois (RG10b). Risque connu et accepté : double compte si l'enveloppe est aussi alimentée par son allocation pointée.

## Suite prévue : double pointage (spec 0015, hors périmètre)

Décidé par le développeur : le « double pointage » sera une spec séparée (0015, après la 0014), avec un rapprochement automatique modifiable à la main. Il n'est pas rédigé ici. Raison : il modifie le modèle de pointage de la spec 0009 (cases, couleurs, mode de mois, `LineCheck`) et touche chaque écran qui affiche une case. Idée de départ : une écriture importée apparaît « importée » dans une couleur, et devient « validée » dans une autre quand un mouvement saisi et enregistré lui correspond.

Ce que la 0013 garde pour le brancher : l'empreinte et le rang de chaque transaction et de chaque mouvement entre comptes importés (RG20, RG24), qui identifient une écriture comme venant de la banque et la rendent retrouvable. Aucune autre préparation n'est faite ici.
