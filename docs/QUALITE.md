# Qualité du code

Ce qui garde le code sain, l'équivalent de chaque outil dans le monde Python, et ce qui reste à faire.

## Les outils

| Rôle | Python | Ici | Commande |
|------|--------|-----|----------|
| Gestionnaire de paquets, verrouillage | `uv` | **npm** (`package-lock.json`) | `npm ci` |
| Linter : erreurs probables, mauvaises pratiques | `ruff check` | **ESLint** | `npm run lint` / `npm run lint:fix` |
| Formateur | `ruff format` | **Prettier** | `npm run format` / `npm run format:check` |
| Vérification des types | `mypy` / `pyright` | **vue-tsc** (TypeScript) | `npm run typecheck` |
| Tests | `pytest` | **Vitest** | `npm test` |
| Couverture | `pytest-cov` | **@vitest/coverage-v8** | `npm run coverage` |
| Tout d'un coup | `make check`, `nox` | script `check` | `npm run check` |

Sous Windows, dans PowerShell, taper `npm.cmd` au lieu de `npm` si la politique d'exécution bloque les scripts (`npm.ps1`).

### npm, l'équivalent de uv

- `package-lock.json` joue le rôle de `uv.lock` : versions exactes de tout l'arbre de dépendances. `npm ci` (ce que fait la CI) installe exactement ce lockfile et refuse de continuer s'il ne correspond plus à `package.json`, comme `uv sync --locked`.
- `package.json` exige Node 24 ou plus (`engines`), comme `requires-python`.
- **Pourquoi pas pnpm ?** Il range `node_modules` plus strictement et partage les paquets entre projets. Mais pnpm 12 n'existe plus qu'en exécutable natif, bloqué à l'installation sur le PC de développement (septembre 2026). Pour un seul projet aux dépendances peu nombreuses, le gain ne valait pas la peine : le verrouillage reproductible, npm le fait déjà.

### ESLint et Prettier, l'équivalent de ruff

ruff fait les deux métiers ; ici ce sont deux outils :

- **ESLint** (`eslint.config.js`) repère ce qui est probablement faux : variable inutilisée, `any`, erreur de template Vue (`eslint-plugin-vue`), `console.log` oublié (seuls `warn`, `error` et `info` sont permis dans `src/`). Il ne détecte **pas** les promesses oubliées : il faudrait le mode typé de typescript-eslint, plus lent. `npm run lint:fix` corrige ce qui peut l'être, comme `ruff check --fix`.
- **Prettier** (clé `prettier` de `package.json`) ne s'occupe que de la forme : sans point-virgule, guillemets simples, lignes de 110 caractères, virgules finales. Il ignore les `.md`, `public/` et le lockfile (`.prettierignore`), plus tout ce que `.gitignore` ignore.

### Les tests

| Où | Quoi | Commande |
|---|---|---|
| `src/**/__tests__/` | le moteur de règles, les bots, le solveur, les statistiques, quelques composants (happy-dom) et la géométrie de la table ; sans réseau | `npm test` |
| `tests/*.test.ts` | contre l'émulateur Firestore : règles de sécurité, parcours complet d'une partie, courses entre joueurs, pause et reprise | `npm run test:rules` (lance l'émulateur, les tests, puis l'arrête) |
| `tests/*.mjs` | parcours dans de vrais navigateurs (Playwright), avec l'émulateur et `npm run dev:emu` lancés | `npm run test:e2e`, `test:bot`, `test:apercu` ; `node tests/audit.mjs` |
| `scripts/tournoi.bench.ts` | bots contre bots, chaque donne jouée deux fois, équipes inversées | `npm run tournoi` |
| `scripts/historique.seed.ts` | remplit l'émulateur de parties jouées par des bots | `npm run seed:stats` |

Deux tests gardent les bots honnêtes et utiles : `seuil.test.ts` (pas trop de donnes blanches) et `botExpert.test.ts` (le bot ★ joue la même carte quelles que soient les vraies mains des autres).

