/**
 * Le bot branché sur une vraie partie.
 *
 * Il tient un siège avec **sa propre session anonyme** : les règles Firestore lui
 * interdisent donc de lire la main des autres, exactement comme à un humain. Rien
 * ici ne contourne `partie.ts` — le bot passe par les mêmes fonctions que l'écran,
 * donc il subit les mêmes validations et écrit les mêmes événements.
 */
import type { Card } from '../game/cards'
import type { GameEvent } from '../game/events'
import type { PlayerId } from '../game/players'
import { partnerOf, teamOfPlayer } from '../game/players'
import { type BiddingEntry, currentBidder, highestBid, rankOf } from '../game/bidding'
import { beloteAnnonces, biddingFromEvents, currentDeal, playFromEvents } from '../game/replay'
import { canDeclareBelote, currentPlayer, playableFor } from '../game/play'
import { type BotLevel, chooseBid, chooseCard } from '../game/bot'
import { PLI_VISIBLE_MS } from '../game/display'
import { type Client, makeClient } from './app'
import {
  type GameDoc, allSeatsTaken, deal, moveCount, placeBid, playCard, remplacerParBot, reprendreSiegeBot, signIn, tableDe,
  takeSeat, watchEvents, watchGame, watchHand,
} from './partie'

/** Un temps de réflexion par défaut, pour que la table reste lisible par des humains. */
export const REFLEXION_MS = 550

export interface BotHandle {
  player: PlayerId
  level: BotLevel
  stop: () => void
}

/**
 * Une source de données **publiques** : le document de partie et le journal.
 *
 * Les bots ne rouvrent pas leurs propres écoutes dessus. Ce n'est pas une question
 * de secret — ces deux flux sont lisibles par tous les joueurs — mais de plomberie :
 * le navigateur plafonne le nombre de connexions par origine, et trois bots qui
 * ouvrent chacun trois écoutes affament les autres. Mesuré : le bot donneur mettait
 * 54 secondes à lancer la partie.
 *
 * La main, elle, reste l'écoute propre du bot : elle n'est lisible que par lui.
 */
export type PublicFeed = (cb: (game: GameDoc | null, events: GameEvent[]) => void) => () => void

export interface BotOptions {
  level?: BotLevel
  /** Temps de réflexion avant chaque action. Abaissé par les tests. */
  delayMs?: number
  /** Fourni par l'onglet hôte, qui écoute déjà ces flux. */
  feed?: PublicFeed
  /**
   * Le client Firebase des bots, partagé par tous les bots de cet onglet.
   *
   * Un seul suffit : il tient les sièges des bots, donc les règles l'autorisent à
   * lire leurs mains — et **pas** celle de l'humain. Ouvrir une application
   * Firebase par bot multipliait les connexions et laissait des écritures en
   * suspens : distribution à 57 secondes, lectures servies depuis un cache vide,
   * changement de phase jamais écrit.
   */
  client?: Client
  /**
   * Prévenu quand une action échoue. Un refus concurrent est normal et sera
   * rejoué ; le reste doit se voir, d'où le journal par défaut plutôt qu'un
   * `catch` muet.
   */
  onError?: (quoi: string, erreur: unknown) => void
  /**
   * Feu vert pour distribuer la donne suivante. Sans lui, un bot donneur relançait
   * la donne en moins d'une seconde et personne n'avait le temps de lire le décompte.
   * L'onglet hôte ne le donne que lorsqu'un humain a cliqué pour continuer.
   */
  mayDealNext?: (dealNumber: number) => boolean
  /**
   * Reprendre un bot dont l'onglet a disparu, plutôt que d'en asseoir un nouveau :
   * l'uid qui tenait son siège, que la reprise remplace.
   */
  reprendDe?: string
  /** Avec `reprendDe` : le siège est celui d'un joueur humain qui ne répond plus. */
  remplaceHumain?: boolean
  /** Prévenu quand un autre onglet a repris ce bot : celui-ci s'est arrêté. */
  onDetache?: () => void
}

