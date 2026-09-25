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
  ConcurrentWrite, type GameDoc, allSeatsTaken, cancelGame, createGame, deal, gameRef, placeBid, playCard, readArchives,
  rejouer as rejouerPartie, reprendreMaPlace as reprendreMaPlaceEnBase, setOptions, setPause, setSeating,
  signIn, takeSeat, watchEvents, watchGame, watchHand,
} from '../firebase/partie'
import type { Archive } from '../game/archive'
import type { GameEvent } from '../game/events'
import {
  type BiddingEntry, canCoinche, canSurcoinche, currentBidder, legalValues, outcome,
} from '../game/bidding'
import { type CompletedTrick, canDeclareBelote, currentPlayer, playableFor } from '../game/play'
import { PLI_VISIBLE_MS } from '../game/display'
import { beloteAnnonces, biddingFromEvents, currentDeal, playFromEvents, starsInGame } from '../game/replay'
import {
  type DealSummary, type Reflexion, type Tally, deals, momentum, reflexions, runningScores, tallies,
} from '../game/stats'
import { DEFAULT_SEATING, type Seating, teamOfPlayer } from '../game/players'
import { type Impasse, impasseTallies, impassesOfGame } from '../game/impasses'
import type { BotLevel } from '../game/bot'
import { type BotHandle, type PublicFeed, startBot } from '../firebase/botRunner'
import { type Client, makeClient } from '../firebase/app'
import { nomDe } from './roster'

