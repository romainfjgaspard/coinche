import { describe, expect, it } from 'vitest'
import { type Card, DECK, shuffle } from '../cards'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId } from '../players'
import { applyPlayed, currentPlayer, isDealOver, newPlay, playableFor } from '../play'
import type { BotView } from '../bot'
import { chooseBid, chooseCard, isMaster, trickMaster } from '../bot'
import { type BiddingEntry, apply, newBidding } from '../bidding'

/** Sièges : romain(0) · benel(1) · viv(2) · roux(3). Équipes : 0+2 contre 1+3. */
const view = (p: Partial<BotView> & Pick<BotView, 'me' | 'hand'>): BotView => ({
  seating: DEFAULT_SEATING,
  trump: 'h',
  taker: 'romain',
  current: [],
  completed: [],
  ...p,
})

const placed = (pairs: Array<[PlayerId, Card]>) => pairs.map(([player, card]) => ({ player, card }))

/** Un pli terminé, posé dans cet ordre. */
const trick = (pairs: Array<[PlayerId, Card]>, winner: PlayerId) => ({
  leader: pairs[0][0],
  plays: placed(pairs),
  winner,
  points: 0,
})

describe("le bot ne choisit que dans ce qu'on lui donne", () => {
  it('rend toujours une carte de la liste légale', () => {
    const v = view({ me: 'viv', hand: ['As', '10s', '8s', '7h'] })
    expect(['As', '10s']).toContain(chooseCard(v, ['As', '10s']))
  })

  it("refuse de jouer quand rien n'est jouable", () => {
    expect(() => chooseCard(view({ me: 'viv', hand: [] }), [])).toThrow()
  })
})

describe('entame', () => {
  it('le camp du preneur tire les atouts, valet en tête', () => {
    const v = view({ me: 'romain', taker: 'romain', hand: ['Jh', '7h', 'As'] })
    expect(chooseCard(v, ['Jh', '7h', 'As'])).toBe('Jh')
  })

  it("la défense sort sa carte maîtresse plutôt qu'un atout", () => {
    const v = view({ me: 'benel', taker: 'romain', hand: ['As', '7h', '8d'] })
    expect(chooseCard(v, ['As', '7h', '8d'])).toBe('As')
  })

  it('sans rien de maître, elle ouvre petit et garde ses atouts', () => {
    const v = view({ me: 'benel', taker: 'romain', hand: ['9s', '8d', 'Jh'] })
    expect(chooseCard(v, ['9s', '8d', 'Jh'])).not.toBe('Jh')
  })
})

describe("tirer l'atout", () => {
  it('le preneur sans le valet ne sort pas son neuf dessous : il entame petit', () => {
    const v = view({ me: 'romain', taker: 'romain', hand: ['9h', '7h', 'Kh', 'As'] })
    expect(chooseCard(v, ['9h', '7h', 'Kh', 'As'])).toBe('7h')
  })

  it('le neuf devient maître une fois le valet tombé : on le tire', () => {
    const v = view({
      me: 'romain',
      taker: 'romain',
      hand: ['9h', '7h', 'As'],
      completed: [
        trick(
          [
            ['romain', '8h'],
            ['benel', 'Jh'],
            ['viv', 'Qh'],
            ['roux', 'Ah'],
          ],
          'benel',
        ),
      ],
    })
    expect(chooseCard(v, ['9h', '7h', 'As'])).toBe('9h')
  })

  it('le partenaire du preneur rejoue atout lui aussi', () => {
    const v = view({ me: 'viv', taker: 'romain', hand: ['8h', 'Kd', '7c'] })
    expect(chooseCard(v, ['8h', 'Kd', '7c'])).toBe('8h')
  })

  it("on arrête quand les deux adversaires n'en ont plus", () => {
    // benel et roux n'ont pas fourni à l'atout : ils n'en ont plus.
    const v = view({
      me: 'romain',
      taker: 'romain',
      hand: ['7h', 'As', '8d'],
      completed: [
        trick(
          [
            ['romain', 'Jh'],
            ['benel', '7s'],
            ['viv', '8h'],
            ['roux', '7c'],
          ],
          'romain',
        ),
      ],
    })
    expect(chooseCard(v, ['7h', 'As', '8d'])).toBe('As')
  })
})

