/**
 * Statistiques, calculées depuis le seul journal d'événements.
 *
 * Pur : aucune dépendance à Firestore ni à Vue. Les écrans s'abonnent au journal,
 * qui est déjà temps réel, donc les chiffres bougent au fil de la partie.
 */
import type { Suit } from './cards'
import type { GameEvent } from './events'
import { type PlayerId, type Seating, teamOfPlayer } from './players'
import type { DealStatus } from './scoring'

export type Team = 0 | 1

/** Ce qu'on retient d'une donne une fois qu'elle est finie. */
export interface DealSummary {
  dealNumber: number
  dealer: PlayerId | null
  taker: PlayerId | null
  value: number
  trump: Suit | null
  multiplier: 1 | 2 | 4
  capot: boolean
  status: DealStatus | null
  /** Points marqués par chaque équipe sur cette donne */
  scores: [number, number]
  cardPoints: [number, number]
  coincheurs: PlayerId[]
  beloteDeclaredBy: PlayerId | null
  beloteForgottenBy: PlayerId | null
  etoile: PlayerId | null
}

const vide = (dealNumber: number, dealer: PlayerId | null): DealSummary => ({
  dealNumber,
  dealer,
  taker: null,
  value: 0,
  trump: null,
  multiplier: 1,
  capot: false,
  status: null,
  scores: [0, 0],
  cardPoints: [0, 0],
  coincheurs: [],
  beloteDeclaredBy: null,
  beloteForgottenBy: null,
  etoile: null,
})

/** Découpe le journal en donnes, y compris celle en cours. */
export function deals(events: GameEvent[]): DealSummary[] {
  const out: DealSummary[] = []
  let courante: DealSummary | null = null

  for (const e of events) {
    switch (e.type) {
      case 'donne_commencee':
        if (courante) out.push(courante)
        courante = vide(e.dealNumber, e.dealer)
        break
      case 'contrat_fixe':
        if (courante) {
          courante.taker = e.taker
          courante.value = e.value
          courante.trump = e.trump
          courante.multiplier = e.multiplier
          courante.capot = e.capot
        }
        break
      case 'coinche':
      case 'surcoinche':
        courante?.coincheurs.push(e.player)
        break
      case 'donne_terminee':
        if (courante) {
          courante.status = e.status
          courante.scores = e.scores
          courante.cardPoints = e.cardPoints
          courante.beloteDeclaredBy = e.beloteDeclaredBy
          courante.beloteForgottenBy = e.beloteForgottenBy
          courante.etoile = e.etoile
        }
        break
    }
  }
  if (courante) out.push(courante)
  return out
}

/** Score cumulé après chaque donne — la courbe d'évolution. */
export function runningScores(list: DealSummary[]): { deal: number; scores: [number, number] }[] {
  const points: { deal: number; scores: [number, number] }[] = [{ deal: 0, scores: [0, 0] }]
  let a = 0
  let b = 0
  for (const d of list) {
    if (d.status === null) continue
    a += d.scores[0]
    b += d.scores[1]
    points.push({ deal: d.dealNumber, scores: [a, b] })
  }
  return points
}

/** Une barre par donne : l'équipe qui a marqué, et combien. Le momentum. */
export function momentum(list: DealSummary[]): { deal: number; team: Team; points: number }[] {
  return list
    .filter((d) => d.status !== null && d.scores[0] + d.scores[1] > 0)
    .map((d) => ({
      deal: d.dealNumber,
      team: (d.scores[0] > 0 ? 0 : 1) as Team,
      points: Math.max(d.scores[0], d.scores[1]),
    }))
}

/**
 * Le momentum en cascade : l'écart cumulé (nous − eux) avant et après chaque donne.
 * Chaque barre part de là où la précédente s'est arrêtée : on lit d'un coup d'œil qui
 * mène, et de combien, en plus de ce que chaque donne a rapporté.
 */
export function cascade(
  bars: { deal: number; team: Team; points: number }[],
  nous: Team,
): { deal: number; nous: boolean; points: number; avant: number; apres: number }[] {
  let ecart = 0
  return bars.map((b) => {
    const avant = ecart
    ecart += b.team === nous ? b.points : -b.points
    return { deal: b.deal, nous: b.team === nous, points: b.points, avant, apres: ecart }
  })
}

/** Des durées de réflexion additionnées : la moyenne se déduit, et s'additionne entre parties. */
export interface Chrono {
  total: number
  n: number
  /** La plus longue hésitation */
  max: number
}

export interface Reflexion {
  encheres: Chrono
  cartes: Chrono
}

const chronoVide = (): Chrono => ({ total: 0, n: 0, max: 0 })

/**
 * Temps de réflexion par joueur, pour annoncer et pour jouer une carte. Seuls
 * comptent les temps réellement mesurés (`thinkMs`, depuis le 24/09/2026) : un écart
 * entre deux événements mêlerait l'attente de l'affichage du pli, ou le réseau.
 * La coinche, prise hors tour, n'en a pas.
 */
