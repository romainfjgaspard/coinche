/**
 * Statistiques sur toutes les parties, agrégées depuis les archives.
 *
 * Pur : on ne relit jamais le journal ici. Chaque partie terminée a déposé son
 * condensé, et c'est lui qu'on additionne.
 */
import type { Archive, PlayerArchive, PriseDetail } from './archive'
import { type PriseForce, panacheDe } from './force'
import { PLAYER_IDS, type PlayerId, type Seating, estBotId, niveauDeBotId, teamOfPlayer } from './players'
import { type Chrono, ajouterChrono, moyenne } from './stats'
import {
  type Ecarts, type Repartition, type Roles, type Temps, ajouterRepartition, ecartsVides, rolesVides, tempsVides,
} from './statsEncheres'

export type Paire = [PlayerId, PlayerId]

/** Toutes les paires possibles entre ces joueurs. */
export const pairesEntre = (joueurs: readonly PlayerId[]): Paire[] =>
  joueurs.flatMap((a, i) => joueurs.slice(i + 1).map((b) => [a, b] as Paire))

/** Les six paires possibles entre les quatre du départ. */
export const PAIRES: Paire[] = pairesEntre(PLAYER_IDS)

export const clePaire = (p: Paire): string => [...p].sort().join('+')

/**
 * Les joueurs qui ont au moins une partie archivée : les quatre du départ en tête,
 * puis les autres dans l'ordre de leur première partie.
 */
export function joueursDe(archives: Archive[]): PlayerId[] {
  const vus = new Set<PlayerId>()
  for (const a of [...archives].sort((x, y) => x.finishedAt - y.finishedAt)) for (const p of a.seating) vus.add(p)
  return [...PLAYER_IDS.filter((p) => vus.has(p)), ...[...vus].filter((p) => !PLAYER_IDS.includes(p))]
}

/** Les paires qui ont joué ensemble au moins une fois. */
export function pairesJouees(archives: Archive[]): Paire[] {
  const cles = new Set(duoStats(archives).map((d) => clePaire(d.paire)))
  return pairesEntre(joueursDe(archives)).filter((p) => cles.has(clePaire(p)))
}

