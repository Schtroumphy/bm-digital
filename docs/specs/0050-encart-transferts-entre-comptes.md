# 0050 — Encart « Transferts entre comptes » sur l'écran Budget

- Statut : à valider (amendement du 2026-11-20 : dépenses associées à UNE ligne de transfert, D14 remplace D1 ; amendement du 2026-11-19 : création, édition et suppression des transferts depuis l'encart, transferts hors totaux du budget ; voir « Historique »)
- Date : 2026-11-18
- Branche prévue : feat/encart_transferts_entre_comptes
- Dépend de : 0007 (ligne d'épargne vers compte dédié), 0019 (réel d'une ligne = ses écritures), 0028 (opérations affectées à un compte), 0043 (encart « À venir »), 0045 (virement vers plusieurs lignes)

## Contexte et objectif

Parole du développeur : les transferts entre comptes se mêlent, dans « À venir ce mois-ci », aux dépenses et au budget prévu, et compliquent la lecture. Il veut un encart dédié pour suivre, par exemple, le transfert prévu de 800 € de « LDDS Travaux » vers « Travaux », réduit par les dépenses de travaux qu'il y rattache lui-même. Dans l'encart « À venir » existant, il veut garder les dépenses réelles et le virement d'épargne prévu du compte principal vers les comptes d'épargne.

Valeur : une lecture claire de « ce qu'il me reste à transférer entre mes comptes ce mois-ci », sans toucher aux soldes ni aux calculs existants.

## État des lieux (vérifié dans le code)

1. Un transfert prévu est une ligne `epa` ou `inv` du budget : compte payeur (`accountId`, absent = principal), compte cible (`linkedAccountId`), jour prévu (`dueDay`), mode d'exécution, budget. Les 4 lignes de la maquette sont de cette forme.
2. Aujourd'hui ces lignes figurent dans « À venir ce mois-ci » sous « À virer » (spec 0043, `accountComingUp`), par compte payeur, et pèsent sur la marge de ce compte. Un compte qui n'a que ces lignes à payer est lui-même affiché dans l'encart (`comingUpAccounts`).
3. Reste d'une ligne `epa`/`inv` = budget − réel dérivé, plancher à 0 (spec 0043, RG5, `leftOfLine`).
4. Réel dérivé d'une ligne `epa`/`inv` (`savingsLineEntries`, spec 0019 RG20 et 0028 RG26) : les virements dont la cible est la ligne, moins les sorties que son compte transmet à une autre ligne d'épargne (sauf transfert, RG46), plus les opérations `var`/`fix`/`rev` **affectées au compte cible de la ligne** (spec 0028). Cette affectation se fait dans l'écran Opérations par le sélecteur « Affecter à » (`AssignPicker`) ; elle vise un **compte**, pas une ligne (`Transaction.assignedAccountId`). *(Amendement du 2026-11-20 : ce comportement par compte est remplacé, pour les lignes de transfert, par l'association à UNE ligne, RG36 à RG45 et D14. Il reste inchangé pour les autres lignes d'épargne.)*
4 bis. Côté lignes variables (spec 0045) le rattachement est porté par le **virement** (`AccountMovement.targets`, jsonb) ; le « viré » d'une ligne `epa`/`inv` est déjà par ligne (`toLine` : virements dont `targets` contient la clé de la ligne).
5. Le pointage manuel n'existe plus (spec 0043) : « fait » veut dire « reste = 0 ».
6. La liste « virements à effectuer » du tableau de bord (`monthTransfers`) est calculée à part et couvre toutes les lignes `epa`/`inv` et les allocations d'enveloppe.

## Périmètre

Inclus :
- Nouvel encart « Transferts entre comptes » sur l'écran Budget, sous l'encart « Investissements » (emplacement modifié le 2026-11-18).
- Retrait de ces transferts de « À venir » (liste, total, marge du compte source).
- Statut calculé par transfert, compteur, barre de progression, pied « Reste à transférer ».
- Détail « prévu / dépenses rattachées / viré » par transfert.

Inclus (amendement du 2026-11-19) :
- Création, édition et suppression d'un transfert depuis l'encart (bouton « Ajouter », clic sur une ligne), sous forme de ligne `epa` du budget.
- Transferts sortis du bloc Épargnes et des totaux du budget.
- Encart vide affiché, avec « Ajouter », sur un mois initialisé sans transfert.

Exclus :
- Création de transferts ailleurs que dans l'encart ; saisie d'un virement réel (écran Opérations, inchangé).
- Pointage manuel, case à cocher cliquable.
- Tableau de bord (inchangé), écran Opérations (inchangé), import, soldes réels, clôture.
- Changement de la formule du reste d'une ligne (spec 0043, RG5) ; changement du réel des lignes qui ne sont pas des transferts (spec 0019).
- Répartir une dépense entre plusieurs lignes de transfert (une dépense = au plus une ligne, RG37), bouton d'association dans l'encart, reprise des dépenses déjà affectées à un compte cible (RG45).

Inclus (amendement du 2026-11-20) : association d'une dépense à UNE ligne de transfert depuis Opérations (nouveau champ sur l'opération, migration additive), réel et reste des transferts alignés sur ces seules dépenses.

## Règles de gestion

Contenu
- RG1. (Amendé le 2026-11-19.) Un « transfert » de l'encart est une ligne `epa` ou `inv` du mois qui a un compte cible (`linkedAccountId`) et dont le **compte payeur n'est pas le compte principal**. Une ligne créée depuis l'encart est toujours une ligne `epa`. Une ligne à budget 0 ou en mode `informatif` reste dans l'encart : seule la création impose un montant > 0 (RG24). (Le critère « compte dans le budget » disparaît : ces lignes sont par définition hors des totaux, RG29.)
- RG2. Le virement du compte principal vers un compte d'épargne (compte payeur = principal) reste dans « À venir » (« À virer »), avec son effet sur la marge, comme aujourd'hui. Les virements vers les comptes dédiés des lignes variables (spec 0045) et les allocations d'enveloppe y restent aussi.
- RG3. Les transferts de RG1 n'apparaissent plus dans « À venir » : ni dans les rubriques, ni dans « Déjà sorti », ni dans le total des restes, ni dans la marge de leur compte payeur. Un compte qui n'avait que ces lignes à payer n'est plus affiché dans « À venir » (spec 0043, RG10).
- RG4. (Amendé le 2026-11-19.) Les lignes `epa`/`inv` payées par le principal ne sont jamais dans le nouvel encart. **Une ligne n'est que dans un seul bloc** : un transfert (RG1) est masqué du bloc Épargnes (et du bloc Investissements pour une ligne `inv`) et n'est que dans l'encart ; une ligne payée par le principal n'est que dans son bloc. Une ligne `epa` existante payée par un autre compte quitte donc le bloc Épargnes pour l'encart. Aucune ligne n'est dans « À venir » et dans l'encart à la fois (RG3).
- RG5. (Amendé le 2026-11-19.) Mois non initialisé : ni encart ni bouton « Ajouter ». Mois initialisé : l'encart est toujours affiché, même sans transfert (RG25).

