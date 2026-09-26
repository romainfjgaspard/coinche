import { describe, expect, it } from 'vitest'
import { type Card, DECK, sortHand } from '../cards'
import { dealHands } from '../deal'
import type { GameEvent } from '../events'
import { newPlay, play, playableFor } from '../play'
import { DEFAULT_SEATING, type PlayerId } from '../players'
import { dealEventsOf, trickPoints2, reviewDeal } from '../review'

/** Une donne jouée d'un bout à l'autre avec le vrai moteur, telle que le journal la garde. */
function dealPlayed(number: number, seq0: number): { events: GameEvent[]; hands: Record<PlayerId, Card[]> } {
  const hands = dealHands([...DECK], 'benel', DEFAULT_SEATING) as Record<PlayerId, Card[]>
  let seq = seq0
  const ev = (e: Record<string, unknown>) => ({ ...e, seq: seq++, at: 0 }) as GameEvent
  const events: GameEvent[] = [
    ev({ type: 'deal_started', dealNumber: number, dealer: 'benel', cut: 3 }),
    ev({
      type: 'contract_set',
      taker: 'viv',
      value: 80,
      trump: 's',
      declaration: 's',
      multiplier: 1,
      capot: false,
      generale: false,
    }),
  ]
  const handsLeft: Record<PlayerId, Card[]> = Object.fromEntries(
    Object.entries(hands).map(([p, m]) => [p, [...m]]),
  )
  let state = newPlay('s', 'viv', DEFAULT_SEATING)
  while (state.completed.length < 8) {
    const who =
      state.current.length === 0
        ? (state.completed.at(-1)?.winner ?? 'viv')
        : DEFAULT_SEATING[(DEFAULT_SEATING.indexOf(state.current.at(-1)!.player) + 1) % 4]
    const card = playableFor(state, who, handsLeft[who])[0]
    const before = state.completed.length
    events.push(
      ev({
        type: 'card_played',
        player: who,
        card: card,
        trickNumber: before + 1,
        position: state.current.length,
      }),
    )
    state = play(state, who, card, handsLeft[who])
    handsLeft[who] = handsLeft[who].filter((c) => c !== card)
    if (state.completed.length > before) {
      const trick = state.completed.at(-1)!
      events.push(
        ev({
          type: 'trick_done',
          trickNumber: before + 1,
          winner: trick.winner,
          cards: trick.plays.map((p) => p.card),
          points: trick.points,
          cut: false,
          overcut: false,
        }),
      )
    }
  }
  return { events, hands }
}

describe('revoir une donne', () => {
  const first = dealPlayed(1, 1)
  const second = dealPlayed(2, 100)
  const log = [...first.events, ...second.events]

  it("isole les événements d'une donne", () => {
    expect(dealEventsOf(log, 1)).toEqual(first.events)
    expect(dealEventsOf(log, 2)).toEqual(second.events)
    expect(dealEventsOf(log, 3)).toEqual([])
  })

  it('reconstitue les mains de départ à partir des cartes jouées', () => {
    const d = reviewDeal(log, 1, DEFAULT_SEATING)!
    for (const p of DEFAULT_SEATING) expect(d.hands![p]).toEqual(sortHand(first.hands[p], 's'))
  })

  it("rend les huit plis dans l'ordre, chacun avec ses quatre cartes", () => {
    const d = reviewDeal(log, 2, DEFAULT_SEATING)!
    expect(d.tricks.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    for (const trick of d.tricks) expect(trick.cards).toHaveLength(4)
    expect(d.contract).toMatchObject({ taker: 'viv', value: 80, declaration: 's' })
  })

  it('les points des plis et le dix de der font 162', () => {
    const d = reviewDeal(log, 1, DEFAULT_SEATING)!
    const [a, b] = trickPoints2(d)
    expect(a + b).toBe(162)
    expect(d.lastTrickTeam).toBe(d.tricks[7].team)
  })

  it("une donne inachevée n'a pas encore de mains à montrer", () => {
    const cutOff = first.events.slice(0, 10)
    const d = reviewDeal(cutOff, 1, DEFAULT_SEATING)!
    expect(d.hands).toBeNull()
    expect(d.lastTrickTeam).toBeNull()
  })
})