`npm run check` fait ce que fait la CI, sauf les tests sur émulateur et le build.

## La CI (`.github/workflows/deploy.yml`)

Sur chaque PR et chaque push sur `main`, le job **qualite** : `npm ci`, lint, formatage, types, tests, build, puis les tests sur émulateur (Java 21, binaires de l'émulateur en cache). Sur `main` seulement, si tout passe, le job **deploiement** : vérification des six clés, build avec les clés, règles Firestore, puis GitHub Pages. Détails dans `docs/FIREBASE.md`.

## Audit du 24/09/2026 : corrigé

| Gravité | Problème | Correction |
|---------|----------|------------|
| Critique | Deux joueurs qui rejoignaient ensemble : le second était refusé | Siège ajouté champ par champ (`arrayUnion`) |
| Critique | Distribution en plusieurs temps : partie figée si le second échouait | Une seule transaction pour tout |
| Critique | Les tests écrivaient dans la **vraie** base (Vitest chargeait `.env.local`) | Mode test verrouillé sur l'émulateur |
| Critique | Tout le journal relu à chaque coup : ≈ 140 000 lectures par partie | Lecture incrémentale (`readJournal`) |
| Critique | Cache du journal dupliqué par deux lectures simultanées | Lectures mises en file, doublons ignorés |
| Important | Phase et événement écrits séparément (contrat, fin de donne, fin de partie) | Même transaction |
| Important | Belote vérifiée après l'écriture de la carte | Vérifiée avant |
| Important | Le bot lisait le contrat de la 1ʳᵉ donne à toutes les donnes | Contrat de la donne en cours |

## Audit du 25/09/2026

Traité : le ménage de la racine, le code mort, la CI, les docs ; les règles Firestore (sièges, mains, journal, partie, archive — voir `docs/SECURITE.md`) ; DIS-2, ENC-9 et JEU-6 ; la main hors écran sur tablette ; « Rejouer » puis changer les équipes ; les duos de bots comptés deux fois ; le drapeau « aidé par un bot » ; la collision de codes de partie ; les scripts Playwright.

### Reste à faire

| Gravité | Problème | Piste |
|---------|----------|-------|
| Important | Fin de donne en plusieurs écritures : un onglet fermé pile entre deux fige la table ; archive jamais écrite si le dernier client disparaît | Écrire les conséquences dans la même transaction, ou laisser n'importe quel client clore et archiver |
| Important | Aucun test pour le store (`session.ts`), `botRunner.ts`, ni les composables | Tests avec minuteries simulées |
| Mineur | Un joueur assis peut encore fausser la partie en cours depuis la console (limite sans serveur, voir `docs/SECURITE.md`) | Une Cloud Function qui valide chaque coup |
| Mineur | La belote non annoncée du preneur compte dans l'analyse et pour le bot ★ | Ne compter que la belote annoncée |
| Mineur | Écoutes Firestore sans rappel d'erreur : « Connexion à la partie… » peut rester sans issue | Rappel d'erreur, bouton « Quitter » |
| Mineur | Deux clics simultanés sur « Rejouer » créent deux parties | Réserver la suivante dans la transaction |
| Mineur | Le typage de `tests/` et `scripts/` n'est vérifié nulle part | Les inclure dans un tsconfig |
| Mineur | Duplication téléphone / PC : ~100 lignes entre `StatsScreen` et `StatsPartiePc`, ~125 entre `StatsGlobalView` et `StatsGlobalPc` | Composables `useStatsPartie`, `useStatsGlobales` |
| Mineur | Boucle de Monte-Carlo presque identique entre `analyseJoueur.ts` et `botExpert.ts` | Une fonction commune |
| Mineur | Identifiants en français dans le code, contre la convention | Tout passer en anglais (PR dédiée) |
| Mineur | Lectures Firestore typées par `as` sans validation | `withConverter` typé |
