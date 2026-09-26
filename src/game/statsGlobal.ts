/**
 * Statistiques sur toutes les parties, agrégées depuis les archives.
 *
 * Pur : on ne relit jamais le journal ici. Chaque partie terminée a déposé son
 * condensé, et c'est lui qu'on additionne.
 */
import type { Archive, PlayerArchive, TakeDetail } from './archive'
import { type TakeStrength, panacheOf } from './strength'
import { PLAYER_IDS, type PlayerId, type Seating, isBotId, levelOfBotId, teamOfPlayer } from './players'
import { type Timing, addTiming, average } from './stats'
import {
  type Gaps,
  type BidDistribution,
  type Roles,
  type Times,
  addDistribution,
  emptyGaps,
  emptyRoles,
  emptyTimes,
} from './statsBidding'

export type Pair = [PlayerId, PlayerId]

/** Toutes les paires possibles entre ces joueurs. */
export const pairsBetween = (players: readonly PlayerId[]): Pair[] =>
  players.flatMap((a, i) => players.slice(i + 1).map((b) => [a, b] as Pair))

/** Les six paires possibles entre les quatre du départ. */
export const PAIRS: Pair[] = pairsBetween(PLAYER_IDS)

export const pairKey = (p: Pair): string => [...p].sort().join('+')

/**
 * Les joueurs qui ont au moins une partie archivée : les quatre du départ en tête,
 * puis les autres dans l'ordre de leur première partie.
 */
export function playersOf(archives: Archive[]): PlayerId[] {
  const seenSet = new Set<PlayerId>()
  for (const a of [...archives].sort((x, y) => x.finishedAt - y.finishedAt))
    for (const p of a.seating) seenSet.add(p)
  return [...PLAYER_IDS.filter((p) => seenSet.has(p)), ...[...seenSet].filter((p) => !PLAYER_IDS.includes(p))]
}

/** Les paires qui ont joué ensemble au moins une fois. */
export function pairsPlayed(archives: Archive[]): Pair[] {
  const keys = new Set(duoStats(archives).map((d) => pairKey(d.pair)))
  return pairsBetween(playersOf(archives)).filter((p) => keys.has(pairKey(p)))
}

export interface DuoStats {
  pair: Pair
  /** Les paires affrontées : une seule à quatre joueurs, plusieurs au-delà */
  against: Pair[]
  games: number
  won: number
  deals: number
  dealsWon: number
  takes: number
  made: number
  scoredPoints: number
  conceded: number
  averageScore: number
  worstScore: number | null
}

const emptyPair = (pair: Pair): DuoStats => ({
  pair,
  against: [],
  games: 0,
  won: 0,
  deals: 0,
  dealsWon: 0,
  takes: 0,
  made: 0,
  scoredPoints: 0,
  conceded: 0,
  averageScore: 0,
  worstScore: null,
})

/** Les deux paires d'une partie, déduites du placement. */
export function pairsOf(a: Archive): [Pair, Pair] {
  return [
    [a.seating[0], a.seating[2]],
    [a.seating[1], a.seating[3]],
  ]
}

export function duoStats(archives: Archive[]): DuoStats[] {
  const out = new Map<string, DuoStats & { scores: number[] }>()

  for (const a of archives) {
    const [pairA, pairB] = pairsOf(a)
    const sides: [Pair, Pair, 0 | 1][] = [
      [pairA, pairB, 0],
      [pairB, pairA, 1],
    ]

    for (const [pair, against, team] of sides) {
      const key = pairKey(pair)
      let d = out.get(key)
      if (!d) {
        d = { ...emptyPair(pair), scores: [] }
        out.set(key, d)
      }
      if (!d.against.some((x) => pairKey(x) === pairKey(against))) d.against.push(against)

      d.games += 1
      if (a.winner === team) d.won += 1
      d.deals += a.deals
      d.scores.push(a.scores[team])
      d.worstScore = d.worstScore === null ? a.scores[team] : Math.min(d.worstScore, a.scores[team])

      // Deux bots du même niveau, partenaires, ne font qu'un joueur une fois regroupés
      // (`groupBots`), et leur condensé contient déjà les deux : on ne l'ajoute qu'une fois.
      for (const j of new Set(pair)) {
        const p = a.players[j]
        d.takes += p.takes
        d.made += p.made
        d.scoredPoints += p.scoredPoints
        d.conceded += p.conceded
        // Une donne gagnée : son propre contrat tenu…
        d.dealsWon += p.made
      }
      // … ou celui de l'adversaire chuté.
      for (const j of new Set(against)) d.dealsWon += a.players[j].downs
    }
  }

  return [...out.values()]
    .map(({ scores, ...d }) => ({
      ...d,
      averageScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
    }))
    .sort((a, b) => b.won / (b.games || 1) - a.won / (a.games || 1))
}

