# 0037 — Un seul retrait d'espèces par mois, et des parts « en espèces » sans compte

- Statut : implémentée (2026-11-03). ADR : [0028](../adr/0028-retrait-d-especes-valeur-reservee.md), [0029](../adr/0029-compte-especes-masque-et-depenses-sans-compte.md), [0030](../adr/0030-part-en-especes-dans-la-ligne-d-allocation.md), [0031](../adr/0031-conversion-des-anciennes-donnees-au-chargement.md)
- Date : 2026-11-03
- Branche : feat/retrait_especes_unique
- Amende (de façon limitée) : 0026, 0006, 0011, 0016, 0019, 0002, 0010, 0008. S'appuie sur 0016 (débit « vers Enveloppes (global) », mouvement à une face sans compte de destination).
- Hors spec : l'onglet de saisies de fin de mois (voir Exclus / suite).
- Révision : la version précédente de cette spec supprimait tout le suivi des espèces ; le développeur l'a rejetée. Cette version garde le suivi du restant en espèces et ne retire que le compte « Espèces » et l'alimentation par transfert.

## Contexte et objectif

Certains mois, le développeur gère des lignes variables et des parts d'enveloppes en espèces « pour se restreindre au maximum ». Le compte principal n'est alors débité qu'UNE fois, par un retrait égal à la somme de toutes les parts en espèces du mois (exemple : Alimentation 100 + Snack 40 + part espèces de l'enveloppe Shopping 60 = un retrait de 200 €).

Les dépenses en espèces ne débitent aucun compte : elles servent seulement à connaître le restant en espèces. Aujourd'hui l'app les traite comme de l'argent d'un compte « Espèces » alimenté par des transferts (0006, 0026), ce qui complique tout. Objectif :

1. Un retrait est une sortie d'un compte sans compte de destination (comme un virement vers « Enveloppes (global) », 0016), jamais comptée dans le budget.
2. Une ligne variable peut être « gérée en espèces » sur toute son allocation du mois ; ses dépenses ne débitent aucun compte.
3. Une enveloppe peut avoir, chaque mois, une part en espèces (informative) prélevée sur son allocation.
4. L'app compare « à retirer » (somme des parts du mois) et « retiré » (somme des retraits du mois).
5. À la clôture, l'app propose de réconcilier le réel des lignes en espèces non entièrement dépensées.
6. Le compte « Espèces » disparaît de l'interface.

## Périmètre

Inclus :
- Retrait : nouvelle sortie sans compte de destination (saisie manuelle, import de la nature « Retrait », tout compte source).
- Ligne variable « gérée en espèces » (le mode Espèces des box reste, avec un sens simplifié), saisie de dépense simplifiée avec libellé par défaut.
- Part en espèces par enveloppe et par mois, saisissable depuis l'écran Enveloppes ; solde virtuel de l'enveloppe diminué de la part ; report de l'espèces d'un mois à l'autre.
- Suivi « à retirer X € / retiré Y € » du mois avec alerte.
- Proposition de réconciliation du réel à la clôture du mois (à confirmer, à raffiner).
- Suppression du compte « Espèces » de l'interface, conversion des données existantes.
- Migration Supabase additive.

