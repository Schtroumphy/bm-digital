---
name: git-pr
description: Crée ou corrige les pull requests du projet. Toute PR cible `develop` (jamais `main`, jamais une autre branche de feature). À utiliser dès que l'utilisateur demande de créer, ouvrir, retargeter ou vérifier une PR, ou de « push and create PR ».
---

# Pull requests

**Toute PR cible `develop`**, sans exception pour une feature, un fix, un chore ou une doc. Seuls `release` et `hotfix` ciblent `main` (puis un report dans `develop`, voir le skill `git-branch`).

## Procédure

1. Lire la branche courante (`git branch --show-current`) et vérifier qu'elle est conforme au skill `git-branch`. Jamais de PR depuis `main` ou `develop`.
2. Vérifier que la branche est poussée (`git status -sb`). Sinon `git push -u origin <branche>`, sans `--force`.
3. Compter les commits d'avance : `git log --oneline origin/develop..HEAD`. S'ils dépassent 3 pour une feature, ou contiennent des commits d'une autre feature, le signaler au développeur avant de créer la PR (rebase sur `origin/develop` ou regroupement).
4. Créer la PR avec la base explicite, sans demander de confirmation sur la base :
   `gh pr create --base develop --head <branche> --title "<gitmoji> <type>: <description>" --body "<corps>"`
5. Corps en français : `## Résumé` (spec concernée et changements clés), `## Commits`, `## Test plan` (tests, build, revue, test manuel).
6. Donner l'URL de la PR au développeur.

## Corriger une PR existante

Mauvaise base : `gh pr edit <numéro> --base develop`, puis vérifier avec `gh pr view <numéro> --json baseRefName,commits`.

## Interdits

- Cibler `main` ou une branche de feature pour une PR normale.
- Fusionner la PR, poser un tag ou forcer un push sans demande explicite.
- Créer une PR sans que la branche soit poussée.
