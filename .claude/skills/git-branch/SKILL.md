---
name: git-branch
description: Crée et valide les branches du projet selon la convention Gitflow `<type>/<description_en_snake_case>` (feat, fix, hotfix, release, chore, docs). À utiliser dès que l'utilisateur démarre une feature, un correctif ou une release, demande de créer, renommer ou vérifier une branche, ou avant de commiter si la branche courante est main ou develop.
---

# Branches Gitflow

Une branche = une feature ou un correctif. Jamais de commit direct sur `main` ou `develop`.

## Convention de nom

`<type>/<description_en_snake_case>`, en minuscules, sans accents, 2 à 4 mots.

| Type | Part de | Revient dans | Exemple |
| --- | --- | --- | --- |
| `feat` | `develop` | `develop` | `feat/initialize_budget` |
| `fix` | `develop` | `develop` | `fix/budget_display` |
| `chore` | `develop` | `develop` | `chore/update_dependencies` |
| `docs` | `develop` | `develop` | `docs/architecture` |
| `release` | `develop` | `main` puis `develop` | `release/1_2_0` |
| `hotfix` | `main` | `main` puis `develop` | `hotfix/envelope_balance` |

Regex : `^(feat|fix|chore|docs|hotfix|release)/[a-z0-9]+(_[a-z0-9]+)*$`

## Règles de merge

- Historique linéaire : **rebase puis fast-forward**, pas de commit de merge.
- **3 commits maximum** par branche de feature. Au-delà, regrouper avant la PR (`git rebase -i` n'est pas supporté ici : utiliser `git reset --soft <base>` puis recommiter, avec le skill `commit-gitmoji`).
- Avant la PR : `git fetch origin && git rebase origin/develop` (ou `origin/main` pour un hotfix).
- Après un `release` ou un `hotfix` mergé dans `main` : poser un tag `vX.Y.Z`, puis reporter dans `develop`.

## Procédure

1. Lire la branche courante : `git branch --show-current`.
2. Déduire le type et la description de la demande. Si l'un des deux est ambigu, demander. Convertir la description en snake_case sans accents.
3. Valider le nom avec la regex ci-dessus. Refuser tout autre format (`feature/…`, tirets, majuscules) et proposer la version conforme.
4. Choisir la source : `main` pour `hotfix`, `develop` pour tout le reste.
5. Si des modifications non commitées existent, les signaler : elles suivront la nouvelle branche. Ne jamais les stasher ou les jeter sans accord.
6. Créer la branche depuis la source à jour :
   `git fetch origin && git switch -c <nom> origin/<source>`
7. Confirmer le nom créé et la source utilisée.

## Si l'utilisateur est sur `main` ou `develop` avec du travail à commiter

Ne pas commiter. Proposer une branche conforme (étapes 2 à 6), puis laisser le skill `commit-gitmoji` commiter dessus.

## Interdits

- Pousser ou forcer sur `main` ou `develop`.
- Mélanger plusieurs features dans une branche.
- Créer une branche sans type reconnu.
