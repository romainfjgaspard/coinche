import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../events'
import { DEFAULT_SEATING } from '../players'
import {
  addTiming,
  cascade,
  average,
  thinkTimes,
  balance,
  deals,
  dealsPlayed,
  averageBid,
  momentum,
  runningScores,
  tallies,
} from '../stats'

const ev = (type: string, extra: Record<string, unknown> = {}): GameEvent =>
  ({ type, seq: 0, at: 0, ...extra }) as GameEvent

/** Une donne complète : distribution, contrat, éventuelles coinches, décompte. */
function deal(opts: {
  n: number
  dealer?: string
  taker?: string
  value?: number
  status?: string
  scores?: [number, number]
  coinchers?: string[]
  belote?: string | null
  forgotten?: string | null
  shameStar?: string | null
}): GameEvent[] {
  const out: GameEvent[] = [ev('deal_started', { dealNumber: opts.n, dealer: opts.dealer ?? 'benel' })]
  if (opts.taker) {
    out.push(
      ev('contract_set', {
        taker: opts.taker,
        value: opts.value ?? 90,
        trump: 'h',
        multiplier: 1,
        capot: false,
        generale: false,
      }),
    )
  }
  for (const c of opts.coinchers ?? []) out.push(ev('coinche', { player: c }))
  if (opts.status) {
    out.push(
      ev('deal_done', {
        dealNumber: opts.n,
        status: opts.status,
        cardPoints: [81, 81],
        compared: [81, 81],
        scores: opts.scores ?? [0, 0],
        beloteDeclaredBy: opts.belote ?? null,
        beloteForgottenBy: opts.forgotten ?? null,
        shameStar: opts.shameStar ?? null,
      }),
    )
  }
  return out
}

// Placement par défaut : romain(0) · benel(1) · viv(2) · roux(3)
// Équipe 0 = Romain + Viv, équipe 1 = Benel + Roux
const GAME: GameEvent[] = [
  ev('game_created'),
  ...deal({ n: 1, taker: 'viv', value: 90, status: 'made', scores: [90, 0], belote: 'viv' }),
  ...deal({ n: 2, taker: 'roux', value: 100, status: 'down', scores: [100, 0], coinchers: ['romain'] }),
  ...deal({ n: 3, taker: 'benel', value: 110, status: 'made', scores: [0, 110], forgotten: 'benel' }),
  ...deal({ n: 4, taker: 'viv', value: 120, status: 'made', scores: [120, 0], shameStar: 'viv' }),
]

describe('découpage en donnes', () => {
  it('reconstitue chaque donne depuis le journal', () => {
    const list = deals(GAME)
    expect(list).toHaveLength(4)
    expect(list[0]).toMatchObject({ dealNumber: 1, taker: 'viv', value: 90, status: 'made' })
    expect(list[1].coinchers).toEqual(['romain'])
  })

  it('compte la donne en cours, encore sans résultat', () => {
    const list = deals([...GAME, ...deal({ n: 5, taker: 'romain' })])
    expect(list).toHaveLength(5)
    expect(list[4].status).toBeNull()
    expect(dealsPlayed(list)).toBe(4)
  })
})

describe('courbe de score', () => {
  it('cumule donne après donne, en partant de zéro', () => {
    const points = runningScores(deals(GAME))
    expect(points[0]).toEqual({ deal: 0, scores: [0, 0] })
    expect(points[points.length - 1].scores).toEqual([310, 110])
  })

  it('ignore la donne en cours', () => {
    const withBelote = runningScores(deals([...GAME, ...deal({ n: 5, taker: 'romain' })]))
    expect(withBelote[withBelote.length - 1].scores).toEqual([310, 110])
  })
})

describe('momentum', () => {
  it('donne une barre par donne, du côté de celui qui a marqué', () => {
    const barItems = momentum(deals(GAME))
    expect(barItems).toEqual([
      { deal: 1, team: 0, points: 90 },
      { deal: 2, team: 0, points: 100 },
      { deal: 3, team: 1, points: 110 },
      { deal: 4, team: 0, points: 120 },
    ])
  })
})

