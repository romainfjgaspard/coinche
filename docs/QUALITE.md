# Qualité du code

Ce qui garde le code sain, et l'équivalent de chaque outil dans le monde Python.

## Les outils

| Rôle | Python | Ici | Commande |
|------|--------|-----|----------|
| Gestionnaire de paquets, verrouillage | `uv` | **npm** (`package-lock.json`) | `npm ci` |
| Linter : erreurs probables, mauvaises pratiques | `ruff check` | **ESLint** | `npm run lint` / `npm run lint:fix` |
| Formateur | `ruff format` | **Prettier** | `npm run format` / `npm run format:check` |
| Vérification des types | `mypy` / `pyright` | **vue-tsc** (TypeScript) | `npm run typecheck` |
| Tests | `pytest` | **Vitest** | `npm test` |
| Couverture | `pytest-cov` | **@vitest/coverage-v8** | `npm run coverage` |
| Tout d'un coup, comme la CI | `make check`, `nox` | script `check` | `npm run check` |

Sous Windows, dans PowerShell, taper `npm.cmd` au lieu de `npm` si la politique d'exécution
bloque les scripts (`npm.ps1`).

### npm, l'équivalent de uv

- `package-lock.json` joue le rôle de `uv.lock` : versions exactes de tout l'arbre de
  dépendances. `npm ci` (ce que fait la CI) installe exactement ce lockfile et refuse de
  continuer s'il ne correspond plus à `package.json`, comme `uv sync --locked`.
- `package.json` exige Node 24 ou plus (`engines`), comme `requires-python`.
- **Pourquoi pas pnpm ?** Il range `node_modules` plus strictement (on ne peut importer
  que ce qu'on a déclaré) et partage les paquets entre projets. Mais pnpm 12 n'existe plus
  qu'en exécutable natif, bloqué à l'installation sur le PC de développement (septembre
  2026). Pour un seul projet aux dépendances peu nombreuses, le gain ne valait pas la peine :
  le verrouillage reproductible, lui, npm le fait déjà.

### ESLint et Prettier, l'équivalent de ruff

ruff fait les deux métiers ; ici ce sont deux outils :

- **ESLint** (`eslint.config.js`) repère ce qui est probablement faux : variable
  inutilisée, `any`, promesse oubliée, erreur de template Vue (`eslint-plugin-vue`).
  `npm run lint:fix` corrige ce qui peut l'être automatiquement, comme `ruff check --fix`.
- **Prettier** (`.prettierrc.json`) ne s'occupe que de la forme. Réglé sur le style du
  projet : sans point-virgule, guillemets simples, lignes de 110 caractères.

### Les tests

- `src/game/__tests__/` : le moteur de règles, pur, sans réseau. Rapide.
- `tests/*.test.ts` : contre l'émulateur Firestore — règles de sécurité, parcours complet
  d'une partie, courses entre joueurs (`concurrence.test.ts`). `npm run test:rules` lance
  l'émulateur, les tests, puis l'arrête.
- `tests/*.mjs` : parcours dans de vrais navigateurs (Playwright), lancés à la main.

## Audit du 24/09/2026

### Corrigé

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

### Reste à faire

| Gravité | Problème | Piste |
|---------|----------|-------|
| Important | Fin de donne encore en plusieurs écritures (carte, pli, décompte) : un onglet fermé pile entre deux peut bloquer la table | Écrire plusieurs événements par transaction |
| Important | DIS-2 jamais appliquée : on rebat toujours au lieu de ramasser et couper | Transmettre les plis de la donne précédente à `deal` |
| Important | « Connexion à la partie… » peut rester affiché sans issue (partie introuvable, droits refusés) | Rappel d'erreur sur les écoutes, bouton « Quitter » |
| Mineur | Identifiants en français dans `partie.ts` et `botRunner.ts`, contre la convention | Renommage progressif |
| Mineur | Code mort : `readHand`, `isBotSeat`, `botSeats` | Supprimer |
| Mineur | Traces `console.warn('[p]', …)` des bots à chaque action | Les réserver au mode test |
| Mineur | Lectures Firestore typées par `as` sans validation | `withConverter` typé |
| Mineur | `playCard` fait plus de 100 lignes | Extraire la fin de donne |

### Tests à ajouter

Par priorité : fin de partie par `playCard` (archive, honte complète), `deal` avec
ramassage (DIS-2), `botRunner` avec des minuteries simulées, le store (`heldTrick`,
`startDeal`, `leave`), la géométrie `tableLayout`, puis les composants (`BiddingPanel`,
`DealResult`).
