# Coinche

Coinche en ligne à 4, entre Benel, Roux, Viv et Romain.

## État

Le moteur de règles, le journal d'événements, la sécurité Firestore et l'interface
Vue sont écrits et testés — partie complète jouée de bout en bout dans le navigateur,
jusqu'aux statistiques.

Le vrai projet Firebase existe (`coinche-e708b`, alias `prod`) et `.env.local` pointe
dessus. **`npm run dev` écrit donc dans la vraie base** : pour tout essai, lancer
l'émulateur et `npm run dev:emu`, qui force le projet bidon `demo-coinche`.

| Brique | État |
|--------|------|
| Spec des règles (`docs/REGLES.md`) | ✅ 24 règles validées le 23/09/2026 |
| Modèle de données (`docs/MODELE-DONNEES.md`) | ✅ arrêté |
| Moteur de règles (`src/game/`) | ✅ 166 tests hors réseau |
| Sécurité Firestore + partie complète | ✅ 31 tests sur émulateur |
| Couche Firebase (`src/firebase/`) | ✅ auth anonyme, journal, distribution |
| Lobby + prise de siège (Vue) | ✅ écrans « Qui es-tu ? » et salon |
| Enchères (moteur + journal) | ✅ rejouables depuis les événements |
| Jeu de la carte, plis, décompte | ✅ donne complète de bout en bout |
| Écran d'enchères | ✅ paliers, couleur, capot, coinche à la volée |
| Table de jeu | ✅ pli, main, belote, dernier pli, plis gagnés |
| Fin de donne et de partie | ✅ décompte, étoile, honte complète |
| Stats de la partie en cours | ✅ score, momentum, prises, impasses, faits |
| Stats de toutes les parties | ✅ archives, duos, joueurs, paliers, panache |
| Mise en page PC (≥ 1024 px) | ✅ table dédiée, à l'échelle de l'écran (1366 → 2560) |
| Projet Firebase réel | ✅ `coinche-e708b`, règles déployées |
| Mise en ligne (GitHub Pages) | 🟡 CI prête, secrets et Pages à activer sur GitHub |

## Documents

- **`docs/REGLES.md`** — nos règles, à valider. Chaque point porte un identifiant (`ENC-5`…)
- **`docs/MODELE-DONNEES.md`** — journal d'événements, roster, conservation intégrale pour les stats
- **`docs/FIREBASE.md`** — passer du projet bidon au vrai projet, pas à pas

## Cartes

Les figures (`public/cards/`) viennent du projet **svg-cards** de David Bellot,
portrait français, sous **LGPL 2.1+** — attribution obligatoire, voir
`public/cards/LICENCE.md`. Les autres rangs sont dessinés en CSS.

## Commandes

```powershell
npm run emu          # émulateur Firestore + Auth (nécessite Java)
npm run dev:emu      # serveur de développement branché sur l'émulateur
npm run dev          # ⚠ serveur de développement sur la VRAIE base
npm run test         # moteur de règles (rapide, sans réseau)
npm run test:rules   # règles Firestore sur émulateur (lance son propre émulateur)
npm run build        # build de production
npm run test:e2e     # partie complète dans quatre navigateurs
npm run test:bot     # un humain, trois bots : la table doit tourner seule
npm run test:apercu  # captures des écrans de stats, en téléphone et en 1920×1080
```

Les trois derniers ont besoin de l'émulateur **et** de `npm run dev:emu` déjà lancés.
Leurs captures vont dans le dossier désigné par `$env:SORTIE` (par défaut, le dossier
courant).

Pour essayer seul : `http://127.0.0.1:5173/coinche/`, choisir son nom, créer une partie
puis « + bot » sur les trois autres sièges. `?botDelay=150` accélère les bots.

Pour remplir les statistiques globales de l'émulateur (qui repart vide à chaque
lancement) : `npm run seed:stats`, avec l'émulateur lancé. Le script joue de vraies
parties complètes entre quatre « humains » simulés, environ 1 min 30 par partie ;
`$env:PARTIES=12` en change le nombre. Il refuse de tourner hors émulateur.

Les tests Vitest ne parlent **jamais** à la vraie base : `vite.config.ts` et
`src/firebase/app.ts` forcent l'émulateur dès que le mode est `test`.

## Test de bout en bout

`tests/e2e.mjs` ouvre quatre navigateurs, crée une partie, fait asseoir les quatre
joueurs, puis **joue la partie entière** — donne après donne, jusqu'à ce qu'une équipe
dépasse 1000 — et capture les deux onglets de statistiques. Il a besoin de l'émulateur
et du serveur de dev déjà lancés.

Les clics rejoués qu'il signale en fin de course sont normaux : quatre navigateurs
écrivent dans le même journal, et le garde-fou d'écriture concurrente en rejette
parfois un. Le script réessaie ; ce qui compte, c'est `erreurs : aucune`.

Chromium est installé par Playwright dans `%LOCALAPPDATA%\ms-playwright`
(`npx playwright install chromium`).

## Prérequis (Windows)

- **Node 20+** — installation système, Node 24
- **Java 21** — requis par l'émulateur Firestore. Version portable Temurin dans
  `%LOCALAPPDATA%\jre`, avec `JAVA_HOME` et le `PATH` posés dans les variables
  d'environnement de l'utilisateur (ouvrir un nouveau terminal après coup)

## Firebase

Projet réel `coinche-e708b` : Firestore natif, authentification anonyme, règles
déployées. `.firebaserc` garde `demo-coinche` par défaut (émulateur) et le vrai projet
sous l'alias `prod` :

```powershell
firebase deploy --only firestore:rules --project prod
```

La procédure de création est dans `docs/FIREBASE.md`.

## Mise en ligne

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` : tests du moteur,
build avec les clés Firebase, publication sur <https://romainfjgaspard.github.io/coinche/>.
À régler une seule fois sur GitHub :

1. **Settings → Pages → Source : GitHub Actions**
2. **Settings → Secrets and variables → Actions** : les six `VITE_FIREBASE_*`, mêmes
   valeurs que `.env.local`. Sans elles, le workflow s'arrête volontairement.
3. Console Firebase → Authentication → Settings → **Authorized domains** : ajouter
   `romainfjgaspard.github.io`.
