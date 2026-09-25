# Coinche

Coinche en ligne à quatre, jouable sur téléphone et sur PC : <https://romainfjgaspard.github.io/coinche/>.
Chacun choisit son nom (ou en ajoute un), crée une partie ou la rejoint avec un code ou un lien ; les
places libres se confient à des bots.

## Ce que fait l'application

| Domaine            | Contenu                                                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Règles             | Nos règles maison (`docs/REGLES.md`) : coinche, surcoinche, capot, générale, belote à annoncer, blitz, objectif au choix       |
| Partie             | Salon (équipes tirées au sort ou choisies), enchères, jeu de la carte, décompte, « Rejouer » (même soirée)                     |
| Robustesse         | Pause ; bots repris par un autre onglet si le leur se ferme ; joueur absent remplaçable par un bot, qui peut reprendre sa place |
| Fin de donne       | Décompte détaillé pli par pli ; « Revoir la donne » : mains de départ, huit plis                                               |
| Analyse            | À cartes ouvertes (le contrat était-il faisable ?) et carte par carte, avec l'information du joueur, comme aux échecs          |
| Bots               | « bot » : les réflexes d'un bon joueur (soutien, tirage d'atout, coinche) ; « bot ★ » : chaque carte réfléchie au solveur. Aucun ne voit le jeu des autres |
| Statistiques       | Partie en cours (score, enchères, jeu, donnes) et toutes les parties (duos, joueurs, enchères, temps, soirées), avec ou sans les parties à bots |
| Mise en page       | Téléphone (une colonne) et PC (table dédiée, à l'échelle de l'écran)                                                           |

Stack : Vue 3 + TypeScript + Vite + Pinia + Tailwind v4, Firebase (Firestore, authentification anonyme), GitHub Pages.

## Documents

- **`docs/REGLES.md`** — nos règles ; chaque point porte un identifiant (`ENC-5`…)
- **`docs/MODELE-DONNEES.md`** — journal d'événements, archives, conservation intégrale pour les stats
- **`docs/QUALITE.md`** — outils de qualité (équivalents Python : ruff → ESLint + Prettier, uv → npm), audit
- **`docs/FIREBASE.md`** — le projet Firebase, les clés, le déploiement, et comment le refaire

## Prérequis (Windows)

- **Node 24** ou plus
- **Java 21** — requis par l'émulateur Firestore. Version portable Temurin dans `%LOCALAPPDATA%\jre`,
  avec `JAVA_HOME` et le `PATH` posés dans les variables d'environnement de l'utilisateur
- Dans PowerShell, taper `npm.cmd` au lieu de `npm` si la politique d'exécution bloque `npm.ps1`

## Développer en local

`.env.local` pointe sur le vrai projet Firebase : **`npm run dev` écrit donc dans la vraie base**. Pour
tout essai, lancer l'émulateur puis `npm run dev:emu`, qui force le projet bidon `demo-coinche`.

```powershell
npm ci               # installe exactement les versions du lockfile
npm run emu          # émulateur Firestore + Auth (nécessite Java) — premier terminal
npm run dev:emu      # site branché sur l'émulateur — second terminal : http://localhost:5173/coinche/
```

Pour essayer seul : choisir son nom, créer une partie, puis « + bot » ou « + bot ★ » sur les autres places.
`?botDelay=150` dans l'adresse accélère les bots. Une fenêtre de navigation privée compte comme un autre
joueur.

## Vérifier

```powershell
npm run check        # lint, formatage, types, tests : ce que fait la CI, hors émulateur et build
npm run lint         # ESLint (lint:fix pour corriger ce qui peut l'être)
npm run format       # Prettier (format:check pour vérifier sans écrire)
npm run typecheck    # vue-tsc
npm test             # moteur de règles et composants, sans réseau
npm run test:rules   # règles Firestore, parcours, concurrence, pause — lance son propre émulateur
npm run coverage     # couverture des tests
npm run tournoi      # bots contre bots, donnes jouées deux fois ($env:A, $env:B : base, expert, hasard)
```

Les tests ne parlent **jamais** à la vraie base : `vite.config.ts` et `src/firebase/app.ts` forcent
l'émulateur dès que le mode est `test`.

Parcours dans de vrais navigateurs (Playwright), avec l'émulateur et `npm run dev:emu` déjà lancés :
`npm run test:e2e` (partie complète à quatre), `npm run test:bot` (un humain, trois bots),
`npm run test:apercu` (captures des stats), `node tests/audit.mjs` (revue d'affichage). Captures dans
`$env:SORTIE`. **Ces scripts sont à remettre à jour** : l'interface a changé depuis (voir `docs/QUALITE.md`). Chromium s'installe avec
`npx playwright install chromium`.

Pour remplir les statistiques de l'émulateur : `npm run seed:stats` (émulateur lancé ;
`$env:PARTIES=12` pour le nombre de parties, 8 par défaut). Il ne vise la vraie base que par
`npm run seed:stats:prod`, avec `$env:SEED_CONFIRME='coinche-e708b'`.

## Mise en ligne

`.github/workflows/deploy.yml` :

- **À chaque PR et à chaque push sur `main`** : lint, formatage, types, tests, build, tests sur émulateur.
- **Sur `main`, si tout passe** : build avec les clés Firebase, déploiement des règles Firestore (compte
  de service en secret GitHub), puis publication sur GitHub Pages.

On travaille donc par branche et PR ; merger dans `main` met en ligne. À régler une seule fois sur GitHub :

1. **Settings → Pages → Source : GitHub Actions**
2. **Settings → Secrets and variables → Actions** : les six `VITE_FIREBASE_*`, mêmes valeurs que
   `.env.local`, et `FIREBASE_SERVICE_ACCOUNT` (clé JSON du compte de service). Sans eux, le workflow
   s'arrête volontairement.
3. Console Firebase → Authentication → Settings → **Authorized domains** : ajouter
   `romainfjgaspard.github.io`.

## Firebase

Projet réel `coinche-e708b` : Firestore natif, authentification anonyme. `.firebaserc` garde
`demo-coinche` par défaut (émulateur) et le vrai projet sous l'alias `prod`. Les règles
(`firestore.rules`) sont déployées par la CI ; la procédure de création est dans `docs/FIREBASE.md`.

## Cartes

Les figures (`public/cards/`) viennent du projet **svg-cards** de David Bellot, portrait français, sous
**LGPL 2.1+** — attribution obligatoire, voir `public/cards/LICENCE.md`. Les autres rangs sont dessinés en
CSS.
