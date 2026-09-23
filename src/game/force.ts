/**
 * Force d'une main au moment de l'enchère — le barème validé le 23/09.
 *
 * Elle ne sert pas à jouer : elle sert à mesurer le panache, c'est-à-dire l'écart
 * entre ce qu'un joueur annonce et ce que le groupe annonce habituellement avec
 * une main comparable.
 */
import { type Card, SUITS, type Suit, rankOf, suitOf } from './cards'

export const BAREME = {
  atout: 1,
  valetAtout: 3,
  neufAtout: 2,
  asExterieur: 2,
  /** Par atout au-delà du quatrième */
  atoutSupplementaire: 1,
  chicane: 2,
} as const

export function forceMain(hand: Card[], trump: Suit | null): number {
  if (trump === null) return 0
  const atouts = hand.filter((c) => suitOf(c) === trump)

  let force = atouts.length * BAREME.atout
  if (atouts.some((c) => rankOf(c) === 'J')) force += BAREME.valetAtout
  if (atouts.some((c) => rankOf(c) === '9')) force += BAREME.neufAtout
  force += hand.filter((c) => rankOf(c) === 'A' && suitOf(c) !== trump).length * BAREME.asExterieur
  if (atouts.length > 4) force += (atouts.length - 4) * BAREME.atoutSupplementaire

  // Chicane : une couleur, hors atout, dont on n'a aucune carte
  const chicanes = SUITS.filter((s) => s !== trump && !hand.some((c) => suitOf(c) === s))
  force += chicanes.length * BAREME.chicane

  return force
}

/**
 * Les forces sont regroupées par bandes de trois points.
 *
 * À force exacte, chaque joueur se retrouverait souvent seul dans son groupe : la
 * médiane vaudrait sa propre annonce, et le panache serait nul pour tout le monde.
 */
export const LARGEUR_BANDE = 3
export const bandeDe = (force: number): number => Math.floor(force / LARGEUR_BANDE)

export interface PriseForce {
  joueur: string
  force: number
  value: number
}

const mediane = (valeurs: number[]): number => {
  const v = [...valeurs].sort((a, b) => a - b)
  const m = v.length
  return m % 2 ? v[(m - 1) / 2] : (v[m / 2 - 1] + v[m / 2]) / 2
}

/** Ce que le groupe annonce habituellement, par bande de force. */
export function habitudeDuGroupe(prises: PriseForce[]): Map<number, number> {
  const parBande = new Map<number, number[]>()
  for (const p of prises) {
    const b = bandeDe(p.force)
    const liste = parBande.get(b) ?? []
    liste.push(p.value)
    parBande.set(b, liste)
  }
  const out = new Map<number, number>()
  for (const [bande, valeurs] of parBande) out.set(bande, mediane(valeurs))
  return out
}

/**
 * Panache d'un joueur : écart moyen entre ce qu'il annonce et ce que **les autres**
 * annoncent avec une main comparable. Positif = plus audacieux qu'eux.
 *
 * L'habitude est calculée sans lui : se comparer à soi-même donnerait toujours zéro.
 */
export function panacheDe(joueur: string, prises: PriseForce[]): number | null {
  const siennes = prises.filter((p) => p.joueur === joueur)
  if (siennes.length === 0) return null

  const habitude = habitudeDuGroupe(prises.filter((p) => p.joueur !== joueur))
  const ecarts = siennes
    .map((p) => {
      const ref = habitude.get(bandeDe(p.force))
      return ref === undefined ? null : p.value - ref
    })
    .filter((e): e is number => e !== null)

  if (ecarts.length === 0) return null
  return Math.round((ecarts.reduce((s, e) => s + e, 0) / ecarts.length) * 10) / 10
}
