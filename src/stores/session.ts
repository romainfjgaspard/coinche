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
  ConcurrentWrite,
  type GameDoc,
  allSeatsTaken,
  cancelGame,
  createGame,
  deal,
  gameRef,
  placeBid,
  playCard,
  readArchives,
  replay as replayGame,
  reclaimSeat as reclaimSeatInDb,
  setOptions,
  setPause,
  setSeating,
  signIn,
  takeSeat,
  watchEvents,
  watchGame,
  watchHand,
} from '../firebase/game'
import type { Archive } from '../game/archive'
import type { GameEvent } from '../game/events'
import {
  type BiddingEntry,
  canCoinche,
  canSurcoinche,
  currentBidder,
  legalValues,
  outcome,
} from '../game/bidding'
import { type CompletedTrick, canDeclareBelote, currentPlayer, playableFor } from '../game/play'
import { TRICK_VISIBLE_MS } from '../game/display'
import {
  beloteDeclarations,
  biddingFromEvents,
  currentDeal,
  playFromEvents,
  starsInGame,
} from '../game/replay'
import {
  type DealSummary,
  type ThinkTime,
  type Tally,
  deals,
  momentum,
  thinkTimes,
  runningScores,
  tallies,
} from '../game/stats'
import { DEFAULT_SEATING, type Seating, teamOfPlayer } from '../game/players'
import { type Finesse, finesseTallies, finessesOfGame } from '../game/finesses'
import type { BotLevel } from '../game/bot'
import { type BotHandle, type PublicFeed, startBot } from '../firebase/botRunner'
import { mainClient } from '../firebase/app'
import { nameOf } from './roster'

