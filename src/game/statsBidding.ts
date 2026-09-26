/**
 * Statistiques des enchères et du temps, par joueur, depuis le journal d'une partie.
 *
 * - la répartition de ses annonces, à chaque prise de parole (pas seulement la finale) ;
 * - lanceur, suiveur ou seul, sur les donnes où son équipe a le contrat ;
 * - l'écart entre les points faits et l'annonce, quand il a pris ;
 * - ses temps de réflexion, un par décision, pour en tracer la distribution.
 *
 * Pur : ni Firestore ni Vue. Les mêmes fonctions servent à la partie en cours et à
 * l'archive déposée en fin de partie, que les statistiques globales additionnent.
 */
import type { BiddingEntry, Declaration } from './bidding'
import type { GameEvent } from './events'
import { type PlayerId, type Seating, teamOfPlayer } from './players'

/** Les annonces possibles à son tour de parole, dans l'ordre de l'échelle. */
export const BID_CATEGORIES = [
  'pass',
  '80',
  '90',
  '100',
  '110',
  '120',
  '130',
  '140',
  '150',
  '160',
  '170',
  'capot',
  'generale',
] as const
export type BidCategory = (typeof BID_CATEGORIES)[number]
/** Les paliers seuls, sans la passe : l'axe des courbes. */
export const BID_LEVELS: BidCategory[] = BID_CATEGORIES.filter((c) => c !== 'pass')

export const BID_LABEL: Record<BidCategory, string> = Object.fromEntries(
  BID_CATEGORIES.map((c) => [
    c,
    c === 'pass' ? 'Passe' : c === 'capot' ? 'Capot' : c === 'generale' ? 'Gén.' : c,
  ]),
) as Record<BidCategory, string>

export type BidDistribution = Partial<Record<BidCategory, number>>

/** La catégorie d'une prise de parole ; nulle pour une coinche, qui se dit hors tour. */
export function bidCategory(entry: BiddingEntry): BidCategory | null {
  switch (entry.kind) {
    case 'pass':
      return 'pass'
    case 'capot':
      return 'capot'
    case 'generale':
      return 'generale'
    case 'contract': {
      const c = String(entry.value) as BidCategory
      return (BID_CATEGORIES as readonly string[]).includes(c) ? c : null
    }
    default:
      return null
  }
}

/** Chaque prise de parole de chaque joueur, comptée par catégorie. */
export function bidDistribution(events: GameEvent[]): Map<PlayerId, BidDistribution> {
  const out = new Map<PlayerId, BidDistribution>()
  for (const e of events) {
    if (e.type !== 'bid') continue
    const c = bidCategory(e.entry)
    if (!c) continue
    const r = out.get(e.player) ?? {}
    r[c] = (r[c] ?? 0) + 1
    out.set(e.player, r)
  }
  return out
}

export interface Roles {
  /** Premier de son équipe à annoncer la couleur finale, suivi ensuite par son partenaire */
  opener: number
  /** A monté dans la couleur que son partenaire avait lancée */
  follower: number
  /** A annoncé la couleur finale sans que son partenaire ne la suive jamais */
  alone: number
}
export const emptyRoles = (): Roles => ({ opener: 0, follower: 0, alone: 0 })

/** La couleur (ou SA, TA) d'une annonce chiffrée, d'un capot ou d'une générale. */
function declarationOf(entry: BiddingEntry): Declaration | null {
  if (entry.kind === 'contract') return entry.suit
  if (entry.kind === 'capot' || entry.kind === 'generale') return entry.declaration
  return null
}

/**
 * Sur chaque donne où son équipe a le contrat : qui a ouvert la couleur finale. Le
 * premier de l'équipe à l'avoir annoncée est le lanceur, quelles que soient les
 * relances ensuite (« A 80♠, B 90♠, A 100♠ » : A lance, B suit).
 */
export function takeRoles(events: GameEvent[], seating: Seating): Map<PlayerId, Roles> {
  const out = new Map<PlayerId, Roles>()
  const tallyFor = (p: PlayerId): Roles => {
    let r = out.get(p)
    if (!r) {
      r = emptyRoles()
      out.set(p, r)
    }
    return r
  }
  let callList: BiddingEntry[] = []
  for (const e of events) {
    if (e.type === 'deal_started') callList = []
    else if (e.type === 'bid') callList.push(e.entry)
    else if (e.type === 'contract_set') {
      const finalDeclaration = e.declaration ?? e.trump
      if (!finalDeclaration) continue
      const team = teamOfPlayer(e.taker, seating)
      const inSuit = callList.filter(
        (b) => declarationOf(b) === finalDeclaration && teamOfPlayer(b.player, seating) === team,
      )
      const order = [...new Set(inSuit.map((b) => b.player))]
      if (order.length === 0) continue
      if (order.length === 1) tallyFor(order[0]).alone += 1
      else {
        tallyFor(order[0]).opener += 1
        tallyFor(order[1]).follower += 1
      }
    }
  }
  return out
}

