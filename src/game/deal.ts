/**
 * Calcul de la distribution — pur, sans Firestore.
 * DIS-1 : 3-2-3, en commençant par le joueur à gauche du donneur.
 */
import type { Card } from './cards'
import { type PlayerId, type Seating, playerAtSeat, seatOf } from './players'

export const DEAL_PATTERN = [3, 2, 3] as const
export const HAND_SIZE = DEAL_PATTERN.reduce((a, b) => a + b, 0) // 8

/** Ordre de service : le joueur à gauche du donneur reçoit en premier (MAT-2). */
export function dealingOrder(dealer: PlayerId, seating: Seating): PlayerId[] {
  return [1, 2, 3, 4].map((i) => playerAtSeat(seatOf(dealer, seating) + i, seating))
}

export function dealHands(
  pile: Card[],
  dealer: PlayerId,
  seating: Seating,
): Record<PlayerId, Card[]> {
  if (pile.length !== 32) throw new Error(`Paquet de ${pile.length} cartes, 32 attendues`)
  const order = dealingOrder(dealer, seating)
  const hands = Object.fromEntries(order.map((p) => [p, [] as Card[]])) as Record<PlayerId, Card[]>
  let i = 0
  for (const size of DEAL_PATTERN) {
    for (const p of order) {
      hands[p].push(...pile.slice(i, i + size))
      i += size
    }
  }
  return hands
}
