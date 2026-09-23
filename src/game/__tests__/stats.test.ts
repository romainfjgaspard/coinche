import { describe, expect, it } from 'vitest'
import type { GameEvent } from '../events'
import { DEFAULT_SEATING } from '../players'
import {
  bilan, deals, dealsPlayed, enchereMoyenne, momentum, runningScores, tallies,
} from '../stats'

const ev = (type: string, extra: Record<string, unknown> = {}): GameEvent =>
  ({ type, seq: 0, at: 0, ...extra }) as GameEvent

/** Une donne complète : distribution, contrat, éventuelles coinches, décompte. */
function donne(opts: {
  n: number
  dealer?: string
  taker?: string
  value?: number
  status?: string
  scores?: [number, number]
  coincheurs?: string[]
  belote?: string | null
  oubliee?: string | null
  etoile?: string | null
}): GameEvent[] {
  const out: GameEvent[] = [ev('donne_commencee', { dealNumber: opts.n, dealer: opts.dealer ?? 'benel' })]
  if (opts.taker) {
    out.push(ev('contrat_fixe', {
      taker: opts.taker, value: opts.value ?? 90, trump: 'h',
      multiplier: 1, capot: false, generale: false,
    }))
  }
  for (const c of opts.coincheurs ?? []) out.push(ev('coinche', { player: c }))
  if (opts.status) {
    out.push(ev('donne_terminee', {
      dealNumber: opts.n, status: opts.status,
      cardPoints: [81, 81], compared: [81, 81], scores: opts.scores ?? [0, 0],
      beloteDeclaredBy: opts.belote ?? null, beloteForgottenBy: opts.oubliee ?? null,
      etoile: opts.etoile ?? null,
    }))
  }
  return out
}

// Placement par défaut : romain(0) · benel(1) · viv(2) · roux(3)
// Équipe 0 = Romain + Viv, équipe 1 = Benel + Roux
const PARTIE: GameEvent[] = [
  ev('partie_creee'),
  ...donne({ n: 1, taker: 'viv', value: 90, status: 'reussi', scores: [90, 0], belote: 'viv' }),
  ...donne({ n: 2, taker: 'roux', value: 100, status: 'chute', scores: [100, 0], coincheurs: ['romain'] }),
  ...donne({ n: 3, taker: 'benel', value: 110, status: 'reussi', scores: [0, 110], oubliee: 'benel' }),
  ...donne({ n: 4, taker: 'viv', value: 120, status: 'reussi', scores: [120, 0], etoile: 'viv' }),
]

describe('découpage en donnes', () => {
  it('reconstitue chaque donne depuis le journal', () => {
    const list = deals(PARTIE)
    expect(list).toHaveLength(4)
    expect(list[0]).toMatchObject({ dealNumber: 1, taker: 'viv', value: 90, status: 'reussi' })
    expect(list[1].coincheurs).toEqual(['romain'])
  })

  it('compte la donne en cours, encore sans résultat', () => {
    const list = deals([...PARTIE, ...donne({ n: 5, taker: 'romain' })])
    expect(list).toHaveLength(5)
    expect(list[4].status).toBeNull()
    expect(dealsPlayed(list)).toBe(4)
  })
})

describe('courbe de score', () => {
  it('cumule donne après donne, en partant de zéro', () => {
    const points = runningScores(deals(PARTIE))
    expect(points[0]).toEqual({ deal: 0, scores: [0, 0] })
    expect(points[points.length - 1].scores).toEqual([310, 110])
  })

  it('ignore la donne en cours', () => {
    const avec = runningScores(deals([...PARTIE, ...donne({ n: 5, taker: 'romain' })]))
    expect(avec[avec.length - 1].scores).toEqual([310, 110])
  })
})

describe('momentum', () => {
  it('donne une barre par donne, du côté de celui qui a marqué', () => {
    const barres = momentum(deals(PARTIE))
    expect(barres).toEqual([
      { deal: 1, team: 0, points: 90 },
      { deal: 2, team: 0, points: 100 },
      { deal: 3, team: 1, points: 110 },
      { deal: 4, team: 0, points: 120 },
    ])
  })
})

describe('compte par joueur', () => {
  const t = tallies(deals(PARTIE), DEFAULT_SEATING)

  it('sépare ce qu\'un joueur rapporte de ce qu\'il offre', () => {
    const viv = t.get('viv')!
    expect(viv).toMatchObject({ prises: 2, reussies: 2, chutes: 0, marques: 210, offerts: 0 })
    expect(bilan(viv)).toBe(210)

    // Roux a pris à 100 et chuté : les 100 sont allés à l'adversaire
    const roux = t.get('roux')!
    expect(roux).toMatchObject({ prises: 1, reussies: 0, chutes: 1, marques: 0, offerts: 100 })
    expect(bilan(roux)).toBe(-100)
  })

  it('moyenne les enchères de ses seules prises', () => {
    expect(enchereMoyenne(t.get('viv')!)).toBe(105)
    expect(enchereMoyenne(t.get('benel')!)).toBe(110)
    expect(enchereMoyenne(t.get('romain')!)).toBeNull()
  })

  it('relève les coinches, les belotes et les étoiles', () => {
    expect(t.get('romain')!.coinches).toBe(1)
    expect(t.get('viv')!.belotesAnnoncees).toBe(1)
    expect(t.get('benel')!.belotesOubliees).toBe(1)
    expect(t.get('viv')!.etoiles).toBe(1)
  })

  it('ne compte rien pour la donne en cours', () => {
    const avec = tallies(deals([...PARTIE, ...donne({ n: 5, taker: 'romain', value: 160 })]), DEFAULT_SEATING)
    expect(avec.get('romain')!.prises).toBe(0)
  })
})