export interface Gaps {
  /** Points faits moins l'annonce, contrat réussi (≥ 0) */
  madeGaps: number[]
  /** Points faits moins l'annonce, contrat chuté (le plus souvent < 0) */
  downs: number[]
}
export const emptyGaps = (): Gaps => ({ madeGaps: [], downs: [] })

/**
 * Pour le preneur : les points faits (cartes, dix de der, belote) moins la valeur
 * annoncée. Capots et générales à part : ils ne se jouent pas aux points.
 */
export function bidGaps(events: GameEvent[], seating: Seating): Map<PlayerId, Gaps> {
  const out = new Map<PlayerId, Gaps>()
  let contract: { taker: PlayerId; value: number; onPoints: boolean } | null = null
  for (const e of events) {
    if (e.type === 'deal_started') contract = null
    else if (e.type === 'contract_set')
      contract = { taker: e.taker, value: e.value, onPoints: !e.capot && !e.generale }
    else if (e.type === 'deal_done' && contract?.onPoints && !e.blitz) {
      const playedTricks = e.compared[teamOfPlayer(contract.taker, seating)]
      const r = out.get(contract.taker) ?? emptyGaps()
      if (e.status === 'down') r.downs.push(playedTricks - contract.value)
      else r.madeGaps.push(playedTricks - contract.value)
      out.set(contract.taker, r)
    }
  }
  return out
}

export interface Times {
  /** Secondes, au dixième, pour chaque enchère prise à son tour */
  bids: number[]
  /** Secondes, au dixième, pour chaque carte jouée */
  cards: number[]
}
export const emptyTimes = (): Times => ({ bids: [], cards: [] })

/** Chaque temps de réflexion mesuré, en secondes : de quoi en tracer la distribution. */
export function timesByPlayer(events: GameEvent[]): Map<PlayerId, Times> {
  const out = new Map<PlayerId, Times>()
  for (const e of events) {
    if ((e.type !== 'bid' && e.type !== 'card_played') || e.thinkMs === undefined) continue
    const t = out.get(e.player) ?? emptyTimes()
    ;(e.type === 'bid' ? t.bids : t.cards).push(Math.round(e.thinkMs / 100) / 10)
    out.set(e.player, t)
  }
  return out
}

// --- Distributions : les courbes des écrans de statistiques.

/** Une tranche d'une distribution : son étiquette, et la part des valeurs qui y tombent. */
export interface Bucket {
  label: string
  /** Part en pourcentage, de 0 à 100 */
  share: number
  count: number
}

/** Répartit des valeurs dans des tranches [bornes[i], bornes[i+1]) ; la dernière est ouverte. */
export function histogram(
  values: number[],
  bounds: number[],
  label: (a: number, b: number | null) => string,
): Bucket[] {
  const n = values.length
  return bounds.map((a, i) => {
    const b = i + 1 < bounds.length ? bounds[i + 1] : null
    const count = values.filter((v) => v >= a && (b === null || v < b)).length
    return { label: label(a, b), share: n ? (100 * count) / n : 0, count }
  })
}

/** Les tranches des temps de réflexion, en secondes. */
export const TIME_BOUNDS = [0, 2, 5, 10, 20, 40]
export const timeLabel = (a: number, b: number | null): string =>
  b === null ? `> ${a}` : a === 0 ? `< ${b}` : `${a}–${b}`

/** Les tranches des écarts à l'annonce, de 10 en 10. */
export const GAP_BOUNDS = [-Infinity, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50]
export const gapLabel = (a: number, b: number | null): string =>
  a === -Infinity ? `< ${b}` : b === null ? `≥ ${a}` : a >= 0 ? `+${a}` : `${a}`

export const averageOf = (v: number[]): number | null =>
  v.length ? v.reduce((s, x) => s + x, 0) / v.length : null

/** L'enchère moyenne d'un joueur sur les paliers chiffrés, hors capot et générale. */
export function averageBidOf(r: BidDistribution): number | null {
  let total = 0
  let n = 0
  for (const c of BID_LEVELS) {
    if (c === 'capot' || c === 'generale') continue
    const k = r[c] ?? 0
    total += Number(c) * k
    n += k
  }
  return n ? total / n : null
}

/** Additionne deux répartitions : d'une partie à l'autre, pour les statistiques globales. */
export function addDistribution(a: BidDistribution, b: BidDistribution): BidDistribution {
  const out: BidDistribution = { ...a }
  for (const c of BID_CATEGORIES) if (b[c]) out[c] = (out[c] ?? 0) + b[c]!
  return out
}
