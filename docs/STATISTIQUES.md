# Les statistiques

Deux onglets, sur téléphone comme sur PC (le PC montre plus de colonnes) :

- **Partie en cours** : calculée en direct depuis le journal de la partie ;
- **Toutes les parties** : calculée depuis les archives, déposées à la fin de chaque partie (voir `docs/MODELE-DONNEES.md`). Accessible aussi depuis l'accueil.

Tout est calculé dans le navigateur, dans `src/game/` : `stats.ts` (partie en cours), `statsGlobal.ts` (toutes les parties), `statsBidding.ts` (enchères, écarts, temps), `finesses.ts`, `strength.ts`.

## Deux interrupteurs : avec bot, sans bot

Les statistiques globales se filtrent par deux interrupteurs indépendants : les parties **sans bot**, et les parties **avec bot** (au moins un siège tenu ou aidé par un bot). Tous les bots d'un même niveau y comptent pour un seul joueur, « Bot » ou « Bot ★ ».

## La partie en cours

| Sous-onglet | Contenu |
|---|---|
| Score | le score, l'objectif, l'évolution du score donne après donne ; le **momentum** : les points gagnés à chaque donne, en cascade (vers le haut pour nous, vers le bas pour eux) |
| Enchères | la répartition des annonces de chacun, et qui lance, suit ou prend seul (voir plus bas) |
| Jeu | les prises (réussies ou chutées, enchère moyenne, bilan), les impasses, l'écart à l'annonce, les temps de réflexion |
| Donnes | l'analyse de la partie (voir `docs/ANALYSE.md`), chaque donne avec ses enchères et « Revoir la donne », et « Ce qui s'est passé » : étoiles de la honte, belotes oubliées, plus grosse donne, coinches |

## Toutes les parties

| Sous-onglet | Contenu |
|---|---|
| Duos | meilleur et pire duo, meilleur et pire joueur (parties gagnées) ; duo par duo : parties, gagnées, donnes, prises, contrats tenus, points marqués et offerts, score moyen, pire score |
| Joueurs | joueur par joueur : prises, réussies, coinches, belotes, **bilan par donne** ; belotes, impasses, étoiles et temps de réflexion de chacun ; « jusqu'où chacun peut monter » (contrats pris et réussis à chaque palier) ; le **panache** |
| Enchères | les mêmes courbes que pour la partie en cours, sur toutes les parties |
| Temps | la distribution des temps de réflexion, pour annoncer et pour jouer |
| Parties | les **soirées** (parties enchaînées avec « Rejouer ») et les **parties non finies** |

## Les définitions

- **Bilan** : ce qu'un joueur a rapporté en prenant — la valeur de ses contrats réussis, moins celle de ses contrats chutés (offerte à la défense). Par donne jouée, pour comparer des joueurs qui n'ont pas joué autant.
- **Répartition des annonces** : chaque prise de parole, pas seulement l'annonce finale, en part des annonces chiffrées (80 à 170, capot, générale) ; la passe à part. La moyenne de chacun est un trait pointillé.
- **Lanceur, suiveur, seul** : quand son équipe a le contrat, qui a ouvert la couleur finale. Le premier de l'équipe à l'avoir annoncée est le lanceur, quelles que soient les relances ; celui qui a monté dans la couleur de son partenaire est le suiveur ; celui dont le partenaire n'a jamais suivi a pris seul.
- **Écart à l'annonce** : pour le preneur, les points faits (cartes, dix de der, belote) moins la valeur annoncée, séparément pour les contrats réussis et chutés. Capots et générales à part : ils se jouent aux plis.
- **Temps de réflexion** : mesuré sur l'écran de chacun, de l'instant où c'est à lui jusqu'à sa décision ; une pause n'y compte pas, la dernière carte (jouée d'office) non plus.
- **Impasse** : garder l'as de la couleur entamée alors que personne n'a coupé. Réussie si l'as ramasse ensuite un dix, ratée s'il se fait couper (détail dans `docs/MODELE-DONNEES.md`).
- **Étoile de la honte** : un capot fait sans l'avoir annoncé (DEC-8) ; trois dans une partie, c'est la honte complète.
- **Force de main** (`strength.ts`) : un barème simple sur la main du preneur au moment de l'enchère, à l'atout choisi — 1 par atout, +3 pour le valet, +2 pour le neuf, +2 par as extérieur, +1 par atout au-delà du quatrième, +2 par coupe franche.
- **Panache** : l'écart moyen entre ce qu'un joueur annonce et ce que **les autres** annoncent avec une main de force comparable (même bande de 3 points de force ; on prend la médiane des autres). Positif : plus audacieux que le groupe ; négatif : plus prudent.
- **Soirée** : une partie et toutes celles enchaînées avec « Rejouer » derrière elle.
- **Partie non finie** : commencée (au moins une donne) mais jamais terminée. « En cours » les six premières heures, « abandonnée » ensuite, « annulée » si un joueur l'a arrêtée. Elle ne compte dans aucune autre statistique.
