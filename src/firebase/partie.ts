/**
 * Accès Firestore : création, participation, journal.
 * Toute écriture de jeu passe par `appendEvent`, pour qu'aucune action n'échappe
 * au journal.
 */
import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction,
  serverTimestamp, setDoc, updateDoc,
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { auth, db } from './app'
import { type Card, DECK, gatherAndCut, shuffle } from '../game/cards'
import { PLAYER_IDS, type PlayerId, type Seating, randomSeating } from '../game/players'
import { dealHands, dealingOrder } from '../game/deal'
import { ENGINE_VERSION } from '../game/rules'
import type { GameEvent, NewEvent } from '../game/events'
import { type BiddingEntry, apply, outcome } from '../game/bidding'
import {
  SHAME_THRESHOLD, biddingFromEvents, bidRound, currentDeal, declaredBelote, playFromEvents,
  starsInGame,
} from '../game/replay'
import { nextPlayer, playerAtSeat, seatOf } from '../game/players'
import {
  beloteHeld, canDeclareBelote, isDealOver, play, trickFlags, tricksForScoring,
} from '../game/play'
import { type Contract, scoreDeal, unannouncedCapot } from '../game/scoring'
import { type Archive, buildArchive } from '../game/archive'
import { isGameOver, RULES } from '../game/rules'


export type Phase = 'lobby' | 'encheres' | 'jeu' | 'decompte' | 'terminee'

export interface GameDoc {
  /** playerId → uid du compte anonyme qui occupe le siège */
  seats: Partial<Record<PlayerId, { uid: string }>>
  /** Dénormalisé pour que les règles Firestore restent simples et peu coûteuses */
  seatedUids: string[]
  dealer: PlayerId
  /** Placement de cette partie : il définit les équipes, et il change d'une partie à l'autre. */
  seating: Seating
  phase: Phase
  dealNumber: number
  scores: [number, number]
  eventSeq: number
  /** Nombre de décisions de joueur écrites : enchère, coinche, surcoinche, carte */
  moveSeq: number
  createdAt: unknown
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // sans I ni O, illisibles à l'écran
export const newCode = (): string =>
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('')

export const gameRef = (code: string) => doc(db, 'parties', code)
export const archiveRef = (code: string) => doc(db, 'archives', code)
export const dealsRef = (code: string) => collection(db, 'parties', code, 'donne')
export const handRef = (code: string, player: PlayerId) => doc(db, 'parties', code, 'mains', player)
export const dealRef = (code: string, dealNumber: number) =>
  doc(db, 'parties', code, 'donne', String(dealNumber))
export const eventsRef = (code: string) => collection(db, 'parties', code, 'evenements')

/** Auth anonyme : le compte n'est qu'un jeton de session, jamais une identité de joueur. */
export async function signIn(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid
  const { user } = await signInAnonymously(auth)
  return user.uid
}

/** Deux joueurs ont agi sur le même état : le second coup est refusé. */
export class ConcurrentWrite extends Error {}

/**
 * Les seuls événements qui traduisent une décision de joueur.
 *
 * Le reste — fin de pli, fin de donne, contrat fixé, honte complète — n'est qu'une
 * conséquence : c'est le moteur qui les déduit, personne ne les « choisit ».
 * `playFromEvents` et `biddingFromEvents` ne lisent d'ailleurs que ceux-ci.
 */
const DECISIONS = new Set(['enchere', 'coinche', 'surcoinche', 'carte_jouee'])

export const isDecision = (type: string): boolean => DECISIONS.has(type)

/** Combien de décisions ce journal contient-il ? C'est ce que le garde-fou compare. */
export const moveCount = (events: GameEvent[]): number =>
  events.reduce((n, e) => n + (isDecision(e.type) ? 1 : 0), 0)

/**
 * Ajoute un événement au journal. La séquence est allouée dans une transaction.
 *
 * `expectedMove` rend l'écriture conditionnelle, mais sur le **nombre de décisions**
 * et non sur la longueur du journal. La différence compte : quand un joueur pose la
 * quatrième carte d'un pli, son client écrit la carte *puis* un `pli_termine`. Si le
 * garde-fou portait sur la longueur du journal, ce `pli_termine` ferait refuser le
 * coup du joueur suivant — qui n'a pourtant rien de concurrent : c'est son tour, et
 * l'état du jeu n'a pas bougé pour lui. Il voyait alors « Quelqu'un a joué en même
 * temps que toi » à chaque pli, sans raison.
 *
 * Sans `expectedMove`, l'appelant ne revendique aucun état : une collision de numéro
 * n'y est qu'une bousculade, et on reprend simplement le numéro suivant.
 */
const TENTATIVES = 4

export async function appendEvent(
  code: string,
  event: NewEvent,
  expectedMove?: number,
): Promise<number> {
  const ecrire = () =>
    runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef(code))
      if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
      const game = snap.data() as GameDoc
      const coups = game.moveSeq
      if (expectedMove !== undefined && coups !== undefined && coups !== expectedMove) {
        throw new ConcurrentWrite('Quelqu\'un a joué en même temps que toi')
      }
      const seq = (game.eventSeq ?? 0) + 1
      tx.update(gameRef(code), {
        eventSeq: seq,
        ...(isDecision(event.type) ? { moveSeq: (coups ?? 0) + 1 } : {}),
      })
      tx.set(doc(eventsRef(code), String(seq).padStart(5, '0')), { ...event, seq, at: Date.now() })
      return seq
    })

  let derniere: unknown
  for (let essai = 0; essai < (expectedMove === undefined ? TENTATIVES : 1); essai++) {
    try {
      return await ecrire()
    } catch (e) {
      // Une décision refusée le reste : c'est le sens même du garde-fou.
      if (e instanceof ConcurrentWrite) throw e
      derniere = e
      await new Promise((r) => setTimeout(r, 40 * (essai + 1)))
    }
  }
  throw derniere
}

