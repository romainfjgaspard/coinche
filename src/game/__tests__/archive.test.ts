import { describe, expect, it } from 'vitest'
import type { Card } from '../cards'
import type { GameEvent } from '../events'
import { DEFAULT_SEATING } from '../players'
import { buildArchive } from '../archive'

const ev = (type: string, extra: Record<string, unknown> = {}): GameEvent =>
  ({ type, seq: 0, at: 0, ...extra }) as GameEvent

const deal = (
  n: number,
  taker: string,
  value: number,
  status: string,
  scores: [number, number],
  extra: Record<string, unknown> = {},
): GameEvent[] => [
  ev('deal_started', { dealNumber: n, dealer: 'benel' }),
  ev('contract_set', { taker, value, trump: 's', multiplier: 1, capot: false, generale: false }),
  ev('deal_done', {
    dealNumber: n,
    status,
    cardPoints: [81, 81],
    compared: [81, 81],
    scores,
    beloteDeclaredBy: null,
    beloteForgottenBy: null,
    shameStar: null,
    ...extra,
  }),
]

// Viv (équipe 0) prend deux fois, Roux (équipe 1) une fois et chute
const EVENTS: GameEvent[] = [
  ev('game_created', { seating: DEFAULT_SEATING }),
  ...deal(1, 'viv', 90, 'made', [90, 0]),
  ...deal(2, 'roux', 100, 'down', [100, 0], { shameStar: null }),
  ...deal(3, 'viv', 110, 'made', [110, 0], { beloteDeclaredBy: 'viv' }),
  ev('game_over', { scores: [300, 0], winner: 0, deals: 3 }),
]

// Mains distribuées, lues dans le document scellé
const HANDS: Record<number, Record<string, Card[]>> = {
  1: { viv: ['Js', '9s', 'As', '10s', '7h', '8h', '7d', '7c'] },
  2: { roux: ['7s', '8s', '7h', '8h', '9h', '7d', '8d', '7c'] },
  3: { viv: ['Js', '9s', 'As', 'Ks', 'Qs', 'Ah', '7d', '7c'] },
}

describe('archive de fin de partie', () => {
  const a = buildArchive('KDVA', EVENTS, DEFAULT_SEATING, HANDS)

  it('résume le résultat', () => {
    expect(a).toMatchObject({ code: 'KDVA', scores: [300, 0], winner: 0, deals: 3 })
    expect(a.seating).toEqual(DEFAULT_SEATING)
  })

  it("sépare ce que chacun rapporte de ce qu'il offre", () => {
    expect(a.players.viv).toMatchObject({ takes: 2, made: 2, scoredPoints: 200, conceded: 0 })
    expect(a.players.roux).toMatchObject({ takes: 1, downs: 1, scoredPoints: 0, conceded: 100 })
  })

  it('garde la force de main de chaque prise, pour le panache', () => {
    // Viv donne 1 : 4 atouts + valet 3 + neuf 2 = 9
    expect(a.players.viv.detail[0]).toMatchObject({ deal: 1, value: 90, strength: 9, isMade: true })
    // Viv donne 3 : 5 atouts + valet 3 + neuf 2 + as extérieur 2 + 5e atout 1 + chicane trèfle… non, trèfle présent
    expect(a.players.viv.detail[1].strength).toBeGreaterThan(a.players.viv.detail[0].strength!)
  })

  it("laisse la force indéfinie quand la main n'a pas pu être lue", () => {
    const noHands = buildArchive('KDVA', EVENTS, DEFAULT_SEATING, {})
    expect(noHands.players.viv.detail[0].strength).toBeNull()
  })

  it('relève belotes et joueurs sans prise', () => {
    expect(a.players.viv.belotesDeclared).toBe(1)
    expect(a.players.benel).toMatchObject({ takes: 0, scoredPoints: 0, detail: [] })
  })
})
