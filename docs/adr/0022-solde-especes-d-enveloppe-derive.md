# 0022 — Solde espèces d'une enveloppe : un solde à part, dérivé de l'ouverture, des transferts depuis « Espèces » et des dépenses en espèces

- Statut : acceptée (décisions D1 à D9 de la spec validée par le développeur)
- Date : 2026-10-25
- Spec liée : [0026-solde-especes-des-enveloppes](../specs/0026-solde-especes-des-enveloppes.md)

## Contexte
La part en espèces d'une enveloppe (`Envelope.cash`) était une saisie libre, informative, découpant le solde de l'enveloppe. Le développeur veut deux soldes indépendants : le virtuel (le compte de l'enveloppe, inchangé) et un solde espèces à part, alimenté par la mécanique de transfert (0019) depuis le compte « Espèces ».

## Décision
- Le solde espèces n'est jamais stocké : `domain/envelopeCash.ts` le calcule (`envelopeCash`) = espèces d'ouverture + transferts `fromAccountId = Espèces` vers le compte de l'enveloppe − dépenses de l'enveloppe payées en espèces, jusqu'à la fin du mois, jamais sous 0. Il n'est pas plafonné par le virtuel. Le total affiché (`envelopeTotal`) est virtuel + espèces, uniquement à l'affichage.
- `Envelope.cash` devient `Envelope.openingCash`. Colonne Supabase `envelopes.cash` conservée (seul son sens change) ; `supabaseRows` fait la correspondance. Conversion au chargement (`migrateEnvelopeOpeningCash`) : solde additionnel, le virtuel ne change pas (D5).
- Une dépense d'enveloppe porte `Transaction.payMode?: 'especes'` (absent = virtuel). Nouvelle colonne nullable `transactions.pay_mode` (migration `20261025140000_envelope_cash.sql`, écrite, non appliquée).
- Un transfert Espèces → enveloppe (`isCashFunding`) débite « Espèces » (réel et estimé) mais ne crédite pas le compte de l'enveloppe (D1) ; il ne remplace pas l'allocation pointée de l'enveloppe (`transfersTargeting` l'ignore). Une dépense en espèces ne bouge aucun compte (`bankMovements`) et ne diminue pas `EnvMonth.balance` ; elle compte dans `EnvMonth.spent` et le bilan (D4).
- Dépense en espèces supérieure au solde espèces : refusée par `addTransaction` (D3), message dans la Saisie. Import CSV : dépense en virtuel (D6).
- Historique (RG16 à RG19, D12 à D16) : `domain/envelopeHistory.ts` dérive deux listes en lecture seule avec le solde après chaque ligne. « Virtuel » lit les mouvements RÉELS du compte de l'enveloppe (`realMovements` : une allocation pointée, fictive, n'y figure pas) ; « Espèces » lit les transferts depuis « Espèces » et les dépenses en espèces. `envelopeCash` est le dernier solde de la liste Espèces, plafonné à 0 : une seule source de calcul.
- Les deux départs sont modifiables tant que le mois de départ est ouvert (RG15). Le départ virtuel est l'ouverture du compte de l'enveloppe (même donnée que l'écran Comptes, `setEnvelopeOpeningBalance`) ; un départ espèces qui rendrait le solde espèces négatif à une date est refusé (D11, `lowestCashBalance`).
- Le départ espèces se saisit à trois endroits sur la même donnée `openingCash` (assistant, panneau de l'enveloppe, carte d'enveloppe de l'écran Comptes, D20) avec les mêmes contrôles (`openingCashRefusal`, messages communs dans `components/hints.ts`). Le verrou est celui du mois de DÉPART du compte, pas du mois affiché ; l'écran Comptes affiche les espèces en lecture seule « à part » (D19), hors du solde réel du compte. La carte d'une enveloppe y porte aussi une ligne « Total » = solde réel du compte (`bankMonth`) + espèces (`envelopeAccountTotal`, D23, D24) ; elle remplace la décision D22 (pas de total). La ligne de titre du groupe « Enveloppes » garde le virtuel seul comme chiffre principal et porte en sous-titre « avec espèces X » (`envelopesGroupTotals`, enveloppes actives uniquement, masqué à 0 d'espèces, RG24 ; défauts Q26 à Q30 appliqués sur demande du développeur, à figer par la spec). C'est un affichage seulement : aucun KPI, total de groupe ni clôture ne la lit (D25).
- Écran Comptes, cartes d'enveloppe (D32 à D36) : « Solde réel » y devient « Solde virtuel » (même chiffre, `bankMonth` ; infobulle « Solde réel du compte de l'enveloppe, hors espèces ») et « Espèces » s'affiche à côté, même rangée et même taille ; « Total » reste dessous. Le renommage vaut pour les cartes (lecture et réglage) et le récapitulatif d'un compte d'enveloppe ; les autres comptes et les KPI de synthèse gardent « Solde réel ». Pur libellé et mise en page : aucune donnée ni calcul ne change.
- Tuile d'enveloppe de l'écran Budget (RG26, D37 à D41) : exception au total en titre. Le chiffre principal est le virtuel budgétaire seul (`EnvMonth.balance`, non plafonné), puis une ligne « Espèces X » masquée à 0, puis « alloué ». L'écran Enveloppes garde le total en titre et le sous-titre des deux soldes. `EnvelopeBalances` n'est donc plus utilisé que par l'écran Enveloppes.
- Clôture, « Disponible », `envAvailable` lisent le virtuel seul ; les espèces sont hors clôture (D2, limite connue) : l'argent sorti d'« Espèces » par un transfert disparaît des totaux de la clôture.

## Alternatives écartées
- Espèces sous-partie du solde de l'enveloppe, bornée par lui (premier modèle de la spec) : écarté par le développeur, « un solde à part ».
- Stocker le solde espèces : deux sources de vérité à garder cohérentes avec transferts et dépenses.
- Dépense en espèces qui débite aussi « Espèces » : double compte avec le transfert.
- Renommer la colonne Supabase : migration de données sans gain.

## Conséquences
- Le solde espèces suit toute suppression ou modification d'écriture sans code supplémentaire.
- Supprimer un transfert d'alimentation après coup peut rendre des dépenses en espèces déjà saisies supérieures au solde : l'affichage plafonne à 0, rien n'est refusé rétroactivement.
- Le dernier solde de la liste Virtuel est celui du compte de l'enveloppe (`bankMonth`) ; le titre des cartes utilise `EnvMonth.balance`, budgétaire (start + allocation − dépenses en virtuel) : les deux peuvent différer tant qu'une allocation n'est pas transférée.
- `EnvMonth.spent` n'est plus égal à `start + alloc − balance` dès qu'une dépense est payée en espèces.
- Supprimer une enveloppe ne regarde que son virtuel ; ses espèces restantes sont ignorées (D7 : pas de retour vers « Espèces »).
