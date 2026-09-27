/**
 * Le bot de base : des règles de joueur de coinche, et aucune information qu'un humain
 * n'aurait pas.
 *
 * `BotView` est volontairement étroite — sa propre main, l'atout, le contrat, ce
 * qui est sur la table et ce qui est déjà tombé. Rien d'autre n'entre ici, donc
 * le bot ne peut pas tricher, même bogué. Les règles Firestore le garantissent
 * déjà côté base (`hands/{playerId}` n'est lisible que par son occupant) ; cette
 * signature le garantit une deuxième fois côté code.
 *
 * Deux niveaux :
 * - `basic`   : le bot de base, ces règles-ci. Il compte les cartes tombées et
 *   retient qui a montré qu'il n'avait plus d'atout : de l'information publique.
 * - `expert` : le bot ★, expert. Il joue ses cartes avec le solveur, en imaginant
 *   les mains cachées (`botExpert.ts`) ; il enchérit comme le bot de base.
 *   L'identifiant `expert` est gardé tel quel : il est enregistré dans les parties.
 */
import {
  type TrumpMode,
  type Card,
  DECK,
  RANKS,
  SUITS,
  type Suit,
  isTrump,
  rankOf,
  strength,
  suitOf,
  value,
} from './cards'
import { type BiddingState, highestBid } from './bidding'
import { impossibleCards } from './cardAnalysis'
import { type PlayerId, type Seating, partnerOf, playerAtSeat, seatOf, teamOfPlayer } from './players'
import type { CompletedTrick, Play } from './play'
import { type PlayedCard, trickWinner } from './trick'

export type BotLevel = 'basic' | 'expert'

/** Tout ce que le bot a le droit de savoir. */
export interface BotView {
  me: PlayerId
  seating: Seating
  /** Sa main à lui, et personne d'autre */
  hand: Card[]
  trump: TrumpMode
  taker: PlayerId
  /** Les cartes déjà posées sur le pli en cours, dans l'ordre */
  current: Play[]
  /** Les plis terminés de cette donne */
  completed: CompletedTrick[]
}

// --- Petits outils de comparaison

/** La carte la moins chère à lâcher : d'abord peu de points, puis faible. */
const cheapest = (cards: Card[], trump: TrumpMode): Card =>
  [...cards].sort((a, b) => value(a, trump) - value(b, trump) || strength(a, trump) - strength(b, trump))[0]

/** La carte qui rapporte le plus : d'abord beaucoup de points, puis forte. */
const richest = (cards: Card[], trump: TrumpMode): Card =>
  [...cards].sort((a, b) => value(b, trump) - value(a, trump) || strength(b, trump) - strength(a, trump))[0]

const asPlayed = (view: BotView): PlayedCard[] =>
  view.current.map((p) => ({ seat: seatOf(p.player, view.seating), card: p.card }))

/** Qui tient le pli en cours, personne si rien n'est encore posé. */
export function trickMaster(view: BotView): PlayerId | null {
  if (view.current.length === 0) return null
  const seat = trickWinner(asPlayed(view), view.trump)
  return view.seating[seat]
}

/** Poser cette carte maintenant me donnerait-il le pli ? */
function wouldWin(view: BotView, card: Card): boolean {
  const tricks = [...asPlayed(view), { seat: seatOf(view.me, view.seating), card }]
  return trickWinner(tricks, view.trump) === seatOf(view.me, view.seating)
}

/** Toutes les cartes que le bot a vues tomber dans cette donne. */
const seen = (view: BotView): Card[] => [
  ...view.completed.flatMap((t) => t.plays.map((p) => p.card)),
  ...view.current.map((p) => p.card),
]

/** Les cartes que le bot ne voit ni dans sa main ni sur la table. */
function outside(view: BotView): Card[] {
  const knownCards = new Set([...seen(view), ...view.hand])
  return DECK.filter((c) => !knownCards.has(c))
}

/**
 * Ce que chacun a montré ne pas avoir : couleurs non fournies, atout non posé quand il
 * fallait couper. Déduit des cartes posées, donc public.
 */
function voidsOf(view: BotView): Set<Card>[] {
  const seat = (p: PlayerId) => seatOf(p, view.seating)
  const tricks = [
    ...view.completed.map((t) => t.plays.map((p) => ({ seat: seat(p.player), card: p.card }))),
    view.current.map((p) => ({ seat: seat(p.player), card: p.card })),
  ]
  return impossibleCards(tricks, view.trump)
}

