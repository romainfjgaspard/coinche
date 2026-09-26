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
  coinchers: PlayerId[]
  beloteDeclaredBy: PlayerId | null
  beloteForgottenBy: PlayerId | null
  shameStar: PlayerId | null
}

const empty = (dealNumber: number, dealer: PlayerId | null): DealSummary => ({
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
  coinchers: [],
  beloteDeclaredBy: null,
  beloteForgottenBy: null,
  shameStar: null,
})

/** Découpe le journal en donnes, y compris celle en cours. */
export function deals(events: GameEvent[]): DealSummary[] {
  const out: DealSummary[] = []
  let currentOne: DealSummary | null = null

  for (const e of events) {
    switch (e.type) {
      case 'deal_started':
        if (currentOne) out.push(currentOne)
        currentOne = empty(e.dealNumber, e.dealer)
        break
      case 'contract_set':
        if (currentOne) {
          currentOne.taker = e.taker
          currentOne.value = e.value
          currentOne.trump = e.trump
          currentOne.multiplier = e.multiplier
          currentOne.capot = e.capot
        }
        break
      case 'coinche':
      case 'surcoinche':
        currentOne?.coinchers.push(e.player)
        break
      case 'deal_done':
        if (currentOne) {
          currentOne.status = e.status
          currentOne.scores = e.scores
          currentOne.cardPoints = e.cardPoints
          currentOne.beloteDeclaredBy = e.beloteDeclaredBy
          currentOne.beloteForgottenBy = e.beloteForgottenBy
          currentOne.shameStar = e.shameStar
        }
        break
    }
  }
  if (currentOne) out.push(currentOne)
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
  us: Team,
): { deal: number; us: boolean; points: number; before: number; after: number }[] {
  let gap = 0
  return bars.map((b) => {
    const before = gap
    gap += b.team === us ? b.points : -b.points
    return { deal: b.deal, us: b.team === us, points: b.points, before, after: gap }
  })
}

/** Des durées de réflexion additionnées : la moyenne se déduit, et s'additionne entre parties. */
export interface Timing {
  total: number
  n: number
  /** La plus longue hésitation */
  max: number
}

export interface ThinkTime {
  bids: Timing
  cards: Timing
}

const emptyTiming = (): Timing => ({ total: 0, n: 0, max: 0 })

/**
 * Temps de réflexion par joueur, pour annoncer et pour jouer une carte. Seuls
 * comptent les temps réellement mesurés (`thinkMs`, depuis le 24/09/2026) : un écart
 * entre deux événements mêlerait l'attente de l'affichage du pli, ou le réseau.
 * La coinche, prise hors tour, n'en a pas.
 */
export function thinkTimes(events: GameEvent[]): Map<PlayerId, ThinkTime> {
  const out = new Map<PlayerId, ThinkTime>()
  for (const e of events) {
    if ((e.type !== 'bid' && e.type !== 'card_played') || e.thinkMs === undefined) continue
    let r = out.get(e.player)
    if (!r) {
      r = { bids: emptyTiming(), cards: emptyTiming() }
      out.set(e.player, r)
    }
    const c = e.type === 'bid' ? r.bids : r.cards
    c.total += e.thinkMs
    c.n += 1
    c.max = Math.max(c.max, e.thinkMs)
  }
  return out
}

/** Additionne deux décomptes : d'une partie à l'autre, pour les statistiques globales. */
export const addTiming = (a: Timing, b: Timing): Timing => ({
  total: a.total + b.total,
  n: a.n + b.n,
  max: Math.max(a.max, b.max),
})

export const average = (c: Timing): number | null => (c.n ? c.total / c.n : null)

export interface Tally {
  takes: number
  made: number
  downs: number
  /** Points rapportés à son camp en prenant et en réussissant */
  scoredPoints: number
  /** Points offerts à l'adversaire en chutant */
  conceded: number
  bids: number[]
  coinches: number
  belotesDeclared: number
  belotesForgotten: number
  shameStars: number
}

