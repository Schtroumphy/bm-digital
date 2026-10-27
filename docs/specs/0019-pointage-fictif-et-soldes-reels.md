# 0019 — Pointage fictif et soldes réels

- Statut : implémentée (revue en attente). Implémentation faite APRÈS la 0014 et la 0015 (voir « Ordre »). Amendements des specs 0004, 0007, 0009, 0010, 0011, 0013, 0014 et 0015 écrits ; ceux des specs 0016 et 0017 restent à faire (fichiers non suivis, hors périmètre de cette implémentation).
- Date : 2026-10-23
- Branche prévue : feat/soldes_reels_pointage_fictif
- Numéro : 0019 (premier numéro libre ; la 0018 est réservée au double pointage, non rédigé). Aucune spec existante n'est renumérotée ni modifiée par cette spec ; la section « Specs à amender » liste ce qu'il faudra y changer.

## Contexte et objectif

Principe du développeur : « Le pointage ne doit faire qu'un débit fictif car le budget reste informatif. Le vrai débit de compte (lié à l'onglet compte et les mouvements) se trace via une dépense, transfert, etc. depuis l'onglet dépense. » Le budget (réel de ligne, pointage) est une information et une estimation ; le suivi réel (soldes de comptes) vient des dépenses, transferts et mouvements ; « Reste à sortir » reste purement budgétaire ; portée « partout » (tous les comptes, toutes les lignes). Simplification demandée : le réel d'une ligne est toujours la somme de ses écritures, jamais une saisie.

Objectif : deux soldes distincts par compte.
- Solde réel : construit uniquement à partir d'écritures réelles (dépenses, entrées d'argent, transferts, régularisations). C'est la référence, comparée au relevé bancaire.
- Solde estimé (budgétaire) : budget et pointage (fictif), plus les écritures qui représentent déjà le même mouvement de façon plus exacte (transferts). Informatif.

## État des lieux (vérifié dans le code et les specs)

- Une seule source de mouvements, `domain/bankMovements.ts`, lue par le `Ledger` (écran Comptes, source `'actual'`) et par le solde estimé (`checkoff.ts`, `monthBalance`, source `'actual'` ou `'checks'` selon `monthMode` et `settings.pointageStart`). ADR 0005 : les deux chiffres sont égaux au réel par construction.
- `bankMovements` mélange des écritures réelles (transactions, mouvements entre comptes de la 0013, régularisations) et des effets du budget (réel de ligne au 1er du mois, montant pointé, versements de lignes `epa`/`inv` vers un compte dédié, pointage d'une ligne `var` vers son compte dédié, allocations d'enveloppe pointées, anciens virements « faits » inertes).
- Isolation des comptes hors budget (0009, RG92) : un compte hors budget ne touche jamais le principal ; la liste grise `ignoredMovements` montre ce que le principal ne compte pas.
- La régularisation compte aujourd'hui dans le solde estimé et dans le `Ledger` ; le relevé (`accountBalances`) ne sert qu'à l'écart contre le solde estimé. La clôture d'année reporte `bank:<id>` depuis le `Ledger`.
- Le réel de ligne (`actual`) est une saisie libre (`updateLine`), copiée du budget par `validateMonth` (annulable), recopiée du modèle (`template_lines.actual`) ; seules les lignes `var` sont déjà dérivées (la 0014 le fait pour `fix`/`cre`). Les totaux Budget, bilan et clôture lisent `actual ?? 0`.
- `AccountMovement` (0013) : source, destination, montant, date, libellé, trace d'import ; créé à l'import, jamais en saisie libre, sans cible de ligne. `Transaction` n'a qu'un compte et ses lectures additionnent des sorties.
- Le « solde estimé continu » est l'ADR 0005 (la spec 0005 du dépôt traite des revenus imprévus).

## Périmètre