Exclus / suite :
- Autre spec : l'onglet de saisies de fin de mois (soldes des enveloppes, épargne, investissement avec capital et plus-value latente).
- Refonte du process de clôture global (annoncée par le développeur) : seule la proposition de réconciliation est spécifiée ici, comme point à raffiner.
- Réconciliation automatique pour les enveloppes (l'espèces d'enveloppe se reporte, elle n'est pas forcément dépensée chaque mois).
- Retour d'espèces d'une enveloppe vers un compte, transfert d'espèces entre enveloppes.

## Définitions

- Retrait : mouvement sortant d'un compte vers « Espèces », valeur réservée sans compte (comme `'enveloppes'`, 0016).
- Part en espèces d'une ligne variable : son budget (allocation) du mois, quand la ligne est gérée en espèces.
- Part en espèces d'une enveloppe : montant saisi pour le mois, inférieur ou égal à l'allocation du mois.
- À retirer d'un mois : somme des parts en espèces des lignes variables en espèces + somme des parts en espèces des enveloppes, pour ce mois.
- Retiré d'un mois : somme des retraits dont le mois de rattachement est ce mois.
- Solde espèces d'une enveloppe : ouverture espèces + parts en espèces des mois − dépenses de l'enveloppe payées en espèces (report d'un mois à l'autre).

## Règles de gestion

Retrait
- RG1. Un retrait est un mouvement sortant d'un compte (principal par défaut ; tout autre compte actif non-enveloppe accepté) vers « Espèces », sans compte de destination. Il débite le compte source à sa date dans le solde réel ET le solde estimé. Aucun compte n'est crédité.
- RG2. Un retrait n'est ni une dépense ni un revenu et ne se rattache à aucune ligne : il ne change aucun réel, aucune allocation, aucun « Reste à sortir », aucun « Disponible ».
- RG3. Un retrait a un mois de rattachement (comme les autres mouvements, 0013). Mois verrouillé ou clos : création, modification et suppression refusées.
- RG4. Import CSV : la nature « Retrait » reste proposée pour un débit ; sa destination est fixe (« Espèces », plus de choix de compte). Déduplication, mois, règles mémorisées inchangés ; une règle qui visait le compte Espèces vise « Retrait ».
- RG5. Les lignes de budget en exécution « Retrait d'espèces » (`execMode: 'retrait'`) sont conservées : pointées, elles débitent le compte de la ligne comme un retrait. Elles ne servent pas au suivi « à retirer / retiré » (RG16) : seuls les retraits (RG1) en comptent.

Ligne variable gérée en espèces
- RG6. Le mode Espèces d'une ligne variable (0006) reste : c'est le marqueur « gérée en espèces » de la ligne. Il vaut pour TOUTE l'allocation du mois de la ligne (sa part en espèces = son budget). Il se règle comme aujourd'hui (pastille, menu, assistant) et reste porté par le modèle (0006 RG10).
- RG7. Une dépense saisie sur une ligne en espèces ne débite aucun compte (plus de compte « Espèces » à débiter) ; elle compte dans le réel de la ligne comme toute dépense `var` (0008 RG1) et sert à connaître le restant en espèces (= restant de la ligne, 0008 RG9). Elle est « hors compte » : aucun solde de compte ne change.
- RG8. La saisie d'une dépense sur une ligne en espèces est simplifiée : montant (et date) à saisir, libellé prérempli avec le nom de la ligne et modifiable. Aucun « Payé avec ».
- RG9. Une dépense en espèces qui fait dépasser le budget de la ligne (restant négatif) est acceptée avec un avertissement (restant en rouge, comme toute ligne variable) ; elle n'est jamais bloquée.
- RG10. Tant que le mois n'est pas clôturé, le réel d'une ligne en espèces est la somme des dépenses saisies, sans autre règle. Elle n'est pas obligée de tout saisir.

Part en espèces d'une enveloppe
- RG11. Pour chaque enveloppe et chaque mois, une part en espèces facultative (≥ 0, 0 par défaut, inférieure ou égale à l'allocation du mois ; une part supérieure est refusée avec un message). C'est un montant informatif ; il se saisit directement depuis l'écran Enveloppes (mois affiché). Mois verrouillé ou clos : lecture seule. Baisser l'allocation du mois sous la part déjà saisie est refusé (message), tant que la part n'a pas été réduite.
- RG12. Le solde virtuel de l'enveloppe baisse de la part : pour une allocation de 100 € et une part de 40 €, solde = 60 € virtuel + 40 € espèces, le total est inchangé. Le virement d'allocation vers le compte de l'enveloppe (0011 RG5/RG6, 0019) ne porte donc que allocation − part (60 €) ; les 40 € passent par le retrait du mois. Le principal n'est ainsi débité qu'une fois.
- RG13. Le solde espèces d'une enveloppe est cumulatif (ouverture espèces + parts − dépenses en espèces, voir Définitions) ; il se reporte d'un mois à l'autre et n'est jamais réconcilié automatiquement.
- RG14. Les dépenses d'enveloppe « payées en espèces » (0026 RG5, RG6) restent : elles diminuent le solde espèces seul. Elles sont refusées si elles dépassent le solde espèces (0026 RG7 inchangée). L'ouverture espèces (`openingCash`) et sa saisie (assistant, écrans Enveloppes et Comptes) restent.
- RG15. Il n'y a plus de transfert Espèces → enveloppe : le bouton « Alimenter » et la règle 0026 RG4 disparaissent. L'espèces d'une enveloppe n'augmente que par sa part du mois (RG11) et son ouverture.

Suivi du retrait
- RG16. En tête de l'écran Budget, le mois affiché indique « à retirer X € / retiré Y € » : X = somme des parts en espèces du mois (RG6, RG11), Y = somme des retraits du mois (RG3). Aucune case à cocher.
- RG17. Tant que Y < X, une alerte indique le montant restant à retirer (X − Y). Si Y ≥ X, aucune alerte (un excédent est affiché comme tel). Si X = 0 et Y = 0, le bloc est masqué.
- RG18. Le calcul est dérivé à la lecture, jamais saisi. Il n'entre dans aucun total budgétaire.

Réconciliation à la clôture
- RG19. Au moment de « Clôturer le mois », pour chaque ligne variable en espèces dont le réel est inférieur au budget (restant > 0), l'app PROPOSE de réconcilier le réel avec le budget (réel = budget pour le reste non saisi). La proposition est à confirmer ligne à ligne ; refuser la laisse telle quelle. Confirmer ajoute à la ligne une dépense en espèces « Reste non saisi » de montant budget − réel (le réel reste la somme des dépenses, 0019 RG19) ; elle ne débite aucun compte (RG7). Point à raffiner avec le développeur lors de la revue du process de clôture global.
- RG20. Aucune proposition pour les enveloppes (RG13), ni pour les lignes non gérées en espèces, ni pour une ligne dont le restant est nul ou négatif.

Compte « Espèces » et données
- RG21. Le compte « Espèces » n'apparaît plus : ni dans Comptes, ni dans la clôture (0010), ni dans les sélecteurs (« Payé avec », « De / Vers », import). Techniquement il reste en base comme compte réservé, masqué et jamais débité ni crédité ; il porte les anciennes données et n'est ni supprimé ni archivé.
- RG22. Aucun solde de compte n'est modifié par une dépense en espèces (RG7, RG14). Les soldes réel et estimé du principal ne bougent que par les retraits (RG1) et les virements du virtuel des enveloppes (RG12).
- RG23. Migration Supabase additive uniquement (aucune colonne supprimée). Sauvegarder puis recharger redonne le même `BudgetData`.

## Sort des données existantes

| Donnée | Sort proposé |
|---|---|
| `Envelope.openingCash` | Conservée telle quelle comme ouverture espèces (RG14) |
| Dépenses `env` avec `payMode: 'especes'` | Conservées : diminuent le solde espèces (RG14), aucun compte débité |
| Dépenses `var` sur le compte Espèces / lignes en mode Espèces | Conservées dans le réel de leur ligne ; la ligne reste « gérée en espèces » ; plus de débit du compte « Espèces » (RG7) |
| Transferts principal → Espèces (retraits) | Convertis en retraits (destination « Espèces » sans compte) ; débit du principal et mois conservés |
| Transferts Espèces → enveloppe | Supprimés (RG15) et convertis en part en espèces du mois du transfert (le solde espèces de l'enveloppe est conservé ; son virtuel de ce mois baisse de la part, RG12) |
| Règles d'import vers Espèces | Converties en « Retrait » (RG4) |
| Compte « Espèces » | Gardé en base, réservé, masqué, non débité (RG21) |
| Réel déjà clôturé | Inchangé |

## Parcours utilisateur

Nominal : en octobre, « Alimentation » (100 €) et « Snack » (40 €) sont gérées en espèces ; l'enveloppe Shopping reçoit 100 € dont 60 € en espèces. L'écran Budget affiche « à retirer 200 € / retiré 0 € » avec une alerte. Je retire 200 € au distributeur : « retiré 200 € », l'alerte disparaît ; le principal a été débité une fois. Pendant le mois je saisis 35 € sur Snack (libellé « Snack » prérempli) : aucun compte ne bouge, le restant de Snack est 5 €. Shopping : solde virtuel 40 €, espèces 60 € (le virement d'allocation ne portait que 40 €). À la clôture, l'app propose pour Snack de passer le réel à 40 € ; je confirme ; pour Alimentation, je refuse.

Cas limites : part d'enveloppe supérieure à l'allocation (refusée) ; allocation réduite sous la part déjà saisie ; mois verrouillé ou clos ; retrait avant ou après la saisie des parts ; budget d'une ligne modifié (X recalculé) ; ligne repassée en Virtuel (sa part sort de X) ; retrait supprimé (Y baisse) ; enveloppe supprimée (sa part sort de X).

## Design (proposé ; aucune maquette connue, validé avec la spec par le développeur)

Réutilise `organic.css`, `chip`, `popmenu`, `split-card`, `kpi-label`, le bloc d'alerte existant.

Écran Budget, en tête du mois (RG16, RG17) :
```
 Espèces du mois     à retirer 200,00 €  ·  retiré 0,00 €      (!) Il reste 200,00 € à retirer
```
Après un retrait de 200 € : « à retirer 200,00 € · retiré 200,00 € », sans alerte. Bloc masqué si rien à retirer et rien retiré.
Ligne variable en espèces (pastille billet inchangée) ; la dépense saisie ne porte pas de compte :
```
 Snack   [billet]   budget 40 €   réel 35 €   restant 5 €
```
Saisie simplifiée sur une ligne en espèces :
```
 Dépense espèces  Libellé [Snack      ]  Montant [ 35,00 ]  Date [05/10]  [Ajouter]
```
Carte d'enveloppe, écran Enveloppes (mois affiché) : champ « Part en espèces ce mois » et deux soldes (inchangés depuis 0026) :
```
 Shopping                                   100,00 €      <- total (virtuel + espèces)
 Virtuel 40,00 €  ·  Espèces 60,00 €
 alloué 100,00 €     Part en espèces ce mois [ 60,00 ]   <- ≤ alloué ; lecture seule si mois clos
```
Le bouton « Alimenter » est supprimé. L'historique en deux onglets (0026) reste ; l'onglet Espèces affiche « Ouverture », « Part du mois » (+) et les dépenses en espèces (−).

Proposition à la clôture (RG19, à raffiner) :
```
 Clôturer octobre — lignes en espèces non entièrement dépensées
 ☑ Snack          budget 40 €  saisi 35 €   Ajouter « Reste non saisi » 5 € ?
 ☐ Alimentation   budget 100 € saisi 60 €   Ajouter « Reste non saisi » 40 € ?
 [Confirmer et clôturer]   [Clôturer sans régulariser]
```
Formulaire de transfert / import : « Retrait » avec destination fixe « Espèces » ; le compte « Espèces » disparaît des listes.

États : aucun besoin en espèces (bloc masqué), retrait insuffisant (alerte), retrait suffisant, excédent, mois clos (lecture seule), aucune ligne à réconcilier (pas de fenêtre).

## Impact technique (quoi)

- Domaine : part en espèces par mois et enveloppe (donnée du mois) ; fonction pure « à retirer / retiré » ; solde espèces d'enveloppe = ouverture + parts − dépenses ; solde virtuel et virement d'allocation (`bankMovements`) diminués de la part ; destination réservée « espèces » sans compte dans `AccountMovement` ; dépense `var` / `env` en espèces sans débit de compte ; `resolveBoxAccountId` ne renvoie plus de compte pour le mode Espèces ; suppression de la règle « source Espèces → enveloppe » (`movementTargets`, `envelopeHistory`, `envelopeCash`) ; fonction pure de réconciliation à la clôture ; `migrate.ts`.
- Application : saisie de la part (plafond = allocation), `addTransaction` en espèces sans compte, saisie simplifiée, proposition et confirmation de réconciliation dans la clôture du mois, import de la nature « Retrait ».
- Infrastructure / Supabase : migration additive (stockage de la part par mois et enveloppe, conversion des transferts), `supabaseRows`, `database.types.ts`, test de contrat.
- Présentation : `Budget.tsx` (bloc « à retirer / retiré », ligne en espèces), `Expenses.tsx` (saisie simplifiée, suppression de « Alimenter »), `Envelopes.tsx` (part du mois, suppression d'« Alimenter »), `Accounts.tsx`, `Setup.tsx`, `PayModePicker.tsx`, `ImportWizard.tsx`, `ImportRow.tsx`, fenêtre de clôture.
- Documentation : ADR (remplace en partie l'ADR 0022), architecture.

## Amendements aux specs liées (à appliquer à l'implémentation, limités)

- 0026 : conservée (solde espèces, ouverture, dépenses en espèces, historique à deux onglets, RG7). Amendée : RG4, D1, D10 (transfert Espèces → enveloppe, bouton « Alimenter ») remplacés par la part du mois (RG11, RG15) ; le virtuel baisse de la part (RG12) ; CA2 sans objet.
- 0006 : RG3 amendée (mode Espèces : aucun compte débité, au lieu du compte « Espèces ») ; RG13 sans objet ; RG1, RG8, RG9 inchangées.
- 0011 : Q3 reste rouverte (0026) ; RG5/RG6 (allocation) amendées par RG12.
- 0016 : RG12 (compte Espèces accepté comme autre compte) remplacée par la destination « Espèces » sans compte.
- 0019 : RG4, RG15 (retrait vers Espèces, cible) reformulées ; les retraits sont des sorties sans cible.
- 0002, 0010 : le compte « Espèces » quitte les comptes de base et la clôture.
- 0008 : le réel d'une ligne en espèces reste la somme des dépenses (RG1) ; la réconciliation (RG19) ajoute une proposition à la clôture.

## Critères d'acceptation

(Auto = test automatisé ; Man = manuel.)

- CA1. Given un retrait de 200 € du principal le 06/10, Then le principal baisse de 200 € dans le solde réel et le solde estimé, et aucun réel, aucune allocation ni « Reste à sortir » ne change. (Auto)
- CA2. Given un débit importé de nature « Retrait », Then un retrait sans compte de destination est créé ; réimport = doublon ; suppression = ligne à nouveau importable ; mois clos ou verrouillé = refus. (Auto)
- CA3. Given Alimentation 100 € et Snack 40 € gérées en espèces et Shopping avec une part de 60 €, Then « à retirer » vaut 200 € ; Given aucun retrait, Then « retiré » vaut 0 € et l'alerte indique 200 € à retirer ; Given un retrait de 200 €, Then plus d'alerte. (Auto sur le calcul, Man sur l'écran)
- CA4. Given une dépense de 35 € sur une ligne en espèces de 40 €, Then le réel de la ligne vaut 35 €, son restant 5 €, le libellé proposé est le nom de la ligne, et aucun solde de compte ne change ; Given une dépense qui dépasse le budget, Then elle est acceptée avec un restant négatif en rouge. (Auto sur le calcul, Man sur l'écran)
- CA5. Given une enveloppe de 100 € alloués et 40 € de part en espèces, Then son solde virtuel est 60 €, son solde espèces 40 € (plus l'ouverture et le report) et le total inchangé ; le virement d'allocation ne porte que 60 €. (Auto)
- CA6. Given une part supérieure à l'allocation ou sur un mois clos ou verrouillé, Then elle est refusée avec un message et rien ne change ; Given une allocation baissée sous la part déjà saisie, Then la baisse est refusée. (Auto sur la règle, Man sur le message)
- CA7. Given une espèces d'enveloppe non dépensée en septembre, Then elle reste au solde espèces en octobre et aucune réconciliation n'est proposée pour l'enveloppe. (Auto)
- CA8. Given une dépense d'enveloppe en espèces supérieure au solde espèces, Then elle est refusée ; Given une dépense en espèces valide, Then seul le solde espèces baisse. (Auto)
- CA9. Given l'écran Enveloppes, Then il n'y a plus de bouton « Alimenter » et la part du mois se saisit directement ; l'historique « Espèces » montre ouverture, parts du mois et dépenses. (Man)
- CA10. Given la clôture d'un mois avec une ligne en espèces dont le réel < budget, Then une proposition est affichée ; Given confirmation, Then une dépense « Reste non saisi » de budget − réel est ajoutée sans débiter de compte et le réel de la ligne vaut le budget ; Given refus, Then le réel est inchangé ; Given aucune ligne concernée, Then aucune proposition. (Auto sur la règle, Man sur l'écran)
- CA11. Given l'interface, Then aucun compte « Espèces » dans Comptes, la clôture, « Payé avec », « De / Vers » et l'import. (Man)
- CA12. Given des données existantes (tableau), When je charge l'application, Then elles sont converties comme décrit : anciens retraits conservés sans perte du débit du principal, anciens transferts Espèces → enveloppe remplacés par une part du mois, solde espèces des enveloppes inchangé, compte Espèces masqué mais présent en base. (Auto)
- CA13. Given la migration, Then sauvegarder puis recharger redonne le même `BudgetData` ; `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

Aucune. Décisions du développeur : virement d'allocation = allocation − part en espèces ; anciens transferts Espèces → enveloppe convertis en part du mois ; compte Espèces gardé en base, masqué ; réconciliation par dépense « Reste non saisi » proposée à la clôture, sur chaque ligne en espèces avec restant ; dépassement avertit sans bloquer ; libellé par défaut = nom de la ligne ; part > allocation refusée, y compris par baisse de l'allocation ; bloc « à retirer / retiré » en tête du Budget.

## Amendement du 2026-11-03 — Dialogue de clôture déplacé (spec 0041)

RG19 : le dialogue de régularisation des lignes en espèces (`CashReconcileDialog`) s'ouvre toujours au clic sur « Clôturer le mois », mais ce bouton est maintenant sur la page « Relevé ». La logique (`closeMonthReconciling`, tout ou rien) est inchangée : elle appelle `closeBlockers`, donc un relevé manquant ou en écart refuse aussi la clôture avec régularisation, sans rien créer.
