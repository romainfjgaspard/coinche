/** Cartes, ordres et valeurs. Aucune dépendance : ce module est pur et testable seul. */

export const SUITS = ['s', 'h', 'd', 'c'] as const
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const

export type Suit = (typeof SUITS)[number]
export type Rank = (typeof RANKS)[number]

/** Identifiant compact et stable : '7s', '10h', 'Jd', 'Ac'. Sert aussi de clé en base. */
export type Card = `${Rank}${Suit}`

export const SUIT_LABELS: Record<Suit, string> = {
  s: '♠', h: '♥', d: '♦', c: '♣',
}

export const SUIT_NAMES: Record<Suit, string> = {
  s: 'Pique', h: 'Cœur', d: 'Carreau', c: 'Trèfle',
}

export const DECK: Card[] = SUITS.flatMap((s) => RANKS.map((r) => `${r}${s}` as Card))

export const suitOf = (card: Card): Suit => card.slice(-1) as Suit
export const rankOf = (card: Card): Rank => card.slice(0, -1) as Rank

/** ORD-1 — à l'atout : V > 9 > A > 10 > R > D > 8 > 7 */
const TRUMP_ORDER: Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7']
/** ORD-2 — hors atout : A > 10 > R > D > V > 9 > 8 > 7 */
const PLAIN_ORDER: Rank[] = ['A', '10', 'K', 'Q', 'J', '9', '8', '7']
const TRUMP_VALUES: Record<Rank, number> = {
  J: 20, '9': 14, A: 11, '10': 10, K: 4, Q: 3, '8': 0, '7': 0,
}
const PLAIN_VALUES: Record<Rank, number> = {
  A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0, '8': 0, '7': 0,
}

/** Force d'une carte dans son propre registre. Plus c'est haut, plus c'est fort. */
export function strength(card: Card, trump: Suit | null): number {
  const order = trump !== null && suitOf(card) === trump ? TRUMP_ORDER : PLAIN_ORDER
  return order.length - 1 - order.indexOf(rankOf(card))
}

export function value(card: Card, trump: Suit | null): number {
  const table = trump !== null && suitOf(card) === trump ? TRUMP_VALUES : PLAIN_VALUES
  return table[rankOf(card)]
}

export const isTrump = (card: Card, trump: Suit | null): boolean =>
  trump !== null && suitOf(card) === trump

/** Tri d'affichage : atout d'abord, puis couleurs, chaque couleur de la plus forte à la plus faible. */
export function sortHand(hand: Card[], trump: Suit | null): Card[] {
  const suitRank = (s: Suit) => (s === trump ? -1 : SUITS.indexOf(s))
  return [...hand].sort((a, b) => {
    const da = suitRank(suitOf(a)) - suitRank(suitOf(b))
    return da !== 0 ? da : strength(b, trump) - strength(a, trump)
  })
}

/**
 * DIS-2 — entre deux donnes on ne rebat pas : on ramasse les plis dans l'ordre où ils
 * ont été gagnés, puis on coupe. Les cartes restent groupées par pli, ce qui produit
 * les mains longues et les enchères hautes qu'on connaît aux cartes.
 */
export function gatherAndCut(tricks: Card[][], cutAt: number): Card[] {
  const pile = tricks.flat()
  const at = ((cutAt % pile.length) + pile.length) % pile.length
  return [...pile.slice(at), ...pile.slice(0, at)]
}

/** Mélange Fisher-Yates avec RNG injectable, pour que les tests soient déterministes. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
