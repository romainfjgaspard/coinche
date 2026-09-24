# Règles de la coinche — spec à valider

> ✅ = validé · **24 règles, toutes tranchées le 23 septembre 2026**
> Le flag entre parenthèses est le nom du réglage dans `src/game/rules.ts`.
>
> Ce fichier et la copie du dépôt (`~/projects/coinche/docs/REGLES.md`) sont désormais
> identiques.

---

## 1. Matériel et distribution

| Id | Règle | État |
|----|-------|------|
| MAT-1 | Jeu de 32 cartes (7 à As), 4 joueurs, 2 équipes de 2, partenaires face à face | ✅ |
| MAT-2 | Le jeu tourne dans le sens des aiguilles d'une montre | ✅ |
| MAT-3 | Le donneur tourne d'un joueur vers la gauche à chaque donne | ✅ |
| DIS-1 | Distribution en 3-2-3 | ✅ |
| DIS-2 | **On ne rebat pas** : on ramasse les plis dans l'ordre où ils ont été gagnés, et on coupe | ✅ |
| DIS-3 | Si les 4 passent : **le même donneur redonne**. Une donne blanche ne compte pas | ✅ |

## 2. Ordre et valeur des cartes

| Id | Règle | État |
|----|-------|------|
| ORD-1 | **À l'atout** : Valet (20) > 9 (14) > As (11) > 10 (10) > Roi (4) > Dame (3) > 8 (0) > 7 (0) | ✅ |
| ORD-2 | **Hors atout** : As (11) > 10 (10) > Roi (4) > Dame (3) > Valet (2) > 9 (0) > 8 (0) > 7 (0) | ✅ |
| ORD-3 | Total d'une donne : **152 aux cartes + 10 de der = 162** | ✅ |
| ORD-4 | Le « 10 de der » va à l'équipe qui remporte le dernier pli | ✅ |

## 3. Enchères

| Id | Règle | État |
|----|-------|------|
| ENC-1 | Le joueur à gauche du donneur parle en premier | ✅ |
| ENC-2 | Une enchère = un contrat (80 à 170) + une couleur d'atout | ✅ |
| ENC-3 | Paliers de 10 : 80, 90, 100 … 170. Le 170 est un « 150 belotté » : il ne se tient qu'avec la belote (DEC-3) | ✅ |
| ENC-4 | Toute enchère doit être strictement supérieure à la précédente | ✅ |
| ENC-5 | **Un joueur qui a passé peut reparler** à un tour suivant. Passer n'engage que pour le tour en cours | ✅ |
| ENC-6 | Les enchères s'arrêtent après 3 passes consécutives suivant une enchère | ✅ |
| ENC-7 | 4 passes d'emblée → on redonne (cf. DIS-3) | ✅ |
| ENC-8 | **Capot** : annonce des 8 plis. Vaut **250** | ✅ |
| ENC-9 | **Générale** : tous les plis **sans son partenaire**. Vaut **250**. Le joueur qui annonce la générale **prend la main** et entame | ✅ |
| ENC-10 | **Sans-Atout et Tout-Atout n'existent qu'en capot et en générale.** Pas de contrat chiffré (80–160) à SA ou TA | ✅ |

## 4. Coinche et surcoinche

| Id | Règle | État |
|----|-------|------|
| CO-1 | Un adversaire du preneur peut **coincher** : ×2 | ✅ |
| CO-2 | Le camp du preneur peut **surcoincher** : ×4 | ✅ |
| CO-3 | **Coinche à la volée** : on peut coincher sans attendre son tour de parole — ou attendre son tour, au choix | ✅ |
| CO-4 | Le multiplicateur porte sur **la valeur de l'enchère** (conséquence directe de DEC-1) | ✅ |
| CO-5 | **Une coinche ferme les enchères** : plus personne ne surenchérit. Seule la surcoinche peut suivre, et elle double encore | ✅ |

## 5. Jeu de la carte

