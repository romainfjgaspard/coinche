/**
 * Accès Firestore : création, participation, journal.
 * Toute écriture de jeu passe par `appendEvent`, pour qu'aucune action n'échappe
 * au journal.
 */
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  type Transaction,
  arrayUnion,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { type Client, mainClient } from './app'
import { type Card, DECK, gatherAndCut, shuffle } from '../game/cards'
import { type PlayerId, type Seating, randomSeating } from '../game/players'
import { dealHands } from '../game/deal'
import type { BotLevel } from '../game/bot'
import { ENGINE_VERSION } from '../game/rules'
import type { GameEvent, NewEvent } from '../game/events'
import { type BiddingEntry, apply, outcome } from '../game/bidding'
import {
  SHAME_THRESHOLD,
  beloteDeclarations,
  biddingFromEvents,
  bidRound,
  currentDeal,
  declaredBelote,
  playFromEvents,
  starsInGame,
} from '../game/replay'
import { nextPlayer, playerAtSeat, seatOf, teamOfPlayer } from '../game/players'
import { beloteHeld, canDeclareBelote, isDealOver, play, trickFlags, tricksForScoring } from '../game/play'
import { type Contract, type DealStatus, scoreDeal, unannouncedCapot } from '../game/scoring'
import { type Archive, buildArchive } from '../game/archive'
import { isGameOver, RULES } from '../game/rules'

export type Phase = 'lobby' | 'bidding' | 'playing' | 'scoring' | 'finished' | 'cancelled'

/** Un siège : le compte qui l'occupe, et s'il est tenu par un bot. */
export interface Seat {
  uid: string
  bot?: boolean
  level?: BotLevel
  /** Un bot a pris la place d'un joueur qui ne répondait plus : le joueur peut la reprendre. */
  replaced?: boolean
  /** Le joueur a repris sa place : un bot a joué pour lui, la partie compte comme « avec bot ». */
  botAssisted?: boolean
  /** Remplacé par un bot : le compte du joueur, seul autorisé à reprendre sa place. */
  formerUid?: string
}

