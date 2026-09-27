/**
 * Tournoi entre deux façons de jouer, sans Firebase : de quoi mesurer qu'un bot est
 * meilleur au lieu de le supposer.
 *
 * Chaque donne est jouée deux fois, les équipes échangeant leurs places : la chance de
 * la distribution s'annule, l'écart ne vient que des enchères et du jeu.
 *
 * Lancement : npm run tournoi — $env:A et $env:B parmi basic, expert, random (défaut :
 * expert contre base), $env:DEALS pour le nombre de donnes (défaut 100), $env:SEED, $env:SAMPLES pour les tirages du bot ★.
 */
import { describe, it } from 'vitest'
import { type Card, DECK, shuffle } from '../src/game/cards'
import { type BiddingState, apply, currentBidder, newBidding, outcome } from '../src/game/bidding'
import { type BotBid, type BotView, chooseBid, chooseCard, shouldCoinche } from '../src/game/bot'
import { chooseExpertCard } from '../src/game/botExpert'
import { dealHands } from '../src/game/deal'
import { applyPlayed, currentPlayer, newPlay, playableFor } from '../src/game/play'
import { DEFAULT_SEATING, type PlayerId, seatOf, teamOfPlayer } from '../src/game/players'
import { hasBelote, scoreDeal } from '../src/game/scoring'

export interface Contestant {
  name: string
  bid: (hand: Card[], state: BiddingState, me: PlayerId) => BotBid | null
  coincheIt?: (hand: Card[], state: BiddingState, me: PlayerId) => boolean
  play: (
    view: BotView & {
      contract: { value: number; capot: boolean; generale: boolean }
      beloteDeclared: PlayerId | null
    },
    legal: Card[],
  ) => Card
}

export const CONTESTANTS: Record<string, Contestant> = {
  basic: { name: 'basic', bid: chooseBid, coincheIt: shouldCoinche, play: (v, p) => chooseCard(v, p) },
  expert: {
    name: 'expert',
    bid: chooseBid,
    coincheIt: shouldCoinche,
    play: (v, p) =>
      chooseExpertCard(v, p, {
        samples: Number(process.env.SAMPLES ?? 16),
        budgetMs: Infinity,
        // $env:TOLERANCE=0 : l'expert seul, sans le réflexe du bot de base
        ...(process.env.TOLERANCE === '0' ? { tolerance: { odds: 0, points: 0 } } : {}),
      }),
  },
  random: { name: 'random', bid: chooseBid, play: (_v, p) => p[0] },
}

const S = DEFAULT_SEATING

/** Une donne complète : enchères puis jeu. `team0` tient les sièges 0 et 2. Rend les scores. */
export function playDeal(
  pile: Card[],
  dealer: PlayerId,
  team0: Contestant,
  team1: Contestant,
): [number, number] {
  const player = (p: PlayerId) => (teamOfPlayer(p, S) === 0 ? team0 : team1)
  const hands = dealHands(pile, dealer, S)
  let state = newBidding(dealer, S)
  for (let turn = 0; turn < 40; turn++) {
    const p = currentBidder(state)
    if (!p) break
    // La coinche se dit à la volée : un adversaire du preneur, avant la parole suivante.
    const coincher = S.find((q) => player(q).coincheIt?.(hands[q], state, q))
    if (coincher) {
      state = apply(state, { kind: 'coinche', player: coincher })
      continue
    }
    // CO-5 — coinché, le preneur ne peut plus que passer.
    const choice = state.entries.some((e) => e.kind === 'coinche') ? null : player(p).bid(hands[p], state, p)
    state = apply(
      state,
      choice
        ? { kind: 'contract', player: p, value: choice.value, suit: choice.trump }
        : { kind: 'pass', player: p },
    )
  }
  const end = outcome(state)
  if (end.status !== 'contract' || end.trump === null) return [0, 0]

  const handsLeft = Object.fromEntries(S.map((p) => [p, [...hands[p]]])) as Record<PlayerId, Card[]>
  const beloteOf = S.find((p) => hasBelote(hands[p], end.trump)) ?? null
  let play = newPlay(end.trump, S[(seatOf(dealer, S) + 1) % 4], S)
  let declared: PlayerId | null = null
  for (let i = 0; i < 32; i++) {
    const p = currentPlayer(play)!
    const legal = playableFor(play, p, handsLeft[p])
    const card = player(p).play(
      {
        me: p,
        seating: S,
        hand: handsLeft[p],
        trump: end.trump,
        taker: end.taker,
        current: play.current,
        completed: play.completed,
        contract: { value: end.value, capot: end.capot, generale: end.generale },
        beloteDeclared: declared,
      },
      legal,
    )
    if (p === beloteOf && (card === `K${end.trump}` || card === `Q${end.trump}`)) declared = p
    handsLeft[p] = handsLeft[p].filter((c) => c !== card)
    play = applyPlayed(play, p, card)
  }
  const tricks = play.completed.map((t) => t.plays.map((x) => ({ seat: seatOf(x.player, S), card: x.card })))
  const r = scoreDeal(
    tricks,
    {
      takerSeat: seatOf(end.taker, S),
      value: end.value,
      trump: end.trump,
      multiplier: end.multiplier,
      capot: end.capot,
      generale: end.generale,
    },
    undefined,
    beloteOf === null ? null : seatOf(beloteOf, S),
  )
  return r.scores
}

describe('tournoi', () => {
  it('A contre B, donnes jouées deux fois', () => {
    const a = CONTESTANTS[process.env.A ?? 'expert']
    const b = CONTESTANTS[process.env.B ?? 'basic']
    const N = Number(process.env.DEALS ?? 100)
    let g = Number(process.env.SEED ?? 1)
    const rnd = () => (g = (g * 1103515245 + 12345) % 2147483648) / 2147483648
    let forA = 0
    let forB = 0
    const gaps: number[] = []
    const start = Date.now()
    for (let n = 0; n < N; n++) {
      const pile = shuffle([...DECK], rnd)
      const dealer = S[n % 4]
      const x = playDeal(pile, dealer, a, b)
      const y = playDeal(pile, dealer, b, a)
      forA += x[0] + y[1]
      forB += x[1] + y[0]
      gaps.push(x[0] + y[1] - x[1] - y[0])
    }
    const average = (forA - forB) / N
    const stdDev = Math.sqrt(gaps.reduce((s, e) => s + (e - average) ** 2, 0) / (N - 1))
    console.log(
      `${a.name} contre ${b.name} sur ${N} donnes (×2) : ${forA} à ${forB}, ` +
        `soit ${average >= 0 ? '+' : ''}${(average / 2).toFixed(1)} points par donne ` +
        `(± ${((1.96 * stdDev) / Math.sqrt(N) / 2).toFixed(1)}), ${((Date.now() - start) / 1000).toFixed(0)} s`,
    )
  }, 0)
})