export interface PlayerStats {
  player: PlayerId
  games: number
  won: number
  averageScore: number
  worstScore: number | null
  deals: number
  takes: number
  made: number
  downs: number
  scoredPoints: number
  conceded: number
  coinches: number
  /** Les archives antérieures au 24/09/2026 ne le connaissent pas : compté comme 0. */
  coinchesWon: number
  belotesDeclared: number
  belotesForgotten: number
  shameStars: number
  finesses: number
  finessesWon: number
  finessesFailed: number
  panache: number | null
  /** Moyenne des contrats chiffrés pris (capots et générales à part, ils fausseraient tout). */
  averageBid: number | null
  /** Temps de réflexion moyen, en ms : pour annoncer, pour jouer une carte. Null sans mesure. */
  bidTime: number | null
  cardTime: number | null
}

export function playerStats(archives: Archive[]): PlayerStats[] {
  // Toutes les prises dont on connaît la main, joueur compris : le panache se
  // calcule ensuite pour chacun en excluant ses propres prises de la référence.
  const every = takesWithStrength(archives)

  return playersOf(archives)
    .map((player) => {
      const scores: number[] = []
      const base = {
        player,
        games: 0,
        won: 0,
        deals: 0,
        takes: 0,
        made: 0,
        downs: 0,
        scoredPoints: 0,
        conceded: 0,
        coinches: 0,
        coinchesWon: 0,
        belotesDeclared: 0,
        belotesForgotten: 0,
        shameStars: 0,
        finesses: 0,
        finessesWon: 0,
        finessesFailed: 0,
      }
      const bids: number[] = []
      let bidTiming: Timing = { total: 0, n: 0, max: 0 }
      let cardTiming: Timing = { total: 0, n: 0, max: 0 }
      for (const a of archives) {
        const p = a.players[player]
        if (!p) continue
        const team = teamOfPlayer(player, a.seating)
        base.games += 1
        if (a.winner === team) base.won += 1
        base.deals += a.deals
        scores.push(a.scores[team])
        base.takes += p.takes
        base.made += p.made
        base.downs += p.downs
        base.scoredPoints += p.scoredPoints
        base.conceded += p.conceded
        base.coinches += p.coinches
        base.coinchesWon += p.coinchesWon ?? 0
        if (p.thinkTime) {
          bidTiming = addTiming(bidTiming, p.thinkTime.bids)
          cardTiming = addTiming(cardTiming, p.thinkTime.cards)
        }
        bids.push(...p.detail.filter((d) => !d.capot && d.value <= 170).map((d) => d.value))
        base.belotesDeclared += p.belotesDeclared
        base.belotesForgotten += p.belotesForgotten
        base.shameStars += p.shameStars
        base.finesses += p.finesses
        base.finessesWon += p.finessesWon
        base.finessesFailed += p.finessesFailed
      }

      return {
        ...base,
        averageScore: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
        worstScore: scores.length ? Math.min(...scores) : null,
        panache: panacheOf(player, every),
        averageBid: bids.length ? Math.round(bids.reduce((s, v) => s + v, 0) / bids.length) : null,
        bidTime: average(bidTiming),
        cardTime: average(cardTiming),
      }
    })
    .sort((a, b) => b.won / (b.games || 1) - a.won / (a.games || 1))
}

/** L'en-tête de la page : combien de parties, de donnes, de prises, et depuis quand. */
export function globalSummary(archives: Archive[]): {
  games: number
  deals: number
  takes: number
  since: number | null
} {
  return {
    games: archives.length,
    deals: archives.reduce((s, a) => s + a.deals, 0),
    takes: archives.reduce((s, a) => s + Object.values(a.players).reduce((t, p) => t + p.takes, 0), 0),
    since: archives.length ? Math.min(...archives.map((a) => a.finishedAt)) : null,
  }
}

