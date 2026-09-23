# Mettre l'app sur un vrai projet Firebase

Tant que `.env.local` n'existe pas, l'app bascule seule sur le projet bidon
`demo-coinche` et les émulateurs — tout fonctionne en local sans compte. Cette
procédure sert à passer au vrai projet, pour jouer entre nous depuis nos téléphones.

Tout se fait une seule fois, et rien dans le code n'est à modifier.

## 1. Créer le projet

1. <https://console.firebase.google.com> → **Ajouter un projet**
2. Nom : `coinche`. **Firebase y ajoute un suffixe** : l'identifiant réel ressemble à
   `coinche-4f2a1`. C'est lui qu'il faudra utiliser partout, jamais le nom affiché.
3. Google Analytics : **désactivé** — inutile ici, et ça évite un consentement à gérer

## 2. Activer l'authentification anonyme

**Authentication** → *Get started* → onglet **Sign-in method** → **Anonyme** → activer.

C'est le seul fournisseur nécessaire. Le compte anonyme n'est qu'un jeton de session :
l'identité de joueur (`benel`, `roux`, `viv`, `romain`) est choisie dans l'app, jamais
déduite du compte.

## 3. Créer la base Firestore

**Firestore Database** → *Créer une base de données*

- Mode : **production** (les règles du dépôt prennent le relais à l'étape 5)
- Emplacement : **`eur3`** ou **`europe-west1`** — à choisir maintenant,
  c'est **définitif** et on joue depuis la France

## 4. Récupérer la configuration web

**Paramètres du projet** (roue dentée) → **Général** → *Vos applications* → **`</>`**

- Surnom : `coinche-web`
- **Ne pas** cocher Firebase Hosting (on déploie sur GitHub Pages)

Copie les six valeurs de l'objet `firebaseConfig` dans un fichier `.env.local`
à la racine du dépôt — le modèle est déjà là :

```bash
cp .env.local.example .env.local
```

```
VITE_FIREBASE_API_KEY=AIza…
VITE_FIREBASE_AUTH_DOMAIN=<PROJECT_ID>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<PROJECT_ID>
VITE_FIREBASE_STORAGE_BUCKET=<PROJECT_ID>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abcdef…
```

`.env.local` est dans `.gitignore` — il ne doit jamais être commité, même si ces
clés sont publiques par nature : la sécurité repose entièrement sur `firestore.rules`.

## 5. Déployer les règles

C'est l'étape à ne pas sauter : sans elle, la base est ouverte ou fermée à tort.

```bash
npx firebase login

# l'identifiant exact du projet, celui avec le suffixe
npx firebase projects:list
```

Le vrai projet est déclaré sous l'alias **`prod`** dans `.firebaserc`, et le `default`
reste `demo-coinche` : c'est ce qui permet à `npm run emu` de continuer à tourner en
local. Le déploiement se fait donc en nommant l'alias :

```bash
npx firebase deploy --only firestore:rules --project prod
```

Attention : `.env.local` ne sert qu'à **l'app**. La CLI Firebase ne le lit pas — elle
ne regarde que `.firebaserc`. C'est la confusion classique quand le déploiement
échoue avec « project not found » alors que l'app, elle, est bien configurée.

`VITE_FIREBASE_PROJECT_ID` dans `.env.local` doit contenir **exactement** le même
identifiant : sinon les règles partent sur un projet et l'app parle à un autre.

Si `projects:list` ne montre rien : soit le projet n'est pas créé, soit tu es
connecté avec un autre compte Google que celui de la console — `npx firebase
login:list` dit lequel.

Vérifie ensuite dans la console (**Firestore → Règles**) que tu vois bien
`holdsSeat`, `claimsSeat` et le bloc `match /mains/{playerId}`.

Aucun index composite n'est nécessaire : les seules requêtes triées le sont sur un
champ unique (`seq`, `finishedAt`), ce que Firestore indexe tout seul.

## 6. Vérifier

```bash
npm run dev
```

L'app parle maintenant au vrai projet. Deux signes que c'est bon :

- **Authentication → Users** se remplit d'un compte anonyme par onglet ouvert
- **Firestore → Données** montre une collection `parties` après la première partie créée

Pour revenir aux émulateurs, il suffit de renommer `.env.local` — le code détecte
l'absence de `VITE_FIREBASE_PROJECT_ID` et rebascule tout seul.

## 7. Publier sur GitHub Pages

Le `base` de Vite est déjà réglé sur `/coinche/`, ce qui correspond à
`romainfjgaspard.github.io/coinche/`.

Attention : `.env.local` n'existant pas sur GitHub, il faudra passer les mêmes
variables en *secrets* du dépôt et les injecter au build. À faire au moment où on
mettra la CI en place.
