/**
 * Force d'une main au moment de l'enchère — le barème validé le 23/09.
 *
 * Elle ne sert pas à jouer : elle sert à mesurer le panache, c'est-à-dire l'écart
 * entre ce qu'un joueur annonce et ce que le groupe annonce habituellement avec
 * une main comparable.
 */
import { type Card, SUITS, type Suit, rankOf, suitOf } from './cards'

export const SCALE = {
  trump: 1,
  trumpJack: 3,
  trumpNine: 2,
  sideAce: 2,
  /** Par atout au-delà du quatrième */
  extraTrump: 1,
  void: 2,
} as const

export function handStrength(hand: Card[], trump: Suit | null): number {
  if (trump === null) return 0
  const trumps = hand.filter((c) => suitOf(c) === trump)

  let strength = trumps.length * SCALE.trump
  if (trumps.some((c) => rankOf(c) === 'J')) strength += SCALE.trumpJack
  if (trumps.some((c) => rankOf(c) === '9')) strength += SCALE.trumpNine
  strength += hand.filter((c) => rankOf(c) === 'A' && suitOf(c) !== trump).length * SCALE.sideAce
  if (trumps.length > 4) strength += (trumps.length - 4) * SCALE.extraTrump

  // Chicane : une couleur, hors atout, dont on n'a aucune carte
  const voids = SUITS.filter((s) => s !== trump && !hand.some((c) => suitOf(c) === s))
  strength += voids.length * SCALE.void

  return strength
}

/**
 * Les forces sont regroupées par bandes de trois points.
 *
 * À force exacte, chaque joueur se retrouverait souvent seul dans son groupe : la
 * médiane vaudrait sa propre annonce, et le panache serait nul pour tout le monde.
 */
export const BAND_WIDTH = 3
export const bandOf = (strength: number): number => Math.floor(strength / BAND_WIDTH)

export interface TakeStrength {
  player: string
  strength: number
  value: number
}

const median = (values: number[]): number => {
  const v = [...values].sort((a, b) => a - b)
  const m = v.length
  return m % 2 ? v[(m - 1) / 2] : (v[m / 2 - 1] + v[m / 2]) / 2
}

/** Ce que le groupe annonce habituellement, par bande de force. */
export function groupHabit(takes: TakeStrength[]): Map<number, number> {
  const byBand = new Map<number, number[]>()
  for (const p of takes) {
    const b = bandOf(p.strength)
    const list = byBand.get(b) ?? []
    list.push(p.value)
    byBand.set(b, list)
  }
  const out = new Map<number, number>()
  for (const [bandIndex, values] of byBand) out.set(bandIndex, median(values))
  return out
}

/**
 * Panache d'un joueur : écart moyen entre ce qu'il annonce et ce que **les autres**
 * annoncent avec une main comparable. Positif = plus audacieux qu'eux.
 *
 * L'habitude est calculée sans lui : se comparer à soi-même donnerait toujours zéro.
 */
export function panacheOf(player: string, takes: TakeStrength[]): number | null {
  const theirs = takes.filter((p) => p.player === player)
  if (theirs.length === 0) return null

  const habit = groupHabit(takes.filter((p) => p.player !== player))
  const gaps = theirs
    .map((p) => {
      const ref = habit.get(bandOf(p.strength))
      return ref === undefined ? null : p.value - ref
    })
    .filter((e): e is number => e !== null)

  if (gaps.length === 0) return null
  return Math.round((gaps.reduce((s, e) => s + e, 0) / gaps.length) * 10) / 10
}
