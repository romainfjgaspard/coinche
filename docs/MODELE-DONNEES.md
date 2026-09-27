# Modèle de données

## Principe : un journal, et des vues

`parties/{code}` décrit l'état courant d'une partie (qui est assis, la phase, les scores) : c'est une **vue**, pratique pour l'affichage en direct. Ce qui s'est joué est dans le journal `parties/{code}/evenements`, **append-only** : les règles Firestore interdisent d'y modifier ou d'y supprimer quoi que ce soit.

N'importe quelle partie peut donc être rejouée carte par carte, et une statistique inventée plus tard se calcule sur tout l'historique.

Deux réglages ne sont **pas** dans le journal : l'objectif et le blitz choisis au salon avant la première donne. Ils vivent dans le document de partie, puis dans l'archive. Le placement, lui, y est : à la création (« Rejouer »), et à chaque changement d'équipes au salon (`placement`).

## Identité : des joueurs, pas des comptes

Toutes les statistiques se rattachent au **`playerId`**, jamais au compte Firebase. Le compte anonyme (`uid`) n'est qu'un jeton de session, associé à un siège le temps d'une partie : vider les données du navigateur donne un nouvel `uid`, mais `romain` reste `romain`.

- **Les quatre du départ** — `benel`, `roux`, `viv`, `romain` — sont écrits en dur (`PLAYER_IDS`, `src/game/players.ts`) et n'existent pas en base.
- **Les autres** sont créés depuis l'app dans `joueurs/{playerId}` : `{ nom, creeLe }`. L'identifiant vient du nom (minuscules, sans accents, 20 caractères au plus, `playerIdFrom`), et le préfixe `bot` est réservé. Un nom déjà pris est refusé. Les règles permettent de créer un joueur, jamais de le modifier ni de le supprimer.
- **La liste de l'accueil** est propre à chaque navigateur (`localStorage` `coinche.joueurs`). La croix retire un joueur **de cette liste seulement** : ni lui ni ses parties ne sont effacés.
- **Les bots** sont anonymes : `bot-simple-1`, `bot-etoile-2`… Le niveau fait partie de l'identifiant (`simple` = bot de base, `compteur` = bot ★) et les statistiques regroupent les bots d'un même niveau (`regrouperBots`). Ils s'affichent « Bot », « Bot ★ », « Bot 2 ».

## Collections

```
joueurs/{playerId}            { nom, creeLe }, création seule

parties/{code}                l'état courant (GameDoc)
  evenements/{id}             le journal : un document par événement, id aléatoire,
                              ordre porté par le champ `seq`. Append-only.
  mains/{playerId}            { cards } : la main courante, lisible par le seul occupant
                              du siège ; elle s'allège dans la même transaction que la carte posée
  donne/{numero}              { hands, cut, at } : les quatre mains distribuées, scellées
                              jusqu'à la fin de la partie, puis lisibles pour l'analyse

archives/{code}               le condensé de fin de partie, écrit une fois, jamais retouché
```

### Le document de partie (`GameDoc`, `src/firebase/partie.ts`)

| Champ | Sens |
|---|---|
| `seats` | `playerId → Siege` (voir plus bas) |
| `seatedUids` | les comptes assis, dénormalisés pour les règles Firestore |
| `seating` | le placement, qui fait les équipes : nul tant que la table n'est pas complète, puis tiré au sort par le quatrième arrivé, ou choisi au salon |
| `dealer` | le donneur de la donne en cours |
| `phase` | `lobby`, `encheres`, `jeu`, `decompte`, `terminee`, `annulee` |
| `dealNumber`, `scores` | numéro de la donne, scores cumulés `[équipe 0, équipe 1]` |
| `eventSeq` | le prochain `seq` du journal |
| `moveSeq` | le nombre de décisions écrites : la garde contre deux coups simultanés (erreur `ConcurrentWrite`) |
| `createdAt`, `createur` | création, et qui peut proposer « Rejouer » |
| `objectif`, `blitz` | choisis au salon ; `objectif` absent = 1000 |
| `suivante` | « Rejouer » : le code de la partie suivante, où chacun est rebasculé |
| `soiree` | le code de la première partie d'une chaîne de « Rejouer » (absent sur la première) |
| `pause` | `{ par, depuis }` pendant une pause, absent ou nul sinon |
| `dernierSiege` | le siège touché par le dernier changement de siège : les règles Firestore en ont besoin pour le contrôler |

Un **siège** (`Siege`) : `{ uid, bot?, niveau?, remplace?, ancien?, aideBot? }`.

- `bot`, `niveau` : le siège est tenu par un bot, de ce niveau.
- `remplace`, `ancien` : un bot a pris la place d'un joueur qui ne répondait plus. Le siège garde le `playerId` du joueur (les coups du bot sont attribués à son nom) et, dans `ancien`, son compte : lui seul peut reprendre sa place.
- `aideBot` : le joueur a repris sa place ; un bot a joué pour lui, la partie comptera « avec bot ».

Les bots tournent dans l'onglet de celui qui les a ajoutés, **avec sa session** : leurs sièges portent son compte. Si cet onglet se ferme, l'onglet d'un autre joueur assis reprend leurs sièges (`reprendreSiegeBot`) au bout de 15 s de silence, 45 s pour le donneur entre deux donnes. Voir `docs/BOTS.md` et `docs/SECURITE.md`.

