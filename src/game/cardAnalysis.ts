/**
 * L'analyse d'une donne carte par carte, avec l'information du joueur — comme les
 * sites d'échecs, mais pour un jeu où l'on ne voit pas les cartes des autres.
 *
 * Juger à cartes ouvertes serait injuste : une carte excellente vu ce qu'on savait peut
 * être mauvaise une fois tout dévoilé. Pour chaque carte jouée, on tire donc au hasard
 * des répartitions des cartes cachées **compatibles avec ce que le joueur savait** (sa
 * main, les cartes tombées, les couleurs où chacun a montré qu'il n'avait plus rien),
 * on résout chacune à cartes ouvertes, et on fait la moyenne.
 *
 * Le critère est celui qui décide du score : **les chances que le contrat passe**. En
 * coinche on ne marque que le contrat ; perdre dix points quand il est déjà assuré ne
 * coûte rien, en perdre deux au mauvais moment le fait chuter. La meilleure carte est
 * celle qui donne le plus de chances à son camp (au preneur de le réussir, à la défense
 * de le faire chuter) ; les points de cartes départagent les ex æquo.
 */
import { type TrumpMode, type Card, DECK, isTrump, strength, suitOf } from './cards'
import type { ReviewedDeal } from './review'
import { type PlayerId, type Seating, seatOf } from './players'
import { type PlayedCard, playableCards } from './trick'
import { type TransTable, solve } from './solver'

export type Quality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced'

/** Une carte permise, et ce qu'elle promettait en moyenne sur les tirages. */
export interface Option {
  card: Card
  /** Chances que le contrat passe si on joue cette carte, de 0 à 100 */
  odds: number
  /** Points de cartes espérés par l'équipe du joueur, dix de der compris */
  points: number
}

export interface JudgedCard {
  trick: number
  player: PlayerId
  card: Card
  quality: Quality
  /** Chances perdues pour son camp par rapport à la meilleure carte, en points de % */
  oddsLoss: number
  /** Points de cartes perdus par rapport à la meilleure carte */
  pointsLoss: number
  /** La meilleure carte, si ce n'est pas celle jouée */
  bestOption: Card | null
  /** Chances du contrat après la carte jouée : la courbe de la donne */
  oddsAfter: number
  /** Chaque carte permise, de la meilleure à la moins bonne pour le joueur */
  options: Option[]
}

/**
 * Au-delà de ces pertes de chances (en points de %), la carte change de catégorie.
 * Sans enjeu pour le contrat, on regarde les points : une carte qui en laisse filer
 * beaucoup reste une imprécision.
 */
export const THRESHOLDS = { isGood: 5, inaccuracy: 12, error: 30 }
export const POINTS_THRESHOLD = 10
export function qualityOf(
  oddsLoss: number,
  pointsLoss: number,
  forced: boolean,
  bestOption: boolean,
): Quality {
  if (forced) return 'forced'
  if (bestOption) return 'best'
  if (oddsLoss < THRESHOLDS.isGood)
    return pointsLoss >= POINTS_THRESHOLD ? 'inaccuracy' : oddsLoss < 0.5 && pointsLoss < 1 ? 'best' : 'good'
  if (oddsLoss < THRESHOLDS.inaccuracy) return 'inaccuracy'
  if (oddsLoss < THRESHOLDS.error) return 'mistake'
  return 'blunder'
}

/**
 * Ce qu'un joueur sait des mains des autres : les cartes qu'ils ne peuvent **pas** avoir,
 * déduites des règles de fourniture (JEU-2 à JEU-8) à chaque carte qu'ils ont posée.
 */
export function impossibleCards(tricks: { seat: number; card: Card }[][], trump: TrumpMode): Set<Card>[] {
  const forbidden: Set<Card>[] = [new Set(), new Set(), new Set(), new Set()]
  const wholeSuit = (s: string) => DECK.filter((c) => suitOf(c) === s)
  for (const trick of tricks) {
    const played: PlayedCard[] = []
    for (const { seat, card } of trick) {
      if (played.length > 0) {
        const lead = suitOf(played[0].card)
        // La carte maîtresse avant ce coup, selon les règles du moteur.
        let best = 0
        for (let i = 1; i < played.length; i++) {
          const c = played[i].card
          const b = played[best].card
          if (isTrump(c, trump) && !isTrump(b, trump)) best = i
          else if (
            isTrump(c, trump) === isTrump(b, trump) &&
            suitOf(c) === suitOf(b) &&
            strength(c, trump) > strength(b, trump)
          )
            best = i
          else if (!isTrump(c, trump) && !isTrump(b, trump) && suitOf(b) !== lead && suitOf(c) === lead)
            best = i
        }
        const masterCard = played[best].card
        const partnerMaster = (played[best].seat & 1) === (seat & 1)
        const strongerCards = (suit: string, than: Card) =>
          DECK.filter((c) => suitOf(c) === suit && strength(c, trump) > strength(than, trump))
        if (suitOf(card) !== lead) {
          // Il n'a pas fourni : il n'a plus de la couleur demandée.
          for (const c of wholeSuit(lead)) forbidden[seat].add(c)
          if (!partnerMaster && trump !== null && trump !== 'ta') {
            if (!isTrump(card, trump)) for (const c of wholeSuit(trump)) forbidden[seat].add(c)
            else if (isTrump(masterCard, trump) && strength(card, trump) < strength(masterCard, trump)) {
              // Il a sous-coupé : il n'avait pas d'atout plus fort.
              for (const c of strongerCards(trump, masterCard)) forbidden[seat].add(c)
            }
          }
        } else if (
          (lead === trump || trump === 'ta') &&
          suitOf(masterCard) === lead &&
          strength(card, trump) < strength(masterCard, trump)
        ) {
          // À l'atout, il n'a pas monté : il n'avait pas plus fort.
          for (const c of strongerCards(lead, masterCard)) forbidden[seat].add(c)
        }
      }
      played.push({ seat: seat, card: card })
    }
  }
  return forbidden
}