/** Le créateur prend son siège dans le même geste : sans siège, il ne pourrait pas
 *  écrire dans sa propre partie. */
export async function createGame(
  creator: PlayerId,
  seating: Seating = randomSeating(),
  dealer: PlayerId = seating[1],
): Promise<string> {
  const uid = await signIn()
  const code = newCode()
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
  }
  await setDoc(gameRef(code), game)
  // Le snapshot des règles part avec la partie : sans lui, une partie archivée
  // devient ininterprétable dès qu'un réglage change.
  await appendEvent(code, {
    type: 'partie_creee',
    seats: { [creator]: uid } as Record<PlayerId, string>,
    seating,
    rules: RULES,
    engineVersion: ENGINE_VERSION,
  })
  await appendEvent(code, { type: 'joueur_connecte', player: creator })
  return code
}

/** On ne saisit pas un pseudo : on choisit qui on est parmi les quatre. */
export async function takeSeat(code: string, player: PlayerId): Promise<void> {
  const uid = await signIn()
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(gameRef(code))
    if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
    const game = snap.data() as GameDoc
    const holder = game.seats[player]?.uid
    if (holder && holder !== uid) throw new Error(`Ce siège est déjà pris`)
    const seats = { ...game.seats, [player]: { uid } }
    const seatedUids = Object.values(seats).map((s) => s!.uid)
    tx.update(gameRef(code), { seats, seatedUids })
  })
  await appendEvent(code, { type: 'joueur_connecte', player })
}

export const allSeatsTaken = (game: GameDoc): boolean =>
  PLAYER_IDS.every((p) => Boolean(game.seats[p]))

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
): Promise<void> {
  const snap = await getDoc(gameRef(code))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc

  const cut = 1 + Math.floor(Math.random() * 30)
  const pile =
    previousTricks && !RULES.shuffleEveryDeal ? gatherAndCut(previousTricks, cut) : shuffle(DECK)

  const hands = dealHands(pile, game.dealer, game.seating)
  const order = dealingOrder(game.dealer, game.seating)

  const dealNumber = game.dealNumber + 1
  await Promise.all(order.map((p) => setDoc(handRef(code, p), { cards: hands[p] })))
  // Scellée jusqu'à la fin de la partie, puis ouverte pour l'analyse.
  await setDoc(dealRef(code, dealNumber), { hands, cut, at: Date.now() })
  await setDoc(gameRef(code), { ...game, dealNumber, phase: 'encheres' })
  await appendEvent(code, {
    type: 'donne_commencee',
    dealNumber,
    dealer: game.dealer,
    cut,
  })
}

