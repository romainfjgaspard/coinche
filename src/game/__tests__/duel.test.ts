import { describe, expect, it } from 'vitest'
import { type Card, DECK, shuffle, value } from '../cards'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId, teamOfPlayer } from '../players'
import { applyPlayed, currentPlayer, newPlay, playableFor } from '../play'
import { chooseCard } from '../bot'
import { handStrength } from '../strength'
import { SUITS, type Suit } from '../cards'

type Strategy = (
  state: ReturnType<typeof newPlay>,
  player: PlayerId,
  hand: Card[],
  playable: Card[],
  trump: Suit,
  taker: PlayerId,
) => Card

const monkey: Strategy = (_e, _j, _m, playable) => playable[0]
const bot: Strategy = (state, player, hand, playable, trump, taker) =>
  chooseCard(
    {
      me: player,
      seating: DEFAULT_SEATING,
      hand: hand,
      trump: trump,
      taker: taker,
      current: state.current,
      completed: state.completed,
    },
    playable,
  )

/** Joue une donne, équipe 0 avec `a`, équipe 1 avec `b`. Rend les points de pli. */
function deal(pile: Card[], trump: Suit, taker: PlayerId, a: Strategy, b: Strategy) {
  const hands = new Map<PlayerId, Card[]>(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)]))
  let state = newPlay(trump, 'romain', DEFAULT_SEATING)
  const points: [number, number] = [0, 0]

  for (let i = 0; i < 32; i++) {
    const player = currentPlayer(state)!
    const hand = hands.get(player)!
    const playable = playableFor(state, player, hand)
    const strategy = teamOfPlayer(player, DEFAULT_SEATING) === 0 ? a : b
    const card = strategy(state, player, hand, playable, trump, taker)
    hand.splice(hand.indexOf(card), 1)
    const before = state.completed.length
    state = applyPlayed(state, player, card)
    if (state.completed.length > before) {
      const trick = state.completed[state.completed.length - 1]
      points[teamOfPlayer(trick.winner, DEFAULT_SEATING)] += trick.plays.reduce(
        (s, p) => s + value(p.card, trump),
        0,
      )
    }
  }
  return points
}

/**
 * Garde-fou : le bot doit rester meilleur que « la première carte légale ».
 *
 * Chaque donne est jouée deux fois, les rôles inversés, donc la chance de la
 * distribution s'annule exactement : l'écart mesuré ne vient que du jeu.
 */
describe("le bot joue mieux qu'au hasard", () => {
  it('prend plus de la moitié des points de pli', () => {
    let seed = 2024
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648

    {
      const level = 'basic'
      let forBot = 0
      let forMonkey = 0
      const N = 200
      for (let n = 0; n < N; n++) {
        const pile = shuffle([...DECK], rnd)
        const handOf0 = pile.slice(0, 8)
        const trump = SUITS.map((s) => ({ s, f: handStrength(handOf0, s) })).sort((x, y) => y.f - x.f)[0].s

        // équipe 0 = bot, équipe 1 = singe
        const p1 = deal([...pile], trump, 'romain', bot, monkey)
        forBot += p1[0]
        forMonkey += p1[1]
        // on inverse les rôles sur exactement la même donne
        const p2 = deal([...pile], trump, 'romain', monkey, bot)
        forMonkey += p2[0]
        forBot += p2[1]
      }
      const total = forBot + forMonkey
      const share = forBot / total
      console.log(
        `${level.padEnd(9)} · bot ${(share * 100).toFixed(1)} % des points de pli ` +
          `(${forBot} contre ${forMonkey} sur ${N} donnes jouées deux fois)`,
      )
      expect(share).toBeGreaterThan(0.52)
    }
  })
})
