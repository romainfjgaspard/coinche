/**
 * Accès Firestore : création, participation, journal.
 * Toute écriture de jeu passe par `appendEvent`, pour qu'aucune action n'échappe
 * au journal.
 */
import {
  collection, doc, getDoc, getDocFromServer, getDocs, onSnapshot, orderBy, query, runTransaction,
  arrayUnion, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import { signInAnonymously } from 'firebase/auth'
import { type Client, mainClient } from './app'
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
  /** playerId → compte anonyme qui occupe le siège, et s'il est tenu par un bot */
  seats: Partial<Record<PlayerId, { uid: string; bot?: boolean }>>
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

export const gameRef = (code: string, c: Client = mainClient) => doc(c.db, 'parties', code)
export const archiveRef = (code: string, c: Client = mainClient) => doc(c.db, 'archives', code)
export const dealsRef = (code: string, c: Client = mainClient) =>
  collection(c.db, 'parties', code, 'donne')
export const handRef = (code: string, player: PlayerId, c: Client = mainClient) =>
  doc(c.db, 'parties', code, 'mains', player)
export const dealRef = (code: string, dealNumber: number, c: Client = mainClient) =>
  doc(c.db, 'parties', code, 'donne', String(dealNumber))
export const eventsRef = (code: string, c: Client = mainClient) =>
  collection(c.db, 'parties', code, 'evenements')

/** Auth anonyme : le compte n'est qu'un jeton de session, jamais une identité de joueur. */
export async function signIn(c: Client = mainClient): Promise<string> {
  if (c.auth.currentUser) return c.auth.currentUser.uid
  const { user } = await signInAnonymously(c.auth)
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
 * Deux échecs très différents peuvent survenir, et un seul doit remonter au joueur :
 *
 * - **Quelqu'un d'autre a décidé entre-temps** → `ConcurrentWrite`, définitif. C'est
 *   le sens même du garde-fou, et le coup doit être rejoué en connaissance de cause.
 * - **On a perdu la course au numéro de séquence** → le journal étant append-only, les
 *   règles refusent d'écraser le document déjà pris et renvoient `permission-denied`
 *   *avant* que la transaction Firestore puisse se réessayer d'elle-même. Rien n'a
 *   changé pour le joueur : on reprend simplement le numéro suivant.
 */
const TENTATIVES = 8

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
  avec?: { game?: Partial<GameDoc>; verifier?: (game: GameDoc) => void },
): Promise<number> {
  const ecrire = () =>
    runTransaction(c.db, async (tx) => {
      const snap = await tx.get(gameRef(code, c))
      if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
      const game = snap.data() as GameDoc
      avec?.verifier?.(game)
      const coups = game.moveSeq
      if (expectedMove !== undefined && coups !== undefined && coups !== expectedMove) {
        throw new ConcurrentWrite('Quelqu\'un a joué en même temps que toi')
      }
      const seq = (game.eventSeq ?? 0) + 1
      tx.update(gameRef(code, c), {
        ...avec?.game,
        eventSeq: seq,
        ...(isDecision(event.type) ? { moveSeq: (coups ?? 0) + 1 } : {}),
      })
      // Identifiant tiré au sort, et non dérivé de `seq` : deux clients qui visaient
      // le même numéro se faisaient refuser l'écrasement par les règles (le journal
      // est append-only), et Firestore renvoyait `permission-denied` avant de pouvoir
      // rejouer sa transaction. Avec un identifiant libre, le seul document disputé
      // est celui de la partie — et là, la transaction se rejoue toute seule.
      // L'ordre reste porté par le champ `seq`, sur lequel la lecture trie déjà.
      tx.set(doc(eventsRef(code, c)), { ...event, seq, at: Date.now() })
      return seq
    })

  let derniere: unknown
  for (let essai = 0; essai < TENTATIVES; essai++) {
    try {
      return await ecrire()
    } catch (e) {
      // Une décision refusée le reste ; une course au numéro se rejoue.
      if (e instanceof ConcurrentWrite) throw e
      derniere = e
      // Attente croissante et un peu d'aléa : deux clients refusés ensemble ne doivent
      // pas se représenter au même instant, sinon ils se refont perdre mutuellement.
      await new Promise((r) => setTimeout(r, Math.min(800, 50 * 2 ** essai) + Math.random() * 60))
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
  c: Client = mainClient,
): Promise<string> {
  const uid = await signIn(c)
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
  await setDoc(gameRef(code, c), game)
  // Le snapshot des règles part avec la partie : sans lui, une partie archivée
  // devient ininterprétable dès qu'un réglage change.
  await appendWith(c, code, {
    type: 'partie_creee',
    seats: { [creator]: uid } as Record<PlayerId, string>,
    seating,
    rules: RULES,
    engineVersion: ENGINE_VERSION,
  })
  await appendWith(c, code, { type: 'joueur_connecte', player: creator })
  return code
}

/** On ne saisit pas un pseudo : on choisit qui on est parmi les quatre. */
export async function takeSeat(
  code: string,
  player: PlayerId,
  c: Client = mainClient,
  asBot = false,
): Promise<void> {
  const uid = await signIn(c)
  await runTransaction(c.db, async (tx) => {
    const snap = await tx.get(gameRef(code, c))
    if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
    const game = snap.data() as GameDoc
    const holder = game.seats[player]?.uid
    if (holder && holder !== uid) throw new Error(`Ce siège est déjà pris`)
    // Le drapeau reste sur le siège : c'est lui qui sortira les parties avec bot
    // des statistiques, et il doit survivre à la partie dans l'archive.
    // Uniquement ce siège, et l'identifiant ajouté à la liste côté serveur. Réécrire
    // la liste entière depuis notre lecture oubliait un joueur arrivé au même moment :
    // la règle `claimsSeat` refusait alors (la liste perdait quelqu'un), et ce refus
    // tombait avant que la transaction ne puisse se rejouer — le joueur restait dehors.
    tx.update(gameRef(code, c), {
      [`seats.${player}`]: asBot ? { uid, bot: true } : { uid },
      seatedUids: arrayUnion(uid),
    })
  })
  await appendWith(c, code, { type: 'joueur_connecte', player })
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
  c: Client = mainClient,
): Promise<void> {
  const snap = await getDocFromServer(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc
  const distribuable = (g: GameDoc) => g.phase === 'lobby' || g.phase === 'decompte'
  if (!distribuable(game)) throw new ConcurrentWrite('La donne est déjà distribuée')

  const cut = 1 + Math.floor(Math.random() * 30)
  const pile =
    previousTricks && !RULES.shuffleEveryDeal ? gatherAndCut(previousTricks, cut) : shuffle(DECK)

  const hands = dealHands(pile, game.dealer, game.seating)
  const order = dealingOrder(game.dealer, game.seating)

  const dealNumber = game.dealNumber + 1
  // Scellée jusqu'à la fin de la partie, puis ouverte pour l'analyse. Écrite en premier :
  // les règles n'autorisent que sa création, elle sert donc de verrou — une seconde
  // distribution simultanée échoue ici, avant d'avoir touché aux mains.
  try {
    await setDoc(dealRef(code, dealNumber, c), { hands, cut, at: Date.now() })
  } catch {
    // Le verrou est déjà pris : quelqu'un d'autre vient de distribuer cette donne.
    throw new ConcurrentWrite('La donne est déjà distribuée')
  }
  await Promise.all(order.map((p) => setDoc(handRef(code, p, c), { cards: hands[p] })))
  // Changement de phase et événement dans une seule transaction, sur les seuls champs
  // concernés. Réécrire tout le document depuis la lecture du début effaçait ce qui
  // avait changé entre-temps (compteurs, sièges), et écrire l'événement à part laissait
  // la partie en « enchères » sans donne au journal si ce second temps échouait.
  await appendWith(
    c,
    code,
    { type: 'donne_commencee', dealNumber, dealer: game.dealer, cut },
    undefined,
    {
      game: { dealNumber, phase: 'encheres' },
      verifier: (g) => {
        if (g.dealNumber !== game.dealNumber || !distribuable(g)) {
          throw new ConcurrentWrite('La donne est déjà distribuée')
        }
      },
    },
  )
}

export const watchGame = (code: string, cb: (game: GameDoc | null) => void, c: Client = mainClient) =>
  onSnapshot(gameRef(code, c), (s) => cb(s.exists() ? (s.data() as GameDoc) : null))

/**
 * Lecture ponctuelle d'une main.
 *
 * Un bot s'en sert au lieu d'ouvrir une écoute permanente : le navigateur plafonne
 * le nombre de connexions par origine, et trois bots qui gardent chacun un flux
 * ouvert bloquaient leurs propres écritures — la distribution prenait 57 secondes.
 */
export async function readHand(
  code: string,
  player: PlayerId,
  c: Client = mainClient,
): Promise<Card[]> {
  // `getDocFromServer`, pas `getDoc` : un client sans écoute ouverte n'a rien en
  // cache et `getDoc` se contentait de ce cache vide. Le bot croyait alors n'avoir
  // aucune carte jouable et restait muet, sans la moindre erreur — la table gelait.
  const snap = await getDocFromServer(handRef(code, player, c))
  return (snap.data()?.cards as Card[]) ?? []
}

export const watchHand = (
  code: string, player: PlayerId, cb: (cards: Card[]) => void, c: Client = mainClient,
) =>
  onSnapshot(handRef(code, player, c), (s) => cb((s.data()?.cards as Card[]) ?? []))

/** Journal complet de la partie, dans l'ordre. */
export async function readEvents(code: string, c: Client = mainClient): Promise<GameEvent[]> {
  const snap = await getDocs(query(eventsRef(code, c), orderBy('seq')))
  return snap.docs.map((d) => d.data() as GameEvent)
}

/** Le journal déjà lu, par client et par partie. */
const journaux = new Map<string, { seq: number; events: GameEvent[] }>()

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
 */
export async function readJournal(code: string, c: Client = mainClient): Promise<GameEvent[]> {
  const cle = `${c.app.name}|${code}`
  const connu = journaux.get(cle) ?? { seq: 0, events: [] }
  const snap = await getDocs(query(eventsRef(code, c), where('seq', '>', connu.seq), orderBy('seq')))
  for (const d of snap.docs) {
    const e = d.data() as GameEvent
    connu.events.push(e)
    connu.seq = Math.max(connu.seq, e.seq)
  }
  journaux.set(cle, connu)
  return [...connu.events]
}

/**
 * Une prise de parole aux enchères. La légalité est vérifiée contre l'état rejoué
 * depuis le journal — jamais contre un état local qui pourrait avoir dérivé.
 */
export async function placeBid(
  code: string,
  entry: BiddingEntry,
  c: Client = mainClient,
): Promise<void> {
  const snap = await getDoc(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc

  const events = await readJournal(code, c)
  const coupsVus = moveCount(events)
  const before = biddingFromEvents(events, game.dealer, game.seating)
  const after = apply(before, entry) // lève IllegalBid si la règle l'interdit

  if (entry.kind === 'coinche' || entry.kind === 'surcoinche') {
    await appendWith(c, code, { type: entry.kind, player: entry.player }, coupsVus)
  } else {
    await appendWith(
      c,
      code,
      { type: 'enchere', player: entry.player, round: bidRound(before), entry },
      coupsVus,
    )
  }

  const result = outcome(after)
  if (result.status === 'contrat') {
    await appendWith(c, code, {
      type: 'contrat_fixe',
      taker: result.taker,
      value: result.value,
      trump: result.trump,
      multiplier: result.multiplier,
      capot: result.capot,
      generale: result.generale,
    })
    await updateDoc(gameRef(code, c), { phase: 'jeu' })
  } else if (result.status === 'donne_blanche') {
    // ENC-7 + DIS-3 : personne ne prend, le même donneur redonne.
    await appendWith(c, code, {
      type: 'donne_annulee',
      dealNumber: game.dealNumber,
      reason: 'quatre_passes',
    })
    await updateDoc(gameRef(code, c), { phase: 'lobby' })
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
  c: Client = mainClient,
): Promise<void> {
  const snap = await getDoc(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  const game = snap.data() as GameDoc

  const events = await readJournal(code, c)
  const before = playFromEvents(events, game.dealer, game.seating)
  const contract = contractFrom(events, game.seating)
  if (!before || !contract) throw new Error('Aucun contrat en cours')

  const hand = ((await getDoc(handRef(code, player, c))).data()?.cards ?? []) as Card[]
  const after = play(before, player, card, hand) // lève IllegalPlay si le coup est interdit

  await appendWith(
    c,
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
    await appendWith(c, code, {
      type: 'belote_annoncee',
      player,
      half: already ? 'rebelote' : 'belote',
    })
  }

  await setDoc(handRef(code, player, c), { cards: hand.filter((c) => c !== card) })

  if (after.completed.length === before.completed.length) return

  const trick = after.completed[after.completed.length - 1]
  const flags = trickFlags(trick, after.trump)
  await appendWith(c, code, {
    type: 'pli_termine',
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

  await appendWith(c, code, {
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
    const stars = (starsInGame(await readJournal(code, c)).get(etoile) ?? 0)
    if (stars === SHAME_THRESHOLD) {
      await appendWith(c, code, { type: 'honte_complete', player: etoile, stars })
    }
  }

  if (isGameOver(scores)) {
    await appendWith(c, code, {
      type: 'partie_terminee',
      scores,
      winner: scores[0] > scores[1] ? 0 : 1,
      deals: game.dealNumber,
    })
    // La phase passe à « terminée » d'abord : c'est elle qui descelle les donnes.
    await updateDoc(gameRef(code, c), { scores, phase: 'terminee' })
    await archiveGame(code, game.seating, c)
  } else {
    // MAT-3 — le donneur tourne d'un joueur vers la gauche.
    await updateDoc(gameRef(code, c), { scores, phase: 'decompte', dealer: nextPlayer(game.dealer, game.seating) })
  }
}

export const watchEvents = (
  code: string, cb: (events: GameEvent[]) => void, c: Client = mainClient,
) =>
  onSnapshot(query(eventsRef(code, c), orderBy('seq')), (s) =>
    cb(s.docs.map((d) => d.data() as GameEvent)),
  )

/** Change le placement avant la première donne : au hasard, ou choisi. */
export async function setSeating(
  code: string,
  seating: Seating,
  c: Client = mainClient,
): Promise<void> {
  const snap = await getDoc(gameRef(code, c))
  if (!snap.exists()) throw new Error(`Partie ${code} introuvable`)
  if ((snap.data() as GameDoc).dealNumber > 0) {
    throw new Error('Les équipes ne changent plus une fois la partie commencée')
  }
  await updateDoc(gameRef(code, c), { seating, dealer: seating[1] })
}

/**
 * Écrit le condensé de fin de partie.
 *
 * Les mains distribuées ne deviennent lisibles qu'une fois la phase passée à
 * « terminée » : c'est à ce moment seulement qu'on peut calculer la force des
 * mains, et donc le panache.
 */
export async function archiveGame(
  code: string,
  seating: Seating,
  c: Client = mainClient,
): Promise<Archive> {
  const events = await readJournal(code, c)
  const snap = await getDocs(dealsRef(code, c))
  const mains: Record<number, Record<string, Card[]>> = {}
  for (const d of snap.docs) {
    mains[Number(d.id)] = (d.data().hands ?? {}) as Record<string, Card[]>
  }
  // Les sièges tenus par un bot suivent la partie dans l'archive : c'est ce qui
  // permet de sortir ces parties des statistiques, ou de les y remettre au filtre.
  const partie = (await getDoc(gameRef(code, c))).data() as GameDoc | undefined
  const bots = partie
    ? (Object.keys(partie.seats) as PlayerId[]).filter((p) => partie.seats[p]?.bot)
    : []
  const archive = buildArchive(code, events, seating, mains, bots)
  await setDoc(archiveRef(code, c), archive)
  return archive
}

/** Toutes les parties terminées, pour la page de statistiques globales. */
export async function readArchives(c: Client = mainClient): Promise<Archive[]> {
  const snap = await getDocs(query(collection(c.db, 'archives'), orderBy('finishedAt', 'desc')))
  return snap.docs.map((d) => d.data() as Archive)
}