Calcul d'un transfert
- RG6. (Amendé le 2026-11-20.) Prévu = budget de la ligne. Viré = somme des virements dont la cible est la ligne (rattachement par `targets`, spec 0045), sans déduire les sorties du compte cible (RG46). **Dépenses rattachées = somme des opérations `var`/`fix` associées à CETTE ligne (RG36)**, nette des entrées d'argent `rev` associées à la même ligne. Une dépense affectée au compte cible mais non associée à la ligne n'y compte pas.
- RG7. (Amendé le 2026-11-20.) Reste à transférer = prévu − dépenses associées à la ligne − viré, jamais négatif (le « delta » à virer). Même formule que le reste d'une ligne `epa`/`inv` de la spec 0043 (RG5). Aucune déduction automatique : seules les dépenses que le développeur associe lui-même à la ligne la réduisent ; des fonds déjà présents sur le compte cible ne la réduisent pas. La ligne n'est « Fait » que lorsque le delta a été viré.
- RG8. (Amendé le 2026-11-20.) Exemple : 800 € prévus, 300 € de dépenses associées à la ligne, 0 € viré : delta 500 €, reste 500 €, « Partiel ». Avec ensuite 500 € virés : reste 0, « Fait ». Si le delta n'est pas viré, la ligne n'est pas « Fait ».
- RG9. Détail affiché sur la ligne, dès qu'il y a du viré ou des dépenses associées : « 800 € prévus · 300 € de dépenses rattachées · 0 € viré ». Les montants sont ceux de RG6.
- RG9 bis. Dépenses associées supérieures au prévu (delta négatif) : reste 0, statut « Fait », sans signal ni message (D14).

