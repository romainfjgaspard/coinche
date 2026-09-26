/**
 * Le bot ★ : il joue ses cartes avec le solveur, comme l'analyse de fin de partie.
 *
 * Il ne voit **pas** les mains des autres : sa vue est celle du bot de base (sa main,
 * les cartes tombées, le contrat, la belote annoncée), rien de plus. Il imagine des
 * répartitions des cartes cachées compatibles avec ce qu'il sait — les couleurs où
 * chacun a montré qu'il n'avait plus rien comprises —, résout chacune à cartes ouvertes,
 * et joue la carte qui donne en moyenne le plus de chances à son camp (réussir le
 * contrat, ou le faire chuter), puis le plus de points.
 *
 * Un test vérifie qu'il joue la même carte quelles que soient les vraies mains des autres.
 */
import { type Card, DECK, suitOf, value } from './cards'
import { type BotView, chooseCard } from './bot'
import { impossibleCards, random, drawDistribution } from './cardAnalysis'
import { type PlayerId, seatOf } from './players'
import { type TransTable, solve } from './solver'

export interface ExpertView extends BotView {
  contract: { value: number; capot: boolean; generale: boolean }
  /** Qui a annoncé la belote dans cette donne : c'est public */
  beloteDeclared: PlayerId | null
}

export interface ExpertOptions {
  /** Au plus tant de répartitions imaginées */
  samples?: number
  /** Au moins tant, même si le temps est écoulé */
  minimum?: number
  /** Temps de réflexion visé, en millisecondes */
  budgetMs?: number
  seed?: number
  /** Voir `TOLERANCE` */
  tolerance?: { odds: number; points: number }
}

/** Le bot ★ sait-il jouer ce contrat ? Sinon il joue comme le bot de base. */
export const expertCanPlay = (view: ExpertView): boolean =>
  view.trump !== null && view.trump !== 'ta' && !view.contract.generale

export function chooseExpertCard(view: ExpertView, legal: Card[], options: ExpertOptions = {}): Card {
  if (legal.length === 1) return legal[0]
  if (!expertCanPlay(view)) return chooseCard(view, legal)
  const { samples = 40, minimum = 8, budgetMs = 1500 } = options
  const trump = view.trump
  const seat = (p: PlayerId) => seatOf(p, view.seating)
  const s = seat(view.me)
  const myTeamIdx = (s & 1) as 0 | 1
  const taker = (seat(view.taker) & 1) as 0 | 1
  const target = view.contract.capot ? 'tricks' : 'points'

  const playedTricks = view.completed.map((t) => t.plays.map((p) => ({ seat: seat(p.player), card: p.card })))
  const trick = view.current.map((p) => ({ seat: seat(p.player), card: p.card }))
  const played = [...playedTricks.flat(), ...trick]
  const forbidden = impossibleCards([...playedTricks, trick], trump)
  const knownCards = new Set<Card>([...view.hand, ...played.map((x) => x.card)])
  const unknownCards = DECK.filter((c) => !knownCards.has(c))
  const others = [0, 1, 2, 3].filter((x) => x !== s)
  const spots = [0, 1, 2, 3].map((x) =>
    x === s ? view.hand.length : 8 - view.completed.length - (trick.some((y) => y.seat === x) ? 1 : 0),
  )

  // Ce que chaque camp a déjà ramassé : points (dix de der compris) ou plis.
  const banked: [number, number] = [0, 0]
  view.completed.forEach((t) => {
    const team = (seat(t.winner) & 1) as 0 | 1
    banked[team] += target === 'tricks' ? 1 : t.plays.reduce((n, p) => n + value(p.card, trump), 0)
  })
  const pointsLeft = 162 - banked[0] - banked[1]
  const leader = trick.length > 0 ? trick[0].seat : seat(view.completed.at(-1)?.winner ?? view.me)

  const pass = (takerPoints: number, belote: number): boolean =>
    view.contract.capot
      ? takerPoints === 8
      : takerPoints + belote >= view.contract.value && takerPoints + belote > 162 - takerPoints
  const hasPlayed = (x: number, c: Card) => played.some((y) => y.seat === x && y.card === c)

  const r = random(options.seed ?? 1 + played.length * 97 + s)
  const successes = new Map<Card, number>(legal.map((c) => [c, 0]))
  const points = new Map<Card, number>(legal.map((c) => [c, 0]))
  const start = Date.now()
  let n = 0
  for (let k = 0; k < samples; k++) {
    if (n >= minimum && Date.now() - start > budgetMs) break
    const sample = drawDistribution(unknownCards, spots, forbidden, others, r)
    if (!sample) continue
    const hands = [0, 1, 2, 3].map((x) => (x === s ? view.hand : sample[x]))
    // La belote du preneur : annoncée par son camp, ou Roi et Dame dans une même main imaginée.
    const king = `K${trump}` as Card
    const queen = `Q${trump}` as Card
    const belote =
      target === 'points' &&
      ((view.beloteDeclared !== null && (seat(view.beloteDeclared) & 1) === taker) ||
        [0, 1, 2, 3].some(
          (x) =>
            (x & 1) === taker &&
            (hands[x].includes(king) || hasPlayed(x, king)) &&
            (hands[x].includes(queen) || hasPlayed(x, queen)),
        ))
        ? 20
        : 0
    const memo: TransTable = new Map()
    for (const c of legal) {
      const v = solve(
        {
          hands: hands.map((m, x) => (x === s ? m.filter((y) => y !== c) : m)),
          trick: [...trick, { seat: s, card: c }],
          leader,
          tricksPlayed: view.completed.length,
          trump,
          team: taker,
          target,
        },
        memo,
      )
      const takerPoints = banked[taker] + v
      if (pass(takerPoints, belote)) successes.set(c, successes.get(c)! + 1)
      const forMyTeam =
        target === 'tricks' ? 0 : myTeamIdx === taker ? takerPoints : banked[myTeamIdx] + pointsLeft - v
      points.set(c, points.get(c)! + forMyTeam)
    }
    n += 1
  }
  if (n === 0) return chooseCard(view, legal)

  const forMe = (c: Card) => {
    const odds = successes.get(c)! / n
    return myTeamIdx === taker ? odds : 1 - odds
  }
  // À égalité de chances et de points, la carte la moins chère : on garde les honneurs.
  const bestOption = [...legal].sort(
    (a, b) =>
      forMe(b) - forMe(a) ||
      points.get(b)! - points.get(a)! ||
      value(a, trump) - value(b, trump) ||
      suitOf(a).localeCompare(suitOf(b)),
  )[0]

  // Imaginer les mains à cartes ouvertes a un travers : dans chaque tirage, le bot « sait »
  // où sont les cartes, donc tirer atout ne lui paraît jamais urgent. Quand l'écart avec
  // le bon réflexe du bot de base tient dans le bruit des tirages, on garde le réflexe.
  const reflex = chooseCard(view, legal)
  const tolerance = options.tolerance ?? TOLERANCE
  if (
    forMe(bestOption) - forMe(reflex) <= tolerance.odds &&
    (points.get(bestOption)! - points.get(reflex)!) / n <= tolerance.points
  )
    return reflex
  return bestOption
}

/** Jusqu'où le réflexe du bot de base l'emporte : en part de chances (0-1), en points. */
export const TOLERANCE = { odds: 0.05, points: 4 }
