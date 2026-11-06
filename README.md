# Manhunt

Chasse à l'homme entre potes, dans le navigateur (pensé pour Safari sur iPhone, thème clair et sombre automatiques).

**Jouer :** https://hugojame18-jpg.github.io/manhunt/

## Lancer une partie

1. Entre ton pseudo, puis **Créer une partie** : tu arrives dans le salon avec un code à 6 caractères.
2. **Inviter** partage un lien (le code est pré-rempli). Jusqu'à 16 joueurs.
3. Chacun choisit **Runner** ou **Chasseur** ; l'hôte peut changer les rôles ou retirer quelqu'un.
4. L'hôte règle la partie dans le salon, puis **Lance la partie** (au moins 1 chasseur et 1 runner).

## Règles

- **Modes** : *Classique* (un runner attrapé est éliminé) ou *Infection* (un runner attrapé devient chasseur). La partie se termine quand tous les runners sont attrapés, ou à la fin du temps (victoire des runners s'il en reste).
- **Avance des runners** : au lancement, les runners ont quelques minutes pour fuir. Les pings démarrent après.
- **Pings** : toutes les N minutes, les chasseurs voient la position des runners à ce moment-là.
- **Joker chasseur** : ping réel immédiat du runner choisi, visible par tous les chasseurs.
- **Joker runner** : le runner choisit sur la carte une fausse position (n’importe où dans la zone) ; au prochain ping, les chasseurs le voient là. Nombre de jokers réglé dans le salon (1 par défaut).
- **Zone de jeu** (facultative) : polygone dessiné sur la carte par l'hôte.
- **Temps limite hors zone** (facultatif) : un runner hors zone est visible en direct par les chasseurs ; une fois le temps cumulé autorisé écoulé, il est attrapé.
- **Hotspots** (facultatifs) : un runner qui reste dans un hotspot est pingé toutes les 2 minutes et gagne un joker à chaque fois. Les chasseurs ne voient un hotspot que lorsqu'un runner est dedans.
- **Capture** : le runner touche « J'ai été attrapé », ou un chasseur le marque attrapé dans la liste.
- **Itinéraire** : la flèche à côté d'un runner ouvre l'itinéraire à pied dans Apple Plans.
- **Mode poche** : écran noir, l'app reste active et continue d'envoyer la position. iOS coupe la position d'un site web quand le téléphone est verrouillé : utilise le mode poche au lieu de verrouiller.
- Si Safari perd ta session, rejoins avec le même code et le même pseudo pour reprendre ton joueur.

## Technique

- Vite + React + TypeScript, Leaflet + fond vectoriel OpenFreeMap (MapLibre), icônes Lucide.
- Supabase : tables et fonctions `manhunt_*` du projet lurnly-preprod. Pas de compte ni de sécurité : usage entre amis, chaque téléphone relit l'état toutes les 3 s.
- `npm install`, `npm run dev`, `npm test`, `npm run build` (renseigner `.env`, voir `.env.example`).
- Déploiement : contenu de `dist/` poussé sur la branche `gh-pages`.
