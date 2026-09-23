# Coinche

Coinche en ligne à 4, entre Benel, Roux, Viv et Romain.

## État

Le moteur de règles, le journal d'événements, la sécurité Firestore et l'interface
Vue sont écrits et testés — partie complète jouée de bout en bout dans le navigateur,
jusqu'aux statistiques.

L'app tourne **sans projet Firebase** : sans `.env.local`, elle bascule
automatiquement sur les émulateurs et le projet bidon `demo-coinche`.

| Brique | État |
|--------|------|
| Spec des règles (`docs/REGLES.md`) | ✅ 24 règles validées le 23/09/2026 |
| Modèle de données (`docs/MODELE-DONNEES.md`) | ✅ arrêté |
| Moteur de règles (`src/game/`) | ✅ 145 tests hors réseau |
| Sécurité Firestore + partie complète | ✅ 29 tests sur émulateur |
| Couche Firebase (`src/firebase/`) | ✅ auth anonyme, journal, distribution |
| Lobby + prise de siège (Vue) | ✅ écrans « Qui es-tu ? » et salon |
| Enchères (moteur + journal) | ✅ rejouables depuis les événements |
| Jeu de la carte, plis, décompte | ✅ donne complète de bout en bout |
| Écran d'enchères | ✅ paliers, couleur, capot, coinche à la volée |
| Table de jeu | ✅ pli, main, belote, dernier pli, plis gagnés |
| Fin de donne et de partie | ✅ décompte, étoile, honte complète |
| Stats de la partie en cours | ✅ score, momentum, prises, impasses, faits |
| Stats de toutes les parties | ✅ archives, duos, joueurs, paliers, panache |
| Mise en page PC (≥ 1024 px) | 🟡 écrans de stats faits, table encore en portrait |
| Projet Firebase réel | ⬜ à créer dans la console — voir `docs/FIREBASE.md` |

## Documents

- **`docs/REGLES.md`** — nos règles, à valider. Chaque point porte un identifiant (`ENC-5`…)
- **`docs/MODELE-DONNEES.md`** — journal d'événements, roster, conservation intégrale pour les stats
- **`docs/FIREBASE.md`** — passer du projet bidon au vrai projet, pas à pas

## Cartes

Les figures (`public/cards/`) viennent du projet **svg-cards** de David Bellot,
portrait français, sous **LGPL 2.1+** — attribution obligatoire, voir
`public/cards/LICENCE.md`. Les autres rangs sont dessinés en CSS.

## Commandes

```bash
npm run dev          # serveur de développement
npm run test         # moteur de règles (rapide, sans réseau)
npm run test:rules   # règles Firestore sur émulateur (nécessite Java)
npm run emu          # émulateur Firestore + Auth seul
npm run build        # build de production
npm run test:e2e     # partie complète dans quatre navigateurs
npm run test:apercu  # captures des écrans de stats, en téléphone et en 1920×1080
```

## Test de bout en bout

`tests/e2e.mjs` ouvre quatre navigateurs, crée une partie, fait asseoir les quatre
joueurs, puis **joue la partie entière** — donne après donne, jusqu'à ce qu'une équipe
dépasse 1000 — et capture les deux onglets de statistiques. Il a besoin de l'émulateur
et du serveur de dev déjà lancés.

Les clics rejoués qu'il signale en fin de course sont normaux : quatre navigateurs
écrivent dans le même journal, et le garde-fou d'écriture concurrente en rejette
parfois un. Le script réessaie ; ce qui compte, c'est `erreurs : aucune`.

Chromium est installé sans droits administrateur dans `~/.cache/ms-playwright`,
et les trois bibliothèques qui lui manquaient (`libnss3`, `libnspr4`) sont
extraites dans `~/.local/chromedeps` — d'où le `LD_LIBRARY_PATH` du script.

## Prérequis

- **Node 20+** — installé ici via nvm (`~/.nvm`), Node 22
- **Java** — requis par l'émulateur Firestore, installé dans `~/.local/jre`

Si `java` n'est pas sur le PATH :

```bash
export JAVA_HOME="$HOME/.local/jre"
export PATH="$JAVA_HOME/bin:$PATH"
```

## Firebase

Le projet tourne **entièrement sur émulateur** sans projet Firebase réel.
Pour le déploiement, voir la procédure dans l'historique de session : créer le projet,
activer Firestore (europe-west9) et l'auth anonyme, autoriser le domaine
`romainfjgaspard.github.io`, puis remplir `.env.local` depuis `.env.local.example`.
