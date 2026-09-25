import { describe, expect, it } from 'vitest'
import { type Atout, type Card, DECK, isTrump, strength, value } from '../cards'
import { type PlayedCard, playableCards, trickPoints, trickWinner } from '../trick'
import { coupsPermisCartes, resoudre } from '../solveur'

/** Un générateur déterministe : les échecs se rejouent à l'identique. */
function hasard(graine: number): () => number {
  let g = graine
  return () => {
    g = (g * 16807) % 2147483647
    return g / 2147483647
  }
}
function distribuer(r: () => number): Card[][] {
  const p = [...DECK]
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  return [p.slice(0, 8), p.slice(8, 16), p.slice(16, 24), p.slice(24, 32)]
}
const ATOUTS: Atout[] = ['s', 'h', 'd', 'c', 'ta', null]

describe('solveur : les mêmes coups que le moteur', () => {
  it("sur 2000 positions tirées au hasard, à toutes les couleurs d'atout", () => {
    const r = hasard(42)
    for (let n = 0; n < 2000; n++) {
      const trump = ATOUTS[n % ATOUTS.length]
      const mains = distribuer(r)
      const entameur = Math.floor(r() * 4)
      const pli: PlayedCard[] = []
      const k = Math.floor(r() * 4)
      for (let i = 0; i < k; i++) {
        const s = (entameur + i) % 4
        const permis = playableCards(mains[s], pli, trump, s)
        const c = permis[Math.floor(r() * permis.length)]
        mains[s] = mains[s].filter((x) => x !== c)
        pli.push({ seat: s, card: c })
      }
      const s = (entameur + k) % 4
      const moteur = playableCards(mains[s], pli, trump, s).sort()
      const solveur = coupsPermisCartes(
        mains[s],
        pli.map((x) => ({ siege: x.seat, carte: x.card })),
        s,
        trump,
      ).sort()
      expect(solveur, `position ${n}`).toEqual(moteur)
    }
  })
})

/** Minimax sans aucune astuce, avec les fonctions du moteur : la référence. */
function forceBrute(
  mains: Card[][],
  pli: PlayedCard[],
  entameur: number,
  plisRestants: number,
  trump: Atout,
  equipe: number,
): number {
  if (plisRestants === 0) return 0
  const s = (entameur + pli.length) % 4
  const permis = playableCards(mains[s], pli, trump, s)
  const scores = permis.map((c) => {
    const m2 = mains.map((m, i) => (i === s ? m.filter((x) => x !== c) : m))
    const pli2 = [...pli, { seat: s, card: c }]
    if (pli2.length < 4) return forceBrute(m2, pli2, entameur, plisRestants, trump, equipe)
    const g = trickWinner(pli2, trump)
    const gain = (g & 1) === equipe ? trickPoints(pli2, trump) + (plisRestants === 1 ? 10 : 0) : 0
    return gain + forceBrute(m2, [], g, plisRestants - 1, trump, equipe)
  })
  return (s & 1) === equipe ? Math.max(...scores) : Math.min(...scores)
}

describe('solveur : la valeur exacte', () => {
  it('égale la force brute sur des fins de donne de trois plis', () => {
    const r = hasard(7)
    for (let n = 0; n < 60; n++) {
      const trump = ATOUTS[n % 5] // pas le sans-atout, jamais joué aux points
      const mains = distribuer(r).map((m) => m.slice(0, 3))
      const entameur = n % 4
      const equipe = n % 2
      const attendu = forceBrute(mains, [], entameur, 3, trump, equipe)
      const obtenu = resoudre({
        mains,
        pli: [],
        entameur,
        plisJoues: 5,
        trump,
        equipe: equipe as 0 | 1,
        objectif: 'points',
      })
      expect(obtenu, `fin de donne ${n}`).toBe(attendu)
    }
  })

  it('une donne entière se résout en quelques secondes, et les deux camps se partagent 162 points', () => {
    const r = hasard(2026)
    const debut = Date.now()
    for (let n = 0; n < 3; n++) {
      const mains = distribuer(r)
      const pour = resoudre({
        mains,
        pli: [],
        entameur: 0,
        plisJoues: 0,
        trump: 's',
        equipe: 0,
        objectif: 'points',
      })
      const contre = resoudre({
        mains,
        pli: [],
        entameur: 0,
        plisJoues: 0,
        trump: 's',
        equipe: 1,
        objectif: 'points',
      })
      // Jeu à somme nulle : ce que l'une garantit, l'autre le concède exactement.
      expect(pour + contre).toBe(162)
      expect(pour).toBeGreaterThanOrEqual(0)
    }
    const ms = Date.now() - debut
    console.log(`3 donnes entières (×2) : ${ms} ms`)
    expect(ms).toBeLessThan(60_000)
    void isTrump
    void strength
    void value
  }, 120_000)
})