/** Cette carte est-elle imbattable dans sa couleur ? Plus aucune carte plus forte dehors. */
export function isMaster(card: Card, view: BotView): boolean {
  const suit = suitOf(card)
  const out = new Set(outside(view))
  return !RANKS.map((r) => `${r}${suit}` as Card).some(
    (c) => strength(c, view.trump) > strength(card, view.trump) && out.has(c),
  )
}

/** Les adversaires qui doivent encore jouer dans ce pli, après moi. */
function opponentsAfter(view: BotView): PlayerId[] {
  const me = seatOf(view.me, view.seating)
  const remainingCount = 3 - view.current.length
  const out: PlayerId[] = []
  for (let i = 1; i <= remainingCount; i++) {
    const p = playerAtSeat(me + i, view.seating)
    if (teamOfPlayer(p, view.seating) !== teamOfPlayer(view.me, view.seating)) out.push(p)
  }
  return out
}

/**
 * Le pli, avec cette carte en plus, peut-il encore tomber chez l'adversaire ? On regarde
 * les cartes dehors que les adversaires suivants peuvent encore avoir.
 *
 * La coupe n'est crainte que si l'adversaire a montré qu'il n'a plus la couleur, ou s'il
 * n'en reste plus dehors : au premier tour d'une couleur, un joueur prend quand même.
 */
function beatable(view: BotView, trick: PlayedCard[]): boolean {
  const nextOnes = opponentsAfter(view)
  if (nextOnes.length === 0) return false
  const forbidden = voidsOf(view)
  const out = outside(view)
  const lead = suitOf(trick[0].card)
  const suitOutside = out.filter((c) => suitOf(c) === lead)
  const DUMMY = -1
  return out.some((c) =>
    nextOnes.some((p) => {
      const seat = seatOf(p, view.seating)
      if (forbidden[seat].has(c)) return false
      if (trickWinner([...trick, { seat: DUMMY, card: c }], view.trump) !== DUMMY) return false
      if (suitOf(c) === lead) return true
      // Une coupe (ou une surcoupe) : seulement s'il ne peut plus fournir.
      return suitOutside.every((x) => forbidden[seat].has(x))
    }),
  )
}

/** Des atouts peuvent-ils encore être chez les adversaires ? */
function opponentsMayHaveTrumps(view: BotView): boolean {
  if (view.trump === null || view.trump === 'ta') return false
  const forbidden = voidsOf(view)
  const opponents = view.seating.filter(
    (p) => teamOfPlayer(p, view.seating) !== teamOfPlayer(view.me, view.seating),
  )
  return outside(view).some(
    (c) => isTrump(c, view.trump) && opponents.some((p) => !forbidden[seatOf(p, view.seating)].has(c)),
  )
}

// --- L'entame

function lead(view: BotView, playable: Card[]): Card {
  const { trump } = view
  const myTeamTakes = teamOfPlayer(view.me, view.seating) === teamOfPlayer(view.taker, view.seating)
  const trumps = playable.filter((c) => isTrump(c, trump))
  const suits = playable.filter((c) => !isTrump(c, trump))

  // Le camp du preneur fait tomber les atouts adverses : l'atout maître d'abord (le
  // valet, puis le neuf une fois le valet tombé), sinon un petit, jamais le neuf sous
  // un valet encore dehors.
  if (myTeamTakes && trumps.length > 0 && opponentsMayHaveTrumps(view)) {
    const master = trumps.find((c) => isMaster(c, view))
    if (master) return master
    const smallOnes = trumps.filter((c) => rankOf(c) !== '9')
    return cheapest(smallOnes.length > 0 ? smallOnes : trumps, trump)
  }

  // Sinon on sort ce qui est imbattable, tant que ça l'est.
  const masters = suits.filter((c) => isMaster(c, view))
  if (masters.length > 0) return richest(masters, trump)

  if (suits.length === 0) return cheapest(playable, trump)

  // À défaut, on ouvre petit, de préférence dans une couleur où l'on n'expose pas un
  // dix sans son as.
  const tenExposed = (s: Suit) => suits.some((c) => c === `10${s}`) && !suits.some((c) => c === `A${s}`)
  const safeOnes = suits.filter((c) => !tenExposed(suitOf(c)) && rankOf(c) !== '10')
  return cheapest(safeOnes.length > 0 ? safeOnes : suits, trump)
}

// --- Le choix d'une carte

/**
 * `playable` vient de `playableFor` : le bot choisit **dans** la liste légale, il
 * ne peut donc pas produire un coup interdit, même si cette fonction se trompe.
 */
