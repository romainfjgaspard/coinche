import { describe, expect, it } from 'vitest'
import { DECK } from '../cards'
import { RANK_LABEL, cardLabel, courtImage, isCourt, isRed, pipLayout } from '../display'

describe('index à la française', () => {
  it("l'as porte un 1, les figures V, D et R", () => {
    expect(RANK_LABEL.A).toBe('1')
    expect(RANK_LABEL.J).toBe('V')
    expect(RANK_LABEL.Q).toBe('D')
    expect(RANK_LABEL.K).toBe('R')
  })

  it('deux couleurs seulement : cœur et carreau en rouge', () => {
    expect(isRed('h')).toBe(true)
    expect(isRed('d')).toBe(true)
    expect(isRed('s')).toBe(false)
    expect(isRed('c')).toBe(false)
  })
})

describe('pointes', () => {
  it('chaque rang a exactement son nombre de pointes', () => {
    expect(pipLayout('A')).toHaveLength(1)
    expect(pipLayout('7')).toHaveLength(7)
    expect(pipLayout('8')).toHaveLength(8)
    expect(pipLayout('9')).toHaveLength(9)
    expect(pipLayout('10')).toHaveLength(10)
  })

  it("les figures n'ont pas de pointes : elles ont une illustration", () => {
    for (const r of ['J', 'Q', 'K'] as const) {
      expect(pipLayout(r)).toHaveLength(0)
      expect(isCourt(r)).toBe(true)
    }
  })

  it('les pointes de la moitié basse sont retournées', () => {
    const dix = pipLayout('10')
    expect(dix.filter((p) => p.flipped)).toHaveLength(5)
    expect(dix.every((p) => p.y > 52 === p.flipped)).toBe(true)
  })

  it("l'as porte une seule grande pointe, au centre", () => {
    expect(pipLayout('A')[0]).toEqual({ x: 50, y: 50, flipped: false, large: true })
  })
})

describe('illustrations', () => {
  it('les douze figures ont leur fichier, les autres non', () => {
    const avecImage = DECK.filter((c) => courtImage(c) !== null)
    expect(avecImage).toHaveLength(12)
    expect(courtImage('Kh')).toContain('King_of_hearts_fr.svg')
    expect(courtImage('7s')).toBeNull()
  })
})

describe('libellés', () => {
  it('se lisent comme à la table', () => {
    expect(cardLabel('Kh')).toBe('roi de cœur')
    expect(cardLabel('10s')).toBe('10 de pique')
    expect(cardLabel('Ad')).toBe('as de carreau')
  })
})
