import { describe, expect, it } from 'vitest'
import { tableLayout } from '../useTableLayout'

/** Les écrans sur lesquels la table a été vérifiée à l'œil. */
const ECRANS: [number, number][] = [
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

  it.each(ECRANS)('en %i×%i, chaque élément tient à sa place', (w, h) => {
    const l = tableLayout(w, h)
    // Un tapis réel, dans l'écran.
    expect(l.tapis.w).toBeGreaterThan(0)
    expect(l.tapis.h).toBeGreaterThan(0)
    expect(l.tapis.x + l.tapis.w).toBeLessThanOrEqual(w)
    // Le bandeau, puis le partenaire, puis le tapis, de haut en bas.
    expect(l.partnerY).toBeGreaterThanOrEqual(l.header)
    expect(l.tapis.y).toBeGreaterThan(l.partnerY)
    // Ma pastille entre le tapis et ma main, et ma main en bas de l'écran.
    const basTapis = l.tapis.y + l.tapis.h
    expect(l.meY).toBeGreaterThan(basTapis)
    expect(l.meY).toBeLessThan(h - l.handVisible)
    // Les adversaires à gauche du tapis, pas dessus.
    expect(l.sideX).toBeLessThan(l.tapis.x)
    // La main coupée en bas : on en voit une partie, pas toute.
    expect(l.handVisible).toBeLessThan(l.cardH)
  })

  it('le pli en croix tient dans le tapis sans chevaucher les coins', () => {
    for (const [w, h] of ECRANS) {
      const l = tableLayout(w, h)
      const trickH = Math.round(l.trickW * 1.44)
      // Hauteur de la croix : deux cartes et leur écart (voir trickPos).
      const hauteurPli = Math.round(trickH * 0.54) * 2 + trickH
      expect(hauteurPli).toBeLessThan(l.tapis.h - 2 * l.rim)
    }
  })
})