describe('compte par joueur', () => {
  const t = tallies(deals(GAME), DEFAULT_SEATING)

  it("sépare ce qu'un joueur rapporte de ce qu'il offre", () => {
    const viv = t.get('viv')!
    expect(viv).toMatchObject({ takes: 2, made: 2, downs: 0, scoredPoints: 210, conceded: 0 })
    expect(balance(viv)).toBe(210)

    // Roux a pris à 100 et chuté : les 100 sont allés à l'adversaire
    const roux = t.get('roux')!
    expect(roux).toMatchObject({ takes: 1, made: 0, downs: 1, scoredPoints: 0, conceded: 100 })
    expect(balance(roux)).toBe(-100)
  })

  it('moyenne les enchères de ses seules prises', () => {
    expect(averageBid(t.get('viv')!)).toBe(105)
    expect(averageBid(t.get('benel')!)).toBe(110)
    expect(averageBid(t.get('romain')!)).toBeNull()
  })

  it('relève les coinches, les belotes et les étoiles', () => {
    expect(t.get('romain')!.coinches).toBe(1)
    expect(t.get('viv')!.belotesDeclared).toBe(1)
    expect(t.get('benel')!.belotesForgotten).toBe(1)
    expect(t.get('viv')!.shameStars).toBe(1)
  })

  it('ne compte rien pour la donne en cours', () => {
    const withBelote = tallies(
      deals([...GAME, ...deal({ n: 5, taker: 'romain', value: 160 })]),
      DEFAULT_SEATING,
    )
    expect(withBelote.get('romain')!.takes).toBe(0)
  })
})

describe('momentum en cascade', () => {
  it('chaque barre part de la fin de la précédente', () => {
    const c = cascade(
      [
        { deal: 1, team: 0, points: 90 },
        { deal: 2, team: 1, points: 160 },
        { deal: 4, team: 0, points: 100 },
      ],
      0,
    )
    expect(c.map((b) => [b.before, b.after])).toEqual([
      [0, 90],
      [90, -70],
      [-70, 30],
    ])
    expect(c.map((b) => b.us)).toEqual([true, false, true])
  })

  it("se lit depuis l'autre camp en miroir", () => {
    const c = cascade([{ deal: 1, team: 0, points: 90 }], 1)
    expect(c[0]).toMatchObject({ before: 0, after: -90, us: false })
  })
})

describe('temps de réflexion', () => {
  const evs = [
    ev('bid', { player: 'viv', round: 1, entry: { kind: 'pass', player: 'viv' }, thinkMs: 4000 }),
    ev('bid', { player: 'roux', round: 1, entry: { kind: 'pass', player: 'roux' } }), // pas mesuré
    ev('coinche', { player: 'benel', thinkMs: 900 }), // hors tour : ignoré
    ev('card_played', { player: 'viv', card: 'As', trickNumber: 1, position: 0, thinkMs: 1000 }),
    ev('card_played', { player: 'viv', card: 'Ks', trickNumber: 2, position: 0, thinkMs: 3000 }),
  ]

  it('ne compte que les temps mesurés, annonces et cartes à part', () => {
    const r = thinkTimes(evs)
    expect(r.get('viv')).toEqual({
      bids: { total: 4000, n: 1, max: 4000 },
      cards: { total: 4000, n: 2, max: 3000 },
    })
    expect(r.has('roux')).toBe(false)
    expect(r.has('benel')).toBe(false)
    expect(average(r.get('viv')!.cards)).toBe(2000)
  })

  it("s'additionne d'une partie à l'autre", () => {
    const c = addTiming({ total: 4000, n: 2, max: 3000 }, { total: 500, n: 1, max: 500 })
    expect(c).toEqual({ total: 4500, n: 3, max: 3000 })
    expect(average({ total: 0, n: 0, max: 0 })).toBeNull()
  })
})
