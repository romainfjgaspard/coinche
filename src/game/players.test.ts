import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SEATING, PAIRINGS, PLAYER_IDS, type Seating, pairingKey, partnerOf, playerAtSeat,
  randomSeating, seatingFromTeam, teamOfPlayer,
} from './players'

describe('placement autour de la table', () => {
  it('les sièges 0 et 2 font équipe, 1 et 3 aussi', () => {
    expect(teamOfPlayer('romain', DEFAULT_SEATING)).toBe(0)
    expect(teamOfPlayer('viv', DEFAULT_SEATING)).toBe(0)
    expect(teamOfPlayer('benel', DEFAULT_SEATING)).toBe(1)
    expect(teamOfPlayer('roux', DEFAULT_SEATING)).toBe(1)
  })

  it('le partenaire est en face', () => {
    expect(partnerOf('romain', DEFAULT_SEATING)).toBe('viv')
    expect(partnerOf('benel', DEFAULT_SEATING)).toBe('roux')
  })

  it('changer de placement change les équipes', () => {
    const autre: Seating = ['romain', 'viv', 'roux', 'benel']
    expect(partnerOf('romain', autre)).toBe('roux')
    expect(teamOfPlayer('viv', autre)).toBe(1)
  })

  it('les sièges bouclent dans les deux sens', () => {
    expect(playerAtSeat(4, DEFAULT_SEATING)).toBe('romain')
    expect(playerAtSeat(-1, DEFAULT_SEATING)).toBe('roux')
  })
})

describe('appariements', () => {
  it('il n\'existe que trois duos à quatre joueurs', () => {
    expect(PAIRINGS).toHaveLength(3)
    expect(new Set(PAIRINGS.map(pairingKey)).size).toBe(3)
  })

  it('la clé d\'appariement ne dépend ni de l\'ordre ni du siège', () => {
    expect(pairingKey(['romain', 'benel', 'viv', 'roux'])).toBe(
      pairingKey(['viv', 'roux', 'romain', 'benel']),
    )
  })

  it('choisir une équipe place les deux autres en face', () => {
    const s = seatingFromTeam(['viv', 'roux'])
    expect(partnerOf('viv', s)).toBe('roux')
    expect(teamOfPlayer('viv', s)).toBe(teamOfPlayer('roux', s))
  })
})

describe('tirage au sort', () => {
  it('place les quatre joueurs, une seule fois chacun', () => {
    const s = randomSeating(() => 0.42)
    expect([...s].sort()).toEqual([...PLAYER_IDS].sort())
  })

  it('est reproductible à générateur donné', () => {
    let n = 0
    const rng = () => [0.1, 0.7, 0.3, 0.9][n++ % 4]
    const a = randomSeating(rng)
    n = 0
    expect(randomSeating(rng)).toEqual(a)
  })
})