export interface GameDoc {
  /** playerId → compte anonyme qui occupe le siège, et s'il est tenu par un bot */
  seats: Partial<Record<PlayerId, Seat>>
  /** Dénormalisé pour que les règles Firestore restent simples et peu coûteuses */
  seatedUids: string[]
  dealer: PlayerId
  /**
   * Placement de cette partie : il définit les équipes, et il change d'une partie à
   * l'autre. Nul tant que la table n'est pas complète — on ne sait pas encore qui joue.
   */
  seating: Seating | null
  phase: Phase
  dealNumber: number
  scores: [number, number]
  eventSeq: number
  /** Nombre de décisions de joueur écrites : enchère, coinche, surcoinche, carte */
  moveSeq: number
  createdAt: unknown
  /** Points à dépasser pour gagner, choisis au salon. Absent : 1000 (FIN-1). */
  target?: number
  /** Blitz : une donne non coinchée est marquée sans être jouée, contrat réputé réussi. */
  blitz?: boolean
  /** Qui a créé la partie : c'est lui qui peut proposer de rejouer. */
  creatorId?: PlayerId
  /** « Rejouer » : le code de la partie suivante, où chacun est rebasculé. */
  nextGame?: string
  /**
   * La soirée : le code de la première partie d'une chaîne de « Rejouer ». Absent sur
   * la première, qui est sa propre soirée. Sert aux statistiques par soirée.
   */
  evening?: string
  /**
   * Le siège touché par le dernier changement de siège : les règles Firestore ne savent pas
   * retrouver seules quelle clé a changé dans `seats`, et doivent contrôler ce changement.
   */
  lastSeat?: PlayerId
  /** En pause : qui l'a mise, et depuis quand. Absent ou nul : on joue. */
  pause?: { by: PlayerId; since: number } | null
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sans I ni O, illisibles à l'écran
/** Le placement d'une partie lancée ; une partie sans table complète ne se joue pas. */
export function tableOf(game: GameDoc): Seating {
  if (!game.seating) throw new Error("La table n'est pas encore complète")
  return game.seating
}

export const newCode = (): string =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')

export const gameRef = (code: string, c: Client = mainClient) => doc(c.db, 'games', code)
export const archiveRef = (code: string, c: Client = mainClient) => doc(c.db, 'archives', code)
export const dealsRef = (code: string, c: Client = mainClient) => collection(c.db, 'games', code, 'deals')
export const handRef = (code: string, player: PlayerId, c: Client = mainClient) =>
  doc(c.db, 'games', code, 'hands', player)
export const dealRef = (code: string, dealNumber: number, c: Client = mainClient) =>
  doc(c.db, 'games', code, 'deals', String(dealNumber))
export const eventsRef = (code: string, c: Client = mainClient) => collection(c.db, 'games', code, 'events')

/** Auth anonyme : le compte n'est qu'un jeton de session, jamais une identité de joueur. */
/**
 * Connexions en cours, par client. Plusieurs bots relancés ensemble appelaient
 * `signInAnonymously` en même temps sur le même client : chaque appel créait un
 * compte, le dernier écrasait les autres, et les règles refusaient les écritures
 * faites au nom des comptes perdus.
 */
const connections = new WeakMap<Client['auth'], Promise<string>>()

export async function signIn(c: Client = mainClient): Promise<string> {
  if (c.auth.currentUser) return c.auth.currentUser.uid
  let pendingAction = connections.get(c.auth)
  if (!pendingAction) {
    pendingAction = signInAnonymously(c.auth).then(({ user }) => user.uid)
    connections.set(c.auth, pendingAction)
    pendingAction.catch(() => connections.delete(c.auth))
  }
  return pendingAction
}

/** Deux joueurs ont agi sur le même état : le second coup est refusé. */
export class ConcurrentWrite extends Error {}
/** Coup refusé parce que la partie est en pause : inutile de le retenter. */
export class GamePaused extends Error {}

/**
 * Les seuls événements qui traduisent une décision de joueur.
 *
 * Le reste — fin de pli, fin de donne, contrat fixé, honte complète — n'est qu'une
 * conséquence : c'est le moteur qui les déduit, personne ne les « choisit ».
 * `playFromEvents` et `biddingFromEvents` ne lisent d'ailleurs que ceux-ci.
 */
const DECISIONS = new Set(['bid', 'coinche', 'surcoinche', 'card_played'])

export const isDecision = (type: string): boolean => DECISIONS.has(type)

/** Combien de décisions ce journal contient-il ? C'est ce que le garde-fou compare. */
export const moveCount = (events: GameEvent[]): number =>
  events.reduce((n, e) => n + (isDecision(e.type) ? 1 : 0), 0)

/**
 * Ajoute un événement au journal. La séquence est allouée dans une transaction.
 *
 * `expectedMove` rend l'écriture conditionnelle, mais sur le **nombre de décisions**
 * et non sur la longueur du journal. La différence compte : quand un joueur pose la
 * quatrième carte d'un pli, son client écrit la carte *puis* un `trick_done`. Si le
 * garde-fou portait sur la longueur du journal, ce `trick_done` ferait refuser le
 * coup du joueur suivant — qui n'a pourtant rien de concurrent : c'est son tour, et
 * l'état du jeu n'a pas bougé pour lui. Il voyait alors « Quelqu'un a joué en même
 * temps que toi » à chaque pli, sans raison.
 *
 * Deux échecs très différents peuvent survenir, et un seul doit remonter au joueur :
 *
 * - **Quelqu'un d'autre a décidé entre-temps** → `ConcurrentWrite`, définitif. C'est
 *   le sens même du garde-fou, et le coup doit être rejoué en connaissance de cause.
 * - **On a perdu la course au numéro de séquence** → le journal étant append-only, les
 *   règles refusent d'écraser le document déjà pris et renvoient `permission-denied`
 *   *avant* que la transaction Firestore puisse se réessayer d'elle-même. Rien n'a
 *   changé pour le joueur : on reprend simplement le numéro suivant.
 */
const ATTEMPTS = 8

export const appendEvent = (
  code: string,
  event: NewEvent,
  expectedMove?: number,
  c: Client = mainClient,
): Promise<number> => appendWith(c, code, event, expectedMove)

async function appendWith(
  c: Client,
  code: string,
  event: NewEvent,
  expectedMove?: number,
  /**
   * Champs de la partie écrits **dans la même transaction** que l'événement, et
   * contrôle préalable sur la partie telle qu'elle est à cet instant. Sert à la
   * distribution : changer de phase puis écrire l'événement en deux temps laissait
   * une fenêtre où l'on voyait « Ton enchère » sans donne dans le journal — et si
   * l'événement échouait, la partie restait figée.
   */
  withBelote?: {
    game?: Partial<GameDoc>
    verify?: (game: GameDoc) => void
    /** Autres documents écrits dans la même transaction (la donne scellée, les mains). */
    extraWrites?: (tx: Transaction) => void
  },
): Promise<number> {
  const write = () =>
    runTransaction(c.db, async (tx) => {
      const snap = await tx.get(gameRef(code, c))
      if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
      const game = snap.data() as GameDoc
      withBelote?.verify?.(game)
      // Vérifié dans la transaction : une carte posée à l'instant où l'autre met en
      // pause est refusée, au lieu de passer entre les deux.
      if (game.pause && (isDecision(event.type) || event.type === 'deal_started')) {
        throw new GamePaused('La partie est en pause')
      }
      const moves = game.moveSeq
      if (expectedMove !== undefined && moves !== undefined && moves !== expectedMove) {
        throw new ConcurrentWrite("Quelqu'un a joué en même temps que toi")
      }
      const seq = (game.eventSeq ?? 0) + 1
      tx.update(gameRef(code, c), {
        ...withBelote?.game,
        eventSeq: seq,
        ...(isDecision(event.type) ? { moveSeq: (moves ?? 0) + 1 } : {}),
      })
      // Identifiant tiré au sort, et non dérivé de `seq` : deux clients qui visaient
      // le même numéro se faisaient refuser l'écrasement par les règles (le journal
      // est append-only), et Firestore renvoyait `permission-denied` avant de pouvoir
      // rejouer sa transaction. Avec un identifiant libre, le seul document disputé
      // est celui de la partie — et là, la transaction se rejoue toute seule.
      // L'ordre reste porté par le champ `seq`, sur lequel la lecture trie déjà.
      tx.set(doc(eventsRef(code, c)), { ...event, seq, at: Date.now() })
      withBelote?.extraWrites?.(tx)
      return seq
    })

  let lastOne: unknown
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    try {
      return await write()
    } catch (e) {
      // Une décision refusée le reste ; une course au numéro se rejoue.
      if (e instanceof ConcurrentWrite || e instanceof GamePaused) throw e
      lastOne = e
      // Attente croissante et un peu d'aléa : deux clients refusés ensemble ne doivent
      // pas se représenter au même instant, sinon ils se refont perdre mutuellement.
      await new Promise((r) => setTimeout(r, Math.min(800, 50 * 2 ** attempt) + Math.random() * 60))
    }
  }
  throw lastOne
}

