/**
 * Décompte d'une donne — on ne compte que les enchères (docs/REGLES.md § 8).
 *
 * Le preneur réussit son contrat s'il atteint la valeur annoncée ET s'il totalise
 * strictement plus de points que la défense (DEC-3). La belote entre dans cette
 * comparaison mais n'est jamais marquée (BEL-5).
 */
import { type TrumpMode, type Card, isSuitTrump } from './cards'
import { type PlayedCard, trickPoints, trickWinner } from './trick'
import { RULES, type Rules } from './rules'

export const TOTAL_CARD_POINTS = 152
export const LAST_TRICK_BONUS = 10 // ORD-4 — dix de der
export const BELOTE_POINTS = 20

export type Team = 0 | 1
export const teamOf = (seat: number): Team => (seat % 2) as Team

export interface Contract {
  takerSeat: number
  /** Valeur annoncée : 80–170, ou capotValue / generaleValue */
  value: number
  trump: TrumpMode
  /** 1 = simple, 2 = coinché, 4 = surcoinché (CO-1, CO-2) */
  multiplier: 1 | 2 | 4
  capot: boolean
  generale: boolean
}

export type DealStatus = 'made' | 'down' | 'capot' | 'generale'

export interface DealResult {
  cardPoints: [number, number]
  /** Total retenu pour la comparaison DEC-3 : cartes + belote côté preneur */
  compared: [number, number]
  beloteTeam: Team | null
  tricksWon: [number, number]
  status: DealStatus
  scores: [number, number]
}

/**
 * DEC-3 / DEC-7 — le contrat passe si le preneur atteint la valeur annoncée
 * ET devance strictement la défense. L'égalité chute.
 * Les totaux passés incluent déjà la belote côté preneur (BEL-3, BEL-5).
 */
export function isContractMade(takerTotal: number, defenseTotal: number, value: number): boolean {
  return takerTotal >= value && takerTotal > defenseTotal
}

export function scoreDeal(
  tricks: PlayedCard[][],
  contract: Contract,
  rules: Rules = RULES,
  beloteHolder: number | null = null,
): DealResult {
  const cardPoints: [number, number] = [0, 0]
  const tricksWon: [number, number] = [0, 0]

  tricks.forEach((trick, i) => {
    const winner = teamOf(trickWinner(trick, contract.trump))
    cardPoints[winner] += trickPoints(trick, contract.trump)
    tricksWon[winner] += 1
    if (i === tricks.length - 1) cardPoints[winner] += LAST_TRICK_BONUS // ORD-4
  })

  const taker = teamOf(contract.takerSeat)
  const defense = (1 - taker) as Team
  const beloteTeam = beloteHolder === null ? null : teamOf(beloteHolder)

  // BEL-3 / BEL-5 — la belote compte pour le preneur dans la comparaison,
  // jamais pour la défense, et ne se marque jamais.
  const compared: [number, number] = [0, 0]
  compared[taker] = cardPoints[taker] + (beloteTeam === taker ? BELOTE_POINTS : 0)
  compared[defense] = cardPoints[defense]

  const wonAllTricks = tricksWon[taker] === tricks.length
  // ENC-9 — la générale se fait seul : un pli ramassé par le partenaire la fait chuter.
  const takerAlone = tricks.every((trick) => trickWinner(trick, contract.trump) === contract.takerSeat)

  // DEC-3 — atteindre le contrat ET être devant. DEC-7 : l'égalité chute.
  const made = contract.generale
    ? takerAlone
    : contract.capot
      ? wonAllTricks
      : isContractMade(compared[taker], compared[defense], contract.value)

  const status: DealStatus = !made
    ? 'down'
    : contract.generale
      ? 'generale'
      : contract.capot
        ? 'capot'
        : 'made'

  // DEC-1 / DEC-2 — un seul camp marque, et il marque la valeur de l'enchère.
  // DEC-5 — capot et générale valent 250, quelle que soit la valeur passée.
  // DEC-4 — la coinche multiplie cette valeur.
  const announced = contract.generale
    ? rules.generaleValue
    : contract.capot
      ? rules.capotValue
      : contract.value
  const stake = announced * contract.multiplier
  const scores: [number, number] = [0, 0]
  scores[made ? taker : defense] = stake

  return { cardPoints, compared, beloteTeam, tricksWon, status, scores }
}

/**
 * DEC-8 — capot réalisé sans l'avoir annoncé.
 *
 * Le preneur rafle les huit plis alors qu'il n'avait annoncé qu'un contrat chiffré :
 * il a sous-évalué son jeu. Ça ne change rien au score — on ne compte que les
 * enchères — mais ça vaut une étoile, et la honte.
 */
export function unannouncedCapot(result: DealResult, contract: Contract): boolean {
  if (contract.capot || contract.generale) return false
  return result.tricksWon[teamOf(contract.takerSeat)] === result.tricksWon[0] + result.tricksWon[1]
}

/** BEL-1 — détecte Roi + Dame d'atout dans une main. */
export function hasBelote(hand: Card[], trump: TrumpMode): boolean {
  if (!isSuitTrump(trump)) return false
  return hand.includes(`K${trump}` as Card) && hand.includes(`Q${trump}` as Card)
}