Inclus :
- Deux soldes par compte, réel et estimé, chaînés mois après mois.
- Pointage fictif partout ; le mode « réel » du solde estimé et `pointageStart` disparaissent (le solde estimé est toujours budget plus pointage).
- Type d'écriture « Transfert » (retrait, virement entre ses comptes, versement d'épargne, alimentation d'enveloppe), saisi depuis l'écran Saisie et par l'import, comptant dans les DEUX soldes, avec cible facultative (ligne ou enveloppe) pour éviter le double compte avec le pointage.
- Le réel de toute ligne est la somme de ses écritures ; « Valider le mois » et la saisie du réel sont supprimés ; écriture rapide sur la ligne.
- Relevé et régularisation rattachés au solde réel.

Exclus : lien et rapprochement pointage ↔ écriture et couleur « confirmé par une dépense » (spec 0018), liaison des deux faces d'un virement à l'import (spec 0016), revenus importés et date bancaire (spec 0015), sorties d'épargne avec motif (spec 0017), revue de l'affichage comptes/objectifs, bilan annuel détaillé.

## Définitions

- Écriture réelle : transaction (dépense, sortie d'épargne), entrée d'argent (0015), transfert, régularisation. Elle a un compte (deux pour un transfert), un montant signé, une date (date bancaire si connue, sinon mois et jour).
- Solde réel d'un compte à une date = ouverture + écritures réelles du compte jusqu'à cette date, régularisations actives comprises. Les reports de clôture d'année partent du solde réel.
- Solde estimé d'un compte = ouverture + effets du budget : montant compté des lignes pointées à la date du pointage, contreparties pointées (ligne `var` vers compte dédié, allocation d'enveloppe, versement `epa`/`inv`), dépenses de lignes `var` et d'enveloppes à leur date, sorties d'épargne, ET transferts à leur date. Il ne contient ni régularisation, ni entrée d'argent importée, ni dépense sur ligne `fix`/`cre`/`rev` (ces lignes entrent par leur pointage, au montant compté).
- Transfert : écriture de montant positif entre un compte source et un compte destination, avec cible facultative (ligne `epa`/`inv`, enveloppe, ligne `var` à compte dédié).

## Règles de gestion

Solde réel
- RG1. Le solde réel est calculé uniquement à partir d'écritures réelles. Le réel d'une ligne (dérivé, RG20), un pointage, une allocation, un versement de ligne d'épargne et un ancien virement « fait » ne produisent AUCUN mouvement de solde réel. Les anciens virements « faits » sont ignorés.
- RG2. Les dépenses sont des écritures réelles quel que soit leur rattachement. Un transfert débite le compte source et crédite la destination à sa date, les deux faces comptant toujours, y compris pour un compte hors budget.
- RG3. Les régularisations « écart constaté » corrigent le solde réel et lui seul (0009 RG65 et RG66 inchangés).
- RG4. Le relevé bancaire (un par compte et par mois) est comparé au solde réel à sa date ; écart = relevé moins solde réel. Une régularisation comble l'écart.
- RG5. Le solde réel est l'unique solde de référence : écran Comptes, détail, reports de clôture d'année, bilan.

