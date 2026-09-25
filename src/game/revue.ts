/**
 * Revoir une donne après coup : les mains de départ, les huit plis, les points pli par
 * pli. Tout se relit dans le journal, sans rien lire d'autre en base.
 *
 * Les mains de départ se reconstituent à partir des cartes jouées : une fois les huit
 * plis posés, chacun a joué exactement ses huit cartes. Pas besoin des mains scellées
 * (`donne/{n}`), que les règles Firestore ne rendent lisibles qu'en fin de partie.
 */
import { type Atout, type Card, sortHand } from './cards'
import type { GameEvent } from './events'
import type { Declaration } from './bidding'
import { type PlayerId, type Seating, teamOfPlayer } from './players'
import { LAST_TRICK_BONUS } from './scoring'

export interface PliRevu {
  numero: number
  /** Dans l'ordre de pose */
  cartes: { player: PlayerId; card: Card }[]
  gagnant: PlayerId
  equipe: 0 | 1
  /** Points de cartes du pli, sans le dix de der */
  points: number
}

export interface DonneRevue {
  numero: number
  donneur: PlayerId
  contrat: { taker: PlayerId; value: number; declaration: Declaration | null; capot: boolean; generale: boolean } | null
  plis: PliRevu[]
  /** Chaque main telle que distribuée, triée ; seulement si la donne est allée au bout. */
  mains: Record<PlayerId, Card[]> | null
  /** L'équipe qui a pris le dernier pli, et donc le dix de der ; nulle avant la fin. */
  der: 0 | 1 | null
  /** Donne marquée sans être jouée (blitz) */
  blitz: boolean
}

/** Les événements d'une donne, de sa distribution à la suivante. */
export function evenementsDeLaDonne(events: GameEvent[], numero: number): GameEvent[] {
  const debut = events.findIndex((e) => e.type === 'donne_commencee' && e.dealNumber === numero)
  if (debut === -1) return []
  const fin = events.findIndex((e, i) => i > debut && e.type === 'donne_commencee')
  return events.slice(debut, fin === -1 ? undefined : fin)
}

export function revoirDonne(events: GameEvent[], numero: number, seating: Seating): DonneRevue | null {
  const evts = evenementsDeLaDonne(events, numero)
  const depart = evts[0]
  if (!depart || depart.type !== 'donne_commencee') return null

  const contratFixe = evts.find((e) => e.type === 'contrat_fixe')
  const contrat = contratFixe && contratFixe.type === 'contrat_fixe'
    ? {
        taker: contratFixe.taker,
        value: contratFixe.value,
        declaration: contratFixe.declaration ?? contratFixe.trump,
        capot: contratFixe.capot,
        generale: contratFixe.generale,
      }
    : null

  const posees = new Map<number, { player: PlayerId; card: Card; position: number }[]>()
  for (const e of evts) {
    if (e.type !== 'carte_jouee') continue
    const pli = posees.get(e.trickNumber) ?? []
    pli.push({ player: e.player, card: e.card, position: e.position })
    posees.set(e.trickNumber, pli)
  }
  const plis: PliRevu[] = []
  for (const e of evts) {
    if (e.type !== 'pli_termine') continue
    const cartes = (posees.get(e.trickNumber) ?? [])
      .sort((a, b) => a.position - b.position)
      .map(({ player, card }) => ({ player, card }))
    plis.push({
      numero: e.trickNumber,
      cartes,
      gagnant: e.winner,
      equipe: teamOfPlayer(e.winner, seating),
      points: e.points,
    })
  }

  const fin = evts.find((e) => e.type === 'donne_terminee')
  const blitz = Boolean(fin && fin.type === 'donne_terminee' && fin.blitz)
  const complete = plis.length === 8

  let mains: Record<PlayerId, Card[]> | null = null
  if (complete) {
    const atout: Atout = contrat?.declaration === 'ta' ? 'ta'
      : contrat?.declaration === 'sa' ? null : (contrat?.declaration ?? null)
    mains = Object.fromEntries(seating.map((p) => [
      p,
      sortHand(plis.flatMap((pli) => pli.cartes.filter((c) => c.player === p).map((c) => c.card)), atout),
    ]))
  }

  return {
    numero,
    donneur: depart.dealer,
    contrat,
    plis,
    mains,
    der: complete ? plis[7].equipe : null,
    blitz,
  }
}

/** Points de cartes faits par chaque équipe, dix de der compris : le détail du décompte. */
export function pointsDesPlis(donne: DonneRevue): [number, number] {
  const total: [number, number] = [0, 0]
  for (const pli of donne.plis) total[pli.equipe] += pli.points
  if (donne.der !== null) total[donne.der] += LAST_TRICK_BONUS
  return total
}