export async function startBot(
  code: string,
  player: PlayerId,
  options: BotOptions = {},
): Promise<BotHandle> {
  const {
    level = 'simple', delayMs = REFLEXION_MS, feed, client, onError = defaultOnError, mayDealNext,
    reprendDe, onDetache, remplaceHumain,
  } = options
  /** La pause après un pli suit le rythme du bot : les tests accélérés ne l'attendent pas. */
  const pausePli = Math.round((PLI_VISIBLE_MS * delayMs) / REFLEXION_MS)
  const c: Client = client ?? (await makeClient(`bot-${code}-${Date.now()}`))
  const monUid = await signIn(c)
  if (reprendDe && remplaceHumain) await remplacerParBot(code, player, reprendDe, level, c)
  else if (reprendDe) await reprendreSiegeBot(code, player, reprendDe, c)
  else await takeSeat(code, player, c, true, level)

  let game: GameDoc | null = null
  let events: GameEvent[] = []
  let hand: Card[] = []
  let occupe = false
  /**
   * L'état exact sur lequel le bot a déjà agi, pour ne pas jouer deux fois pendant
   * que son écriture se propage.
   *
   * C'est une **empreinte prise avant d'agir**, jamais après : enregistrer le
   * compteur une fois l'action terminée revenait à s'attribuer les décisions que
   * les autres avaient écrites entre-temps, et le bot refusait ensuite d'y répondre.
   */
  let dernierActe = ''
  /** La dernière donne que ce bot a distribuée, pour ne pas distribuer deux fois. */
  let derniereDonne = -1
  let trace = ''
  /** Quand le bot a vu que c'était à lui : son temps de réflexion part de là. */
  let vuA = Date.now()
  let vivant = true

  type Action = 'distribuer' | 'parler' | 'poser'

  /** Ce que le bot a à faire, et l'empreinte de l'état correspondant. */
  function aFaire(g: GameDoc): { quoi: Action; cle: string } | null {
    const cle = `${g.phase}|${g.dealNumber}|${moveCount(events)}`
    if (cle === dernierActe || g.phase === 'terminee' || g.phase === 'annulee') return null
    // En pause, on attend ; à la reprise, la réflexion repart de zéro.
    if (g.pause) { trace = ''; return null }

    if (g.phase === 'lobby' || g.phase === 'decompte') {
      // Un bot donneur attend toujours le feu vert d'un humain de son onglet, y compris
      // pour la première donne : partie seule, elle sautait le salon, et avec lui le
      // choix des équipes. Après une donne jouée — ou blanche, qui ramène la partie en
      // « lobby » — c'est le temps de lire ce qui s'est passé.
      const feuVert = !mayDealNext || mayDealNext(g.dealNumber)
      return g.dealer === player && allSeatsTaken(g) && g.dealNumber !== derniereDonne && feuVert
        ? { quoi: 'distribuer', cle }
        : null
    }
    if (g.phase === 'encheres') {
      return currentBidder(biddingFromEvents(events, g.dealer, tableDe(g))) === player
        ? { quoi: 'parler', cle }
        : null
    }
    if (g.phase === 'jeu') {
      const etat = playFromEvents(events, g.dealer, tableDe(g))
      return etat && currentPlayer(etat) === player ? { quoi: 'poser', cle } : null
    }
    return null
  }

  async function agir(): Promise<void> {
    if (!vivant || occupe || !game) return
    // Repris par un autre onglet (celui-ci, ralenti en arrière-plan, passait pour
    // disparu) : on s'efface, sinon deux onglets joueraient pour le même bot.
    const siege = game.seats[player]
    if (siege && siege.uid !== monUid) {
      arreter()
      onDetache?.()
      return
    }
    const decision = aFaire(game)
    if (!decision) return
    const { quoi, cle } = decision
    if (cle !== trace) { trace = cle; vuA = Date.now(); console.warn('[p]', player, quoi, cle) }

    occupe = true
    try {
      // Entamer juste après un pli : on laisse d'abord le pli complet sur le tapis.
      const etat = quoi === 'poser' ? playFromEvents(events, game!.dealer, tableDe(game!)) : null
      const entame = etat !== null && etat.current.length === 0 && etat.completed.length > 0
      // Le pli reste affiché `pausePli` : on entame juste après, sans y ajouter la réflexion.
      await attendre(entame ? Math.max(delayMs, pausePli + Math.round(delayMs / 4)) : delayMs)
      const apres = aFaire(game!)?.cle
      if (!vivant || !game || apres !== cle) {
        console.warn('[p]', player, 'abandon', quoi, cle, '->', apres)
        return
      }
      console.warn('[p]', player, 'exécute', quoi, cle)

      let agi: boolean
      if (quoi === 'distribuer') {
        const numero = game.dealNumber
        await deal(code, null, c)
        // On note le succès, jamais l'intention : sinon un échec verrouillerait
        // définitivement cette donne et le bot ne distribuerait plus jamais.
        derniereDonne = numero
        agi = true
      } else {
        // Une main vide alors que c'est notre tour n'est pas une situation de jeu :
        // c'est que l'écoute n'a pas encore livré. On le dit, et le battement
        // suivant réessaiera plutôt que de laisser le bot muet.
        if (hand.length === 0) throw new Error(`main vide pour ${player}`)
        agi = quoi === 'parler'
          ? await parler(code, player, game, events, hand, c, Date.now() - vuA)
          : await poser(code, player, game, events, hand, level, c, Date.now() - vuA)
      }
      // On ne marque un état comme traité **que si on a réellement joué**. Le tour
      // peut avoir bougé pendant la lecture de la main : marquer quand même
      // verrouillait le bot sur un état qu'il n'avait pas joué, et la table gelait.
      if (agi) dernierActe = cle
    } catch (e) {
      // Refus concurrent ou coup devenu illégal : le prochain instantané rejouera.
      onError(quoi, e)
    } finally {
      occupe = false
    }
  }

  const arrets = [
    /**
     * La main du bot, et elle seule — les règles Firestore interdisent aux autres
     * sièges de la lire. Une **écoute**, pas une lecture ponctuelle : sans écoute
     * ouverte, le client du bot n'a aucune connexion établie et `getDoc` se
     * contentait d'un cache vide, renvoyant une main inexistante sans erreur.
     * L'écoute maintient la connexion et garantit des données du serveur.
     */
    watchHand(code, player, (h) => { hand = h }, c),
    ...(feed
      ? [feed((g, e) => { game = g; events = e })]
      : [
          watchGame(code, (g) => { game = g }, c),
          watchEvents(code, (e) => { events = e }, c),
        ]),
  ]

  /**
   * Le bot réévalue au battement, pas sur l'arrivée d'un message.
   *
   * Piloter uniquement par instantané paraît plus élégant, mais chaque réveil
   * manqué fige la table : un message arrivé pendant qu'on écrit est perdu, et
   * plus rien ne relance le joueur à qui revient la main. Deux blocages distincts
   * sont venus de là. Ici la réévaluation ne coûte rien — elle lit un état déjà en
   * mémoire, sans aucune requête — donc autant la rendre inconditionnelle.
   */
  const battement = setInterval(() => void agir(), Math.max(120, Math.round(delayMs / 3)))

  function arreter(): void {
    if (!vivant) return
    vivant = false
    clearInterval(battement)
    for (const a of arrets) a()
  }

  return { player, level, stop: arreter }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms))

