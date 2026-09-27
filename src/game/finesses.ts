/**
 * Les impasses — la règle maison.
 *
 * Une impasse est tentée quand un joueur garde l'as de la couleur entamée
 * alors que personne n'a encore coupé le pli : il préfère le sortir plus tard,
 * en espérant ramasser un dix. L'issue se lit au pli où l'as tombe enfin :
 * coupé, c'est raté ; s'il ramasse un dix, c'est réussi.
 *
 * Pur : se calcule depuis le seul journal, donc aussi bien en direct qu'après coup.
 */
import { type TrumpMode, type Card, type Suit, isTrump, rankOf, suitOf } from './cards'
import type { GameEvent } from './events'
import { type PlayerId, type Seating, nextPlayer } from './players'
import { type CompletedTrick, applyPlayed, newPlay } from './play'
import { dealerOf, seatingOf } from './replay'

export type FinesseResult = 'success' | 'failure' | 'none'

export interface Finesse {
  player: PlayerId
  /** La couleur de l'as gardé */
  suit: Suit
  /** Numéro du pli (1-8) où l'as a été gardé */
  keptUntil: number
  /** Numéro du pli où l'as est finalement tombé */
  leftAt: number
  result: FinesseResult
  dealNumber: number
}

export interface FinesseTally {
  tried: number
  made: number
  failed: number
}

const empty = (): FinesseTally => ({ tried: 0, made: 0, failed: 0 })

/**
 * Les impasses d'une donne, à partir de ses plis terminés.
 *
 * On ne sait qu'un joueur tenait l'as que parce qu'il le joue plus tard : une
 * impasse n'apparaît donc qu'au pli où l'as tombe. En direct, les chiffres se
 * complètent au fil des plis et sont définitifs à la fin de la donne.
 */
export function finessesOfTricks(tricks: CompletedTrick[], trump: TrumpMode, dealNumber = 0): Finesse[] {
  // Chacun joue à chaque pli : les joueurs de la donne se lisent dans les plis eux-mêmes.
  const remainingHands = new Map<PlayerId, Set<Card>>()
  for (const t of tricks) {
    for (const j of t.plays) {
      if (!remainingHands.has(j.player)) remainingHands.set(j.player, new Set<Card>())
      remainingHands.get(j.player)!.add(j.card)
    }
  }

  const out: Finesse[] = []
  const alreadySeen = new Set<string>()

  tricks.forEach((trick, i) => {
    const lead = suitOf(trick.plays[0].card)
    const masterSuit = lead === trump

    trick.plays.forEach((move, rank) => {
      const as = `A${lead}` as Card
      const wasCut = trick.plays.slice(0, rank).some((c) => isTrump(c.card, trump))
      const key = `${move.player}:${as}`

      if (
        rank > 0 &&
        !masterSuit &&
        !wasCut &&
        !alreadySeen.has(key) &&
        remainingHands.get(move.player)!.has(as) &&
        move.card !== as
      ) {
        alreadySeen.add(key)
        out.push({
          player: move.player,
          suit: lead,
          keptUntil: i + 1,
          leftAt: 0,
          result: 'none',
          dealNumber,
        })
      }
      remainingHands.get(move.player)!.delete(move.card)
    })
  })

  // L'issue : le pli où l'as tombe enfin
  for (const finesse of out) {
    const as = `A${finesse.suit}` as Card
    const index = tricks.findIndex(
      (t, i) => i >= finesse.keptUntil && t.plays.some((c) => c.player === finesse.player && c.card === as),
    )
    /* c8 ignore next — l'as figure dans `remainingHands`, donc il est forcément joué */
    if (index === -1) continue
    const trick = tricks[index]
    finesse.leftAt = index + 1
    if (trick.winner !== finesse.player) finesse.result = 'failure'
    else if (trick.plays.some((c) => c.player !== finesse.player && rankOf(c.card) === '10'))
      finesse.result = 'success'
    else finesse.result = 'none'
  }

  return out
}

/** Reconstruit chaque donne du journal et en extrait les impasses. */
export function finessesOfGame(events: GameEvent[], dealer: PlayerId, seating: Seating): Finesse[] {
  const out: Finesse[] = []

  const bounds: number[] = []
  events.forEach((e, i) => e.type === 'deal_started' && bounds.push(i))
  bounds.push(events.length)

  for (let b = 0; b < bounds.length - 1; b++) {
    const bucket = events.slice(bounds[b], bounds[b + 1])
    const opening = bucket[0]
    if (opening.type !== 'deal_started') continue
    const contract = bucket.find((e) => e.type === 'contract_set')
    if (!contract || contract.type !== 'contract_set') continue

    const spots = seatingOf(events.slice(0, bounds[b + 1]), seating)
    const dealDealer = dealerOf(bucket, dealer)
    const first = contract.generale ? contract.taker : nextPlayer(dealDealer, spots)
    let state = newPlay(contract.declaration === 'ta' ? 'ta' : contract.trump, first, spots)
    for (const e of bucket) {
      if (e.type !== 'card_played') continue
      try {
        state = applyPlayed(state, e.player, e.card)
      } catch {
        continue
      }
    }
    out.push(...finessesOfTricks(state.completed, contract.trump, opening.dealNumber))
  }
  return out
}

/** Le décompte par joueur, pour les tableaux. */
export function finesseTallies(list: Finesse[]): Map<PlayerId, FinesseTally> {
  const out = new Map<PlayerId, FinesseTally>()
  for (const finesse of list) {
    if (!out.has(finesse.player)) out.set(finesse.player, empty())
    const t = out.get(finesse.player)!
    t.tried += 1
    if (finesse.result === 'success') t.made += 1
    else if (finesse.result === 'failure') t.failed += 1
  }
  return out
}
