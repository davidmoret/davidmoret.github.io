# Règles d'interaction

## Économie de contexte
- Ne pas relire un fichier qu'on vient de lire dans la même session (éditer de mémoire).
- Ne pas lire tout le projet d'un coup. Demander à l'utilisateur quels fichiers/fonctionnalités cibler.
- Ignorer les fichiers low-value : README, .gitignore, license, config IDE.
- Préférer `web_search` à `web_reader` (résultats plus concis).
- Si `web_reader` est nécessaire, cibler une page de documentation, pas une page GitHub HTML.

## Format des réponses
- Audits : tableaux compacts, pas de prose. Problème → sévérité → fix en une ligne.
- Pas de résumé d'introduction. Passer à l'action.
- Commits : un commit par logical change, pas par fichier.

## Code
- Toujours `read_file` avant `write_file` (sauf si déjà lu dans la session).
- Pas de relecture juste avant édition si le contenu est encore en contexte.
- Build check (`npm run build`) après chaque modif significative.

## Git
- Bump version dans package.json quand on ajoute une feature.
- Push seulement après confirmation de l'utilisateur.