/** Toutes les prises dont la force est connue, pour la référence du groupe. */
export function takesWithStrength(archives: Archive[]): TakeStrength[] {
  return archives.flatMap((a) =>
    Object.entries(a.players).flatMap(([p, j]) =>
      j.detail
        .filter((d): d is TakeDetail & { strength: number } => d.strength !== null)
        .map((d) => ({ player: p, strength: d.strength, value: d.value })),
    ),
  )
}

/** Paliers d'enchère, capot compris, pour les barres. */
export const BID_LEVELS = [80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 'capot'] as const
export type Tier = (typeof BID_LEVELS)[number]

const tierOf = (d: TakeDetail): Tier => (d.capot ? 'capot' : (d.value as Tier))

/** Contrats pris et réussis par palier, pour un joueur ou pour tout le monde. */
export function byTier(
  archives: Archive[],
  who: PlayerId[] = playersOf(archives),
): { tier: Tier; madeGaps: number; downs: number }[] {
  const tally = new Map<Tier, { madeGaps: number; downs: number }>()
  for (const p of BID_LEVELS) tally.set(p, { madeGaps: 0, downs: 0 })

  for (const a of archives) {
    for (const j of who) {
      for (const d of a.players[j]?.detail ?? []) {
        const c = tally.get(tierOf(d))
        if (!c) continue
        if (d.isMade) c.madeGaps += 1
        else c.downs += 1
      }
    }
  }
  return BID_LEVELS.map((tier) => ({ tier, ...tally.get(tier)! }))
}

/** Toutes les prises d'un joueur, pour le nuage force × annonce. */
export function takesOf(archives: Archive[], player: PlayerId): TakeDetail[] {
  return archives.flatMap((a) => a.players[player]?.detail ?? []).filter((d) => d.strength !== null)
}

// --- Les bots regroupés par niveau, et les nouvelles statistiques d'enchères et de temps.

/**
 * La clé d'un joueur dans les statistiques globales : tous les bots d'un même niveau
 * n'en font qu'un, « Bot » ou « Bot ★ ». Sans cela, chaque « bot-simple-2 » faisait
 * sa propre ligne.
 */
export const playerKey = (p: PlayerId): PlayerId =>
  isBotId(p) ? (levelOfBotId(p) === 'expert' ? 'bot-expert' : 'bot-basic') : p

/** Deux condensés du même joueur réunis : deux bots du même niveau dans une partie. */
function merge(a: PlayerArchive, b: PlayerArchive): PlayerArchive {
  const sum = (x?: number, y?: number) => (x ?? 0) + (y ?? 0)
  const lists = <T>(x?: T[], y?: T[]) => [...(x ?? []), ...(y ?? [])]
  return {
    takes: a.takes + b.takes,
    made: a.made + b.made,
    downs: a.downs + b.downs,
    scoredPoints: a.scoredPoints + b.scoredPoints,
    conceded: a.conceded + b.conceded,
    coinches: a.coinches + b.coinches,
    coinchesWon: sum(a.coinchesWon, b.coinchesWon),
    belotesDeclared: a.belotesDeclared + b.belotesDeclared,
    belotesForgotten: a.belotesForgotten + b.belotesForgotten,
    shameStars: a.shameStars + b.shameStars,
    finesses: a.finesses + b.finesses,
    finessesWon: a.finessesWon + b.finessesWon,
    finessesFailed: a.finessesFailed + b.finessesFailed,
    detail: lists(a.detail, b.detail),
    ...(a.thinkTime || b.thinkTime
      ? {
          thinkTime: {
            bids: addTiming(
              a.thinkTime?.bids ?? { total: 0, n: 0, max: 0 },
              b.thinkTime?.bids ?? { total: 0, n: 0, max: 0 },
            ),
            cards: addTiming(
              a.thinkTime?.cards ?? { total: 0, n: 0, max: 0 },
              b.thinkTime?.cards ?? { total: 0, n: 0, max: 0 },
            ),
          },
        }
      : {}),
    ...(a.calls || b.calls ? { calls: addDistribution(a.calls ?? {}, b.calls ?? {}) } : {}),
    ...(a.roles || b.roles
      ? {
          roles: {
            opener: sum(a.roles?.opener, b.roles?.opener),
            follower: sum(a.roles?.follower, b.roles?.follower),
            alone: sum(a.roles?.alone, b.roles?.alone),
          },
        }
      : {}),
    ...(a.gaps || b.gaps
      ? {
          gaps: {
            madeGaps: lists(a.gaps?.madeGaps, b.gaps?.madeGaps),
            downs: lists(a.gaps?.downs, b.gaps?.downs),
          },
        }
      : {}),
    ...(a.times || b.times
      ? {
          times: {
            bids: lists(a.times?.bids, b.times?.bids),
            cards: lists(a.times?.cards, b.times?.cards),
          },
        }
      : {}),
  }
}

