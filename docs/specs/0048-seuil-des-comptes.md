# 0048 — Seuil idéal des comptes

- Statut : brouillon
- Date : 2026-11-13
- Branche prévue : feat/seuil_des_comptes
- Dépend de : 0010 (type de compte), 0011 (enveloppe = un compte), 0029 (carte Épargne du tableau de bord)

## Contexte et objectif

Pour certains comptes (épargne, investissement, enveloppe), le développeur a un montant idéal à atteindre. Il veut le renseigner une fois et voir sa progression, sans surcharger les cartes. C'est purement informatif : le seuil n'entre dans aucun calcul (budget, soldes, clôture, objectifs).

## Périmètre

Inclus :
- Un seuil idéal facultatif par compte de type épargne, investissement ou enveloppe.
- Sa saisie dans « Départ et réglages » de l'écran Comptes.
- Son affichage sobre à trois endroits : cartes de la vue d'ensemble (Comptes), panneau latéral du compte, carte « Épargne » du tableau de bord.

Exclus :
- Comptes courants (principal et autres) : pas de seuil.
- Historique ou seuil variable dans le temps.
- Alertes, notifications, projection de date d'atteinte.
- Affichage sur les comptes clôturés (archivés).
- Tout effet sur les totaux, la clôture, les objectifs annuels ou le patrimoine.

## Règles de gestion

- RG1. Un compte peut avoir un seuil idéal : un montant strictement positif, unique, sans date ni historique. Absent = pas de seuil.
- RG2. Seuls les comptes de type épargne, investissement et enveloppe peuvent avoir un seuil. Un compte courant (principal ou autre) n'offre pas le champ.
- RG3. Saisie : dans « Départ et réglages », sur la carte du compte, un champ « Seuil idéal (facultatif) » éditable. Vider le champ, ou saisir 0, retire le seuil. Une valeur négative est refusée. Le champ est désactivé quand le mois est verrouillé, comme les autres réglages de la carte.
- RG4. Sans seuil, aucun des trois affichages ne change : ni barre, ni texte, ni espace réservé.
- RG5. Progression = solde réel du compte à la fin du mois affiché ÷ seuil, arrondie à l'entier. Pour un compte d'enveloppe, le solde est le solde virtuel (hors espèces). Un solde négatif ou nul donne 0 %. La progression est plafonnée à 100 %.
- RG6. Seuil atteint (solde ≥ seuil) : barre pleine et mention « Seuil atteint » à la place du pourcentage. Le dépassement n'est pas chiffré.
- RG7. Cartes de la vue d'ensemble : sous le solde, une fine barre (`split-bar`, teinte du compte), le pourcentage, et une ligne `muted is-small` « Seuil idéal : X € ». Pas d'autre ajout.
- RG8. Panneau latéral du compte : sous la ligne du solde, même rendu que RG7 (barre fine, pourcentage ou « Seuil atteint », « Seuil idéal : X € »), au mois affiché. Aucun ajout dans les onglets Mouvements et Historique.
- RG9. Carte « Épargne » du tableau de bord : pour chaque compte affiché ayant un seuil, une fine barre avec le pourcentage ou « Seuil atteint » sous la ligne de mouvements, au mois du sélecteur. Le montant du seuil n'y est pas répété et le solde n'y figure pas (voir question 1). Les comptes sans seuil gardent leur rendu actuel. Les comptes d'enveloppe n'apparaissent pas dans cette carte (0029 RG3), donc pas de barre pour eux.
- RG10. Les comptes clôturés n'affichent pas leur seuil, nulle part. Le seuil reste enregistré et revient si le compte est restauré.
- RG11. Si le type d'un compte passe à courant, son seuil n'est plus affiché ni modifiable mais reste enregistré (voir question 2). S'il repasse à épargne, invest ou enveloppe, il réapparaît.
- RG12. Mois non initialisé ou sans solde calculé : pas de barre, seul « Seuil idéal : X € » reste sur la carte et le panneau.
- RG13. Aucun chiffre existant ne change (soldes, totaux de groupe, contrôle des soldes, clôture, patrimoine, objectifs).
- RG14. Accessibilité : la barre porte un libellé lisible par un lecteur d'écran (« Progression vers le seuil : 62 % »), comme la barre masquée des Catégories (commit 84dc009).

## Parcours utilisateur

Nominal : dans « Départ et réglages », sur la carte « Livret A », je saisis un seuil idéal de 20 000 €. Dans la vue d'ensemble, la carte affiche sous le solde (12 400 €) une barre à 62 % et « Seuil idéal : 20 000 € ». J'ouvre le panneau du compte : même rendu sous le solde. Sur Accueil, la carte « Épargne » montre une barre à 62 % sous Livret A.

Cas limites :
- Aucun seuil : rien n'est affiché.
- Solde ≥ seuil : barre pleine, « Seuil atteint ».
- Solde négatif : 0 %.
- Je retire le seuil (champ vidé) : les barres disparaissent.
- Compte archivé : pas de seuil sur sa carte.
- Compte principal : pas de champ de seuil.
- Mois changé : la progression suit le solde de ce mois.
- Mois verrouillé : champ désactivé.

## Design

