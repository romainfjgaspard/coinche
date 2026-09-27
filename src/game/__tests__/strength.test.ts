import { describe, expect, it } from 'vitest'
import type { Card } from '../cards'
import { SCALE, bandOf, handStrength, groupHabit, panacheOf } from '../strength'

describe('force de main', () => {
  // Les mains font huit cartes : une main courte inventerait des chicanes.
  it('compte un point par atout', () => {
    // 3 piques, et au moins une carte dans chaque autre couleur
    const hand: Card[] = ['7s', '8s', '10s', '7h', '8h', '7d', '8d', '7c']
    expect(handStrength(hand, 's')).toBe(3)
  })

  it("ajoute le valet et le 9 d'atout", () => {
    const hand: Card[] = ['Js', '9s', '10s', '7h', '8h', '7d', '8d', '7c']
    expect(handStrength(hand, 's')).toBe(3 + SCALE.trumpJack + SCALE.trumpNine)
  })

  it("compte les as extérieurs, pas celui d'atout", () => {
    const hand: Card[] = ['As', '7s', 'Ah', '8h', 'Ad', '8d', '7c', '8c']
    expect(handStrength(hand, 's')).toBe(2 + 2 * SCALE.sideAce)
  })

  it('récompense le cinquième atout et au-delà', () => {
    const five: Card[] = ['7s', '8s', '10s', 'Qs', 'Ks', '7h', '7d', '7c']
    expect(handStrength(five, 's')).toBe(5 + SCALE.extraTrump)
    const six: Card[] = ['7s', '8s', '10s', 'Qs', 'Ks', 'As', '7h', '7d']
    // 6 atouts, deux au-delà du quatrième, et le trèfle absent
    expect(handStrength(six, 's')).toBe(6 + 2 * SCALE.extraTrump + SCALE.void)
  })

  it('compte les chicanes, hors atout', () => {
    // Pas un seul trèfle
    const hand: Card[] = ['7s', '8s', '10s', '7h', '8h', '9h', '7d', '8d']
    expect(handStrength(hand, 's')).toBe(3 + SCALE.void)
  })

  it('une main sans atout défini ne vaut rien', () => {
    // Sans-atout et tout-atout : le barème ne s'applique pas
    expect(handStrength(['As', 'Ah', '7d', '8c', '9s', '10h', 'Jd', 'Qc'], null)).toBe(0)
  })

  it('cas complet : 5 atouts avec valet et 9, un as extérieur, une chicane', () => {
    const hand: Card[] = ['Js', '9s', 'As', '10s', '7s', 'Ah', '8h', 'Kd']
    // 5 atouts + valet 3 + neuf 2 + as extérieur 2 + 5e atout 1 + chicane trèfle 2
    expect(handStrength(hand, 's')).toBe(5 + 3 + 2 + 2 + 1 + 2)
  })
})

describe('habitude du groupe', () => {
  // Forces 9, 10 et 11 tombent dans la même bande : 9/3 = 10/3 = 11/3 = 3
  const takes = [
    { player: 'benel', strength: 9, value: 80 },
    { player: 'viv', strength: 10, value: 100 },
    { player: 'romain', strength: 11, value: 90 },
    { player: 'roux', strength: 10, value: 140 },
  ]

  it('regroupe les forces voisines dans une même bande', () => {
    expect(bandOf(9)).toBe(bandOf(11))
    expect(bandOf(9)).not.toBe(bandOf(12))
  })

  it('prend la médiane par bande', () => {
    expect(groupHabit(takes).get(bandOf(10))).toBe(95)
  })

  it('exclut le joueur mesuré de sa propre référence', () => {
    // Sans Roux, le groupe annonce 90 : lui annonce 140, donc +50
    expect(panacheOf('roux', takes)).toBe(50)
    // Sans Benel, le groupe annonce 100 : lui annonce 80, donc −20
    expect(panacheOf('benel', takes)).toBe(-20)
  })

  it('reste indéfini sans prise, ou sans référence comparable', () => {
    expect(panacheOf('inconnu', takes)).toBeNull()
    expect(panacheOf('alone', [{ player: 'alone', strength: 3, value: 160 }])).toBeNull()
  })
})
