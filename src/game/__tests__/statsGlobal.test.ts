import { describe, expect, it } from 'vitest'
import type { Archive, PlayerArchive } from '../archive'
import type { Seating } from '../players'
import {
  PAIRS,
  pairKey,
  duoStats,
  playersOf,
  playerStats,
  pairsPlayed,
  byTier,
  takesOf,
  globalSummary,
} from '../statsGlobal'

const empty = (): PlayerArchive => ({
  takes: 0,
  made: 0,
  downs: 0,
  scoredPoints: 0,
  conceded: 0,
  coinches: 0,
  belotesDeclared: 0,
  belotesForgotten: 0,
  shameStars: 0,
  finesses: 0,
  finessesWon: 0,
  finessesFailed: 0,
  detail: [],
})

function game(opts: {
  code: string
  seating: Seating
  scores: [number, number]
  deals?: number
  players?: Partial<Record<string, Partial<PlayerArchive>>>
}): Archive {
  const players: Archive['players'] = Object.fromEntries(opts.seating.map((p) => [p, empty()]))
  for (const [j, p] of Object.entries(opts.players ?? {})) {
    Object.assign(players[j as keyof typeof players], p)
  }
  return {
    code: opts.code,
    finishedAt: 0,
    seating: opts.seating,
    scores: opts.scores,
    winner: opts.scores[0] > opts.scores[1] ? 0 : 1,
    deals: opts.deals ?? 10,
    bots: [],
    players,
  }
}

// Deux placements différents : les duos changent d'une partie à l'autre
const A: Seating = ['romain', 'benel', 'viv', 'roux'] // Romain+Viv contre Benel+Roux
const B: Seating = ['romain', 'viv', 'roux', 'benel'] // Romain+Roux contre Viv+Benel

const ARCHIVES: Archive[] = [
  game({
    code: 'AAAA',
    seating: A,
    scores: [1010, 600],
    players: {
      viv: {
        takes: 3,
        made: 3,
        scoredPoints: 300,
        detail: [
          { deal: 1, value: 90, strength: 10, isMade: true, capot: false },
          { deal: 2, value: 110, strength: 14, isMade: true, capot: false },
          { deal: 3, value: 250, strength: 18, isMade: true, capot: true },
        ],
      },
      roux: {
        takes: 2,
        downs: 2,
        conceded: 200,
        shameStars: 1,
        detail: [
          { deal: 4, value: 120, strength: 8, isMade: false, capot: false },
          { deal: 5, value: 100, strength: 9, isMade: false, capot: false },
        ],
      },
    },
  }),
  game({
    code: 'BBBB',
    seating: B,
    scores: [400, 1010],
    players: {
      benel: {
        takes: 2,
        made: 1,
        downs: 1,
        scoredPoints: 90,
        conceded: 100,
        detail: [
          { deal: 1, value: 90, strength: 11, isMade: true, capot: false },
          { deal: 2, value: 100, strength: 9, isMade: false, capot: false },
        ],
      },
    },
  }),
]

describe('les six paires', () => {
  it('existent toutes, une seule fois chacune', () => {
    expect(PAIRS).toHaveLength(6)
    expect(new Set(PAIRS.map(pairKey)).size).toBe(6)
  })
})

describe('statistiques par duo', () => {
  const duos = duoStats(ARCHIVES)

  it('ne compte que les duos qui ont joué', () => {
    // Deux parties, deux placements : quatre paires ont joué
    expect(duos).toHaveLength(4)
  })

  it('attribue la victoire au bon camp', () => {
    const winner = duos.find((d) => pairKey(d.pair) === pairKey(['romain', 'viv']))!
    expect(winner).toMatchObject({ games: 1, won: 1 })
    const loser = duos.find((d) => pairKey(d.pair) === pairKey(['benel', 'roux']))!
    expect(loser).toMatchObject({ games: 1, won: 0 })
  })

  it('additionne les prises des deux joueurs de la paire', () => {
    const rv = duos.find((d) => pairKey(d.pair) === pairKey(['romain', 'viv']))!
    expect(rv.takes).toBe(3)
    expect(rv.scoredPoints).toBe(300)
  })

  it('retient le pire score, pas le meilleur', () => {
    const br = duos.find((d) => pairKey(d.pair) === pairKey(['benel', 'roux']))!
    expect(br.worstScore).toBe(600)
  })
})

