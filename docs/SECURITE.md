# Sécurité

L'app n'a **pas de serveur** : le site est statique (GitHub Pages) et parle directement à Firestore. Les règles Firestore (`firestore.rules`) sont donc la seule barrière entre un joueur et les données. Elles sont déployées par la CI à chaque merge dans `main`, et testées sur l'émulateur (`tests/firestore-rules.test.ts`, `npm run test:rules`).

Chaque joueur se connecte avec un **compte anonyme** Firebase, créé à la première visite et gardé par le navigateur. Ce compte n'est qu'un jeton : l'identité de joueur (`romain`, `viv`…) se choisit dans l'app, et un siège associe le temps d'une partie un joueur à un compte.

## Ce que les règles garantissent

- **Personne ne lit la main d'un autre.** Une main (`games/{code}/hands/{player}`) n'est lisible que par le compte assis à ce siège. Les quatre mains de chaque donne (`deals/{n}`) restent scellées jusqu'à la fin de la partie.
- **Personne ne s'ajoute de cartes.** Un joueur ne peut que retirer une carte de sa main, celle qu'il pose. Seul le donneur écrit les mains, et seulement dans l'écriture qui ouvre une nouvelle donne.
- **Personne n'usurpe un siège.** Un inconnu ne peut que prendre un siège libre. En cours de partie, seul un joueur assis peut reprendre un bot muet ou remplacer par un bot un joueur absent, et seul le joueur remplacé (le même compte, donc le même appareil) peut reprendre sa place.
- **Personne n'écrit au nom d'un autre.** Un événement du journal qui nomme un joueur doit venir du compte assis à ce siège, et prendre le numéro que la partie vient d'allouer.
- **La partie ne se réécrit pas librement.** Un joueur assis ne peut changer que ce qu'une action de jeu change : le numéro du journal, la phase, le donneur, la pause, et des scores qui ne font que monter, d'au plus une donne à la fois. Le placement et les options ne changent qu'au salon, avant la première donne. Une partie ne se termine que sur un objectif dépassé.
- **Rien ne se détruit.** Aucune partie, aucun événement, aucune archive, aucun joueur ne peut être supprimé ni réécrit. Une partie existante n'est jamais écrasée par une nouvelle. L'archive ne s'écrit qu'une fois, par un joueur de la partie, une fois celle-ci terminée.
- **Les joueurs ajoutés** ne se créent qu'une fois (nom unique), jamais modifiés ; le préfixe `bot` est réservé.

## Les limites connues

Sans serveur pour rejouer chaque coup, certaines choses restent possibles à quelqu'un qui ouvre la console de son navigateur :

- **un joueur assis peut fausser la partie en cours** : poser une carte qui n'était pas permise, écrire un faux décompte, ou gonfler les scores pour finir la partie et desceller la donne en cours. Les règles bornent ce qu'il peut faire (scores qui montent d'au plus une donne, fin sur objectif dépassé), pas plus ;
- **l'hôte des bots peut lire leurs mains** : les bots tournent dans son onglet, avec sa session. Les bots eux-mêmes ne trichent pas (voir `docs/BOTS.md`) ;
- **le donneur connaît la donne** au moment où il distribue : c'est son navigateur qui mélange et écrit les quatre mains ;
- **remplacer un absent** donne au joueur qui le fait (et qui héberge alors le bot) l'accès à la main du remplacé.

Aucune de ces limites ne permet à un inconnu d'entrer dans une partie, ni de toucher aux parties des autres. Les lever demanderait une Cloud Function qui distribue et valide chaque coup : un serveur, et un projet Firebase payant.

## Les clés

Les clés Firebase du site (`VITE_FIREBASE_*`) sont publiques par nature : elles finissent dans le code publié. Le compte de service qui déploie les règles, lui, est secret : il ne vit que dans les secrets GitHub (`FIREBASE_SERVICE_ACCOUNT`), n'est écrit sur le disque de la CI que le temps de la commande, et `service-account.json` est dans `.gitignore`. Voir `docs/FIREBASE.md`.
