# 0004 — Valider le mois : considérer le réel conforme au budget

- Statut : implémentée
- Date : 2026-10-20
- Branche prévue : feat/initialize_budget

## Contexte et objectif
Dans la majorité des cas, le réel d'une ligne est égal à son budget. Aujourd'hui il faut saisir chaque montant réel à la main. Sur l'écran Budget, un bandeau indique combien de lignes n'ont pas de réel saisi et propose de les considérer conformes au budget en un clic, avec possibilité d'annuler.

## Périmètre
Inclus :
- Bandeau sur l'écran Budget, pour le mois affiché uniquement.
- Action « Valider le mois » : copie le budget dans le réel des lignes sans réel saisi.
- Annulation immédiate via un toast, sans persistance.

Exclus :
- Écran Clôture annuelle (inchangé).
- Lignes du bloc `var` (dépenses variables) : leur réel vient des transactions.
- Autres mois que le mois affiché.
- Création de transactions, de dates ou de comptes : le réel de ces lignes est un simple nombre, le compte de la ligne ne change pas.
- Annulation après rechargement de la page.

## Règles de gestion
- RG1. Une ligne est « éligible » si : son `actual` vaut `null`, son bloc n'est pas `var`, et son budget est différent de 0.
- RG2. Le bandeau affiche « N lignes sans réel saisi » (singulier : « 1 ligne sans réel saisi ») avec N = nombre de lignes éligibles du mois affiché.
- RG3. Si N = 0, le bandeau n'est pas affiché.
- RG4. Le bandeau n'est pas affiché si le mois n'est pas initialisé.
- RG5. Si l'année du mois est clôturée (`closes[année].closed`), l'action est désactivée (bouton grisé, ou bandeau remplacé par le bandeau de verrouillage existant).
- RG6. Au clic sur « Valider le mois », `actual` prend la valeur de `budget` pour chaque ligne éligible, et seulement celles-là.
- RG7. Jamais d'écrasement : une ligne avec un réel déjà saisi (y compris 0) n'est pas modifiée. Les lignes `var` et les lignes à budget 0 ne sont pas modifiées.
- RG8. Après l'action, un toast affiche « N lignes validées » avec un bouton « Annuler ».
- RG9. « Annuler » remet à `null` uniquement les lignes remplies par cette action, et seulement si leur réel vaut encore la valeur copiée. Une ligne modifiée entre-temps par l'utilisateur est laissée telle quelle.
- RG10. Le toast disparaît seul après quelques secondes (5 s proposées) ou à la fermeture. Aucune persistance : après disparition ou rechargement, l'annulation n'est plus possible.
- RG11. Hypothèse à valider : une ligne ajoutée après l'action reste à `null` et fait remonter le compteur.
- RG12. Hypothèse à valider : les lignes d'un compte hors budget (`inBudget: false`) sont éligibles comme les autres, car elles restent listées sur l'écran.
- RG13. Les totaux, écarts, KPI et soldes se mettent à jour comme après une saisie manuelle (le réel reste une donnée directe, aucune règle nouvelle côté ledger).

## Parcours utilisateur
Nominal :
1. L'utilisateur ouvre un mois initialisé avec 12 lignes sans réel (dont aucune `var`, aucune à budget 0).
2. Le bandeau affiche « 12 lignes sans réel saisi ».
3. Il clique sur « Valider le mois » : les 12 réels prennent la valeur du budget, le bandeau disparaît, le toast « 12 lignes validées — Annuler » apparaît.
4. Il clique sur « Annuler » : les 12 lignes repassent à `—`, le bandeau revient.

Cas limites :
- Une ligne a déjà un réel (même 0) : elle n'est ni comptée ni modifiée.
- Toutes les lignes sans réel sont des `var` ou ont un budget 0 : pas de bandeau.
- Après l'action, l'utilisateur modifie un réel puis annule : cette ligne garde sa saisie.
- Année clôturée : action désactivée.
- Changement de mois pendant que le toast est affiché : le toast est retiré et l'annulation n'est plus proposée (hypothèse à valider).
- Mois non initialisé : pas de bandeau.

