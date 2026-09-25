import { describe, expect, it } from 'vitest'
import type { Archive, PlayerArchive } from '../archive'
import type { Seating } from '../players'
import {
  PAIRES, clePaire, duoStats, joueursDe, joueurStats, pairesJouees, parPalier, prisesDe, resumeGlobal,
} from '../statsGlobal'

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
  const players: Archive['players'] = Object.fromEntries(opts.seating.map((p) => [p, vide()]))
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

describe('au-delà des quatre du départ', () => {
  // Jean remplace Roux le temps d'une partie
  const C: Seating = ['romain', 'benel', 'viv', 'jean']
  const AVEC_JEAN = [
    ...ARCHIVES,
    partie({ code: 'CCCC', seating: C, scores: [1020, 300], joueurs: {
      jean: { prises: 1, chutes: 1, offerts: 160, detail: [
        { deal: 1, value: 80, force: 6, reussi: false, capot: false },
      ] },
    } }),
  ]

  it('liste les quatre du départ puis les nouveaux', () => {
    expect(joueursDe(AVEC_JEAN)).toEqual(['benel', 'roux', 'viv', 'romain', 'jean'])
  })

  it("ne compte à chacun que les parties qu'il a jouées", () => {
    const j = joueurStats(AVEC_JEAN)
    expect(j.find((x) => x.joueur === 'jean')).toMatchObject({ parties: 1, gagnees: 0, prises: 1, chutes: 1 })
    expect(j.find((x) => x.joueur === 'roux')!.parties).toBe(2)
    expect(j.find((x) => x.joueur === 'romain')!.parties).toBe(3)
  })

  it('un duo garde la trace de chaque paire affrontée', () => {
    const rv = duoStats(AVEC_JEAN).find((d) => clePaire(d.paire) === clePaire(['romain', 'viv']))!
    expect(rv.parties).toBe(2)
    expect(rv.contre.map(clePaire).sort()).toEqual([clePaire(['benel', 'jean']), clePaire(['benel', 'roux'])].sort())
  })

  it('ne propose que les paires qui ont joué ensemble', () => {
    const cles = pairesJouees(AVEC_JEAN).map(clePaire)
    expect(cles).toContain(clePaire(['benel', 'jean']))
    expect(cles).not.toContain(clePaire(['jean', 'roux']))
  })

  it('les paliers et le résumé tiennent compte du nouveau', () => {
    expect(parPalier(AVEC_JEAN, ['jean']).find((l) => l.palier === 80)).toMatchObject({ reussis: 0, chutes: 1 })
    expect(resumeGlobal(AVEC_JEAN).prises).toBe(8)
  })
})

describe('bots regroupés, soirées, enchères et temps', () => {
  it('deux « Bot » d\'une même partie n\'en font qu\'un, avec leurs chiffres additionnés', async () => {
    const { regrouperBots, joueursDe: jd } = await import('../statsGlobal')
    const a = partie({
      code: 'BOTS', seating: ['romain', 'bot-simple-1', 'bot-etoile-1', 'bot-simple-2'], scores: [1000, 500],
      joueurs: {
        'bot-simple-1': { prises: 2, annonces: { passe: 3, '80': 1 } },
        'bot-simple-2': { prises: 1, annonces: { passe: 2 } },
      },
    })
    const [r] = regrouperBots([{ ...a, bots: ['bot-simple-1', 'bot-etoile-1', 'bot-simple-2'] }])
    expect(r.seating).toEqual(['romain', 'bot-simple', 'bot-etoile', 'bot-simple'])
    expect(r.bots.sort()).toEqual(['bot-etoile', 'bot-simple'])
    expect(r.players['bot-simple']).toMatchObject({ prises: 3, annonces: { passe: 5, '80': 1 } })
    expect(jd([r])).toEqual(['romain', 'bot-simple', 'bot-etoile'])
  })

  it('les soirées réunissent les parties enchaînées, les plus récentes d\'abord', async () => {
    const { soirees } = await import('../statsGlobal')
    const x = (code: string, soiree: string | undefined, finishedAt: number, scores: [number, number]) =>
      ({ ...partie({ code, seating: A, scores }), finishedAt, ...(soiree ? { soiree } : {}) })
    const s = soirees([x('P1', 'P1', 10, [1000, 0]), x('P2', 'P1', 20, [0, 1000]), x('P3', 'P1', 30, [1000, 0]), x('Q1', undefined, 100, [0, 1000])])
    expect(s.map((v) => v.cle)).toEqual(['Q1', 'P1'])
    expect(s[1].parties.map((p) => p.code)).toEqual(['P1', 'P2', 'P3'])
    expect(s[1].victoires[0]).toMatchObject({ gagnees: 2 })
  })

  it('additionne rôles, écarts et temps d\'une partie à l\'autre', async () => {
    const { rolesGlobaux, ecartsGlobaux, tempsGlobaux, annoncesGlobales } = await import('../statsGlobal')
    const arch = [
      partie({ code: 'R1', seating: A, scores: [1000, 0], joueurs: { romain: { roles: { lanceur: 1, suiveur: 0, seul: 2 }, ecarts: { reussis: [10], chutes: [] }, temps: { encheres: [1.2], cartes: [3] }, annonces: { '90': 1 } } } }),
      partie({ code: 'R2', seating: A, scores: [1000, 0], joueurs: { romain: { roles: { lanceur: 2, suiveur: 1, seul: 0 }, ecarts: { reussis: [], chutes: [-20] }, temps: { encheres: [4], cartes: [] }, annonces: { '90': 2, passe: 1 } } } }),
    ]
    expect(rolesGlobaux(arch).get('romain')).toEqual({ lanceur: 3, suiveur: 1, seul: 2 })
    expect(ecartsGlobaux(arch).get('romain')).toEqual({ reussis: [10], chutes: [-20] })
    expect(tempsGlobaux(arch).get('romain')).toEqual({ encheres: [1.2, 4], cartes: [3] })
    expect(annoncesGlobales(arch).get('romain')).toEqual({ '90': 3, passe: 1 })
    expect(rolesGlobaux(arch).get('viv')).toBeUndefined()
  })
})