export const watchGame = (code: string, cb: (game: GameDoc | null) => void) =>
  onSnapshot(gameRef(code), (s) => cb(s.exists() ? (s.data() as GameDoc) : null))

export const watchHand = (code: string, player: PlayerId, cb: (cards: Card[]) => void) =>
  onSnapshot(handRef(code, player), (s) => cb((s.data()?.cards as Card[]) ?? []))

/** Journal complet de la partie, dans l'ordre. */
export async function readEvents(code: string): Promise<GameEvent[]> {
  const snap = await getDocs(query(eventsRef(code), orderBy('seq')))
  return snap.docs.map((d) => d.data() as GameEvent)
}

/**
 * Une prise de parole aux enchères. La légalité est vérifiée contre l'état rejoué
 * depuis le journal — jamais contre un état local qui pourrait avoir dérivé.
 */
export async function placeBid(code: string, entry: BiddingEntry): Promise<void> {
  const snap = await getDoc(gameRef(code))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc

  const events = await readEvents(code)
  const coupsVus = moveCount(events)
  const before = biddingFromEvents(events, game.dealer, game.seating)
  const after = apply(before, entry) // lève IllegalBid si la règle l'interdit

  if (entry.kind === 'coinche' || entry.kind === 'surcoinche') {
    await appendEvent(code, { type: entry.kind, player: entry.player }, coupsVus)
  } else {
    await appendEvent(
      code,
      { type: 'enchere', player: entry.player, round: bidRound(before), entry },
      coupsVus,
    )
  }

  const result = outcome(after)
  if (result.status === 'contrat') {
    await appendEvent(code, {
      type: 'contrat_fixe',
      taker: result.taker,
      value: result.value,
      trump: result.trump,
      multiplier: result.multiplier,
      capot: result.capot,
      generale: result.generale,
    })
    await updateDoc(gameRef(code), { phase: 'jeu' })
  } else if (result.status === 'donne_blanche') {
    // ENC-7 + DIS-3 : personne ne prend, le même donneur redonne.
    await appendEvent(code, {
      type: 'donne_annulee',
      dealNumber: game.dealNumber,
      reason: 'quatre_passes',
    })
    await updateDoc(gameRef(code), { phase: 'lobby' })
  }
}