describe('quand le partenaire tient le pli', () => {
  it('on charge si plus personne ne peut reprendre', () => {
    // roux joue en dernier ; son partenaire benel est maître
    const v = view({
      me: 'roux',
      hand: ['10s', '9s'],
      current: placed([
        ['romain', '7s'],
        ['benel', 'As'],
        ['viv', '8s'],
      ]),
    })
    expect(trickMaster(v)).toBe('benel')
    expect(chooseCard(v, ['10s', '9s'])).toBe('10s')
  })

  it("au premier tour de la couleur, on charge le dix sur l'as du partenaire", () => {
    // viv joue en troisième ; son partenaire romain est maître, roux passe après
    const v = view({
      me: 'viv',
      hand: ['10s', '8s'],
      current: placed([
        ['romain', 'As'],
        ['benel', '7s'],
      ]),
    })
    expect(trickMaster(v)).toBe('romain')
    expect(chooseCard(v, ['10s', '8s'])).toBe('10s')
  })

  it("on garde ses points si l'adversaire suivant a montré qu'il peut couper", () => {
    // Au pli d'avant, roux n'a pas fourni à pique : il peut couper l'as de romain.
    const v = view({
      me: 'viv',
      hand: ['10s', '8s'],
      completed: [
        trick(
          [
            ['benel', 'Ks'],
            ['viv', '9s'],
            ['roux', '7d'],
            ['romain', 'Qs'],
          ],
          'benel',
        ),
      ],
      current: placed([
        ['romain', 'As'],
        ['benel', '7s'],
      ]),
    })
    expect(chooseCard(v, ['10s', '8s'])).toBe('8s')
  })
})

describe("quand l'adversaire tient le pli", () => {
  it('on prend avec la plus petite carte qui suffit', () => {
    const v = view({
      me: 'viv',
      hand: ['As', '10s', '8s'],
      current: placed([
        ['romain', '7s'],
        ['benel', 'Ks'],
      ]),
    })
    expect(trickMaster(v)).toBe('benel')
    // le dix suffit à passer devant le roi : on garde l'as
    expect(chooseCard(v, ['As', '10s', '8s'])).toBe('10s')
  })

  it('on se défausse au moins cher quand on ne peut pas prendre', () => {
    const v = view({
      me: 'viv',
      hand: ['9s', '8s'],
      current: placed([
        ['romain', '7s'],
        ['benel', 'As'],
      ]),
    })
    expect(chooseCard(v, ['9s', '8s'])).toBe('8s')
  })
})

describe('compter les cartes passées', () => {
  const fallen = (cards: Card[]) => [
    trick(
      PLAYER_IDS.map((p, i) => [p, cards[i]]),
      'romain',
    ),
  ]

  it("le dix devient maître une fois l'as tombé", () => {
    const v = view({ me: 'viv', hand: ['10s'], completed: fallen(['As', '7d', '8d', '9d']) })
    expect(isMaster('10s', v)).toBe(true)
  })

  it("mais pas tant que l'as est dehors", () => {
    const v = view({ me: 'viv', hand: ['10s'], completed: fallen(['7s', '7d', '8d', '9d']) })
    expect(isMaster('10s', v)).toBe(false)
  })
})

type SaidBid = [PlayerId, number, 's' | 'h' | 'd' | 'c'] | [PlayerId, null]

/** Les enchères déjà dites, dans l'ordre de parole ; le donneur est roux, romain parle en premier. */
const bids = (saidBids: SaidBid[]) =>
  saidBids.reduce(
    (state, d) =>
      apply(
        state,
        (d[1] === null
          ? { kind: 'pass', player: d[0] }
          : { kind: 'contract', player: d[0], value: d[1], suit: d[2] }) as BiddingEntry,
      ),
    newBidding('roux', DEFAULT_SEATING),
  )

