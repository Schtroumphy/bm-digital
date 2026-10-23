# 0014 — Dépenses sur lignes fixes et crédits

- Statut : brouillon prêt pour validation. Implémentation : APRÈS la livraison de la 0013.
- Date : 2026-10-23
- Branche prévue : feat/depenses_lignes_fixes_credits

## Contexte et objectif

Aujourd'hui une dépense saisie ou importée ne peut se rattacher qu'à une ligne variable (`var`), à une enveloppe ou à un retrait d'épargne (`epa`). Les prélèvements (EDF, assurance, abonnement) et les remboursements de crédit, qui sont des lignes des blocs `fix` et `cre`, n'ont qu'un « réel » saisi à la main et un pointage « l'argent a bougé » (spec 0009).

Le développeur veut rattacher une dépense à une ligne fixe ou crédit, par saisie manuelle comme par import (spec 0013). Sa raison : la saisie de dépense et le pointage sont indépendants, et le solde réel (de référence) doit refléter les dépenses et prélèvements réellement passés.

« Crédits » = le bloc `cre` (remboursements de prêts, assurances de prêt : des sorties d'argent). Les entrées d'argent (bloc `rev`) ne sont pas concernées : elles restent ignorées à l'import (spec 0013, RG8).

## Principe directeur (précisé par le développeur)

« La partie budget avec pointage et réel n'est qu'informatif. C'est la partie dépense et compte qui est la réalité. On verra comment lier les deux pour avoir l'info niveau budget et suivre les véritables sorties (peut-être une couleur de pointage différente) mais le budget est une information + estimation, quand le reste est le suivi réel avec de vraies données. »

Conséquences :
- Les soldes des comptes se calculent à partir des dépenses (RG9). Le pointage et « Reste à sortir » restent des indicateurs budgétaires, non modifiés par les dépenses (RG10, RG13).
- Le réel de la ligne est alimenté par ses dépenses ; un réel saisi est remplacé après confirmation (RG5, RG6).
- Le lien budget ↔ réalité (pointage « confirmé par une dépense », couleur différente, indicateur de marge réelle) est renvoyé à la spec 0017.

## Périmètre

Inclus :
- Nouvelle cible de dépense : une ligne des blocs `fix` et `cre` du mois.
- Saisie manuelle d'une dépense sur ces lignes (écran Saisie) et rattachement à l'import (assistant de la 0013).
- Règle anti-double-compte avec le pointage et le réel saisi.
- Effet sur le réel de la ligne, les soldes des comptes et les totaux de l'écran Budget ; « Reste à sortir » reste inchangé (risque accepté, RG13).
- Règles mémorisées de l'import vers ces lignes.
- Schéma : nouvelle migration additive.

Exclus : lignes de revenus (`rev`, spec 0015) et d'épargne/invest (`epa`, `inv`), double pointage, rapprochement automatique et suivi des vraies sorties au niveau budget (spec 0017), lien d'une dépense avec une case de pointage (le pointage reste un statut indépendant), plusieurs comptes pour une même ligne, revue de l'affichage comptes/objectifs, bilan annuel.

## Règles de gestion

Cible et compte
- RG1. Une dépense peut cibler une ligne du mois de son rattachement dont le bloc est `fix` ou `cre`. Les lignes `informatif` (spec 0009, RG18) sont aussi ciblables : « informatif » ne concerne que la case et le « Reste à sortir ».
- RG2. Compte de la dépense = compte de la ligne (`accountId`, absent = compte principal). Aucune dépense ne peut être enregistrée sur une ligne `fix`/`cre` avec un autre compte (comme pour une ligne `var` à compte attribué, spec 0006 amendée).
- RG3. À l'import, seules sont proposées comme cible les lignes `fix`/`cre` dont le compte est le compte résolu de la ligne importée (spec 0013, RG33). Une ligne d'un compte d'enveloppe n'accepte toujours que cette enveloppe (spec 0013 amendement 1, spec 0011 RG2) : aucune ligne `fix`/`cre` n'est proposée.
- RG4. Une dépense sur ligne `fix`/`cre` est un montant positif (une sortie d'argent), comme les autres dépenses. Les types de dépense existants (`var`, `env`, `epa`) et leur comportement sont inchangés.

Réel de la ligne
- RG5. Le réel (`actual`) d'une ligne `fix`/`cre` portant des dépenses est la somme de ses dépenses. Si le réel est vide, il est alimenté par la première dépense ; s'il est saisi, RG6 s'applique.
- RG6. Si un réel est déjà saisi sur la ligne (une valeur, 0 compris) et que la ligne n'a aucune dépense, la première dépense remplace ce réel après une confirmation explicite : « Cette ligne a un réel saisi de X €. L'enregistrer le remplacera par le montant des dépenses. Remplacer ? » avec [Annuler] et [Remplacer]. Annuler n'enregistre rien et ne change rien. Confirmer enregistre la dépense et le réel devient la somme des dépenses. Le réel remplacé est perdu : le message de confirmation le dit (« ... le remplacera et ne sera pas restauré si vous supprimez ensuite la dépense. », voir RG7). À l'import, la ligne de l'aperçu est « Réel saisi à remplacer » (signalée, non bloquante) ; la confirmation est demandée une fois, avant l'écriture, pour l'ensemble des lignes concernées (liste des lignes et réels remplacés).
- RG7. Tant qu'une ligne `fix`/`cre` porte au moins une dépense, son réel n'est pas modifiable à la main (comme celui d'une ligne `var`, spec 0008). Supprimer sa dernière dépense remet le réel à vide, comme pour `var` (spec 0008, CA2) ; un réel saisi qui avait été remplacé n'est pas restauré (décision du développeur).
- RG8. Plusieurs dépenses sur une même ligne s'additionnent. Un montant différent du budget est accepté sans blocage ; l'écart se lit comme pour tout réel (budget contre réel).

Ligne « portée par ses dépenses » (anti-double-compte, décision B1)
- RG9. Dès qu'une ligne `fix`/`cre` porte au moins une dépense, ses mouvements d'argent viennent de ses dépenses, à leur date : son propre mouvement (réel du 1er du mois en mois « au réel », montant pointé à la date du pointage en mois « au pointage ») n'est plus compté dans les soldes (écran Comptes, solde estimé). Sans dépense, rien ne change.
- RG10. Le pointage de la ligne reste possible et garde son rôle de statut (case cochée, date, badge de retard, spec 0009) mais n'a plus d'effet sur les soldes tant que la ligne porte des dépenses. L'interface l'indique (« Pointage sans effet : la ligne est portée par ses dépenses »).
- RG11. Une ligne pointée ET portant une dépense compte une seule fois, au montant de ses dépenses, à leur date. Pointer ou dépointer ne change aucun solde.
- RG12. Quand la dernière dépense d'une ligne est supprimée, la ligne reprend son mouvement propre (réel vide : montant budgété à la date du pointage s'il est pointé, sinon rien).

« Reste à sortir » et totaux
- RG13. « Reste à sortir » reste un indicateur purement budgétaire : il n'est PAS modifié par les dépenses d'une ligne `fix`/`cre` (ni sortie de la ligne, ni écart budget moins dépenses). Une ligne non pointée y garde son montant (budget, ou réel si présent, spec 0009 RG76) ; une ligne pointée en sort, comme aujourd'hui. Le suivi réel est porté par les comptes et soldes.
  - RISQUE ACCEPTÉ par le développeur : le solde estimé compte déjà la dépense (RG9) alors que « Reste à sortir » compte encore la ligne tant qu'elle n'est pas pointée ; la marge (solde estimé moins reste à sortir) compte alors deux fois la même sortie. Le décalage disparaît au pointage de la ligne. Il sera traité dans la spec 0017 (indicateur de marge réelle, lien pointage ↔ dépense). Aucun correctif dans cette spec.
- RG14. Les totaux de l'écran Budget (réel, écart, bilan du mois) lisent le réel de la ligne : ils reflètent les dépenses sans changement de calcul.
- RG15. Les mois clos ou verrouillés (spec 0004/0010) n'acceptent ni ajout ni suppression de dépense sur ces lignes, comme pour les autres. Une dépense existante d'un mois clos garde son effet sur les soldes.
- RG16. La clôture d'année lit les soldes issus du Ledger : elle reflète les règles RG9 à RG12 sans règle propre.

Import (spec 0013)
- RG17. Dans l'aperçu, le sélecteur de cible d'une dépense propose, en plus des lignes `var` et enveloppes, les lignes `fix` et `cre` du mois de rattachement qui respectent RG3, regroupées par bloc.
- RG18. Une règle mémorisée (spec 0013, RG18) peut viser une ligne `fix`/`cre` par sa clé de ligne stable (valable d'un mois à l'autre). Une règle dont la ligne n'existe pas dans le mois de rattachement, ou dont le compte ne correspond plus (RG3) n'est pas appliquée à ce mois et la ligne reste « à rattacher ». Un réel déjà saisi n'empêche pas la règle (RG6).
- RG19. La déduplication, l'empreinte, le rang, les natures, le mois de rattachement et le récapitulatif de la 0013 sont inchangés. Une dépense importée sur une ligne `fix`/`cre` compte dans « dépenses importées ».
- RG20. À l'import, plusieurs lignes du fichier visant la même ligne `fix`/`cre` sont acceptées et s'additionnent. Si le réel est déjà saisi (RG6), la confirmation de remplacement s'applique une seule fois pour la ligne.

## Parcours utilisateur

Nominal (saisie) : écran Saisie, « Nouvelle dépense », je choisis « Ligne fixe / crédit », la ligne « EDF », le montant et le jour ; la dépense s'ajoute, le réel de la ligne se met à jour, le solde du compte change à la date de la dépense ; « Reste à sortir » ne change pas.

Nominal (import) : le prélèvement EDF du fichier est proposé sur « EDF » (règle mémorisée ou choix à la main) ; à la validation, la ligne porte la dépense.

Cas limites :
- Ligne pointée ET dépense : un seul mouvement (RG11).
- Réel déjà saisi : confirmation de remplacement (RG6) ; aperçu « Réel saisi à remplacer ».
- Suppression d'une dépense sur une ligne qui en a plusieurs : le réel baisse, la ligne reste portée par les autres.
- Suppression de la dernière : réel vide, mouvement propre repris (RG12).
- Mois clos : ajout et suppression refusés (RG15).
- Plusieurs dépenses : somme (RG8). Montant différent du budget : accepté.
- Ligne sur un compte différent du compte résolu de l'import : non proposée (RG3).
- Ligne d'un autre mois que celui de la date (salaire/prélèvement de fin de mois) : mois de rattachement choisi, la ligne est cherchée dans ce mois.
- Doublon à l'import : inchangé (déduplication de la 0013).

## Design

Design proposé, à valider (aucune maquette). Réutiliser `organic.css` et les composants existants (sélecteurs, pastille de compte, chip).

Saisie manuelle, formulaire « Nouvelle dépense » (écran Saisie). Le sélecteur de cible gagne deux groupes :
```
Nouvelle dépense
 Cible    [ Ligne variable | Enveloppe | Ligne fixe / crédit ]
 Ligne    [ EDF (Prélèvement, compte principal)        v ]
          [ CRN …108 (Crédit)                          v ]
 Montant  [ 62,00 ]   Jour [ 05 ]   Libellé [ Prélèvement EDF ]
 Compte   Compte principal   (imposé par la ligne)
                                          [Annuler] [Enregistrer]
 Si un réel est saisi : fenêtre de confirmation
   « Cette ligne a un réel saisi de 60,00 €. L'enregistrer le remplacera par le montant des dépenses
     et il ne sera pas restauré si vous supprimez ensuite la dépense. »
                                          [Annuler] [Remplacer]
```
Écran Budget, ligne portant des dépenses : le réel s'affiche comme pour `var` (non éditable, infobulle « somme des dépenses »), avec un petit indicateur « n dépenses » ; la case de pointage reste visible avec la mention « sans effet sur les soldes ».

Aperçu de l'import (spec 0013) : colonne « Rattacher à » avec groupes Lignes variables, Enveloppes, Lignes fixes, Crédits.
```
 [x] 05/10  PRLV EDF       62,00  [Lignes fixes > EDF  v] [oct. v]  Nouveau
 [ ] 06/10  PRLV GAZ       41,00  [Lignes fixes > Gaz  v] [oct. v]  Réel saisi à remplacer
```
États : formulaire (repos, confirmation de remplacement du réel, mois clos), aperçu (cible fixe choisie, réel saisi à remplacer, à rattacher).

## Impact technique (quoi, pas comment)

- Domaine : nouveau(x) type(s) de dépense pour une ligne `fix`/`cre` (cible = clé de ligne), à côté de `var`, `env`, `epa` dans `Transaction` ; règle de compte (RG2) ; `bankMovements` : une ligne `fix`/`cre` portant au moins une dépense ne produit plus son propre mouvement (réel du 1er, mouvement du pointage, contrepartie de compte lié) ; les dépenses sont déjà comptées comme dépenses du compte, donc sans nouveau mouvement ; test de non-régression des soldes (écran Comptes = solde estimé, spec 0009, CA49 et suivants) ; `pendingLines` (« Reste à sortir ») n'est pas modifié (RG13, risque de marge accepté) ; le calcul du « réel » des totaux de l'écran Budget n'est pas modifié.
- Application : `addTransaction` accepte les nouveaux types (refus si mois verrouillé, compte différent de celui de la ligne, ligne introuvable ou hors blocs `fix`/`cre` ; réel déjà saisi et ligne sans dépense : remplacement après confirmation explicite (RG6)) et alimente le réel (RG5) ; `deleteTransaction` retire la part du réel et le remet à vide à la dernière dépense (RG7, RG12) ; l'édition manuelle du réel est refusée si la ligne porte des dépenses ; le sélecteur de cible de la 0013 (`ImportTarget`, `targetIsValid`, `validateImport`) accepte la cible ligne fixe/crédit et applique RG3, RG6, RG20 ; les règles mémorisées (`ImportRule.target`) acceptent cette cible.
- Infrastructure / schéma Supabase : NOUVELLE migration additive qui élargit le `check` sur `transactions.type` (aujourd'hui `('var','env','epa')`) aux nouveaux types ; la migration `init_schema` n'est pas modifiée ; adaptation de la cible des règles `import_rules` si elle est typée en base ; conversion domaine ↔ lignes (`supabaseRows`) et `database.types.ts` régénéré ; test de contrat `BudgetRepository` étendu avec une dépense sur ligne fixe.
- Présentation : formulaire « Nouvelle dépense » (Saisie), ligne de l'écran Budget (réel non éditable, indicateur, mention du pointage), sélecteur de cible de l'aperçu d'import (`ImportWizard`).
- Impact sur la 0013 (écrite, à livrer telle quelle avant) : `csvImport.ts`, `ImportWizard.tsx`, cible des `ImportRule` ; les données déjà écrites (`var`, `env`) restent valides.
- Documentation : architecture (lignes portées par leurs dépenses, anti-double-compte) ; ADR sur cette règle.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given une ligne `fix` « EDF » sans réel, When j'enregistre une dépense de 62 € dessus, Then son réel vaut 62 € et la dépense est au compte de la ligne. (Auto)
- CA2. Given la même ligne, When j'ajoute une seconde dépense de 10 €, Then le réel vaut 72 €. (Auto)
- CA3. Given une ligne `cre` « CRN …108 », When j'enregistre une dépense, Then elle est acceptée comme pour `fix`. (Auto)
- CA4. Given une ligne de bloc `rev`, `epa` ou `inv`, When je tente d'y enregistrer une dépense de ce type, Then c'est refusé. (Auto)
- CA5. Given une dépense avec un compte différent de celui de la ligne, When j'enregistre, Then c'est refusé. (Auto)
- CA6. Given une ligne avec un réel déjà saisi de 60 € et sans dépense, When j'enregistre une dépense de 62 €, Then une confirmation annonce le remplacement du réel de 60 € sans restauration possible ; When j'annule, Then rien n'est enregistré et le réel reste 60 € ; When je confirme, Then la dépense est enregistrée et le réel vaut 62 €. (Auto sur le domaine, Man sur le message)
- CA7. Given une ligne portant une dépense, When je tente de modifier son réel à la main, Then c'est refusé. (Auto)
- CA8. Given une ligne `fix` de 62 € budgétée, non pointée, avec une dépense de 60 € le 05/10, When je calcule les soldes, Then le compte baisse de 60 € le 05/10 et d'aucun autre montant. (Auto)
- CA9. Given la même ligne pointée le 03/10 et une dépense de 60 € le 05/10, When je calcule les soldes, Then le compte baisse une seule fois, de 60 € le 05/10 ; When je dépointe, Then le solde ne change pas. (Auto)
- CA10. Given un mois « au pointage » et un mois « au réel », When une ligne `fix` porte une dépense, Then les deux modes comptent la dépense à sa date et ne comptent pas le mouvement propre de la ligne. (Auto)
- CA11. Given une ligne portant sa dernière dépense (ayant remplacé un réel saisi de 60 €), When je la supprime, Then le réel redevient vide (60 € n'est pas restauré) et le mouvement propre de la ligne (pointage ou rien) est de nouveau compté. (Auto)
- CA12. Given une ligne avec deux dépenses, When j'en supprime une, Then le réel baisse de son montant et la ligne reste portée par l'autre. (Auto)
- CA13. Given une ligne `fix` de 62 € non pointée sans dépense, Then elle compte 62 € dans « Reste à sortir » ; When elle reçoit une dépense de 62 €, Then « Reste à sortir » vaut toujours la même chose, la case n'est pas cochée, et seul le solde estimé baisse de 62 €. (Auto)
- CA13a. Risque accepté, observable : Given la même ligne non pointée avec sa dépense de 62 €, When je lis la marge (solde estimé moins reste à sortir), Then elle est inférieure de 62 € à la réalité (sortie comptée deux fois) ; When je pointe la ligne, Then la ligne sort de « Reste à sortir » et la marge redevient juste. Le reviewer reconnaît ce comportement comme voulu (à traiter en spec 0017). (Auto sur le domaine, Man sur l'écran)
- CA14. Given une ligne pointée portant une dépense, Then la case reste cochée et l'interface indique que le pointage est sans effet sur les soldes. (Man)
- CA15. Given un mois clos, When j'ajoute ou supprime une dépense sur une ligne fixe, Then c'est refusé ; Given une dépense existante d'un mois clos, Then elle garde son effet sur les soldes. (Auto)
- CA16. Given les soldes d'un compte sur des mois avec lignes fixes portant des dépenses, Then le solde calculé de l'écran Comptes est égal au solde estimé de l'écran de pointage. (Auto)
- CA17. Given un budget et des dépenses sur lignes fixes, Then les totaux de l'écran Budget (réel, écart) reflètent le réel alimenté par les dépenses. (Auto sur le domaine, Man sur l'écran)
- CA18. Given l'aperçu d'import, When je déroule le sélecteur de cible, Then les lignes `fix` et `cre` du compte résolu sont proposées par groupes, et celles d'un autre compte ne le sont pas. (Auto sur le domaine, Man sur l'écran)
- CA19. Given une ligne importée d'un compte d'enveloppe, Then aucune ligne `fix`/`cre` n'est proposée. (Auto)
- CA20. Given une ligne importée rattachée à une ligne `fix` avec réel déjà saisi, Then elle est « Réel saisi à remplacer » ; When je valide l'import, Then une confirmation liste les réels remplacés ; annuler n'écrit rien. (Auto, Man)
- CA21. Given une règle mémorisée « EDF → ligne EDF » et un fichier contenant ce libellé, Then la cible est préremplie ; Given une règle dont la ligne est absente du mois de rattachement ou d'un autre compte, Then elle n'est pas appliquée. (Auto)
- CA22. Given un import validé avec une dépense sur ligne fixe, When je recharge l'application, Then la transaction, le réel de la ligne et les soldes sont identiques. (Man sur base réelle, Auto sur la conversion)
- CA23. Given deux lignes du fichier visant la même ligne `fix` sans réel, When j'importe, Then deux dépenses sont créées et le réel est leur somme. (Auto)
- CA24. Given un réimport du même fichier, Then les dépenses sur lignes fixes sont des doublons comme les autres (spec 0013). (Auto)
- CA25. Given la migration, Then les nouveaux types de dépense sont acceptés en base et les anciens restent valides ; sauvegarder puis recharger un budget avec des dépenses sur lignes fixes redonne le même `BudgetData`. (Auto sur la conversion, Man sur la base)
- CA26. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur intégrées : implémentation après la 0013 ; réel alimenté par les dépenses avec remplacement après confirmation et réel remplacé perdu à la suppression de la dernière dépense ; « Reste à sortir » inchangé (risque de marge accepté, RG13, CA13a) ; lien budget ↔ réalité renvoyé à la spec 0017. Date bancaire distincte du mois de rattachement pour toutes les écritures : spec 0015 (la 0014 garde `month`/`day`).
