/**
 * Machine à états des enchères (docs/REGLES.md § 3 et § 4). Pure : aucune dépendance
 * à Firestore, tout se déduit de la liste ordonnée des prises de parole.
 *
 * Chez nous, « annonce » = enchère.
 */
import type { Suit } from './cards'
import {
  type PlayerId, type Seating, nextPlayer, playerAtSeat, seatOf, teamOfPlayer,
} from './players'
import { RULES, type Rules } from './rules'

/** ENC-10 — sans-atout et tout-atout n'existent qu'en capot et en générale. */
export type Declaration = Suit | 'sa' | 'ta'

export type BiddingEntry =
  | { kind: 'passe'; player: PlayerId }
  | { kind: 'contrat'; player: PlayerId; value: number; suit: Suit }
  | { kind: 'capot'; player: PlayerId; declaration: Declaration }
  | { kind: 'generale'; player: PlayerId; declaration: Declaration }
  | { kind: 'coinche'; player: PlayerId }
  | { kind: 'surcoinche'; player: PlayerId }

export type ContractEntry = Extract<BiddingEntry, { kind: 'contrat' | 'capot' | 'generale' }>

export interface BiddingState {
  dealer: PlayerId
  /** Le placement de cette partie : il définit les équipes et l'ordre de parole. */
  seating: Seating
  entries: BiddingEntry[]
}

export const newBidding = (dealer: PlayerId, seating: Seating): BiddingState => ({
  dealer, seating, entries: [],
})

/**
 * Rang d'une enchère, pour ENC-4 (toute enchère doit être strictement supérieure).
 * La générale domine le capot, même si les deux valent 250 au score.
 */
export function rankOf(entry: ContractEntry): number {
  if (entry.kind === 'contrat') return entry.value
  return entry.kind === 'capot' ? 250 : 300
}

export const highestBid = (state: BiddingState): ContractEntry | null => {
  const bids = state.entries.filter(
    (e): e is ContractEntry => e.kind === 'contrat' || e.kind === 'capot' || e.kind === 'generale',
  )
  return bids.length > 0 ? bids[bids.length - 1] : null
}

export const taker = (state: BiddingState): PlayerId | null => highestBid(state)?.player ?? null

const coinched = (state: BiddingState): boolean => state.entries.some((e) => e.kind === 'coinche')
const surcoinched = (state: BiddingState): boolean => state.entries.some((e) => e.kind === 'surcoinche')

export const multiplier = (state: BiddingState): 1 | 2 | 4 =>
  surcoinched(state) ? 4 : coinched(state) ? 2 : 1

/** Passes consécutives depuis la dernière enchère (ENC-6). */
function trailingPasses(state: BiddingState): number {
  let n = 0
  for (let i = state.entries.length - 1; i >= 0; i--) {
    const e = state.entries[i]
    if (e.kind === 'passe') n++
    else break
  }
  return n
}

export type Outcome =
  | { status: 'en_cours' }
  /** ENC-7 — quatre passes d'emblée : personne ne prend, on redonne (DIS-3). */
  | { status: 'donne_blanche' }
  | {
      status: 'contrat'
      taker: PlayerId
      value: number
      trump: Suit | null
      declaration: Declaration
      multiplier: 1 | 2 | 4
      capot: boolean
      generale: boolean
    }

export function outcome(state: BiddingState, rules: Rules = RULES): Outcome {
  const best = highestBid(state)

  if (!best) return trailingPasses(state) >= 4 ? { status: 'donne_blanche' } : { status: 'en_cours' }

  // La coinche ferme les enchères ; le camp du preneur peut encore surcoincher.
  const closed = surcoinched(state)
    ? true
    : coinched(state)
      ? state.entries.at(-1)!.kind === 'passe'
      : trailingPasses(state) >= 3

  if (!closed) return { status: 'en_cours' }

  return {
    status: 'contrat',
    taker: best.player,
    value:
      best.kind === 'contrat'
        ? best.value
        : best.kind === 'capot'
          ? rules.capotValue
          : rules.generaleValue,
    trump: best.kind === 'contrat' ? best.suit : declarationToTrump(best.declaration),
    declaration: best.kind === 'contrat' ? best.suit : best.declaration,
    multiplier: multiplier(state),
    capot: best.kind === 'capot',
    generale: best.kind === 'generale',
  }
}