Solde estimé et pointage
- RG6. Le pointage d'une ligne (« reçu », « fait », prélèvement, versement, allocation d'enveloppe) est un débit ou crédit FICTIF : il alimente le solde estimé et les indicateurs budgétaires (« Reste à sortir », « Revenus attendus », retard), jamais un solde réel, une écriture ou le réel de la ligne.
- RG7. « Reste à sortir » et « Revenus attendus » restent purement budgétaires.
- RG8. Le solde estimé est toujours calculé « au pointage » : le mode « réel » du solde estimé et le réglage `pointageStart` (réglage, écran de réglage, contrôle de mois clos) sont supprimés. Un mois sans pointage ne contient donc aucun mouvement de ligne dans le solde estimé.
- RG9. Un transfert compte dans le solde estimé à sa date, comme dans le solde réel (décision du développeur).
- RG10. Anti-double-compte dans le solde estimé. Un pointage peut représenter le même mouvement qu'un transfert : pointage d'une ligne `epa`/`inv` vers son compte dédié, allocation d'enveloppe pointée, pointage d'une ligne `var` vers son compte dédié. Quand au moins un transfert est rattaché à ce poste budgétaire (cible = la ligne ou l'enveloppe, même mois de rattachement), la contrepartie fictive du poste n'est plus comptée dans le solde estimé : le transfert la remplace, à sa date et à son montant. Sans transfert rattaché, rien ne change. Pointer ou dépointer un poste qui a des transferts ne change aucun solde. (Principe de la « portée par ses écritures » de la 0014, limité aux contreparties entre comptes.)
- RG11. Signal de double compte possible : un transfert sans cible, de mêmes comptes source et destination et de même montant qu'une contrepartie pointée du même mois, est signalé « Semblable à un pointage » avec l'action « Rattacher ».
- RG12. Isolation des comptes hors budget (0009, RG92) : elle ne s'applique qu'aux contreparties FICTIVES du solde estimé (le pointage vers un compte hors budget ne débite pas le principal) et à la liste grise. Un transfert est réel : il débite et crédite ses deux comptes dans les deux soldes, hors budget ou non.
- RG13. Chaque chaîne a des sources distinctes : le solde réel ne lit que des écritures ; le solde estimé lit le budget (lignes pointées, contreparties) et les écritures `var`, `env`, `epa` et transferts. Aucune écriture n'est comptée deux fois dans un même solde (RG10).

Transfert (type d'écriture)
- RG14. Le formulaire « Nouvelle dépense » de l'écran Saisie gagne le type « Transfert » : compte source, compte destination (différent, actif), montant positif, jour, libellé, « Rattacher à » facultatif (enveloppe, ligne d'épargne ou d'investissement, ligne `var` à compte dédié du mois). Un transfert se crée aussi à l'import (natures Retrait et Transfert interne de la 0013).
- RG15. Une enveloppe dont le compte est la destination est proposée par défaut comme cible, modifiable ; de même une ligne `epa`/`inv` dont le compte dédié est la destination. Un transfert sans cible reste valable (retrait vers Espèces, virement entre comptes sans ligne de budget).
- RG16. Le réel d'une ligne `epa`/`inv` est la somme des transferts rattachés à la ligne dans le mois. Une ligne `epa`/`inv` sans compte dédié n'a pas de transfert possible : son réel reste vide (0) et l'infobulle de la ligne indique « Rattachez un compte dédié pour suivre le réel » (rien de visible n'est ajouté sur la ligne) ; son budget et son pointage sont inchangés. Le solde propre de l'enveloppe du `Ledger` (alloc moins dépensé) reste budgétaire.
- RG17. Mois verrouillé ou clos : création et suppression d'un transfert refusées ; modification du libellé et du montant selon la 0013 (bloc « Mouvements entre comptes »), refusées sur mois verrouillé.
- RG18. Un transfert n'a aucun effet sur les chiffres du budget (réel de ligne hors RG16, totaux, « Disponible à placer ») sauf la cible `epa`/`inv` de RG16.

Réel de ligne dérivé
- RG19. Aucune saisie du réel : la cellule « Réel » est en lecture seule pour toutes les lignes ; « Valider le mois » et son annulation sont supprimés (le « fait » se dit par le pointage) ; `template_lines.actual` disparaît ; `applyTemplate`, `duplicatePrevious` et `saveAsTemplate` ne copient aucun réel.
- RG20. Le réel d'une ligne est la somme des écritures rattachées à la ligne dans le mois : transactions pour `var`, `fix`, `cre` ; entrées d'argent pour `rev` (0015) ; transferts pour `epa`/`inv` (RG16). Une ligne sans écriture a un réel nul dans les totaux. Plus de « réel remplacé après confirmation » (0014, RG6) ni de « réel saisi à remplacer » à l'import.
- RG21. Écriture rapide : une petite icône discrète « + Écriture », visible seulement au survol ou au focus clavier de la ligne, sans changer la hauteur ni l'alignement de la ligne, avec une infobulle et un `aria-label`, ouvre une fenêtre (montant, jour, libellé ; compte imposé par la ligne) qui crée une vraie écriture ; elle compte dans le solde réel du compte. Les écritures de l'écran Saisie et de l'import restent.
- RG22. Données existantes : au premier chargement, les réels saisis à la main sont mis à vide et un bandeau unique, affiché une fois, indique leur nombre (« N réels saisis à la main ne comptent plus ; saisissez les écritures correspondantes »). Aucune écriture n'est fabriquée.
- RG23. Mois clos : le réel d'une ligne est la somme de ses écritures ; une ligne sans écriture a un réel nul dans les totaux, le bilan et la clôture d'année.
- RG24. Écran Budget : cellule « Réel » en lecture seule ; le nombre d'écritures (« n écritures ») est dans l'infobulle de la ligne, et l'action « + Écriture » est l'icône discrète de RG21 ; rien de nouveau n'est visible en permanence sur la ligne ; totaux, surplus, bilan et « épargne réelle » lisent le réel dérivé sans autre changement.

Affichage
- RG25. Les deux soldes sont nommés « Solde réel » et « Solde estimé (budget) » partout ; le réel en premier et en gras.
- RG26. Case de pointage : « Débit fictif : n'affecte pas les soldes réels » (« Crédit fictif » pour un revenu) figure dans l'infobulle de la case et dans son texte accessible, sans libellé visible ajouté sur la ligne.
- RG27. Le détail d'un compte a deux vues : « Réel » (écritures, transferts, régularisations, base de l'écart avec le relevé) et « Estimé (budget) » (pointages fictifs marqués « fictif », transferts, dépenses). L'écart « réel moins estimé » du mois est affiché en information, à la place de la ligne grise « Solde de l'écran Comptes ».