describe('statistiques par joueur', () => {
  const players = playerStats(ARCHIVES)

  it('compte toutes les parties pour tout le monde', () => {
    for (const j of players) expect(j.games).toBe(2)
  })

  it('suit le camp du joueur, qui change de partie en partie', () => {
    // Romain gagne la première (équipe 0) et perd la seconde (équipe 0 aussi)
    const romain = players.find((j) => j.player === 'romain')!
    expect(romain.won).toBe(1)
    // Benel perd la première puis gagne la seconde
    const benel = players.find((j) => j.player === 'benel')!
    expect(benel.won).toBe(1)
  })

  it('mesure le panache : Roux annonce haut avec des mains faibles', () => {
    const roux = players.find((j) => j.player === 'roux')!
    const viv = players.find((j) => j.player === 'viv')!
    expect(roux.panache).not.toBeNull()
    expect(viv.panache).not.toBeNull()
    expect(roux.panache!).toBeGreaterThan(viv.panache!)
  })
})

describe('répartition par palier', () => {
  it('range chaque prise à son palier, capot compris', () => {
    const rows = byTier(ARCHIVES)
    const p90 = rows.find((l) => l.tier === 90)!
    expect(p90).toMatchObject({ madeGaps: 2, downs: 0 })
    const p100 = rows.find((l) => l.tier === 100)!
    expect(p100).toMatchObject({ madeGaps: 0, downs: 2 })
    expect(rows.find((l) => l.tier === 'capot')).toMatchObject({ madeGaps: 1, downs: 0 })
  })

  it('se restreint à un joueur', () => {
    const rows = byTier(ARCHIVES, ['roux'])
    expect(rows.reduce((s, l) => s + l.madeGaps + l.downs, 0)).toBe(2)
  })
})

describe('nuage force × annonce', () => {
  it("rassemble les prises d'un joueur dont on connaît la main", () => {
    expect(takesOf(ARCHIVES, 'viv')).toHaveLength(3)
    expect(takesOf(ARCHIVES, 'romain')).toHaveLength(0)
  })
})

describe('au-delà des quatre du départ', () => {
  // Jean remplace Roux le temps d'une partie
  const C: Seating = ['romain', 'benel', 'viv', 'jean']
  const WITH_JEAN = [
    ...ARCHIVES,
    game({
      code: 'CCCC',
      seating: C,
      scores: [1020, 300],
      players: {
        jean: {
          takes: 1,
          downs: 1,
          conceded: 160,
          detail: [{ deal: 1, value: 80, strength: 6, isMade: false, capot: false }],
        },
      },
    }),
  ]

  it('liste les quatre du départ puis les nouveaux', () => {
    expect(playersOf(WITH_JEAN)).toEqual(['benel', 'roux', 'viv', 'romain', 'jean'])
  })

  it("ne compte à chacun que les parties qu'il a jouées", () => {
    const j = playerStats(WITH_JEAN)
    expect(j.find((x) => x.player === 'jean')).toMatchObject({ games: 1, won: 0, takes: 1, downs: 1 })
    expect(j.find((x) => x.player === 'roux')!.games).toBe(2)
    expect(j.find((x) => x.player === 'romain')!.games).toBe(3)
  })

  it('un duo garde la trace de chaque paire affrontée', () => {
    const rv = duoStats(WITH_JEAN).find((d) => pairKey(d.pair) === pairKey(['romain', 'viv']))!
    expect(rv.games).toBe(2)
    expect(rv.against.map(pairKey).sort()).toEqual(
      [pairKey(['benel', 'jean']), pairKey(['benel', 'roux'])].sort(),
    )
  })

  it('ne propose que les paires qui ont joué ensemble', () => {
    const keys = pairsPlayed(WITH_JEAN).map(pairKey)
    expect(keys).toContain(pairKey(['benel', 'jean']))
    expect(keys).not.toContain(pairKey(['jean', 'roux']))
  })

  it('les paliers et le résumé tiennent compte du nouveau', () => {
    expect(byTier(WITH_JEAN, ['jean']).find((l) => l.tier === 80)).toMatchObject({
      madeGaps: 0,
      downs: 1,
    })
    expect(globalSummary(WITH_JEAN).takes).toBe(8)
  })
})