Design proposé, à valider (aucune maquette existante). Réutilise `split-bar`, `muted is-small`, `EditableAmount`, `toneVars`.

Carte de la vue d'ensemble et panneau latéral :
```
Solde réel
12 400,00 €
▓▓▓▓▓▓▓▓▓▓▓░░░░░░  62 %
Seuil idéal : 20 000 €
```
Seuil atteint : `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  Seuil atteint`, puis la même ligne « Seuil idéal ».

Carte « Épargne » du tableau de bord (barre seule, sans montant) :
```
● Livret A                     +300,00 €
   Reçu 300,00 · Dépensé 0,00
   ▓▓▓▓▓▓▓▓▓▓▓░░░░░░  62 %
```

« Départ et réglages » (carte de compte, sous le solde de départ) :
```
Seuil idéal (facultatif)
[ 20 000,00 € ]   Retirer
```

États : sans seuil (rien), en cours, atteint, solde négatif (0 %), champ en édition, mois verrouillé (désactivé).

## Impact technique

- Domaine : `BankAccount` gagne un champ facultatif `threshold` (montant > 0). Fonction pure de progression (pourcentage plafonné, atteint oui/non) à partir du solde et du seuil. `DashboardView.savingsAccounts` expose, par ligne, la progression facultative (0029).
- Application : action pour définir ou retirer le seuil (validation RG3), dans `bankAccounts`; refus sur un compte courant.
- Infrastructure / Supabase : nouvelle colonne nullable sur `bank_accounts` (migration dans `supabase/migrations/`), mise à jour de `database.types.ts`, `supabaseRows.ts` (écriture et lecture), contrat du dépôt `budgetRepository.contract.ts`. Les données existantes restent valides (colonne nulle).
- Présentation : `Accounts.tsx` (carte, panneau, champ de réglage), carte Épargne de l'écran Accueil, classes dans `app.css` si nécessaire.
- Documentation : spec 0029 amendée (RG3b, voir question 1), `docs/architecture.md` si le modèle y est décrit.
- Aucune dépendance ajoutée.

## Critères d'acceptation

(Auto = test automatisé ; Man = vérification manuelle.)

- CA1. Given un compte sans seuil, When j'affiche carte, panneau et carte Épargne, Then aucune barre ni texte de seuil n'apparaît. (Auto sur la vue, Man sur l'écran)
- CA2. Given un livret avec seuil 20 000 € et solde 12 400 €, Then la progression vaut 62 %. (Auto)
- CA3. Given un solde de 25 000 € et un seuil de 20 000 €, Then la progression est plafonnée à 100 % et « Seuil atteint » s'affiche. (Auto)
- CA4. Given un solde négatif, Then la progression vaut 0 %. (Auto)
- CA5. Given un compte d'enveloppe avec seuil, Then la progression utilise le solde virtuel, espèces exclues. (Auto)
- CA6. Given la saisie d'un seuil dans « Départ et réglages », Then il est enregistré et la barre apparaît dans la vue d'ensemble et dans le panneau. Given que je vide le champ ou saisis 0, Then le seuil est retiré. Given une valeur négative, Then elle est refusée. (Auto sur l'action, Man sur l'écran)
- CA7. Given un compte principal ou courant, Then le champ de seuil n'est pas proposé et l'action refuse la saisie. (Auto)
- CA8. Given un compte clôturé ayant un seuil, Then aucun seuil n'est affiché sur sa carte ; Given qu'il est restauré, Then le seuil réapparaît. (Auto sur la vue, Man sur l'écran)
- CA9. Given la carte Épargne du tableau de bord, Then un compte avec seuil montre sa barre et son pourcentage sans solde ni montant du seuil, et un compte sans seuil est inchangé. (Auto sur la vue, Man sur l'écran)
- CA10. Given un changement de mois, Then la progression suit le solde du mois affiché dans les trois emplacements. (Auto)
- CA11. Given un compte dont le type passe à courant puis revient à épargne, Then le seuil est masqué puis retrouvé. (Auto)
- CA12. Given l'ajout du seuil, Then soldes, totaux de groupe, contrôle des soldes, clôture, patrimoine et objectifs produisent les mêmes valeurs qu'avant. (Auto, tests existants)
- CA13. Given la sauvegarde puis le rechargement Supabase, Then le seuil est conservé ; Given des données sans seuil, Then elles se chargent sans erreur. (Auto sur la conversion des lignes)
- CA14. Given une barre de seuil, Then un libellé « Progression vers le seuil : N % » est exposé aux lecteurs d'écran. (Man)
- CA15. `npm run build` et les tests passent, sans nouvelle dépendance. (Auto)

## Questions ouvertes

1. La carte Épargne du tableau de bord (0029 RG3b) ne montre volontairement aucun solde par compte, pour ne pas être comparée à Patrimoine. Une barre en pourcentage révèle indirectement le solde. Recommandation : l'accepter, avec un amendement de 0029 RG3b (« aucun montant de solde, la progression du seuil est admise »). Alternative : n'y mettre que « Seuil atteint » ou rien tant que le seuil n'est pas atteint.
2. Quand un compte passe à courant, le seuil est-il conservé en donnée mais masqué (recommandé, RG11) ou effacé ?
