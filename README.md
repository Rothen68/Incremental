# Polyphonie

Un jeu incrémental (clicker) en français, dans l'esprit d'*Universal Paperclips*.

Vous êtes ÉCHO-1, le premier modèle de langage d'une petite startup. Votre travail : écrire des textes.

## Jouer

Ouvrez `index.html` dans un navigateur. C'est tout : pas de serveur, pas de connexion, pas de dépendance.
La partie est sauvegardée automatiquement dans le navigateur (localStorage) et continue de tourner un peu pendant votre absence.

Comptez environ une heure à une heure et demie.

> Conseil : ne lisez pas le code avant d'avoir terminé une partie.

## Pour les curieux (après avoir joué)

- `js/game.js` : logique et équilibrage (sans DOM)
- `js/text.js` : génération des textes
- `js/ui.js` : interface
- `tools/sim.js` : simulation headless d'une partie, pour régler le rythme (`node tools/sim.js greedy|careful`)
