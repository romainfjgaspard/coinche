/**
 * Statistiques sur toutes les parties, agrégées depuis les archives.
 *
 * Pur : on ne relit jamais le journal ici. Chaque partie terminée a déposé son
 * condensé, et c'est lui qu'on additionne.
 */
import type { Archive, PriseDetail } from './archive'
import { type PriseForce, panacheDe } from './force'
import { PLAYER_IDS, type PlayerId, teamOfPlayer } from './players'

export type Paire = [PlayerId, PlayerId]

/** Les six paires possibles à quatre joueurs. */
export const PAIRES: Paire[] = PLAYER_IDS.flatMap((a, i) =>
  PLAYER_IDS.slice(i + 1).map((b) => [a, b] as Paire),
)

export const clePaire = (p: Paire): string => [...p].sort().join('+')

export interface DuoStats {
  paire: Paire
  contre: Paire
  parties: number
  gagnees: number
  donnes: number
  donnesGagnees: number
  prises: number
  reussies: number
  marques: number
  offerts: number
  scoreMoyen: number
  pireScore: number | null
}

const duoVide = (paire: Paire, contre: Paire): DuoStats => ({
  paire, contre, parties: 0, gagnees: 0, donnes: 0, donnesGagnees: 0,
  prises: 0, reussies: 0, marques: 0, offerts: 0, scoreMoyen: 0, pireScore: null,
})

/** Les deux paires d'une partie, déduites du placement. */
export function pairesDe(a: Archive): [Paire, Paire] {
  return [
    [a.seating[0], a.seating[2]],
    [a.seating[1], a.seating[3]],
  ]
}

export function duoStats(archives: Archive[]): DuoStats[] {
  const out = new Map<string, DuoStats & { scores: number[] }>()

  for (const a of archives) {
    const [paireA, paireB] = pairesDe(a)
    const camps: [Paire, Paire, 0 | 1][] = [[paireA, paireB, 0], [paireB, paireA, 1]]

    for (const [paire, contre, team] of camps) {
      const cle = clePaire(paire)
      let d = out.get(cle)
      if (!d) { d = { ...duoVide(paire, contre), scores: [] }; out.set(cle, d) }

      d.parties += 1
      if (a.winner === team) d.gagnees += 1
      d.donnes += a.deals
      d.scores.push(a.scores[team])
      d.pireScore = d.pireScore === null ? a.scores[team] : Math.min(d.pireScore, a.scores[team])

      for (const j of paire) {
        const p = a.players[j]
        d.prises += p.prises
        d.reussies += p.reussies
        d.marques += p.marques
        d.offerts += p.offerts
        d.donnesGagnees += p.reussies
      }
    }
  }

  return [...out.values()]
    .map(({ scores, ...d }) => ({
      ...d,
      scoreMoyen: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
    }))
    .sort((a, b) => b.gagnees / (b.parties || 1) - a.gagnees / (a.parties || 1))
}

export interface JoueurStats {
  joueur: PlayerId
  parties: number
  gagnees: number
  scoreMoyen: number
  pireScore: number | null
  donnes: number
  prises: number
  reussies: number
  chutes: number
  marques: number
  offerts: number
  coinches: number
  belotesAnnoncees: number
  belotesOubliees: number
  etoiles: number
  impasses: number
  impassesReussies: number
  impassesRatees: number
  panache: number | null
}

export function joueurStats(archives: Archive[]): JoueurStats[] {
  // Toutes les prises dont on connaît la main, joueur compris : le panache se
  // calcule ensuite pour chacun en excluant ses propres prises de la référence.
  const toutes: PriseForce[] = archives.flatMap((a) =>
    PLAYER_IDS.flatMap((p) =>
      a.players[p].detail
        .filter((d): d is PriseDetail & { force: number } => d.force !== null)
        .map((d) => ({ joueur: p, force: d.force, value: d.value })),
    ),
  )

  return PLAYER_IDS.map((joueur) => {
    const scores: number[] = []
    const base = {
      joueur, parties: 0, gagnees: 0, donnes: 0, prises: 0, reussies: 0, chutes: 0,
      marques: 0, offerts: 0, coinches: 0, belotesAnnoncees: 0, belotesOubliees: 0, etoiles: 0,
      impasses: 0, impassesReussies: 0, impassesRatees: 0,
    }
    for (const a of archives) {
      const team = teamOfPlayer(joueur, a.seating)
      const p = a.players[joueur]
      base.parties += 1
      if (a.winner === team) base.gagnees += 1
      base.donnes += a.deals
      scores.push(a.scores[team])
      base.prises += p.prises
      base.reussies += p.reussies
      base.chutes += p.chutes
      base.marques += p.marques
      base.offerts += p.offerts
      base.coinches += p.coinches
      base.belotesAnnoncees += p.belotesAnnoncees
      base.belotesOubliees += p.belotesOubliees
      base.etoiles += p.etoiles
      base.impasses += p.impasses
      base.impassesReussies += p.impassesReussies
      base.impassesRatees += p.impassesRatees
    }

    return {
      ...base,
      scoreMoyen: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
      pireScore: scores.length ? Math.min(...scores) : null,
      panache: panacheDe(joueur, toutes),
    }
  }).sort((a, b) => b.gagnees / (b.parties || 1) - a.gagnees / (a.parties || 1))
}

/** Paliers d'enchère, capot compris, pour les barres. */
export const PALIERS = [80, 90, 100, 110, 120, 130, 140, 150, 160, 'capot'] as const
export type Palier = (typeof PALIERS)[number]

const palierDe = (d: PriseDetail): Palier => (d.capot ? 'capot' : (d.value as Palier))

/** Contrats pris et réussis par palier, pour un joueur ou pour tout le monde. */
export function parPalier(
  archives: Archive[],
  qui: PlayerId[] = [...PLAYER_IDS],
): { palier: Palier; reussis: number; chutes: number }[] {
  const compte = new Map<Palier, { reussis: number; chutes: number }>()
  for (const p of PALIERS) compte.set(p, { reussis: 0, chutes: 0 })

  for (const a of archives) {
    for (const j of qui) {
      for (const d of a.players[j].detail) {
        const c = compte.get(palierDe(d))
        if (!c) continue
        if (d.reussi) c.reussis += 1
        else c.chutes += 1
      }
    }
  }
  return PALIERS.map((palier) => ({ palier, ...compte.get(palier)! }))
}

/** Toutes les prises d'un joueur, pour le nuage force × annonce. */
export function prisesDe(archives: Archive[], joueur: PlayerId): PriseDetail[] {
  return archives.flatMap((a) => a.players[joueur].detail).filter((d) => d.force !== null)
}
