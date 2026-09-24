/**
 * État de la session : qui je suis, dans quelle partie, et ce que je vois.
 * Le `playerId` est mémorisé dans le navigateur pour qu'un rafraîchissement
 * ne fasse pas perdre son siège.
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { getDoc } from 'firebase/firestore'
import { type Card, sortHand } from '../game/cards'
import type { PlayerId } from '../game/players'
import {
  type GameDoc, allSeatsTaken, createGame, deal, gameRef, placeBid, playCard, readArchives,
  setSeating, signIn, takeSeat, watchEvents, watchGame, watchHand,
} from '../firebase/partie'
import type { Archive } from '../game/archive'
import type { GameEvent } from '../game/events'
import {
  type BiddingEntry, canCoinche, canSurcoinche, currentBidder, legalValues, outcome,
} from '../game/bidding'
import { type CompletedTrick, canDeclareBelote, currentPlayer, playableFor } from '../game/play'
import { PLI_VISIBLE_MS } from '../game/display'
import { biddingFromEvents, currentDeal, playFromEvents, starsInGame } from '../game/replay'
import { type DealSummary, type Tally, deals, momentum, runningScores, tallies } from '../game/stats'
import { DEFAULT_SEATING, type Seating, teamOfPlayer } from '../game/players'
import { type Impasse, impasseTallies, impassesOfGame } from '../game/impasses'
import type { BotLevel } from '../game/bot'
import { type BotHandle, type PublicFeed, startBot } from '../firebase/botRunner'
import { type Client, makeClient } from '../firebase/app'

const STORE_KEY = 'coinche.session'

interface Persisted {
  playerId: PlayerId | null
  code: string | null
}

function restore(): Persisted {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) return JSON.parse(raw) as Persisted
  } catch {
    // Navigation privée, stockage bloqué : on repart d'une session vierge.
  }
  return { playerId: null, code: null }
}

function persist(value: Persisted): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(value))
  } catch {
    // Sans mémoire locale on rejoue l'écran d'accueil : ce n'est pas bloquant.
  }
}

export const useSession = defineStore('session', () => {
  const saved = restore()

  const uid = ref<string | null>(null)
  const playerId = ref<PlayerId | null>(saved.playerId)
  const code = ref<string | null>(saved.code)
  const game = ref<GameDoc | null>(null)
  const hand = ref<Card[]>([])
  const events = ref<GameEvent[]>([])
  /** Parties terminées, pour l'onglet « toutes les parties ». */
  const archives = ref<Archive[]>([])
  const error = ref<string | null>(null)
  const busy = ref(false)

  let stopGame: (() => void) | null = null
  let stopHand: (() => void) | null = null
  let stopEvents: (() => void) | null = null

  const seated = computed(() => Boolean(playerId.value && game.value?.seats[playerId.value]))
  const ready = computed(() => Boolean(game.value && allSeatsTaken(game.value)))
  /** Qui est déjà assis : un joueur absent de la liste n'est pas là. */
  const takenBy = computed<Partial<Record<PlayerId, boolean>>>(() =>
    Object.fromEntries(Object.keys(game.value?.seats ?? {}).map((p) => [p, true])),
  )
  /** Les joueurs assis, dans l'ordre du placement quand la table est complète. */
  const present = computed<PlayerId[]>(() =>
    game.value?.seating ? [...game.value.seating] : Object.keys(game.value?.seats ?? {}),
  )

  function subscribe(gameCode: string): void {
    stopGame?.()
    stopHand?.()
    stopEvents?.()
    stopGame = watchGame(gameCode, (g) => (game.value = g))
    stopEvents = watchEvents(gameCode, (e) => (events.value = e))
    if (playerId.value) stopHand = watchHand(gameCode, playerId.value, (c) => (hand.value = c))
  }

  // --- État dérivé du journal : rien n'est stocké en double.

  const seating = computed<Seating>(() => game.value?.seating ?? DEFAULT_SEATING)

  const bidding = computed(() =>
    game.value ? biddingFromEvents(events.value, game.value.dealer, seating.value) : null,
  )
  const biddingResult = computed(() => (bidding.value ? outcome(bidding.value) : null))
  const toBid = computed(() => (bidding.value ? currentBidder(bidding.value) : null))
  const myBidTurn = computed(() => toBid.value !== null && toBid.value === playerId.value)
  const bidValues = computed(() => (bidding.value ? legalValues(bidding.value) : []))
  const mayCoinche = computed(
    () => Boolean(bidding.value && playerId.value && canCoinche(bidding.value, playerId.value)),
  )
  const maySurcoinche = computed(
    () => Boolean(bidding.value && playerId.value && canSurcoinche(bidding.value, playerId.value)),
  )

  const play = computed(() =>
    game.value ? playFromEvents(events.value, game.value.dealer, seating.value) : null,
  )
  const toPlay = computed(() => (play.value ? currentPlayer(play.value) : null))
  const myPlayTurn = computed(() => toPlay.value !== null && toPlay.value === playerId.value)
  const playable = computed(() =>
    play.value && playerId.value ? playableFor(play.value, playerId.value, hand.value) : [],
  )

  /** BEL-2 — l'icône d'annonce n'apparaît que sur le Roi et la Dame d'atout. */
  const beloteCards = computed(() => {
    if (!play.value || !playerId.value) return []
    return hand.value.filter((c) =>
      canDeclareBelote(play.value!, playerId.value!, c, hand.value, play.value!.trump),
    )
  })

  const lastTrick = computed(() => play.value?.completed.at(-1) ?? null)

  /** Ma main, triée pour l'affichage : atout en tête dès qu'il est connu. */
  const sortedHand = computed(() => sortHand(hand.value, play.value?.trump ?? null))

  /**
   * Le pli qui vient de se fermer, laissé sur le tapis `PLI_VISIBLE_MS` : sans cette
   * tenue, la quatrième carte disparaissait à l'instant même où elle était posée, et
   * personne ne voyait qui ramassait.
   */
  const heldTrick = ref<CompletedTrick | null>(null)
  let heldTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => play.value?.completed.length ?? 0,
    (n, avant) => {
      clearTimeout(heldTimer)
      if (n > avant && lastTrick.value) {
        heldTrick.value = lastTrick.value
        heldTimer = setTimeout(() => { heldTrick.value = null }, PLI_VISIBLE_MS)
      } else {
        heldTrick.value = null
      }
    },
  )

  /** Ce que le tapis montre : le pli en cours, sinon celui qu'on vient de ramasser. */
  const shownTrick = computed(() => {
    const current = play.value?.current ?? []
    if (current.length > 0) return { plays: current, winner: null as PlayerId | null }
    if (heldTrick.value) return { plays: heldTrick.value.plays, winner: heldTrick.value.winner }
    return { plays: [], winner: null as PlayerId | null }
  })
  const trickCounts = computed<[number, number]>(() => {
    const counts: [number, number] = [0, 0]
    for (const t of play.value?.completed ?? []) counts[teamOfPlayer(t.winner, seating.value)] += 1
    return counts
  })
  const stars = computed(() => starsInGame(events.value))

  // --- Statistiques : tout se déduit du journal, donc tout est déjà temps réel.
  const dealSummaries = computed<DealSummary[]>(() => deals(events.value))
  const scoreCurve = computed(() => runningScores(dealSummaries.value))
  const momentumBars = computed(() => momentum(dealSummaries.value))
  const playerTallies = computed<Map<PlayerId, Tally>>(
    () => tallies(dealSummaries.value, seating.value),
  )
  /** Les impasses se révèlent au fil des plis : définitives à la fin de chaque donne. */
  const impasses = computed<Impasse[]>(() =>
    game.value ? impassesOfGame(events.value, game.value.dealer, seating.value) : [],
  )
  const impasseCounts = computed(() => impasseTallies(impasses.value))
  const myTeam = computed(() =>
    playerId.value ? teamOfPlayer(playerId.value, seating.value) : 0,
  )

  /** DEC-9 — la honte complète vient d'être atteinte dans cette partie. */
  const shame = computed(() => {
    const e = [...events.value].reverse().find((x) => x.type === 'honte_complete')
    return e && e.type === 'honte_complete' ? e : null
  })

  /** DEC-8 — étoile décrochée sur la donne qui vient de finir. */
  const lastStar = computed(() => {
    const e = [...currentDeal(events.value)].reverse().find((x) => x.type === 'donne_terminee')
    return e && e.type === 'donne_terminee' ? e.etoile : null
  })

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    busy.value = true
    error.value = null
    try {
      return await fn()
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      busy.value = false
    }
  }

  /** Charge une partie sans y prendre place — sert à griser les sièges occupés. */
  async function peek(gameCode: string): Promise<void> {
    await signIn()
    const snap = await getDoc(gameRef(gameCode))
    game.value = snap.exists() ? (snap.data() as GameDoc) : null
    if (!snap.exists()) error.value = `Aucune partie au code ${gameCode}`
  }

  async function create(player: PlayerId): Promise<void> {
    await run(async () => {
      uid.value = await signIn()
      const newCode = await createGame(player)
      playerId.value = player
      code.value = newCode
      persist({ playerId: player, code: newCode })
      subscribe(newCode)
    })
  }

  async function join(gameCode: string, player: PlayerId): Promise<void> {
    await run(async () => {
      uid.value = await signIn()
      const snap = await getDoc(gameRef(gameCode))
      if (!snap.exists()) throw new Error(`Aucune partie au code ${gameCode}`)
      await takeSeat(gameCode, player)
      playerId.value = player
      code.value = gameCode
      persist({ playerId: player, code: gameCode })
      subscribe(gameCode)
    })
  }

  /** Les bots lancés depuis cet onglet : on les arrête en quittant. */
  const bots = ref<BotHandle[]>([])
  /** La donne dont un humain a lu le décompte : un bot donneur peut alors redistribuer. */
  const dealAcknowledged = ref<number | null>(null)
  /** Le donneur est un bot que cet onglet fait tourner : c'est à nous de lui dire de continuer. */
  const botDealerHere = computed(() =>
    Boolean(game.value && bots.value.some((b) => b.player === game.value!.dealer)),
  )

  function continueToNextDeal(): void {
    if (game.value) dealAcknowledged.value = game.value.dealNumber
  }
  /** Un seul client Firebase pour tous les bots de l'onglet, créé à la demande. */
  let botClient: Client | null = null

  /**
   * Installe un bot sur un siège libre.
   *
   * Il obtient sa **propre** session anonyme, donc les règles Firestore lui
   * interdisent de lire la main des autres — au même titre qu'un humain.
   */
  async function addBot(player: PlayerId, level: BotLevel = 'simple'): Promise<void> {
    if (!code.value) return
    await run(async () => {
      // `?botDelay=` permet aux tests d'accélérer la table sans toucher au jeu.
      const delayMs = Number(new URLSearchParams(location.search).get('botDelay')) || undefined
      // L'onglet écoute déjà la partie et le journal : les bots s'y branchent au
      // lieu de rouvrir des connexions, que le navigateur finirait par étrangler.
      const feed: PublicFeed = (cb) => {
        cb(game.value, events.value)
        return watch([game, events], () => cb(game.value, events.value), { deep: false })
      }
      botClient ??= await makeClient(`bots-${code.value}`)
      bots.value.push(
        await startBot(code.value!, player, {
          level, delayMs, feed, client: botClient,
          mayDealNext: (n) => dealAcknowledged.value === n,
        }),
      )
    })
  }

  function stopBots(): void {
    for (const b of bots.value) b.stop()
    bots.value = []
    botClient = null
  }

  /** Un double clic lançait deux distributions : la seconde se heurtait au verrou. */
  let distribution = false
  async function startDeal(): Promise<void> {
    if (!code.value || distribution) return
    distribution = true
    try {
      await run(() => deal(code.value!))
    } finally {
      distribution = false
    }
  }

  /** Change le placement avant la première donne. */
  /** Charge les condensés de fin de partie. Appelé à l'ouverture de l'onglet global. */
  async function loadArchives(): Promise<void> {
    await run(async () => {
      await signIn()
      archives.value = await readArchives()
    })
  }

  async function chooseSeating(next: Seating): Promise<void> {
    if (!code.value) return
    await run(() => setSeating(code.value!, next))
  }

  async function bid(entry: BiddingEntry): Promise<void> {
    if (!code.value) return
    await run(() => placeBid(code.value!, entry))
  }

  async function playTheCard(card: Card, declareBelote = false): Promise<void> {
    if (!code.value || !playerId.value) return
    await run(() => playCard(code.value!, playerId.value!, card, declareBelote))
  }

  function leave(): void {
    stopBots()
    stopGame?.()
    stopHand?.()
    stopEvents?.()
    stopGame = stopHand = stopEvents = null
    game.value = null
    hand.value = []
    events.value = []
    code.value = null
    persist({ playerId: playerId.value, code: null })
  }

  /** Reprise après rafraîchissement : on se rebranche sur la partie mémorisée. */
  async function resume(): Promise<void> {
    if (!code.value || !playerId.value) return
    await run(async () => {
      uid.value = await signIn()
      subscribe(code.value!)
    })
  }

  return {
    uid, playerId, code, game, hand, events, archives, error, busy,
    seated, ready, takenBy, present, myTeam, seating,
    bidding, biddingResult, toBid, myBidTurn, bidValues, mayCoinche, maySurcoinche,
    play, toPlay, myPlayTurn, playable, beloteCards,
    lastTrick, trickCounts, stars, shame, lastStar, sortedHand, heldTrick, shownTrick,
    dealSummaries, scoreCurve, momentumBars, playerTallies, impasses, impasseCounts,
    peek, create, join, chooseSeating, startDeal, bid, playTheCard, leave, resume, loadArchives,
    bots, addBot, stopBots, botDealerHere, dealAcknowledged, continueToNextDeal,
  }
})
