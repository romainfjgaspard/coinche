import { describe, expect, it } from 'vitest'
import { DECK, type Card, shuffle } from '../cards'
import { DEFAULT_SEATING, PLAYER_IDS } from '../players'
import type { GameEvent } from '../events'
import { applyPlayed, currentPlayer, newPlay, playableFor } from '../play'
import { deals, momentum, runningScores, tallies } from '../stats'
import { impassesOfGame } from '../impasses'
import { playFromEvents } from '../replay'

/** Journal synthétique : 16 donnes complètes, la taille d'une vraie partie. */
function journal(donnes: number): GameEvent[] {
  const events: GameEvent[] = [{ type: 'partie_creee', seating: DEFAULT_SEATING } as unknown as GameEvent]
  let graine = 42
  const rnd = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648

  for (let d = 1; d <= donnes; d++) {
    events.push({ type: 'donne_commencee', dealNumber: d, dealer: 'benel' } as GameEvent)
    events.push({
      type: 'contrat_fixe',
      taker: 'viv',
      value: 100,
      trump: 'h',
      multiplier: 1,
      capot: false,
      generale: false,
    } as GameEvent)
    const pile = shuffle([...DECK], rnd)
    const mains = new Map(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8) as Card[]]))
    let state = newPlay('h', 'romain', DEFAULT_SEATING)
    for (let i = 0; i < 32; i++) {
      const j = currentPlayer(state)!
      const main = mains.get(j)!
      const c = playableFor(state, j, main)[0]
      main.splice(main.indexOf(c), 1)
      events.push({
        type: 'carte_jouee',
        player: j,
        card: c,
        trickNumber: state.completed.length + 1,
      } as GameEvent)
      state = applyPlayed(state, j, c)
    }
    events.push({
      type: 'donne_terminee',
      dealNumber: d,
      status: 'reussi',
      cardPoints: [90, 72],
      compared: [90, 72],
      scores: [100, 0],
      beloteDeclaredBy: null,
      beloteForgottenBy: null,
      etoile: null,
    } as GameEvent)
  }
  return events
}

describe('coût du rejeu', () => {
  it('un rafraîchissement complet reste sous le millième de seconde par donne', () => {
    const events = journal(16)
    const t0 = performance.now()
    const tours = 50
    for (let i = 0; i < tours; i++) {
      const résumés = deals(events)
      runningScores(résumés)
      momentum(résumés)
      tallies(résumés, DEFAULT_SEATING)
      playFromEvents(events, 'benel', DEFAULT_SEATING)
      impassesOfGame(events, 'benel', DEFAULT_SEATING)
    }
    const ms = (performance.now() - t0) / tours
    console.log(`journal de ${events.length} événements · rafraîchissement complet : ${ms.toFixed(2)} ms`)
    expect(ms).toBeLessThan(50)
  })
})