/** Un générateur déterministe : une analyse se rejoue à l'identique. */
export function random(seed: number): () => number {
  let g = seed % 2147483647 || 1
  return () => {
    g = (g * 16807) % 2147483647
    return g / 2147483647
  }
}

/**
 * Une répartition des cartes inconnues entre les trois autres, qui respecte le nombre de
 * cartes de chacun et ce qu'on sait qu'ils n'ont pas. Nulle si le tirage échoue.
 */
export function drawDistribution(
  unknownCards: Card[],
  spots: number[],
  forbidden: Set<Card>[],
  seatIdxs: number[],
  r: () => number,
): Card[][] | null {
  for (let attempt = 0; attempt < 50; attempt++) {
    const hands: Card[][] = [[], [], [], []]
    const remainingSlots = [...spots]
    // Les cartes les plus contraintes d'abord : moins d'impasses.
    const order = unknownCards
      .map((c) => ({ c, possibleSeats: seatIdxs.filter((s) => !forbidden[s].has(c)), sort: r() }))
      .sort((a, b) => a.possibleSeats.length - b.possibleSeats.length || a.sort - b.sort)
    let ok = true
    for (const { c, possibleSeats } of order) {
      const freeSeats = possibleSeats.filter((s) => remainingSlots[s] > 0)
      if (freeSeats.length === 0) {
        ok = false
        break
      }
      const s = freeSeats[Math.floor(r() * freeSeats.length)]
      hands[s].push(c)
      remainingSlots[s] -= 1
    }
    if (ok) return hands
  }
  return null
}

export interface AnalysisOptions {
  /** Répartitions tirées par carte jouée : plus il y en a, plus le jugement est sûr */
  samples: number
  seed?: number
  /** Seulement ces cartes (index dans la donne, de 0 à 31) : pour répartir le calcul */
  only?: number[]
  /** Prévenu à chaque carte analysée : la barre de progression */
  onProgress?: (done: number, total: number) => void
}