/**
 * Le créateur prend son siège dans le même geste : sans siège, il ne pourrait pas
 * écrire dans sa propre partie. Sans placement imposé, la table se forme avec les
 * trois suivants qui rejoignent, et le placement est tiré au sort à ce moment-là.
 */
export async function createGame(
  creator: PlayerId,
  seating: Seating | null = null,
  dealer: PlayerId = seating?.[1] ?? creator,
  c: Client = mainClient,
  options: { target?: number; blitz?: boolean; evening?: string } = {},
): Promise<string> {
  const uid = await signIn(c)
  let code = newCode()
  const game: GameDoc = {
    seats: { [creator]: { uid } },
    seatedUids: [uid],
    dealer,
    seating,
    phase: 'lobby',
    dealNumber: 0,
    scores: [0, 0],
    eventSeq: 0,
    moveSeq: 0,
    createdAt: serverTimestamp(),
    creatorId: creator,
    ...(options.target ? { target: options.target } : {}),
    ...(options.blitz ? { blitz: true } : {}),
    ...(options.evening ? { evening: options.evening } : {}),
  }
  // Un code déjà pris n'est jamais écrasé : 24⁴ codes seulement, une ancienne partie
  // pouvait être remplacée (son journal mêlé au nouveau). On en tire un autre.
  for (let attempt = 0; ; attempt++) {
    const free = await runTransaction(c.db, async (tx) => {
      if ((await tx.get(gameRef(code, c))).exists()) return false
      tx.set(gameRef(code, c), game)
      return true
    })
    if (free) break
    if (attempt >= 5) throw new Error('Impossible de trouver un code de partie libre')
    code = newCode()
  }
  // Le snapshot des règles part avec la partie : sans lui, une partie archivée
  // devient ininterprétable dès qu'un réglage change.
  await appendWith(c, code, {
    type: 'game_created',
    seats: { [creator]: uid } as Record<PlayerId, string>,
    seating,
    rules: RULES,
    engineVersion: ENGINE_VERSION,
  })
  await appendWith(c, code, { type: 'player_joined', player: creator })
  return code
}

/** On ne saisit pas un pseudo : on choisit qui on est dans la liste des joueurs. */
export async function takeSeat(
  code: string,
  player: PlayerId,
  c: Client = mainClient,
  asBot = false,
  /** Le niveau d'un bot, noté sur son siège : un autre onglet qui le reprend le retrouve. */
  level?: BotLevel,
): Promise<void> {
  const uid = await signIn(c)
  await runTransaction(c.db, async (tx) => {
    const snap = await tx.get(gameRef(code, c))
    if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
    const game = snap.data() as GameDoc
    const holder = game.seats[player]?.uid
    if (holder && holder !== uid) throw new Error(`Ce siège est déjà pris`)
    // Déjà assis ici (un onglet rouvert) : rien à écrire, et surtout pas le siège, dont
    // la réécriture effaçait le drapeau « aidé par un bot ».
    if (holder === uid) return
    const isSeated = Object.keys(game.seats)
    if (!holder) {
      if (isSeated.length >= 4) throw new Error('La table est complète')
      if (game.seating && !game.seating.includes(player))
        throw new Error('Tu ne fais pas partie de cette table')
    }
    // Le quatrième arrivé complète la table : le placement est tiré entre les présents.
    const table =
      !game.seating && !holder && isSeated.length === 3
        ? randomSeating(Math.random, [...isSeated, player])
        : null
    // Le drapeau reste sur le siège : c'est lui qui sortira les parties avec bot
    // des statistiques, et il doit survivre à la partie dans l'archive.
    // Uniquement ce siège, et l'identifiant ajouté à la liste côté serveur. Réécrire
    // la liste entière depuis notre lecture oubliait un joueur arrivé au même moment :
    // la règle `claimsSeat` refusait alors (la liste perdait quelqu'un), et ce refus
    // tombait avant que la transaction ne puisse se rejouer — le joueur restait dehors.
    tx.update(gameRef(code, c), {
      [`seats.${player}`]: asBot ? { uid, bot: true, ...(level ? { level } : {}) } : { uid },
      seatedUids: arrayUnion(uid),
      lastSeat: player,
      ...(table ? { seating: table, dealer: table[1] } : {}),
    })
  })
  await appendWith(c, code, { type: 'player_joined', player })
}

/**
 * Reprend le siège d'un bot dont l'onglet a disparu (fermé, rechargé) : sans cela, le
 * bot « réfléchissait » pour toujours et la table restait figée. Refusé si quelqu'un
 * l'a déjà repris depuis la lecture de `formerUid` : un seul onglet l'emporte.
 */
