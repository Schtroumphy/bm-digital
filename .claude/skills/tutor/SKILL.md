---
name: tutor
description: Visite guidée pas à pas d'une feature existante pour reprendre la maîtrise du code, avec questions libres du développeur et un quiz final de 3 questions maximum. À utiliser quand le développeur tape /tutor, ou demande à comprendre, revoir ou se faire expliquer une feature ou une spec.
---

# Tutor : reprendre la maîtrise d'une feature

Orchestre l'agent `tutor` (lecture seule). L'agent n'a pas de mémoire : **toi, tu gardes** le plan, l'étape courante et le bloc CLÉ du quiz, et tu les rends à chaque appel.

## Déroulé

1. **Choisir la feature.** Argument de `/tutor` : numéro de spec (`0036`), nom ou description. Absent : liste `docs/specs/` (`ls`) et demande laquelle avec `AskUserQuestion`.
2. **Plan.** Appelle l'agent `tutor` avec `MODE=plan` et la feature. Affiche le tableau tel quel et garde-le.
3. **Boucle pas à pas.** Pour l'étape courante (la 1 au départ) appelle `MODE=step` (feature, plan, n° d'étape) et affiche le retour. Puis **attends le développeur** :
   - une question → `MODE=ask` (feature, question, étape en cours, et un court résumé des questions/réponses précédentes pour que les questions de suivi gardent leur contexte), affiche la réponse, attends encore. **Aucune limite** : le développeur peut poser autant de questions qu'il veut, sur l'étape courante, une étape passée ou une autre partie du code, et il n'est jamais poussé vers l'étape suivante ;
   - « suivant » / « ok » → étape suivante ;
   - « aller à N » ou « refais l'étape » → l'étape demandée ;
   - « quiz » ou fin des étapes → étape 4.
   Ne lance jamais deux étapes d'affilée sans retour du développeur.
4. **Quiz (au plus 3 questions).** Propose-le en fin de parcours (ou à la demande). Appelle `MODE=quiz`, affiche **uniquement** le bloc `POUR LE DEV` et garde le bloc CLÉ pour toi. Les 3 questions ont des formats différents (QCM, explication, code à expliquer ou à corriger, remise en ordre).
5. **Correction.** Une fois les réponses reçues, appelle `MODE=evaluate` avec le bloc CLÉ et les réponses. Affiche le résultat. Propose de revoir une étape si besoin, ou de s'arrêter.

## Règles

- Rien n'est écrit dans le dépôt : pas de suivi de notions ni de dette, pas de fichier produit.
- La limite de 3 s'applique uniquement aux questions **du quiz**, jamais aux questions du développeur.
- Ne réponds pas à la place de l'agent : transmets-lui la question telle que le développeur l'a posée.
- Si le code contredit la spec ou semble buggé, remonte-le au développeur tel que l'agent l'a dit ; ne corrige rien sans demande explicite.
- Tout est en français.
