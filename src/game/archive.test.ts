import { describe, expect, it } from 'vitest'
import type { Card } from './cards'
import type { GameEvent } from './events'
import { DEFAULT_SEATING } from './players'
import { buildArchive } from './archive'

const ev = (type: string, extra: Record<string, unknown> = {}): GameEvent =>
  ({ type, seq: 0, at: 0, ...extra }) as GameEvent

const donne = (n: number, taker: string, value: number, status: string,
               scores: [number, number], extra: Record<string, unknown> = {}): GameEvent[] => [
  ev('donne_commencee', { dealNumber: n, dealer: 'benel' }),
  ev('contrat_fixe', { taker, value, trump: 's', multiplier: 1, capot: false, generale: false }),
  ev('donne_terminee', {
    dealNumber: n, status, cardPoints: [81, 81], compared: [81, 81], scores,
    beloteDeclaredBy: null, beloteForgottenBy: null, etoile: null, ...extra,
  }),
]

// Viv (équipe 0) prend deux fois, Roux (équipe 1) une fois et chute
const EVENTS: GameEvent[] = [
  ev('partie_creee', { seating: DEFAULT_SEATING }),
  ...donne(1, 'viv', 90, 'reussi', [90, 0]),
  ...donne(2, 'roux', 100, 'chute', [100, 0], { etoile: null }),
  ...donne(3, 'viv', 110, 'reussi', [110, 0], { beloteDeclaredBy: 'viv' }),
  ev('partie_terminee', { scores: [300, 0], winner: 0, deals: 3 }),
]

// Mains distribuées, lues dans le document scellé
const MAINS: Record<number, Record<string, Card[]>> = {
  1: { viv: ['Js', '9s', 'As', '10s', '7h', '8h', '7d', '7c'] },
  2: { roux: ['7s', '8s', '7h', '8h', '9h', '7d', '8d', '7c'] },
  3: { viv: ['Js', '9s', 'As', 'Ks', 'Qs', 'Ah', '7d', '7c'] },
}

describe('archive de fin de partie', () => {
  const a = buildArchive('KDVA', EVENTS, DEFAULT_SEATING, MAINS)

  it('résume le résultat', () => {
    expect(a).toMatchObject({ code: 'KDVA', scores: [300, 0], winner: 0, deals: 3 })
    expect(a.seating).toEqual(DEFAULT_SEATING)
  })

  it('sépare ce que chacun rapporte de ce qu\'il offre', () => {
    expect(a.players.viv).toMatchObject({ prises: 2, reussies: 2, marques: 200, offerts: 0 })
    expect(a.players.roux).toMatchObject({ prises: 1, chutes: 1, marques: 0, offerts: 100 })
  })

  it('garde la force de main de chaque prise, pour le panache', () => {
    // Viv donne 1 : 4 atouts + valet 3 + neuf 2 = 9
    expect(a.players.viv.detail[0]).toMatchObject({ deal: 1, value: 90, force: 9, reussi: true })
    // Viv donne 3 : 5 atouts + valet 3 + neuf 2 + as extérieur 2 + 5e atout 1 + chicane trèfle… non, trèfle présent
    expect(a.players.viv.detail[1].force).toBeGreaterThan(a.players.viv.detail[0].force!)
  })

  it('laisse la force indéfinie quand la main n\'a pas pu être lue', () => {
    const sansMains = buildArchive('KDVA', EVENTS, DEFAULT_SEATING, {})
    expect(sansMains.players.viv.detail[0].force).toBeNull()
  })

  it('relève belotes et joueurs sans prise', () => {
    expect(a.players.viv.belotesAnnoncees).toBe(1)
    expect(a.players.benel).toMatchObject({ prises: 0, marques: 0, detail: [] })
  })
})