export async function takeOverBotSeat(
  code: string,
  player: PlayerId,
  formerUid: string,
  c: Client = mainClient,
): Promise<void> {
  const uid = await signIn(c)
  await runTransaction(c.db, async (tx) => {
    const snap = await tx.get(gameRef(code, c))
    if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
    const seat = (snap.data() as GameDoc).seats[player]
    if (!seat?.bot) throw new Error("Ce siège n'est pas tenu par un bot")
    if (seat.uid !== formerUid) throw new ConcurrentWrite('Ce bot a déjà été repris')
    if (seat.uid === uid) return
    tx.update(gameRef(code, c), {
      [`seats.${player}`]: { ...seat, uid },
      seatedUids: arrayUnion(uid),
      lastSeat: player,
    })
  })
}

/**
 * Un bot prend la place d'un joueur qui ne répond plus (onglet fermé, téléphone éteint) :
 * sans cela, toute la table attendait. Refusé si le joueur a joué ou repris sa place
 * depuis la lecture de `formerUid`.
 */
export async function replaceWithBot(
  code: string,
  player: PlayerId,
  formerUid: string,
  level: BotLevel,
  c: Client = mainClient,
): Promise<void> {
  const uid = await signIn(c)
  await runTransaction(c.db, async (tx) => {
    const snap = await tx.get(gameRef(code, c))
    if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
    const seat = (snap.data() as GameDoc).seats[player]
    if (!seat) throw new Error('Ce siège est vide')
    if (seat.bot) throw new Error('Un bot tient déjà ce siège')
    if (seat.uid !== formerUid) throw new ConcurrentWrite('Le joueur est revenu')
    tx.update(gameRef(code, c), {
      [`seats.${player}`]: { uid, bot: true, level, replaced: true, formerUid: seat.uid },
      seatedUids: arrayUnion(uid),
      lastSeat: player,
    })
  })
}

/** De retour, le joueur reprend sa place au bot qui la tenait. */
export async function reclaimSeat(code: string, player: PlayerId, c: Client = mainClient): Promise<void> {
  const uid = await signIn(c)
  await runTransaction(c.db, async (tx) => {
    const snap = await tx.get(gameRef(code, c))
    if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
    const seat = (snap.data() as GameDoc).seats[player]
    if (!seat?.bot || !seat.replaced) throw new Error('Ta place n\u2019est pas tenue par un bot')
    if (seat.formerUid !== uid) throw new Error('Ta place ne peut être reprise que depuis ton appareil')
    tx.update(gameRef(code, c), {
      [`seats.${player}`]: { uid, botAssisted: true },
      seatedUids: arrayUnion(uid),
      lastSeat: player,
    })
  })
}

export const allSeatsTaken = (game: GameDoc): boolean =>
  game.seating !== null && game.seating.every((p) => Boolean(game.seats[p]))

/**
 * Distribution. Le donneur est le seul à pouvoir écrire les quatre mains — les règles
 * Firestore le garantissent, et chacun ne peut lire que la sienne.
 *
 * DIS-1 : distribution en 3-2-3.
 * DIS-2 : on ne rebat pas, on ramasse les plis de la donne précédente et on coupe.
 */
