/**
 * Archive d'une partie terminée.
 *
 * Le journal complet reste la vérité, mais le parcourir pour afficher des
 * statistiques sur des dizaines de parties coûterait cher. À la fin de chaque
 * partie on écrit donc un condensé — quelques centaines d'octets — que la page
 * globale lit directement.
 */
import type { BiddingEntry } from './bidding'
import type { Card } from './cards'
import type { GameEvent } from './events'
import { RULES } from './rules'
import type { DealStatus } from './scoring'
import { handStrength } from './strength'
import { finesseTallies, finessesOfGame } from './finesses'
import { type PlayerId, type Seating, partnerOf, teamOfPlayer } from './players'
import { type ThinkTime, deals, thinkTimes } from './stats'
import {
  type Gaps,
  type BidDistribution,
  type Roles,
  type Times,
  bidGaps,
  bidDistribution,
  takeRoles,
  timesByPlayer,
} from './statsBidding'

/** Une prise, avec la main qui l'a permise — la matière du panache. */
export interface TakeDetail {
  deal: number
  value: number
  /** Force de la main au moment de l'enchère, barème de docs/REGLES.md */
  strength: number | null
  isMade: boolean
  capot: boolean
}

export interface PlayerArchive {
  takes: number
  made: number
  downs: number
  scoredPoints: number
  conceded: number
  /** Coinches et surcoinches posées, hors coinches de désespoir (voir `desperateCoinches`) */
  coinches: number
  /**
   * Coinches et surcoinches gagnées : contrat chuté pour qui coinche, tenu pour qui
   * surcoinche. Absent des archives déposées avant le 24/09/2026.
   */
  coinchesWon?: number
  /**
   * Coinches de désespoir : posées quand le preneur gagnait la partie en faisant son
   * contrat. Elles ne coûtaient rien, on les compte à part. Absent avant le 16/11/2026.
   */
  desperateCoinches?: number
  belotesDeclared: number
  belotesForgotten: number
  shameStars: number
  finesses: number
  finessesWon: number
  finessesFailed: number
  detail: TakeDetail[]
  /** Temps de réflexion mesurés. Absent des archives déposées avant le 24/09/2026. */
  thinkTime?: ThinkTime
  // Absents des archives déposées avant le 25/09/2026 :
  /** Ses prises de parole, par annonce (passe, 80… 170, capot, générale) */
  calls?: BidDistribution
  /** Lanceur, suiveur ou seul, sur les donnes où son équipe avait le contrat */
  roles?: Roles
  /** Points faits moins l'annonce, quand il a pris */
  gaps?: Gaps
  /** Chaque temps de réflexion, en secondes */
  times?: Times
  /** Plis ramassés. Absent des archives déposées avant le 29/10/2026. */
  tricks?: number
}

/**
 * Une donne jouée, en bref : de quoi calculer de nouvelles statistiques (soutien du
 * partenaire, enchères disputées, durées…) sans relire le journal.
 */
export interface ArchiveDeal {
  dealNumber: number
  /** Début de la donne, en ms */
  at: number
  dealer: PlayerId | null
  /** Toutes les paroles, dans l'ordre : passes, enchères, coinche, surcoinche */
  bids: BiddingEntry[]
  taker: PlayerId | null
  value: number
  multiplier: 1 | 2 | 4
  status: DealStatus
  /** Points marqués par chaque équipe */
  scores: [number, number]
  /** La coinche ne coûtait rien : le preneur gagnait la partie en faisant son contrat */
  desperate: boolean
}

export interface Archive {
  code: string
  finishedAt: number
  seating: Seating
  scores: [number, number]
  winner: 0 | 1
  deals: number
  /** Sièges tenus par un bot. Vide pour une partie entre humains. */
  bots: PlayerId[]
  players: Record<PlayerId, PlayerArchive>
  /** La soirée (code de sa première partie). Absente des archives d'avant le 25/09/2026. */
  evening?: string
  /** Points à dépasser, et partie en blitz. Absents : 1000 et partie normale. */
  target?: number
  blitz?: boolean
  /** Plis joués dans la partie, les donnes blitz n'en ont pas. Absent avant le 29/10/2026. */
  tricksPlayed?: number
  /** Première donne distribuée et fin de partie, en ms. Absents avant le 16/11/2026. */
  startedAt?: number
  endedAt?: number
  /** Les donnes jouées, dans l'ordre. Absent avant le 16/11/2026. */
  dealLog?: ArchiveDeal[]
}

const empty = (): PlayerArchive => ({
  takes: 0,
  made: 0,
  downs: 0,
  scoredPoints: 0,
  conceded: 0,
  coinches: 0,
  coinchesWon: 0,
  desperateCoinches: 0,
  belotesDeclared: 0,
  belotesForgotten: 0,
  shameStars: 0,
  finesses: 0,
  finessesWon: 0,
  finessesFailed: 0,
  detail: [],
})