/** Juge chaque carte de la donne, du point de vue de celui qui l'a jouée. */
export function analyzeCards(deal: ReviewedDeal, seating: Seating, options: AnalysisOptions): JudgedCard[] {
  const contract = deal.contract
  if (!deal.hands || !contract || contract.generale || deal.blitz) return []
  const d = contract.declaration
  const trump: TrumpMode = d === 'ta' ? 'ta' : d === 'sa' ? null : d
  if (!contract.capot && (trump === null || trump === 'ta')) return []
  const target = contract.capot ? 'tricks' : 'points'
  const seat = (p: PlayerId) => seatOf(p, seating)
  const taker = (seat(contract.taker) & 1) as 0 | 1
  const remainingHands: Card[][] = seating.map((p) => [...deal.hands![p]])
  const playedTricks: { seat: number; card: Card }[][] = []
  const out: JudgedCard[] = []
  const total = deal.tricks.reduce((n, p) => n + p.cards.length, 0)
  const only = options.only ? new Set(options.only) : null
  let done = 0
  let index = 0
  let leader = seat(deal.tricks[0].cards[0].player)
  // Ce que chaque camp a déjà ramassé : points (dix de der compris) ou plis.
  const banked: [number, number] = [0, 0]

  /** Le contrat passe-t-il, si le preneur finit avec ce total et cette belote ? */
  const pass = (takerPoints: number, belote: number): boolean =>
    contract.capot
      ? takerPoints === 8
      : takerPoints + belote >= contract.value && takerPoints + belote > 162 - takerPoints

  for (const p of deal.tricks) {
    const trick: { seat: number; card: Card }[] = []
    for (const { player, card } of p.cards) {
      const s = seat(player)
      const myTeamIdx = (s & 1) as 0 | 1
      const played = trick.map((x) => ({ seat: x.seat, card: x.card }))
      const legal = playableCards(remainingHands[s], played, trump, s)
      const toJudge = !only || only.has(index)

      if (toJudge && legal.length === 1) {
        out.push({
          trick: p.number,
          player: player,
          card: card,
          quality: 'forced',
          oddsLoss: 0,
          pointsLoss: 0,
          bestOption: null,
          oddsAfter: -1,
          options: [],
        })
      } else if (toJudge) {
        // Ce que le joueur sait : sa main, les cartes tombées, et les cartes impossibles.
        const forbidden = impossibleCards([...playedTricks, trick], trump)
        const knownCards = new Set<Card>([
          ...remainingHands[s],
          ...playedTricks.flat().map((x) => x.card),
          ...trick.map((x) => x.card),
        ])
        const unknownCards = DECK.filter((c) => !knownCards.has(c))
        const others = [0, 1, 2, 3].filter((x) => x !== s)
        const spots = remainingHands.map((m) => m.length)
        const r = random((options.seed ?? 1) * 1000 + index)
        const successes = new Map<Card, number>(legal.map((c) => [c, 0]))
        const points = new Map<Card, number>(legal.map((c) => [c, 0]))
        const pointsLeft = 162 - banked[0] - banked[1]
        let n = 0
        for (let k = 0; k < options.samples; k++) {
          const sample = drawDistribution(unknownCards, spots, forbidden, others, r)
          if (!sample) continue
          const hands = [0, 1, 2, 3].map((x) => (x === s ? remainingHands[s] : sample[x]))
          // La belote du preneur, si son camp tient Roi et Dame d'atout dans une même main.
          const belote =
            !contract.capot &&
            trump !== null &&
            trump !== 'ta' &&
            [0, 1, 2, 3].some(
              (x) =>
                (x & 1) === taker &&
                (hands[x].includes(`K${trump}` as Card) ||
                  playedTricks
                    .flat()
                    .concat(trick)
                    .some((y) => y.seat === x && y.card === `K${trump}`)) &&
                (hands[x].includes(`Q${trump}` as Card) ||
                  playedTricks
                    .flat()
                    .concat(trick)
                    .some((y) => y.seat === x && y.card === `Q${trump}`)),
            )
              ? 20
              : 0
          // Mêmes mains, même camp : les positions calculées pour une carte servent aux autres.
          const memo: TransTable = new Map()
          for (const c of legal) {
            const v = solve(
              {
                hands: hands.map((m, x) => (x === s ? m.filter((y) => y !== c) : m)),
                trick: [...trick, { seat: s, card: c }],
                leader,
                tricksPlayed: p.number - 1,
                trump,
                team: taker,
                target,
              },
              memo,
            )
            const takerPoints = banked[taker] + v
            if (pass(takerPoints, belote)) successes.set(c, successes.get(c)! + 1)
            if (target === 'points') {
              const forMyTeam = myTeamIdx === taker ? takerPoints : banked[myTeamIdx] + pointsLeft - v
              points.set(c, points.get(c)! + forMyTeam)
            }
          }
          n += 1
        }
        const sortedOptions: Option[] = legal.map((c) => ({
          card: c,
          odds: n ? (100 * successes.get(c)!) / n : 0,
          points: n ? points.get(c)! / n : 0,
        }))
        // Du point de vue du joueur : le preneur veut des chances, la défense n'en veut pas.
        const forMe = (o: Option) => (myTeamIdx === taker ? o.odds : 100 - o.odds)
        sortedOptions.sort((a, b) => forMe(b) - forMe(a) || b.points - a.points)
        const bestOption = sortedOptions[0]
        const playedCard = sortedOptions.find((o) => o.card === card)!
        const oddsLoss = Math.max(0, forMe(bestOption) - forMe(playedCard))
        const pointsLoss = Math.max(0, bestOption.points - playedCard.points)
        const isBest =
          bestOption.card === card ||
          (oddsLoss === 0 && Math.abs(bestOption.points - playedCard.points) < 0.5)
        const quality = qualityOf(oddsLoss, pointsLoss, false, isBest)
        out.push({
          trick: p.number,
          player: player,
          card: card,
          quality,
          oddsLoss,
          pointsLoss,
          // Une carte jugée « meilleure » n'a pas de meilleure à proposer.
          bestOption: quality === 'best' ? null : bestOption.card,
          oddsAfter: playedCard.odds,
          options: sortedOptions,
        })
      }
      remainingHands[s] = remainingHands[s].filter((c) => c !== card)
      trick.push({ seat: s, card: card })
      index += 1
      if (toJudge) {
        done += 1
        options.onProgress?.(done, only ? only.size : total)
      }
    }
    playedTricks.push(trick)
    const winner = seat(p.winner)
    banked[(winner & 1) as 0 | 1] += target === 'tricks' ? 1 : p.points + (p.number === 8 ? 10 : 0)
    leader = winner
  }
  return out
}
