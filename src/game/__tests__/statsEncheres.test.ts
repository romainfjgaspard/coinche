import { describe, expect, it } from 'vitest'
import type { BiddingEntry } from '../bidding'
import type { GameEvent } from '../events'
import { DEFAULT_SEATING, type PlayerId } from '../players'
import {
  BORNES_TEMPS,
  ajouterRepartition,
  ecartsAnnonce,
  enchereMoyenneDe,
  histogramme,
  labelTemps,
  repartitionAnnonces,
  rolesPrise,
  tempsParJoueur,
} from '../statsEncheres'

// Placement par défaut : Romain et Viv contre Benel et Roux.
let seq = 0
const ev = (e: Record<string, unknown>): GameEvent => ({ ...e, seq: seq++, at: 0 }) as GameEvent
const donne = (n: number) => ev({ type: 'donne_commencee', dealNumber: n, dealer: 'roux', cut: 3 })
const dit = (entry: BiddingEntry, thinkMs?: number) =>
  ev({
    type: 'enchere',
    player: entry.player,
    round: 1,
    entry,
    ...(thinkMs !== undefined ? { thinkMs } : {}),
  })
const passe = (p: PlayerId) => dit({ kind: 'passe', player: p })
const annonce = (p: PlayerId, value: number, suit: 's' | 'h' | 'd' | 'c') =>
  dit({ kind: 'contrat', player: p, value, suit })
const contrat = (
  taker: PlayerId,
  value: number,
  suit: 's' | 'h' | 'd' | 'c',
  extra: Record<string, unknown> = {},
) =>
  ev({
    type: 'contrat_fixe',
    taker,
    value,
    trump: suit,
    declaration: suit,
    multiplier: 1,
    capot: false,
    generale: false,
    ...extra,
  })
const fin = (status: string, compared: [number, number], extra: Record<string, unknown> = {}) =>
  ev({
    type: 'donne_terminee',
    dealNumber: 0,
    status,
    cardPoints: compared,
    compared,
    scores: [0, 0],
    beloteDeclaredBy: null,
    beloteForgottenBy: null,
    etoile: null,
    ...extra,
  })

describe('lanceur, suiveur ou seul', () => {
  it("A 80♠, B 90♠, A 100♠ : A lance, B suit — les relances n'y changent rien", () => {
    const r = rolesPrise(
      [
        donne(1),
        annonce('romain', 80, 's'),
        passe('benel'),
        annonce('viv', 90, 's'),
        passe('roux'),
        annonce('romain', 100, 's'),
        passe('benel'),
        passe('viv'),
        passe('roux'),
        contrat('romain', 100, 's'),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('romain')).toEqual({ lanceur: 1, suiveur: 0, seul: 0 })
    expect(r.get('viv')).toEqual({ lanceur: 0, suiveur: 1, seul: 0 })
  })

  it('le partenaire annonce une autre couleur : le preneur est seul dans la sienne', () => {
    const r = rolesPrise(
      [
        donne(1),
        annonce('romain', 80, 'h'),
        passe('benel'),
        annonce('viv', 90, 's'),
        passe('roux'),
        passe('romain'),
        passe('benel'),
        passe('viv'),
        contrat('viv', 90, 's'),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('viv')).toEqual({ lanceur: 0, suiveur: 0, seul: 1 })
    expect(r.get('romain')).toBeUndefined()
  })

  it('la couleur ouverte par un adversaire ne compte pas : on regarde son équipe', () => {
    const r = rolesPrise(
      [
        donne(1),
        passe('romain'),
        annonce('benel', 80, 's'),
        annonce('viv', 90, 's'),
        passe('roux'),
        annonce('romain', 100, 's'),
        passe('benel'),
        passe('viv'),
        passe('roux'),
        contrat('romain', 100, 's'),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('viv')).toEqual({ lanceur: 1, suiveur: 0, seul: 0 })
    expect(r.get('romain')).toEqual({ lanceur: 0, suiveur: 1, seul: 0 })
    expect(r.get('benel')).toBeUndefined()
  })
})

describe('répartition des annonces', () => {
  it('compte chaque prise de parole, passes comprises', () => {
    const r = repartitionAnnonces([
      donne(1),
      annonce('romain', 80, 's'),
      passe('benel'),
      annonce('viv', 90, 's'),
      passe('roux'),
      annonce('romain', 100, 's'),
      passe('benel'),
      passe('viv'),
      passe('roux'),
      dit({ kind: 'capot', player: 'romain', declaration: 's' }),
    ])
    expect(r.get('romain')).toEqual({ '80': 1, '100': 1, capot: 1 })
    expect(r.get('benel')).toEqual({ passe: 2 })
    expect(enchereMoyenneDe(r.get('romain')!)).toBe(90)
    expect(ajouterRepartition({ passe: 1, '80': 2 }, { passe: 3 })).toEqual({ passe: 4, '80': 2 })
  })
})

describe("écart à l'annonce", () => {
  it("points faits moins l'annonce, séparés entre réussis et chutés ; capot à part", () => {
    const r = ecartsAnnonce(
      [
        donne(1),
        contrat('romain', 100, 's'),
        fin('reussi', [112, 50]),
        donne(2),
        contrat('benel', 90, 'h'),
        fin('chute', [120, 42]),
        donne(3),
        contrat('romain', 80, 'd'),
        fin('reussi', [95, 67]),
        donne(4),
        contrat('romain', 250, 's', { capot: true }),
        fin('capot', [252, 0]),
      ],
      DEFAULT_SEATING,
    )
    expect(r.get('romain')).toEqual({ reussis: [12, 15], chutes: [] })
    expect(r.get('benel')).toEqual({ reussis: [], chutes: [-48] })
  })
})

describe('temps de réflexion', () => {
  it('garde chaque temps mesuré, en secondes, et en fait une distribution', () => {
    const t = tempsParJoueur([donne(1), dit({ kind: 'passe', player: 'viv' }, 1234), passe('roux')])
    expect(t.get('viv')).toEqual({ encheres: [1.2], cartes: [] })
    expect(t.get('roux')).toBeUndefined()
    const h = histogramme([1, 1.5, 3, 25, 50], BORNES_TEMPS, labelTemps)
    expect(h.map((x) => x.nombre)).toEqual([2, 1, 0, 0, 1, 1])
    expect(h[0]).toMatchObject({ label: '< 2', part: 40 })
    expect(h.at(-1)!.label).toBe('> 40')
  })
})
