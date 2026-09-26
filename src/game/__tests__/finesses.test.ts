import { describe, expect, it } from 'vitest'
import { type Card, rankOf } from '../cards'
import type { CompletedTrick, Play } from '../play'
import { finessesOfGame, finessesOfTricks, finesseTallies } from '../finesses'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId } from '../players'
import { applyPlayed, currentPlayer, newPlay, playableFor } from '../play'
import type { GameEvent } from '../events'

/** Construit un pli terminé à la main : on teste la lecture, pas le moteur. */
function trick(cards: Array<[PlayerId, Card]>, winner: PlayerId): CompletedTrick {
  const plays: Play[] = cards.map(([player, card]) => ({ player, card }))
  return { leader: plays[0].player, plays, winner, points: 0 }
}

describe("détection de l'impasse", () => {
  it("garder l'as de la couleur entamée alors que personne n'a coupé", () => {
    const tricks = [
      // Benel entame pique, Viv garde son as et fournit le 9
      trick(
        [
          ['benel', 'Ks'],
          ['viv', '9s'],
          ['roux', '8s'],
          ['romain', '7s'],
        ],
        'benel',
      ),
      // l'as sort plus tard et ramasse le 10 de Romain : impasse réussie
      trick(
        [
          ['benel', 'Qs'],
          ['viv', 'As'],
          ['roux', 'Js'],
          ['romain', '10s'],
        ],
        'viv',
      ),
    ]
    const [finesse] = finessesOfTricks(tricks, 'h', 3)
    expect(finesse).toMatchObject({
      player: 'viv',
      suit: 's',
      keptUntil: 1,
      leftAt: 2,
      result: 'success',
      dealNumber: 3,
    })
  })

  it("l'as coupé derrière, c'est raté", () => {
    const tricks = [
      trick(
        [
          ['benel', 'Ks'],
          ['viv', '9s'],
          ['roux', '8s'],
          ['romain', '7s'],
        ],
        'benel',
      ),
      trick(
        [
          ['benel', 'Qs'],
          ['viv', 'As'],
          ['roux', '7h'],
          ['romain', '10s'],
        ],
        'roux',
      ),
    ]
    expect(finessesOfTricks(tricks, 'h')[0].result).toBe('failure')
  })

  it("l'as ramasse mais sans dix : sans suite", () => {
    const tricks = [
      trick(
        [
          ['benel', 'Ks'],
          ['viv', '9s'],
          ['roux', '8s'],
          ['romain', '7s'],
        ],
        'benel',
      ),
      trick(
        [
          ['benel', 'Qs'],
          ['viv', 'As'],
          ['roux', 'Js'],
          ['romain', '9h'],
        ],
        'viv',
      ),
    ]
    expect(finessesOfTricks(tricks, 'h')[0].result).toBe('none')
  })

  it("pas d'impasse si quelqu'un a déjà coupé avant lui", () => {
    const tricks = [
      trick(
        [
          ['benel', 'Ks'],
          ['roux', '7h'],
          ['viv', '9s'],
          ['romain', '7s'],
        ],
        'roux',
      ),
      trick(
        [
          ['roux', 'Qs'],
          ['viv', 'As'],
          ['romain', '10s'],
          ['benel', 'Js'],
        ],
        'viv',
      ),
    ]
    expect(finessesOfTricks(tricks, 'h')).toEqual([])
  })

  it("pas d'impasse quand l'atout est la couleur entamée", () => {
    const tricks = [
      trick(
        [
          ['benel', 'Kh'],
          ['viv', '9h'],
          ['roux', '8h'],
          ['romain', '7h'],
        ],
        'viv',
      ),
      trick(
        [
          ['viv', 'Ah'],
          ['roux', 'Qh'],
          ['romain', '10h'],
          ['benel', 'Jh'],
        ],
        'roux',
      ),
    ]
    expect(finessesOfTricks(tricks, 'h')).toEqual([])
  })

  it("l'entameur ne fait pas d'impasse : il choisit sa couleur", () => {
    const tricks = [
      trick(
        [
          ['viv', '9s'],
          ['roux', '8s'],
          ['romain', '7s'],
          ['benel', 'Ks'],
        ],
        'benel',
      ),
      trick(
        [
          ['benel', 'Qs'],
          ['viv', 'As'],
          ['roux', 'Js'],
          ['romain', '10s'],
        ],
        'viv',
      ),
    ]
    expect(finessesOfTricks(tricks, 'h')).toEqual([])
  })

  it("un as gardé deux fois ne compte qu'une impasse", () => {
    const tricks = [
      trick(
        [
          ['benel', 'Ks'],
          ['viv', '9s'],
          ['roux', '8s'],
          ['romain', '7s'],
        ],
        'benel',
      ),
      trick(
        [
          ['benel', 'Qs'],
          ['viv', '10s'],
          ['roux', 'Js'],
          ['romain', '7h'],
        ],
        'romain',
      ),
      trick(
        [
          ['benel', '8h'],
          ['viv', 'As'],
          ['roux', '9h'],
          ['romain', '10h'],
        ],
        'romain',
      ),
    ]
    const list = finessesOfTricks(tricks, 'h')
    expect(list).toHaveLength(1)
    expect(list[0].keptUntil).toBe(1)
  })

  it("tant que l'as n'est pas tombé, rien n'est visible", () => {
    const start = trick(
      [
        ['benel', 'Ks'],
        ['viv', '9s'],
        ['roux', '8s'],
        ['romain', '7s'],
      ],
      'benel',
    )
    expect(finessesOfTricks([start], 'h')).toEqual([])

    const next = trick(
      [
        ['benel', 'Qs'],
        ['viv', 'As'],
        ['roux', 'Js'],
        ['romain', '10s'],
      ],
      'viv',
    )
    expect(finessesOfTricks([start, next], 'h')).toHaveLength(1)
  })

  it('le décompte par joueur', () => {
    const t = finesseTallies([
      { player: 'viv', suit: 's', keptUntil: 1, leftAt: 2, result: 'success', dealNumber: 1 },
      { player: 'viv', suit: 'd', keptUntil: 3, leftAt: 5, result: 'failure', dealNumber: 1 },
      { player: 'viv', suit: 'c', keptUntil: 2, leftAt: 4, result: 'none', dealNumber: 2 },
    ])
    expect(t.get('viv')).toEqual({ tried: 3, made: 1, failed: 1 })
    // Qui n'a rien tenté n'apparaît pas : la liste des joueurs n'est plus figée.
    expect(t.get('roux')).toBeUndefined()
  })
})

