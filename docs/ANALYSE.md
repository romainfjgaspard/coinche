# L'analyse des parties

Trois outils, tous calculés dans le navigateur à partir du journal, sans rien écrire en base. Les mains distribuées ne sont lisibles qu'une fois la partie terminée (`donne/{n}`, voir `docs/MODELE-DONNEES.md`) ; pendant la partie, les mains d'une donne finie se reconstituent à partir des huit plis joués (`src/game/revue.ts`).

## Revoir une donne

Depuis le décompte (« Revoir la donne ») ou l'onglet Donnes des statistiques : les quatre mains telles que distribuées, les enchères, et les huit plis dans l'ordre, avec les points de chaque pli. Rien n'est calculé : c'est la donne telle qu'elle s'est jouée.

## « Aurait-on pu gagner ? » — à cartes ouvertes (`src/game/analyse.ts`)

On rejoue la donne carte par carte. Avant et après chaque carte, le **solveur** (`src/game/solveur.ts`) calcule ce que l'équipe du preneur pouvait encore **garantir** si tout le monde jouait parfaitement, en voyant les quatre mains. Il en sort :

- **faisable ou non** : le contrat était-il garanti dès la première carte ?
- **le tournant** : la première carte après laquelle ce n'est plus assez, qui l'a jouée, et la carte qui gardait le contrat faisable.

C'est un plafond, qui suppose de tout savoir : une indication, pas un reproche. Pour le capot, on compte les plis ; sinon les points de cartes, belote du camp preneur déduite. La générale, le sans-atout, le tout-atout et les donnes blitz ne s'analysent pas.

**Le solveur** est un minimax alpha-bêta : chaque camp joue au mieux, l'un pour maximiser ses points, l'autre pour les minimiser. Les cartes sont des bits (une main = un entier de 32 bits), une table de transposition retient les positions déjà vues au début de chaque pli, et deux cartes équivalentes (même couleur, mêmes points, rien entre elles) ne sont essayées qu'une fois. Les règles de fourniture y sont réécrites sur des bits ; un test vérifie qu'elles donnent exactement les mêmes coups que le moteur.

## L'analyse carte par carte — comme aux échecs (`src/game/analyseJoueur.ts`)

Juger à cartes ouvertes serait injuste : une carte excellente vu ce qu'on savait peut être mauvaise une fois tout dévoilé. Pour chaque carte jouée, on se met donc **à la place du joueur** :

1. on tire au hasard 40 répartitions des cartes cachées **compatibles avec ce qu'il savait** : sa main, les cartes tombées, et les couleurs où chacun a montré qu'il n'avait plus rien (ne pas fournir, ne pas couper, ne pas monter) ;
2. pour chaque carte qu'il pouvait jouer, on résout chaque répartition avec le solveur ;
3. on compare sa carte à la meilleure, sur le critère qui décide du score : **les chances que le contrat passe** (pour le preneur, qu'il passe ; pour la défense, qu'il chute), puis les points de cartes pour départager.

Chaque carte reçoit une qualité, selon les chances perdues par rapport à la meilleure :

| Qualité | Symbole | Chances perdues |
|---|---|---|
| Meilleure | ! | aucune (ou la meilleure elle-même) |
| Bonne | ✓ | moins de 5 points |
| Imprécision | ?! | de 5 à 12 points, ou 10 points de cartes perdus sans enjeu pour le contrat |
| Erreur | ? | de 12 à 30 points |
| Gaffe | ?? | 30 points ou plus |
| Forcée | — | une seule carte possible : non jugée |

Un tirage est déterministe (graine fixe) : la même donne donne toujours la même analyse.

**À l'écran** :

- dans la revue d'une donne (`AnalyseCartes.vue`) : un bilan par joueur, la courbe des chances du contrat au fil des cartes, puis le détail pli par pli, avec pour chaque carte la meilleure option ;
- dans l'onglet Donnes des statistiques, « Analyser les N donnes » (`AnalysePartie.vue`) : toutes les donnes de la partie, puis pour chaque joueur le nombre de cartes de chaque qualité et sa **justesse** (part de cartes meilleures ou bonnes), et les cinq plus gros tournants de la partie.

**Le calcul** est réparti entre plusieurs fils (Web Workers, `useAnalyseCartes`) : un par cœur du processeur moins un, au plus six. Une partie de dix donnes prend une à deux minutes.

Le bot ★ utilise exactement la même méthode pour choisir ses cartes pendant la partie (voir `docs/BOTS.md`).
