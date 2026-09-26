/**
 * Reconstruction de l'état à partir du seul journal.
 *
 * C'est la promesse du modèle de données : `games/{code}` n'est qu'une vue
 * matérialisée, et tout doit pouvoir se rejouer depuis `events/`. Si cette
 * fonction suffit à retrouver les enchères, l'analyse statistique le pourra aussi.
 */
import { type BiddingEntry, type BiddingState, newBidding, outcome } from './bidding'
import type { GameEvent } from './events'
import { type PlayerId, type Seating, nextPlayer } from './players'
import { type PlayState, applyPlayed, newPlay } from './play'

/**
 * Les événements de la donne en cours : tout ce qui suit la dernière distribution.
 * Sans ce découpage, la deuxième donne rejouerait les enchères et les cartes
 * de la première.
 */
export function currentDeal(events: GameEvent[]): GameEvent[] {
  const i = events.map((e) => e.type).lastIndexOf('deal_started')
  return i === -1 ? [] : events.slice(i)
}

/**
 * Le donneur de la donne rejouée vient de sa distribution, jamais du document de
 * partie : celui-ci a déjà tourné dès que la donne est terminée.
 */
export function dealerOf(events: GameEvent[], fallback: PlayerId): PlayerId {
  const e = currentDeal(events).find((x) => x.type === 'deal_started')
  return e && e.type === 'deal_started' ? e.dealer : fallback
}

/**
 * Le placement : celui de la création (« Rejouer »), ou le dernier choisi au salon. Il ne
 * change plus une fois la première donne distribuée.
 */
export function seatingOf(events: GameEvent[], fallback: Seating): Seating {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type === 'seating_set') return e.seating
    // `e.seating` manque tant que la table n'était pas complète : on retombe sur le placement connu
    if (e.type === 'game_created') return e.seating ?? fallback
  }
  return fallback
}

export function biddingFromEvents(events: GameEvent[], dealer: PlayerId, seating: Seating): BiddingState {
  const entries: BiddingEntry[] = []
  for (const e of currentDeal(events)) {
    if (e.type === 'bid') entries.push(e.entry)
    else if (e.type === 'coinche') entries.push({ kind: 'coinche', player: e.player })
    else if (e.type === 'surcoinche') entries.push({ kind: 'surcoinche', player: e.player })
  }
  return { ...newBidding(dealerOf(events, dealer), seatingOf(events, seating)), entries }
}

/** Numéro de tour d'enchère, pour les statistiques : qui parle au 1er tour, au 2e… */
export const bidRound = (state: BiddingState): number =>
  Math.floor(state.entries.filter((e) => e.kind !== 'coinche' && e.kind !== 'surcoinche').length / 4) + 1

/**
 * Rejoue le jeu de la carte depuis le journal.
 *
 * On ne revalide pas les coups : ils l'ont été à l'écriture, et le journal fait foi.
 * Aucune main n'est nécessaire — la suite des cartes posées suffit.
 */
export function playFromEvents(events: GameEvent[], dealer: PlayerId, seating: Seating): PlayState | null {
  const bidding = biddingFromEvents(events, dealer, seating)
  const result = outcome(bidding)
  if (result.status !== 'contract') return null

  const spots = seatingOf(events, seating)
  const first = result.generale ? result.taker : nextPlayer(dealerOf(events, dealer), spots)
  // Tout-atout : l'ordre de l'atout dans chaque couleur ; `trump` seul ne le distingue pas du sans-atout.
  let state = newPlay(result.declaration === 'ta' ? 'ta' : result.trump, first, spots)
  for (const e of currentDeal(events)) {
    if (e.type !== 'card_played') continue
    try {
      state = applyPlayed(state, e.player, e.card)
    } catch {
      // Un coup illégal a pu être écrit par deux clients simultanés. Le préfixe
      // valide fait foi : on ignore l'intrus plutôt que de bloquer toute la table.
      continue
    }
  }
  return state
}

/**
 * BEL-2 / BEL-6 — qui a régulièrement annoncé sa belote.
 *
 * Il faut avoir annoncé **aux deux cartes** : en posant le Roi, puis en posant la Dame.
 * Une seule des deux annonces ne suffit pas — la belote est alors perdue, comme si
 * on l'avait oubliée.
 */
export function declaredBelote(events: GameEvent[]): PlayerId | null {
  const counts = new Map<PlayerId, number>()
  for (const e of currentDeal(events)) {
    if (e.type !== 'belote_declared') continue
    counts.set(e.player, (counts.get(e.player) ?? 0) + 1)
  }
  for (const [player, n] of counts) if (n >= 2) return player
  return null
}

/** Combien de fois chacun a annoncé (belote, puis rebelote) dans la donne en cours. */
export function beloteDeclarations(events: GameEvent[]): Map<PlayerId, number> {
  const counts = new Map<PlayerId, number>()
  for (const e of currentDeal(events)) {
    if (e.type === 'belote_declared') counts.set(e.player, (counts.get(e.player) ?? 0) + 1)
  }
  return counts
}

/** DEC-8 — étoiles accumulées dans la partie, par joueur. */
export function starsInGame(events: GameEvent[]): Map<PlayerId, number> {
  const stars = new Map<PlayerId, number>()
  for (const e of events) {
    if (e.type !== 'deal_done' || !e.shameStar) continue
    stars.set(e.shameStar, (stars.get(e.shameStar) ?? 0) + 1)
  }
  return stars
}

/** DEC-9 — seuil de la honte complète. */
export const SHAME_THRESHOLD = 3