export function chooseCard(view: BotView, playable: Card[]): Card {
  if (playable.length === 0) throw new Error('Aucune carte jouable')
  if (playable.length === 1) return playable[0]
  if (view.current.length === 0) return lead(view, playable)

  const { trump } = view
  const master = trickMaster(view)
  const partner = partnerOf(view.me, view.seating)
  const trick = asPlayed(view)

  if (master === partner) {
    // Le pli est à nous : on charge si plus personne ne peut le reprendre.
    if (beatable(view, trick)) return cheapest(playable, trump)
    const noTrumps = playable.filter((c) => !isTrump(c, trump))
    return richest(noTrumps.length > 0 ? noTrumps : playable, trump)
  }

  // L'adversaire tient le pli : on le prend, au moindre coût, si ça tient.
  const me = seatOf(view.me, view.seating)
  const winningCards = playable
    .filter((c) => wouldWin(view, c))
    .sort((a, b) => strength(a, trump) - strength(b, trump) || value(a, trump) - value(b, trump))
  const winningSuitCards = winningCards.filter((c) => !isTrump(c, trump))
  const order = [...winningSuitCards, ...winningCards.filter((c) => isTrump(c, trump))]
  const safe = order.find((c) => !beatable(view, [...trick, { seat: me, card: c }]))
  if (safe) return safe
  // Personne ne garantit le pli : on tente la moins chère des gagnantes si elle ne coûte
  // presque rien, sinon on ne sacrifie pas un gros honneur pour rien.
  const tryCard = order[0]
  if (tryCard && value(tryCard, trump) <= 4) return tryCard

  // On ne peut pas prendre : on se défausse au moins cher.
  return cheapest(playable, trump)
}

// --- L'enchère

export interface BotBid {
  value: number
  trump: Suit
}

/**
 * Ce que vaut une main à cet atout, en points d'enchère : le valet 20, le neuf 15 (10
 * sans le valet), l'as d'atout 10, les autres atouts un peu, la longueur, la belote,
 * les as et dix extérieurs, les coupes.
 */
export function handValue(hand: Card[], trump: Suit): number {
  const trumps = hand.filter((c) => suitOf(c) === trump)
  const a = (r: string) => trumps.some((c) => rankOf(c) === r)
  let v = 0
  if (a('J')) v += 20
  if (a('9')) v += a('J') ? 15 : trumps.length >= 3 ? 10 : 5
  if (a('A')) v += 10
  if (a('10')) v += 5
  v += trumps.filter((c) => ['K', 'Q', '8', '7'].includes(rankOf(c))).length * 3
  if (trumps.length >= 4) v += 10 * (trumps.length - 3)
  if (a('K') && a('Q')) v += 20
  for (const s of SUITS) {
    if (s === trump) continue
    const suit = hand.filter((c) => suitOf(c) === s)
    const has = (r: string) => suit.some((c) => rankOf(c) === r)
    if (has('A')) v += 10
    if (has('A') && has('10')) v += 10
    if (trumps.length >= 3 && suit.length === 0) v += 10
    else if (trumps.length >= 3 && suit.length === 1 && !has('A')) v += 5
  }
  return v
}

export interface BidSettings {
  /** En dessous de cette valeur, on n'ouvre pas ; chaque tranche de 10 au-dessus monte d'un palier. */
  opening: number
  /** Le dernier à parler, après trois passes, se lance plus volontiers que de redistribuer. */
  last: number
}
export const SETTINGS: BidSettings = { opening: 45, last: 35 }

const tierOf = (v: number, threshold: number): number =>
  Math.min(160, 80 + 10 * Math.floor(Math.max(0, v - threshold) / 10))

/**
 * Ce que j'apporte à la couleur de mon partenaire, selon la convention courante : 20
 * pour le valet, 10 pour le neuf, 10 par as (atout compris), 20 pour la belote.
 */
export function support(hand: Card[], trump: Suit): number {
  const trumps = hand.filter((c) => suitOf(c) === trump)
  const a = (r: string) => trumps.some((c) => rankOf(c) === r)
  let v = 0
  if (a('J')) v += 20
  else if (a('9')) v += 10
  v += hand.filter((c) => rankOf(c) === 'A').length * 10
  if (a('K') && a('Q')) v += 20
  return v
}

/**
 * Enchère : ouvrir dans sa meilleure couleur, soutenir son partenaire, ou passer.
 *
 * Le soutien part de la **première** annonce du partenaire dans sa couleur : on ne le
 * donne qu'une fois, et le partenaire qui a ouvert ne remonte pas sur son propre soutien.
 */
