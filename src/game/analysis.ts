/**
 * L'analyse d'une donne jouée : à cartes ouvertes, le contrat était-il faisable, et si
 * oui, à quelle carte a-t-il échappé ?
 *
 * On rejoue la donne carte par carte ; avant et après chaque carte, le solveur dit ce que
 * l'équipe du preneur pouvait encore garantir. La première carte après laquelle ce n'est
 * plus assez est le tournant — et parmi les cartes permises à ce moment, on indique celle
 * qui gardait le contrat faisable.
 */
import type { TrumpMode, Card } from './cards'
import type { ReviewedDeal } from './review'
import { type PlayerId, type Seating, seatOf, teamOfPlayer } from './players'
import { LAST_TRICK_BONUS } from './scoring'
import { type Objective, legalMovesCards, solve } from './solver'

export interface Analysis {
  /** Donne non analysable (générale, donne blitz, mains inconnues) : pourquoi */
  impossible?: string
  target?: Objective
  /** Ce qu'il fallait : points de cartes (belote déduite), ou plis */
  required?: number
  /** Ce que l'équipe du preneur pouvait garantir dès la première carte */
  guaranteed?: number
  feasible?: boolean
  /** Belote du preneur comptée (+20) dans l'objectif */
  belote?: boolean
  /** La carte qui a fait échapper le contrat, et celle qui le gardait */
  turningPoint?: {
    trick: number
    player: PlayerId
    card: Card
    better: Card
    guaranteedBefore: number
    guaranteedAfter: number
  }
}

/** Qui, dans l'équipe du preneur, tient le Roi et la Dame d'atout : la belote compte. */
function takerBelote(deal: ReviewedDeal, seating: Seating, trump: TrumpMode): boolean {
  if (!deal.hands || !deal.contract || trump === null || trump === 'ta') return false
  const team = teamOfPlayer(deal.contract.taker, seating)
  return seating.some(
    (p) =>
      teamOfPlayer(p, seating) === team &&
      deal.hands![p].includes(`K${trump}` as Card) &&
      deal.hands![p].includes(`Q${trump}` as Card),
  )
}

export function analyzeDeal(deal: ReviewedDeal, seating: Seating): Analysis {
  const c = deal.contract
  if (!c) return { impossible: 'Aucun contrat sur cette donne.' }
  if (deal.blitz) return { impossible: 'Donne non jouée (blitz).' }
  if (!deal.hands) return { impossible: 'La donne n’est pas allée au bout.' }
  if (c.generale) return { impossible: 'Pas d’analyse pour une générale.' }
  const decl = c.declaration
  const trump: TrumpMode = decl === 'ta' ? 'ta' : decl === 'sa' ? null : decl
  if (!c.capot && (trump === null || trump === 'ta')) return { impossible: 'Contrat sans couleur d’atout.' }

  const team = teamOfPlayer(c.taker, seating)
  const target: Objective = c.capot ? 'tricks' : 'points'
  const belote = !c.capot && takerBelote(deal, seating, trump)
  const b = belote ? 20 : 0
  // Points de cartes à atteindre : la valeur annoncée, et plus que la défense (BEL-4).
  const required = c.capot ? 8 : Math.max(c.value - b, Math.floor((162 - b) / 2) + 1)

  // L'état au fil de la donne : mains restantes, pli en cours, ce qui est déjà acquis.
  const seat = (p: PlayerId) => seatOf(p, seating)
  const hands: Card[][] = seating.map((p) => [...deal.hands![p]])
  let trick: { seat: number; card: Card }[] = []
  let leader = seat(deal.tricks[0].cards[0].player)
  let banked = 0
  let tricksPlayed = 0
  const value = () => banked + solve({ hands, trick, leader, tricksPlayed, trump, team, target })

  const guaranteed = value()
  const feasible = guaranteed >= required
  const result: Analysis = { target, required, guaranteed, feasible, belote }
  if (!feasible) return result

  let before = guaranteed
  for (const p of deal.tricks) {
    for (const { player, card } of p.cards) {
      const s = seat(player)
      const legal = legalMovesCards(hands[s], trick, s, trump)
      hands[s] = hands[s].filter((x) => x !== card)
      trick = [...trick, { seat: s, card: card }]
      if (trick.length === 4) {
        // Le pli est complet : on le compte, et le gagnant entame le suivant.
        const winner = seat(p.winner)
        if ((winner & 1) === team) {
          banked += target === 'tricks' ? 1 : p.points + (p.number === 8 ? LAST_TRICK_BONUS : 0)
        }
        trick = []
        leader = winner
        tricksPlayed += 1
      }
      const after = trick.length === 0 && tricksPlayed === 8 ? banked : value()
      if (before >= required && after < required && teamOfPlayer(player, seating) === team) {
        // Le tournant : parmi les cartes permises, celle qui gardait le contrat faisable.
        result.turningPoint = {
          trick: p.number,
          player: player,
          card: card,
          guaranteedBefore: before,
          guaranteedAfter: after,
          better: bestCard(deal, seating, p.number, player, legal, trump, team, target) ?? card,
        }
        return result
      }
      before = after
    }
  }
  return result
}

/** Rejoue jusqu'au coup donné, essaie chaque carte permise, garde la meilleure. */
function bestCard(
  deal: ReviewedDeal,
  seating: Seating,
  trickNo: number,
  turnPlayer: PlayerId,
  legal: Card[],
  trump: TrumpMode,
  team: 0 | 1,
  target: Objective,
): Card | null {
  const seat = (p: PlayerId) => seatOf(p, seating)
  const hands: Card[][] = seating.map((p) => [...deal.hands![p]])
  let leader = seat(deal.tricks[0].cards[0].player)
  let tricksPlayed = 0
  let trick: { seat: number; card: Card }[] = []
  for (const p of deal.tricks) {
    for (const { player, card } of p.cards) {
      if (p.number === trickNo && player === turnPlayer) {
        let best: { card: Card; v: number } | null = null
        const s = seat(player)
        for (const attempt of legal) {
          const m2 = hands.map((m, i) => (i === s ? m.filter((x) => x !== attempt) : m))
          const trick2 = [...trick, { seat: s, card: attempt }]
          // Même position pour tous les essais : ce qui reste à gagner suffit à les comparer.
          const v = solve({ hands: m2, trick: trick2, leader, tricksPlayed, trump, team, target })
          if (!best || v > best.v) best = { card: attempt, v }
        }
        return best?.card ?? null
      }
      const s = seat(player)
      hands[s] = hands[s].filter((x) => x !== card)
      trick = [...trick, { seat: s, card: card }]
      if (trick.length === 4) {
        trick = []
        leader = seat(p.winner)
        tricksPlayed += 1
      }
    }
  }
  return null
}
