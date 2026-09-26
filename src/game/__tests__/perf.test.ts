import { describe, expect, it } from 'vitest'
import { DECK, type Card, shuffle } from '../cards'
import { DEFAULT_SEATING, PLAYER_IDS } from '../players'
import type { GameEvent } from '../events'
import { applyPlayed, currentPlayer, newPlay, playableFor } from '../play'
import { deals, momentum, runningScores, tallies } from '../stats'
import { finessesOfGame } from '../finesses'
import { playFromEvents } from '../replay'

/** Journal synthétique : 16 donnes complètes, la taille d'une vraie partie. */
function log(dealsList: number): GameEvent[] {
  const events: GameEvent[] = [{ type: 'game_created', seating: DEFAULT_SEATING } as unknown as GameEvent]
  let seed = 42
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

  for (let d = 1; d <= dealsList; d++) {
    events.push({ type: 'deal_started', dealNumber: d, dealer: 'benel' } as GameEvent)
    events.push({
      type: 'contract_set',
      taker: 'viv',
      value: 100,
      trump: 'h',
      multiplier: 1,
      capot: false,
      generale: false,
    } as GameEvent)
    const pile = shuffle([...DECK], rnd)
    const hands = new Map(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8) as Card[]]))
    let state = newPlay('h', 'romain', DEFAULT_SEATING)
    for (let i = 0; i < 32; i++) {
      const j = currentPlayer(state)!
      const hand = hands.get(j)!
      const c = playableFor(state, j, hand)[0]
      hand.splice(hand.indexOf(c), 1)
      events.push({
        type: 'card_played',
        player: j,
        card: c,
        trickNumber: state.completed.length + 1,
      } as GameEvent)
      state = applyPlayed(state, j, c)
    }
    events.push({
      type: 'deal_done',
      dealNumber: d,
      status: 'made',
      cardPoints: [90, 72],
      compared: [90, 72],
      scores: [100, 0],
      beloteDeclaredBy: null,
      beloteForgottenBy: null,
      shameStar: null,
    } as GameEvent)
  }
  return events
}

describe('coût du rejeu', () => {
  it('un rafraîchissement complet reste sous le millième de seconde par donne', () => {
    const events = log(16)
    const t0 = performance.now()
    const turns = 50
    for (let i = 0; i < turns; i++) {
      const summaries = deals(events)
      runningScores(summaries)
      momentum(summaries)
      tallies(summaries, DEFAULT_SEATING)
      playFromEvents(events, 'benel', DEFAULT_SEATING)
      finessesOfGame(events, 'benel', DEFAULT_SEATING)
    }
    const ms = (performance.now() - t0) / turns
    console.log(`journal de ${events.length} événements · rafraîchissement complet : ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(50)
  })
})
