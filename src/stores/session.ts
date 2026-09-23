/**
 * État de la session : qui je suis, dans quelle partie, et ce que je vois.
 * Le `playerId` est mémorisé dans le navigateur pour qu'un rafraîchissement
 * ne fasse pas perdre son siège.
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { getDoc } from 'firebase/firestore'
import type { Card } from '../game/cards'
import { PLAYER_IDS, type PlayerId } from '../game/players'
import {
  type GameDoc, allSeatsTaken, createGame, deal, gameRef, placeBid, playCard, readArchives,
  setSeating, signIn, takeSeat, watchEvents, watchGame, watchHand,
} from '../firebase/partie'
import type { Archive } from '../game/archive'
import type { GameEvent } from '../game/events'
import {
  type BiddingEntry, canCoinche, canSurcoinche, currentBidder, legalValues, outcome,
} from '../game/bidding'
import { canDeclareBelote, currentPlayer, playableFor } from '../game/play'
import { biddingFromEvents, currentDeal, playFromEvents, starsInGame } from '../game/replay'
import { type DealSummary, type Tally, deals, momentum, runningScores, tallies } from '../game/stats'
import { DEFAULT_SEATING, type Seating, teamOfPlayer } from '../game/players'
import { type Impasse, impasseTallies, impassesOfGame } from '../game/impasses'

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
  const takenBy = computed<Record<PlayerId, boolean>>(
    () =>
      Object.fromEntries(
        PLAYER_IDS.map((p) => [p, Boolean(game.value?.seats[p])]),
      ) as Record<PlayerId, boolean>,
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

  async function startDeal(): Promise<void> {
    if (!code.value) return
    await run(() => deal(code.value!))
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
    seated, ready, takenBy, myTeam, seating,
    bidding, biddingResult, toBid, myBidTurn, bidValues, mayCoinche, maySurcoinche,
    play, toPlay, myPlayTurn, playable, beloteCards,
    lastTrick, trickCounts, stars, shame, lastStar,
    dealSummaries, scoreCurve, momentumBars, playerTallies, impasses, impasseCounts,
    peek, create, join, chooseSeating, startDeal, bid, playTheCard, leave, resume, loadArchives,
  }
})
