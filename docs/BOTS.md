# Les bots

Une place libre se confie à un bot, au salon. Deux niveaux :

| Bouton | Niveau | Identifiant | Ce qu'il fait |
|---|---|---|---|
| « + bot » | bot de base (`simple`) | `bot-simple-1`, `bot-simple-2`… | les réflexes d'un bon joueur, par règles |
| « + bot ★ » | expert (`compteur`) | `bot-etoile-1`… | enchérit comme le bot de base, mais réfléchit chaque carte avec le solveur |

Les identifiants et les niveaux enregistrés (`simple`, `compteur`) datent de la première version des bots ; ils sont gardés tels quels pour que les parties déjà jouées restent lisibles. À l'écran, les bots s'appellent « Bot », « Bot ★ », « Bot 2 »… et les statistiques regroupent tous les bots d'un même niveau en un seul joueur.

## Aucun bot ne voit le jeu des autres

La décision d'un bot ne dépend que de ce qu'un humain à sa place saurait : sa main, les cartes posées, le contrat, les enchères, la belote annoncée. C'est garanti par la forme même du code : `BotView` (`src/game/bot.ts`) ne contient rien d'autre, et le bot ★ reçoit la même vue. Un test (`botExpert.test.ts`) rebat les vraies mains des adversaires et vérifie que le bot ★ joue exactement la même carte.

Ce ne sont pas les règles Firestore qui le garantissent : les bots tournent dans l'onglet du joueur qui les a ajoutés, avec sa session, qui a accès à leurs mains (voir `docs/SECURITE.md`). Un joueur qui ouvrirait la console de son navigateur pourrait donc lire la main des bots qu'il héberge ; le bot, lui, ne le fait pas.

## Le bot de base (`src/game/bot.ts`)

### Enchères

- **Évaluer sa main** pour chaque atout possible (`valeurMain`) : valet 20, neuf 15 (10 sans le valet, 5 s'il est sec), as d'atout 10, dix 5, petits atouts 3, 10 par atout au-delà du troisième, belote 20 ; hors atout, 10 par as et 10 de plus pour un as-dix ; 10 par coupe franche et 5 par singleton quand on a au moins trois atouts.
- **Ouvrir** dans sa meilleure couleur à partir de 45 (80 à 45, un palier de plus par tranche de 10). Le dernier à parler, après trois passes, se lance dès 35 plutôt que de laisser redistribuer.
- **Soutenir son partenaire** (`soutien`), selon la convention courante : +20 avec le valet de sa couleur, +10 avec le neuf, +10 par as, +20 avec la belote. Le soutien ne se donne qu'une fois, à partir de la première annonce du partenaire, et l'ouvreur ne remonte pas sur son propre soutien.
- **Changer de couleur** quand le partenaire tient l'enchère, seulement avec bien mieux (au moins deux paliers au-dessus).
- **Coincher** (`doitCoincher`) le contrat adverse quand sa main pèse assez contre lui (`valeurDefense` : gros atouts, longueur d'atout, as et dix extérieurs) : 60 contre un 80, 5 de moins par palier au-dessus.
- Il ne surcoinche jamais, et n'annonce ni capot ni générale.

### Jeu de la carte

- **Entame, camp du preneur** : tant que les adversaires peuvent encore avoir de l'atout, il tire l'atout — l'atout maître d'abord (le valet, puis le neuf une fois le valet tombé), sinon un petit, jamais le neuf sous un valet encore dehors. Le partenaire du preneur rejoue atout lui aussi.
- **Entame, sinon** : les cartes maîtresses d'abord, puis une petite carte, de préférence dans une couleur où l'on n'expose pas un dix sans son as.
- **Le partenaire tient le pli** : il charge (la carte la plus chère) si plus personne ne peut reprendre, sinon il se défausse petit.
- **L'adversaire tient le pli** : il prend avec la plus petite carte qui garde le pli ; s'il ne peut pas le garantir, il ne tente que si ça ne coûte presque rien ; sinon il se défausse au moins cher.
- Il **compte les cartes** : ce qui est tombé, et qui a montré qu'il n'avait plus une couleur (`cartesImpossibles`). Il ne craint une coupe que si l'adversaire suivant a montré qu'il ne peut plus fournir : au premier tour d'une couleur, il prend quand même.
- Il annonce toujours sa belote.

## Le bot ★ (`src/game/botExpert.ts`)

À chaque carte, il fait ce que fait l'analyse de fin de partie :

1. il imagine des répartitions des cartes cachées **compatibles avec ce qu'il sait** (sa main, les cartes tombées, les couleurs où chacun a montré qu'il n'avait plus rien) ;
2. il résout chacune à cartes ouvertes avec le solveur (`src/game/solveur.ts`), pour chaque carte qu'il peut jouer ;
3. il joue la carte qui donne en moyenne le plus de chances à son camp — réussir le contrat, ou le faire chuter — puis le plus de points.

C'est la méthode des meilleurs programmes de bridge (« Monte-Carlo à cartes ouvertes »). Elle a un travers connu : dans chaque tirage, le bot « sait » où sont les cartes, donc tirer atout ne lui paraît jamais urgent. D'où un garde-fou : quand l'écart avec le réflexe du bot de base tient dans le bruit des tirages (5 points de chances, 4 points de cartes), il garde le réflexe.

Il réfléchit **dans un fil à part** (Web Worker, `botExpert.worker.ts`) pour ne pas figer l'écran de celui qui l'héberge : jusqu'à 40 tirages, en 1,5 s environ. Si le fil ne répond pas en 8 s, le bot de base joue à sa place. Il joue aussi comme le bot de base dans les contrats que le solveur ne sait pas compter : générale, sans-atout, tout-atout.

## Mesurer plutôt que supposer : le tournoi

`npm run tournoi` fait jouer deux façons de jouer l'une contre l'autre, sans Firebase (`scripts/tournoi.bench.ts`). Chaque donne est jouée **deux fois**, les équipes échangeant leurs places : la chance de la distribution s'annule, et l'écart ne vient que des enchères et du jeu. Choisir les joueurs avec `$env:A` et `$env:B` (`base`, `expert`, `hasard`) et le nombre de donnes avec `$env:DONNES`.

Mesures du 25/09/2026 :

| Match | Donnes (jouées deux fois) | Écart par donne |
|---|---|---|
| Bot de base contre l'ancien bot | 3 000 | +21,8 (± 2,4) |
| Bot ★ contre bot de base | 150 | +20,5 (± 9,4) |
| Bot de base qui coinche, contre des joueurs qui surenchérissent | 3 000 | +8,4 (± 1,5) |

Les seuils d'ouverture (45) et de coinche (60) sont ceux qui ont gagné ces tournois. Le bot ★ est lent (environ 12 s par donne jouée deux fois) : 150 donnes prennent une demi-heure.

## Dans une vraie partie (`src/firebase/botRunner.ts`)

- Le bot écoute la partie et le journal déjà suivis par l'onglet, et agit quand c'est son tour, après un temps de réflexion simulé.
- **Le donneur bot** attend qu'un humain ait lancé la partie, puis qu'on ait lu le décompte, avant de redistribuer.
- **Onglet fermé** : un onglet rechargé relance ses propres bots. Sinon, un bot muet depuis 15 s (45 s pour le donneur entre deux donnes) est repris par l'onglet d'un autre joueur assis.
- **Joueur absent** : au bout d'une minute sans réponse, les autres peuvent le remplacer par un bot de base, qui joue sous son nom. Il reprend sa place quand il revient, depuis le même appareil ; la partie compte alors « avec bot ».