export async function deal(
  code: string,
  previousTricks: Card[][] | null = null,
  c: Client = mainClient,
): Promise<void> {
  const snap = await getDocFromServer(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc
  const dealable = (g: GameDoc) => g.phase === 'lobby' || g.phase === 'scoring'
  if (!dealable(game)) throw new ConcurrentWrite('La donne est déjà distribuée')

  const cut = 1 + Math.floor(Math.random() * 30)
  const tricks = RULES.shuffleEveryDeal ? null : (previousTricks ?? (await previousDealTricks(code, c)))
  const pile = tricks ? gatherAndCut(tricks, cut) : shuffle(DECK)

  const hands = dealHands(pile, game.dealer, tableOf(game))
  const dealNumber = game.dealNumber + 1

  // Toute la distribution en une seule transaction : la donne scellée (lisible une fois
  // la partie terminée, pour l'analyse), les quatre mains, le changement de phase et
  // l'événement. Tout ou rien — auparavant, en plusieurs temps :
  // - réécrire tout le document de partie depuis la lecture du début effaçait ce qui
  //   avait changé entre-temps (compteurs, sièges) ;
  // - un échec après le passage en « enchères » laissait une partie sans donne au
  //   journal, figée ;
  // - deux distributions simultanées pouvaient mêler leurs mains.
  // La vérification dans la transaction garantit qu'une seule distribution passe.
  await appendWith(c, code, { type: 'deal_started', dealNumber, dealer: game.dealer, cut }, undefined, {
    game: { dealNumber, phase: 'bidding' },
    verify: (g) => {
      if (g.dealNumber !== game.dealNumber || !dealable(g)) {
        throw new ConcurrentWrite('La donne est déjà distribuée')
      }
    },
    extraWrites: (tx) => {
      tx.set(dealRef(code, dealNumber, c), { hands, cut, at: Date.now() })
      for (const p of tableOf(game)) tx.set(handRef(code, p, c), { cards: hands[p] })
    },
  })
}

/**
 * DIS-2 — les plis de la dernière donne, dans l'ordre où ils ont été gagnés. Nuls quand
 * elle n'a pas été jouée jusqu'au bout (première donne, donne blanche, blitz) : les mains
 * sont alors inconnues de celui qui distribue, et on rebat.
 */
async function previousDealTricks(code: string, c: Client): Promise<Card[][] | null> {
  const tricks = currentDeal(await readJournal(code, c)).flatMap((e) =>
    e.type === 'trick_done' ? [e.cards] : [],
  )
  return tricks.length === 8 ? tricks : null
}

export const watchGame = (code: string, cb: (game: GameDoc | null) => void, c: Client = mainClient) =>
  onSnapshot(gameRef(code, c), (s) => cb(s.exists() ? (s.data() as GameDoc) : null))

export const watchHand = (
  code: string,
  player: PlayerId,
  cb: (cards: Card[]) => void,
  c: Client = mainClient,
) => onSnapshot(handRef(code, player, c), (s) => cb((s.data()?.cards as Card[]) ?? []))

/** Journal complet de la partie, dans l'ordre. */
export async function readEvents(code: string, c: Client = mainClient): Promise<GameEvent[]> {
  const snap = await getDocs(query(eventsRef(code, c), orderBy('seq')))
  return snap.docs.map((d) => d.data() as GameEvent)
}

/** Le journal déjà lu, par client et par partie, et la lecture en cours s'il y en a une. */
const logs = new Map<string, { seq: number; events: GameEvent[]; reading: Promise<void> }>()

/**
 * Le journal à jour, en ne lisant que ce qui est nouveau depuis la dernière fois.
 *
 * Relire le journal entier à chaque carte coûtait cher : Firestore facture chaque
 * document lu, et une partie complète (≈ 600 événements) en lisait ≈ 140 000 — près
 * de trois fois le quota gratuit quotidien, pour une seule partie. Ici, chaque appel
 * ne lit que les événements postérieurs au dernier connu.
 *
 * C'est sûr parce que `seq` est attribué dans une transaction sur le document de partie
 * (`appendWith`) : unique, croissant, et un événement n'est visible qu'une fois tous
 * ceux qui le précèdent écrits.
 *
 * Les lectures d'un même client sont mises en file : deux appels simultanés (double
 * clic, deux bots du même onglet) auraient sinon ajouté deux fois les mêmes événements
 * au cache, faussant le compteur de coups jusqu'au rechargement.
 */
export async function readJournal(code: string, c: Client = mainClient): Promise<GameEvent[]> {
  const key = `${c.app.name}|${code}`
  const known = logs.get(key) ?? { seq: 0, events: [], reading: Promise.resolve() }
  logs.set(key, known)
  const next = known.reading.then(async () => {
    const snap = await getDocs(query(eventsRef(code, c), where('seq', '>', known.seq), orderBy('seq')))
    for (const d of snap.docs) {
      const e = d.data() as GameEvent
      if (e.seq <= known.seq) continue // déjà connu : jamais deux fois le même événement
      known.events.push(e)
      known.seq = e.seq
    }
  })
  // Une lecture ratée ne doit pas bloquer les suivantes.
  known.reading = next.catch(() => {})
  await next
  return [...known.events]
}

/**
 * Une prise de parole aux enchères. La légalité est vérifiée contre l'état rejoué
 * depuis le journal — jamais contre un état local qui pourrait avoir dérivé.
 */
/**
 * Temps de réflexion, mesuré par celui qui agit — depuis que son tour s'est affiché
 * chez lui, pour ne pas dépendre des horloges des autres appareils. Firestore refuse
 * les champs `undefined` : absent, il n'est pas écrit du tout.
 */
const thinkTime = (thinkMs?: number): { thinkMs?: number } =>
  thinkMs !== undefined && Number.isFinite(thinkMs) && thinkMs >= 0 ? { thinkMs: Math.round(thinkMs) } : {}

export async function placeBid(
  code: string,
  entry: BiddingEntry,
  c: Client = mainClient,
  thinkMs?: number,
): Promise<void> {
  const snap = await getDoc(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc
  // Une enchère — coinche comprise — n'a de sens que pendant les enchères.
  if (game.phase !== 'bidding') throw new Error('Les enchères sont closes')

  const events = await readJournal(code, c)
  const seenMoves = moveCount(events)
  const before = biddingFromEvents(events, game.dealer, tableOf(game))
  const after = apply(before, entry) // lève IllegalBid si la règle l'interdit

  if (entry.kind === 'coinche' || entry.kind === 'surcoinche') {
    await appendWith(c, code, { type: entry.kind, player: entry.player, ...thinkTime(thinkMs) }, seenMoves)
  } else {
    await appendWith(
      c,
      code,
      { type: 'bid', player: entry.player, round: bidRound(before), entry, ...thinkTime(thinkMs) },
      seenMoves,
    )
  }

  // L'événement et le changement de phase dans la même transaction : écrits en deux
  // temps, un onglet fermé entre les deux laissait la partie coincée dans la mauvaise phase.
  const result = outcome(after)
  if (result.status === 'contract') {
    await appendWith(
      c,
      code,
      {
        type: 'contract_set',
        taker: result.taker,
        value: result.value,
        trump: result.trump,
        declaration: result.declaration,
        multiplier: result.multiplier,
        capot: result.capot,
        generale: result.generale,
      },
      undefined,
      { game: { phase: 'playing' } },
    )

    // Blitz : une donne non coinchée n'est pas jouée — le contrat est réputé réussi et le
    // preneur marque sa valeur (250 pour un capot ou une générale). La belote n'est
    // jamais marquée (BEL-5). Coinchée, la donne se joue normalement.
    if (game.blitz && result.multiplier === 1) {
      const team = teamOfPlayer(result.taker, tableOf(game))
      const value = result.generale ? RULES.generaleValue : result.capot ? RULES.capotValue : result.value
      const scored: [number, number] = [0, 0]
      scored[team] = value
      await closeDeal(
        code,
        game,
        {
          status: result.generale ? 'generale' : result.capot ? 'capot' : 'made',
          cardPoints: [0, 0],
          compared: [0, 0],
          scores: scored,
          beloteDeclaredBy: null,
          beloteForgottenBy: null,
          shameStar: null,
          blitz: true,
        },
        c,
      )
    }
  } else if (result.status === 'passed_out') {
    // ENC-7 + DIS-3 : personne ne prend, le même donneur redonne.
    await appendWith(
      c,
      code,
      {
        type: 'deal_cancelled',
        dealNumber: game.dealNumber,
        reason: 'four_passes',
      },
      undefined,
      { game: { phase: 'lobby' } },
    )
  }
}

/** Le contrat de la donne en cours, tel que le journal l'a fixé. */
function contractFrom(events: GameEvent[], seating: Seating): Contract | null {
  const e = [...currentDeal(events)].reverse().find((x) => x.type === 'contract_set')
  if (!e || e.type !== 'contract_set') return null
  return {
    takerSeat: seatOf(e.taker, seating),
    value: e.value,
    // Tout-atout : les plis se comptent avec l'ordre de l'atout dans chaque couleur.
    trump: e.declaration === 'ta' ? 'ta' : e.trump,
    multiplier: e.multiplier,
    capot: e.capot,
    generale: e.generale,
  }
}

/**
 * Pose une carte.
 *
 * Le coup est validé contre l'état rejoué depuis le journal, et la main du joueur
 * — que lui seul peut lire. Rien n'est écrit si le coup est illégal.
 */
export async function playCard(
  code: string,
  player: PlayerId,
  card: Card,
  declareBelote = false,
  c: Client = mainClient,
  thinkMs?: number,
): Promise<void> {
  const snap = await getDoc(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc

  const events = await readJournal(code, c)
  const before = playFromEvents(events, game.dealer, tableOf(game))
  const contract = contractFrom(events, tableOf(game))
  if (!before || !contract) throw new Error('Aucun contrat en cours')

  const hand = ((await getDoc(handRef(code, player, c))).data()?.cards ?? []) as Card[]
  const after = play(before, player, card, hand) // lève IllegalPlay si le coup est interdit
  // BEL-2 — vérifiée avant toute écriture : refusée après coup, elle laissait la carte au
  // journal sans la retirer de la main, ni fermer le pli.
  const alreadyDeclared = (beloteDeclarations(events).get(player) ?? 0) > 0
  if (declareBelote && !canDeclareBelote(before, player, card, hand, before.trump, alreadyDeclared)) {
    throw new Error('Rien à annoncer avec cette carte')
  }

  // La carte et la main allégée dans la même transaction.
  await appendWith(
    c,
    code,
    {
      type: 'card_played',
      player,
      card,
      trickNumber: before.completed.length + 1,
      position: before.current.length,
      ...thinkTime(thinkMs),
    },
    moveCount(events),
    { extraWrites: (tx) => tx.set(handRef(code, player, c), { cards: hand.filter((h) => h !== card) }) },
  )
  // BEL-2 — l'annonce est un geste volontaire, au moment de poser la carte.
  // La donne en cours seulement : une belote d'une donne précédente faisait écrire « rebelote ».
  if (declareBelote) {
    await appendWith(c, code, {
      type: 'belote_declared',
      player,
      half: alreadyDeclared ? 'rebelote' : 'belote',
    })
  }

  if (after.completed.length === before.completed.length) return

  const trick = after.completed[after.completed.length - 1]
  const flags = trickFlags(trick, after.trump)
  await appendWith(c, code, {
    type: 'trick_done',
    trickNumber: after.completed.length,
    winner: trick.winner,
    cards: trick.plays.map((p) => p.card),
    points: trick.points,
    ...flags,
  })

  if (!isDealOver(after)) return

  // BEL-2 / BEL-6 — la belote ne compte qu'annoncée aux deux cartes, Roi et Dame.
  const dealEvents = await readJournal(code, c)
  const declaredBy = declaredBelote(dealEvents)
  const result = scoreDeal(
    tricksForScoring(after),
    contract,
    RULES,
    declaredBy ? seatOf(declaredBy, tableOf(game)) : null,
  )

  // Pour les statistiques : une belote détenue mais jamais annoncée est un oubli.
  const held = beloteHeld(after, after.trump)
  const forgotten = held !== null && declaredBy === null

  // DEC-8 — capot réalisé sans l'avoir annoncé : une étoile pour le preneur.
  const shameStar = unannouncedCapot(result, contract)
    ? playerAtSeat(contract.takerSeat, tableOf(game))
    : null
  await closeDeal(
    code,
    game,
    {
      status: result.status,
      cardPoints: result.cardPoints,
      compared: result.compared,
      scores: result.scores,
      beloteDeclaredBy: declaredBy,
      beloteForgottenBy: forgotten ? held : null,
      shameStar,
    },
    c,
  )
}

/**
 * Clôt une donne : le décompte, la honte éventuelle, et la fin de partie si l'objectif
 * est dépassé. Partagé par la donne jouée et la donne blitz, qui ne se joue pas.
 */
async function closeDeal(
  code: string,
  game: GameDoc,
  dealOutcome: {
    status: DealStatus
    cardPoints: [number, number]
    compared: [number, number]
    scores: [number, number]
    beloteDeclaredBy: PlayerId | null
    beloteForgottenBy: PlayerId | null
    shameStar: PlayerId | null
    blitz?: boolean
  },
  c: Client,
): Promise<void> {
  const { shameStar } = dealOutcome
  const scores: [number, number] = [
    game.scores[0] + dealOutcome.scores[0],
    game.scores[1] + dealOutcome.scores[1],
  ]

  const over = isGameOver(scores, { ...RULES, target: game.target ?? RULES.target })
  // Hors fin de partie, le décompte et le passage à la donne suivante partent avec
  // l'événement : écrits à part, un onglet fermé entre les deux figeait la table en « jeu ».
  // MAT-3 — le donneur tourne d'un joueur vers la gauche.
  const { blitz, ...detail } = dealOutcome
  await appendWith(
    c,
    code,
    {
      type: 'deal_done',
      dealNumber: game.dealNumber,
      ...detail,
      ...(blitz ? { blitz: true } : {}),
    },
    undefined,
    over ? undefined : { game: { scores, phase: 'scoring', dealer: nextPlayer(game.dealer, tableOf(game)) } },
  )

  // DEC-9 — trois étoiles dans la même partie : la honte complète.
  if (shameStar) {
    const stars = starsInGame(await readJournal(code, c)).get(shameStar) ?? 0
    if (stars === SHAME_THRESHOLD) {
      await appendWith(c, code, { type: 'full_shame', player: shameStar, stars })
    }
  }

  if (over) {
    // La phase passe à « terminée » avec l'événement : c'est elle qui descelle les donnes,
    // lues juste après pour l'archive.
    await appendWith(
      c,
      code,
      {
        type: 'game_over',
        scores,
        winner: scores[0] > scores[1] ? 0 : 1,
        deals: game.dealNumber,
      },
      undefined,
      { game: { scores, phase: 'finished' } },
    )
    await archiveGame(code, tableOf(game), c)
  }
}

export const watchEvents = (code: string, cb: (events: GameEvent[]) => void, c: Client = mainClient) =>
  onSnapshot(query(eventsRef(code, c), orderBy('seq')), (s) => cb(s.docs.map((d) => d.data() as GameEvent)))

/**
 * Met la partie en pause, ou la reprend. N'importe quel joueur peut faire l'un ou
 * l'autre, pendant les enchères et le jeu : c'est là que le temps de réflexion court.
 */
export async function setPause(
  code: string,
  player: PlayerId,
  paused: boolean,
  c: Client = mainClient,
): Promise<void> {
  await signIn(c)
  await appendWith(c, code, { type: paused ? 'pause' : 'resume', player }, undefined, {
    game: { pause: paused ? { by: player, since: Date.now() } : null },
    verify: (g) => {
      if (paused && g.pause) throw new Error('La partie est déjà en pause')
      if (!paused && !g.pause) throw new Error("La partie n'est pas en pause")
      if (paused && g.phase !== 'bidding' && g.phase !== 'playing') {
        throw new Error('La pause se prend pendant les enchères ou le jeu')
      }
    },
  })
}

/**
 * Arrête la partie pour les quatre : chacun revient à l'accueil. Rien n'est archivé,
 * elle ne compte donc pas dans les statistiques. Une partie finie ne s'annule plus.
 */
export async function cancelGame(code: string, player: PlayerId, c: Client = mainClient): Promise<void> {
  await appendWith(c, code, { type: 'game_cancelled', player }, undefined, {
    game: { phase: 'cancelled' },
    verify: (g) => {
      if (g.phase === 'finished') throw new Error('La partie est déjà terminée')
    },
  })
}

/**
 * « Rejouer » à la fin d'une partie : les mêmes équipes, le donneur suivant, les
 * mêmes règles. La partie finie garde le code de la suivante : les autres y sont
 * rebasculés en le voyant. Deux clics simultanés ne créent qu'une partie.
 */
export async function replay(code: string, player: PlayerId, c: Client = mainClient): Promise<string> {
  const previousGame = (await getDoc(gameRef(code, c))).data() as GameDoc | undefined
  if (!previousGame || previousGame.phase !== 'finished') throw new Error("La partie n'est pas terminée")
  if (previousGame.nextGame) return previousGame.nextGame
  const table = tableOf(previousGame)
  const nextGame = await createGame(player, table, nextPlayer(previousGame.dealer, table), c, {
    target: previousGame.target,
    blitz: previousGame.blitz,
    // Même soirée : on remonte à la première partie de la chaîne.
    evening: previousGame.evening ?? code,
  })
  // Le premier arrivé l'emporte : un second « Rejouer » simultané rejoint sa partie.
  return runTransaction(c.db, async (tx) => {
    const g = (await tx.get(gameRef(code, c))).data() as GameDoc
    if (g.nextGame) return g.nextGame
    tx.update(gameRef(code, c), { nextGame })
    return nextGame
  })
}

/** Les objectifs proposés au salon. */
export const TARGETS = [500, 1000, 1500, 2000] as const

/** Règles de la partie, choisies au salon : l'objectif, le blitz. Figées dès la première donne. */
export async function setOptions(
  code: string,
  options: { target?: number; blitz?: boolean },
  c: Client = mainClient,
): Promise<void> {
  const snap = await getDoc(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  if ((snap.data() as GameDoc).dealNumber > 0) {
    throw new Error('Les règles ne changent plus une fois la partie commencée')
  }
  await updateDoc(gameRef(code, c), options)
}

/**
 * Change le placement avant la première donne : au hasard, ou choisi. Écrit au journal
 * dans la même transaction : après « Rejouer », le placement de `game_created` sinon
 * l'emportait au rejeu, et les enchères suivaient les anciennes équipes.
 */
export async function setSeating(
  code: string,
  seating: Seating,
  player: PlayerId,
  c: Client = mainClient,
): Promise<void> {
  await appendWith(c, code, { type: 'seating_set', player, seating, dealer: seating[1] }, undefined, {
    game: { seating, dealer: seating[1] },
    verify: (g) => {
      if (g.dealNumber > 0 || g.phase !== 'lobby') {
        throw new Error('Les équipes ne changent plus une fois la partie commencée')
      }
    },
  })
}

/**
 * Écrit le condensé de fin de partie.
 *
 * Les mains distribuées ne deviennent lisibles qu'une fois la phase passée à
 * « terminée » : c'est à ce moment seulement qu'on peut calculer la force des
 * mains, et donc le panache.
 */
export async function archiveGame(code: string, seating: Seating, c: Client = mainClient): Promise<Archive> {
  const events = await readJournal(code, c)
  const snap = await getDocs(dealsRef(code, c))
  const hands: Record<number, Record<string, Card[]>> = {}
  for (const d of snap.docs) {
    hands[Number(d.id)] = (d.data().hands ?? {}) as Record<string, Card[]>
  }
  // Les sièges tenus par un bot suivent la partie dans l'archive : c'est ce qui
  // permet de sortir ces parties des statistiques, ou de les y remettre au filtre.
  const game = (await getDoc(gameRef(code, c))).data() as GameDoc | undefined
  const bots = game
    ? (Object.keys(game.seats) as PlayerId[]).filter((p) => game.seats[p]?.bot || game.seats[p]?.botAssisted)
    : []
  const archive: Archive = {
    ...buildArchive(code, events, seating, hands, bots),
    // Une partie en 500 ou en blitz ne se compare pas tout à fait aux autres : on le garde.
    ...(game?.target && game.target !== RULES.target ? { target: game.target } : {}),
    ...(game?.blitz ? { blitz: true } : {}),
    evening: game?.evening ?? code,
  }
  // Écrite une seule fois : un second dépôt (deux clients à la fin) relit la première.
  return runTransaction(c.db, async (tx) => {
    const already = await tx.get(archiveRef(code, c))
    if (already.exists()) return already.data() as Archive
    tx.set(archiveRef(code, c), archive)
    return archive
  })
}

/** Toutes les parties terminées, pour la page de statistiques globales. */
export async function readArchives(c: Client = mainClient): Promise<Archive[]> {
  const snap = await getDocs(query(collection(c.db, 'archives'), orderBy('finishedAt', 'desc')))
  return snap.docs.map((d) => d.data() as Archive)
}

/** Une partie commencée qui n'est pas allée au bout : annulée, abandonnée, ou en cours. */
export interface UnfinishedGame {
  code: string
  /** Création, en ms ; nulle pour une partie trop ancienne pour l'avoir notée */
  createdAt: number | null
  players: PlayerId[]
  bots: PlayerId[]
  deals: number
  scores: [number, number]
  seating: Seating | null
  cancelled: boolean
}

/**
 * Les parties commencées (au moins une donne) et non terminées. Seul le document de
 * partie est lu : le journal, lui, n'est lisible que par ceux qui y ont joué.
 */
export async function readUnfinishedGames(c: Client = mainClient): Promise<UnfinishedGame[]> {
  await signIn(c)
  const snap = await getDocs(query(collection(c.db, 'games'), where('dealNumber', '>', 0)))
  return snap.docs
    .map((d) => ({ code: d.id, g: d.data() as GameDoc }))
    .filter(({ g }) => g.phase !== 'finished')
    .map(({ code, g }) => {
      const created = g.createdAt as { toMillis?: () => number } | null
      return {
        code,
        createdAt: created?.toMillis ? created.toMillis() : null,
        players: g.seating ? [...g.seating] : (Object.keys(g.seats) as PlayerId[]),
        bots: (Object.keys(g.seats) as PlayerId[]).filter((p) => g.seats[p]?.bot || g.seats[p]?.botAssisted),
        deals: g.dealNumber,
        scores: g.scores,
        seating: g.seating,
        cancelled: g.phase === 'cancelled',
      }
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}
