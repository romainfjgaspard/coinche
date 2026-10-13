/**
 * Annuler sa dernière enchère, sur fausse manipulation (« 120 ♥ » au lieu de « 120 ♦ »).
 *
 * Le joueur la demande tant que le suivant n'a pas parlé ; les trois autres votent, et
 * l'enchère tombe si tous acceptent. Tout passe par le journal, qui reste append-only :
 * l'enchère n'est jamais effacée, un événement `bid_undone` dit qu'elle ne compte plus.
 * Pur : aucune dépendance à Firestore.
 */
import type { GameEvent } from './events'
import type { PlayerId } from './players'
import { currentDeal } from './replay'

export { withoutUndoneBids } from './replay'

export interface PendingUndo {
  /** Qui demande à reprendre son enchère */
  player: PlayerId
  /** L'enchère visée, par son numéro dans le journal */
  bidSeq: number
  /** Les réponses déjà données, par joueur */
  answers: Map<PlayerId, boolean>
}

/** La demande d'annulation en cours dans la donne, s'il y en a une. */
export function pendingUndo(events: GameEvent[]): PendingUndo | null {
  const deal = currentDeal(events)
  let pending: PendingUndo | null = null
  for (const e of deal) {
    if (e.type === 'undo_requested') pending = { player: e.player, bidSeq: e.bidSeq, answers: new Map() }
    else if (e.type === 'undo_answered' && pending && e.player === pending.player) {
      // Le demandeur retire sa demande : un autre joueur ne répondait pas.
      pending = null
    } else if (e.type === 'undo_answered' && pending) {
      pending.answers.set(e.player, e.accept)
      // Un seul refus suffit : la demande tombe.
      if (!e.accept) pending = null
    } else if (e.type === 'bid_undone' || e.type === 'contract_set' || e.type === 'deal_cancelled')
      pending = null
  }
  return pending
}

/** Les trois autres ont accepté : l'enchère peut tomber. */
export const undoAccepted = (p: PendingUndo): boolean =>
  p.answers.size >= 3 && [...p.answers.values()].every(Boolean)

/** Le dernier refus de la donne, pour le dire au demandeur : qui a refusé. */
export function lastRefusal(events: GameEvent[]): { player: PlayerId; by: PlayerId } | null {
  const deal = currentDeal(events)
  let request: PlayerId | null = null
  let refusal: { player: PlayerId; by: PlayerId } | null = null
  for (const e of deal) {
    if (e.type === 'undo_requested') {
      request = e.player
      refusal = null
    } else if (e.type === 'undo_answered' && request && !e.accept && e.player !== request) {
      refusal = { player: request, by: e.player }
    }
    // Une parole après le refus le rend caduc : la partie a continué.
    else if (e.type === 'bid' || e.type === 'coinche' || e.type === 'surcoinche') refusal = null
  }
  return refusal
}

/**
 * L'enchère que ce joueur peut demander à reprendre, par son numéro — ou null. Seulement
 * la sienne, seulement si c'est la toute dernière parole de la donne (le suivant n'a pas
 * parlé, personne n'a coinché), et une seule demande par enchère.
 */
export function undoableBid(events: GameEvent[], player: PlayerId): number | null {
  const deal = currentDeal(events)
  for (let i = deal.length - 1; i >= 0; i--) {
    const e = deal[i]
    if (e.type === 'undo_requested' || e.type === 'bid_undone' || e.type === 'contract_set') return null
    if (e.type === 'coinche' || e.type === 'surcoinche' || e.type === 'deal_cancelled') return null
    if (e.type === 'bid') return e.player === player ? e.seq : null
  }
  return null
}