## Design
Design proposé, à valider (aucune maquette fournie). Réutilise `.banner`, `.banner-icon`, `.banner-title`, `.banner-text`, `.btn-dark` et les tokens de `src/presentation/ds/organic.css`. Aucun composant toast n'existe aujourd'hui : un petit toast est à créer.

Bandeau, placé entre le bandeau de verrouillage éventuel et les KPI :

```
+--------------------------------------------------------------------------+
| (icône)  12 lignes sans réel saisi                    [ Valider le mois ] |
|          Considère le réel conforme au budget pour ces lignes.           |
|          Les réels déjà saisis ne sont pas modifiés.                     |
+--------------------------------------------------------------------------+
```

Toast, en bas de l'écran, centré :

```
+------------------------------------------+
|  12 lignes validées        [ Annuler ]   |
+------------------------------------------+
```

États :
- Vide (N = 0) : bandeau masqué.
- Chargé : bandeau visible, bouton actif.
- Année clôturée : bouton désactivé (style `.is-disabled`) ou bandeau masqué avec le bandeau de verrouillage existant.
- Après action : bandeau masqué, toast visible.
- Erreur : sans objet (opération locale).
- Édition : sans impact, la saisie manuelle reste inchangée.

## Impact technique
- Domaine : fonction pure qui liste les lignes éligibles d'un mois (RG1). Aucun changement de type ni de modèle de données.
- Application : une action « valider le mois » (copie budget vers réel sur les lignes éligibles, retourne les clés remplies) et une action d'annulation (RG9), toutes deux refusées si le mois est verrouillé.
- Infrastructure / schéma Supabase : aucun changement. `actual` est déjà persisté par ligne.
- Présentation : bandeau dans `Budget.tsx`, nouveau composant toast, état local du toast (clés et valeurs copiées), sans persistance.

## Critères d'acceptation
(T) = couvert par un test automatisé.
- CA1 (T). Given un mois avec 3 lignes éligibles, when on calcule les lignes éligibles, then N vaut 3.
- CA2 (T). Given une ligne `fix` avec budget 100 et réel `null`, when on valide le mois, then son réel vaut 100.
- CA3 (T). Given une ligne avec réel 80 et budget 100, when on valide le mois, then son réel reste 80.
- CA4 (T). Given une ligne avec réel 0 et budget 100, when on valide le mois, then son réel reste 0 et elle n'est pas comptée.
- CA5 (T). Given une ligne `var` avec réel `null`, when on valide le mois, then elle n'est ni comptée ni modifiée.
- CA6 (T). Given une ligne avec budget 0 et réel `null`, when on valide le mois, then elle n'est ni comptée ni modifiée.
- CA7 (T). Given l'année clôturée, when on tente de valider le mois, then aucune ligne n'est modifiée.
- CA8 (T). Given une validation faite, when on annule, then les lignes remplies repassent à `null`, et les autres lignes sont inchangées.
- CA9 (T). Given une ligne validée puis modifiée à 90, when on annule, then elle reste à 90.
- CA10. Given N = 0, when on affiche le mois, then le bandeau n'apparaît pas.
- CA11. Given N = 1, when on affiche le bandeau, then le texte est « 1 ligne sans réel saisi ».
- CA12. Given un mois non initialisé, when on l'affiche, then le bandeau n'apparaît pas.
- CA13. Given une validation faite, when on clique sur « Valider le mois », then le toast « N lignes validées » avec « Annuler » apparaît et disparaît seul.
- CA14 (T). Given une validation faite, when on ajoute une ligne, then elle reste à `null` et le compteur passe à 1.
- CA15. Given la validation, when on regarde les KPI et totaux, then ils reflètent les nouveaux réels.

## Questions ouvertes
Hypothèses à confirmer par le développeur :
1. RG11 : une ligne ajoutée après l'action reste à `null` et fait remonter le compteur (non tranché explicitement).
2. RG12 : les lignes d'un compte hors budget sont incluses dans la validation.
3. Durée du toast (5 s proposées) et comportement au changement de mois (toast retiré).
4. Année clôturée : bouton grisé ou bandeau masqué.