const STORE_KEY = 'coinche.session'
/** Le dernier code de partie utilisé : l'accueil le pré-remplit. */
export const LAST_CODE_KEY = 'coinche.dernierCode'

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
  watch(
    code,
    (c) => {
      if (!c) return
      try {
        localStorage.setItem(LAST_CODE_KEY, c)
      } catch {
        /* pré-remplissage perdu, sans gravité */
      }
    },
    { immediate: true },
  )
  /** La pause en cours : qui l'a mise. Nulle : on joue. */
  const pause = computed(() => game.value?.pause ?? null)
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
  // Seulement pendant les enchères : l'historique des annonces reste lisible une fois le
  // contrat fixé, et le bouton « Coincher », sorti du panneau, restait affiché en plein jeu.
  const inBidding = computed(() => game.value?.phase === 'bidding')
  const mayCoinche = computed(() =>
    Boolean(inBidding.value && bidding.value && playerId.value && canCoinche(bidding.value, playerId.value)),
  )
  const maySurcoinche = computed(() =>
    Boolean(
      inBidding.value && bidding.value && playerId.value && canSurcoinche(bidding.value, playerId.value),
    ),
  )

  const play = computed(() =>
    game.value ? playFromEvents(events.value, game.value.dealer, seating.value) : null,
  )
  const toPlay = computed(() => (play.value ? currentPlayer(play.value) : null))
  const myPlayTurn = computed(() => toPlay.value !== null && toPlay.value === playerId.value)
  const playable = computed(() =>
    play.value && playerId.value ? playableFor(play.value, playerId.value, hand.value) : [],
  )

  /** Ce que chacun a annoncé de sa belote dans la donne en cours (1 : belote, 2 : rebelote). */
  const beloteCalls = computed(() => beloteDeclarations(events.value))
  /** BEL-2 — l'icône d'annonce n'apparaît que sur le Roi et la Dame d'atout. */
  const beloteCards = computed(() => {
    if (!play.value || !playerId.value) return []
    const already = (beloteCalls.value.get(playerId.value) ?? 0) > 0
    return hand.value.filter((c) =>
      canDeclareBelote(play.value!, playerId.value!, c, hand.value, play.value!.trump, already),
    )
  })
  /** Le bouton dit « Rebelote » sur la seconde tête, la belote déjà annoncée. */
  const beloteLabel = computed(() =>
    playerId.value && (beloteCalls.value.get(playerId.value) ?? 0) > 0 ? 'Rebelote' : 'Belote',
  )

  /** Le pli qui vient de se fermer, qu'il soit encore sur le tapis ou déjà ramassé. */
  const trickClosed = computed(() => play.value?.completed.at(-1) ?? null)

  /** Ma main, triée pour l'affichage : atout en tête dès qu'il est connu. */
  const sortedHand = computed(() => sortHand(hand.value, play.value?.trump ?? null))

  /**
   * Le pli qui vient de se fermer, laissé sur le tapis `TRICK_VISIBLE_MS` : sans cette
   * tenue, la quatrième carte disparaissait à l'instant même où elle était posée, et
   * personne ne voyait qui ramassait.
   */
  const heldTrick = ref<CompletedTrick | null>(null)
  let heldTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    () => play.value?.completed.length ?? 0,
    (n, before) => {
      clearTimeout(heldTimer)
      if (n > before && trickClosed.value) {
        heldTrick.value = trickClosed.value
        heldTimer = setTimeout(() => {
          heldTrick.value = null
        }, TRICK_VISIBLE_MS)
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
  /**
   * Les plis ramassés, pour l'affichage : celui qui est encore posé sur le tapis n'y
   * compte qu'une fois disparu. Auparavant « dernier pli » et compteurs changeaient dès
   * la quatrième carte posée, pendant que le pli était encore sous les yeux.
   */
  const tricksTaken = computed(() => {
    const tricks = play.value?.completed ?? []
    const onFelt = heldTrick.value !== null && (play.value?.current.length ?? 0) === 0
    return onFelt ? tricks.slice(0, -1) : tricks
  })
  const lastTrick = computed(() => tricksTaken.value.at(-1) ?? null)
  const trickCounts = computed<[number, number]>(() => {
    const counts: [number, number] = [0, 0]
    for (const t of tricksTaken.value) counts[teamOfPlayer(t.winner, seating.value)] += 1
    return counts
  })
  const stars = computed(() => starsInGame(events.value))

  // --- Statistiques : tout se déduit du journal, donc tout est déjà temps réel.
  const dealSummaries = computed<DealSummary[]>(() => deals(events.value))
  const scoreCurve = computed(() => runningScores(dealSummaries.value))
  const momentumBars = computed(() => momentum(dealSummaries.value))
  const playerTallies = computed<Map<PlayerId, Tally>>(() => tallies(dealSummaries.value, seating.value))
  /** Temps de réflexion de chacun sur la partie, pour annoncer et pour jouer. */
  const gameThinkTimes = computed<Map<PlayerId, ThinkTime>>(() => thinkTimes(events.value))
  /** Les impasses se révèlent au fil des plis : définitives à la fin de chaque donne. */
  const finesses = computed<Finesse[]>(() =>
    game.value ? finessesOfGame(events.value, game.value.dealer, seating.value) : [],
  )
  const finesseCounts = computed(() => finesseTallies(finesses.value))
  const myTeam = computed(() => (playerId.value ? teamOfPlayer(playerId.value, seating.value) : 0))

  /** DEC-9 — la honte complète vient d'être atteinte dans cette partie. */
  const shame = computed(() => {
    const e = [...events.value].reverse().find((x) => x.type === 'full_shame')
    return e && e.type === 'full_shame' ? e : null
  })

  /** DEC-8 — étoile décrochée sur la donne qui vient de finir. */
  const lastStar = computed(() => {
    const e = [...currentDeal(events.value)].reverse().find((x) => x.type === 'deal_done')
    return e && e.type === 'deal_done' ? e.shameStar : null
  })

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    busy.value = true
    error.value = null
    try {
      return await fn()
    } catch (e) {
      // Un coup dépassé par un autre déjà enregistré n'est pas une erreur à montrer :
      // la table se met à jour d'elle-même, et si c'est encore à nous, on rejoue.
      if (e instanceof ConcurrentWrite) console.info('[coup dépassé]', e.message)
      else error.value = e instanceof Error ? e.message : String(e)
      return null
    } finally {
      busy.value = false
    }
  }
  // Un message d'erreur s'efface de lui-même : il restait affiché des donnes entières.
  watch(error, (e) => {
    if (e)
      setTimeout(() => {
        if (error.value === e) error.value = null
      }, 6000)
  })

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
  /**
   * Installe un bot sur un siège libre.
   *
   * Il tourne avec la session de cet onglet, celle du joueur qui l'héberge : les règles
   * Firestore n'autorisent qu'un joueur assis à reprendre ou à remplacer un siège, et ce
   * joueur doit donc être celui qui fait tourner le bot. Ce que le bot décide ne dépend
   * que de sa main et du journal public (`bot.ts`, `botExpert.ts`) : il ne triche pas,
   * même si la session lui donnerait accès aux mains des autres bots de l'onglet.
   */
  async function addBot(
    player: PlayerId,
    level: BotLevel = 'basic',
    takeOverFrom?: string,
    replacesHuman = false,
  ): Promise<void> {
    if (!code.value) return
    const launch = async () => {
      // `?botDelay=` permet aux tests d'accélérer la table sans toucher au jeu.
      const delayMs = Number(new URLSearchParams(location.search).get('botDelay')) || undefined
      // L'onglet écoute déjà la partie et le journal : les bots s'y branchent au
      // lieu de rouvrir des connexions, que le navigateur finirait par étrangler.
      const feed: PublicFeed = (cb) => {
        cb(game.value, events.value)
        return watch([game, events], () => cb(game.value, events.value), { deep: false })
      }
      bots.value.push(
        await startBot(code.value!, player, {
          level,
          delayMs,
          feed,
          client: mainClient,
          mayDealNext: (n) => dealAcknowledged.value === n,
          takeOverFrom,
          replacesHuman,
          onDetache: () => {
            bots.value = bots.value.filter((b) => b.player !== player)
          },
        }),
      )
    }
    // Une reprise se fait sans bruit : perdue face à un autre onglet, elle n'est pas une erreur.
    if (!takeOverFrom || replacesHuman) {
      await run(launch)
      return
    }
    try {
      await launch()
    } catch (e) {
      console.warn('[reprise]', player, e)
    }
  }

  function stopBots(): void {
    for (const b of bots.value) b.stop()
    bots.value = []
  }

  // --- Des bots qui survivent à leur onglet.
  //
  // Un bot tourne dans l'onglet de celui qui l'a ajouté. Onglet fermé ou rechargé, le
  // bot « réfléchissait » pour toujours et la table restait figée : il fallait vider
  // le cache pour s'en sortir. Deux parades : l'onglet rechargé relance ses bots, et
  // tout autre onglet reprend un bot qui ne joue plus.

  /**
   * Les bots que cet onglet fait tourner : de quoi les relancer s'il est rechargé.
   * Dans `sessionStorage`, propre à l'onglet : partagée, la mémoire faisait reprendre
   * par un second onglet les bots qu'un premier faisait encore tourner.
   */
  const BOTS_KEY = 'coinche.bots'
  watch(
    () => bots.value.map((b) => `${b.player}:${b.level}`).join(','),
    () => {
      if (!code.value) return
      try {
        sessionStorage.setItem(
          BOTS_KEY,
          JSON.stringify({
            code: code.value,
            bots: bots.value.map((b) => ({ player: b.player, level: b.level })),
          }),
        )
      } catch {
        // Sans stockage, la reprise par un autre onglet prendra le relais.
      }
    },
  )
  /** Au rechargement, une fois la partie lue : on reprend les bots qu'on faisait tourner. */
  let relaunched = ''
  watch(game, (g) => {
    if (!g || !code.value || relaunched === code.value) return
    relaunched = code.value
    if (g.phase === 'finished' || g.phase === 'cancelled') return
    let memo: { code: string; bots: { player: PlayerId; level: BotLevel }[] } | null
    try {
      memo = JSON.parse(sessionStorage.getItem(BOTS_KEY) ?? 'null')
    } catch {
      memo = null
    }
    if (memo?.code !== code.value) return
    for (const b of memo.bots) {
      const seat = g.seats[b.player]
      if (seat?.bot && !bots.value.some((x) => x.player === b.player))
        void addBot(b.player, b.level, seat.uid)
    }
  })

  /**
   * Qui doit agir maintenant, si c'est un bot qu'on ne fait pas tourner ici. Le donneur
   * compte aussi entre deux donnes : sans lui, personne ne redistribue.
   */
  const awaitedBot = computed<{ player: PlayerId; dealer: boolean } | null>(() => {
    const g = game.value
    if (!g || g.pause || !allSeatsTaken(g)) return null
    const here = (p: PlayerId) => bots.value.some((b) => b.player === p)
    const expected =
      g.phase === 'bidding'
        ? toBid.value
        : g.phase === 'playing'
          ? toPlay.value
          : g.phase === 'scoring' || (g.phase === 'lobby' && g.dealNumber > 0)
            ? g.dealer
            : null
    if (!expected || !g.seats[expected]?.bot || here(expected)) return null
    return { player: expected, dealer: g.phase === 'scoring' || g.phase === 'lobby' }
  })
  /** Le dernier signe de vie de la table : un événement, un changement de phase. */
  let lastProgress = Date.now()
  /** Une horloge réactive, pour qu'un silence prolongé finisse par se voir à l'écran. */
  const clock = ref(Date.now())
  const silentSince = ref(Date.now())
  watch(
    () =>
      `${events.value.length}|${game.value?.phase}|${game.value?.dealNumber}|${Boolean(game.value?.pause)}`,
    () => {
      lastProgress = Date.now()
      silentSince.value = lastProgress
    },
  )

  /**
   * Un joueur humain à qui c'est le tour et qui ne répond plus depuis une minute : on
   * propose aux autres de le remplacer par un bot. Pas pendant une pause, ni pour moi.
   */
  const ABSENCE_MS = 60000
  const absentHuman = computed<PlayerId | null>(() => {
    const g = game.value
    if (!g || g.pause || !playerId.value) return null
    // Entre deux donnes, c'est le donneur qu'on attend : sans lui, personne ne redistribue.
    const expected =
      g.phase === 'bidding'
        ? toBid.value
        : g.phase === 'playing'
          ? toPlay.value
          : (g.phase === 'scoring' || (g.phase === 'lobby' && g.dealNumber > 0)) && allSeatsTaken(g)
            ? g.dealer
            : null
    if (!expected || expected === playerId.value || g.seats[expected]?.bot) return null
    return clock.value - silentSince.value >= ABSENCE_MS ? expected : null
  })
  async function replaceWithBot(p: PlayerId): Promise<void> {
    const seat = game.value?.seats[p]
    if (!seat || seat.bot) return
    await addBot(p, 'basic', seat.uid, true)
  }

  /** Ma place, prise par un bot pendant mon absence : je peux la reprendre. */
  const seatTaken = computed(() => {
    const s = playerId.value ? game.value?.seats[playerId.value] : undefined
    // Les règles ne laissent reprendre la place qu'au compte qui l'occupait : sur cet appareil.
    return Boolean(s?.bot && s.replaced && s.uid !== uid.value && s.formerUid === uid.value)
  })
  async function reclaimSeat(): Promise<void> {
    if (!code.value || !playerId.value) return
    const done = await run(async () => {
      await reclaimSeatInDb(code.value!, playerId.value!)
      return true
    })
    // La main est relue avec le siège retrouvé : l'écoute d'avant avait été refusée.
    if (done && code.value) subscribe(code.value)
  }
  /**
   * Un bot silencieux depuis trop longtemps : on le reprend ici. Un bot joue en
   * quelques secondes ; entre deux donnes, on laisse aux humains le temps de lire le
   * décompte. Le décalage par siège évite que les trois autres onglets se précipitent
   * ensemble — la transaction n'en laisse de toute façon passer qu'un.
   */
  const TAKEOVER_MS = 15000
  const DEALER_TAKEOVER_MS = 45000
  setInterval(() => {
    clock.value = Date.now()
    const b = awaitedBot.value
    const g = game.value
    if (!b || !g || busy.value || !playerId.value) return
    const rank = Math.max(0, seating.value.indexOf(playerId.value))
    const delay = (b.dealer ? DEALER_TAKEOVER_MS : TAKEOVER_MS) + rank * 2000
    if (Date.now() - lastProgress < delay) return
    const seat = g.seats[b.player]
    if (!seat) return
    lastProgress = Date.now()
    console.warn('[reprise] le bot', b.player, 'ne joue plus : repris ici')
    void addBot(b.player, seat.level ?? 'basic', seat.uid)
  }, 3000)

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

  async function chooseOptions(options: { target?: number; blitz?: boolean }): Promise<void> {
    if (!code.value) return
    await run(() => setOptions(code.value!, options))
  }

  async function chooseSeating(next: Seating): Promise<void> {
    if (!code.value || !playerId.value) return
    await run(() => setSeating(code.value!, next, playerId.value!))
  }

  async function bid(entry: BiddingEntry): Promise<void> {
    if (!code.value) return
    // La coinche se prend hors tour : pas de temps de réflexion qui ait un sens.
    const outOfTurn = entry.kind === 'coinche' || entry.kind === 'surcoinche'
    await run(() => placeBid(code.value!, entry, undefined, outOfTurn ? undefined : thinkTimeNow()))
  }

  /**
   * Les cartes en cours d'envoi : la dernière carte part toute seule, et le joueur la
   * touchait souvent en même temps — les deux envois se croisaient, et le second
   * affichait « Quelqu'un a joué en même temps que toi ».
   */
  const inFlight = new Set<string>()
  const cardKey = (card: Card) => `${code.value}|${game.value?.dealNumber}|${card}`
  async function sendCard(card: Card, declareBelote: boolean, thinkMs?: number): Promise<void> {
    if (!code.value || !playerId.value) return
    const key = cardKey(card)
    if (inFlight.has(key)) return
    inFlight.add(key)
    try {
      await run(() => playCard(code.value!, playerId.value!, card, declareBelote, undefined, thinkMs))
    } finally {
      inFlight.delete(key)
    }
  }
  async function playTheCard(card: Card, declareBelote = false): Promise<void> {
    await sendCard(card, declareBelote, thinkTimeNow())
  }

  /**
   * Le huitième pli se joue tout seul : il ne reste qu'une carte, il n'y a rien à
   * décider. Un court temps d'attente laisse voir le pli précédent se ramasser. La
   * belote (rebelote sur la dernière carte) s'annonce d'office : elle ne peut que servir.
   */
  let lastCardPlayed: string | null = null
  watch(
    () =>
      myPlayTurn.value && hand.value.length === 1 && heldTrick.value === null && !pause.value
        ? hand.value[0]
        : null,
    (card) => {
      if (!card) return
      const key = `${code.value}|${game.value?.dealNumber}|${card}`
      if (key === lastCardPlayed) return
      lastCardPlayed = key
      setTimeout(() => {
        if (
          myPlayTurn.value &&
          hand.value.length === 1 &&
          hand.value[0] === card &&
          code.value &&
          playerId.value
        ) {
          // Sans temps de réflexion : joué d'office, il fausserait les moyennes.
          void sendCard(card, beloteCards.value.includes(card))
        }
      }, 600)
    },
  )

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

  /**
   * Depuis quand c'est à moi, vu de cet écran : le temps de réflexion se mesure ici,
   * sans dépendre des horloges des autres appareils.
   */
  let myTurnSince: number | null = null
  /** Les pauses prises pendant mon tour : elles ne sont pas de la réflexion. */
  let pauseTotal = 0
  let pausedSince: number | null = null
  watch(
    () => myBidTurn.value || myPlayTurn.value,
    (isMine) => {
      myTurnSince = isMine ? Date.now() : null
      pauseTotal = 0
      pausedSince = isMine && pause.value ? Date.now() : null
    },
    { immediate: true },
  )
  watch(
    () => Boolean(pause.value),
    (paused) => {
      if (myTurnSince === null) return
      if (paused) pausedSince = Date.now()
      else if (pausedSince !== null) {
        pauseTotal += Date.now() - pausedSince
        pausedSince = null
      }
    },
  )
  const thinkTimeNow = (): number | undefined => {
    if (myTurnSince === null) return undefined
    const pendingAction = pausedSince === null ? 0 : Date.now() - pausedSince
    return Math.max(0, Date.now() - myTurnSince - pauseTotal - pendingAction)
  }

  /** On ne met en pause que pendant les enchères et le jeu : c'est là que le temps court. */
  const canPause = computed(() => game.value?.phase === 'bidding' || game.value?.phase === 'playing')
  async function togglePause(): Promise<void> {
    if (!code.value || !playerId.value) return
    await run(() => setPause(code.value!, playerId.value!, !pause.value))
  }

  /** Un mot pour l'accueil quand on y revient sans l'avoir choisi : partie annulée. */
  const opinion = ref<string | null>(null)

  /** Arrête la partie pour les quatre, puis retour à l'accueil. */
  async function cancel(): Promise<void> {
    if (!code.value || !playerId.value) return
    const done = await run(async () => {
      await cancelGame(code.value!, playerId.value!)
      return true
    })
    if (done) leave()
  }

  // Annulée par quelqu'un d'autre : chacun revient à l'accueil, avec le nom de qui l'a fait.
  watch(
    () => game.value?.phase,
    (phase) => {
      if (phase !== 'cancelled') return
      const by = [...events.value].reverse().find((e) => e.type === 'game_cancelled')
      const who = by && by.type === 'game_cancelled' ? by.player : null
      if (who !== playerId.value) {
        opinion.value = who ? `${nameOf(who)} a annulé la partie.` : 'La partie a été annulée.'
      }
      leave()
    },
  )

  /**
   * Passe à la partie suivante (« Rejouer ») : on s'y assoit — le créateur l'est déjà —
   * et on relance, avec leur niveau, les bots que cet onglet faisait tourner.
   */
  async function switchTo(nextGame: string): Promise<void> {
    const me = playerId.value
    if (!me || code.value === nextGame) return
    const toRestart = bots.value.map((b) => ({ player: b.player, level: b.level }))
    stopBots()
    await run(async () => {
      const g = (await getDoc(gameRef(nextGame))).data() as GameDoc | undefined
      if (!g?.seats[me]) await takeSeat(nextGame, me)
      code.value = nextGame
      persist({ playerId: me, code: nextGame })
      subscribe(nextGame)
    })
    for (const b of toRestart) await addBot(b.player, b.level)
  }

  /** « Rejouer » : l'organisateur crée la partie suivante, les autres y basculent seuls. */
  async function replay(): Promise<void> {
    if (!code.value || !playerId.value) return
    const nextGame = await run(() => replayGame(code.value!, playerId.value!))
    if (nextGame) await switchTo(nextGame)
  }

  // Les autres voient apparaître la partie suivante sur la partie finie : ils y basculent.
  watch(
    () => game.value?.nextGame,
    (nextGame) => {
      if (nextGame && game.value?.phase === 'finished') void switchTo(nextGame)
    },
  )

  /** Reprise après rafraîchissement : on se rebranche sur la partie mémorisée. */
  async function resume(): Promise<void> {
    if (!code.value || !playerId.value) return
    await run(async () => {
      uid.value = await signIn()
      subscribe(code.value!)
    })
  }

  return {
    uid,
    playerId,
    code,
    game,
    hand,
    events,
    archives,
    error,
    busy,
    seated,
    ready,
    takenBy,
    present,
    myTeam,
    seating,
    bidding,
    biddingResult,
    toBid,
    myBidTurn,
    bidValues,
    mayCoinche,
    maySurcoinche,
    play,
    toPlay,
    myPlayTurn,
    playable,
    beloteCards,
    beloteLabel,
    beloteCalls,
    pause,
    canPause,
    togglePause,
    lastTrick,
    trickCounts,
    stars,
    shame,
    lastStar,
    sortedHand,
    heldTrick,
    shownTrick,
    dealSummaries,
    scoreCurve,
    momentumBars,
    playerTallies,
    finesses,
    finesseCounts,
    gameThinkTimes,
    peek,
    create,
    join,
    chooseSeating,
    chooseOptions,
    startDeal,
    bid,
    playTheCard,
    leave,
    resume,
    loadArchives,
    opinion,
    cancel,
    replay,
    bots,
    addBot,
    stopBots,
    botDealerHere,
    dealAcknowledged,
    continueToNextDeal,
    absentHuman,
    replaceWithBot,
    seatTaken,
    reclaimSeat,
  }
})