## Le journal (`src/game/events.ts`)

Chaque événement porte `seq` (ordre), `at` (horodatage) et, pour une décision de joueur, `thinkMs` : le temps de réflexion, mesuré par le client qui agit. `thinkMs` est absent quand il est inconnu, et sur la huitième carte, jouée d'office.

| Type | Charge utile |
|---|---|
| `partie_creee` | `seats` (playerId → uid, le créateur seul), `seating` (nul, sauf après « Rejouer »), `rules` (copie des règles), `engineVersion` |
| `joueur_connecte` | `player` |
| `placement` | `player`, `seating`, `dealer` : les équipes changées au salon, avant la première donne |
| `donne_commencee` | `dealNumber`, `dealer`, `cut` |
| `enchere` | `player`, `round`, `entry` : `{ kind: 'passe' \| 'contrat' \| 'capot' \| 'generale', player, value?, suit?, declaration? }` |
| `coinche`, `surcoinche` | `player` |
| `contrat_fixe` | `taker`, `value`, `trump`, `declaration` (absent avant le 24/09), `multiplier` (1, 2, 4), `capot`, `generale` |
| `donne_annulee` | `dealNumber`, `reason: 'quatre_passes'` |
| `carte_jouee` | `player`, `card`, `trickNumber`, `position` |
| `belote_annoncee` | `player`, `half` (`belote` puis `rebelote`) |
| `pli_termine` | `trickNumber`, `winner`, `cards`, `points`, `cut`, `overcut` |
| `donne_terminee` | `dealNumber`, `status` (`reussi`, `chute`, `capot`, `generale`), `cardPoints`, `compared`, `scores`, `beloteDeclaredBy`, `beloteForgottenBy`, `etoile`, `blitz?` |
| `honte_complete` | `player`, `stars` : troisième étoile de la honte dans la partie |
| `pause`, `reprise` | `player` |
| `partie_terminee` | `scores`, `winner`, `deals` |
| `partie_annulee` | `player` : la partie n'est pas archivée |

`joueur_deconnecte` et `message_chat` sont déclarés dans les types mais jamais écrits : il n'y a ni suivi des déconnexions ni chat.

> **Lexique** — « annonce » chez nous = **enchère**. Le déroulé complet des enchères est conservé : qui a parlé, dans quel ordre, ce qu'il a dit, combien de temps il a hésité, et les passes.

## Trois décisions prises pour les statistiques

**1. Une copie des règles dans `partie_creee`.** Le jour où une règle change, les parties d'avant restent interprétables.

**2. Les mains ne circulent jamais dans le journal.** Le journal est lisible par les quatre joueurs : y mettre les mains, c'était montrer à chacun le jeu des autres. Les mains distribuées vivent dans `donne/{numero}`, scellé jusqu'à la fin de la partie. La main d'un joueur à n'importe quel moment se reconstitue en retirant les cartes qu'il a déjà posées.

**3. Le temps de réflexion partout.** Gratuit à capter, et l'hésitation est une donnée.

## L'archive (`src/game/archive.ts`)

Déposée par le client qui pose la dernière carte, une seule fois. Elle porte :

- `code`, `finishedAt`, `seating`, `scores`, `winner`, `deals` ;
- `bots` : les sièges tenus ou aidés par un bot (d'où le filtre « avec bot / sans bot » des statistiques) ;
- `soiree`, `objectif` (seulement s'il diffère de 1000), `blitz` ;
- `players` : par joueur, prises, réussies, chutes, points marqués et offerts, coinches, belotes annoncées et oubliées, étoiles, impasses, et le détail de chaque prise avec la force de la main (barème dans `src/game/force.ts`) ;
- ajoutés au fil du temps, donc absents des archives plus anciennes : `coinchesGagnees` et `reflexion` (24/09), `annonces`, `roles`, `ecarts`, `temps` (25/09).

Les **parties non finies** (commencées, jamais terminées) ne sont pas archivées. Les statistiques les listent à part, en lisant seulement leur document de partie.

## L'impasse, telle qu'on la compte

Une **impasse** est tentée quand un joueur garde l'as de la couleur entamée alors que **personne n'a coupé** avant lui dans ce pli : il fournit une autre carte de la couleur et espère sortir son as plus tard, sur un dix.

| Ce qui arrive à l'as | Issue |
|---|---|
| Il se fait couper, le pli part à l'adversaire | **ratée** |
| Il ramasse le pli, et un dix est tombé dedans | **réussie** |
| Il ramasse le pli, mais sans dix | sans suite |

Le calcul (`src/game/impasses.ts`) ne lit que le journal : on sait qu'un joueur tenait l'as **parce qu'il finit par le jouer**. L'entameur n'en fait jamais, et l'atout entamé ne compte pas.

## Stockage dans le navigateur

| Clé | Contenu |
|---|---|
| `localStorage` `coinche.session` | `{ playerId, code }` : la partie à rouvrir |
| `localStorage` `coinche.joueurs` | la liste de joueurs de l'accueil |
| `localStorage` `coinche.dernierCode` | le dernier code saisi |
| `sessionStorage` `coinche.bots` | les bots que cet onglet fait tourner |

## Coût

Une partie fait environ 600 événements. Même à trois parties par soirée, deux fois par semaine, on reste loin du quota gratuit de Firestore : la conservation intégrale ne coûte rien.
