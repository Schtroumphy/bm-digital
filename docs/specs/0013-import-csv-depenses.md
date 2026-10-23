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

Exclus : « double pointage » (spec 0017 prévue), dépenses sur lignes fixes et crédits (spec 0014 prévue), import réel des revenus et date bancaire (spec 0015 prévue ; l'amendement 4 les rend seulement visibles, voir « Suite prévue »), saisie manuelle d'un mouvement entre comptes hors import (le modèle est créé ici, l'écran de saisie libre reste à décider), automatisation (connexion bancaire, import planifié), revenus et virements reçus, pointage des lignes fixes ou crédits (spec 0009), autres banques ou formats (OFX, PDF) tout en gardant la table de correspondance des colonnes isolée, annulation d'un import validé (suppression à la main), identifiant de lot, pagination de l'aperçu, revue comptes/objectifs, bilan annuel.

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
- RG25. Rien n'est écrit avant la validation explicite. Annuler ne modifie aucune donnée. [Précisé par l'amendement 5 : « validation » = chaque import de lignes ; les lignes déjà importées sont conservées si l'on ferme ensuite.]
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
  - Première rencontre d'un couple inconnu : l'aperçu s'ouvre avec un bandeau « N comptes à rattacher » en tête ; chaque couple inconnu est listé une fois (nombre de lignes concernées) avec un sélecteur de compte et l'option « Ne pas importer ». Les correspondances choisies sont enregistrées à la validation de l'import (comme les règles, RG18), pas avant (RG25). [Amendé par RG74 (amendement 5) : seulement pour les couples dont au moins une ligne est importée.]
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

- Lecteur CSV (`src/infrastructure/csvStatement.ts`, son fixture et son test) : remplacé par un lecteur Linxo unique (l'ancien lecteur du format bancaire d'origine est retiré) pour le nouvel en-tête, le séparateur tabulation (repli `;`), le montant signé, les colonnes compte, connexion, notes et catégorie. La lecture des champs entre guillemets multilignes et la tolérance aux enregistrements tronqués restent utiles. Le fixture de test devient un export Linxo anonymisé (plusieurs comptes, crédit, retrait, virement, ligne tronquée, libellé avec guillemets).
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
- Section « Format du fichier » (format bancaire d'origine : préambule, colonnes Débit/Crédit, libellé multiligne) : remplacée par « Nouveau format observé ».
- RG2 (encodage) : précisée par RG30. RG3 et RG4 (préambule, guillemets multilignes, colonne vide finale) : remplacées par RG29. RG5 conservée.
- RG7 (libellé court = type d'opération + détail) : remplacée par RG31.
- RG9 et RG10 (nature d'après le « type d'opération » en tête de libellé, exemples « Retrait au distributeur » / « Virement émis ») : remplacées par RG35. RG9 (liste des natures) reste valable.
- RG20 (empreinte sur le libellé multiligne) : remplacée par RG31 et RG34. RG23 (saisie manuelle semblable) : complétée par RG37.
- CA1 à CA5 (lecture du format bancaire d'origine) et CA7a (retrait détecté par « Retrait au distributeur ») : remplacés par CA25 à CA28 et CA32. P3 et P4 : précisés par RG35 et RG30.
Inchangés : RG1, RG5, RG8, RG10a à RG10e, RG11 à RG19a, RG21 à RG28 (sauf mentions ci-dessus), CA6 et CA7 à CA24 hors ceux cités.

### Décisions de l'amendement (validées par le développeur)

- Un seul lecteur : le format bancaire d'origine est remplacé par Linxo.
- Correspondance (Nom du compte, Nom de la connexion) → compte de l'app, mémorisée, rattachement obligatoire à la première rencontre, option « Ne pas importer », choix dans l'aperçu (RG32).
- Catégorie Linxo : information facultative et indice de doublon, hors empreinte (RG37).
- Empreinte = date + montant + libellé + notes (RG34). Encodage et décimale par défaut (RG30).
- Natures : détection prudente et modifiable, qualification manuelle la première fois (RG35).
- Données de test de l'ancien format supprimées à la main, sans migration (RG39). Comptes épargne et invest importables ou « Ne pas importer » (RG38).
Risque noté sur la catégorie : Linxo peut recatégoriser une même opération entre deux exports ; c'est pourquoi elle reste hors de l'empreinte (CA33a).

## Amendement 3 — navigation, visuel et filtrage de l'assistant d'import (implémenté)

Demande du développeur au test manuel (code livré, PR #12) : « Je dois pouvoir fermer la correspondance des comptes et revenir à la page d'import. Par ailleurs, améliore le visuel de cette page. » Aucune règle fonctionnelle de l'import n'est modifiée, sauf la navigation décrite ici.

### Constat sur le code livré

- L'assistant (`ImportWizard.tsx`) remplace l'écran Dépenses tant que `importing` est vrai (`Expenses.tsx`). La liste « Correspondances de comptes » (`AccountLinks.tsx`) n'est ni une modale ni un autre écran : l'assistant bascule un drapeau interne (`showLinks`) et affiche la liste à la place de son contenu. Le fichier lu, l'aperçu, les corrections et les choix de la bannière vivent dans l'état de l'assistant, qui reste monté : ils ne sont donc PAS perdus par l'ouverture de la liste.
- Ce qui fait perdre l'état : dans la vue de la liste, l'en-tête n'offre que « Annuler », qui ferme tout l'assistant (état perdu), alors que le seul retour vers l'import est un bouton « Retour » en bas de la liste, facile à manquer. Pas de touche Échap. L'application n'a pas de routage ni d'historique de navigateur (aucun `pushState`).
- Ce qui est faux au retour : les modifications de la liste (changer le compte d'une correspondance, « Ne pas importer », supprimer) s'enregistrent immédiatement dans les données (`setImportAccountLink`, `removeImportAccountLink`), mais l'aperçu n'est pas recalculé au retour. Les lignes gardent alors leur ancien compte (`accountId`) et l'état « à rattacher » périmés.

### Règles de l'amendement

- RG40. Fermeture explicite : la vue « Correspondances de comptes » a, en tête, un bouton « ← Retour à l'import » (« ← Retour » quand aucun fichier n'est chargé). Il ramène à la page d'import exactement où l'utilisateur l'avait laissée. En tête de cette vue, « Annuler » (qui ferme l'assistant) n'est plus proposé : seul « Fermer l'assistant » discret reste, sans ambiguïté avec le retour ; s'il existe un aperçu non validé, il demande d'abord « Abandonner l'import en cours ? Les corrections seront perdues. ». Le bouton « Retour » du bas de liste est conservé.
- RG41. Touche Échap : dans la vue des correspondances, Échap revient à la page d'import (sauf si une liste déroulante est ouverte : Échap la referme d'abord). Sur la page d'import, Échap ne ferme pas l'assistant.
- RG42. État conservé au retour : fichier lu, aperçu, corrections de lignes (nature, cible, mois), cases cochées, motifs « Mémoriser la règle », choix de comptes de la bannière non encore validés, défilement de la page. Rien n'est écrit tant qu'on n'a pas validé l'import (RG25).
- RG43. Recalcul au retour : si au moins une correspondance a été modifiée, passée à « Ne pas importer » ou supprimée dans la liste, l'aperçu est recalculé au retour avec les correspondances actuelles, en conservant les corrections des lignes dont le compte et le rang n'ont pas changé (même mécanisme que `choosePairAccount`). Les lignes dont le compte a changé repartent des propositions par défaut (nature, cible, case cochée). Un couple qui a désormais une correspondance enregistrée utilise celle-ci et son choix de bannière non validé est écarté ; un couple dont la correspondance a été supprimée revient dans la bannière « à rattacher ». Si rien n'a changé, l'aperçu n'est pas recalculé.
- RG44. Sans fichier chargé : la liste est consultable et modifiable comme avant ; « ← Retour » ramène à l'étape 1 (choix du fichier), rien à recalculer.
- RG45. Bouton « Retour » du navigateur : inchangé. L'application n'ayant pas d'historique de navigation interne, il quitte l'application comme aujourd'hui ; il n'est pas utilisé pour revenir de la liste.- RG46. Vue récapitulatif : la liste n'y est pas accessible (inchangé).

### Design proposé, à valider

Cohérent avec l'existant : `panel-lg`, `tx-head`, `field-label`, `btn-dark` / `btn-outline` / `btn-quiet`, `alert-box`, `su-select`, pastille de compte (`AccountDot`), tokens `organic.css`. Desktop 1440 px uniquement (pas de responsive).

Principes : une seule action principale visible, des étapes lisibles, des états colorés au lieu de phrases collées, montants alignés à droite en chiffres tabulaires, lignes à densité constante, regroupement par compte.

Fil d'étapes et en-tête (toutes les vues) :
```
Importer des dépenses                         [Correspondances de comptes]  [Annuler]
 (1) Fichier  ────  (2) Aperçu  ────  (3) Récapitulatif        étape courante en gras
```
Étape 1, sans fichier (état vide) :
```
 +------------------------------------------------------------+
 |  Choisissez l'export Linxo (.csv, .tsv)                    |
 |  [ Choisir un fichier ]      Aucun fichier choisi          |
 |  Les comptes sont rattachés au premier import.             |
 +------------------------------------------------------------+
 (erreur de fichier : bandeau rouge « Colonne Montant introuvable. Vérifiez l'export. »)
```
Étape 2, fichier chargé : le sélecteur se réduit à une ligne de résumé.
```
 Fichier : export-linxo.tsv · 42 lignes     [Changer de fichier]

 +--[ 2 comptes à rattacher ]----------------------------------+   (bandeau jaune)
 | Ces comptes n'ont pas encore de correspondance. Choisissez   |
 | le compte de l'app pour pouvoir importer leurs lignes.       |
 |  COMPTE CHEQUE … (x1111)  Banque Test       12 lignes [Choisir un compte… v] |
 |  LIVRET A … (x3333)       Banque Test        3 lignes [Choisir un compte… v] |
 +--------------------------------------------------------------+

 (barre de filtres : voir « Filtrage de l'aperçu » ci-dessous)                Erreurs : 1
 ! Enregistrement 43 : tronqué, non importé.          (alert-box)

 ● Compte principal                              30 lignes · 1 245,60 €   (en-tête de groupe)
 ☐ Date    Libellé / notes                    Montant  Nature         Rattacher à        Mois     État
 ☑ 05 oct. LA CREPERIE EXEMPLE                   2,95  Dépense v      Courses v          oct. v   [Nouveau]
           Paiement par carte X2222 21/10
 ☐ 05 oct. PRLV EDF                             62,00  Dépense v      Choisir… v         oct. v   [À rattacher]
 ☐ 06 oct. VIREMENT …                          188,58  À qualifier v  —                  oct. v   [À qualifier]
 ☐ 07 oct. CARTE BOULANGERIE                     3,40  Dépense v      Courses v          oct. v   [Doublon]
 ☑ 28 sept. COTISATION                           2,50  Dépense v      Frais v            oct. v   [Mois ≠ date]
   Mémoriser la règle « CREPERIE »  (affiché seulement quand une cible est choisie, replié par défaut)

 ○ Livret A                                       3 lignes · 400,00 €    (groupe, replié si aucune action requise)

 ───────────────────────────────────────── barre d'action fixe en bas ─────
 38 lignes prêtes · 3 doublons · 12 entrées ignorées · 5 à compléter     [Annuler] [Importer 38 lignes]
```
Pastilles d'état (chips, une couleur par famille) : Nouveau (neutre), À rattacher / À qualifier / Compte à rattacher (jaune, bloquant), Doublon (gris, décoché), Doublon probable / Semblable déjà importée / Saisie manuelle semblable (bleu, informatif), Mois ≠ date (violet clair), Compte de la box : X (neutre). Une ligne bloquée a un fond jaune très léger ; une ligne décochée est atténuée.

Étape 2, états particuliers : aucun résultat de filtre (« Aucune ligne dans ce filtre. ») ; fichier sans dépense (« Aucune dépense à importer dans ce fichier. N entrées ignorées. ») ; import en cours (bouton « Import… », désactivé).

Vue « Correspondances de comptes » (nouvelle navigation) :
```
 [← Retour à l'import]     Correspondances de comptes                [Fermer l'assistant]
 COMPTE LINXO                  CONNEXION                 COMPTE DE L'APP           
 COMPTE CHEQUE … (x1111)       Banque Test               [Compte principal v]      [Supprimer]
 LIVRET A … (x3333)            Banque Test               [Ne pas importer v]       [Supprimer]
 ENVELOPPE VOYAGE (x9)         Banque Test               [À rattacher v]  (jaune)  [Supprimer]
 Les changements sont enregistrés tout de suite et n'altèrent aucune opération déjà importée.
                                                         [← Retour à l'import]
```
Vide : « Aucune correspondance : elles sont demandées à l'import d'un fichier. »

Étape 3, récapitulatif :
```
 (3) Récapitulatif                                   ✓ 38 lignes importées
  Importées      Dépenses 33 · Retraits 3 · Transferts internes 2
  Ignorées       Doublons 3 · Entrées 12 · Comptes « Ne pas importer » 4 · Décochées/incomplètes 2
  À vérifier     Lignes en erreur 1
                                                          [Fermer]  [Importer un autre fichier]
```

### Impact sur le code livré

- `ImportWizard.tsx` : en-tête de la vue des correspondances (bouton « ← Retour à l'import », libellé sans fichier, « Fermer l'assistant » à la place d'« Annuler »), écoute de la touche Échap limitée à cette vue, recalcul de l'aperçu au retour (RG43), puis refonte visuelle (fil d'étapes, résumé de fichier, filtres, groupes par compte, pastilles d'état, barre d'action fixe, récapitulatif en groupes). Comportement fonctionnel des lignes inchangé.
- `AccountLinks.tsx` : accepte le libellé de retour et signale à l'assistant si une correspondance a changé (pour RG43) ; en-tête et état vide revus.
- `statementImport.ts` : une fonction de rafraîchissement de l'aperçu à partir des correspondances actuelles, qui réutilise le calcul existant (`prepareImport` avec les choix et les lignes précédentes) ; aucune règle d'import modifiée.
- `app.css` : classes de fil d'étapes, bandeau, groupes de compte, pastilles d'état, barre d'action fixe, montants tabulaires. Aucune dépendance.
- Pas de changement de modèle de données, de schéma Supabase ni de migration.
- Tests : test du rafraîchissement (corrections conservées pour les lignes inchangées, lignes d'un compte modifié refaites, couple supprimé revenant dans la bannière, couple enregistré écartant le choix de bannière).

### Critères d'acceptation de l'amendement

- CA36. Given l'assistant avec un fichier chargé, When j'ouvre « Correspondances de comptes », Then un bouton « ← Retour à l'import » est visible en tête, et « Annuler » n'y est pas proposé. (Man)
- CA37. Given la liste ouverte, When je clique « ← Retour à l'import » (en tête ou en bas), Then je retrouve la page d'import avec le fichier, l'aperçu, les corrections de lignes, les cases cochées, les mois choisis, les motifs « Mémoriser » et les choix de la bannière non validés. (Auto sur l'état, Man sur l'écran)
- CA38. Given la liste ouverte, When j'appuie sur Échap, Then je reviens à la page d'import ; Given une liste déroulante ouverte, Then le premier Échap ne referme que la liste déroulante. (Man)
- CA39. Given la page d'import, When j'appuie sur Échap, Then l'assistant reste ouvert. (Man)
- CA40. Given la liste ouverte sans fichier chargé, When je clique « ← Retour », Then je reviens à l'étape 1 et rien n'a été perdu. (Man)
- CA41. Given une correspondance modifiée vers un autre compte dans la liste, When je reviens à l'import, Then les lignes de ce couple prennent le nouveau compte, repartent des propositions par défaut, et les corrections des autres lignes sont conservées. (Auto)
- CA42. Given une correspondance passée à « Ne pas importer », When je reviens, Then les lignes du couple disparaissent de l'aperçu et sont comptées « ignorées ». (Auto)
- CA43. Given une correspondance supprimée, When je reviens, Then le couple est de nouveau dans la bannière « à rattacher » et ses lignes sont non importables. (Auto)
- CA44. Given un choix de bannière non validé pour un couple, When j'enregistre une correspondance pour ce couple dans la liste puis je reviens, Then la correspondance enregistrée est utilisée. (Auto)
- CA45. Given aucune correspondance modifiée, When je reviens, Then l'aperçu est strictement inchangé (corrections comprises). (Auto)
- CA46. Given une correspondance modifiée dans la liste puis « Fermer l'assistant » (avec confirmation si un aperçu non validé existe), Then la modification reste enregistrée et aucune opération n'a été importée. (Man)
- CA47. Given la navigation du navigateur « page précédente », Then le comportement de l'application est inchangé. (Man)
- CA48. Given l'aperçu, Then les montants sont alignés à droite en chiffres tabulaires, les dates sont lisibles (jour et mois), chaque état a sa pastille de couleur, les lignes sont regroupées par compte quand le fichier a plusieurs comptes, et la barre d'action reste visible en défilant. (Man)
- CA49. Given un fichier invalide, un fichier sans dépense, et un filtre sans résultat, Then chacun affiche son message d'état (règles de lecture RG5 et RG29 inchangées). (Man)
- CA50. Aucune règle d'import (RG1 à RG39) ne change : les tests existants de l'import passent sans modification. `npm run build` et les tests passent. (Auto)

### Décisions de design (validées par le développeur)

- D1. Sections par compte (en-tête avec pastille, nombre de lignes, sous-total) quand le fichier contient au moins deux comptes ; tableau simple sinon.
- D2. En tête de la vue des correspondances : « ← Retour à l'import » et un « Fermer l'assistant » discret, avec la confirmation « Abandonner l'import en cours ? Les corrections seront perdues. » si un aperçu non validé existe (RG40).
- D3. Pastilles d'état colorées et filtres (étendus ci-dessous).
- D4. Bouton « Retour » du navigateur inchangé (RG45).
- D5. Barre d'action fixe en bas de page avec les compteurs.
- D6. « Mémoriser la règle » repliée sous la ligne, dépliée par un petit lien « Mémoriser… ».

### Filtrage de l'aperçu (extension demandée par le développeur)

But : traiter plus facilement les lignes récupérées avant import. Les filtres portent sur les lignes de l'aperçu, y compris les lignes décochées. Les lignes de comptes « Ne pas importer » ne sont pas des lignes de l'aperçu : elles sont seulement comptées (RG32), jamais listées. Les entrées d'argent, elles, sont des lignes de l'aperçu depuis l'amendement 4 (RG59), non cochables.

Règles
- RG47. Barre de filtres au-dessus de la liste (sous le bandeau « comptes à rattacher »). Filtres : recherche texte ; compte (couple du fichier / compte résolu) ; état ; nature ; mois de rattachement ; catégorie Linxo. États filtrables : Nouveau, À rattacher, À qualifier, Compte à rattacher, Doublon, Doublon probable, Semblable déjà importée, Saisie manuelle semblable, Mois différent de la date, Décochée.
- RG48. Combinaison : les filtres de familles différentes se combinent par ET ; dans une même famille, les valeurs choisies se combinent par OU (par exemple États « À rattacher » ou « À qualifier »).
- RG49. Recherche texte : insensible à la casse et aux accents, sur le libellé et les notes ; plusieurs mots = tous doivent être présents (ET). Le filtre de catégorie Linxo utilise la catégorie lue du fichier (RG37).
- RG50. Compteurs : chaque valeur de filtre affiche le nombre de lignes de l'aperçu qui y correspondent, calculé sur l'ensemble des lignes de l'aperçu, quels que soient les autres filtres actifs. Un compteur global indique « N lignes affichées sur M ».
- RG51. « Effacer les filtres » remet tous les filtres à zéro ; il est visible dès qu'un filtre est actif.
- RG52. [AMENDÉE par RG68 (amendement 5) : un filtre actif limite désormais l'import aux lignes affichées cochées ; ce texte décrit l'ancien comportement] Les filtres ne changent PAS ce qui sera importé : seules les cases cochées et complètes comptent, y compris les lignes masquées par un filtre. L'interface le dit : un message « N lignes masquées par les filtres, dont K cochées, seront importées quand même » près de la barre d'action, et le compteur du bouton « Importer N lignes » reste celui de toutes les lignes. Le récapitulatif ne parle pas des filtres.
- RG53. État vide : si aucune ligne ne correspond, « Aucune ligne ne correspond aux filtres. [Effacer les filtres] ». Les groupes de comptes sans ligne affichée sont masqués.
- RG54. Conservation : les filtres sont conservés (comme le reste de l'état, RG42) au retour depuis la vue des correspondances. Après le recalcul de RG43, les filtres restent appliqués ; une valeur de filtre qui n'existe plus (compte retiré, par exemple) est retirée du filtre. Un nouveau fichier remet les filtres à zéro.
- RG55. Une ligne modifiée par l'utilisateur qui ne correspond plus au filtre actif (par exemple une ligne « À rattacher » qui vient d'être rattachée) reste affichée jusqu'à ce que les filtres changent, pour ne pas la faire disparaître sous la main.
- RG56. Cocher : « Tout cocher » et « Tout décocher » agissent sur les lignes affichées par le filtre (jamais sur les lignes masquées) ; une ligne incomplète ou « Compte à rattacher » ne devient pas importable pour autant (RG17). Doublons : cocher un doublon reste le forçage de RG22.
- RG57. Traitement en masse : « Appliquer à N lignes affichées » permet de choisir une nature, une cible (ligne `var`, enveloppe ou compte de destination selon la nature) et/ou un mois de rattachement, appliqués aux lignes affichées éligibles. Une ligne pour laquelle la valeur est invalide (cible incompatible avec son compte ou son mois, nature impossible) est laissée telle quelle, et un message indique « K lignes non modifiées ». Une confirmation annonce le nombre de lignes modifiées avant application. L'action peut être annulée par « Annuler la dernière modification en masse » tant que l'import n'est pas validé.
- RG58. Performance : le filtrage et les compteurs se calculent en mémoire sur l'aperçu (jusqu'à environ 200 lignes) sans lenteur perceptible à la frappe (moins de 100 ms de ressenti) ; la recherche texte s'applique à la frappe, sans bouton.

Wireframe de la barre de filtres (remplace la ligne « Filtre » du wireframe de l'étape 2)
```
 Rechercher [ edf________ ]  Compte [Tous v]  Nature [Toutes v]  Mois [Tous v]  Catégorie [Toutes v]
 État : [Tous 42] [Nouveau 30] [À rattacher 5] [À qualifier 1] [Doublon 3] [Semblable 2] [Décochée 4] [Mois ≠ date 1]
 5 lignes affichées sur 42 · [Effacer les filtres]
 (info) 37 lignes masquées, dont 33 cochées, seront importées quand même.
 [Tout cocher] [Tout décocher]   [Appliquer à 5 lignes affichées…]   [Annuler la dernière modification en masse]
```
Vide : « Aucune ligne ne correspond aux filtres. [Effacer les filtres] »

Impact sur le code livré (ajouts)
- `statementImport.ts` : fonctions pures et testables : famille d'états d'une ligne (liste des états, partagée avec l'affichage), `filterLines(lines, filters)` (ET/OU, texte sans accents ni casse, catégorie), `filterCounts(lines, filters)`, `applyBulk(d, lines, ids, {nature?, target?, month?})`, `setChecked(lines, ids, checked)`. Aucune de ces fonctions ne touche `validateImport` ni `previewCounts`.
- `ImportWizard.tsx` : état des filtres conservé avec l'état de l'assistant (RG54), barre de filtres, message RG52, boutons de cochage, action en masse et son annulation (une seule action annulable, la dernière).
- `app.css` : barre de filtres, pastilles-filtres avec compteur, message d'information.
- Pas de changement de modèle, de schéma ni de dépendance.

Critères d'acceptation (ajouts)
- CA51. Given un aperçu de plusieurs états, When je choisis le filtre d'état « À rattacher », Then seules ces lignes sont affichées et le compteur indique « N lignes affichées sur M ». (Auto sur `filterLines`, Man sur l'écran)
- CA52. Given deux filtres de familles différentes (compte = A, état = Doublon), Then seules les lignes qui satisfont les deux sont affichées ; Given deux états dans la même famille, Then celles qui satisfont l'un ou l'autre. (Auto)
- CA53. Given la recherche « cafe », When une ligne a « CAFÉ » en libellé ou en notes, Then elle correspond (insensible à la casse et aux accents) ; Given « edf prelev », Then seules les lignes contenant les deux mots correspondent. (Auto)
- CA54. Given le filtre de catégorie « Remb. prêt conso », Then seules les lignes de cette catégorie Linxo sont affichées. (Auto)
- CA55. Given des compteurs de filtre, Then chaque valeur affiche le nombre de lignes de l'aperçu correspondantes ; Given « Effacer les filtres », Then toutes les lignes reviennent et les compteurs aussi. (Auto)
- CA56. [REMPLACÉ par CA72 et CA73 (amendement 5)] Given 33 lignes cochées masquées par un filtre, When je valide l'import, Then elles sont importées avec les autres et le compteur du bouton les inclut ; Given le récapitulatif, Then il n'évoque pas les filtres. (Auto sur `previewCounts` et `validateImport`, Man sur l'écran)
- CA57. Given un filtre actif qui masque des lignes cochées, Then le message de RG52 est visible avec les nombres exacts. (Man)
- CA58. Given un filtre sans résultat, Then « Aucune ligne ne correspond aux filtres » et le bouton « Effacer les filtres » s'affichent. (Man)
- CA59. Given un filtre actif, When j'ouvre les correspondances de comptes puis reviens, Then le filtre est conservé ; Given que le recalcul retire un compte du filtre, Then cette valeur est retirée sans erreur. (Auto sur la conservation, Man sur l'écran)
- CA60. Given « Tout décocher » avec un filtre actif, Then seules les lignes affichées sont décochées ; Given « Tout cocher », Then une ligne incomplète reste non importable. (Auto)
- CA61. Given 5 lignes affichées et la nature « Retrait » à appliquer, Then les lignes éligibles passent à Retrait avec leur destination par défaut, les autres sont laissées telles quelles et le message « K lignes non modifiées » s'affiche ; Given « Annuler la dernière modification en masse », Then l'état précédent est restauré. (Auto)
- CA62. Given 200 lignes, When je tape dans la recherche, Then l'affichage se met à jour sans retard perceptible. (Man)

### Décisions de filtrage (validées par le développeur)

- Étendue : recherche texte, compte, état, nature, mois de rattachement, catégorie Linxo. Pas de fourchettes de montant ni de date.
- Traitement en masse inclus (RG56, RG57), avec confirmation et annulation de la dernière action.
- Une ligne modifiée qui sort du filtre reste affichée jusqu'au prochain changement de filtre (RG55).
- Compteurs calculés sur toutes les lignes de l'aperçu (RG50).
- Les lignes de comptes « Ne pas importer » sont seulement comptées, jamais listées. [Amendé par l'amendement 4 : les entrées d'argent sont désormais listées, non cochables et non importables.]

## Amendement 4 — entrées d'argent visibles dans l'aperçu (implémenté)

Demande du développeur : « Je ne vois pas les revenus (versement sur le compte via l'import) ». Il veut VOIR les entrées d'argent (revenus, versements, virements reçus) dans l'aperçu. Décision : visibilité seule dans la 0013 ; l'import réel des revenus et la date bancaire sont la spec 0015.

Cet amendement CHANGE l'ancienne décision « les crédits sont seulement comptés, jamais listés » : elle concernait RG8 (crédits non importés), RG10c / RG36 (crédits ignorés) et la décision de filtrage « jamais listées ». Les entrées sont désormais des lignes de l'aperçu, jamais importées. Le reste de RG8, RG10c et RG36 (aucun crédit n'est écrit dans les données) est inchangé.

### Constat sur le code livré

`prepareImport` ne garde que les lignes `direction === 'debit'` et compte les crédits dans `ignoredCredits` ; `validateImport` n'écrit que des `Transaction` (dépenses) et des `AccountMovement`. Il n'existe aucune écriture « entrée d'argent » libre dans le modèle (voir spec 0015).

### Règles de l'amendement

- RG59. Les crédits du fichier (montants positifs) sont des lignes de l'aperçu, avec l'état « Entrée d'argent » (pastille propre, couleur verte discrète), placées dans leur groupe de compte comme les débits et triées par date avec eux. Les lignes de comptes réglés sur « Ne pas importer » et les lignes d'un compte non rattaché suivent RG32 : une entrée d'un compte « Ne pas importer » n'est pas listée ; une entrée d'un compte non rattaché est listée avec l'état « Compte à rattacher » comme un débit.
- RG60. Une ligne « Entrée d'argent » est décochée, sa case est désactivée (non cochable) et elle n'est jamais importée : elle ne compte ni dans « Importer N lignes » ni dans « à compléter ». Aucune nature, cible ni destination n'est demandée ; ces colonnes sont vides (—). « Tout cocher » (RG56) et l'action en masse (RG57) ne la modifient pas.
- RG61. Montants : une entrée s'affiche avec son montant positif, précédé de « + », en vert discret ; les débits gardent leur affichage actuel.
- RG62. Indice « Virement reçu » : une entrée dont le libellé ou les notes contiennent un mot de virement (par exemple « virement », « vir ») affiche en plus l'indice « Virement reçu : le mouvement vient du débit de l'autre compte ». L'indice est informatif, ne qualifie rien et ne tranche pas entre virement interne et vrai revenu (qualification dans la spec 0015).
- RG63. Le filtre d'état (RG47) gagne « Entrée d'argent » et son compteur ; la recherche texte, le compte, le mois, la catégorie Linxo et la nature s'appliquent aux entrées (la nature d'une entrée est « — » : un filtre de nature n'en renvoie aucune).
- RG64. Message RG52 : les entrées d'argent ne sont jamais « cochées » ; elles n'entrent donc pas dans « K cochées seront importées quand même ». Le message mentionne seulement les lignes masquées.
- RG65. Récapitulatif : la ligne « Entrées ignorées » devient « Entrées d'argent (non importées) » et garde son compteur (nombre d'entrées de l'aperçu, hors comptes « Ne pas importer »). L'aperçu affiche aussi le total des entrées (« +N € en N lignes ») dans l'en-tête de l'aperçu et dans l'en-tête de chaque groupe de compte.
- RG66. Déduplication : les entrées n'étant pas importées, elles n'ont ni empreinte stockée ni rang et ne sont jamais « Doublon ». Rien n'est écrit pour elles.
- RG67. Aucun changement de modèle, de schéma ni de règle mémorisée. Les entrées ne participent pas à la proposition de cible ni à « Mémoriser la règle ».

### Wireframes

```
 Filtre état : [Tous 54] [Nouveau 30] [À rattacher 5] [Doublon 3] [Entrée d'argent 12] [Décochée 4] …
 ● Compte principal            30 dépenses · 12 entrées (+4 120,00 €) · 1 245,60 € de dépenses
 ☐ Date    Libellé / notes                   Montant   Nature   Rattacher à   Mois    État
 ☑ 05 oct. LA CREPERIE EXEMPLE                  2,95   Dépense v  Courses v   oct. v  [Nouveau]
 ▫ 22 oct. EN VOTRE FAVEUR Envoi cagnotte…  +1 600,00  —         —             oct.    [Entrée d'argent]
           VIREMENT EN VOTRE FAVEUR…                                                  Virement reçu : le mouvement vient du débit de l'autre compte
 ▫ 22 oct. REALISATION DE PRET … DEBLOCAGE   +217,80   —         —             oct.    [Entrée d'argent]
```
(▫ = case désactivée, ligne atténuée.)
Récapitulatif : `Entrées d'argent (non importées)   12`.

### Impact sur le code livré

- `statementImport.ts` : `prepareImport` ajoute les crédits comme lignes (état dédié, `checked` faux, non cochables) ; `previewCounts`, `lineProblem` et `validateImport` les ignorent (aucune écriture) ; les fonctions de filtrage et de cochage (amendement 3) les traitent comme des lignes non cochables ; indice « virement reçu » en fonction pure.
- `ImportWizard.tsx` : pastille, case désactivée, montant « + » vert, colonnes vides, filtre « Entrée d'argent », totaux des groupes, libellé du récapitulatif.
- `app.css` : pastille verte, ligne atténuée, case désactivée.
- Aucun changement de modèle, de schéma Supabase ni de dépendance.
- Tests : `prepareImport` liste les crédits non cochables ; `validateImport` n'écrit rien pour eux ; filtre d'état « Entrée d'argent ».

### Critères d'acceptation de l'amendement

- CA63. Given un fichier avec des débits et des crédits, When j'ouvre l'aperçu, Then les crédits sont des lignes avec la pastille « Entrée d'argent », un montant « + » positif, décochées, sans case cliquable, avec nature et cible vides. (Auto sur `prepareImport`, Man sur l'écran)
- CA64. Given des entrées listées, When je clique « Importer N lignes », Then aucune entrée n'est écrite et N ne les compte pas. (Auto)
- CA65. Given « Tout cocher » ou l'action en masse, Then les entrées ne sont ni cochées ni modifiées. (Auto)
- CA66. Given le filtre d'état « Entrée d'argent », Then seules les entrées sont affichées et le compteur du filtre est exact ; Given la recherche « cagnotte », Then l'entrée correspondante s'affiche. (Auto sur le filtrage, Man sur l'écran)
- CA67. Given une entrée dont le libellé évoque un virement, Then l'indice « Virement reçu : le mouvement vient du débit de l'autre compte » est affiché, sans qualification ni case. (Auto sur la fonction, Man sur l'écran)
- CA68. Given un compte réglé sur « Ne pas importer », Then ses entrées ne sont pas listées ; Given un compte non rattaché, Then ses entrées sont listées avec « Compte à rattacher » sans bloquer l'import des autres lignes. (Auto)
- CA69. Given le récapitulatif, Then « Entrées d'argent (non importées) » affiche le nombre d'entrées de l'aperçu, et l'en-tête de l'aperçu et des groupes affiche leur total. (Auto sur les compteurs, Man sur l'écran)
- CA70. Given un réimport du même fichier, Then les entrées restent listées sans « Doublon » et rien n'est écrit. (Auto)
- CA71. Les règles d'import des débits (RG1 à RG39, RG47 à RG58 sauf RG52 amendée par RG64) ne changent pas ; `npm run build` et les tests passent. (Auto)


## Suite prévue : dépenses sur lignes fixes et crédits (spec 0014, hors périmètre)

Le développeur veut pouvoir rattacher une ligne importée à une ligne fixe (`fix`) ou crédit (`cre`, remboursements et assurances de prêt : des sorties d'argent) du budget, indépendamment du pointage, pour que le solde réel tienne compte des prélèvements. Décision : la 0013 est livrée telle quelle, avec les cibles `var` et enveloppes uniquement (RG15 inchangée). Ce besoin est traité par la spec `0014-depenses-lignes-fixes-et-credits.md` (modèle de saisie, Ledger, « Reste à sortir », schéma, import et saisie manuelle). Le code de la 0013 n'est pas modifié ici ; la 0014 listera son impact sur lui.

## Questions ouvertes

Aucune question bloquante, y compris sur l'amendement 1. Le développeur a confirmé : mouvement entre comptes créé dans cette spec, P7, dépenses sur lignes fixes et crédits en spec 0014, revenus et date bancaire en spec 0015, double pointage en spec 0017. Points proposés (tranchés par défaut pour avancer), à confirmer à la validation de la spec :
- P1. Virement émis : « À qualifier », signalé, décoché et non importable tant que le développeur n'a pas choisi interne ou externe (RG10). Validé sur le principe par le développeur.
- P2. Avoirs et tous les crédits : ignorés, jamais rattachés à une dépense pour la réduire (RG8).
- P3 (remplacé par décision du développeur). Retrait au distributeur : qualifié Retrait, destination proposée Espèces, modifiable ligne par ligne (RG9, RG10, RG10a).
- P4 (confirmé). Encodage : UTF-8 (BOM toléré) avec repli Windows-1252 (RG2, RG30).
- P5. Mois de rattachement : mois existant et non clos uniquement ; aucun mois créé par l'import (RG12, RG13).
- P6 (amendé par le développeur). Dépense vers une ligne `var` : compte attribué de la box, sinon compte d'import (RG19).
- P7 (confirmé par le développeur). Un retrait ou transfert vers une enveloppe change seulement le solde de son compte, sans toucher à son allocation du mois (RG10b). Risque connu et accepté : double compte si l'enveloppe est aussi alimentée par son allocation pointée.

## Amendement 5 — import progressif, par lots (implémenté)

Retour du développeur au test manuel des amendements 3 et 4 : « Je dois pouvoir importer au fur et à mesure les dépenses/entrées suite à un import. Exemple : si je filtre sur un compte, avec 2 lignes cochées, je dois pouvoir importer ces deux lignes uniquement et le compte est considéré comme traité et ne s'affiche plus (ou le marquer explicitement suite aux imports). » Cet amendement CHANGE le comportement validé plus tôt : il AMENDE RG52 (les lignes masquées par un filtre étaient importées avec les autres), CA56, et le flux « étape 2 puis étape 3 » (l'import n'enchaîne plus automatiquement sur le récapitulatif). Les règles RG1 à RG51 et RG53 à RG67 non citées ne changent pas. Toutes les décisions de cet amendement sont validées par le développeur (voir « Décisions de l'import progressif »).

### Constat sur le code livré (vérifié)

- `validateImport(d, preview, newId)` importe TOUTES les lignes `checked` et complètes de l'aperçu, filtre ou non (`chosen`), écrit les règles mémorisées des lignes importées, puis écrit les correspondances de comptes choisies dans la bannière pour TOUS les couples (`preview.pairs` avec un choix), même ceux dont aucune ligne n'est importée. Il ne connaît ni les filtres ni les lignes « déjà importées pendant la session ».
- `ImportWizard.confirm` appelle `validateImport` deux fois (sur une copie pour le récapitulatif, puis dans le store), pose `summary`, et l'assistant passe aussitôt à l'étape 3 : l'aperçu et ses filtres sont perdus ; le bouton n'existe plus. `previewCounts.toImport` compte toutes les lignes cochées complètes.
- Après une écriture, les lignes importées ressortiraient « Doublon » à la prochaine préparation de l'aperçu (déduplication par compte d'import, empreinte et rang) : l'état « déjà importé » est donc retrouvable sans stockage supplémentaire. Mais l'aperçu courant n'est pas recalculé : une seconde pression sur « Importer » écrirait les mêmes lignes une deuxième fois (risque de double import).

### Règles de l'amendement

- RG68. [Amende RG52] Portée de l'import. « Importer N lignes » importe désormais les lignes cochées, complètes ET affichées par le filtre actif. Une ligne masquée par un filtre n'est jamais importée par ce bouton, même cochée ; elle reste cochée et intacte. Quand un filtre masque des lignes cochées, un second bouton « Importer toutes les cochées (M) » importe aussi les lignes masquées (comportement antérieur), avec une confirmation qui annonce M. Sans filtre actif, les deux boutons n'en font qu'un, « Importer N lignes ». Le message de RG52 devient « K lignes cochées sont masquées par les filtres : ce bouton ne les importe pas. »
- RG69. [Amende le flux étapes 2 puis 3] Un import n'enchaîne plus sur le récapitulatif : l'assistant reste sur l'aperçu, avec les filtres, les corrections et la vue conservés. Le récapitulatif est atteint seulement par « Terminer l'import » (visible dès qu'au moins un import a eu lieu) et devient un cumul de toute la session.
- RG70. Après un import partiel, chaque ligne importée est marquée « Importée » (pastille grise, case désactivée, non modifiable) et, par défaut, n'apparaît plus dans la liste : elle reste filtrable par l'état « Importée » (compteur inclus) et un bandeau « N lignes importées pendant cette session » donne le cumul.
- RG71. État « traité » d'un compte (section de compte ou couple du fichier). Un compte est « traité » (dérivé) quand il ne lui reste aucune ligne à traiter, c'est-à-dire que toutes ses lignes de dépense, retrait ou transfert sont « Importée » ou déjà importées avant (« Doublon » non forcé). Les entrées d'argent (RG59) n'empêchent pas un compte d'être traité. Un compte traité est replié en une ligne (« Compte principal · traité · 12 importées ») et masqué de la liste par défaut ; une case « Afficher les comptes traités » le rouvre. Les lignes décochées volontairement (non importées) laissent le compte « à traiter » avec le compteur « N lignes restantes ».
- RG72. Marquage explicite. Chaque section de compte propose « Marquer comme traité » (et « Rouvrir ») : il replie le compte même s'il reste des lignes décochées ou non importées, qui ne seront pas importées ni comptées dans « à compléter » tant que le compte est marqué. Ce marquage vit dans l'état de l'assistant (session) : il n'est pas stocké.
- RG73. Persistance. Rien de nouveau n'est stocké pour retrouver l'état traité. Si l'assistant est fermé puis rouvert avec le même fichier, les lignes déjà importées ressortent « Doublon » (déduplication) : un compte entièrement importé s'affiche donc « traité » par la règle dérivée de RG71 ; les marquages explicites de RG72 sont perdus. Pas de nouvelle table ni de migration.
- RG74. Correspondances de comptes et règles. Les règles mémorisées sont écrites pour les lignes importées du lot, comme avant. Une correspondance vers un compte, choisie dans la bannière, n'est écrite qu'à l'import d'au moins une ligne de ce couple ; les couples rattachés sans ligne importée restent non enregistrés (RG25). [Corrigé] Un choix « Ne pas importer » fait dans la bannière est, lui, mémorisé (écrit comme correspondance sans compte) dès qu'au moins un lot a été importé dans la session, ou à « Terminer l'import » ; avant cela il reste non enregistré. Une fois mémorisé, il ne compte plus comme « correction en attente » pour la fermeture (RG79).
- RG75. Après chaque import : l'aperçu est recalculé avec les données à jour (comme au retour des correspondances, RG43) ; les corrections des lignes non importées sont conservées ; les filtres sont conservés (RG54) ; l'annulation de l'action en masse (RG57) est abandonnée ; les lignes modifiées gardées visibles (RG55) sont libérées. Les couples désormais enregistrés ne reviennent pas dans la bannière.
- RG76. Mois clos et refus. [Corrigé] Une ligne dont le mois de rattachement est clos, antérieur au premier mois ou non créé est bloquée AVANT l'écriture (« Choisir un mois ouvert », RG12) : elle reste dans l'aperçu, n'est pas marquée « Importée » et est comptée parmi les lignes « décochées ou incomplètes » du récapitulatif cumulé, pas « en erreur ». Seul un refus d'écriture par le budget malgré une ligne complète (cas défensif, non reproductible en usage normal) est compté « en erreur » : la ligne reste dans l'aperçu avec la pastille « Refusée par le budget » et n'est pas marquée « Importée ».
- RG77. Double import. Pendant un import, le bouton est désactivé. Les lignes d'un lot sont marquées « Importée » dans le même temps que l'écriture ; `validateImport` ignore toute ligne déjà importée dans la session et toute ligne non forcée dont (compte d'import, empreinte, rang) existe déjà dans les données (idempotence par déduplication). Un second clic ou un lot rejoué n'écrit rien de plus.
- RG78. Confirmation et annulation. Un import partiel n'ouvre pas de fenêtre de confirmation (sauf « Importer toutes les cochées » quand elle dépasse la sélection affichée, RG68). Le résultat est affiché dans le bandeau de session (« 2 dépenses importées »). L'annulation d'un import validé reste hors périmètre (suppression à la main, mouvements gérés par le bloc « Mouvements entre comptes »).
- RG79. Fermer l'assistant : si au moins un import a eu lieu et qu'aucune correction n'est en attente, fermer ne demande rien ; s'il reste des corrections non importées, la confirmation « Abandonner l'import en cours ? Les corrections seront perdues. » reste demandée (RG40) en précisant que les lignes déjà importées sont conservées. [Corrigé] « Annuler » dans la barre d'action du bas, dès qu'au moins une ligne est importée, suit exactement la même logique que « Fermer l'assistant » (confirmation seulement s'il reste des corrections en attente). Un choix « Ne pas importer » déjà mémorisé (RG74) n'est pas une correction en attente.
- RG81. [Nouveau] Changer de fichier après au moins un import : avant de remettre la session à zéro (aperçu, filtres, marquages, cumul), un message avec confirmation s'affiche : « Le cumul de la session sera perdu sans récapitulatif ; les lignes déjà importées restent enregistrées. » Annuler garde le fichier et la session en cours. Sans import dans la session, « Changer de fichier » reste immédiat comme avant.
- RG80. Récapitulatif cumulé : mêmes groupes que l'étape 3 actuelle, additionnés sur tous les imports de la session (dépenses, retraits, transferts internes, doublons ignorés, entrées d'argent non importées, comptes « Ne pas importer », décochées ou incomplètes au moment de terminer, erreurs). Une ligne importée n'est comptée qu'une fois.

### Wireframes

```
 Importer des dépenses     (1) Fichier ── (2) Aperçu ── (3) Récapitulatif                [Correspondances] [Fermer l'assistant]
 (info) 14 lignes importées pendant cette session · dernier import : 2 dépenses            [Voir seulement les lignes importées]
 Filtre compte : [Compte principal v]    5 lignes affichées sur 28 · [Effacer les filtres]    ☐ Afficher les comptes traités
 ● Compte principal  2 lignes restantes                                   [Marquer comme traité]
 ☑ 05 oct. LA CREPERIE EXEMPLE            2,95  Dépense v  Courses v   oct. v  [Nouveau]
 ☑ 06 oct. PRLV EDF                      62,00  Dépense v  Choisir… v oct. v  [À rattacher]
 ✓ Livret A · traité · 3 importées                                       [Rouvrir]   (ligne repliée)
 ─────────────────────────────── barre d'action fixe ───────────────────────────────
 K=0 cochée masquée      [Terminer l'import]        [Importer 1 ligne affichée cochée]
 Avec un filtre actif qui masque des lignes cochées :
 « 6 lignes cochées sont masquées par les filtres : ce bouton ne les importe pas. »
 [Importer 2 lignes affichées cochées]   [Importer toutes les cochées (8)…]
```
Ligne importée (visible via le filtre d'état) : `☐(désactivée) 05 oct. LA CREPERIE EXEMPLE  2,95  [Importée]` en gris.
États : aucun import (comme aujourd'hui), après import(s), tous comptes traités (« Tout est traité. [Terminer l'import] »), erreur de ligne (RG76).

### Impact sur le code livré

- `statementImport.ts` : `validateImport` reçoit la sélection de lignes à importer (identifiants), ignore les lignes déjà importées et les non forcées déjà présentes (RG77), n'écrit que les correspondances des couples dont une ligne est importée (RG74), et renvoie le détail du lot ; `previewCounts` distingue lignes cochées complètes affichées et totales (RG68) ; nouvelle fonction pure d'état « traité » d'un compte (RG71) et de comptage des lignes restantes ; l'état « Importée » rejoint les états filtrables.
- `importFilters.ts` : état « Importée », sélection des lignes affichées cochées, masquage des comptes traités.
- `ImportWizard.tsx` : état de session (identifiants importés, comptes marqués, cumul), deux boutons d'import, bouton « Terminer l'import », bandeau de session, lignes de compte repliées, bouton désactivé pendant l'import, plus d'enchaînement automatique sur l'étape 3, récapitulatif cumulé, fermeture selon RG79.
- `app.css` : pastille « Importée », section repliée, bandeau de session.
- Le bouton « Voir seulement les lignes importées » active le filtre d'état « Importée » (il ne montre que ces lignes).
- Note : le drapeau `importing` du bouton d'import est une garde défensive (l'import est synchrone) ; la protection réelle contre le double import est `busy` plus l'idempotence de `validateImport` (RG77).
- `ImportWizard.tsx` : « Annuler » de la barre du bas et « Changer de fichier » passent par les confirmations de RG79 et RG81.
- Pas de changement de modèle, de schéma ni de dépendance ; aucune table nouvelle.

### Critères d'acceptation de l'amendement

- CA72. [Amende CA56] Given 8 lignes cochées dont 2 affichées par le filtre « Compte principal », When je clique « Importer 2 lignes affichées cochées », Then seules ces 2 lignes sont écrites ; les 6 autres restent cochées et non importées. (Auto sur `validateImport`, Man sur l'écran)
- CA73. Given un filtre actif masquant des lignes cochées, Then le message « K lignes cochées sont masquées par les filtres : ce bouton ne les importe pas. » et le bouton « Importer toutes les cochées (M) » sont visibles ; When je clique ce dernier, Then une confirmation annonce M et, confirmée, importe aussi les lignes masquées. (Auto, Man)
- CA74. Given aucun filtre actif, Then un seul bouton « Importer N lignes » importe toutes les cochées complètes. (Auto)
- CA75. Given un import partiel, When il se termine, Then l'assistant reste sur l'aperçu avec ses filtres et ses corrections, et non sur le récapitulatif. (Man)
- CA76. Given un import de 2 lignes, Then ces lignes sont « Importée », non cochables, absentes de la liste par défaut, présentes via le filtre d'état « Importée », et le bandeau indique le cumul. (Auto sur l'état, Man sur l'écran)
- CA77. Given un compte dont toutes les lignes sont importées ou déjà importées, Then il est « traité » : replié en une ligne, masqué par défaut, réaffiché par « Afficher les comptes traités ». Given des entrées d'argent restantes, Then il reste traité. (Auto)
- CA78. Given un compte avec une ligne décochée volontairement, Then il n'est pas traité et affiche « 1 ligne restante » ; When je clique « Marquer comme traité », Then il se replie ; « Rouvrir » le rétablit. (Auto, Man)
- CA79. Given l'assistant fermé puis rouvert avec le même fichier, Then les lignes importées sont des doublons, un compte entièrement importé s'affiche traité, et les marquages explicites sont perdus. (Auto sur la dérivation, Man)
- CA80. Given un couple rattaché à un compte dans la bannière sans ligne importée, When j'importe les lignes d'un autre compte, Then la correspondance de ce couple n'est pas enregistrée ; Given une ligne de ce couple importée, Then elle l'est. (Auto)
- CA80a. Given un couple choisi « Ne pas importer » dans la bannière, When je n'ai encore importé aucun lot, Then rien n'est enregistré ; When j'importe un lot (ou clique « Terminer l'import »), Then la correspondance sans compte est enregistrée, et fermer ensuite l'assistant ne demande pas de confirmation à cause de ce choix. (Auto)
- CA81. Given les règles « Mémoriser » cochées sur des lignes importées, Then seules ces règles sont écrites. (Auto)
- CA82. Given un double clic sur « Importer » ou un lot rejoué, Then les lignes ne sont écrites qu'une fois ; le bouton est désactivé pendant l'import. (Auto sur l'idempotence, Man sur le bouton)
- CA83. Given une ligne dont le mois est clos, antérieur au premier mois ou non créé, Then elle est bloquée avant l'écriture (« Choisir un mois ouvert »), reste dans l'aperçu, n'est pas « Importée » et est comptée parmi les lignes décochées ou incomplètes du cumul, pas en erreur. Given un refus d'écriture par le budget sur une ligne complète (cas défensif), Then la ligne reste dans l'aperçu avec la pastille « Refusée par le budget », n'est pas « Importée » et est comptée en erreur. (Auto)
- CA84. Given deux imports successifs, When je clique « Terminer l'import », Then le récapitulatif cumule les deux lots et ne compte chaque ligne qu'une fois. (Auto sur le cumul, Man)
- CA85. Given l'assistant après import sans correction en attente, When je ferme ou clique « Annuler » dans la barre du bas, Then aucune confirmation ; Given une correction non importée, Then la même confirmation s'affiche dans les deux cas et précise que les lignes déjà importées sont conservées. (Man)
- CA85a. Given au moins un import dans la session, When je clique « Changer de fichier », Then le message « Le cumul de la session sera perdu sans récapitulatif ; les lignes déjà importées restent enregistrées. » demande confirmation ; annuler garde la session, confirmer la remet à zéro ; Given aucun import, Then le changement est immédiat. (Man)
- CA85b. Given le bandeau de session, When je clique « Voir seulement les lignes importées », Then seul le filtre d'état « Importée » est actif et seules ces lignes sont affichées. (Auto, Man)
- CA86. Les règles d'import des lignes (RG1 à RG39) ne changent pas ; les tests existants de l'import passent, sauf CA56 remplacé par CA72 ; `npm run build` et les tests passent. (Auto)

### Décisions de l'import progressif (validées par le développeur)

- Portée : un filtre actif limite l'import aux lignes affichées cochées ; un second bouton « Importer toutes les cochées (M) » demande une confirmation ; sans filtre, un seul bouton (RG68).
- Lignes importées : masquées par défaut, état « Importée » filtrable, bandeau de cumul (RG70).
- Compte « traité » : dérivé (lignes importées ou déjà importées, entrées d'argent exclues du calcul) plus marquage explicite en session, replié et masqué par défaut (RG71 à RG73).
- Sortie de l'aperçu : le récapitulatif ne s'ouvre que par « Terminer l'import » (RG69).
- Ni confirmation ni annulation d'un import partiel ; bouton désactivé pendant l'import ; double clic sans effet (RG77, RG78).
- Correspondances de comptes rattachées et règles mémorisées enregistrées seulement pour les couples et lignes effectivement importés ; un choix « Ne pas importer » est mémorisé dès le premier lot ou à « Terminer l'import » (RG74).

## Suite prévue : revenus, entrées d'argent et date bancaire (spec 0015, hors périmètre)

L'import réel des entrées d'argent (rattachement à une ligne de revenu `rev`, avec le principe de la 0014) et une date bancaire réelle distincte du mois de rattachement, pour TOUTES les écritures (dépenses, retraits, mouvements, revenus), sont la spec `0015-revenus-entrees-et-date-bancaire.md`, après la 0014. La qualification des virements reçus (« Revenu » quand l'autre compte n'est pas dans l'export) y est traitée. La 0013 ne fait que les montrer (amendement 4).

## Suite prévue : double pointage (spec 0017, hors périmètre)

Décidé par le développeur : le « double pointage » sera une spec séparée (0017, après la 0016), avec un rapprochement automatique modifiable à la main. Il n'est pas rédigé ici. Raison : il modifie le modèle de pointage de la spec 0009 (cases, couleurs, mode de mois, `LineCheck`) et touche chaque écran qui affiche une case. Idée de départ : une écriture importée apparaît « importée » dans une couleur, et devient « validée » dans une autre quand un mouvement saisi et enregistré lui correspond.

Ce que la 0013 garde pour le brancher : l'empreinte et le rang de chaque transaction et de chaque mouvement entre comptes importés (RG20, RG24), qui identifient une écriture comme venant de la banque et la rendent retrouvable. Aucune autre préparation n'est faite ici.
