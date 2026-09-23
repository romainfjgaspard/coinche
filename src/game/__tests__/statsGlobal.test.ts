import { describe, expect, it } from 'vitest'
import type { Archive, PlayerArchive } from '../archive'
import type { Seating } from '../players'
import { PAIRES, clePaire, duoStats, joueurStats, parPalier, prisesDe } from '../statsGlobal'

const vide = (): PlayerArchive => ({
  prises: 0, reussies: 0, chutes: 0, marques: 0, offerts: 0, coinches: 0,
  belotesAnnoncees: 0, belotesOubliees: 0, etoiles: 0,
  impasses: 0, impassesReussies: 0, impassesRatees: 0, detail: [],
})

function partie(opts: {
  code: string
  seating: Seating
  scores: [number, number]
  deals?: number
  joueurs?: Partial<Record<string, Partial<PlayerArchive>>>
}): Archive {
  const players = {
    benel: vide(), roux: vide(), viv: vide(), romain: vide(),
  } as Archive['players']
  for (const [j, p] of Object.entries(opts.joueurs ?? {})) {
    Object.assign(players[j as keyof typeof players], p)
  }
  return {
    code: opts.code, finishedAt: 0, seating: opts.seating, scores: opts.scores,
    winner: opts.scores[0] > opts.scores[1] ? 0 : 1, deals: opts.deals ?? 10, bots: [], players,
  }
}

// Deux placements différents : les duos changent d'une partie à l'autre
const A: Seating = ['romain', 'benel', 'viv', 'roux'] // Romain+Viv contre Benel+Roux
const B: Seating = ['romain', 'viv', 'roux', 'benel'] // Romain+Roux contre Viv+Benel

const ARCHIVES: Archive[] = [
  partie({ code: 'AAAA', seating: A, scores: [1010, 600], joueurs: {
    viv: { prises: 3, reussies: 3, marques: 300, detail: [
      { deal: 1, value: 90, force: 10, reussi: true, capot: false },
      { deal: 2, value: 110, force: 14, reussi: true, capot: false },
      { deal: 3, value: 250, force: 18, reussi: true, capot: true },
    ] },
    roux: { prises: 2, chutes: 2, offerts: 200, etoiles: 1, detail: [
      { deal: 4, value: 120, force: 8, reussi: false, capot: false },
      { deal: 5, value: 100, force: 9, reussi: false, capot: false },
    ] },
  } }),
  partie({ code: 'BBBB', seating: B, scores: [400, 1010], joueurs: {
    benel: { prises: 2, reussies: 1, chutes: 1, marques: 90, offerts: 100, detail: [
      { deal: 1, value: 90, force: 11, reussi: true, capot: false },
      { deal: 2, value: 100, force: 9, reussi: false, capot: false },
    ] },
  } }),
]

describe('les six paires', () => {
  it('existent toutes, une seule fois chacune', () => {
    expect(PAIRES).toHaveLength(6)
    expect(new Set(PAIRES.map(clePaire)).size).toBe(6)
  })
})

describe('statistiques par duo', () => {
  const duos = duoStats(ARCHIVES)

  it('ne compte que les duos qui ont joué', () => {
    // Deux parties, deux placements : quatre paires ont joué
    expect(duos).toHaveLength(4)
  })

  it('attribue la victoire au bon camp', () => {
    const gagnant = duos.find((d) => clePaire(d.paire) === clePaire(['romain', 'viv']))!
    expect(gagnant).toMatchObject({ parties: 1, gagnees: 1 })
    const perdant = duos.find((d) => clePaire(d.paire) === clePaire(['benel', 'roux']))!
    expect(perdant).toMatchObject({ parties: 1, gagnees: 0 })
  })

  it('additionne les prises des deux joueurs de la paire', () => {
    const rv = duos.find((d) => clePaire(d.paire) === clePaire(['romain', 'viv']))!
    expect(rv.prises).toBe(3)
    expect(rv.marques).toBe(300)
  })

  it('retient le pire score, pas le meilleur', () => {
    const br = duos.find((d) => clePaire(d.paire) === clePaire(['benel', 'roux']))!
    expect(br.pireScore).toBe(600)
  })
})

describe('statistiques par joueur', () => {
  const joueurs = joueurStats(ARCHIVES)

  it('compte toutes les parties pour tout le monde', () => {
    for (const j of joueurs) expect(j.parties).toBe(2)
  })

  it('suit le camp du joueur, qui change de partie en partie', () => {
    // Romain gagne la première (équipe 0) et perd la seconde (équipe 0 aussi)
    const romain = joueurs.find((j) => j.joueur === 'romain')!
    expect(romain.gagnees).toBe(1)
    // Benel perd la première puis gagne la seconde
    const benel = joueurs.find((j) => j.joueur === 'benel')!
    expect(benel.gagnees).toBe(1)
  })

  it('mesure le panache : Roux annonce haut avec des mains faibles', () => {
    const roux = joueurs.find((j) => j.joueur === 'roux')!
    const viv = joueurs.find((j) => j.joueur === 'viv')!
    expect(roux.panache).not.toBeNull()
    expect(viv.panache).not.toBeNull()
    expect(roux.panache!).toBeGreaterThan(viv.panache!)
  })
})

describe('répartition par palier', () => {
  it('range chaque prise à son palier, capot compris', () => {
    const lignes = parPalier(ARCHIVES)
    const p90 = lignes.find((l) => l.palier === 90)!
    expect(p90).toMatchObject({ reussis: 2, chutes: 0 })
    const p100 = lignes.find((l) => l.palier === 100)!
    expect(p100).toMatchObject({ reussis: 0, chutes: 2 })
    expect(lignes.find((l) => l.palier === 'capot')).toMatchObject({ reussis: 1, chutes: 0 })
  })

  it('se restreint à un joueur', () => {
    const lignes = parPalier(ARCHIVES, ['roux'])
    expect(lignes.reduce((s, l) => s + l.reussis + l.chutes, 0)).toBe(2)
  })
})

describe('nuage force × annonce', () => {
  it('rassemble les prises d\'un joueur dont on connaît la main', () => {
    expect(prisesDe(ARCHIVES, 'viv')).toHaveLength(3)
    expect(prisesDe(ARCHIVES, 'romain')).toHaveLength(0)
  })
})
