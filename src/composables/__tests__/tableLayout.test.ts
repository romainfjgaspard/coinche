import { describe, expect, it } from 'vitest'
import { tableLayout } from '../useTableLayout'

/** Les écrans sur lesquels la table a été vérifiée à l'œil. */
const SCREENS: [number, number][] = [
  [1366, 768],
  [1280, 800],
  [1920, 1080],
  [2560, 1215],
  [2560, 1440],
]

describe('géométrie de la table sur grand écran', () => {
  it('vaut exactement la maquette en 1920×1080', () => {
    const l = tableLayout(1920, 1080)
    expect(l.u).toBe(1)
    expect(l.t).toBe(1)
    expect(l.cardW).toBe(172)
    expect(l.cardH).toBe(248)
    expect(l.header).toBe(64)
  })

  it('ne laisse jamais les textes descendre sous 85 % en petit écran', () => {
    const l = tableLayout(1366, 768)
    expect(l.u).toBeCloseTo(0.711, 3)
    expect(l.t).toBe(0.85)
    expect(l.header).toBe(54)
  })

  it.each(SCREENS)('en %i×%i, chaque élément tient à sa place', (w, h) => {
    const l = tableLayout(w, h)
    // Un tapis réel, dans l'écran.
    expect(l.felt.w).toBeGreaterThan(0)
    expect(l.felt.h).toBeGreaterThan(0)
    expect(l.felt.x + l.felt.w).toBeLessThanOrEqual(w)
    // Le bandeau, puis le partenaire, puis le tapis, de haut en bas.
    expect(l.partnerY).toBeGreaterThanOrEqual(l.header)
    expect(l.felt.y).toBeGreaterThan(l.partnerY)
    // Ma pastille entre le tapis et ma main, et ma main en bas de l'écran.
    const feltBottom = l.felt.y + l.felt.h
    expect(l.meY).toBeGreaterThan(feltBottom)
    expect(l.meY).toBeLessThan(h - l.handVisible)
    // Les adversaires à gauche du tapis, pas dessus.
    expect(l.sideX).toBeLessThan(l.felt.x)
    // La main coupée en bas : on en voit une partie, pas toute.
    expect(l.handVisible).toBeLessThan(l.cardH)
  })

  it('le pli en croix tient dans le tapis sans chevaucher les coins', () => {
    for (const [w, h] of SCREENS) {
      const l = tableLayout(w, h)
      const trickH = Math.round(l.trickW * 1.44)
      // Hauteur de la croix : deux cartes et leur écart (voir trickPos).
      const trickHeight = Math.round(trickH * 0.54) * 2 + trickH
      expect(trickHeight).toBeLessThan(l.felt.h - 2 * l.rim)
    }
  })
})
