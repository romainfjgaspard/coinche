import { describe, expect, it } from 'vitest'
import { type TrumpMode, type Card, DECK, isTrump, strength, value } from '../cards'
import { type PlayedCard, playableCards, trickPoints, trickWinner } from '../trick'
import { legalMovesCards, solve } from '../solver'

/** Un générateur déterministe : les échecs se rejouent à l'identique. */
function random(seed: number): () => number {
  let g = seed
  return () => {
    g = (g * 16807) % 2147483647
    return g / 2147483647
  }
}
function dealIt(r: () => number): Card[][] {
  const p = [...DECK]
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  return [p.slice(0, 8), p.slice(8, 16), p.slice(16, 24), p.slice(24, 32)]
}
const TRUMP_SUITS: TrumpMode[] = ['s', 'h', 'd', 'c', 'ta', null]

describe('solveur : les mêmes coups que le moteur', () => {
  it("sur 2000 positions tirées au hasard, à toutes les couleurs d'atout", () => {
    const r = random(42)
    for (let n = 0; n < 2000; n++) {
      const trump = TRUMP_SUITS[n % TRUMP_SUITS.length]
      const hands = dealIt(r)
      const leader = Math.floor(r() * 4)
      const trick: PlayedCard[] = []
      const k = Math.floor(r() * 4)
      for (let i = 0; i < k; i++) {
        const s = (leader + i) % 4
        const legal = playableCards(hands[s], trick, trump, s)
        const c = legal[Math.floor(r() * legal.length)]
        hands[s] = hands[s].filter((x) => x !== c)
        trick.push({ seat: s, card: c })
      }
      const s = (leader + k) % 4
      const engine = playableCards(hands[s], trick, trump, s).sort()
      const solver = legalMovesCards(
        hands[s],
        trick.map((x) => ({ seat: x.seat, card: x.card })),
        s,
        trump,
      ).sort()
      expect(solver, `position ${n}`).toEqual(engine)
    }
  })
})

/** Minimax sans aucune astuce, avec les fonctions du moteur : la référence. */
function rawStrength(
  hands: Card[][],
  trick: PlayedCard[],
  leader: number,
  tricksLeft: number,
  trump: TrumpMode,
  team: number,
): number {
  if (tricksLeft === 0) return 0
  const s = (leader + trick.length) % 4
  const legal = playableCards(hands[s], trick, trump, s)
  const scores = legal.map((c) => {
    const m2 = hands.map((m, i) => (i === s ? m.filter((x) => x !== c) : m))
    const trick2 = [...trick, { seat: s, card: c }]
    if (trick2.length < 4) return rawStrength(m2, trick2, leader, tricksLeft, trump, team)
    const g = trickWinner(trick2, trump)
    const gain = (g & 1) === team ? trickPoints(trick2, trump) + (tricksLeft === 1 ? 10 : 0) : 0
    return gain + rawStrength(m2, [], g, tricksLeft - 1, trump, team)
  })
  return (s & 1) === team ? Math.max(...scores) : Math.min(...scores)
}

describe('solveur : la valeur exacte', () => {
  it('égale la force brute sur des fins de donne de trois plis', () => {
    const r = random(7)
    for (let n = 0; n < 60; n++) {
      const trump = TRUMP_SUITS[n % 5] // pas le sans-atout, jamais joué aux points
      const hands = dealIt(r).map((m) => m.slice(0, 3))
      const leader = n % 4
      const team = n % 2
      const expected = rawStrength(hands, [], leader, 3, trump, team)
      const obtained = solve({
        hands,
        trick: [],
        leader,
        tricksPlayed: 5,
        trump,
        team: team as 0 | 1,
        target: 'points',
      })
      expect(obtained, `fin de donne ${n}`).toBe(expected)
    }
  })

  it('une donne entière se résout en quelques secondes, et les deux camps se partagent 162 points', () => {
    const r = random(2026)
    const start = Date.now()
    for (let n = 0; n < 3; n++) {
      const hands = dealIt(r)
      const tallyFor = solve({
        hands,
        trick: [],
        leader: 0,
        tricksPlayed: 0,
        trump: 's',
        team: 0,
        target: 'points',
      })
      const against = solve({
        hands,
        trick: [],
        leader: 0,
        tricksPlayed: 0,
        trump: 's',
        team: 1,
        target: 'points',
      })
      // Jeu à somme nulle : ce que l'une garantit, l'autre le concède exactement.
      expect(tallyFor + against).toBe(162)
      expect(tallyFor).toBeGreaterThanOrEqual(0)
    }
    const ms = Date.now() - start
    console.log(`3 donnes entières (×2) : ${ms} ms`)
    expect(ms).toBeLessThan(60_000)
    void isTrump
    void strength
    void value
  }, 120_000)
})