describe('impasses lues depuis le journal', () => {
  it('une donne entière donne le même résultat que la lecture des plis', () => {
    const hands: Record<PlayerId, Card[]> = {
      // romain a trois piques dont l'as : de quoi le garder au deuxième pli
      romain: ['10s', 'As', '7s', '7h', '8h', 'Ad', '7d', '7c'],
      benel: ['Ks', '9s', '8s', '9h', '10h', 'Kd', '8d', '8c'],
      viv: ['Qs', 'Ah', 'Kh', 'Qd', '9d', 'Ac', 'Kc', '9c'],
      roux: ['Js', 'Qh', 'Jh', 'Jd', '10d', 'Qc', 'Jc', '10c'],
    }
    // benel donne, donc romain entame ; atout cœur
    let state = newPlay('h', 'romain', DEFAULT_SEATING)
    const remainingHands = new Map(PLAYER_IDS.map((p) => [p, [...hands[p]]]))
    const events: GameEvent[] = [
      { type: 'deal_started', dealNumber: 1, dealer: 'benel' } as GameEvent,
      {
        type: 'contract_set',
        taker: 'romain',
        value: 100,
        trump: 'h',
        multiplier: 1,
        capot: false,
        generale: false,
      } as GameEvent,
    ]

    for (let i = 0; i < 32; i++) {
      const player = currentPlayer(state)!
      const hand = remainingHands.get(player)!
      // on garde les as tant qu'on peut : c'est exactement ce qui crée les impasses
      const playable = playableFor(state, player, hand)
      const card = playable.find((c) => rankOf(c) !== 'A') ?? playable[0]
      hand.splice(hand.indexOf(card), 1)
      events.push({
        type: 'card_played',
        player: player,
        card: card,
        trickNumber: state.completed.length + 1,
      } as GameEvent)
      state = applyPlayed(state, player, card)
    }

    const direct = finessesOfTricks(state.completed, 'h', 1)
    expect(finessesOfGame(events, 'benel', DEFAULT_SEATING)).toEqual(direct)
    expect(direct.length).toBeGreaterThan(0)
  })
})