export function reflexions(events: GameEvent[]): Map<PlayerId, Reflexion> {
  const out = new Map<PlayerId, Reflexion>()
  for (const e of events) {
    if ((e.type !== 'enchere' && e.type !== 'carte_jouee') || e.thinkMs === undefined) continue
    let r = out.get(e.player)
    if (!r) {
      r = { encheres: chronoVide(), cartes: chronoVide() }
      out.set(e.player, r)
    }
    const c = e.type === 'enchere' ? r.encheres : r.cartes
    c.total += e.thinkMs
    c.n += 1
    c.max = Math.max(c.max, e.thinkMs)
  }
  return out
}

/** Additionne deux décomptes : d'une partie à l'autre, pour les statistiques globales. */
export const ajouterChrono = (a: Chrono, b: Chrono): Chrono => ({
  total: a.total + b.total,
  n: a.n + b.n,
  max: Math.max(a.max, b.max),
})

export const moyenne = (c: Chrono): number | null => (c.n ? c.total / c.n : null)

export interface Tally {
  prises: number
  reussies: number
  chutes: number
  /** Points rapportés à son camp en prenant et en réussissant */
  marques: number
  /** Points offerts à l'adversaire en chutant */
  offerts: number
  encheres: number[]
  coinches: number
  belotesAnnoncees: number
  belotesOubliees: number
  etoiles: number
}

const tallyVide = (): Tally => ({
  prises: 0,
  reussies: 0,
  chutes: 0,
  marques: 0,
  offerts: 0,
  encheres: [],
  coinches: 0,
  belotesAnnoncees: 0,
  belotesOubliees: 0,
  etoiles: 0,
})

/** Bilan net : ce qu'on rapporte moins ce qu'on offre. */
export const bilan = (t: Tally): number => t.marques - t.offerts

export const enchereMoyenne = (t: Tally): number | null =>
  t.encheres.length === 0 ? null : Math.round(t.encheres.reduce((s, v) => s + v, 0) / t.encheres.length)

/** Compte par joueur, sur les donnes terminées. */
export function tallies(list: DealSummary[], seating: Seating): Map<PlayerId, Tally> {
  const out = new Map<PlayerId, Tally>()
  const pour = (p: PlayerId): Tally => {
    let t = out.get(p)
    if (!t) {
      t = tallyVide()
      out.set(p, t)
    }
    return t
  }

  for (const d of list) {
    if (d.status === null) continue

    if (d.taker) {
      const t = pour(d.taker)
      t.prises += 1
      t.encheres.push(d.value)
      const camp = teamOfPlayer(d.taker, seating)
      if (d.status === 'chute') {
        t.chutes += 1
        t.offerts += d.scores[camp === 0 ? 1 : 0]
      } else {
        t.reussies += 1
        t.marques += d.scores[camp]
      }
    }
    for (const c of d.coincheurs) pour(c).coinches += 1
    if (d.beloteDeclaredBy) pour(d.beloteDeclaredBy).belotesAnnoncees += 1
    if (d.beloteForgottenBy) pour(d.beloteForgottenBy).belotesOubliees += 1
    if (d.etoile) pour(d.etoile).etoiles += 1
  }
  return out
}

/** Une équipe sur la partie : le tableau « Par équipe » des statistiques. */
export interface TeamTally {
  /** Donnes où l'équipe a marqué des points */
  donnesGagnees: number
  prises: number
  reussies: number
  enchereMoyenne: number | null
  /** Coinches et surcoinches lancées par l'équipe */
  coinches: number
  /** …et gagnées : contrat chuté pour qui coinche, tenu pour qui surcoinche */
  coinchesGagnees: number
  etoiles: number
}

export function teamTallies(list: DealSummary[], seating: Seating): [TeamTally, TeamTally] {
  const vide = (): TeamTally & { encheres: number[] } => ({
    donnesGagnees: 0,
    prises: 0,
    reussies: 0,
    enchereMoyenne: null,
    coinches: 0,
    coinchesGagnees: 0,
    etoiles: 0,
    encheres: [],
  })
  const equipes = [vide(), vide()]
  for (const d of list) {
    if (d.status === null) continue
    for (const t of [0, 1] as const) if (d.scores[t] > 0) equipes[t].donnesGagnees += 1
    if (d.taker) {
      const e = equipes[teamOfPlayer(d.taker, seating)]
      e.prises += 1
      if (d.status !== 'chute') e.reussies += 1
      if (!d.capot && d.value <= 170) e.encheres.push(d.value)
    }
    for (const c of d.coincheurs) {
      const camp = teamOfPlayer(c, seating)
      equipes[camp].coinches += 1
      const campDuPreneur = d.taker !== null && camp === teamOfPlayer(d.taker, seating)
      const chute = d.status === 'chute'
      if (campDuPreneur ? !chute : chute) equipes[camp].coinchesGagnees += 1
    }
    if (d.etoile) equipes[teamOfPlayer(d.etoile, seating)].etoiles += 1
  }
  const fin = ({ encheres, ...e }: TeamTally & { encheres: number[] }): TeamTally => ({
    ...e,
    enchereMoyenne: encheres.length
      ? Math.round(encheres.reduce((s, v) => s + v, 0) / encheres.length)
      : null,
  })
  return [fin(equipes[0]), fin(equipes[1])]
}

/** Plis remportés par équipe sur la donne en cours — pour la bande d'information. */
export function dealsPlayed(list: DealSummary[]): number {
  return list.filter((d) => d.status !== null).length
}