Données et migration
- RG28. Tout le calcul est dérivé à la lecture. Le réglage `pointageStart` n'est plus lu (la colonne `pointage_start` reste en base, inutilisée, sans migration de données) ; les réels saisis sont remis à vide (RG22). Les soldes affichés changent à la bascule (décision du développeur, bascule directe, budget neuf).

## Parcours utilisateur

Nominal : je pointe le prélèvement EDF : la case se colore, le solde estimé baisse, « Reste à sortir » baisse, le solde réel ne bouge pas (« débit fictif »). J'importe le prélèvement (0014) : le solde réel baisse à sa date et le réel de la ligne vaut le montant. Je retire 40 € au distributeur : transfert vers Espèces (import ou saisie), les deux soldes des deux comptes changent. Mon relevé du 31 donne un écart contre le solde réel : j'ajoute une régularisation.

Alimentation d'enveloppe : j'ai pointé l'allocation « Loisirs » (estimé). J'enregistre le virement réel vers l'enveloppe (transfert, cible « Loisirs ») : le solde estimé reprend le transfert et ne compte plus la contrepartie pointée ; le solde réel de l'enveloppe monte.

Cas limites : pointage sans transfert (estimé seul, pas de double compte) ; transfert sans pointage (réel et estimé) ; transfert sans cible semblable à un pointage (signal, RG11) ; transfert vers un compte hors budget (deux faces comptées, RG12) ; ligne pointée sans écriture ; mois clos ; compte d'enveloppe ; année clôturée (report du solde réel) ; budget neuf (solde réel = ouverture) ; relevé avant toute écriture ; ligne `epa`/`inv` sans compte dédié (réel vide, indication RG16).

## Design (proposé, à valider)

Réutiliser `organic.css`, la carte « Pointage par compte », l'écran Comptes.