Statut (calculé, jamais saisi)
- RG10. « À faire » : reste > 0, rien viré et aucune dépense rattachée. « Partiel » : reste > 0 avec du viré ou des dépenses rattachées. « Fait » : reste 0. « En retard » : jour prévu dépassé (`dueDay` ramené au dernier jour d'un mois court), reste > 0, mois non clos (règle de la spec 0043, RG11).
- RG11. Un transfert a un seul badge. « En retard » prime sur « À faire » et « Partiel ». Un transfert sans jour prévu n'est jamais « En retard ». Sur un mois clos, aucun transfert n'est « En retard ».
- RG12. Il n'y a **pas de case à cocher** et aucun pointage manuel. Seul le badge indique l'état.

En-tête, barre et pied
- RG13. Compteur de l'en-tête « n / N » : n = nombre de transferts « Fait », N = nombre de transferts de l'encart. La barre de progression est remplie à n / N (vide quand n = 0).
- RG14. Pied « Reste à transférer » = somme des restes (RG7) de tous les transferts, avec le signe monétaire habituel. Vaut 0 € quand tout est fait.
- RG15. Tri : par jour prévu croissant, les transferts sans jour à la fin, puis ordre du budget.
- RG16. Chaque ligne affiche « Compte payeur → Compte cible », le montant du reste (RG7), et sous le nom « Avant le N » si un jour est prévu (rien sinon). Un nom trop long est tronqué avec « … » et son texte complet est en infobulle.
- RG17. Un transfert « Fait » reste listé (il compte dans n / N), avec un reste de 0 €.

Comportement général
- RG18. (Amendé le 2026-11-19.) L'encart n'est plus purement informatif : il permet de créer, modifier et supprimer la ligne d'un transfert (RG22 à RG28). Ces écritures ne touchent ni solde réel ni écriture bancaire. Le reste, le statut, le compteur, la barre et le pied restent calculés, jamais saisis.
- RG19. (Amendé le 2026-11-19.) Mois clos, verrouillé ou année clôturée : l'encart reste consultable ; « Ajouter » est désactivé, et la modification et la suppression sont refusées (comme `addLine`, `updateLine` et `deleteLine`).
- RG20. Accessibilité : chaque statut est un texte, jamais une couleur seule ; chaque montant a son libellé texte.
- RG21. Le tableau de bord garde sa liste « virements à effectuer » : elle continue de couvrir toutes les lignes `epa`/`inv`, transferts de l'encart compris (RG29 ne les en retire pas). Seuls ses chiffres de budget (répartition) changent, RG29.

Création, édition, suppression (amendement du 2026-11-19)
- RG22. Bouton « Ajouter » en pied d'encart, comme les autres blocs du Budget. Il ouvre un formulaire de création. Désactivé sur un mois clos ou verrouillé ; absent sur un mois non initialisé (RG5).
- RG23. Champs du formulaire : **compte débité** (comptes actifs, sauf le compte principal, les comptes d'enveloppe et « Espèces »), **compte cible** (comptes actifs, sauf le compte principal, sauf le compte débité choisi, et, comme pour le compte débité, sauf les comptes d'enveloppe et « Espèces » ; amendé le 2026-11-19, D13), **montant prévu** (nombre > 0), **jour « Avant le N »** (facultatif, entier de 1 à 31), **libellé** (facultatif).
- RG24. Validation : compte débité, compte cible et montant sont obligatoires ; les deux comptes doivent être différents et le compte cible ne peut pas être le compte principal (ni un compte d'enveloppe, ni « Espèces ») ; le montant doit être > 0 ; le jour, s'il est donné, est un entier de 1 à 31. Sinon l'enregistrement est refusé avec un message, rien n'est créé.
- RG25. Création : une ligne `epa` est ajoutée au mois affiché avec le compte débité comme payeur (`accountId`), le compte cible (`linkedAccountId`), le budget, le jour prévu (`dueDay`) et le libellé. Elle est reconduite comme toute ligne du budget : par le modèle (`saveAsTemplate` / `applyTemplate`) et par « dupliquer le mois précédent ». Elle n'est créée que dans le mois affiché. Mois initialisé sans transfert : l'encart est affiché vide avec « Aucun transfert ce mois-ci » et « Ajouter » ; compteur, barre et pied sont alors absents.
- RG26. Affichage du nom : avec libellé, le titre de la ligne est le libellé et « Compte débité → Compte cible » est montré dans la sous-ligne ; sans libellé, le titre est « Compte débité → Compte cible », qui suit toujours les comptes de la ligne (jamais un nom figé). Dans les autres écrans qui nomment la ligne (tableau de bord, détails), le même nom est utilisé.
- RG27. Édition : un clic sur la ligne ouvre le même formulaire, prérempli, avec une action « Supprimer ». Le **montant** est toujours modifiable (amendé le 2026-11-20 : le verrou de la spec 0045, RG9, ne vise que les lignes variables et ne s'applique jamais à un transfert, même avec un virement rattaché, D18). Les **comptes** (débité et cible) ne sont pas modifiables dès que la ligne a des écritures : un virement qui la vise ou une dépense qui lui est associée (RG36) ; une dépense seulement affectée au compte cible, sans association, n'est pas une écriture de la ligne (amendé le 2026-11-20). Libellé et jour restent modifiables. Mois clos ou verrouillé : tout est refusé (RG19).
- RG28. Suppression : « Supprimer » retire la ligne du mois affiché, après confirmation, dans les mêmes conditions que `deleteLine`. Elle est refusée si la ligne a des écritures (RG27) : le message l'indique. Les autres mois ne sont pas touchés ; un modèle déjà enregistré garde la ligne tant qu'il n'est pas réenregistré.

Totaux du budget (amendement du 2026-11-19)
- RG29. Un transfert (RG1) est **hors des totaux du budget** : il n'entre ni dans le total Épargne (ou Placements) du budget, ni dans le « Reste à placer », ni dans la répartition du tableau de bord, ni dans les autres chiffres du mois qui s'appuient sur les lignes comptées au budget, car l'argent ne quitte pas le compte principal. Cela vaut aussi pour un transfert d'un compte d'épargne vers un autre compte d'épargne. Le reste d'une ligne (RG7), le réel dérivé et les soldes bancaires ne changent pas.
- RG30. Expression dans le code : `isLineInBudget` renvoie faux pour une ligne de transfert (RG1). Le critère de transfert d'une ligne ne doit plus lire `isLineInBudget` (il en dépendrait en boucle) ; il se définit par le bloc, le compte cible et le payeur ≠ principal. Tous les lecteurs de `isLineInBudget` (totaux du budget, tableau de bord, objectifs, simulation, modèle, export CSV, surbrillance du bloc) excluent donc ces lignes d'un seul geste.
- RG31. Le bloc Épargnes et le bloc Placements n'affichent pas les transferts (RG4) ; leurs totaux de bloc ne les comptent pas.
- RG32. (Complété le 2026-11-19.) Exceptions où la ligne reste lue, malgré RG30 : la liste « virements à effectuer » du tableau de bord (RG21), l'encart lui-même, le calcul du reste et du retard de l'encart (qui ne s'appuient pas sur `isLineInBudget`), la progression des objectifs (RG33), le patrimoine du tableau de bord (RG35) et la reconduction par le modèle et par « dupliquer le mois précédent » (RG34).
- RG33. Objectifs : les transferts **restent comptés** dans la progression des objectifs (`goals.ts`, calcul des versements d'un objectif par périmètre). Seuls les totaux du budget (total Épargne, Reste à placer, répartition du tableau de bord) les excluent. `goals.ts` filtre aujourd'hui par `isLineInBudget` : ce filtre doit laisser passer les lignes de transfert (par exemple en n'excluant que les lignes qui sont hors budget pour une autre raison). Le réel d'un transfert (ses virements, ses dépenses associées à la ligne, RG6 et RG40) alimente donc l'objectif qui vise son compte. (Amendé le 2026-11-20 : seules les dépenses associées à la ligne comptent, plus celles affectées au compte en général.)
- RG34. Simulation, modèle et reconduction : un transfert est **hors totaux** de la simulation et du résumé du modèle (`templateSummary`, comme du budget, RG29), mais il est **toujours reconduit** : `saveAsTemplate`, `applyTemplate`, l'écran Modèle (`Template.tsx`, où la ligne est listée, marquée comme hors budget) et « dupliquer le mois précédent » l'incluent. Aucun filtre par `isLineInBudget` dans ces chemins ne doit retirer un transfert de la reconduction ; ce filtre ne sert qu'aux totaux (`simulation.ts`, `templateSummary`) et à l'affichage.
Association d'une dépense à une ligne de transfert (amendement du 2026-11-20, D14)
- RG36. Une opération peut être **associée à UNE ligne de transfert** du mois de l'opération : elle porte alors la clé de cette ligne (champ facultatif de l'opération, ex. `transferLineKey`). L'association n'existe que pour les types d'opération affectables à un compte (`var`, `fix`, `rev`, spec 0028 RG1). Elle ne vaut que si la ligne est un transfert (RG1) du mois de l'opération et que son compte cible est le compte auquel l'opération est affectée.
- RG37. Une opération est associée à **au plus une** ligne de transfert. Une ligne peut recevoir plusieurs opérations.
- RG38. Dans Opérations, le sélecteur « Affecter à » (`AssignPicker`) propose le compte cible puis, **en dessous du compte choisi**, les lignes de transfert du mois de l'opération qui visent ce compte (nom calculé de RG26, avec « Compte débité → Compte cible » si un libellé existe). **Une seule action** pose l'affectation au compte (spec 0028) et le lien à la ligne. Choisir une ligne est facultatif : sans ligne, c'est l'affectation au compte seule, sans effet sur un transfert (RG40). S'il n'existe aucun transfert visant ce compte dans le mois, aucune liste de lignes n'est affichée.
- RG39. Retrait : choisir « Aucune ligne » retire le lien et garde l'affectation au compte ; retirer l'affectation au compte (ou passer à « Compte au budget » / « Hors budget ») retire aussi le lien. Il n'y a **pas de bouton d'association dans l'encart** : tout passe par Opérations.
- RG40. Seules les opérations associées à la ligne comptent dans son réel dérivé (`Line.actual`, donc les objectifs RG33), son « rattaché » et son reste. Pour une ligne `epa`/`inv` qui n'est pas un transfert (payée par le principal), le réel dérivé reste calculé par compte (spec 0028 RG26), inchangé. Le calcul par compte de `assignedToSavingsNet` et du détail d'un compte est inchangé.
- RG41. L'opération associée est **hors budget du mois** et sort du réel de sa ligne d'origine, comme toute opération affectée à un compte (D2, spec 0028 RG5) ; le lien ne change pas cela.
- RG42. Mois clos ou verrouillé : association, changement et retrait du lien sont refusés, comme l'affectation à un compte.
- RG43. Reconduction : les liens **ne sont jamais reconduits** d'un mois à l'autre (modèle, « dupliquer le mois précédent » ne copient pas d'opérations). Une nouvelle dépense n'a pas de lien tant qu'on ne l'associe pas ; l'import ne pose jamais de lien.
- RG44. Cohérence du lien (décisions D15 à D17) :
  - Ligne supprimée ou remplacée (par exemple « écraser les lignes d'un mois ») : le lien est **ignoré**. Il reste sur l'opération, sans effet ni erreur ; l'affectation au compte reste ; aucune opération n'est modifiée en silence. Si une ligne de même clé réapparaît dans le mois, le lien y reprend effet tant que RG36 est remplie.
  - L'opération **change de mois** : le lien est **retiré automatiquement** ; l'affectation au compte reste.
  - L'opération **change de compte d'affectation, de type**, ou passe **hors budget / au budget** : le lien est **retiré** dès que la condition de RG36 n'est plus remplie (type non affectable, ou compte d'affectation différent du compte cible de la ligne, ou plus d'affectation).
- RG45. Aucune reprise : les opérations déjà affectées à un compte cible avant cet amendement n'ont pas de lien ; elles cessent de réduire le reste d'un transfert et de compter dans son réel dérivé. Aucune migration de données.
Rattachement d'un virement à une ligne de transfert depuis Opérations (amendement du 2026-11-20, D18)
- RG47. Un virement (`AccountMovement`) peut être rattaché, **à la création et en édition**, à UNE ligne de transfert du mois du virement, par le sélecteur « Rattacher à (facultatif) » de l'écran Opérations. Le rattachement est facultatif (« Aucune » = virement libre, ou retrait du rattachement).
- RG48. Lignes proposées : celles dont le **compte cible est la destination du virement** (règle existante `isValidTransferTargets`, spec 0045 RG2). La **source du virement n'est pas contrôlée** et aucun avertissement n'est affiché : un virement « Principal → Travaux » compte pour la ligne « LDDS Travaux → Travaux ». Le nom affiché est celui de RG26.
- RG49. Un virement vise **une seule** ligne de transfert (ou une seule cible épargne / investissement / enveloppe, ou des lignes variables d'un compte dédié, jamais un mélange : spec 0045, RG2). Une ligne de transfert peut recevoir plusieurs virements. Pas de répartition d'un montant entre plusieurs lignes.
- RG50. En **édition** d'un virement existant (importé ou saisi), le sélecteur est le même qu'à la création et reprend le rattachement actuel. Choisir une ligne pose le rattachement, « Aucune » le retire. Le contrôle de validité est celui de la couche application (`updateAccountMovement` valide `targets` par `isValidTransferTargets`) ; un choix invalide est refusé sans changement. Mois clos ou verrouillé : modification refusée, comme toute édition d'un virement.
- RG51. À la création, le comportement par défaut existant est inchangé : la ligne dont le payeur correspond à la source du virement est proposée, sinon la première ligne qui vise la destination, « Aucune » restant possible. **Rattachement manuel seulement** : aucune proposition automatique pour un virement importé.
- RG52. Effet du rattachement : le montant du virement entier compte dans le « viré » de la ligne (RG6, RG46), donc dans son reste, son statut, son compteur, le pied, son réel dérivé et les objectifs (RG33). Le retrait du rattachement annule cet effet. Un virement rattaché à la ligne verrouille les comptes de la ligne et refuse sa suppression (RG27, RG28) ; il ne verrouille jamais son montant (RG27 amendée).
- RG46. (Retour du test manuel, 2026-11-20.) Les virements **sortants du compte cible** ne déduisent rien : « Viré » = les seuls virements rattachés à la ligne (`targets` contient sa clé) ; un virement du compte cible vers un autre compte (par exemple 159,70 € de « Travaux » vers Boursorama) n'a aucun effet sur le viré, le reste, le statut, le compteur, le pied, le réel dérivé de la ligne ni les objectifs. Un virement entrant non rattaché à la ligne ne compte pas non plus. Cela remplace « nette des sorties transmises » de RG6 pour une ligne de transfert ; les lignes `epa`/`inv` payées par le principal gardent leur calcul (RG40).

- RG35. (Décision du développeur, 2026-11-19.) Patrimoine : les transferts restent comptés dans « Patrimoine » du tableau de bord et dans la liste de ses comptes (`wealthAt`, `wealthRows` de `dashboard.ts`), car leurs soldes ne changent pas. Exception supplémentaire à RG30. Les écrans qui nomment les lignes d'épargne (liste des comptes de lignes, cibles de virement, cibles d'une sortie d'épargne et d'une dépense dans Opérations, import) affichent le nom calculé de RG26 pour un transfert sans libellé (`lineDisplayName`).

## Parcours utilisateur

Nominal : la ligne « Transfert Travaux » (800 €, payeur « LDDS Travaux », cible « Travaux », avant le 5) est prévue. J'ouvre le Budget : l'encart affiche « LDDS Travaux → Travaux · 800 € · À faire ». Je paie 300 € de travaux avec mon compte principal, puis, dans Opérations, j'affecte cette dépense au compte « Travaux » et, en dessous, à la ligne « LDDS Travaux → Travaux » (une seule action) : la ligne passe à 500 €, badge « Partiel », détail « 800 € prévus · 300 € de dépenses rattachées · 0 € viré ». J'importe ensuite le virement de 500 € LDDS Travaux → Travaux rattaché à la ligne : reste 0, « Fait », le compteur monte.

Cas limites :
- Jour prévu dépassé et reste > 0 : badge « En retard » (mois courant ou passé non clos).
- Dépense rattachée supérieure au prévu : reste 0, « Fait » (pas de reste négatif).
- Aucun transfert hors principal : encart absent ; « À venir » inchangé pour le principal.
- Ligne `epa` payée par le principal : reste dans « À venir ».
- Ligne en mode `informatif`, budget à 0 ou hors budget : absente de l'encart.
- Mois futur : tous « À faire », aucun « En retard ».
- Mois clos : consultation seule, aucun « En retard ».
- Compte source qui n'avait que ces lignes à payer : disparaît de « À venir ».

## Design

Source : maquette fournie par le développeur (`/private/tmp/claude-502/-Users-jeanloth-Documents-Development-React-bm-digital/bc3237c9-b08d-455e-8397-e00d358d9eb6/images/1.png`), complétée ci-dessous. **Les ajouts marqués « proposé » sont à valider.**

Maquette : en-tête (icône transfert, titre « Transferts entre comptes », compteur « 0 / 4 »), barre de progression, 4 lignes (« LDDS Travaux → Travaux · 100 € · Avant le 5 · À faire », « Livret A → Lydia Holidays · 100 € · Avant le 10 », « Caisse d'épargne → Vacances Ma… · 80 € · Avant le 15 », « Livret A → Vacances copines · 50 € · Avant le 20 »), pied « Reste à transférer 330 € ».

Modifications proposées par rapport à la maquette :
- La case à cocher à gauche est **remplacée** (RG12) par une pastille d'état non cliquable : vide pour « À faire », à moitié pleine pour « Partiel », cochée pour « Fait » (la pastille est un repère visuel du badge, sans interaction).
- Badges : « À faire » (teinte de la maquette), « Partiel », « Fait », « En retard » (réutiliser la teinte d'alerte de `alert-pill`).
- Deuxième sous-ligne (proposé) sous « Avant le N », visible seulement s'il y a du viré ou des dépenses rattachées : « 800 € prévus · 300 € de dépenses rattachées · 0 € viré ».

```
┌ ⇄ Transferts entre comptes ───────────────── 1 / 4 ┐
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░                    │
│ ◐ LDDS Travaux → Travaux              500 €         │
│   Avant le 5                          [Partiel]     │
│   800 € prévus · 300 € de dépenses rattachées · 0 € viré │
│ ○ Livret A → Lydia Holidays           100 €         │
│   Avant le 10                         [À faire]     │
│ ● Caisse d'épargne → Vacances Ma…       0 €         │
│   Avant le 15                         [Fait]        │
│ ○ Livret A → Vacances copines          50 €         │
│   Avant le 20                         [En retard]   │
│ Reste à transférer                    650 €         │
└─────────────────────────────────────────────────────┘
```

Réutiliser : `panel block`, `block-head`, `block-icon` (icône `transfer`), `toneVars`/`HUE`, `AccountDot` si utile, lignes `pt-line` / `pt-row`, mêmes composants que `ComingUpCard`. Emplacement : colonne des Épargnes et Investissements, juste sous l'encart « Investissements ». Desktop 1440 px uniquement.

États : chargé (ci-dessus), tous faits (compteur n / n, barre pleine, pied 0 €), mois clos (consultation seule, « Ajouter » désactivé, aucun « En retard »), mois futur, vide (amendement du 2026-11-19 : encart affiché avec « Aucun transfert ce mois-ci » et « Ajouter », sans compteur, barre ni pied), mois non initialisé (encart absent).

Amendement du 2026-11-19, design proposé, à valider :
- Pied d'encart : bouton « Ajouter » (`add-btn`, icône `plus`, même style que les autres blocs), sous la ligne « Reste à transférer » ; en désactivé (`is-disabled`) sur mois clos ou verrouillé.
- Ligne cliquable (curseur main) : ouvre le formulaire. Avec libellé : titre = libellé, sous-ligne « Compte débité → Compte cible · Avant le N ».
- Formulaire (fenêtre modale comme les autres modales de saisie de l'app, par ex. `AnnotationModal`) : « Compte débité », « Compte cible » (listes déroulantes au design du filtre rapide par compte de l'écran Opérations : pilule `menu-pill`, composant partagé `Menu`, pastille de couleur et nom du compte ; clavier : Entrée ou Espace ouvre, Échap ferme), « Montant prévu », « Avant le (jour du mois) » facultatif, « Libellé » facultatif ; boutons « Enregistrer », « Annuler » et, en édition, « Supprimer ». Champs non modifiables grisés avec leur raison (RG27). Tous les champs du formulaire (listes, montant, jour, libellé) ont le même design : pilule grise de 36 px au fond `rgba(32, 30, 29, 0.05)`, sans bordure, texte aligné à gauche, libellé au-dessus, anneau violet au focus ; la liste ouverte s'étend à la largeur du champ.
- Vide :

```
┌ ⇄ Transferts entre comptes ─────────────────────────┐
│   Aucun transfert ce mois-ci                         │
│ (+) Ajouter                                          │
└──────────────────────────────────────────────────────┘
```

## Impact technique (quoi)

- Domaine : fonction pure de liste des transferts du mois avec prévu, viré, dépenses rattachées, reste, statut et jour prévu ; critère RG1 (hors principal) réutilisable par `comingUp` pour exclure ces lignes (`payLines`, `comingUpAccounts`, `leftLineKeys`, tâches de retard de « À venir »). Pas de nouveau type de donnée persistant ; le calcul lit les virements et les opérations affectées existants. Distinguer « viré » et « rattaché » nécessite de séparer deux sommes aujourd'hui fusionnées dans le réel dérivé d'une ligne (`savingsLineEntries`) sans changer la somme.
- Application (amendé) : actions de création, de modification et de suppression d'un transfert, qui s'appuient sur les règles existantes de `addLine`, `updateLine` (verrou de budget 0045 RG9) et `deleteLine` (mois clos, mois non initialisé), plus la validation RG24 et les verrous RG27 / RG28. Aucun nouveau port ni nouveau type : une ligne `epa` suffit.
- Domaine (amendé) : le critère de transfert (RG1) devient indépendant de `isLineInBudget` ; `isLineInBudget` (`domain/bank.ts`) renvoie faux pour une ligne de transfert (RG30) ; le nom affiché d'une ligne de transfert est calculé (RG26) ; la liste « virements à effectuer » du tableau de bord (`monthTransfers`) continue de lire ces lignes (elle filtre aujourd'hui par `isLineInBudget`).
- Infrastructure / Supabase (amendé le 2026-11-20) : **une migration additive** : colonne nullable sur `transactions` pour la clé de la ligne de transfert (ex. `transfer_line_key text`), sans défaut ni reprise de données ; mise à jour de `database.types.ts`, de `supabaseRows` (écriture et lecture, absent = `undefined`) et du test de contrat du dépôt (opération avec et sans lien, base sans la colonne rejouable). Une ligne `epa` avec payeur, compte cible et jour prévu est déjà persistée (spec 0007, 0009). Un libellé vide doit survivre à l'aller-retour de sauvegarde.
- Domaine / application (amendé le 2026-11-20) : `Transaction` gagne le champ facultatif du lien ; `savingsLineEntries`, `lineEntryAmounts` et `lineSpentNet` (`lineActuals.ts`) lisent, pour une ligne de transfert, les seules opérations dont le lien vaut la clé de la ligne, et gardent le calcul par compte pour les autres lignes `epa`/`inv` ; `assignedToSavingsNet` et le détail d'un compte restent par compte. Le prédicat « ligne de transfert » est déjà utilisé par `accountTransfers.ts`, qui importe `lineActuals.ts` : le placer dans un module partagé évite une dépendance circulaire. `transferLocks` (RG27) compte les dépenses associées et non plus les dépenses affectées au compte. Le retrait automatique du lien (RG44) se fait dans l'action de modification d'une opération (`updateTransaction`, `actions.ts`) : quand son mois, son type, son compte d'affectation ou son état hors budget / au budget change et que la condition de RG36 n'est plus remplie, elle efface le lien dans le même geste (une seule écriture, même refus sur mois clos). Rien n'est nettoyé quand une ligne disparaît (écrasement du mois, suppression) : le lien est ignoré à la lecture (lecteurs de `lineActuals.ts` et de l'encart, qui ne cherchent le lien que parmi les lignes de transfert existantes). L'action d'affectation d'une opération (spec 0028) pose ou retire le lien en même temps que le compte, refuse le lien hors mois ouvert (RG42), et l'import ne le renseigne jamais (RG43). `AssignPicker` / Opérations : liste des lignes de transfert sous le compte (RG38).
- Rattachement d'un virement en édition (amendement du 2026-11-20, D18) : présentation seulement. Dans la liste des transferts du mois de `Expenses.tsx` (~l.836-905), l'édition n'offre aujourd'hui que des cases à cocher sur les lignes variables (`proposableLines`, `linksLines`), sans sélecteur pour une cible épargne, investissement ou enveloppe ; il faut y ajouter le sélecteur « Rattacher à (facultatif) » de la création (`transferItems` filtrés sur la destination, hors lignes variables, avec « Aucune ») et envoyer `targets` dans l'action d'enregistrement quand le virement n'est pas rattaché à des lignes variables. La couche application ne change pas : `updateAccountMovement` valide déjà `targets` par `isValidTransferTargets`, qui n'exige que « destination = compte cible » et une seule cible épargne / investissement. Le montant d'une ligne de transfert n'est pas verrouillé par un virement : `movementsLinkedTo` / `budgetLockReason` restent limités aux lignes variables, et le texte de RG27 est corrigé en conséquence. Note pour l'implementer : le commentaire de `savingsLineEntries` (`lineActuals.ts`) doit renvoyer à RG46 (« sauf pour un transfert, les sorties transmises ne sont pas déduites »).
- Tests existants impactés (RG40) : `src/domain/accountTransfers.test.ts` et `src/application/accountTransfers.test.ts` (cas « dépenses affectées au compte cible » : il faut les associer à la ligne) ; tests d'objectifs (`goals`) et de réel dérivé d'une ligne `epa` payée par un autre compte ; `lineActuals` (réel d'une ligne d'épargne avec opérations affectées : inchangé pour une ligne payée par le principal) ; `assignedOperations.test.ts` (inchangé, par compte) ; test de contrat du dépôt (nouveau champ) ; tests de l'écran Opérations qui touchent à « Affecter à ».
- Présentation : nouveau composant d'encart dans `Budget.tsx` sous l'encart Investissements ; formulaire modal de création / édition ; blocs Épargnes et Placements qui masquent les transferts ; ajustement de `ComingUpCard` (plus de ces lignes ni de ces comptes).
- Tests existants impactés par RG29 / RG30 (à relire et mettre à jour, sans en affaiblir le sens) : `src/domain/accountTransfers.test.ts` (CA12 : le commentaire « une ligne d'épargne n'est jamais hors budget » devient faux) ; `src/domain/dashboard.test.ts` (commentaire et cas de la ligne ~249 : « une ligne d'épargne ou de placement est toujours dans le budget ») ; `src/application/checkoff.test.ts` (cas ~206, ~241, ~268, ~279 qui s'appuient sur `isLineInBudget`, à vérifier avec des lignes payées par un compte hors principal) ; `comingUp.test.ts` ; tout test de budget, d'objectifs ou de simulation qui a une ligne `epa` payée par un autre compte que le principal.
- Lecteurs de `isLineInBudget` à traiter un par un après RG30 (D11, D12) : `goals.ts` (garder les transferts, RG33), `simulation.ts` et `templateSummary` dans `budget.ts` (hors totaux, RG34), `Template.tsx` (listés, marqués hors budget), `saveAsTemplate` / `applyTemplate` / « dupliquer le mois précédent » (toujours reconduits, vérifier qu'aucun filtre ne les retire), `monthTransfers` du tableau de bord (les garder, RG21), totaux du Budget et du tableau de bord (les exclure, RG29).
- Tests nouveaux : objectifs (CA36), simulation et résumé du modèle (CA37), modèle (CA38), duplication (CA39), cible principal refusée (CA24, CA40), création, validation, édition, verrous (montant, comptes), suppression, mois clos, reconduction par le modèle et « dupliquer le mois précédent », totaux (total Épargne, reste à placer, répartition du tableau de bord) avec et sans transfert, masquage dans les blocs, aller-retour de sauvegarde, liste « virements à effectuer » inchangée.
- Tests : du reste, du statut, du compteur, du pied, de l'exclusion de « À venir » ; mise à jour des tests de `comingUp.test.ts` concernés.
- Documentation : amendement de la spec 0043 (RG7 « À virer » et RG10) et de `docs/architecture.md`.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle par le reviewer.)

- CA1. Given une ligne `epa` de 100 € payée par « Livret A » vers « Lydia Holidays », Then elle est dans l'encart « Transferts entre comptes » et plus dans « À venir ». (Auto)
- CA2. Given une ligne `epa` de 300 € payée par le compte principal vers « Livret A », Then elle reste dans « À venir » (« À virer ») et pèse sur la marge, et n'est pas dans le nouvel encart. (Auto)
- CA3. Given les virements vers un compte dédié de lignes variables (spec 0045) et une allocation d'enveloppe, Then ils restent dans « À venir », inchangés. (Auto)
- CA4. Given un transfert de 800 € sans écriture, Then reste = 800 €, statut « À faire ». (Auto)
- CA5. (Amendé le 2026-11-20.) Given ce transfert et 300 € de dépenses associées à cette ligne, Then reste = 500 €, statut « Partiel », détail « 800 € prévus · 300 € de dépenses rattachées · 0 € viré ». (Auto sur le calcul, Man sur l'affichage)
- CA6. Given le même transfert avec 500 € virés en plus, Then reste = 0, statut « Fait », compteur +1. (Auto)
- CA7. (Amendé le 2026-11-20.) Given 300 € de dépenses non affectées, ou affectées au compte cible mais non associées à la ligne, Then elles ne réduisent pas le reste (aucune déduction automatique). (Auto)
- CA8. (Amendé le 2026-11-20.) Given des dépenses associées supérieures au prévu, Then le reste est 0, le statut est « Fait », sans signal ni message. (Auto)
- CA9. Given un jour prévu dépassé, un reste > 0 et un mois non clos, Then le statut est « En retard » ; sans jour prévu ou sur un mois clos, il ne l'est jamais. (Auto)
- CA10. Given 4 transferts dont 1 « Fait », Then le compteur affiche « 1 / 4 » et la barre est remplie au quart. (Auto sur le calcul, Man sur la barre)
- CA11. Given les restes 100, 100, 80 et 50 €, Then le pied affiche « Reste à transférer 330 € » ; quand tout est fait, 0 €. (Auto)
- CA12. (Amendé.) Given une ligne `epa` sans compte cible, ou payée par le principal, Then elle n'est pas dans l'encart. Given une ligne à compte cible, payée par un autre compte, à budget 0 ou en mode `informatif`, Then elle reste dans l'encart (RG1). (Auto)
- CA13. (Amendé.) Given un mois initialisé sans transfert, Then l'encart est affiché avec « Aucun transfert ce mois-ci » et « Ajouter », sans compteur, barre ni pied ; Given un mois non initialisé, Then ni encart ni bouton. (Auto sur la liste, Man sur l'écran)
- CA14. Given un compte source dont les seules lignes à payer sont des transferts de l'encart, Then il n'est plus affiché dans « À venir ». (Auto)
- CA15. Given les transferts sans jour prévu, Then aucun « Avant le N » n'est affiché et ils sont listés après ceux qui en ont un. (Auto sur le tri, Man sur l'écran)
- CA16. (Amendé.) Given l'encart, Then il n'y a aucune case à cocher cliquable ; les seules actions sont « Ajouter » et le clic sur une ligne (formulaire). (Man)
- CA17. Given un nom trop long, Then il est tronqué avec « … » et complet en infobulle. (Man)
- CA18. (Amendé.) Given un mois clos ou verrouillé, Then l'encart est consultable, « Ajouter » est désactivé, modification et suppression sont refusées, et aucun transfert n'est « En retard ». (Auto, Man)
- CA19. Given le tableau de bord, Then ses « virements à effectuer » couvrent toujours toutes les lignes `epa`/`inv`, transferts de l'encart compris. (Auto)
- CA20. Given les mêmes données, Then soldes réels, réels des lignes, relevé et clôture ont les mêmes valeurs qu'avant. (Auto)
- CA21. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)
- CA22. Given un mois initialisé et ouvert, When je clique « Ajouter » et saisis compte débité « LDDS Travaux », compte cible « Travaux », montant 800, jour 5, sans libellé, Then une ligne `epa` est créée dans le mois, l'encart l'affiche « LDDS Travaux → Travaux · 800 € · Avant le 5 · À faire ». (Auto sur l'action, Man sur le formulaire)
- CA23. (Amendé.) Given le formulaire, Then le compte débité ne propose ni le principal, ni un compte d'enveloppe, ni « Espèces », ni un compte archivé ; le compte cible ne propose ni le principal, ni le compte débité choisi, ni un compte d'enveloppe, ni « Espèces », ni un compte archivé. (Auto sur la liste, Man sur l'écran)
- CA24. (Amendé.) Given un montant 0 ou négatif, deux comptes identiques, un compte manquant, le compte principal comme cible, ou un jour hors 1 à 31, Then l'enregistrement est refusé et aucune ligne n'est créée ni modifiée. (Auto)
- CA25. Given un transfert avec libellé « Travaux salle de bain », Then le titre est ce libellé et la sous-ligne montre « Compte débité → Compte cible » ; sans libellé, le titre est « Compte débité → Compte cible » et suit un changement de comptes. (Auto sur le nom calculé, Man sur l'écran)
- CA26. Given un transfert, When je clique sa ligne, Then le formulaire s'ouvre prérempli ; When je change le montant, le jour ou le libellé et enregistre, Then la ligne est mise à jour. (Auto sur l'action, Man sur l'écran)
- CA27. (Amendé le 2026-11-20.) Given un transfert, avec ou sans virement et dépense associés, Then son montant, son jour et son libellé restent modifiables. (Auto)
- CA28. (Amendé le 2026-11-20.) Given un transfert qui a un virement rattaché ou une dépense associée à la ligne, Then ses comptes ne sont pas modifiables et sa suppression est refusée avec un message ; sans écriture, comptes modifiables et suppression acceptée. (Auto)
- CA29. Given « Supprimer » confirmé sur un transfert sans écriture, Then la ligne disparaît du mois affiché, les autres mois et les soldes ne changent pas. (Auto)
- CA30. Given un mois clos ou verrouillé, Then création, modification et suppression sont refusées. (Auto)
- CA31. Given un transfert créé, When j'applique le modèle ou « dupliquer le mois précédent » sur un mois suivant, Then la ligne y existe avec ses comptes, son montant, son jour et son libellé ; elle n'est pas créée dans les autres mois d'office. (Auto)
- CA32. Given un transfert de 800 €, Then le total Épargne du budget, le « Reste à placer » et la répartition du tableau de bord sont identiques à ceux du même mois sans cette ligne, y compris pour un transfert d'un compte d'épargne vers un autre. (Auto)
- CA33. Given un transfert, Then il n'apparaît pas dans le bloc Épargnes (ni Placements pour une ligne `inv`) ni dans ses totaux ; Given une ligne `epa` payée par le principal, Then elle y reste. (Auto sur la sélection, Man sur l'écran)
- CA34. Given une ligne `epa` existante payée par un compte autre que le principal, Then elle quitte le bloc Épargnes, apparaît dans l'encart et sort des totaux (RG4, RG29). (Auto)
- CA35. Given une sauvegarde puis un rechargement (contrat du dépôt), Then un transfert avec ou sans libellé revient identique. (Auto)
- CA36. (Amendé le 2026-11-20.) Given un objectif d'épargne dont le périmètre couvre le compte « Travaux » et un transfert de 800 € vers « Travaux » avec 500 € virés et 300 € de dépenses associées à la ligne, Then la progression de l'objectif compte ces virements et ces dépenses associées, mais pas une autre dépense seulement affectée au compte « Travaux », alors que le total Épargne du budget ne compte rien de cela. (Auto)
- CA37. Given un transfert, Then `templateSummary` (résumé du modèle) et la simulation ne le comptent pas dans leurs totaux. (Auto)
- CA38. Given un transfert, When j'enregistre le mois comme modèle puis l'applique à un autre mois, Then la ligne est dans le modèle (listée, marquée hors budget dans l'écran Modèle) et dans le nouveau mois avec comptes, montant, jour et libellé. (Auto sur `saveAsTemplate` / `applyTemplate`, Man sur l'écran Modèle)
- CA39. Given un transfert, When je duplique le mois précédent, Then la ligne est dans le mois créé. (Auto, couvre aussi CA31)
- CA40. Given une ligne `epa` existante dont le compte cible est le compte principal et dont le payeur n'est pas le principal, Then elle reste dans l'encart et affichée (RG1 inchangée) ; seule la création et l'édition de comptes dans le formulaire refusent le principal comme cible. (Auto)

- CA41. Given le tableau de bord, Then un transfert reste compté dans « Patrimoine » et dans la liste de ses comptes ; Given un transfert sans libellé, Then les listes qui nomment les lignes d'épargne affichent « Compte débité → Compte cible ». (Auto)
- CA42. Given deux transferts du mois vers le même compte « Travaux » et une dépense de 300 € associée au premier, Then seul le reste du premier baisse ; l'autre est inchangé. (Auto)
- CA43. Given l'écran Opérations, une dépense `var` ou `fix` et le compte « Travaux » choisi dans « Affecter à », Then les lignes de transfert du mois qui visent « Travaux » sont listées sous le compte, avec « Aucune ligne » ; When je choisis une ligne, Then l'affectation au compte et le lien sont posés en une seule action. (Auto sur l'action, Man sur l'écran)
- CA44. Given un compte sans transfert dans le mois, Then aucune liste de lignes n'est affichée sous lui ; Given un type d'opération non affectable (`env`, `epa`, `epd`…), Then aucune association n'est proposée. (Auto sur la liste, Man sur l'écran)
- CA45. Given une dépense associée, When je choisis « Aucune ligne », Then le lien est retiré et l'affectation au compte reste ; When je retire l'affectation au compte ou passe à « Compté au budget » / « Hors budget », Then le lien est retiré aussi. (Auto)
- CA46. Given une dépense associée à une ligne, Then elle est hors budget du mois et hors du réel de sa ligne d'origine, comme avant. (Auto)
- CA47. Given un mois clos ou verrouillé, Then association, changement et retrait du lien sont refusés. (Auto)
- CA48. Given un transfert avec dépenses associées, When j'applique le modèle ou « dupliquer le mois précédent », Then le mois créé n'a aucun lien, et la ligne reconduite a un reste égal à son prévu. (Auto)
- CA49. Given une opération affectée au compte cible avant cet amendement, sans lien, Then elle ne réduit pas le reste du transfert et ne compte pas dans son réel dérivé ; son affectation au compte reste valable pour le détail du compte et le hors budget. (Auto)
- CA50. Given une ligne `epa` payée par le principal avec des opérations affectées à son compte, Then son réel dérivé et son reste restent calculés par compte, inchangés. (Auto)
- CA51. Given une sauvegarde puis un rechargement (contrat du dépôt), Then une opération avec ou sans lien revient identique, et une base existante sans la nouvelle colonne se charge sans erreur. (Auto sur la conversion, Man sur la base)
- CA53. Given une dépense associée à une ligne de transfert, When la ligne disparaît (par exemple le mois est écrasé par le modèle), Then la dépense garde son affectation au compte et son lien inerte, aucun calcul ni écran n'est en erreur et le lien n'a aucun effet ; When une ligne de même clé existe de nouveau dans le mois, Then le lien reprend effet. (Auto)
- CA54. Given une dépense associée, When je change son mois, Then son lien est retiré et son affectation au compte reste. (Auto)
  Note de mise en œuvre (2026-11-20) : le mois d'une opération est immuable (aucune action ne le change), la règle de CA54 est donc respectée par construction, sans test dédié.
- CA55. Given une dépense associée, When je change son compte d'affectation, son type (vers un type non affectable) ou la passe « Compté au budget » / « Hors budget », Then son lien est retiré. Given un changement qui garde RG36 vraie (libellé, montant, jour), Then le lien reste. (Auto)
- CA56. Given un transfert de 800 € vers « Travaux », un virement de 159,70 € de « Travaux » vers un autre compte et aucun virement entrant rattaché, Then viré = 0, reste = 800, statut « À faire », le réel de la ligne et les objectifs ne bougent pas ; Given une ligne `epa` payée par le principal, Then ses sorties transmises restent déduites. (Auto)
- CA57. Given l'édition d'un virement existant (par exemple importé) à destination de « Travaux » et une ligne de transfert « LDDS Travaux → Travaux », Then le sélecteur « Rattacher à (facultatif) » propose cette ligne et « Aucune » ; When je choisis la ligne et enregistre, Then son viré vaut le montant du virement, son reste, son statut, le compteur et le pied suivent, et le virement se rattache ; When je choisis « Aucune », Then le rattachement disparaît et le viré revient à sa valeur d'avant. (Auto sur l'action, Man sur l'écran)
- CA58. Given un virement « Principal → Travaux » et la ligne « LDDS Travaux → Travaux », Then le rattachement est accepté et compte dans le viré, sans avertissement ; Given un virement à destination d'un autre compte que « Travaux », Then la ligne n'est pas proposée et un rattachement forcé est refusé par `isValidTransferTargets`. (Auto)
- CA59. Given un virement rattaché à une ligne de transfert, Then il ne peut pas l'être en plus à une deuxième ligne de transfert ni à une ligne variable (un seul choix) ; Given deux virements, Then ils peuvent viser la même ligne et leurs montants s'additionnent dans le viré. (Auto)
- CA60. Given un mois clos ou verrouillé, Then l'édition d'un virement, donc son rattachement et son retrait, est refusée. (Auto)
- CA61. Given un virement rattaché à une ligne de transfert, Then le montant de la ligne reste modifiable, ses comptes ne le sont plus et sa suppression est refusée. (Auto)
- CA62. Given la création d'un virement vers « Travaux », Then la ligne dont le payeur correspond à la source est proposée par défaut, sinon la première ; « Aucune » reste possible. Given un virement importé, Then aucun rattachement automatique n'est posé. (Auto sur la sélection par défaut)
- CA52. Given un transfert avec une dépense associée, When je tente de changer ses comptes ou de le supprimer, Then c'est refusé (CA28) ; Given une dépense seulement affectée au compte cible, Then ce n'est pas refusé. (Auto)

## Décisions du développeur

- D1. *(Remplacée par D14 le 2026-11-20.)* Le rattachement passait par l'affectation au compte cible (spec 0028), avec la limite « deux lignes vers le même compte se déduisent de la même dépense ». Cette limite n'existe plus.
- D2. Une dépense affectée à un compte sort du budget du mois et des soldes réels : c'est voulu, y compris pour les dépenses de travaux payées depuis le principal.
- D3. Les transferts de l'encart sont retirés de la marge de leur compte payeur dans « À venir » (RG3). La marge affichée de ces comptes change en conséquence.
- D4. Un seul badge par transfert ; « En retard » prime sur « Partiel » (RG11).
- D5. Le détail « prévu · dépenses rattachées · viré » est une sous-ligne visible seulement s'il y a du viré ou des dépenses rattachées (RG9), pas une infobulle.

## Décisions de l'amendement du 2026-11-19 (développeur)

- D6. Un transfert est une ligne `epa` existante (compte débité ≠ principal), pas un objet distinct ni une migration.
- D7. Une ligne n'est que dans un bloc : les transferts sont masqués du bloc Épargnes ; une ligne `epa` existante payée par un autre compte passe dans l'encart (RG4).
- D8. Les transferts sont sortis des totaux du budget (total Épargne, Reste à placer, répartition du tableau de bord), y compris d'épargne vers épargne (RG29, RG30).
- D9. Durée de vie comme toute ligne du budget : créée dans le mois affiché, reconduite par le modèle et « dupliquer le mois précédent » (RG25).
- D10. Formulaire, édition, suppression, verrous, bouton « Ajouter », encart vide sur mois initialisé, rien sur mois non initialisé : RG22 à RG28.

- D11. Les transferts restent comptés dans la progression des objectifs ; seuls les totaux du budget les excluent (RG33, CA36).
- D12. Dans la simulation et le résumé du modèle, les transferts sont hors totaux mais toujours reconduits par le modèle et « dupliquer le mois précédent » (RG34, CA37 à CA39). Les filtres par `isLineInBudget` de ces chemins ne doivent pas supprimer les transferts de la reconduction.
- D13. Le compte principal est exclu de la liste des comptes cibles du formulaire (RG23, RG24, CA23, CA24). Les exclusions enveloppes et « Espèces » du compte débité s'appliquent aussi à la cible. Rédaction de l'amendement validée telle quelle : libellé en titre avec « Débité → Cible » en sous-ligne, formulaire modal, suppression avec confirmation.

- D14. (Remplace D1, 2026-11-20.) Seules les dépenses **explicitement associées à UNE ligne de transfert** réduisent son reste ; une dépense affectée au compte cible ne réduit rien en elle-même. Stockage : champ facultatif sur l'opération (clé de la ligne, ex. `transferLineKey`), colonne additive nullable sur `transactions` ; association depuis Opérations seulement (« Affecter à » : compte puis lignes de transfert en dessous, une seule action), pas de bouton dans l'encart, une ligne par dépense (RG36 à RG39). L'affectation au compte (0028) est conservée pour ses autres usages, sans effet sur un transfert ; aucune reprise des dépenses déjà affectées (RG45). Le « viré » reste par ligne via le rattachement du virement (RG6). Delta négatif : reste 0, « Fait », sans signal (RG9 bis). Le réel de la ligne de transfert (donc les objectifs) est aligné sur les seules dépenses associées (RG40). L'association sort la dépense du budget, comme l'affectation (RG41, D2).

- D18. (2026-11-20.) Rattachement d'un virement à une ligne de transfert depuis Opérations, à la création et en édition, par le sélecteur « Rattacher à (facultatif) » : une seule ligne par virement, la destination du virement doit être le compte cible de la ligne, la source n'est pas contrôlée (aucun avertissement), rattachement manuel seulement (défaut de création inchangé, pas de proposition automatique), mois clos refusé, couche application inchangée. Le montant d'une ligne de transfert n'est jamais verrouillé par un virement rattaché ; seuls ses comptes le sont, et sa suppression est refusée (RG27 corrigée). RG47 à RG52, CA57 à CA62.
- D15. Ligne de transfert supprimée ou remplacée : le lien est ignoré, il reste sur l'opération sans effet, aucune modification silencieuse des opérations (RG44, CA53).
- D16. L'opération change de mois : le lien est retiré automatiquement (RG44, CA54).
- D17. Changement de compte d'affectation, de type, passage hors budget / au budget : le lien est retiré dès que la condition de RG36 n'est plus remplie (RG44, CA55).

## Questions ouvertes

Aucune.

## Historique

- 2026-11-19 : amendement après le test manuel du développeur (« je dois créer ces lignes directement dans l'encart »). RG1, RG4, RG5, RG18, RG19, RG21, CA12, CA13, CA16, CA18, CA19 modifiées ; RG22 à RG32 et CA22 à CA35 ajoutées ; D6 à D10 ajoutées ; périmètre, design, impact technique et tests mis à jour. Statut repassé à « à valider ». Conséquence : les transferts sortent des totaux du budget par `isLineInBudget`, ce qui touche des tests existants (voir « Impact technique »).
- 2026-11-19 (suite) : les 3 questions ouvertes de l'amendement sont tranchées (D11 à D13). RG23, RG24, RG32 modifiées ; RG33 et RG34 ajoutées ; CA23 et CA24 modifiés ; CA36 à CA40 ajoutés ; impact technique et tests complétés. Statut inchangé : à valider.
- 2026-11-18 : emplacement modifié à la demande du développeur après le test manuel : l'encart passe de la colonne de « À venir » à la colonne Épargnes/Investissements, sous « Investissements ». Aucune règle de gestion modifiée.
- 2026-11-19 (suite) : décisions du développeur après la mise en œuvre : patrimoine inchangé (RG35, CA41, exception à RG30), nom calculé dans les écrans qui listent les lignes d'épargne (RG26 étendue), listes déroulantes du formulaire au design du filtre par compte d'Opérations (composant partagé `Menu`, design).
- 2026-11-20 : après relecture de la spec implémentée, le développeur ne veut plus qu'une dépense affectée au compte cible réduise toutes les lignes qui visent ce compte : association explicite à UNE ligne (D14, remplace D1). RG6 à RG9, RG27, RG33 modifiées ; RG9 bis et RG36 à RG45 ajoutées ; CA5, CA7, CA8, CA28, CA36 modifiés ; CA42 à CA52 ajoutés ; état des lieux, périmètre, parcours et impact technique (migration additive, `lineActuals`, `AssignPicker`, tests impactés) mis à jour. Statut : à valider. 3 questions ouvertes sur la cohérence du lien (ligne supprimée, changement de mois, changement de compte ou de type).
- 2026-11-20 (suite) : les 3 questions ouvertes de RG44 sont tranchées, option A (D15 à D17) : lien ignoré si la ligne disparaît, retiré au changement de mois, retiré quand la condition de RG36 n'est plus remplie. RG44 reformulée ; CA53 à CA55 ajoutés ; impact technique (retrait dans `updateTransaction`) et tests précisés. Statut : à valider.
- 2026-11-20 (rattachement d'un virement) : après le virement Principal → Travaux du test manuel, le développeur veut pouvoir rattacher un virement à une ligne de transfert depuis Opérations (D18, tous ses choix suivent les recommandations). RG47 à RG52 et CA57 à CA62 ajoutés ; RG27 corrigée (montant jamais verrouillé par un virement) ; état des lieux précisé (« sauf transfert, RG46 ») ; impact technique et tests précisés (édition dans `Expenses.tsx`, couche application inchangée, commentaire de `savingsLineEntries`). Statut : à valider.
- 2026-11-19 (suite 2) : après revue visuelle, champs du formulaire harmonisés : le montant, le jour et le libellé prennent le design des listes (pilule du filtre par compte d'Opérations, classe `tr-field`), plus le style de cellule en édition.
- 2026-11-20 (mise en œuvre) : RG27 et CA27 alignés sur le code : le montant d'un transfert n'est jamais verrouillé (le verrou de la spec 0045 ne vise que les lignes variables). Migration `20261120120000_transfer_line_key.sql` (colonne `transactions.transfer_line_key`), appliquée à la base distante le 2026-11-20 sur demande explicite du développeur.
- 2026-11-20 (3e revue) : un lien inchangé est accepté sans revalidation à la modification d'une opération (D15 : une opération au lien inerte reste modifiable depuis l'écran) ; la condition de maintien du lien est la fonction `transferLinkHolds`.
- 2026-11-20 (test manuel) : RG46 et CA56 ajoutés, RG6 corrigée : les virements sortants du compte cible ne déduisent pas du viré d'un transfert (cause : `savingsLineEntries` comptait comme « transmis » tout virement sortant du compte cible sans cible de ligne).