describe('bots regroupés, soirées, enchères et temps', () => {
  it("deux « Bot » d'une même partie n'en font qu'un, avec leurs chiffres additionnés", async () => {
    const { groupBots, playersOf: jd } = await import('../statsGlobal')
    const a = game({
      code: 'BOTS',
      seating: ['romain', 'bot-basic-1', 'bot-expert-1', 'bot-basic-2'],
      scores: [1000, 500],
      players: {
        'bot-basic-1': { takes: 2, calls: { pass: 3, '80': 1 } },
        'bot-basic-2': { takes: 1, calls: { pass: 2 } },
      },
    })
    const [r] = groupBots([{ ...a, bots: ['bot-basic-1', 'bot-expert-1', 'bot-basic-2'] }])
    expect(r.seating).toEqual(['romain', 'bot-basic', 'bot-expert', 'bot-basic'])
    expect(r.bots.sort()).toEqual(['bot-basic', 'bot-expert'])
    expect(r.players['bot-basic']).toMatchObject({ takes: 3, calls: { pass: 5, '80': 1 } })
    expect(jd([r])).toEqual(['romain', 'bot-basic', 'bot-expert'])
  })

  it('deux « Bot » partenaires : les chiffres de leur duo ne sont pas comptés deux fois', async () => {
    const { groupBots, duoStats: ds } = await import('../statsGlobal')
    const a = game({
      code: 'DUO',
      seating: ['romain', 'bot-basic-1', 'viv', 'bot-basic-2'],
      scores: [500, 1000],
      players: { 'bot-basic-1': { takes: 2 }, 'bot-basic-2': { takes: 1 } },
    })
    const [r] = groupBots([{ ...a, bots: ['bot-basic-1', 'bot-basic-2'] }])
    const duo = ds([r]).find((d) => d.pair.every((p) => p === 'bot-basic'))!
    expect(duo.takes).toBe(3)
  })

  it("les soirées réunissent les parties enchaînées, les plus récentes d'abord", async () => {
    const { evenings } = await import('../statsGlobal')
    const x = (code: string, evening: string | undefined, finishedAt: number, scores: [number, number]) => ({
      ...game({ code, seating: A, scores }),
      finishedAt,
      ...(evening ? { evening } : {}),
    })
    const s = evenings([
      x('P1', 'P1', 10, [1000, 0]),
      x('P2', 'P1', 20, [0, 1000]),
      x('P3', 'P1', 30, [1000, 0]),
      x('Q1', undefined, 100, [0, 1000]),
    ])
    expect(s.map((v) => v.key)).toEqual(['Q1', 'P1'])
    expect(s[1].games.map((p) => p.code)).toEqual(['P1', 'P2', 'P3'])
    expect(s[1].victories[0]).toMatchObject({ won: 2 })
  })

  it("additionne rôles, écarts et temps d'une partie à l'autre", async () => {
    const { globalRoles, globalGaps, globalTimes, globalCalls } = await import('../statsGlobal')
    const arch = [
      game({
        code: 'R1',
        seating: A,
        scores: [1000, 0],
        players: {
          romain: {
            roles: { opener: 1, follower: 0, alone: 2 },
            gaps: { madeGaps: [10], downs: [] },
            times: { bids: [1.2], cards: [3] },
            calls: { '90': 1 },
          },
        },
      }),
      game({
        code: 'R2',
        seating: A,
        scores: [1000, 0],
        players: {
          romain: {
            roles: { opener: 2, follower: 1, alone: 0 },
            gaps: { madeGaps: [], downs: [-20] },
            times: { bids: [4], cards: [] },
            calls: { '90': 2, pass: 1 },
          },
        },
      }),
    ]
    expect(globalRoles(arch).get('romain')).toEqual({ opener: 3, follower: 1, alone: 2 })
    expect(globalGaps(arch).get('romain')).toEqual({ madeGaps: [10], downs: [-20] })
    expect(globalTimes(arch).get('romain')).toEqual({ bids: [1.2, 4], cards: [3] })
    expect(globalCalls(arch).get('romain')).toEqual({ '90': 3, pass: 1 })
    expect(globalRoles(arch).get('viv')).toBeUndefined()
  })
})
