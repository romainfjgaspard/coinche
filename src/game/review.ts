/**
 * Revoir une donne après coup : les mains de départ, les huit plis, les points pli par
 * pli. Tout se relit dans le journal, sans rien lire d'autre en base.
 *
 * Les mains de départ se reconstituent à partir des cartes jouées : une fois les huit
 * plis posés, chacun a joué exactement ses huit cartes. Pas besoin des mains scellées
 * (`deals/{n}`), que les règles Firestore ne rendent lisibles qu'en fin de partie.
 */
import { type TrumpMode, type Card, sortHand } from './cards'
import type { GameEvent } from './events'
import type { Declaration } from './bidding'
import { type PlayerId, type Seating, teamOfPlayer } from './players'
import { LAST_TRICK_BONUS } from './scoring'

export interface ReviewedTrick {
  number: number
  /** Dans l'ordre de pose */
  cards: { player: PlayerId; card: Card }[]
  winner: PlayerId
  team: 0 | 1
  /** Points de cartes du pli, sans le dix de der */
  points: number
}

export interface ReviewedDeal {
  number: number
  dealer: PlayerId
  contract: {
    taker: PlayerId
    value: number
    declaration: Declaration | null
    capot: boolean
    generale: boolean
  } | null
  tricks: ReviewedTrick[]
  /** Chaque main telle que distribuée, triée ; seulement si la donne est allée au bout. */
  hands: Record<PlayerId, Card[]> | null
  /** L'équipe qui a pris le dernier pli, et donc le dix de der ; nulle avant la fin. */
  lastTrickTeam: 0 | 1 | null
  /** Donne marquée sans être jouée (blitz) */
  blitz: boolean
}

/** Les événements d'une donne, de sa distribution à la suivante. */
export function dealEventsOf(events: GameEvent[], number: number): GameEvent[] {
  const start = events.findIndex((e) => e.type === 'deal_started' && e.dealNumber === number)
  if (start === -1) return []
  const end = events.findIndex((e, i) => i > start && e.type === 'deal_started')
  return events.slice(start, end === -1 ? undefined : end)
}

export function reviewDeal(events: GameEvent[], number: number, seating: Seating): ReviewedDeal | null {
  const evts = dealEventsOf(events, number)
  const start = evts[0]
  if (!start || start.type !== 'deal_started') return null

  const fixedContract = evts.find((e) => e.type === 'contract_set')
  const contract =
    fixedContract && fixedContract.type === 'contract_set'
      ? {
          taker: fixedContract.taker,
          value: fixedContract.value,
          declaration: fixedContract.declaration ?? fixedContract.trump,
          capot: fixedContract.capot,
          generale: fixedContract.generale,
        }
      : null

  const placedCards = new Map<number, { player: PlayerId; card: Card; position: number }[]>()
  for (const e of evts) {
    if (e.type !== 'card_played') continue
    const trick = placedCards.get(e.trickNumber) ?? []
    trick.push({ player: e.player, card: e.card, position: e.position })
    placedCards.set(e.trickNumber, trick)
  }
  const tricks: ReviewedTrick[] = []
  for (const e of evts) {
    if (e.type !== 'trick_done') continue
    const cards = (placedCards.get(e.trickNumber) ?? [])
      .sort((a, b) => a.position - b.position)
      .map(({ player, card }) => ({ player, card }))
    tricks.push({
      number: e.trickNumber,
      cards,
      winner: e.winner,
      team: teamOfPlayer(e.winner, seating),
      points: e.points,
    })
  }

  const end = evts.find((e) => e.type === 'deal_done')
  const blitz = Boolean(end && end.type === 'deal_done' && end.blitz)
  const complete = tricks.length === 8

  let hands: Record<PlayerId, Card[]> | null = null
  if (complete) {
    const trump: TrumpMode =
      contract?.declaration === 'ta'
        ? 'ta'
        : contract?.declaration === 'sa'
          ? null
          : (contract?.declaration ?? null)
    hands = Object.fromEntries(
      seating.map((p) => [
        p,
        sortHand(
          tricks.flatMap((trick) => trick.cards.filter((c) => c.player === p).map((c) => c.card)),
          trump,
        ),
      ]),
    )
  }

  return {
    number,
    dealer: start.dealer,
    contract,
    tricks,
    hands,
    lastTrickTeam: complete ? tricks[7].team : null,
    blitz,
  }
}

/** Points de cartes faits par chaque équipe, dix de der compris : le détail du décompte. */
export function trickPoints2(deal: ReviewedDeal): [number, number] {
  const total: [number, number] = [0, 0]
  for (const trick of deal.tricks) total[trick.team] += trick.points
  if (deal.lastTrickTeam !== null) total[deal.lastTrickTeam] += LAST_TRICK_BONUS
  return total
}
