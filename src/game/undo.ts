/**
 * Annuler sa dernière enchère, sur fausse manipulation (« 120 ♥ » au lieu de « 120 ♦ »),
 * ou sa dernière carte (le 7 posé au lieu du 8).
 *
 * Le joueur la demande tant que personne n'a parlé ou joué après lui (des passes, pour une
 * enchère) ; les trois autres votent, et la parole tombe si tous acceptent. Tout passe par
 * le journal, qui reste append-only : rien n'est jamais effacé, un événement `bid_undone`
 * ou `card_undone` dit que la parole ne compte plus.
 * Pur : aucune dépendance à Firestore.
 */
import type { GameEvent } from './events'
import type { PlayerId } from './players'
import { currentDeal, withoutUndone } from './replay'

export { withoutUndone } from './replay'

export interface PendingUndo {
  /** Qui demande à reprendre son enchère */
  player: PlayerId
  /** L'enchère, la coinche ou la carte visée, par son numéro dans le journal */
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
    } else if (
      e.type === 'bid_undone' ||
      e.type === 'card_undone' ||
      e.type === 'contract_set' ||
      e.type === 'deal_cancelled' ||
      e.type === 'deal_done'
    )
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
    else if (e.type === 'bid' || e.type === 'coinche' || e.type === 'surcoinche' || e.type === 'card_played')
      refusal = null
  }
  return refusal
}

/**
 * L'enchère que ce joueur peut demander à reprendre, par son numéro — ou null. Seulement
 * la sienne, seulement si après elle il n'y a eu que des passes (ni enchère plus haute, ni
 * coinche), tant que les enchères sont ouvertes, et une seule demande par enchère. Sa
 * coinche aussi, tant que le preneur n'a pas répondu.
 * Accordée, l'annulation retire l'enchère et les passes qui la suivent.
 */
export function undoableBid(events: GameEvent[], player: PlayerId): number | null {
  const deal = currentDeal(events)
  const asked = new Set<number>()
  for (let i = deal.length - 1; i >= 0; i--) {
    const e = deal[i]
    if (e.type === 'bid_undone' || e.type === 'contract_set' || e.type === 'deal_cancelled') return null
    if (e.type === 'undo_requested') asked.add(e.bidSeq)
    // Une coinche par erreur se reprend aussi, tant que le preneur n'a pas répondu ; celle
    // d'un autre ferme la porte à mon enchère d'avant.
    if (e.type === 'coinche' || e.type === 'surcoinche')
      return e.player === player && !asked.has(e.seq) ? e.seq : null
    if (e.type !== 'bid') continue
    if (e.player === player) return asked.has(e.seq) ? null : e.seq
    // Un autre a parlé après moi : seule une passe laisse l'annulation possible.
    if (e.entry.kind !== 'pass') return null
  }
  return null
}

/**
 * La carte que ce joueur peut demander à reprendre, par son numéro — ou null. Seulement la
 * sienne, seulement la dernière posée sur le tapis : tant que le joueur suivant n'a pas
 * joué. La quatrième carte d'un pli se reprend aussi (le pli se rouvre), mais pas la
 * dernière de la donne : le décompte est déjà fait. Une seule demande par carte, et plus
 * rien à reprendre derrière une carte annulée — celui d'avant ne revient pas sur la sienne.
 */
export function undoableCard(events: GameEvent[], player: PlayerId): number | null {
  const deal = withoutUndone(currentDeal(events))
  if (deal.some((e) => e.type === 'deal_done')) return null
  if (deal.filter((e) => e.type === 'trick_done').length >= 8) return null
  const asked = new Set<number>()
  for (let i = deal.length - 1; i >= 0; i--) {
    const e = deal[i]
    if (e.type === 'card_undone' || e.type === 'contract_set') return null
    if (e.type === 'undo_requested') asked.add(e.bidSeq)
    if (e.type === 'card_played') return e.player === player && !asked.has(e.seq) ? e.seq : null
  }
  return null
}
