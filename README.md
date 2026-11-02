# Incrémental

Deux jeux incrémentaux en français, chacun avec un fond de réflexion sur un sujet actuel.

Ouvrez `index.html` dans un navigateur et choisissez votre partie. Il n'y a ni serveur, ni connexion, ni dépendance. Chaque partie est sauvegardée automatiquement dans le navigateur.

| Jeu | Thème | Durée |
| --- | --- | --- |
| **Polyphonie** | écriture et intelligence artificielle | environ 1 h à 1 h 30 |
| **Sept générations** | climat et héritage | environ 35 à 45 min |

> Conseil : ne lisez pas le code avant d'avoir terminé une partie.

## Pour les curieux (après avoir joué)

- `polyphonie/` : `js/game.js` (logique), `js/text.js` (textes), `js/ui.js` (interface)
- `sept/` : `model.js` (économie, énergie, climat), `story.js` (lettres), `ui.js` (interface)
- `tools/` : simulations headless pour régler le rythme
  - `node tools/sim-polyphonie.js greedy|careful`
  - `node tools/sim-sept.js naive|balanced|green`

Les ordres de grandeur climatiques de *Sept générations* (CO₂ cumulé, réchauffement par tonne émise, émissions et événements historiques jusqu'en 2026) sont inspirés de données réelles, mais très simplifiés.
