# Modèle de données

## Principe : un journal, et des vues

`games/{code}` décrit l'état courant d'une partie (qui est assis, la phase, les scores) : c'est une **vue**, pratique pour l'affichage en direct. Ce qui s'est joué est dans le journal `games/{code}/events`, **append-only** : les règles Firestore interdisent d'y modifier ou d'y supprimer quoi que ce soit.

N'importe quelle partie peut donc être rejouée carte par carte, et une statistique inventée plus tard se calcule sur tout l'historique.

Deux réglages ne sont **pas** dans le journal : l'objectif et le blitz choisis au salon avant la première donne. Ils vivent dans le document de partie, puis dans l'archive. Le placement, lui, y est : à la création (« Rejouer »), et à chaque changement d'équipes au salon (`seating_set`).

## Identité : des joueurs, pas des comptes

Toutes les statistiques se rattachent au **`playerId`**, jamais au compte Firebase. Le compte anonyme (`uid`) n'est qu'un jeton de session, associé à un siège le temps d'une partie : vider les données du navigateur donne un nouvel `uid`, mais `romain` reste `romain`.

- **Les quatre du départ** — `benel`, `roux`, `viv`, `romain` — sont écrits en dur (`PLAYER_IDS`, `src/game/players.ts`) et n'existent pas en base.
- **Les autres** sont créés depuis l'app dans `players/{playerId}` : `{ name, createdAt }`. L'identifiant vient du nom (minuscules, sans accents, 20 caractères au plus, `playerIdFrom`), et le préfixe `bot` est réservé. Un nom déjà pris est refusé. Les règles permettent de créer un joueur, jamais de le modifier ni de le supprimer.
- **La liste de l'accueil** est propre à chaque navigateur (`localStorage` `coinche.joueurs`). La croix retire un joueur **de cette liste seulement** : ni lui ni ses parties ne sont effacés.
- **Les bots** sont anonymes : `bot-basic-1`, `bot-expert-2`… Le niveau fait partie de l'identifiant (`basic` = bot de base, `expert` = bot ★) et les statistiques regroupent les bots d'un même niveau (`groupBots`). Ils s'affichent « Bot », « Bot ★ », « Bot 2 ».

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

### Le document de partie (`GameDoc`, `src/firebase/game.ts`)

| Champ | Sens |
|---|---|
| `seats` | `playerId → Seat` (voir plus bas) |
| `seatedUids` | les comptes assis, dénormalisés pour les règles Firestore |
| `seating` | le placement, qui fait les équipes : nul tant que la table n'est pas complète, puis tiré au sort par le quatrième arrivé, ou choisi au salon |
| `dealer` | le donneur de la donne en cours |
| `phase` | `lobby`, `bidding`, `playing`, `scoring`, `finished`, `cancelled` |
| `dealNumber`, `scores` | numéro de la donne, scores cumulés `[équipe 0, équipe 1]` |
| `eventSeq` | le prochain `seq` du journal |
| `moveSeq` | le nombre de décisions écrites : la garde contre deux coups simultanés (erreur `ConcurrentWrite`) |
| `createdAt`, `creatorId` | création, et qui peut proposer « Rejouer » |
| `target`, `blitz` | choisis au salon ; `target` absent = 1000 |
| `nextGame` | « Rejouer » : le code de la partie suivante, où chacun est rebasculé |
| `evening` | le code de la première partie d'une chaîne de « Rejouer » (absent sur la première) |
| `pause` | `{ by, since }` pendant une pause, absent ou nul sinon |
| `lastSeat` | le siège touché par le dernier changement de siège : les règles Firestore en ont besoin pour le contrôler |

Un **siège** (`Seat`) : `{ uid, bot?, level?, replaced?, formerUid?, botAssisted? }`.

- `bot`, `level` : le siège est tenu par un bot, de ce niveau.
- `replaced`, `formerUid` : un bot a pris la place d'un joueur qui ne répondait plus. Le siège garde le `playerId` du joueur (les coups du bot sont attribués à son nom) et, dans `formerUid`, son compte : lui seul peut reprendre sa place.
- `botAssisted` : le joueur a repris sa place ; un bot a joué pour lui, la partie comptera « avec bot ».

Les bots tournent dans l'onglet de celui qui les a ajoutés, **avec sa session** : leurs sièges portent son compte. Si cet onglet se ferme, l'onglet d'un autre joueur assis reprend leurs sièges (`takeOverBotSeat`) au bout de 15 s de silence, 45 s pour le donneur entre deux donnes. Voir `docs/BOTS.md` et `docs/SECURITE.md`.

## Le journal (`src/game/events.ts`)

Chaque événement porte `seq` (ordre), `at` (horodatage) et, pour une décision de joueur, `thinkMs` : le temps de réflexion, mesuré par le client qui agit. `thinkMs` est absent quand il est inconnu, et sur la huitième carte, jouée d'office.

