/**
 * Archive d'une partie terminée.
 *
 * Le journal complet reste la vérité, mais le parcourir pour afficher des
 * statistiques sur des dizaines de parties coûterait cher. À la fin de chaque
 * partie on écrit donc un condensé — quelques centaines d'octets — que la page
 * globale lit directement.
 */
import type { Card } from './cards'
import type { GameEvent } from './events'
import { handStrength } from './strength'
import { finesseTallies, finessesOfGame } from './finesses'
import { type PlayerId, type Seating, teamOfPlayer } from './players'
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
  coinches: number
  /**
   * Coinches et surcoinches gagnées : contrat chuté pour qui coinche, tenu pour qui
   * surcoinche. Absent des archives déposées avant le 24/09/2026.
   */
  coinchesWon?: number
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
}

const empty = (): PlayerArchive => ({
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
  detail: [],
})

/**
 * Construit le condensé. `hands` associe chaque numéro de donne aux quatre mains
 * distribuées, lues dans `deals/{n}` une fois la partie terminée.
 */
export function buildArchive(
  code: string,
  events: GameEvent[],
  seating: Seating,
  hands: Record<number, Record<string, Card[]>>,
  bots: PlayerId[] = [],
): Archive {
  const list = deals(events).filter((d) => d.status !== null)
  const players = Object.fromEntries(seating.map((p) => [p, empty()])) as Record<PlayerId, PlayerArchive>

  for (const d of list) {
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
      players[c].coinches += 1
      const isDown = d.status === 'down'
      const takerTeamIdx = d.taker !== null && teamOfPlayer(c, seating) === teamOfPlayer(d.taker, seating)
      if (takerTeamIdx ? !isDown : isDown) players[c].coinchesWon! += 1
    }
    if (d.beloteDeclaredBy) players[d.beloteDeclaredBy].belotesDeclared += 1
    if (d.beloteForgottenBy) players[d.beloteForgottenBy].belotesForgotten += 1
    if (d.shameStar) players[d.shameStar].shameStars += 1
  }

  for (const [p, r] of thinkTimes(events)) if (players[p]) players[p].thinkTime = r
  for (const [p, r] of bidDistribution(events)) if (players[p]) players[p].calls = r
  for (const [p, r] of takeRoles(events, seating)) if (players[p]) players[p].roles = r
  for (const [p, r] of bidGaps(events, seating)) if (players[p]) players[p].gaps = r
  for (const [p, r] of timesByPlayer(events)) if (players[p]) players[p].times = r

  for (const [p, t] of finesseTallies(finessesOfGame(events, seating[1], seating))) {
    players[p].finesses = t.tried
    players[p].finessesWon = t.made
    players[p].finessesFailed = t.failed
  }

  const scores: [number, number] = [
    list.reduce((s, d) => s + d.scores[0], 0),
    list.reduce((s, d) => s + d.scores[1], 0),
  ]

  return {
    code,
    finishedAt: Date.now(),
    seating,
    scores,
    winner: scores[0] > scores[1] ? 0 : 1,
    deals: list.length,
    bots,
    players,
  }
}