const STORE_KEY = 'coinche.session'
/** Le dernier code de partie utilisé : l'accueil le pré-remplit. */
export const DERNIER_CODE_KEY = 'coinche.dernierCode'

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
  watch(code, (c) => {
    if (!c) return
    try { localStorage.setItem(DERNIER_CODE_KEY, c) } catch { /* pré-remplissage perdu, sans gravité */ }
  }, { immediate: true })
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
  const enEncheres = computed(() => game.value?.phase === 'encheres')
  const mayCoinche = computed(
    () => Boolean(enEncheres.value && bidding.value && playerId.value && canCoinche(bidding.value, playerId.value)),
  )
  const maySurcoinche = computed(
    () => Boolean(enEncheres.value && bidding.value && playerId.value && canSurcoinche(bidding.value, playerId.value)),
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
  const annoncesBelote = computed(() => beloteAnnonces(events.value))
  /** BEL-2 — l'icône d'annonce n'apparaît que sur le Roi et la Dame d'atout. */
  const beloteCards = computed(() => {
    if (!play.value || !playerId.value) return []
    const deja = (annoncesBelote.value.get(playerId.value) ?? 0) > 0
    return hand.value.filter((c) =>
      canDeclareBelote(play.value!, playerId.value!, c, hand.value, play.value!.trump, deja),
    )
  })
  /** Le bouton dit « Rebelote » sur la seconde tête, la belote déjà annoncée. */
  const beloteLabel = computed(() =>
    playerId.value && (annoncesBelote.value.get(playerId.value) ?? 0) > 0 ? 'Rebelote' : 'Belote',
  )

  /** Le pli qui vient de se fermer, qu'il soit encore sur le tapis ou déjà ramassé. */
  const pliFerme = computed(() => play.value?.completed.at(-1) ?? null)

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
      if (n > avant && pliFerme.value) {
        heldTrick.value = pliFerme.value
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
  /**
   * Les plis ramassés, pour l'affichage : celui qui est encore posé sur le tapis n'y
   * compte qu'une fois disparu. Auparavant « dernier pli » et compteurs changeaient dès
   * la quatrième carte posée, pendant que le pli était encore sous les yeux.
   */
  const plisRamasses = computed(() => {
    const plis = play.value?.completed ?? []
    const surLeTapis = heldTrick.value !== null && (play.value?.current.length ?? 0) === 0
    return surLeTapis ? plis.slice(0, -1) : plis
  })
  const lastTrick = computed(() => plisRamasses.value.at(-1) ?? null)
  const trickCounts = computed<[number, number]>(() => {
    const counts: [number, number] = [0, 0]
    for (const t of plisRamasses.value) counts[teamOfPlayer(t.winner, seating.value)] += 1
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
  /** Temps de réflexion de chacun sur la partie, pour annoncer et pour jouer. */
  const reflexionsPartie = computed<Map<PlayerId, Reflexion>>(() => reflexions(events.value))
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
    if (e) setTimeout(() => { if (error.value === e) error.value = null }, 6000)
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
  /** Un seul client Firebase pour tous les bots de l'onglet, créé à la demande. */
  /**
   * Par partie, et gardé tant que l'onglet vit : relancer plusieurs bots d'un coup
   * créait le client en double (même nom d'application), et seul le premier démarrait.
   */
  const botClients = new Map<string, Promise<Client>>()

  /**
   * Installe un bot sur un siège libre.
   *
   * Il obtient sa **propre** session anonyme, donc les règles Firestore lui
   * interdisent de lire la main des autres — au même titre qu'un humain.
   */
  async function addBot(
    player: PlayerId,
    level: BotLevel = 'simple',
    reprendDe?: string,
    remplaceHumain = false,
  ): Promise<void> {
    if (!code.value) return
    const lancer = async () => {
      // `?botDelay=` permet aux tests d'accélérer la table sans toucher au jeu.
      const delayMs = Number(new URLSearchParams(location.search).get('botDelay')) || undefined
      // L'onglet écoute déjà la partie et le journal : les bots s'y branchent au
      // lieu de rouvrir des connexions, que le navigateur finirait par étrangler.
      const feed: PublicFeed = (cb) => {
        cb(game.value, events.value)
        return watch([game, events], () => cb(game.value, events.value), { deep: false })
      }
      const cle = code.value!
      if (!botClients.has(cle)) botClients.set(cle, makeClient(`bots-${cle}`))
      const botClient = await botClients.get(cle)!
      bots.value.push(
        await startBot(code.value!, player, {
          level, delayMs, feed, client: botClient,
          mayDealNext: (n) => dealAcknowledged.value === n,
          reprendDe,
          remplaceHumain,
          onDetache: () => { bots.value = bots.value.filter((b) => b.player !== player) },
        }),
      )
    }
    // Une reprise se fait sans bruit : perdue face à un autre onglet, elle n'est pas une erreur.
    if (!reprendDe || remplaceHumain) { await run(lancer); return }
    try { await lancer() } catch (e) { console.warn('[reprise]', player, e) }
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
        sessionStorage.setItem(BOTS_KEY, JSON.stringify({
          code: code.value,
          bots: bots.value.map((b) => ({ player: b.player, level: b.level })),
        }))
      } catch {
        // Sans stockage, la reprise par un autre onglet prendra le relais.
      }
    },
  )
  /** Au rechargement, une fois la partie lue : on reprend les bots qu'on faisait tourner. */
  let relances = ''
  watch(game, (g) => {
    if (!g || !code.value || relances === code.value) return
    relances = code.value
    if (g.phase === 'terminee' || g.phase === 'annulee') return
    let memo: { code: string; bots: { player: PlayerId; level: BotLevel }[] } | null = null
    try { memo = JSON.parse(sessionStorage.getItem(BOTS_KEY) ?? 'null') } catch { memo = null }
    if (memo?.code !== code.value) return
    for (const b of memo.bots) {
      const siege = g.seats[b.player]
      if (siege?.bot && !bots.value.some((x) => x.player === b.player)) void addBot(b.player, b.level, siege.uid)
    }
  })

  /**
   * Qui doit agir maintenant, si c'est un bot qu'on ne fait pas tourner ici. Le donneur
   * compte aussi entre deux donnes : sans lui, personne ne redistribue.
   */
  const botAttendu = computed<{ player: PlayerId; donneur: boolean } | null>(() => {
    const g = game.value
    if (!g || g.pause || !allSeatsTaken(g)) return null
    const ici = (p: PlayerId) => bots.value.some((b) => b.player === p)
    const attendu = g.phase === 'encheres' ? toBid.value
      : g.phase === 'jeu' ? toPlay.value
        : (g.phase === 'decompte' || (g.phase === 'lobby' && g.dealNumber > 0)) ? g.dealer : null
    if (!attendu || !g.seats[attendu]?.bot || ici(attendu)) return null
    return { player: attendu, donneur: g.phase === 'decompte' || g.phase === 'lobby' }
  })
  /** Le dernier signe de vie de la table : un événement, un changement de phase. */
  let dernierProgres = Date.now()
  /** Une horloge réactive, pour qu'un silence prolongé finisse par se voir à l'écran. */
  const horloge = ref(Date.now())
  const silenceDepuis = ref(Date.now())
  watch(
    () => `${events.value.length}|${game.value?.phase}|${game.value?.dealNumber}|${Boolean(game.value?.pause)}`,
    () => { dernierProgres = Date.now(); silenceDepuis.value = dernierProgres },
  )

  /**
   * Un joueur humain à qui c'est le tour et qui ne répond plus depuis une minute : on
   * propose aux autres de le remplacer par un bot. Pas pendant une pause, ni pour moi.
   */
  const ABSENCE_MS = 60000
  const humainAbsent = computed<PlayerId | null>(() => {
    const g = game.value
    if (!g || g.pause || !playerId.value) return null
    // Entre deux donnes, c'est le donneur qu'on attend : sans lui, personne ne redistribue.
    const attendu = g.phase === 'encheres' ? toBid.value : g.phase === 'jeu' ? toPlay.value
      : (g.phase === 'decompte' || (g.phase === 'lobby' && g.dealNumber > 0)) && allSeatsTaken(g) ? g.dealer : null
    if (!attendu || attendu === playerId.value || g.seats[attendu]?.bot) return null
    return horloge.value - silenceDepuis.value >= ABSENCE_MS ? attendu : null
  })
  async function remplacerParBot(p: PlayerId): Promise<void> {
    const siege = game.value?.seats[p]
    if (!siege || siege.bot) return
    await addBot(p, 'simple', siege.uid, true)
  }

  /** Ma place, prise par un bot pendant mon absence : je peux la reprendre. */
  const placePrise = computed(() => {
    const s = playerId.value ? game.value?.seats[playerId.value] : undefined
    return Boolean(s?.bot && s.remplace && s.uid !== uid.value)
  })
  async function reprendreMaPlace(): Promise<void> {
    if (!code.value || !playerId.value) return
    const fait = await run(async () => {
      await reprendreMaPlaceEnBase(code.value!, playerId.value!)
      return true
    })
    // La main est relue avec le siège retrouvé : l'écoute d'avant avait été refusée.
    if (fait && code.value) subscribe(code.value)
  }
  /**
   * Un bot silencieux depuis trop longtemps : on le reprend ici. Un bot joue en
   * quelques secondes ; entre deux donnes, on laisse aux humains le temps de lire le
   * décompte. Le décalage par siège évite que les trois autres onglets se précipitent
   * ensemble — la transaction n'en laisse de toute façon passer qu'un.
   */
  const REPRISE_MS = 15000
  const REPRISE_DONNEUR_MS = 45000
  setInterval(() => {
    horloge.value = Date.now()
    const b = botAttendu.value
    const g = game.value
    if (!b || !g || busy.value || !playerId.value) return
    const rang = Math.max(0, seating.value.indexOf(playerId.value))
    const delai = (b.donneur ? REPRISE_DONNEUR_MS : REPRISE_MS) + rang * 2000
    if (Date.now() - dernierProgres < delai) return
    const siege = g.seats[b.player]
    if (!siege) return
    dernierProgres = Date.now()
    console.warn('[reprise] le bot', b.player, 'ne joue plus : repris ici')
    void addBot(b.player, siege.niveau ?? 'simple', siege.uid)
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

  async function chooseOptions(options: { objectif?: number; blitz?: boolean }): Promise<void> {
    if (!code.value) return
    await run(() => setOptions(code.value!, options))
  }

  async function chooseSeating(next: Seating): Promise<void> {
    if (!code.value) return
    await run(() => setSeating(code.value!, next))
  }

  async function bid(entry: BiddingEntry): Promise<void> {
    if (!code.value) return
    // La coinche se prend hors tour : pas de temps de réflexion qui ait un sens.
    const hors = entry.kind === 'coinche' || entry.kind === 'surcoinche'
    await run(() => placeBid(code.value!, entry, undefined, hors ? undefined : tempsDeReflexion()))
  }

  /**
   * Les cartes en cours d'envoi : la dernière carte part toute seule, et le joueur la
   * touchait souvent en même temps — les deux envois se croisaient, et le second
   * affichait « Quelqu'un a joué en même temps que toi ».
   */
  const enVol = new Set<string>()
  const cleCarte = (card: Card) => `${code.value}|${game.value?.dealNumber}|${card}`
  async function envoyerCarte(card: Card, declareBelote: boolean, thinkMs?: number): Promise<void> {
    if (!code.value || !playerId.value) return
    const cle = cleCarte(card)
    if (enVol.has(cle)) return
    enVol.add(cle)
    try {
      await run(() => playCard(code.value!, playerId.value!, card, declareBelote, undefined, thinkMs))
    } finally {
      enVol.delete(cle)
    }
  }
  async function playTheCard(card: Card, declareBelote = false): Promise<void> {
    await envoyerCarte(card, declareBelote, tempsDeReflexion())
  }

  /**
   * Le huitième pli se joue tout seul : il ne reste qu'une carte, il n'y a rien à
   * décider. Un court temps d'attente laisse voir le pli précédent se ramasser. La
   * belote (rebelote sur la dernière carte) s'annonce d'office : elle ne peut que servir.
   */
  let derniereCarteJouee: string | null = null
  watch(
    () => (myPlayTurn.value && hand.value.length === 1 && heldTrick.value === null && !pause.value ? hand.value[0] : null),
    (carte) => {
      if (!carte) return
      const cle = `${code.value}|${game.value?.dealNumber}|${carte}`
      if (cle === derniereCarteJouee) return
      derniereCarteJouee = cle
      setTimeout(() => {
        if (myPlayTurn.value && hand.value.length === 1 && hand.value[0] === carte && code.value && playerId.value) {
          // Sans temps de réflexion : joué d'office, il fausserait les moyennes.
          void envoyerCarte(carte, beloteCards.value.includes(carte))
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
  let monTourDepuis: number | null = null
  /** Les pauses prises pendant mon tour : elles ne sont pas de la réflexion. */
  let pauseCumulee = 0
  let pauseDepuis: number | null = null
  watch(
    () => myBidTurn.value || myPlayTurn.value,
    (aMoi) => {
      monTourDepuis = aMoi ? Date.now() : null
      pauseCumulee = 0
      pauseDepuis = aMoi && pause.value ? Date.now() : null
    },
    { immediate: true },
  )
  watch(
    () => Boolean(pause.value),
    (enPause) => {
      if (monTourDepuis === null) return
      if (enPause) pauseDepuis = Date.now()
      else if (pauseDepuis !== null) { pauseCumulee += Date.now() - pauseDepuis; pauseDepuis = null }
    },
  )
  const tempsDeReflexion = (): number | undefined => {
    if (monTourDepuis === null) return undefined
    const enCours = pauseDepuis === null ? 0 : Date.now() - pauseDepuis
    return Math.max(0, Date.now() - monTourDepuis - pauseCumulee - enCours)
  }

  /** On ne met en pause que pendant les enchères et le jeu : c'est là que le temps court. */
  const peutPauser = computed(() => game.value?.phase === 'encheres' || game.value?.phase === 'jeu')
  async function basculerPause(): Promise<void> {
    if (!code.value || !playerId.value) return
    await run(() => setPause(code.value!, playerId.value!, !pause.value))
  }

  /** Un mot pour l'accueil quand on y revient sans l'avoir choisi : partie annulée. */
  const avis = ref<string | null>(null)

  /** Arrête la partie pour les quatre, puis retour à l'accueil. */
  async function cancel(): Promise<void> {
    if (!code.value || !playerId.value) return
    const fait = await run(async () => {
      await cancelGame(code.value!, playerId.value!)
      return true
    })
    if (fait) leave()
  }

  // Annulée par quelqu'un d'autre : chacun revient à l'accueil, avec le nom de qui l'a fait.
  watch(
    () => game.value?.phase,
    (phase) => {
      if (phase !== 'annulee') return
      const par = [...events.value].reverse().find((e) => e.type === 'partie_annulee')
      const qui = par && par.type === 'partie_annulee' ? par.player : null
      if (qui !== playerId.value) {
        avis.value = qui ? `${nomDe(qui)} a annulé la partie.` : 'La partie a été annulée.'
      }
      leave()
    },
  )

  /**
   * Passe à la partie suivante (« Rejouer ») : on s'y assoit — le créateur l'est déjà —
   * et on relance, avec leur niveau, les bots que cet onglet faisait tourner.
   */
  async function basculerVers(suivante: string): Promise<void> {
    const moi = playerId.value
    if (!moi || code.value === suivante) return
    const aRelancer = bots.value.map((b) => ({ player: b.player, level: b.level }))
    stopBots()
    await run(async () => {
      const g = (await getDoc(gameRef(suivante))).data() as GameDoc | undefined
      if (!g?.seats[moi]) await takeSeat(suivante, moi)
      code.value = suivante
      persist({ playerId: moi, code: suivante })
      subscribe(suivante)
    })
    for (const b of aRelancer) await addBot(b.player, b.level)
  }

  /** « Rejouer » : l'organisateur crée la partie suivante, les autres y basculent seuls. */
  async function rejouer(): Promise<void> {
    if (!code.value || !playerId.value) return
    const suivante = await run(() => rejouerPartie(code.value!, playerId.value!))
    if (suivante) await basculerVers(suivante)
  }

  // Les autres voient apparaître la partie suivante sur la partie finie : ils y basculent.
  watch(
    () => game.value?.suivante,
    (suivante) => {
      if (suivante && game.value?.phase === 'terminee') void basculerVers(suivante)
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
    uid, playerId, code, game, hand, events, archives, error, busy,
    seated, ready, takenBy, present, myTeam, seating,
    bidding, biddingResult, toBid, myBidTurn, bidValues, mayCoinche, maySurcoinche,
    play, toPlay, myPlayTurn, playable, beloteCards, beloteLabel, annoncesBelote, pause, peutPauser, basculerPause,
    lastTrick, trickCounts, stars, shame, lastStar, sortedHand, heldTrick, shownTrick,
    dealSummaries, scoreCurve, momentumBars, playerTallies, impasses, impasseCounts, reflexionsPartie,
    peek, create, join, chooseSeating, chooseOptions, startDeal, bid, playTheCard, leave, resume, loadArchives,
    avis, cancel, rejouer,
    bots, addBot, stopBots, botDealerHere, dealAcknowledged, continueToNextDeal,
    humainAbsent, remplacerParBot, placePrise, reprendreMaPlace,
  }
})