Écran Comptes :
```
 ● Compte principal      Solde réel 2 140,30 €        Estimé (budget) 2 305,00 €   écart -164,70 €
```
Détail d'un compte, deux vues :
```
 Compte principal                    [ Réel | Estimé (budget) ]
 Début 2 600,00 €  ·  Entrées 2 480,00 €  ·  Sorties 2 939,70 €  ·  Solde réel 2 140,30 €
 Relevé du 30/10 : 2 140,30 €   écart 0,00 €   [Ajouter une régularisation]
 28/09  Virement salaire ACME            +2 480,00   (entrée)
 05/10  Prélèvement EDF                     -62,00   (dépense)
 06/10  Retrait distributeur                -40,00   (transfert vers Espèces)
 Vue « Estimé » : pointages (style atténué, « fictif » dans l'infobulle de la ligne), transferts, dépenses.
```
Formulaire « Nouvelle dépense », type « Transfert » :
```
 Type   [ Dépense variable | Enveloppe | Sortie épargne | Transfert ]
 De [ Compte principal ]  Vers [ Enveloppe Loisirs ]  Montant [60,00]  Jour [05]  Libellé [Alimentation Loisirs]
 Rattacher à [ Allocation Loisirs (enveloppe) v ]   (facultatif)
 (info) Cette allocation est pointée : le transfert remplacera sa contrepartie fictive dans le solde estimé.
```
Signal sur un transfert sans cible : « Semblable à un pointage : Allocation Loisirs. [Rattacher] ».
Principe (décision du développeur) : toute nouvelle information d'une ligne de liste est dans l'infobulle, jamais ajoutée sur la ligne. Il vaut pour les lignes de liste (écran Budget, détail de compte), pas pour les formulaires, les confirmations ni les bandeaux. Accessibilité : la même information est fournie aux lecteurs d'écran par un texte visuellement masqué rattaché à la case ou à la ligne (`aria-describedby`) et par un `aria-label`, comme dans la 0014.

Case de pointage : `[x]` sans libellé visible ; infobulle et texte accessible « Débit fictif : estimation de budget, n'affecte pas les soldes réels. Enregistrez une dépense ou un transfert pour le réel. »
Écran Budget, ligne : `EDF  62,00 €  62,00 €  [x]`, identique à une ligne sans écriture ; infobulle de la ligne : « 1 écriture, réel = somme des écritures » ; au survol ou focus clavier, une petite icône « + » discrète apparaît (infobulle et `aria-label` « Ajouter une écriture ») sans changer la hauteur ni l'alignement. Cellule Réel non éditable. Ligne `epa`/`inv` sans compte dédié : infobulle « Rattachez un compte dédié pour suivre le réel ».
États : compte sans écriture, écart de relevé, mois clos, bandeau unique des réels remis à vide.

## Impact technique (quoi, pas comment)