export interface DuoStats {
  paire: Paire
  /** Les paires affrontées : une seule à quatre joueurs, plusieurs au-delà */
  contre: Paire[]
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

const duoVide = (paire: Paire): DuoStats => ({
  paire, contre: [], parties: 0, gagnees: 0, donnes: 0, donnesGagnees: 0,
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
      if (!d) { d = { ...duoVide(paire), scores: [] }; out.set(cle, d) }
      if (!d.contre.some((x) => clePaire(x) === clePaire(contre))) d.contre.push(contre)

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
        // Une donne gagnée : son propre contrat tenu…
        d.donnesGagnees += p.reussies
      }
      // … ou celui de l'adversaire chuté.
      for (const j of contre) d.donnesGagnees += a.players[j].chutes
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
  /** Les archives antérieures au 24/09/2026 ne le connaissent pas : compté comme 0. */
  coinchesGagnees: number
  belotesAnnoncees: number
  belotesOubliees: number
  etoiles: number
  impasses: number
  impassesReussies: number
  impassesRatees: number
  panache: number | null
  /** Moyenne des contrats chiffrés pris (capots et générales à part, ils fausseraient tout). */
  enchereMoyenne: number | null
  /** Temps de réflexion moyen, en ms : pour annoncer, pour jouer une carte. Null sans mesure. */
  tempsEnchere: number | null
  tempsCarte: number | null
}

export function joueurStats(archives: Archive[]): JoueurStats[] {
  // Toutes les prises dont on connaît la main, joueur compris : le panache se
  // calcule ensuite pour chacun en excluant ses propres prises de la référence.
  const toutes = prisesAvecForce(archives)

  return joueursDe(archives).map((joueur) => {
    const scores: number[] = []
    const base = {
      joueur, parties: 0, gagnees: 0, donnes: 0, prises: 0, reussies: 0, chutes: 0,
      marques: 0, offerts: 0, coinches: 0, coinchesGagnees: 0, belotesAnnoncees: 0, belotesOubliees: 0,
      etoiles: 0, impasses: 0, impassesReussies: 0, impassesRatees: 0,
    }
    const encheres: number[] = []
    let chronoEnchere: Chrono = { total: 0, n: 0, max: 0 }
    let chronoCarte: Chrono = { total: 0, n: 0, max: 0 }
    for (const a of archives) {
      const p = a.players[joueur]
      if (!p) continue
      const team = teamOfPlayer(joueur, a.seating)
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
      base.coinchesGagnees += p.coinchesGagnees ?? 0
      if (p.reflexion) {
        chronoEnchere = ajouterChrono(chronoEnchere, p.reflexion.encheres)
        chronoCarte = ajouterChrono(chronoCarte, p.reflexion.cartes)
      }
      encheres.push(...p.detail.filter((d) => !d.capot && d.value <= 170).map((d) => d.value))
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
      enchereMoyenne: encheres.length
        ? Math.round(encheres.reduce((s, v) => s + v, 0) / encheres.length)
        : null,
      tempsEnchere: moyenne(chronoEnchere),
      tempsCarte: moyenne(chronoCarte),
    }
  }).sort((a, b) => b.gagnees / (b.parties || 1) - a.gagnees / (a.parties || 1))
}

/** L'en-tête de la page : combien de parties, de donnes, de prises, et depuis quand. */
export function resumeGlobal(archives: Archive[]): {
  parties: number
  donnes: number
  prises: number
  depuis: number | null
} {
  return {
    parties: archives.length,
    donnes: archives.reduce((s, a) => s + a.deals, 0),
    prises: archives.reduce((s, a) => s + Object.values(a.players).reduce((t, p) => t + p.prises, 0), 0),
    depuis: archives.length ? Math.min(...archives.map((a) => a.finishedAt)) : null,
  }
}

/** Toutes les prises dont la force est connue, pour la référence du groupe. */
export function prisesAvecForce(archives: Archive[]): PriseForce[] {
  return archives.flatMap((a) =>
    Object.entries(a.players).flatMap(([p, j]) =>
      j.detail
        .filter((d): d is PriseDetail & { force: number } => d.force !== null)
        .map((d) => ({ joueur: p, force: d.force, value: d.value })),
    ),
  )
}

/** Paliers d'enchère, capot compris, pour les barres. */
export const PALIERS = [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 'capot'] as const
export type Palier = (typeof PALIERS)[number]

const palierDe = (d: PriseDetail): Palier => (d.capot ? 'capot' : (d.value as Palier))

/** Contrats pris et réussis par palier, pour un joueur ou pour tout le monde. */
export function parPalier(
  archives: Archive[],
  qui: PlayerId[] = joueursDe(archives),
): { palier: Palier; reussis: number; chutes: number }[] {
  const compte = new Map<Palier, { reussis: number; chutes: number }>()
  for (const p of PALIERS) compte.set(p, { reussis: 0, chutes: 0 })

  for (const a of archives) {
    for (const j of qui) {
      for (const d of a.players[j]?.detail ?? []) {
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
  return archives.flatMap((a) => a.players[joueur]?.detail ?? []).filter((d) => d.force !== null)
}

// --- Les bots regroupés par niveau, et les nouvelles statistiques d'enchères et de temps.

/**
 * La clé d'un joueur dans les statistiques globales : tous les bots d'un même niveau
 * n'en font qu'un, « Bot » ou « Bot ★ ». Sans cela, chaque « bot-simple-2 » faisait
 * sa propre ligne.
 */
export const cleJoueur = (p: PlayerId): PlayerId =>
  estBotId(p) ? (niveauDeBotId(p) === 'compteur' ? 'bot-etoile' : 'bot-simple') : p

/** Deux condensés du même joueur réunis : deux bots du même niveau dans une partie. */
function fusionner(a: PlayerArchive, b: PlayerArchive): PlayerArchive {
  const somme = (x?: number, y?: number) => (x ?? 0) + (y ?? 0)
  const listes = <T>(x?: T[], y?: T[]) => [...(x ?? []), ...(y ?? [])]
  return {
    prises: a.prises + b.prises,
    reussies: a.reussies + b.reussies,
    chutes: a.chutes + b.chutes,
    marques: a.marques + b.marques,
    offerts: a.offerts + b.offerts,
    coinches: a.coinches + b.coinches,
    coinchesGagnees: somme(a.coinchesGagnees, b.coinchesGagnees),
    belotesAnnoncees: a.belotesAnnoncees + b.belotesAnnoncees,
    belotesOubliees: a.belotesOubliees + b.belotesOubliees,
    etoiles: a.etoiles + b.etoiles,
    impasses: a.impasses + b.impasses,
    impassesReussies: a.impassesReussies + b.impassesReussies,
    impassesRatees: a.impassesRatees + b.impassesRatees,
    detail: listes(a.detail, b.detail),
    ...(a.reflexion || b.reflexion
      ? {
          reflexion: {
            encheres: ajouterChrono(a.reflexion?.encheres ?? { total: 0, n: 0, max: 0 }, b.reflexion?.encheres ?? { total: 0, n: 0, max: 0 }),
            cartes: ajouterChrono(a.reflexion?.cartes ?? { total: 0, n: 0, max: 0 }, b.reflexion?.cartes ?? { total: 0, n: 0, max: 0 }),
          },
        }
      : {}),
    ...(a.annonces || b.annonces ? { annonces: ajouterRepartition(a.annonces ?? {}, b.annonces ?? {}) } : {}),
    ...(a.roles || b.roles
      ? { roles: { lanceur: somme(a.roles?.lanceur, b.roles?.lanceur), suiveur: somme(a.roles?.suiveur, b.roles?.suiveur), seul: somme(a.roles?.seul, b.roles?.seul) } }
      : {}),
    ...(a.ecarts || b.ecarts
      ? { ecarts: { reussis: listes(a.ecarts?.reussis, b.ecarts?.reussis), chutes: listes(a.ecarts?.chutes, b.ecarts?.chutes) } }
      : {}),
    ...(a.temps || b.temps
      ? { temps: { encheres: listes(a.temps?.encheres, b.temps?.encheres), cartes: listes(a.temps?.cartes, b.temps?.cartes) } }
      : {}),
  }
}

/** Les archives vues par les statistiques globales : bots regroupés par niveau. */
export function regrouperBots(archives: Archive[]): Archive[] {
  return archives.map((a) => {
    if (!a.seating.some(estBotId)) return a
    const players: Record<PlayerId, PlayerArchive> = {}
    for (const [p, v] of Object.entries(a.players)) {
      const k = cleJoueur(p)
      players[k] = players[k] ? fusionner(players[k], v) : v
    }
    return {
      ...a,
      seating: a.seating.map(cleJoueur) as unknown as Seating,
      bots: [...new Set((a.bots ?? []).map(cleJoueur))],
      players,
    }
  })
}

/** Les annonces de chacun, toutes parties confondues. */
export function annoncesGlobales(archives: Archive[]): Map<PlayerId, Repartition> {
  const out = new Map<PlayerId, Repartition>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (v.annonces) out.set(p, ajouterRepartition(out.get(p) ?? {}, v.annonces))
    }
  }
  return out
}

export function rolesGlobaux(archives: Archive[]): Map<PlayerId, Roles> {
  const out = new Map<PlayerId, Roles>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (!v.roles) continue
      const r = out.get(p) ?? rolesVides()
      out.set(p, { lanceur: r.lanceur + v.roles.lanceur, suiveur: r.suiveur + v.roles.suiveur, seul: r.seul + v.roles.seul })
    }
  }
  return out
}

