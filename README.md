# Manhunt

Chasse à l'homme entre potes, dans le navigateur (testé pour Safari sur iPhone).

## Jouer

1. Un joueur ouvre l'app, **Créer une partie** : pseudo, touche la carte pour placer le centre de la zone, règle le rayon, la durée et l'intervalle des révélations.
2. Il partage le **code** (ou le lien). Les autres font **Rejoindre** avec le code et leur pseudo.
3. Chacun choisit **Runner** ou **Chasseur**. L'admin lance la partie (il faut au moins 1 runner et 1 chasseur).
4. Garder l'écran allumé et Safari au premier plan : iOS coupe la position quand le téléphone est verrouillé.

## Règles

- Toutes les N minutes (5 par défaut), les chasseurs voient la position de chaque runner **au moment de la révélation**. Pas de révélation au lancement.
- **Runner – fausse position** (1 fois) : la révélation suivante montre une position décalée de 300 m au plus, dans la zone.
- **Chasseur – position instantanée** (1 fois) : position réelle actuelle d'un runner, visible 60 s par ce seul chasseur.
- Sortie de zone : simple alerte rouge à l'écran.
- À la fin : trajets de chaque runner et bonus utilisés.
- Si Safari perd la session, rejoins avec **le même code et le même pseudo** pour reprendre ton joueur.

## Technique

- Vite + React + TypeScript + Leaflet (tuiles OpenStreetMap), Supabase (tables `manhunt_*` du projet lurnly-preprod).
- Pas de compte ni de sécurité : usage entre amis, chaque téléphone relit l'état toutes les 3 s.
- `npm install`, `npm run dev`, `npm test`, `npm run build` (renseigner `.env`, voir `.env.example`).