const emptyTally = (): Tally => ({
  takes: 0,
  made: 0,
  downs: 0,
  scoredPoints: 0,
  conceded: 0,
  bids: [],
  coinches: 0,
  belotesDeclared: 0,
  belotesForgotten: 0,
  shameStars: 0,
})

/** Bilan net : ce qu'on rapporte moins ce qu'on offre. */
export const balance = (t: Tally): number => t.scoredPoints - t.conceded

export const averageBid = (t: Tally): number | null =>
  t.bids.length === 0 ? null : Math.round(t.bids.reduce((s, v) => s + v, 0) / t.bids.length)

/** Compte par joueur, sur les donnes terminées. */
export function tallies(list: DealSummary[], seating: Seating): Map<PlayerId, Tally> {
  const out = new Map<PlayerId, Tally>()
  const tallyFor = (p: PlayerId): Tally => {
    let t = out.get(p)
    if (!t) {
      t = emptyTally()
      out.set(p, t)
    }
    return t
  }

  for (const d of list) {
    if (d.status === null) continue

    if (d.taker) {
      const t = tallyFor(d.taker)
      t.takes += 1
      t.bids.push(d.value)
      const team = teamOfPlayer(d.taker, seating)
      if (d.status === 'down') {
        t.downs += 1
        t.conceded += d.scores[team === 0 ? 1 : 0]
      } else {
        t.made += 1
        t.scoredPoints += d.scores[team]
      }
    }
    for (const c of d.coinchers) tallyFor(c).coinches += 1
    if (d.beloteDeclaredBy) tallyFor(d.beloteDeclaredBy).belotesDeclared += 1
    if (d.beloteForgottenBy) tallyFor(d.beloteForgottenBy).belotesForgotten += 1
    if (d.shameStar) tallyFor(d.shameStar).shameStars += 1
  }
  return out
}

/** Une équipe sur la partie : le tableau « Par équipe » des statistiques. */
export interface TeamTally {
  /** Donnes où l'équipe a marqué des points */
  dealsWon: number
  takes: number
  made: number
  averageBid: number | null
  /** Coinches et surcoinches lancées par l'équipe */
  coinches: number
  /** …et gagnées : contrat chuté pour qui coinche, tenu pour qui surcoinche */
  coinchesWon: number
  shameStars: number
}

export function teamTallies(list: DealSummary[], seating: Seating): [TeamTally, TeamTally] {
  const empty = (): TeamTally & { bids: number[] } => ({
    dealsWon: 0,
    takes: 0,
    made: 0,
    averageBid: null,
    coinches: 0,
    coinchesWon: 0,
    shameStars: 0,
    bids: [],
  })
  const teams = [empty(), empty()]
  for (const d of list) {
    if (d.status === null) continue
    for (const t of [0, 1] as const) if (d.scores[t] > 0) teams[t].dealsWon += 1
    if (d.taker) {
      const e = teams[teamOfPlayer(d.taker, seating)]
      e.takes += 1
      if (d.status !== 'down') e.made += 1
      if (!d.capot && d.value <= 170) e.bids.push(d.value)
    }
    for (const c of d.coinchers) {
      const team = teamOfPlayer(c, seating)
      teams[team].coinches += 1
      const takerTeamIdx = d.taker !== null && team === teamOfPlayer(d.taker, seating)
      const isDown = d.status === 'down'
      if (takerTeamIdx ? !isDown : isDown) teams[team].coinchesWon += 1
    }
    if (d.shameStar) teams[teamOfPlayer(d.shameStar, seating)].shameStars += 1
  }
  const end = ({ bids, ...e }: TeamTally & { bids: number[] }): TeamTally => ({
    ...e,
    averageBid: bids.length ? Math.round(bids.reduce((s, v) => s + v, 0) / bids.length) : null,
  })
  return [end(teams[0]), end(teams[1])]
}

/** Plis remportés par équipe sur la donne en cours — pour la bande d'information. */
export function dealsPlayed(list: DealSummary[]): number {
  return list.filter((d) => d.status !== null).length
}