const defaultOnError = (quoi: string, erreur: unknown): void => {
  console.warn(`[bot] ${quoi} a échoué :`, erreur)
}

/** L'enchère. Rend `false` si le tour a bougé entre-temps : rien n'a été écrit. */
async function parler(
  code: string,
  player: PlayerId,
  game: GameDoc,
  events: GameEvent[],
  hand: Card[],
  c: Client,
  thinkMs?: number,
): Promise<boolean> {
  const etat = biddingFromEvents(events, game.dealer, tableDe(game))
  if (currentBidder(etat) !== player) return false

  const meilleure = highestBid(etat)
  const plancher = meilleure ? rankOf(meilleure) : 0
  const partenaireTient = meilleure?.player === partnerOf(player, tableDe(game))
  // Dernier à parler après trois passes : on se lance plutôt que de redistribuer.
  const dernierAParler = etat.entries.length === 3 && meilleure === null

  // CO-5 — coinché, le preneur ne peut plus surenchérir : il laisse jouer.
  const coinche = etat.entries.some((e) => e.kind === 'coinche')
  const choix = coinche ? null : chooseBid(hand, plancher, partenaireTient, dernierAParler)
  const entry: BiddingEntry = choix
    ? { kind: 'contrat', player, value: choix.value, suit: choix.trump }
    : { kind: 'passe', player }

  await placeBid(code, entry, c, thinkMs)
  return true
}

/** La carte. Rend `false` si le tour a bougé entre-temps : rien n'a été écrit. */
async function poser(
  code: string,
  player: PlayerId,
  game: GameDoc,
  events: GameEvent[],
  hand: Card[],
  level: BotLevel,
  c: Client,
  thinkMs?: number,
): Promise<boolean> {
  const etat = playFromEvents(events, game.dealer, tableDe(game))
  if (!etat || currentPlayer(etat) !== player) return false

  const jouables = playableFor(etat, player, hand)
  if (jouables.length === 0) return false

  // Le contrat de la donne en cours : `find` sur tout le journal renvoyait celui de la
  // première donne, et le bot jouait ensuite avec un faux preneur.
  const contrat = [...currentDeal(events)].reverse().find((e) => e.type === 'contrat_fixe')
  const preneur = contrat && contrat.type === 'contrat_fixe' ? contrat.taker : player

  const carte = chooseCard(
    {
      me: player,
      seating: tableDe(game),
      hand,
      trump: etat.trump,
      taker: preneur,
      current: etat.current,
      completed: etat.completed,
    },
    jouables,
    level,
  )

  // BEL-2 — un bot n'oublie jamais sa belote.
  const annonce = canDeclareBelote(etat, player, carte, hand, etat.trump, (beloteAnnonces(events).get(player) ?? 0) > 0)
  await playCard(code, player, carte, annonce, c, thinkMs)
  return true
}

/** Vrai si ce siège est tenu par un bot. */
export const isBotSeat = (game: GameDoc, player: PlayerId): boolean =>
  Boolean(game.seats[player]?.bot)

/** Les sièges tenus par des bots, pour marquer l'archive. */
export const botSeats = (game: GameDoc): PlayerId[] =>
  (Object.keys(game.seats) as PlayerId[]).filter((p) => game.seats[p]?.bot)

export { teamOfPlayer }