/** Les paroles de chaque donne, et l'heure de sa distribution. */
function auctions(events: GameEvent[]): Map<number, { at: number; bids: BiddingEntry[] }> {
  const out = new Map<number, { at: number; bids: BiddingEntry[] }>()
  let current: { at: number; bids: BiddingEntry[] } | null = null
  for (const e of events) {
    if (e.type === 'deal_started') {
      current = { at: e.at, bids: [] }
      out.set(e.dealNumber, current)
    } else if (!current) continue
    else if (e.type === 'bid') current.bids.push(e.entry)
    else if (e.type === 'coinche' || e.type === 'surcoinche')
      current.bids.push({ kind: e.type, player: e.player })
  }
  return out
}

/**
 * Construit le condensé. `hands` associe chaque numéro de donne aux quatre mains
 * distribuées, lues dans `deals/{n}` une fois la partie terminée ; `target`, l'objectif,
 * sert à reconnaître les coinches de désespoir.
 */
export function buildArchive(
  code: string,
  events: GameEvent[],
  seating: Seating,
  hands: Record<number, Record<string, Card[]>>,
  bots: PlayerId[] = [],
  target: number = RULES.target,
): Archive {
  const list = deals(events).filter((d) => d.status !== null)
  const players = Object.fromEntries(seating.map((p) => [p, empty()])) as Record<PlayerId, PlayerArchive>
  const bidsOf = auctions(events)
  const dealLog: ArchiveDeal[] = []
  // Le score avant chaque donne : de quoi savoir si le preneur gagnait la partie en passant.
  const before: [number, number] = [0, 0]

  for (const d of list) {
    const takerTeam = d.taker ? teamOfPlayer(d.taker, seating) : null
    const desperate = takerTeam !== null && d.coinchers.length > 0 && before[takerTeam] + d.value > target
    dealLog.push({
      dealNumber: d.dealNumber,
      at: bidsOf.get(d.dealNumber)?.at ?? 0,
      dealer: d.dealer,
      bids: bidsOf.get(d.dealNumber)?.bids ?? [],
      taker: d.taker,
      value: d.value,
      multiplier: d.multiplier,
      status: d.status!,
      scores: d.scores,
      desperate,
    })
    before[0] += d.scores[0]
    before[1] += d.scores[1]

    if (d.taker) {
      const a = players[d.taker]
      const team = teamOfPlayer(d.taker, seating)
      const isMade = d.status !== 'down'
      const hand = hands[d.dealNumber]?.[d.taker]
      a.takes += 1
      if (isMade) {
        a.made += 1
        a.scoredPoints += d.scores[team]
      } else {
        a.downs += 1
        a.conceded += d.scores[team === 0 ? 1 : 0]
      }
      a.detail.push({
        deal: d.dealNumber,
        value: d.value,
        strength: hand ? handStrength(hand, d.trump) : null,
        isMade,
        capot: d.capot,
      })
    }
    for (const c of d.coinchers) {
      const isDown = d.status === 'down'
      const takerTeamIdx = d.taker !== null && teamOfPlayer(c, seating) === teamOfPlayer(d.taker, seating)
      // Seule la coinche de la défense peut être de désespoir ; la surcoinche répond.
      if (desperate && !takerTeamIdx) {
        players[c].desperateCoinches! += 1
        continue
      }
      players[c].coinches += 1
      if (takerTeamIdx ? !isDown : isDown) players[c].coinchesWon! += 1
    }
    if (d.beloteDeclaredBy) players[d.beloteDeclaredBy].belotesDeclared += 1
    if (d.beloteForgottenBy) players[d.beloteForgottenBy].belotesForgotten += 1
    // DEC-8 — l'étoile revient à l'équipe : ses deux joueurs la portent (depuis le 20/10/2026).
    if (d.shameStar) {
      players[d.shameStar].shameStars += 1
      const partner = partnerOf(d.shameStar, seating)
      if (players[partner]) players[partner].shameStars += 1
    }
  }

  for (const [p, r] of thinkTimes(events)) if (players[p]) players[p].thinkTime = r
  for (const [p, r] of bidDistribution(events)) if (players[p]) players[p].calls = r
  for (const [p, r] of takeRoles(events, seating)) if (players[p]) players[p].roles = r
  for (const [p, r] of bidGaps(events, seating)) if (players[p]) players[p].gaps = r
  for (const [p, r] of timesByPlayer(events)) if (players[p]) players[p].times = r

  const tricks = events.filter((e) => e.type === 'trick_done')
  for (const p of Object.values(players)) p.tricks = 0
  for (const e of tricks) if (players[e.winner]) players[e.winner].tricks! += 1

  for (const [p, t] of finesseTallies(finessesOfGame(events, seating[1], seating))) {
    players[p].finesses = t.tried
    players[p].finessesWon = t.made
    players[p].finessesFailed = t.failed
  }

  const scores: [number, number] = [
    list.reduce((s, d) => s + d.scores[0], 0),
    list.reduce((s, d) => s + d.scores[1], 0),
  ]

  const gameOver = events.find((e) => e.type === 'game_over')
  return {
    code,
    finishedAt: Date.now(),
    ...(dealLog.length ? { startedAt: dealLog[0].at } : {}),
    ...(gameOver ? { endedAt: gameOver.at } : {}),
    dealLog,
    seating,
    scores,
    winner: scores[0] > scores[1] ? 0 : 1,
    deals: list.length,
    tricksPlayed: tricks.length,
    bots,
    players,
  }
}