| Type | Charge utile |
|---|---|
| `game_created` | `seats` (playerId → uid, le créateur seul), `seating` (nul, sauf après « Rejouer »), `rules` (copie des règles), `engineVersion` |
| `player_joined` | `player` |
| `seating_set` | `player`, `seating`, `dealer` : les équipes changées au salon, avant la première donne |
| `deal_started` | `dealNumber`, `dealer`, `cut` |
| `bid` | `player`, `round`, `entry` : `{ kind: 'pass' \| 'contract' \| 'capot' \| 'generale', player, value?, suit?, declaration? }` |
| `coinche`, `surcoinche` | `player` |
| `contract_set` | `taker`, `value`, `trump`, `declaration` (absent avant le 24/09), `multiplier` (1, 2, 4), `capot`, `generale` |
| `deal_cancelled` | `dealNumber`, `reason: 'four_passes'` |
| `card_played` | `player`, `card`, `trickNumber`, `position` |
| `belote_declared` | `player`, `half` (`belote` puis `rebelote`) |
| `trick_done` | `trickNumber`, `winner`, `cards`, `points`, `cut`, `overcut` |
| `deal_done` | `dealNumber`, `status` (`made`, `down`, `capot`, `generale`), `cardPoints`, `compared`, `scores`, `beloteDeclaredBy`, `beloteForgottenBy`, `shameStar`, `blitz?` |
| `full_shame` | `player`, `stars` : troisième étoile de la honte dans la partie |
| `pause`, `resume` | `player` |
| `game_over` | `scores`, `winner`, `deals` |
| `game_cancelled` | `player` : la partie n'est pas archivée |

`player_left` et `chat_message` sont déclarés dans les types mais jamais écrits : il n'y a ni suivi des déconnexions ni chat.

> **Lexique** — « annonce » chez nous = **enchère**. Le déroulé complet des enchères est conservé : qui a parlé, dans quel ordre, ce qu'il a dit, combien de temps il a hésité, et les passes.

## Trois décisions prises pour les statistiques

**1. Une copie des règles dans `game_created`.** Le jour où une règle change, les parties d'avant restent interprétables.

**2. Les mains ne circulent jamais dans le journal.** Le journal est lisible par les quatre joueurs : y mettre les mains, c'était montrer à chacun le jeu des autres. Les mains distribuées vivent dans `deals/{number}`, scellé jusqu'à la fin de la partie. La main d'un joueur à n'importe quel moment se reconstitue en retirant les cartes qu'il a déjà posées.

**3. Le temps de réflexion partout.** Gratuit à capter, et l'hésitation est une donnée.

## L'archive (`src/game/archive.ts`)

Déposée par le client qui pose la dernière carte, une seule fois. Elle porte :

- `code`, `finishedAt`, `seating`, `scores`, `winner`, `deals` ;
- `bots` : les sièges tenus ou aidés par un bot (d'où le filtre « avec bot / sans bot » des statistiques) ;
- `evening`, `target` (seulement s'il diffère de 1000), `blitz` ;
- `players` : par joueur, prises, réussies, chutes, points marqués et offerts, coinches, belotes annoncées et oubliées, étoiles, impasses, et le détail de chaque prise avec la force de la main (barème dans `src/game/strength.ts`) ;
- ajoutés au fil du temps, donc absents des archives plus anciennes : `coinchesWon` et `thinkTime` (24/09), `calls`, `roles`, `gaps`, `times` (25/09).

Les **parties non finies** (commencées, jamais terminées) ne sont pas archivées. Les statistiques les listent à part, en lisant seulement leur document de partie.

## L'impasse, telle qu'on la compte

Une **impasse** est tentée quand un joueur garde l'as de la couleur entamée alors que **personne n'a coupé** avant lui dans ce pli : il fournit une autre carte de la couleur et espère sortir son as plus tard, sur un dix.

| Ce qui arrive à l'as | Issue |
|---|---|
| Il se fait couper, le pli part à l'adversaire | **ratée** |
| Il ramasse le pli, et un dix est tombé dedans | **réussie** |
| Il ramasse le pli, mais sans dix | sans suite |

Le calcul (`src/game/finesses.ts`) ne lit que le journal : on sait qu'un joueur tenait l'as **parce qu'il finit par le jouer**. L'entameur n'en fait jamais, et l'atout entamé ne compte pas.

## Stockage dans le navigateur

| Clé | Contenu |
|---|---|
| `localStorage` `coinche.session` | `{ playerId, code }` : la partie à rouvrir |
| `localStorage` `coinche.joueurs` | la liste de joueurs de l'accueil |
| `localStorage` `coinche.dernierCode` | le dernier code saisi |
| `sessionStorage` `coinche.bots` | les bots que cet onglet fait tourner |

Ces clés restent en français, contrairement au reste du code : les renommer ferait perdre à chacun sa liste de joueurs et sa partie en cours.

## Coût

Une partie fait environ 600 événements. Même à trois parties par soirée, deux fois par semaine, on reste loin du quota gratuit de Firestore : la conservation intégrale ne coûte rien.
