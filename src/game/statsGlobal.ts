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

/**
 * Les colonnes communes aux tableaux des duos et des joueurs : un duo se lit comme un
 * joueur, avec les prises, coinches et plis de ses deux membres réunis.
 */
export interface Line {
  games: number
  won: number
  averageScore: number
  worstScore: number | null
  deals: number
  /** Donnes gagnées par son camp : son contrat tenu, ou celui de l'adversaire chuté */
  dealsWon: number
  takes: number
  made: number
  scoredPoints: number
  conceded: number
  /** Moyenne des contrats chiffrés pris (capots et générales à part, ils fausseraient tout). */
  averageBid: number | null
  coinches: number
  /** Les archives antérieures au 24/09/2026 ne le connaissent pas : compté comme 0. */
  coinchesWon: number
  /** Capots et générales annoncés, et réussis */
  bigTakes: number
  bigMade: number
  /** Plis ramassés (par le joueur, ou par le duo), sur les plis joués des parties qui les comptent. */
  tricks: number
  tricksPlayed: number
}

/** Un capot ou une générale : la générale (ENC-9) n'a pas le drapeau capot, mais vaut plus que 170. */
export const isBigTake = (d: TakeDetail): boolean => d.capot || d.value > 170

/** Les contrats chiffrés, pour l'enchère moyenne. */
const numberedBids = (p: PlayerArchive): number[] =>
  p.detail.filter((d) => !d.capot && d.value <= 170).map((d) => d.value)

const averageOf = (l: number[]): number | null =>
  l.length ? Math.round(l.reduce((s, v) => s + v, 0) / l.length) : null

/**
 * Ajoute une partie à la ligne d'un camp (`side`, un joueur ou un duo), qui avait le
 * camp `team` et affrontait `against`.
 */
function addGame(
  line: Line,
  bids: number[],
  scores: number[],
  a: Archive,
  side: PlayerId[],
  against: PlayerId[],
  team: 0 | 1,
): void {
  line.games += 1
  if (a.winner === team) line.won += 1
  line.deals += a.deals
  scores.push(a.scores[team])
  // Deux bots du même niveau, partenaires, ne font qu'un joueur une fois regroupés
  // (`groupBots`), et leur condensé contient déjà les deux : on ne l'ajoute qu'une fois.
  const own = [...new Set(side)].map((j) => a.players[j]).filter(Boolean)
  for (const p of own) {
    line.takes += p.takes
    line.made += p.made
    line.scoredPoints += p.scoredPoints
    line.conceded += p.conceded
    line.coinches += p.coinches
    line.coinchesWon += p.coinchesWon ?? 0
    line.bigTakes += p.detail.filter(isBigTake).length
    line.bigMade += p.detail.filter((d) => isBigTake(d) && d.isMade).length
    bids.push(...numberedBids(p))
  }
  // Une donne gagnée : un contrat tenu par son camp, ou un contrat chuté par l'adversaire.
  const partners = [...new Set(teamOf(a, team))].map((j) => a.players[j]).filter(Boolean)
  line.dealsWon += partners.reduce((s, p) => s + p.made, 0)
  line.dealsWon += [...new Set(against)].reduce((s, j) => s + (a.players[j]?.downs ?? 0), 0)
  // Les plis : seulement les parties qui les comptent, toutes à la fois.
  if (a.tricksPlayed !== undefined && own.every((p) => p.tricks !== undefined)) {
    line.tricks += own.reduce((s, p) => s + p.tricks!, 0)
    line.tricksPlayed += a.tricksPlayed
  }
}

const teamOf = (a: Archive, team: 0 | 1): PlayerId[] => pairsOf(a)[team]

const emptyLine = (): Line => ({
  games: 0,
  won: 0,
  averageScore: 0,
  worstScore: null,
  deals: 0,
  dealsWon: 0,
  takes: 0,
  made: 0,
  scoredPoints: 0,
  conceded: 0,
  averageBid: null,
  coinches: 0,
  coinchesWon: 0,
  bigTakes: 0,
  bigMade: 0,
  tricks: 0,
  tricksPlayed: 0,
})