/** Les archives vues par les statistiques globales : bots regroupés par niveau. */
export function groupBots(archives: Archive[]): Archive[] {
  return archives.map((a) => {
    if (!a.seating.some(isBotId)) return a
    const players: Record<PlayerId, PlayerArchive> = {}
    for (const [p, v] of Object.entries(a.players)) {
      const k = playerKey(p)
      players[k] = players[k] ? merge(players[k], v) : v
    }
    return {
      ...a,
      seating: a.seating.map(playerKey) as unknown as Seating,
      bots: [...new Set((a.bots ?? []).map(playerKey))],
      players,
    }
  })
}

/** Les annonces de chacun, toutes parties confondues. */
export function globalCalls(archives: Archive[]): Map<PlayerId, BidDistribution> {
  const out = new Map<PlayerId, BidDistribution>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (v.calls) out.set(p, addDistribution(out.get(p) ?? {}, v.calls))
    }
  }
  return out
}

export function globalRoles(archives: Archive[]): Map<PlayerId, Roles> {
  const out = new Map<PlayerId, Roles>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (!v.roles) continue
      const r = out.get(p) ?? emptyRoles()
      out.set(p, {
        opener: r.opener + v.roles.opener,
        follower: r.follower + v.roles.follower,
        alone: r.alone + v.roles.alone,
      })
    }
  }
  return out
}

export function globalGaps(archives: Archive[]): Map<PlayerId, Gaps> {
  const out = new Map<PlayerId, Gaps>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (!v.gaps) continue
      const r = out.get(p) ?? emptyGaps()
      out.set(p, { madeGaps: [...r.madeGaps, ...v.gaps.madeGaps], downs: [...r.downs, ...v.gaps.downs] })
    }
  }
  return out
}

export function globalTimes(archives: Archive[]): Map<PlayerId, Times> {
  const out = new Map<PlayerId, Times>()
  for (const a of archives) {
    for (const [p, v] of Object.entries(a.players)) {
      if (!v.times) continue
      const r = out.get(p) ?? emptyTimes()
      out.set(p, { bids: [...r.bids, ...v.times.bids], cards: [...r.cards, ...v.times.cards] })
    }
  }
  return out
}

/**
 * Les soirées : les parties enchaînées avec « Rejouer » partagent la même. Les plus
 * récentes d'abord ; une partie sans soirée connue (avant le 25/09/2026) est la sienne.
 */
export interface Evening {
  key: string
  start: number
  end: number
  games: Archive[]
  /** Victoires par paire, sur la soirée */
  victories: { pair: Pair; won: number }[]
}
export function evenings(archives: Archive[]): Evening[] {
  const groups = new Map<string, Archive[]>()
  for (const a of archives) {
    const key = a.evening ?? a.code
    groups.set(key, [...(groups.get(key) ?? []), a])
  }
  return [...groups.entries()]
    .map(([key, games]) => {
      const sort = [...games].sort((x, y) => x.finishedAt - y.finishedAt)
      const victories = new Map<string, { pair: Pair; won: number }>()
      for (const a of sort) {
        for (const [pair, team] of [
          [pairsOf(a)[0], 0],
          [pairsOf(a)[1], 1],
        ] as const) {
          const k = pairKey(pair)
          const v = victories.get(k) ?? { pair, won: 0 }
          if (a.winner === team) v.won += 1
          victories.set(k, v)
        }
      }
      return {
        key,
        start: sort[0].finishedAt,
        end: sort.at(-1)!.finishedAt,
        games: sort,
        victories: [...victories.values()].sort((x, y) => y.won - x.won),
      }
    })
    .sort((x, y) => y.end - x.end)
}
