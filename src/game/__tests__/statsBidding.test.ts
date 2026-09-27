import { describe, expect, it } from 'vitest'
import type { BiddingEntry } from '../bidding'
import type { GameEvent } from '../events'
import { DEFAULT_SEATING, type PlayerId } from '../players'
import {
  TIME_BOUNDS,
  addDistribution,
  bidGaps,
  averageBidOf,
  histogram,
  timeLabel,
  bidDistribution,
  takeRoles,
  timesByPlayer,
} from '../statsBidding'

// Placement par défaut : Romain et Viv contre Benel et Roux.
let seq = 0
const ev = (e: Record<string, unknown>): GameEvent => ({ ...e, seq: seq++, at: 0 }) as GameEvent
const deal = (n: number) => ev({ type: 'deal_started', dealNumber: n, dealer: 'roux', cut: 3 })
const said = (entry: BiddingEntry, thinkMs?: number) =>
  ev({
    type: 'bid',
    player: entry.player,
    round: 1,
    entry,
    ...(thinkMs !== undefined ? { thinkMs } : {}),
  })
const pass = (p: PlayerId) => said({ kind: 'pass', player: p })
const bid = (p: PlayerId, value: number, suit: 's' | 'h' | 'd' | 'c') =>
  said({ kind: 'contract', player: p, value, suit })
const contract = (
  taker: PlayerId,
  value: number,
  suit: 's' | 'h' | 'd' | 'c',
  extra: Record<string, unknown> = {},
) =>
  ev({
    type: 'contract_set',
    taker,
    value,
    trump: suit,
    declaration: suit,
    multiplier: 1,
    capot: false,
    generale: false,
    ...extra,
  })
const end = (status: string, compared: [number, number], extra: Record<string, unknown> = {}) =>
  ev({
    type: 'deal_done',
    dealNumber: 0,
    status,
    cardPoints: compared,
    compared,
    scores: [0, 0],
    beloteDeclaredBy: null,
    beloteForgottenBy: null,
    shameStar: null,
    ...extra,
  })

describe('lanceur, suiveur ou seul', () => {
  it("A 80♠, B 90♠, A 100♠ : A lance, B suit — les relances n'y changent rien", () => {
    const r = takeRoles(
      [
        deal(1),
        bid('romain', 80, 's'),
        pass('benel'),
        bid('viv', 90, 's'),
        pass('roux'),
        bid('romain', 100, 's'),
        pass('benel'),
        pass('viv'),
        pass('roux'),
        contract('romain', 100, 's'),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('romain')).toEqual({ opener: 1, follower: 0, alone: 0 })
    expect(r.get('viv')).toEqual({ opener: 0, follower: 1, alone: 0 })
  })

  it('le partenaire annonce une autre couleur : le preneur est seul dans la sienne', () => {
    const r = takeRoles(
      [
        deal(1),
        bid('romain', 80, 'h'),
        pass('benel'),
        bid('viv', 90, 's'),
        pass('roux'),
        pass('romain'),
        pass('benel'),
        pass('viv'),
        contract('viv', 90, 's'),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('viv')).toEqual({ opener: 0, follower: 0, alone: 1 })
    expect(r.get('romain')).toBeUndefined()
  })

  it('la couleur ouverte par un adversaire ne compte pas : on regarde son équipe', () => {
    const r = takeRoles(
      [
        deal(1),
        pass('romain'),
        bid('benel', 80, 's'),
        bid('viv', 90, 's'),
        pass('roux'),
        bid('romain', 100, 's'),
        pass('benel'),
        pass('viv'),
        pass('roux'),
        contract('romain', 100, 's'),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('viv')).toEqual({ opener: 1, follower: 0, alone: 0 })
    expect(r.get('romain')).toEqual({ opener: 0, follower: 1, alone: 0 })
    expect(r.get('benel')).toBeUndefined()
  })
})

describe('répartition des annonces', () => {
  it('compte chaque prise de parole, passes comprises', () => {
    const r = bidDistribution([
      deal(1),
      bid('romain', 80, 's'),
      pass('benel'),
      bid('viv', 90, 's'),
      pass('roux'),
      bid('romain', 100, 's'),
      pass('benel'),
      pass('viv'),
      pass('roux'),
      said({ kind: 'capot', player: 'romain', declaration: 's' }),
    ])
    expect(r.get('romain')).toEqual({ '80': 1, '100': 1, capot: 1 })
    expect(r.get('benel')).toEqual({ pass: 2 })
    expect(averageBidOf(r.get('romain')!)).toBe(90)
    expect(addDistribution({ pass: 1, '80': 2 }, { pass: 3 })).toEqual({ pass: 4, '80': 2 })
  })
})

describe("écart à l'annonce", () => {
  it("points faits moins l'annonce, séparés entre réussis et chutés ; capot à part", () => {
    const r = bidGaps(
      [
        deal(1),
        contract('romain', 100, 's'),
        end('made', [112, 50]),
        deal(2),
        contract('benel', 90, 'h'),
        end('down', [120, 42]),
        deal(3),
        contract('romain', 80, 'd'),
        end('made', [95, 67]),
        deal(4),
        contract('romain', 250, 's', { capot: true }),
        end('capot', [252, 0]),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('romain')).toEqual({ madeGaps: [12, 15], downs: [] })
    expect(r.get('benel')).toEqual({ madeGaps: [], downs: [-48] })
  })
})

describe('temps de réflexion', () => {
  it('garde chaque temps mesuré, en secondes, et en fait une distribution', () => {
    const t = timesByPlayer([deal(1), said({ kind: 'pass', player: 'viv' }, 1234), pass('roux')])
    expect(t.get('viv')).toEqual({ bids: [1.2], cards: [] })
    expect(t.get('roux')).toBeUndefined()
    const h = histogram([1, 1.5, 3, 25, 50], TIME_BOUNDS, timeLabel)
    expect(h.map((x) => x.count)).toEqual([2, 1, 0, 0, 1, 1])
    expect(h[0]).toMatchObject({ label: '< 2', share: 40 })
    expect(h.at(-1)!.label).toBe('> 40')
  })
})
