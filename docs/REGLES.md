# Règles de la coinche

Nos règles maison, tranchées le 23 septembre 2026. Chaque règle porte un identifiant (`ENC-5`, `JEU-2`…) que le code cite en commentaire.

État : ✅ appliqué par le code.

Les réglages vivent dans `src/game/rules.ts` ; le reste est codé dans `src/game/` : `cards.ts` (ordre et valeurs), `bidding.ts` (enchères, coinche), `trick.ts` et `play.ts` (jeu de la carte, belote), `scoring.ts` (décompte). L'objectif et le blitz sont des options du salon (`src/firebase/game.ts`).

---

## 1. Matériel et distribution

| Id | Règle | État |
|----|-------|------|
| MAT-1 | Jeu de 32 cartes (7 à As), 4 joueurs, 2 équipes de 2, partenaires face à face | ✅ |
| MAT-2 | Le jeu tourne dans le sens des aiguilles d'une montre | ✅ |
| MAT-3 | Le donneur tourne d'un joueur vers la gauche à chaque donne | ✅ |
| DIS-1 | Distribution en 3-2-3 | ✅ |
| DIS-2 | **On ne rebat pas** : on ramasse les plis dans l'ordre où ils ont été gagnés, et on coupe. Après une donne blanche ou une donne blitz, personne ne connaît les mains : on rebat | ✅ |
| DIS-3 | Si les 4 passent : **le même donneur redonne**. Une donne blanche ne compte pas (son numéro est quand même consommé) | ✅ |

## 2. Ordre et valeur des cartes

| Id | Règle | État |
|----|-------|------|
| ORD-1 | **À l'atout** : Valet (20) > 9 (14) > As (11) > 10 (10) > Roi (4) > Dame (3) > 8 (0) > 7 (0) | ✅ |
| ORD-2 | **Hors atout** : As (11) > 10 (10) > Roi (4) > Dame (3) > Valet (2) > 9 (0) > 8 (0) > 7 (0) | ✅ |
| ORD-3 | Total d'une donne : **152 aux cartes + 10 de der = 162** (à la couleur et au tout-atout) | ✅ |
| ORD-4 | Le « 10 de der » va à l'équipe qui remporte le dernier pli | ✅ |
| ORD-5 | **Tout-atout** : chaque couleur suit l'ordre de l'atout (V, 9, A, 10, R, D, 8, 7) ; aucune couleur n'en coupe une autre, et on doit monter dans la couleur demandée. Valeurs : V 14, 9 9, As 6, 10 5, R 3, D 1, 8 et 7 0 — soit 38 par couleur, 152 au total | ✅ |
| ORD-6 | **Sans-atout** : les quatre couleurs suivent l'ordre et les valeurs hors atout ; rien ne coupe. Le paquet vaut alors 120 (+ 10 de der), sans importance puisque le sans-atout ne se joue qu'en capot ou en générale, où l'on compte les plis | ✅ |

## 3. Enchères

| Id | Règle | État |
|----|-------|------|
| ENC-1 | Le joueur à gauche du donneur parle en premier | ✅ |
| ENC-2 | Une enchère = un contrat (80 à 170) + une couleur d'atout | ✅ |
| ENC-3 | Paliers de 10 : 80, 90, 100 … 170. Le 170 est un « 150 belotté » : il ne se tient qu'avec la belote (DEC-3) | ✅ |
| ENC-4 | Toute enchère doit être strictement supérieure à la précédente. La générale domine le capot : au-dessus d'un capot, plus de contrat chiffré ; au-dessus d'une générale, plus rien | ✅ |
| ENC-5 | **Un joueur qui a passé peut reparler** à un tour suivant. Passer n'engage que pour le tour en cours | ✅ |
| ENC-6 | Les enchères s'arrêtent après 3 passes consécutives suivant une enchère | ✅ |
| ENC-7 | 4 passes d'emblée → on redonne (cf. DIS-3) | ✅ |
| ENC-8 | **Capot** : annonce des 8 plis. Vaut **250** | ✅ |
| ENC-9 | **Générale** : tous les plis **sans son partenaire** — un pli ramassé par le partenaire la fait chuter. Vaut **250**. Le joueur qui annonce la générale **prend la main** et entame | ✅ |
| ENC-10 | **Sans-Atout et Tout-Atout n'existent qu'en capot et en générale.** Pas de contrat chiffré (80–170) à SA ou TA | ✅ |

## 4. Coinche et surcoinche

| Id | Règle | État |
|----|-------|------|
| CO-1 | Un adversaire du preneur peut **coincher** : ×2. Aussi sur un capot ou une générale | ✅ |
| CO-2 | Le camp du preneur (preneur ou partenaire) peut **surcoincher** : ×4 | ✅ |
| CO-3 | **Coinche à la volée** : on peut coincher sans attendre son tour de parole — ou attendre son tour, au choix. Plus possible une fois le contrat fixé | ✅ |
| CO-4 | Le multiplicateur porte sur **la valeur de l'enchère** (conséquence directe de DEC-1) | ✅ |
| CO-5 | **Une coinche ferme les enchères** : plus personne ne surenchérit. La parole revient au preneur : s'il passe, on joue ; la surcoinche, elle, clôt aussitôt | ✅ |

## 5. Jeu de la carte

