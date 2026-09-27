import { describe, expect, it } from 'vitest'
import { type Card, DECK, shuffle } from '../cards'
import { chooseCard } from '../bot'
import { type ExpertView, chooseExpertCard } from '../botExpert'
import { applyPlayed, currentPlayer, newPlay, playableFor, type PlayState } from '../play'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId } from '../players'

const S = DEFAULT_SEATING

/** Ce que voit un bot : sa main et la table. Les autres mains n'y entrent pas. */
const viewOf = (play: PlayState, me: PlayerId, hand: Card[]): ExpertView => ({
  me: me,
  seating: S,
  hand: hand,
  trump: 'h',
  taker: 'romain',
  current: play.current,
  completed: play.completed,
  contract: { value: 90, capot: false, generale: false },
  beloteDeclared: null,
})

/** Joue les `n` premières cartes avec le bot de base. */
function advance(hands: Record<PlayerId, Card[]>, n: number) {
  let play = newPlay('h', 'romain', S)
  for (let i = 0; i < n; i++) {
    const p = currentPlayer(play)!
    const card = chooseCard(viewOf(play, p, hands[p]), playableFor(play, p, hands[p]))
    hands[p] = hands[p].filter((c) => c !== card)
    play = applyPlayed(play, p, card)
  }
  return play
}

describe('le bot ★ ne voit pas le jeu des autres', () => {
  it('joue la même carte quelles que soient les vraies mains des autres', () => {
    let g = 11
    const rnd = () => (g = (g * 1103515245 + 12345) % 2147483648) / 2147483648
    const pile = shuffle([...DECK], rnd)
    const hands = Object.fromEntries(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)])) as Record<
      PlayerId,
      Card[]
    >
    const play = advance(hands, 5)
    const me = currentPlayer(play)!

    // Une autre distribution : même main pour moi, mêmes cartes posées, mais les cartes
    // cachées des trois autres sont rebattues entre eux.
    const others = PLAYER_IDS.filter((p) => p !== me)
    const hiddenCards = shuffle(
      others.flatMap((p) => hands[p]),
      rnd,
    )
    const elsewhere = { ...hands }
    let k = 0
    for (const p of others) {
      elsewhere[p] = hiddenCards.slice(k, k + hands[p].length)
      k += hands[p].length
    }
    expect(others.some((p) => elsewhere[p].join() !== hands[p].join())).toBe(true)

    const options = { samples: 12, budgetMs: Infinity, seed: 5 }
    const legal = playableFor(play, me, hands[me])
    const here = chooseExpertCard(viewOf(play, me, hands[me]), legal, options)
    const there = chooseExpertCard(viewOf(play, me, elsewhere[me]), legal, options)
    expect(there).toBe(here)
    expect(legal).toContain(here)
  })

  it("sa vue n'a aucun champ pour les mains des autres", () => {
    const view = viewOf(newPlay('h', 'romain', S), 'romain', ['Jh'])
    expect(Object.keys(view).sort()).toEqual(
      [
        'beloteDeclared',
        'completed',
        'contract',
        'current',
        'hand',
        'me',
        'seating',
        'taker',
        'trump',
      ].sort(),
    )
  })
})

describe('le bot ★ joue une donne entière', () => {
  it('toujours une carte permise, huit plis', () => {
    let g = 3
    const rnd = () => (g = (g * 1103515245 + 12345) % 2147483648) / 2147483648
    const pile = shuffle([...DECK], rnd)
    const hands = Object.fromEntries(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)])) as Record<
      PlayerId,
      Card[]
    >
    let play = newPlay('h', 'romain', S)
    for (let i = 0; i < 32; i++) {
      const p = currentPlayer(play)!
      const legal = playableFor(play, p, hands[p])
      const card = chooseExpertCard(viewOf(play, p, hands[p]), legal, {
        samples: 4,
        budgetMs: Infinity,
      })
      expect(legal).toContain(card)
      hands[p] = hands[p].filter((c) => c !== card)
      play = applyPlayed(play, p, card)
    }
    expect(play.completed).toHaveLength(8)
  }, 60000)
})
