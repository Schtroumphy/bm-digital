# 0005 — Solde estimé continu, bascule réel / pointage et régularisation tracée

- Statut : acceptée (validée par le développeur)
- Date : 2026-10-21
- Spec liée : [0009-pointage-des-lignes-du-budget](../specs/0009-pointage-des-lignes-du-budget.md)

## Contexte
Le pointage des lignes (spec 0009) donne un « Solde estimé » par compte. Les premières versions partaient d'un « Solde saisi » par mois, avec une coupure par date. Il pouvait être modifié librement, sans trace de ce qui s'était passé ni de l'erreur éventuelle du solde de départ. L'écran Comptes a déjà un solde calculé (`Ledger`) fondé sur le réel. Il fallait un chiffre fiable, traçable, cohérent avec l'existant, sans devoir pointer rétroactivement tout l'historique.

## Décision
1. Un seul solde de départ par compte (onglet Comptes). Le Solde estimé est continu : début de mois = fin du mois précédent, calculé, jamais saisi.
2. Deux chiffres distincts. Le solde de l'écran Comptes suit le réel. Le Solde estimé compte au réel avant `settings.pointageStart` et au pointage à partir de ce mois.
3. `pointageStart` est posé au premier pointage, modifiable à la main, refusé s'il change le mode d'un mois clôturé.
4. Une seule source de mouvements, `domain/bankMovements.ts`, lue par le `Ledger` et par le Solde estimé. L'égalité des deux chiffres sur tout mois au réel est structurelle (reports de clôture et anciens virements « faits » compris). Exception voulue : le pointage d'une ligne `var` vers un compte dédié déplace l'argent dans les deux modes, le `Ledger` le lit désormais via `bankMovements`.
5. Le relevé bancaire (`accountBalances` réinterprétés, un par compte et par mois) ne modifie jamais le calcul. Il sert à calculer l'écart.
6. L'écart se corrige par une régularisation « écart constaté » (`BudgetData.adjustments`). Elle est annulable, jamais supprimable ni réactivable, et refusée sur mois verrouillé et sur l'épargne. Elle compte dans le Solde estimé et dans le solde du `Ledger`, jamais dans les chiffres du budget.
7. Aucune migration de version : champs facultatifs, `migratePointageStart` idempotente.
8. Le montant pointé n'existe pas (amendement 5) : un pointage est une case et une date. Le montant compté d'une ligne est calculé à la lecture par une fonction unique (`countedAmount`) : son réel s'il existe, sinon son budget ; une ligne `var` vers un compte dédié compte son budget. `migrateCheckAmounts` retire silencieusement l'ancien `amount` des pointages locaux, en gardant la date.
9. Contreparties entre comptes (amendement 6) : un mouvement qui sort du principal pour entrer sur un autre compte (ligne `var` pointée vers un compte dédié, allocation d'enveloppe pointée, ancien virement « fait ») est produit par `bankMovements`, donc visible à la fois dans le `Ledger` et dans le Solde estimé, dans les deux modes.
10. Allocation pointée : l'allocation d'une enveloppe dont le compte résolu n'est pas le principal est pointable. Le pointage enregistre la date et le compte de destination ; le montant est l'allocation du mois lue à chaque lecture. Une enveloppe sur le principal n'a ni case ni mouvement : l'argent y reste et ses dépenses le débitent une seule fois.
11. Isolation des comptes hors budget : un compte hors budget ne touche jamais le principal, ni en sortie ni en entrée. Il enregistre seul son côté de la contrepartie. Les chiffres du budget (Reste à placer, soldes d'enveloppes du `Ledger`) restent inchangés. Aucune donnée n'est réécrite ; les soldes calculés du principal pour les mois concernés changent.
12. *(Remplacé par l'[ADR 0006](0006-une-enveloppe-un-compte-bancaire.md))* Compte par défaut des enveloppes : un réglage unique `settings.envelopeAccountId`, facultatif (absent = principal), non rétroactif. Résolution : Espèces, compte propre actif, défaut actif, principal.

13. Mouvements ignorés affichés en gris (amendement 7) : le détail du compte principal liste, à leur date et en gris, les contreparties que l'isolation d'un compte hors budget ne compte pas. Elles viennent d'une fonction pure `ignoredMovements`, séparée de `bankMovements`, jamais sommée : elles ne peuvent changer ni le Solde estimé, ni les entrées/sorties, ni l'écart, ni le `Ledger`. Il n'y a qu'un seul réglage « Dans le budget » par compte : un compte « non » est à la fois exclu des chiffres du budget et isolé du principal.

14. Compte dédié d'une ligne d'épargne (réconciliation avec la spec 0007) : les mouvements du compte dédié d'une ligne `epa`/`inv` liée sont produits par `bankMovements`, comme les autres. Au réel il reçoit le réel de la ligne au 1er du mois et est débité des sorties d'épargne à leur jour ; au pointage il reçoit le montant compté de la ligne à la date du pointage, le principal étant débité du même montant. Le solde de la ligne (`Ledger.acc`) et le « solde estimé » des blocs Épargnes et Investissements restent au réel.

Suite prévue : une spec « comptes typés » (courant, épargne, investissement, enveloppe, avec soldes propres) reprendra ce réglage comme première brique. Elle n'est pas écrite.

## Alternatives écartées
- Garder le Solde saisi par mois comme ancre : retouche non tracée de l'historique, coupure par date fragile.
- Basculer tout l'historique au pointage : il faudrait pointer rétroactivement tous les mois passés.
- Fusionner Solde estimé et solde Comptes en un seul chiffre : il serait faux dès qu'un pointage diffère du réel.
- Régularisation modifiable ou supprimable : perte de traçabilité.
- Typer tous les comptes tout de suite : trois modèles (comptes, épargne, enveloppes) à unifier, risque élevé sur soldes et clôtures existants.
- Compter l'allocation automatiquement au 1er du mois, sans pointage : fausse la trésorerie tant que le virement réel n'est pas fait.
- Faire entrer les comptes hors budget dans le solde du principal : contredit leur nature de compte à part.
- Proposer ou créer automatiquement un compte « Enveloppes » : l'utilisateur le crée lui-même.
- Un champ « ignoré » dans `bankMovements` : un total (`flowOf`, `Ledger`) risquerait de le compter.
- Garder un montant pointé saisi à la coche : deux montants par ligne (réel et pointé) à réconcilier, sans utilité une fois que le réel prime sur le budget.
- Laisser le calcul du compte dédié dans `Ledger.bankFlow` (spec 0007) à côté de `bankMovements` : deux sources de mouvements pour le même compte, donc risque d'écart entre Solde estimé et écran Comptes.
- Stocker le Solde estimé : il serait périmé à chaque changement ; un calcul pur à la lecture est cohérent avec la décision 4 de l'architecture.

## Conséquences
- Chiffre explicable mois par mois, historique traçable, égalité avec le Ledger testée.
- Aucun passage à une nouvelle version de données.
- Deux chiffres à expliquer à l'utilisateur, d'où la ligne grise « Solde de l'écran Comptes » quand ils diffèrent.
- Un mois en mode pointage ignore les réels des lignes non pointées.
- Changer un réel change immédiatement le Solde estimé des lignes pointées (rien n'est figé dans le pointage) ; seule la clôture du mois fige le chiffre.
- `bankMovements` devient le point central à maintenir : tout nouveau mouvement de compte doit y passer.
- Le solde du principal des mois déjà saisis peut changer pour les contreparties vers un compte hors budget (impact assumé, la régularisation sert de rattrapage).
- `bankMovements` reste l'unique point où ajouter un mouvement de compte ; Ledger et Solde estimé restent égaux en mode réel.
- Le solde d'un compte dédié au pointage peut différer du solde de la ligne d'épargne (`Ledger.acc`, au réel) : c'est voulu, deux notions distinctes.
- Un compte réglé « non » par erreur (cas d'Espèces) n'a plus d'effet silencieux : la liste grise le rend visible.
- La synchro Supabase devra gérer `adjustments`, `pointage_start`, `line_checks.account_id` et `settings.envelope_account_id` (migration SQL prête, non appliquée).