| Id | Règle | État |
|----|-------|------|
| JEU-1 | Le joueur à gauche du donneur entame — sauf générale, cf. ENC-9 | ✅ |
| JEU-2 | Obligation de fournir la couleur demandée | ✅ |
| JEU-3 | À défaut : obligation de couper si l'adversaire est maître | ✅ |
| JEU-4 | Obligation de monter à l'atout si un adversaire a déjà coupé | ✅ |
| JEU-5 | Si le partenaire est maître : **« pisser » autorisé** — on se défausse librement, aucune obligation de couper | ✅ |
| JEU-6 | **Atout entamé** : tout le monde monte s'il le peut, **même sur son partenaire**. Au tout-atout, cela vaut pour toute couleur entamée | ✅ |
| JEU-8 | **Sous-coupe obligatoire** : si un adversaire a coupé et qu'on ne peut pas monter, on doit quand même jouer atout | ✅ |
| JEU-7 | Le pli revient au plus fort atout, sinon à la plus forte carte de la couleur demandée | ✅ |
| JEU-9 | La dernière carte d'une donne est jouée d'office (belote comprise) | ✅ |

## 6. Belote-Rebelote

| Id | Règle | État |
|----|-------|------|
| BEL-1 | Roi + Dame d'atout dans la même main = **20 points**. Pas de belote au sans-atout ni au tout-atout | ✅ |
| BEL-2 | **La belote doit être annoncée** au moment de poser le Roi ou la Dame d'atout, avec le bouton « Belote ». **Oubliée, elle est perdue** | ✅ |
| BEL-6 | **Il faut annoncer aux deux cartes**, dans n'importe quel ordre : la première tête posée dit « belote », la seconde « rebelote ». Une seule annonce ne suffit pas, la belote est alors perdue | ✅ |
| BEL-3 | **La belote ne compte pas pour la défense** | ✅ |
| BEL-5 | Les 20 points de belote **ne sont jamais marqués** : ils servent uniquement à atteindre le contrat et à départager les deux camps. Tous les scores restent des multiples de 10 | ✅ |
| BEL-4 | **La belote entre dans la comparaison** avec la défense : voir DEC-3 | ✅ |

## 7. Déclarations (tierce, cinquante, cent, carré)

| Id | Règle | État |
|----|-------|------|
| DCL-1 | **Désactivées.** On n'y joue pas | ✅ |

> **Lexique.** Chez nous, « annonce » = **enchère** (« 80 cœur »). Les séquences et carrés sont appelés « déclarations » et ne sont pas joués.

## 8. Décompte — on ne compte que les enchères

| Id | Règle | État |
|----|-------|------|
| DEC-1 | **Contrat réussi** : le preneur marque **la valeur de son enchère**. La défense marque **0** | ✅ |
| DEC-2 | **Contrat chuté** : la **défense** marque la valeur de l'enchère. Le preneur marque **0** | ✅ |
| DEC-3 | **Condition de réussite** : le preneur doit atteindre son contrat **et** totaliser **plus de points que la défense**, belote comprise. Exemple : contrat à 90 avec belote → 72 points de cartes suffisent (72 + 20 = 92 contre 90) | ✅ |
| DEC-4 | Coinche : la valeur de l'enchère est doublée (×2), quadruplée si surcoinche (×4) | ✅ |
| DEC-5 | **Capot** : 250. **Générale** : 250 | ✅ |
| DEC-6 | Les points de cartes réellement faits ne sont **jamais** marqués — ils ne servent qu'à déterminer si le contrat passe | ✅ |
| DEC-8 | **Capot réalisé sans l'avoir annoncé** (même coinché) : le score ne change pas, mais le preneur récolte **une étoile de la honte** | ✅ |
| DEC-9 | **Trois étoiles dans la même partie** : la honte complète. Enregistrée dans l'historique | ✅ |
| DEC-7 | **Égalité 81 – 81 : le preneur chute.** Être à égalité ne suffit pas, il faut être devant | ✅ |

## 9. Fin de partie

| Id | Règle | État |
|----|-------|------|
| FIN-1 | La partie s'arrête dès qu'une équipe **dépasse l'objectif** — 1000 par défaut (il faut donc 1010), ou 500, 1500, 2000 choisis au salon. Le nombre de donnes varie | ✅ |
| FIN-2 | ~~Deux équipes dépassant l'objectif sur la même donne~~ — **impossible** : une seule équipe marque par donne | ✅ sans objet |
| FIN-3 | ~~Égalité parfaite en fin de partie~~ — **impossible**, pour la même raison | ✅ sans objet |
| FIN-4 | **Blitz** (option du salon) : une donne non coinchée n'est pas jouée ; le contrat est réputé réussi, le preneur marque sa valeur (250 en capot ou générale). Une donne coinchée ou surcoinchée se joue. La belote n'est pas marquée (BEL-5) et il n'y a pas d'étoile de la honte | ✅ |

---

## Autour de la table

Ce ne sont pas des règles du jeu, mais l'app les applique :

- **Pause** : n'importe quel joueur peut mettre la partie en pause pendant les enchères ou le jeu ; l'attente ne compte dans le temps de réflexion de personne.
- **Annuler la partie** : n'importe quel joueur peut l'arrêter pour tous ; elle n'est alors pas archivée.
- **Joueur absent** : au bout d'une minute sans réponse, les autres peuvent le remplacer par un bot ; il peut reprendre sa place ensuite. La partie compte alors « avec bot ».
- **Rejouer** : mêmes équipes, même objectif, même blitz ; le donneur suivant distribue. Les parties enchaînées forment une soirée.