/** Le contrat de la donne en cours, tel que le journal l'a fixé. */
function contractFrom(events: GameEvent[], seating: Seating): Contract | null {
  const e = [...currentDeal(events)].reverse().find((x) => x.type === 'contrat_fixe')
  if (!e || e.type !== 'contrat_fixe') return null
  return {
    takerSeat: seatOf(e.taker, seating),
    value: e.value,
    trump: e.trump,
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
): Promise<void> {
  const snap = await getDoc(gameRef(code))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc

  const events = await readEvents(code)
  const before = playFromEvents(events, game.dealer, game.seating)
  const contract = contractFrom(events, game.seating)
  if (!before || !contract) throw new Error('Aucun contrat en cours')

  const hand = ((await getDoc(handRef(code, player))).data()?.cards ?? []) as Card[]
  const after = play(before, player, card, hand) // lève IllegalPlay si le coup est interdit

  await appendEvent(
    code,
    {
      type: 'carte_jouee',
      player,
      card,
      trickNumber: before.completed.length + 1,
      position: before.current.length,
    },
    moveCount(events),
  )
  // BEL-2 — l'annonce est un geste volontaire, au moment de poser la carte.
  if (declareBelote) {
    if (!canDeclareBelote(before, player, card, hand, before.trump)) {
      throw new Error('Rien à annoncer avec cette carte')
    }
    const already = events.some((e) => e.type === 'belote_annoncee' && e.player === player)
    await appendEvent(code, {
      type: 'belote_annoncee',
      player,
      half: already ? 'rebelote' : 'belote',
    })
  }

  await setDoc(handRef(code, player), { cards: hand.filter((c) => c !== card) })

  if (after.completed.length === before.completed.length) return

  const trick = after.completed[after.completed.length - 1]
  const flags = trickFlags(trick, after.trump)
  await appendEvent(code, {
    type: 'pli_termine',
    trickNumber: after.completed.length,
    winner: trick.winner,
    cards: trick.plays.map((p) => p.card),
    points: trick.points,
    ...flags,
  })

  if (!isDealOver(after)) return

  // BEL-2 / BEL-6 — la belote ne compte qu'annoncée aux deux cartes, Roi et Dame.
  const dealEvents = await readEvents(code)
  const declaredBy = declaredBelote(dealEvents)
  const result = scoreDeal(
    tricksForScoring(after),
    contract,
    RULES,
    declaredBy ? seatOf(declaredBy, game.seating) : null,
  )

  // Pour les statistiques : une belote détenue mais jamais annoncée est un oubli.
  const held = beloteHeld(after, after.trump)
  const forgotten = held !== null && declaredBy === null

  // DEC-8 — capot réalisé sans l'avoir annoncé : une étoile pour le preneur.
  const etoile = unannouncedCapot(result, contract)
    ? playerAtSeat(contract.takerSeat, game.seating)
    : null
  const scores: [number, number] = [
    game.scores[0] + result.scores[0],
    game.scores[1] + result.scores[1],
  ]

  await appendEvent(code, {
    type: 'donne_terminee',
    dealNumber: game.dealNumber,
    status: result.status,
    cardPoints: result.cardPoints,
    compared: result.compared,
    scores: result.scores,
    beloteDeclaredBy: declaredBy,
    beloteForgottenBy: forgotten ? held : null,
    etoile,
  })

  // DEC-9 — trois étoiles dans la même partie : la honte complète.
  if (etoile) {
    const stars = (starsInGame(await readEvents(code)).get(etoile) ?? 0)
    if (stars === SHAME_THRESHOLD) {
      await appendEvent(code, { type: 'honte_complete', player: etoile, stars })
    }
  }

  if (isGameOver(scores)) {
    await appendEvent(code, {
      type: 'partie_terminee',
      scores,
      winner: scores[0] > scores[1] ? 0 : 1,
      deals: game.dealNumber,
    })
    // La phase passe à « terminée » d'abord : c'est elle qui descelle les donnes.
    await updateDoc(gameRef(code), { scores, phase: 'terminee' })
    await archiveGame(code, game.seating)
  } else {
    // MAT-3 — le donneur tourne d'un joueur vers la gauche.
    await updateDoc(gameRef(code), { scores, phase: 'decompte', dealer: nextPlayer(game.dealer, game.seating) })
  }
}

export const watchEvents = (code: string, cb: (events: GameEvent[]) => void) =>
  onSnapshot(query(eventsRef(code), orderBy('seq')), (s) =>
    cb(s.docs.map((d) => d.data() as GameEvent)),
  )

/** Change le placement avant la première donne : au hasard, ou choisi. */
export async function setSeating(code: string, seating: Seating): Promise<void> {
  const snap = await getDoc(gameRef(code))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  if ((snap.data() as GameDoc).dealNumber > 0) {
    throw new Error('Les équipes ne changent plus une fois la partie commencée')
  }
  await updateDoc(gameRef(code), { seating, dealer: seating[1] })
}

/**
 * Écrit le condensé de fin de partie.
 *
 * Les mains distribuées ne deviennent lisibles qu'une fois la phase passée à
 * « terminée » : c'est à ce moment seulement qu'on peut calculer la force des
 * mains, et donc le panache.
 */
export async function archiveGame(code: string, seating: Seating): Promise<Archive> {
  const events = await readEvents(code)
  const snap = await getDocs(dealsRef(code))
  const mains: Record<number, Record<string, Card[]>> = {}
  for (const d of snap.docs) {
    mains[Number(d.id)] = (d.data().hands ?? {}) as Record<string, Card[]>
  }
  const archive = buildArchive(code, events, seating, mains)
  await setDoc(archiveRef(code), archive)
  return archive
}

/** Toutes les parties terminées, pour la page de statistiques globales. */
export async function readArchives(): Promise<Archive[]> {
  const snap = await getDocs(query(collection(db, 'archives'), orderBy('finishedAt', 'desc')))
  return snap.docs.map((d) => d.data() as Archive)
}