| Id | Règle | État |
|----|-------|------|
| JEU-1 | Le joueur à gauche du donneur entame — sauf générale, cf. ENC-9 | ✅ |
| JEU-2 | Obligation de fournir la couleur demandée | ✅ |
| JEU-3 | À défaut : obligation de couper si l'adversaire est maître | ✅ |
| JEU-4 | Obligation de monter à l'atout si un adversaire a déjà coupé | ✅ |
| JEU-5 | Si le partenaire est maître : **« pisser » autorisé** — on se défausse librement, aucune obligation de couper | ✅ |
| JEU-8 | **Sous-coupe obligatoire** : si un adversaire a coupé et qu'on ne peut pas monter, on doit quand même jouer atout | ✅ |
| JEU-7 | Le pli revient au plus fort atout, sinon à la plus forte carte de la couleur demandée | ✅ |

## 6. Belote-Rebelote

| Id | Règle | État |
|----|-------|------|
| BEL-1 | Roi + Dame d'atout dans la même main = **20 points** | ✅ |
| BEL-2 | **La belote doit être annoncée** au moment de poser le Roi ou la Dame d'atout, en cliquant sur une icône. **Oubliée, elle est perdue** | ✅ |
| BEL-6 | **Il faut annoncer aux deux cartes** : en posant le Roi, puis en posant la Dame. Une seule annonce ne suffit pas, la belote est alors perdue | ✅ |
| BEL-3 | **La belote ne compte pas pour la défense** | ✅ |
| BEL-5 | Les 20 points de belote **ne sont jamais marqués** : ils servent uniquement à atteindre le contrat et à départager les deux camps. Tous les scores restent des multiples de 10 | ✅ |
| BEL-4 | **La belote entre dans la comparaison** avec la défense : voir DEC-3 | ✅ |

## 7. Déclarations (tierce, cinquante, cent, carré)

| Id | Règle | État |
|----|-------|------|
| DCL-1 | **Désactivées.** On n'y joue pas | ✅ |

> **Lexique.** Chez nous, « annonce » = **enchère** (« 80 cœur »). Les séquences et
> carrés sont appelés « déclarations » et ne sont pas joués.

## 8. Décompte — on ne compte que les enchères

| Id | Règle | État |
|----|-------|------|
| DEC-1 | **Contrat réussi** : le preneur marque **la valeur de son enchère**. La défense marque **0** | ✅ |
| DEC-2 | **Contrat chuté** : la **défense** marque la valeur de l'enchère. Le preneur marque **0** | ✅ |
| DEC-3 | **Condition de réussite** : le preneur doit atteindre son contrat **et** totaliser **plus de points que la défense**, belote comprise. Exemple : contrat à 90 avec belote → 72 points de cartes suffisent (72 + 20 = 92 contre 90) | ✅ |
| DEC-4 | Coinche : la valeur de l'enchère est doublée (×2), quadruplée si surcoinche (×4) | ✅ |
| DEC-5 | **Capot** : 250. **Générale** : 250 | ✅ |
| DEC-6 | Les points de cartes réellement faits ne sont **jamais** marqués — ils ne servent qu'à déterminer si le contrat passe | ✅ |
| DEC-8 | **Capot réalisé sans l'avoir annoncé** : le score ne change pas (on ne compte que les enchères), mais le preneur récolte **une étoile de la honte** | ✅ |
| DEC-9 | **Trois étoiles dans la même partie** : la honte complète. Enregistrée dans l'historique | ✅ |
| DEC-7 | **Égalité 81 – 81 : le preneur chute.** Être à égalité ne suffit pas, il faut être devant | ✅ |

## 9. Fin de partie

| Id | Règle | État |
|----|-------|------|
| FIN-1 | La partie s'arrête dès qu'une équipe **dépasse 1000** — il faut donc 1010 au minimum. Le nombre de donnes varie | ✅ |
| FIN-2 | ~~Deux équipes dépassant l'objectif sur la même donne~~ — **impossible** : une seule équipe marque par donne | ✅ sans objet |
| FIN-3 | ~~Égalité parfaite en fin de partie~~ — **impossible**, pour la même raison | ✅ sans objet |

---

## Reste à trancher

**Rien.** Les 24 règles sont tranchées et reportées dans `src/game/rules.ts`,
`src/game/scoring.ts` et `src/game/trick.ts` (25 tests au vert).