const declarationToTrump = (d: Declaration): Suit | null => (d === 'sa' || d === 'ta' ? null : d)

/**
 * À qui de parler. Retourne `null` quand les enchères sont closes.
 * ENC-1 : le joueur à gauche du donneur parle en premier.
 * La coinche étant prise à la volée (CO-3), elle ne consomme pas de tour.
 */
export function currentBidder(state: BiddingState): PlayerId | null {
  if (outcome(state).status !== 'en_cours') return null

  const spoken = state.entries.filter((e) => e.kind !== 'coinche' && e.kind !== 'surcoinche')
  if (coinched(state)) {
    // Seul le camp du preneur peut répondre à la coinche : surcoincher ou laisser passer.
    const t = taker(state)
    return t ? t : null
  }
  return playerAtSeat(seatOf(state.dealer, state.seating) + 1 + spoken.length, state.seating)
}

/** Valeurs de contrat encore ouvertes (ENC-3, ENC-4). */
export function legalValues(state: BiddingState, rules: Rules = RULES): number[] {
  const best = highestBid(state)
  if (best && best.kind !== 'contrat') return [] // au-delà du capot, plus de contrat chiffré
  const floor = best ? best.value + rules.bidStep : rules.minBid
  const values: number[] = []
  for (let v = floor; v <= rules.maxBid; v += rules.bidStep) values.push(v)
  return values
}

export const canBidCapot = (state: BiddingState): boolean => {
  const best = highestBid(state)
  return !best || best.kind === 'contrat'
}

export const canBidGenerale = (state: BiddingState): boolean => {
  const best = highestBid(state)
  return !best || best.kind !== 'generale'
}

/** CO-1, CO-3 — un adversaire du preneur peut coincher à tout moment. */
export function canCoinche(state: BiddingState, player: PlayerId): boolean {
  const t = taker(state)
  if (!t || coinched(state)) return false
  return teamOfPlayer(player, state.seating) !== teamOfPlayer(t, state.seating)
}

/** CO-2 — seul le camp du preneur peut surcoincher. */
export function canSurcoinche(state: BiddingState, player: PlayerId): boolean {
  const t = taker(state)
  if (!t || !coinched(state) || surcoinched(state)) return false
  return teamOfPlayer(player, state.seating) === teamOfPlayer(t, state.seating)
}

export class IllegalBid extends Error {}

/** Applique une prise de parole après l'avoir validée. L'état est remplacé, jamais muté. */
export function apply(state: BiddingState, entry: BiddingEntry, rules: Rules = RULES): BiddingState {
  if (outcome(state, rules).status !== 'en_cours') throw new IllegalBid('Les enchères sont closes')

  if (entry.kind === 'coinche') {
    if (!canCoinche(state, entry.player)) throw new IllegalBid('Coinche impossible')
    return { ...state, entries: [...state.entries, entry] }
  }
  if (entry.kind === 'surcoinche') {
    if (!canSurcoinche(state, entry.player)) throw new IllegalBid('Surcoinche impossible')
    return { ...state, entries: [...state.entries, entry] }
  }

  if (entry.player !== currentBidder(state)) throw new IllegalBid(`Ce n'est pas à ${entry.player} de parler`)

  if (entry.kind === 'contrat') {
    if (!legalValues(state, rules).includes(entry.value)) {
      throw new IllegalBid(`${entry.value} n'est pas une enchère valable`)
    }
  } else if (entry.kind === 'capot' && !canBidCapot(state)) {
    throw new IllegalBid('Capot impossible')
  } else if (entry.kind === 'generale' && !canBidGenerale(state)) {
    throw new IllegalBid('Générale impossible')
  }

  return { ...state, entries: [...state.entries, entry] }
}

/** Qui entame le premier pli : JEU-1, sauf générale où le preneur prend la main (ENC-9). */
export function firstLeader(state: BiddingState): PlayerId | null {
  const result = outcome(state)
  if (result.status !== 'contrat') return null
  return result.generale ? result.taker : nextPlayer(state.dealer, state.seating)
}
