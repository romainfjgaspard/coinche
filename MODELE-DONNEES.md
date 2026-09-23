# Modèle de données — journal d'événements

## Principe

`parties/{code}` (l'état courant : main de qui, pli en cours, scores) n'est **qu'une vue
matérialisée**, pratique pour l'affichage en direct. La **source de vérité** est le journal
append-only `evenements/`, en écriture seule, jamais modifié ni supprimé (garanti par les
règles Firestore).

Conséquence : n'importe quelle partie peut être **rejouée carte par carte**, et toute
statistique imaginable plus tard est calculable rétroactivement — y compris celles
auxquelles on ne pense pas ce soir.

## Identité : un roster figé

Quatre joueurs, identifiants stables et définitifs : **`benel`, `roux`, `viv`, `romain`**.

À l'arrivée sur l'app, on ne saisit pas un pseudo : **on choisit qui on est** parmi les
quatre. Le compte Firebase anonyme (`uid`) n'est qu'un jeton de session, associé à un siège
le temps d'une partie via `seats`.

Toutes les statistiques se rattachent au **`playerId`**, jamais à l'`uid` : vider les données
du navigateur donne un nouvel `uid`, mais `romain` reste `romain`. C'est ce qui rend
l'historique comparable sur des centaines de parties.

```
joueurs/{playerId}          ← roster fige, en lecture seule depuis l'app
parties/{code}.seats        ← { romain: { uid }, roux: { uid }, ... }
```

## Collections

```
parties/{code}
  etat courant (vue materialisee, ecrasable)

  evenements/{seq}          ← APPEND-ONLY, seq monotone. La verite.
  mains/{playerId}          ← main courante, lisible par le seul occupant du siege
  donne/{numero}            ← les 4 mains telles que distribuees
                              lisible par tous UNIQUEMENT quand phase == 'terminee'

archives/{partieId}         ← partie finie, figee, denormalisee pour l'analyse
```

## Types d'événements

| Type | Charge utile |
|------|--------------|
| `partie_creee` | `seats` (playerId -> siege), `equipes`, **`regles` (snapshot complet des flags)**, `versionMoteur` |
| `donne_commencee` | `numeroDonne`, `donneur` (playerId), `seed` |
| `distribution` | `mains: {uid: [8 cartes]}` (écrit dans `donne/`, scellé jusqu'à la fin) |
| `enchere` | `playerId`, `tourEnchere`, `type` (`passe`\|`contrat`\|`capot`\|`generale`), `valeur`, `couleur`, `dureeReflexionMs` |
| `coinche` / `surcoinche` | `playerId` |
| `contrat_fixe` | `preneurUid`, `valeur`, `couleur`, `multiplicateur` (1\|2\|4) |
| `carte_jouee` | `playerId`, `carte`, `pliNum`, `position`, `dureeReflexionMs` |
| `belote_annoncee` | `playerId`, `moitie` (`belote`\|`rebelote`) |
| `pli_termine` | `pliNum`, `gagnantUid`, `cartes[]`, `points`, `coupe`, `surcoupe` |
| `donne_terminee` | `points{A,B}`, `contrat`, `statut` (`reussi`\|`chute`\|`capot`\|`generale`\|`litige`), `detail` |
| `partie_terminee` | `scores`, `vainqueur`, `nbDonnes`, `dureeMs` |
| `donne_annulee` | `raison`, `playerId` |
| `joueur_connecte` / `joueur_deconnecte` | `playerId`, `ts` |
| `message_chat` | `playerId`, `texte` |
| `partie_reprise` | `playerId`, `apresInterruptionMs` |

> **Lexique** — « annonce » chez nous = **enchère** (`enchere`). Le déroulé complet des
> enchères est conservé : qui a parlé, dans quel ordre, à quel tour, ce qu'il a dit, combien
> de temps il a hésité, et les passes. On peut donc analyser les styles d'enchère (qui
> surenchérit, qui passe avec du jeu, qui coinche à la légère).

> **Rien n'est filtré.** Tout ce qui se produit pendant une partie devient un événement :
> les annonces et leur arbitrage, le chat, les déconnexions, les donnes annulées. Le doute
> se tranche toujours dans le même sens — on écrit.

## Trois décisions qui servent les stats, prises maintenant

**1. Snapshot des règles dans `partie_creee`.**
Le jour où vous changez un flag (ex. activer les annonces), les parties d'avant restent
interprétables. Sans ça, une base historique devient illisible dès la première évolution
de règle — l'erreur classique.

**2. Les mains ne circulent jamais dans le journal.**
On avait d'abord enregistré la main du joueur sur chaque carte posée, pour rendre
l'analyse immédiate. C'était une **fuite** : le journal est lisible par les quatre
joueurs, donc chacun pouvait lire la main de départ des autres dès la première carte.

Les mains distribuées vivent dans `donne/{numero}`, **scellé jusqu'à la fin de la
partie**. La main d'un joueur à n'importe quel instant se reconstitue en retirant les
cartes qu'il a déjà posées — rien n'est perdu pour l'analyse, et rien ne filtre
pendant le jeu. C'est aussi ce qui rend calculables les impasses, les coupes évitables
et la force de main au moment de l'enchère.

**3. `dureeReflexionMs` partout.**
Gratuit à capter, et l'hésitation est une donnée : temps de réflexion avant une coinche,
avant une impasse, avant de se défausser.

## L'impasse, telle qu'on la compte

Une **impasse** est tentée quand un joueur garde l'as de la couleur entamée alors que
**personne n'a coupé** avant lui dans ce pli : il fournit une autre carte de la couleur
et espère sortir son as plus tard, sur un dix.

L'issue se lit au pli où l'as tombe enfin :

| Ce qui arrive à l'as | Issue |
|---|---|
| Il se fait couper — le pli part à l'adversaire | **ratée** |
| Il ramasse le pli, et un dix est tombé dedans | **réussie** |
| Il ramasse le pli, mais sans dix | sans suite |

Le calcul (`src/game/impasses.ts`) ne lit que le journal : on sait qu'un joueur tenait
l'as **parce qu'il finit par le jouer**. Une impasse n'apparaît donc qu'au pli où l'as
tombe, et les chiffres d'une donne sont définitifs quand elle se termine. L'entameur
n'en fait jamais — il choisit sa couleur — et l'atout entamé ne compte pas.

## Export vers l'analyse

`npm run export` produira, depuis Firestore :

- `data/evenements.jsonl` — une ligne par événement, brut et complet
- `data/plis.csv` — table plate, une ligne par carte jouée (partie, donne, pli, joueur,
  carte, jouables, contrat, atout, gagnant du pli…)

Format pensé pour tomber direct dans pandas. Le dashboard viendra après, sur le modèle
de `comptes` (Streamlit + Plotly) — mais rien ne presse : **les données seront là.**

## Coût

Une partie ≈ 250 événements. Même à 3 parties par soirée, 2 fois par semaine, on reste
sous le pour-cent du quota gratuit Firestore. La rétention intégrale ne coûte rien.
