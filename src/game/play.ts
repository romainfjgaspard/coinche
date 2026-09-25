/**
 * Jeu de la carte (docs/REGLES.md § 5). Pur, sans réseau.
 *
 * L'état complet d'une donne se déduit de la suite des cartes posées : c'est ce qui
 * permet de le rejouer depuis le journal, et d'analyser les parties après coup.
 */
import { type Atout, type Card, atoutCouleur, suitOf } from './cards'
import { type PlayerId, type Seating, playerAtSeat, seatOf } from './players'
import { type PlayedCard, playableCards, trickPoints, trickWinner } from './trick'

export interface Play {
  player: PlayerId
  card: Card
}

export interface CompletedTrick {
  leader: PlayerId
  plays: Play[]
  winner: PlayerId
  points: number
}

export interface PlayState {
  trump: Atout
  /** Entame du premier pli : à gauche du donneur, ou le preneur sur une générale */
  firstLeader: PlayerId
  /** Le placement de cette partie */
  seating: Seating
  current: Play[]
  completed: CompletedTrick[]
}

export const TRICKS_PER_DEAL = 8

export const newPlay = (trump: Atout, firstLeader: PlayerId, seating: Seating): PlayState => ({
  trump,
  firstLeader,
  seating,
  current: [],
  completed: [],
})

/** Qui entame le pli en cours : le gagnant du précédent, sinon l'entameur initial. */
export const leader = (state: PlayState): PlayerId =>
  state.completed.length === 0 ? state.firstLeader : state.completed[state.completed.length - 1].winner

export function currentPlayer(state: PlayState): PlayerId | null {
  if (isDealOver(state)) return null
  return playerAtSeat(seatOf(leader(state), state.seating) + state.current.length, state.seating)
}

export const isDealOver = (state: PlayState): boolean => state.completed.length === TRICKS_PER_DEAL

const toPlayedCards = (plays: Play[], seating: Seating): PlayedCard[] =>
  plays.map((p) => ({ seat: seatOf(p.player, seating), card: p.card }))

/** Cartes qu'un joueur a le droit de poser, main en main (JEU-2 à JEU-8). */
export function playableFor(state: PlayState, player: PlayerId, hand: Card[]): Card[] {
  return playableCards(
    hand,
    toPlayedCards(state.current, state.seating),
    state.trump,
    seatOf(player, state.seating),
  )
}

export class IllegalPlay extends Error {}

/**
 * Applique un coup **déjà journalisé**, sans le revalider.
 *
 * Le rejeu n'a pas besoin de connaître les mains : la suite des cartes posées suffit
 * à reconstituer les plis. C'est ce qui permet de ne plus publier la main des joueurs
 * dans le journal.
 */
export function applyPlayed(state: PlayState, player: PlayerId, card: Card): PlayState {
  if (isDealOver(state)) throw new IllegalPlay('La donne est terminée')

  const current = [...state.current, { player, card }]
  if (current.length < 4) return { ...state, current }

  const played = toPlayedCards(current, state.seating)
  const winner = playerAtSeat(trickWinner(played, state.trump), state.seating)
  const completed: CompletedTrick = {
    leader: leader(state),
    plays: current,
    winner,
    points: trickPoints(played, state.trump),
  }
  return { ...state, current: [], completed: [...state.completed, completed] }
}

/**
 * Pose une carte. `hand` est la main du joueur avant le coup : seul son propre client
 * la connaît, et c'est lui qui valide son coup avant de l'écrire.
 */
export function play(state: PlayState, player: PlayerId, card: Card, hand: Card[]): PlayState {
  if (isDealOver(state)) throw new IllegalPlay('La donne est terminée')
  if (player !== currentPlayer(state)) throw new IllegalPlay(`Ce n'est pas à ${player} de jouer`)
  if (!hand.includes(card)) throw new IllegalPlay(`${card} n'est pas dans la main de ${player}`)
  if (!playableFor(state, player, hand).includes(card)) {
    throw new IllegalPlay(`${card} n'est pas jouable ici`)
  }
  return applyPlayed(state, player, card)
}

/**
 * Main d'un joueur à un instant donné, reconstituée depuis la donne distribuée.
 *
 * Sert à l'analyse : les mains sont conservées scellées dans `donne/{n}` et ne
 * s'ouvrent qu'à la fin de la partie. Rien n'a donc besoin de circuler pendant le jeu.
 */
export function handAt(dealt: Card[], state: PlayState, player: PlayerId): Card[] {
  const posees = new Set(
    [...state.completed.flatMap((t) => t.plays), ...state.current]
      .filter((p) => p.player === player)
      .map((p) => p.card),
  )
  return dealt.filter((c) => !posees.has(c))
}

/** Le pli a-t-il été coupé ? Utile aux statistiques, pas au décompte. */
export function trickFlags(trick: CompletedTrick, trump: Atout): { cut: boolean; overcut: boolean } {
  if (!atoutCouleur(trump)) return { cut: false, overcut: false }
  const led = suitOf(trick.plays[0].card)
  if (led === trump) return { cut: false, overcut: false }
  const trumps = trick.plays.filter((p) => suitOf(p.card) === trump)
  return { cut: trumps.length > 0, overcut: trumps.length > 1 }
}

/**
 * BEL-1 — qui *détenait* la belote, déduit des cartes posées.
 *
 * ⚠️ Ne sert pas au décompte : une belote non annoncée est perdue (BEL-2).
 * Cette fonction existe pour les statistiques — savoir combien de belotes
 * ont été oubliées, et par qui.
 */
export function beloteHeld(state: PlayState, trump: Atout): PlayerId | null {
  if (!atoutCouleur(trump)) return null
  const plays = state.completed.flatMap((t) => t.plays)
  const king = plays.find((p) => p.card === `K${trump}`)
  const queen = plays.find((p) => p.card === `Q${trump}`)
  return king && queen && king.player === queen.player ? king.player : null
}

/**
 * BEL-2 — peut-on annoncer la belote en posant cette carte ?
 *
 * Il faut poser le Roi ou la Dame d'atout, et détenir (ou avoir déjà posé) l'autre.
 * L'annonce est un geste volontaire : oubliée, la belote ne compte pas.
 *
 * BEL-6 — sur la seconde tête, on n'annonce la rebelote que si la belote l'a été sur
 * la première (`dejaAnnoncee`) : sinon elle est déjà perdue, et le bouton trompait.
 */
export function canDeclareBelote(
  state: PlayState,
  player: PlayerId,
  card: Card,
  hand: Card[],
  trump: Atout,
  dejaAnnoncee: boolean,
): boolean {
  if (!atoutCouleur(trump)) return false
  const king = `K${trump}` as Card
  const queen = `Q${trump}` as Card
  if (card !== king && card !== queen) return false

  const other = card === king ? queen : king
  if (hand.includes(other)) return true
  const autrePosee = state.completed
    .flatMap((t) => t.plays)
    .concat(state.current)
    .some((p) => p.card === other && p.player === player)
  return autrePosee && dejaAnnoncee
}

/** Les plis dans le format attendu par `scoreDeal`. */
export const tricksForScoring = (state: PlayState): PlayedCard[][] =>
  state.completed.map((t) => toPlayedCards(t.plays, state.seating))
