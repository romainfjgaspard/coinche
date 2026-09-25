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
import { forceMain } from './force'
import { impasseTallies, impassesOfGame } from './impasses'
import { type PlayerId, type Seating, teamOfPlayer } from './players'
import { type Reflexion, deals, reflexions } from './stats'

/** Une prise, avec la main qui l'a permise — la matière du panache. */
export interface PriseDetail {
  deal: number
  value: number
  /** Force de la main au moment de l'enchère, barème de docs/REGLES.md */
  force: number | null
  reussi: boolean
  capot: boolean
}

export interface PlayerArchive {
  prises: number
  reussies: number
  chutes: number
  marques: number
  offerts: number
  coinches: number
  /**
   * Coinches et surcoinches gagnées : contrat chuté pour qui coinche, tenu pour qui
   * surcoinche. Absent des archives déposées avant le 24/09/2026.
   */
  coinchesGagnees?: number
  belotesAnnoncees: number
  belotesOubliees: number
  etoiles: number
  impasses: number
  impassesReussies: number
  impassesRatees: number
  detail: PriseDetail[]
  /** Temps de réflexion mesurés. Absent des archives déposées avant le 24/09/2026. */
  reflexion?: Reflexion
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
  soiree?: string
  /** Points à dépasser, et partie en blitz. Absents : 1000 et partie normale. */
  objectif?: number
  blitz?: boolean
}

const vide = (): PlayerArchive => ({
  prises: 0, reussies: 0, chutes: 0, marques: 0, offerts: 0, coinches: 0, coinchesGagnees: 0,
  belotesAnnoncees: 0, belotesOubliees: 0, etoiles: 0,
  impasses: 0, impassesReussies: 0, impassesRatees: 0, detail: [],
})

/**
 * Construit le condensé. `mains` associe chaque numéro de donne aux quatre mains
 * distribuées, lues dans `donne/{n}` une fois la partie terminée.
 */
export function buildArchive(
  code: string,
  events: GameEvent[],
  seating: Seating,
  mains: Record<number, Record<string, Card[]>>,
  bots: PlayerId[] = [],
): Archive {
  const list = deals(events).filter((d) => d.status !== null)
  const players = Object.fromEntries(
    seating.map((p) => [p, vide()]),
  ) as Record<PlayerId, PlayerArchive>

  for (const d of list) {
    if (d.taker) {
      const a = players[d.taker]
      const camp = teamOfPlayer(d.taker, seating)
      const reussi = d.status !== 'chute'
      const main = mains[d.dealNumber]?.[d.taker]
      a.prises += 1
      if (reussi) {
        a.reussies += 1
        a.marques += d.scores[camp]
      } else {
        a.chutes += 1
        a.offerts += d.scores[camp === 0 ? 1 : 0]
      }
      a.detail.push({
        deal: d.dealNumber,
        value: d.value,
        force: main ? forceMain(main, d.trump) : null,
        reussi,
        capot: d.capot,
      })
    }
    for (const c of d.coincheurs) {
      players[c].coinches += 1
      const chute = d.status === 'chute'
      const campDuPreneur = d.taker !== null && teamOfPlayer(c, seating) === teamOfPlayer(d.taker, seating)
      if (campDuPreneur ? !chute : chute) players[c].coinchesGagnees! += 1
    }
    if (d.beloteDeclaredBy) players[d.beloteDeclaredBy].belotesAnnoncees += 1
    if (d.beloteForgottenBy) players[d.beloteForgottenBy].belotesOubliees += 1
    if (d.etoile) players[d.etoile].etoiles += 1
  }

  for (const [p, r] of reflexions(events)) if (players[p]) players[p].reflexion = r

  for (const [p, t] of impasseTallies(impassesOfGame(events, seating[1], seating))) {
    players[p].impasses = t.tentees
    players[p].impassesReussies = t.reussies
    players[p].impassesRatees = t.ratees
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