export function ecartsGlobaux(archives: Archive[]): Map<PlayerId, Ecarts> {
  const out = new Map<PlayerId, Ecarts>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (!v.ecarts) continue
      const r = out.get(p) ?? ecartsVides()
      out.set(p, { reussis: [...r.reussis, ...v.ecarts.reussis], chutes: [...r.chutes, ...v.ecarts.chutes] })
    }
  }
  return out
}

export function tempsGlobaux(archives: Archive[]): Map<PlayerId, Temps> {
  const out = new Map<PlayerId, Temps>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (!v.temps) continue
      const r = out.get(p) ?? tempsVides()
      out.set(p, { encheres: [...r.encheres, ...v.temps.encheres], cartes: [...r.cartes, ...v.temps.cartes] })
    }
  }
  return out
}

/**
 * Les soirées : les parties enchaînées avec « Rejouer » partagent la même. Les plus
 * récentes d'abord ; une partie sans soirée connue (avant le 25/09/2026) est la sienne.
 */
export interface Soiree {
  cle: string
  debut: number
  fin: number
  parties: Archive[]
  /** Victoires par paire, sur la soirée */
  victoires: { paire: Paire; gagnees: number }[]
}
export function soirees(archives: Archive[]): Soiree[] {
  const groupes = new Map<string, Archive[]>()
  for (const a of archives) {
    const cle = a.soiree ?? a.code
    groupes.set(cle, [...(groupes.get(cle) ?? []), a])
  }
  return [...groupes.entries()]
    .map(([cle, parties]) => {
      const tri = [...parties].sort((x, y) => x.finishedAt - y.finishedAt)
      const victoires = new Map<string, { paire: Paire; gagnees: number }>()
      for (const a of tri) {
        for (const [paire, team] of [[pairesDe(a)[0], 0], [pairesDe(a)[1], 1]] as const) {
          const k = clePaire(paire)
          const v = victoires.get(k) ?? { paire, gagnees: 0 }
          if (a.winner === team) v.gagnees += 1
          victoires.set(k, v)
        }
      }
      return {
        cle,
        debut: tri[0].finishedAt,
        fin: tri.at(-1)!.finishedAt,
        parties: tri,
        victoires: [...victoires.values()].sort((x, y) => y.gagnees - x.gagnees),
      }
    })
    .sort((x, y) => y.fin - x.fin)
}