- Domaine : séparer les sources de `bankMovements` en mouvements réels (écritures, transferts, régularisations) et mouvements budgétaires (pointages, contreparties, `var`/`env`/`epa`, transferts) ; fonction du solde estimé : toujours au pointage, avec la règle RG10 (contrepartie remplacée par les transferts rattachés) ; suppression de `monthMode`, `pointageStart`, `canSetPointageStart` et `oldestCheckedMonth` ; solde réel chaîné comme aujourd'hui (début = fin du mois précédent, reports `bank:<id>`) lu par le `Ledger` (`bankFlow`, `bankMonth`) ; `ignoredMovements` limité aux contreparties fictives ; réel de ligne dérivé (fonction pure) ; suppression de `lineNeedsActual`, `linesWithoutActual` ; `countedAmount` simplifié ; détection RG11.
- Modèle du transfert : un seul concept, `AccountMovement` (0013), enrichi d'une cible facultative (clé de ligne ou identifiant d'enveloppe), présenté comme type de dépense « Transfert » ; les mouvements existants restent valides sans cible.
- Application : création, modification et suppression de transferts hors import (la 0013 les refusait) ; `addTransaction`/`deleteTransaction` alimentent le réel de toute ligne (généralisation de 0014) ; `updateLine` ne modifie plus `actual` ; `validateMonth`/`undoValidateMonth` supprimées ; écriture rapide ; conversion RG22 ; import : cible facultative d'un transfert dans l'aperçu.
- Infrastructure / schéma : NOUVELLE migration (à écrire à l'implémentation, non écrite ici), additive sauf nettoyage de `template_lines.actual` : (1) colonnes de cible facultative sur `account_movements` (type de cible, clé de ligne ou identifiant d'enveloppe, nullable, mêmes contraintes `user_id`/RLS que la table) ; (2) retrait de la colonne `actual` de `template_lines` ; (3) `month_lines.actual` conservé comme cache recalculé, ou retiré ; (4) `settings.pointage_start` laissée en base, inutilisée, sans migration de données. `import_rules` : à étendre seulement si une règle mémorisée doit porter la cible d'un transfert ; sinon inchangée (décision à l'implémentation, la cible étant proposée par défaut selon la destination). `supabaseRows`, `database.types.ts`, test de contrat.
- Présentation : écran Comptes (deux chiffres), détail du compte (vues Réel/Estimé), carte de pointage (libellés, signal RG11), écran Saisie (type Transfert), écran Budget (cellule en lecture seule, infobulle, icône « + » au survol ou focus, texte masqué pour lecteurs d'écran, plus de « Valider le mois »), écran Modèle (plus de réel), réglages (plus de début de pointage), clôture et bilan (soldes réels), aperçu d'import (cible).
- Tests : l'égalité « solde de l'écran Comptes = solde estimé » (0009, CA49 et suivants) est REMPLACÉE par les propriétés de cette spec ; suppression des tests de `validateMonth`, de la saisie du réel et de `pointageStart`.
- Documentation : ADR (deux soldes, transfert, estimé toujours au pointage) amendant l'ADR 0005 (décisions 2, 3, 4, 6, 9, 11, 13).

## Specs à amender (non modifiées par cette spec)

- 0014 : supprimer RG9 à RG12 et CA8 à CA12 (ligne « portée »), la modification de `bankMovements`, CA13a et le « risque accepté » ; RG5 devient « le réel est la somme », supprimer RG6, RG7, CA6, CA7 et l'état d'aperçu « Réel saisi à remplacer » (CA20) ; conserver cibles, compte de la ligne, import, règles mémorisées, migration du `check`. À livrer telle quelle puis amender (ordre).
- 0015 : supprimer RG9 (réel remplacé), RG10 à RG12 (ligne `rev` portée), R2 et CA8 ; RG2 ne s'applique qu'au solde réel et à l'estimé des écritures non rattachées à une ligne pointée ; indispensable à la bascule.
- 0016 : les virements internes sont des transferts (même concept, deux traces) ; supprimer R7 et les références à l'isolation ; ajouter la cible facultative.
- 0017 : le « mouvement entre comptes » devient « transfert » ; arbitrer lors de l'amendement le recouvrement entre la sortie d'épargne de type `epa` et un transfert avec cible `epa` (RG3).
- 0018 (double pointage, non rédigé) : devient le lien entre pointage et écritures pour tout poste, en complément de RG10 et RG11 ; l'écart « réel moins estimé » en fournit un indicateur de base.
- 0013 (livrée) : P7 (retrait vers enveloppe et double compte) est résolu par la cible et RG10 ; RG10b (« sans règle d'isolation ») précisée par RG12 ; création libre de mouvements désormais permise (RG14) ; aucune règle d'import des lignes ne change.
- 0004 (valider le réel conforme au budget) : abandonnée sur ce point. 0007, 0009, 0010, 0011 : pointage des lignes `epa`/`inv`, de lignes `var` vers un compte dédié et d'allocations devient fictif ; RG92 limité à l'estimé ; `pointageStart` et modes supprimés.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given un compte à 1 000 € d'ouverture sans écriture, Then son solde réel vaut 1 000 €, quels que soient les réels de lignes et les pointages. (Auto)
- CA2. Given une dépense de 62 € le 05/10, Then le solde réel vaut 938 € à partir du 05/10 et 1 000 € avant. (Auto)
- CA3. Given une ligne `fix` de 62 € pointée le 03/10, Then le solde réel ne change pas et le solde estimé baisse de 62 € à cette date. (Auto)
- CA4. Given un revenu pointé « reçu » sans écriture, Then le solde réel ne change pas ; When j'importe l'entrée (0015), Then le solde réel augmente à la date bancaire. (Auto)
- CA5. Given un transfert de 40 € du principal vers Espèces, Then le principal baisse et Espèces monte de 40 € dans le solde réel ET dans le solde estimé. (Auto)
- CA6. Given une allocation d'enveloppe pointée de 60 € et un transfert de 60 € vers l'enveloppe rattaché à cette allocation, Then le solde estimé du principal baisse une seule fois (de 60 €) et pointer ou dépointer ne le change pas ; le solde réel baisse une fois. (Auto)
- CA7. Given la même allocation pointée et un transfert de 60 € sans cible, Then le transfert est signalé « Semblable à un pointage » avec « Rattacher » ; When je rattache, Then la contrepartie fictive n'est plus comptée. (Auto, Man)
- CA8. Given une ligne `epa` pointée vers son compte dédié et un transfert rattaché à la ligne, Then le réel de la ligne est la somme des transferts rattachés et les soldes comptent une fois. (Auto)
- CA8a. Given une ligne `epa`/`inv` sans compte dédié, Then son réel vaut 0, son infobulle indique « Rattachez un compte dédié pour suivre le réel » (rien de visible ajouté), et son budget et son pointage fonctionnent comme avant. (Auto sur le domaine, Man sur l'écran)
- CA9. Given un compte hors budget, Then un transfert depuis le principal compte les deux faces dans les deux soldes ; Given le pointage d'une ligne vers ce compte, Then l'isolation s'applique (le principal n'est pas débité dans l'estimé) et la liste grise l'indique. (Auto)
- CA10. Given une régularisation de +30 €, Then le solde réel augmente de 30 € et le solde estimé ne change pas ; annulée, le solde réel revient. (Auto)
- CA11. Given un relevé de 940 € au 30/10 et un solde réel de 938 €, Then l'écart vaut 2 € contre le solde réel. (Auto)
- CA12. Given l'année clôturée, Then le report `bank:<id>` part du solde réel. (Auto)
- CA13. Given une ligne `var` avec ses dépenses, Then le réel, le « restant des variables » et le solde estimé de ses dépenses sont inchangés et ces dépenses sont dans le solde réel. (Auto)
- CA14. Given « Reste à sortir » et « Revenus attendus », Then leurs valeurs sont identiques à celles d'avant la spec pour les mêmes données. (Auto)
- CA15. Given le solde estimé, Then il est toujours calculé au pointage : un mois sans pointage ne contient aucun mouvement de ligne ; le réglage `pointageStart` n'est plus proposé ni lu, et une donnée existante avec `pointageStart` se charge sans erreur. (Auto)
- CA16. Given une ligne sans écriture, Then sa cellule « Réel » est en lecture seule et son réel vaut 0 dans les totaux ; Given une écriture de 62 €, Then le réel vaut 62 €. (Auto sur le domaine, Man sur l'écran)
- CA17. Given une ligne `rev` et deux entrées importées rattachées, Then son réel est leur somme. (Auto)
- CA18. Given le mois, Then « Valider le mois » et « Annuler la validation » n'existent plus et `applyTemplate` ne copie aucun réel ; le modèle ne contient aucun réel. (Auto, Man)
- CA19. Given une écriture rapide de 30 € sur une ligne, Then le réel de la ligne vaut 30 € et le solde réel du compte de la ligne varie de 30 € à sa date. (Auto)
- CA20. Given des réels saisis à la main existants, When je charge l'application, Then ils sont mis à vide, aucune écriture n'est créée et un bandeau unique indique leur nombre, une seule fois. (Auto, Man)
- CA21. Given un mois clos, Then une ligne sans écriture a un réel nul dans les totaux, le bilan et la clôture ; une écriture du mois clos garde son effet. (Auto)
- CA22. Given le formulaire « Nouvelle dépense », When je choisis « Transfert », Then je peux saisir source, destination différente, montant, jour, libellé et une cible facultative ; sur mois clos, la création est refusée. (Auto, Man)
- CA23. Given l'aperçu d'import (0013), Then un transfert (Retrait, Transfert interne) propose une cible facultative, par défaut l'enveloppe ou la ligne `epa`/`inv` de la destination. (Auto, Man)
- CA24. Given l'écran Comptes et le détail d'un compte, Then « Solde réel » est en premier, « Estimé (budget) » en second avec l'écart, la vue « Réel » ne contient aucun pointage, la vue « Estimé » les affiche en style atténué avec « fictif » dans l'infobulle, et la case a pour infobulle et texte accessible « Débit fictif : n'affecte pas les soldes réels ». (Man)
- CA24a. Given une ligne du Budget portant des écritures, Then elle ne change ni de hauteur ni d'alignement par rapport à une ligne sans écriture : aucun texte ni élément ajouté en permanence ; le nombre d'écritures est dans l'infobulle ; l'icône « + » n'apparaît qu'au survol ou au focus clavier, avec infobulle et `aria-label`, sans décaler la ligne ; la case de pointage a un `aria-label` et un `aria-describedby` vers un texte visuellement masqué. (Man)
- CA25. Given la migration, Then la cible du transfert est acceptée en base, les mouvements existants restent valides (sans cible), `template_lines.actual` est retiré et sauvegarder puis recharger redonne le même `BudgetData`. (Auto sur la conversion, Man sur la base)
- CA26. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Ordre d'implémentation

Décision du développeur : 0014 livrée telle quelle (avec seulement les correctifs encore valables), puis 0015, puis 0019, puis 0016, 0017, 0018. Raison : sans les écritures de la 0014 (lignes `fix`/`cre`) et de la 0015 (entrées d'argent), un solde réel fondé sur les écritures seules serait faux. La 0019 supprime ensuite les règles « portée par ses dépenses » de la 0014 et de la 0015 devenues inutiles.

## Décisions du développeur (intégrées)

Deux chaînes indépendantes ; solde réel seule référence, relevé compris ; solde estimé toujours au pointage ; transferts dans le solde estimé ET le solde réel, sous forme d'un type de dépense « Transfert » ; bascule directe des soldes ; anciens virements « faits » ignorés ; « Valider le mois » supprimé ; réels saisis remis à vide avec un bandeau unique ; « + Écriture » sur la ligne plus l'import ; champ de cible sur le transfert pour les lignes d'épargne ; réel nul d'une ligne sans écriture en mois clos ; modèle du transfert : un seul concept, `AccountMovement`, enrichi d'une cible facultative (aucune migration de données) ; `pointageStart` supprimé ; cible choisie (proposée selon la destination) plus signal « Semblable à un pointage » ; lignes `epa`/`inv` sans compte dédié : réel vide avec l'indication « Rattachez un compte dédié pour suivre le réel ».

## Questions ouvertes

Aucune.

Amendement (spec 0028, [ADR 0024](../adr/0024-une-operation-sort-du-budget-par-son-affectation.md)) : RG19 et RG20, le réel d'une ligne est la somme de ses écritures NON affectées à un compte d'épargne.
