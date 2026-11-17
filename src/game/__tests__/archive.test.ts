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

  it('compte les plis ramassés par chacun, et les plis joués', () => {
    const trick = (winner: string) => ev('trick_done', { winner, cards: [], points: 0 })
    const withTricks = buildArchive(
      'KDVA',
      [...EVENTS.slice(0, -1), trick('viv'), trick('viv'), trick('roux'), EVENTS.at(-1)!],
      DEFAULT_SEATING,
      HANDS,
    )
    expect(withTricks.tricksPlayed).toBe(3)
    expect(withTricks.players.viv.tricks).toBe(2)
    expect(withTricks.players.roux.tricks).toBe(1)
    expect(withTricks.players.benel.tricks).toBe(0)
  })
})

describe('le résumé des donnes et les coinches de désespoir', () => {
  // Objectif 100 pour aller vite. Viv (équipe 0) prend deux fois, Roux (équipe 1) coinche
  // les deux fois : la seconde, Viv gagnait la partie en faisant son contrat.
  const coinched = (n: number, at: number, value: number, scores: [number, number]): GameEvent[] => [
    ev('deal_started', { dealNumber: n, dealer: 'benel', at }),
    ev('bid', { player: 'viv', round: 1, entry: { kind: 'contract', player: 'viv', value, suit: 's' } }),
    ev('coinche', { player: 'roux' }),
    ev('contract_set', { taker: 'viv', value, trump: 's', multiplier: 2, capot: false, generale: false }),
    ev('deal_done', {
      dealNumber: n,
      status: 'made',
      cardPoints: [100, 62],
      compared: [100, 62],
      scores,
      beloteDeclaredBy: null,
      beloteForgottenBy: null,
      shameStar: null,
    }),
  ]
  const events: GameEvent[] = [
    ev('game_created', { seating: DEFAULT_SEATING }),
    ...coinched(1, 1000, 90, [180, 0]),
    ...coinched(2, 5000, 80, [160, 0]),
    ev('game_over', { scores: [340, 0], winner: 0, deals: 2, at: 9000 }),
  ]
  const a = buildArchive('DSPR', events, DEFAULT_SEATING, {}, [], 100)

  it('garde chaque donne : paroles, contrat, résultat, heure', () => {
    expect(a.dealLog).toHaveLength(2)
    expect(a.dealLog![0]).toMatchObject({ dealNumber: 1, at: 1000, taker: 'viv', value: 90, multiplier: 2 })
    expect(a.dealLog![0].bids).toEqual([
      { kind: 'contract', player: 'viv', value: 90, suit: 's' },
      { kind: 'coinche', player: 'roux' },
    ])
    expect(a.dealLog![1]).toMatchObject({ status: 'made', scores: [160, 0] })
  })

  it('date le début et la fin de la partie', () => {
    expect(a.startedAt).toBe(1000)
    expect(a.endedAt).toBe(9000)
  })

  it('met à part la coinche qui ne coûtait rien', () => {
    // Donne 1 : 0 + 90 ne dépasse pas 100, la coinche compte. Donne 2 : 180 + 80, si.
    expect(a.dealLog!.map((d) => d.desperate)).toEqual([false, true])
    expect(a.players.roux).toMatchObject({ coinches: 1, coinchesWon: 0, desperateCoinches: 1 })
  })
})