export function chooseBid(
  hand: Card[],
  state: BiddingState,
  me: PlayerId,
  settings: BidSettings = SETTINGS,
): BotBid | null {
  const seating = state.seating
  const partner = partnerOf(me, seating)
  const bestOption = highestBid(state)
  if (bestOption && bestOption.kind !== 'contract') return null
  const floorBid = bestOption ? bestOption.value : 0
  const contracts = state.entries.filter((e) => e.kind === 'contract')
  const partnerHolds = bestOption?.player === partner
  const lastToSpeak = state.entries.length === 3 && bestOption === null

  // Soutenir la couleur que mon partenaire a annoncée en dernier.
  const partnerBid = [...contracts].reverse().find((e) => e.player === partner)
  let supportBid: BotBid | null = null
  if (partnerBid) {
    const suit = partnerBid.suit
    const first = contracts.find(
      (e) => e.suit === suit && teamOfPlayer(e.player, seating) === teamOfPlayer(me, seating),
    )!
    // Seulement si c'est lui qui a ouvert : si c'était moi, son annonce était déjà un soutien.
    if (first.player === partner) {
      const target = Math.min(160, first.value + support(hand, suit))
      if (target > floorBid) supportBid = { value: target, trump: suit }
    }
  }

  // Ma propre couleur, si je l'ai ouverte je ne remonte pas sur le soutien du partenaire.
  const openKey = contracts.find((e) => e.player === me)
  const threshold = lastToSpeak ? settings.last : settings.opening
  const myOptions = SUITS.map((trump) => ({ trump, v: handValue(hand, trump) }))
    .filter(({ trump }) => !(partnerHolds && openKey && trump === openKey.suit))
    .sort((a, b) => b.v - a.v)
  const mine = myOptions[0]
  let alone: BotBid | null = null
  if (mine && mine.v >= threshold) {
    const bidValue = tierOf(mine.v, threshold)
    if (bidValue > floorBid) alone = { value: bidValue, trump: mine.trump }
  }

  if (partnerHolds) {
    // Le partenaire tient : on le soutient, ou on change de couleur avec bien mieux.
    if (supportBid) return supportBid
    if (alone && alone.trump !== partnerBid?.suit && alone.value >= floorBid + 20) return alone
    return null
  }
  if (supportBid && alone) return supportBid.value >= alone.value ? supportBid : alone
  return supportBid ?? alone
}

// --- La coinche

/**
 * Ce qu'une main pèse **contre** un contrat à cet atout : les gros atouts qu'on tient
 * sous le preneur, la longueur d'atout qui le gêne, les as et dix extérieurs.
 */
export function defenseValue(hand: Card[], trump: Suit): number {
  const trumps = hand.filter((c) => suitOf(c) === trump)
  const a = (r: string) => trumps.some((c) => rankOf(c) === r)
  let v = 0
  if (a('J')) v += 20
  if (a('9')) v += a('J') || trumps.length >= 3 ? 15 : 5
  if (a('A') && trumps.length >= 2) v += 10
  if (trumps.length >= 3) v += 10
  for (const s of SUITS) {
    if (s === trump) continue
    const suit = hand.filter((c) => suitOf(c) === s)
    const has = (r: string) => suit.some((c) => rankOf(c) === r)
    if (has('A')) v += 10
    if (has('A') && has('10')) v += 10
  }
  return v
}

export interface CoincheSettings {
  /** Valeur de défense qu'il faut contre un 80 */
  base: number
  /** Ce qu'on en retire par palier de 10 au-dessus de 80 : plus le contrat est haut, plus il est fragile */
  byTier: number
}
export const COINCHE_SETTINGS: CoincheSettings = { base: 60, byTier: 5 }

/** Coincher le contrat adverse ? Seulement sur un contrat chiffré, quand on tient de quoi le faire chuter. */
export function shouldCoinche(
  hand: Card[],
  state: BiddingState,
  me: PlayerId,
  settings: CoincheSettings = COINCHE_SETTINGS,
): boolean {
  const bestOption = highestBid(state)
  if (!bestOption || bestOption.kind !== 'contract') return false
  if (teamOfPlayer(bestOption.player, state.seating) === teamOfPlayer(me, state.seating)) return false
  if (state.entries.some((e) => e.kind === 'coinche')) return false
  const threshold = settings.base - settings.byTier * ((bestOption.value - 80) / 10)
  return defenseValue(hand, bestOption.suit) >= threshold
}
