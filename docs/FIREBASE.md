# Firebase : le projet, les clés, le déploiement

Le vrai projet existe : **`coinche-e708b`** (Firestore natif en Europe, authentification anonyme), rattaché au compte Google de Romain. Cette page dit comment il est branché, et comment le refaire de zéro si besoin.

Sans `.env.local`, l'app bascule seule sur le projet bidon `demo-coinche` et les émulateurs : tout fonctionne en local sans compte.

## Les clés de l'app : `.env.local`

L'app lit sa configuration dans `.env.local`, à la racine, jamais commité (`*.local` est dans `.gitignore`). Les valeurs viennent de la console : **Paramètres du projet** (roue dentée) → **Général** → *Vos applications* → `</>`.

```
VITE_FIREBASE_API_KEY=AIza…
VITE_FIREBASE_AUTH_DOMAIN=coinche-e708b.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=coinche-e708b
VITE_FIREBASE_STORAGE_BUCKET=coinche-e708b.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=…
VITE_FIREBASE_APP_ID=1:…:web:…
```

Ces clés sont publiques par nature (elles finissent dans le site publié) : la sécurité repose entièrement sur `firestore.rules`.

**Attention : avec `.env.local`, `npm run dev` écrit dans la vraie base.** Pour tout essai, lancer l'émulateur (`npm run emu`) puis `npm run dev:emu`, qui force les émulateurs quelles que soient les clés. Les tests le font d'office : en mode `test`, l'app ne parle jamais au vrai projet (`src/firebase/app.ts`).

## Les deux projets de la CLI : `.firebaserc`

`.firebaserc` garde `demo-coinche` par **défaut** (c'est ce qui permet à `npm run emu` et aux tests de tourner en local) et déclare le vrai projet sous l'alias **`prod`**.

La CLI Firebase ne lit pas `.env.local` : elle ne regarde que `.firebaserc`. `VITE_FIREBASE_PROJECT_ID` doit donc contenir exactement l'identifiant de l'alias `prod`, sinon les règles partent sur un projet et l'app parle à un autre.

## Le déploiement : par la CI

À chaque merge dans `main`, `.github/workflows/deploy.yml` construit le site, **déploie les règles Firestore**, puis publie sur GitHub Pages. Les règles partent avant le site : un code qui s'appuie sur de nouvelles règles n'est jamais en ligne avant elles.

Réglé une fois sur GitHub, dans **Settings → Secrets and variables → Actions** :

- les six `VITE_FIREBASE_*`, mêmes valeurs que `.env.local` ; sans elles, le déploiement s'arrête plutôt que de publier un site branché sur un émulateur absent ;
- `FIREBASE_SERVICE_ACCOUNT` : la clé JSON d'un compte de service limité au déploiement des règles.

Pour créer ce compte de service : console Google Cloud du projet → **IAM et administration** → **Comptes de service** → créer un compte avec un rôle limité aux règles, par exemple **Administrateur des règles Firebase** (Firebase Rules Admin) → **Clés** → ajouter une clé JSON → coller son contenu dans le secret. Ne jamais garder ce fichier dans le dépôt (`service-account.json` est dans `.gitignore`).

Et dans la console Firebase : **Authentication → Settings → Authorized domains** → ajouter `romainfjgaspard.github.io`, sinon la connexion anonyme est refusée depuis le site publié.

### Déployer les règles à la main (secours)

```powershell
npx firebase login
npx firebase deploy --only firestore:rules --project prod
```

`npx firebase projects:list` peut ne pas montrer le projet même quand on est connecté avec le bon compte : ce n'est pas bloquant, le déploiement par alias fonctionne. `npx firebase login:list` dit avec quel compte on est connecté.

Vérifier ensuite dans la console (**Firestore → Règles**) qu'on voit bien `holdsSeat`, `claimsSeat` et le bloc `match /hands/{playerId}`.

## Index

Aucun index composite n'est nécessaire : chaque requête porte sur un seul champ (`seq`, `finishedAt`, `dealNumber`), que Firestore indexe tout seul.

## Remplir la vraie base de parties de démonstration

`npm run seed:stats:prod` joue de vraies parties entre bots et les archive dans la **vraie** base. Il refuse de tourner sans `$env:SEED_CONFIRM='coinche-e708b'`. À n'utiliser qu'en connaissance de cause : ces parties apparaissent dans les statistiques de tout le monde.

## Refaire le projet de zéro

1. <https://console.firebase.google.com> → **Ajouter un projet**. Firebase ajoute un suffixe au nom : c'est l'identifiant réel (comme `coinche-e708b`) qu'il faut utiliser partout. Google Analytics : désactivé.
2. **Authentication** → *Get started* → **Sign-in method** → **Anonyme** → activer. C'est le seul fournisseur : l'identité de joueur est choisie (ou ajoutée) dans l'app, jamais déduite du compte.
3. **Firestore Database** → *Créer une base*, mode **production**, emplacement **`eur3`** ou **`europe-west1`** (définitif).
4. **Paramètres du projet** → *Vos applications* → `</>`, surnom `coinche-web`, sans Firebase Hosting. Remplir `.env.local` comme plus haut.
5. Mettre le nouvel identifiant sous l'alias `prod` de `.firebaserc`, régler les secrets GitHub et le domaine autorisé, puis déployer les règles (par la CI ou à la main).
6. Vérifier : **Authentication → Users** se remplit d'un compte anonyme par onglet ouvert, et **Firestore → Données** montre `games` après la première partie.