/** Score moyen, pire score et enchère moyenne, une fois toutes les parties ajoutées. */
const closeLine = <T extends Line>(line: T, scores: number[], bids: number[]): T => ({
  ...line,
  averageScore: averageOf(scores) ?? 0,
  worstScore: scores.length ? Math.min(...scores) : null,
  averageBid: averageOf(bids),
})

/** Le classement des pages Duos et Joueurs : parties gagnées, puis bilan par donne. */
export const byWinRate = <T extends Line>(lines: T[]): T[] =>
  [...lines].sort(
    (a, b) =>
      b.won / (b.games || 1) - a.won / (a.games || 1) ||
      (b.scoredPoints - b.conceded) / (b.deals || 1) - (a.scoredPoints - a.conceded) / (a.deals || 1),
  )

export interface DuoStats extends Line {
  pair: Pair
  /** Les paires affrontées : une seule à quatre joueurs, plusieurs au-delà */
  against: Pair[]
}

/** Les deux paires d'une partie, déduites du placement. */
export function pairsOf(a: Archive): [Pair, Pair] {
  return [
    [a.seating[0], a.seating[2]],
    [a.seating[1], a.seating[3]],
  ]
}

export function duoStats(archives: Archive[]): DuoStats[] {
  const out = new Map<string, { d: DuoStats; scores: number[]; bids: number[] }>()

  for (const a of archives) {
    const [pairA, pairB] = pairsOf(a)
    const sides: [Pair, Pair, 0 | 1][] = [
      [pairA, pairB, 0],
      [pairB, pairA, 1],
    ]

    for (const [pair, against, team] of sides) {
      const key = pairKey(pair)
      let acc = out.get(key)
      if (!acc) {
        acc = { d: { ...emptyLine(), pair, against: [] }, scores: [], bids: [] }
        out.set(key, acc)
      }
      if (!acc.d.against.some((x) => pairKey(x) === pairKey(against))) acc.d.against.push(against)
      addGame(acc.d, acc.bids, acc.scores, a, pair, against, team)
    }
  }

  return byWinRate([...out.values()].map(({ d, scores, bids }) => closeLine(d, scores, bids)))
}

export interface PlayerStats extends Line {
  player: PlayerId
  downs: number
  belotesDeclared: number
  belotesForgotten: number
  shameStars: number
  finesses: number
  finessesWon: number
  finessesFailed: number
  panache: number | null
  /** Temps de réflexion moyen, en ms : pour annoncer, pour jouer une carte. Null sans mesure. */
  bidTime: number | null
  cardTime: number | null
}

export function playerStats(archives: Archive[]): PlayerStats[] {
  // Toutes les prises dont on connaît la main, joueur compris : le panache se
  // calcule ensuite pour chacun en excluant ses propres prises de la référence.
  const every = takesWithStrength(archives)

  return byWinRate(
    playersOf(archives).map((player) => {
      const scores: number[] = []
      const bids: number[] = []
      const base = {
        ...emptyLine(),
        player,
        downs: 0,
        belotesDeclared: 0,
        belotesForgotten: 0,
        shameStars: 0,
        finesses: 0,
        finessesWon: 0,
        finessesFailed: 0,
      }
      let bidTiming: Timing = { total: 0, n: 0, max: 0 }
      let cardTiming: Timing = { total: 0, n: 0, max: 0 }
      for (const a of archives) {
        const p = a.players[player]
        if (!p) continue
        const team = teamOfPlayer(player, a.seating)
        addGame(base, bids, scores, a, [player], teamOf(a, team === 0 ? 1 : 0), team)
        base.downs += p.downs
        if (p.thinkTime) {
          bidTiming = addTiming(bidTiming, p.thinkTime.bids)
          cardTiming = addTiming(cardTiming, p.thinkTime.cards)
        }
        base.belotesDeclared += p.belotesDeclared
        base.belotesForgotten += p.belotesForgotten
        base.shameStars += p.shameStars
        base.finesses += p.finesses
        base.finessesWon += p.finessesWon
        base.finessesFailed += p.finessesFailed
      }

      return {
        ...closeLine(base, scores, bids),
        panache: panacheOf(player, every),
        bidTime: average(bidTiming),
        cardTime: average(cardTiming),
      }
    }),
  )
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
    ...(a.tricks !== undefined || b.tricks !== undefined ? { tricks: sum(a.tricks, b.tricks) } : {}),
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