describe('enchère', () => {
  it('passe avec une main faible', () => {
    expect(chooseBid(['7s', '8s', '9s', '7d', '8d', '9d', '7c', '8c'], bids([]), 'romain')).toBeNull()
  })

  it('annonce dans sa meilleure couleur avec une main forte', () => {
    const hand: Card[] = ['Jh', '9h', 'Ah', '10h', 'Kh', 'As', 'Ad', 'Ac']
    const bid = chooseBid(hand, bids([]), 'romain')
    expect(bid?.trump).toBe('h')
    expect(bid!.value).toBeGreaterThanOrEqual(110)
  })

  it('ouvre à 80 avec valet, neuf troisièmes et un as', () => {
    const hand: Card[] = ['Jh', '9h', '7h', 'As', '8d', '9d', '7c', '8c']
    expect(chooseBid(hand, bids([]), 'romain')).toEqual({ value: 80, trump: 'h' })
  })

  it('soutient son partenaire avec le neuf troisième et un as', () => {
    // romain ouvre 80♥, benel passe : viv a 9♥ 8♥ 7♥ et l'as de pique.
    const hand: Card[] = ['9h', '8h', '7h', 'As', '8d', '9d', '7c', '8c']
    const state = bids([
      ['romain', 80, 'h'],
      ['benel', null],
    ])
    expect(chooseBid(hand, state, 'viv')).toEqual({ value: 100, trump: 'h' })
  })

  it('soutient de 20 avec le valet', () => {
    const hand: Card[] = ['Jh', '8h', '7s', '8s', '8d', '9d', '7c', '8c']
    const state = bids([
      ['romain', 80, 'h'],
      ['benel', null],
    ])
    expect(chooseBid(hand, state, 'viv')).toEqual({ value: 100, trump: 'h' })
  })

  it('sans rien pour le partenaire, on le laisse jouer', () => {
    const hand: Card[] = ['7h', '8s', '7s', '9s', '8d', '9d', '7c', '8c']
    const state = bids([
      ['romain', 80, 'h'],
      ['benel', null],
    ])
    expect(chooseBid(hand, state, 'viv')).toBeNull()
  })

  it("l'ouvreur ne remonte pas sur le soutien de son partenaire", () => {
    const hand: Card[] = ['Jh', '9h', '7h', 'As', 'Ad', '9d', '7c', '8c']
    const state = bids([
      ['romain', 80, 'h'],
      ['benel', null],
      ['viv', 100, 'h'],
      ['roux', null],
    ])
    expect(chooseBid(hand, state, 'romain')).toBeNull()
  })

  it('soutient même quand un adversaire a surenchéri, si ça passe au-dessus', () => {
    // romain 80♥, benel 90♠ : viv apporte valet + deux as = 40, donc 120♥.
    const hand: Card[] = ['Jh', '8h', 'As', 'Ad', '8d', '9d', '7c', '8c']
    const state = bids([
      ['romain', 80, 'h'],
      ['benel', 90, 's'],
    ])
    expect(chooseBid(hand, state, 'viv')).toEqual({ value: 120, trump: 'h' })
  })

  it("ne surenchérit pas en dessous de l'enchère en cours", () => {
    const hand: Card[] = ['Jh', '9h', '7h', '8h', 'As', '7d', '8d', '7c']
    expect(chooseBid(hand, bids([['romain', 160, 's']]), 'benel')).toBeNull()
  })
})

describe('quatre bots jouent une donne entière', () => {
  it('32 coups légaux, huit plis, aucune carte jouée deux fois', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const pile = shuffle([...DECK], rnd)
    const hands = new Map<PlayerId, Card[]>(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)]))

    let state = newPlay('h', 'romain', DEFAULT_SEATING)
    const playedCards: Card[] = []

    for (let i = 0; i < 32; i++) {
      const player = currentPlayer(state)!
      const hand = hands.get(player)!
      const playable = playableFor(state, player, hand)
      const card = chooseCard(
        {
          me: player,
          seating: DEFAULT_SEATING,
          hand: hand,
          trump: 'h',
          taker: 'romain',
          current: state.current,
          completed: state.completed,
        },
        playable,
      )
      expect(playable).toContain(card)
      hand.splice(hand.indexOf(card), 1)
      playedCards.push(card)
      state = applyPlayed(state, player, card)
    }

    expect(isDealOver(state)).toBe(true)
    expect(state.completed).toHaveLength(8)
    expect(new Set(playedCards).size).toBe(32)
  })
})
