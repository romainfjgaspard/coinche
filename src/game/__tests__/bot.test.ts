import { describe, expect, it } from 'vitest'
import { type Card, DECK, shuffle } from '../cards'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId } from '../players'
import { applyPlayed, currentPlayer, isDealOver, newPlay, playableFor } from '../play'
import type { BotView } from '../bot'
import { chooseBid, chooseCard, isMaster, trickMaster } from '../bot'

/** Sièges : romain(0) · benel(1) · viv(2) · roux(3). Équipes : 0+2 contre 1+3. */
const vue = (p: Partial<BotView> & Pick<BotView, 'me' | 'hand'>): BotView => ({
  seating: DEFAULT_SEATING,
  trump: 'h',
  taker: 'romain',
  current: [],
  completed: [],
  ...p,
})

const pose = (paires: Array<[PlayerId, Card]>) => paires.map(([player, card]) => ({ player, card }))

describe("le bot ne choisit que dans ce qu'on lui donne", () => {
  it('rend toujours une carte de la liste légale', () => {
    const v = vue({ me: 'viv', hand: ['As', '10s', '8s', '7h'] })
    for (const level of ['simple', 'compteur'] as const) {
      expect(['As', '10s']).toContain(chooseCard(v, ['As', '10s'], level))
    }
  })

  it("refuse de jouer quand rien n'est jouable", () => {
    expect(() => chooseCard(vue({ me: 'viv', hand: [] }), [])).toThrow()
  })
})

describe('entame', () => {
  it('le camp du preneur tire les atouts', () => {
    const v = vue({ me: 'romain', taker: 'romain', hand: ['Jh', '7h', 'As'] })
    expect(chooseCard(v, ['Jh', '7h', 'As'])).toBe('Jh')
  })

  it("la défense sort sa carte maîtresse plutôt qu'un atout", () => {
    const v = vue({ me: 'benel', taker: 'romain', hand: ['As', '7h', '8d'] })
    expect(chooseCard(v, ['As', '7h', '8d'])).toBe('As')
  })

  it('sans rien de maître, elle ouvre petit et garde ses atouts', () => {
    const v = vue({ me: 'benel', taker: 'romain', hand: ['9s', '8d', 'Jh'] })
    expect(chooseCard(v, ['9s', '8d', 'Jh'])).not.toBe('Jh')
  })
})

describe('quand le partenaire tient le pli', () => {
  it('on charge si plus personne ne peut reprendre', () => {
    // roux joue en dernier ; son partenaire benel est maître
    const v = vue({
      me: 'roux',
      hand: ['10s', '9s'],
      current: pose([
        ['romain', '7s'],
        ['benel', 'As'],
        ['viv', '8s'],
      ]),
    })
    expect(trickMaster(v)).toBe('benel')
    expect(chooseCard(v, ['10s', '9s'])).toBe('10s')
  })

  it('on garde ses points tant que le pli peut échapper', () => {
    // viv joue en troisième ; son partenaire romain est maître, roux passe après
    const v = vue({
      me: 'viv',
      hand: ['10s', '8s'],
      current: pose([
        ['romain', 'As'],
        ['benel', '7s'],
      ]),
    })
    expect(trickMaster(v)).toBe('romain')
    expect(chooseCard(v, ['10s', '8s'])).toBe('8s')
  })
})

describe("quand l'adversaire tient le pli", () => {
  it('on prend avec la plus petite carte qui suffit', () => {
    const v = vue({
      me: 'viv',
      hand: ['As', '10s', '8s'],
      current: pose([
        ['romain', '7s'],
        ['benel', 'Ks'],
      ]),
    })
    expect(trickMaster(v)).toBe('benel')
    // le dix suffit à passer devant le roi : on garde l'as
    expect(chooseCard(v, ['As', '10s', '8s'])).toBe('10s')
  })

  it('on se défausse au moins cher quand on ne peut pas prendre', () => {
    const v = vue({
      me: 'viv',
      hand: ['9s', '8s'],
      current: pose([
        ['romain', '7s'],
        ['benel', 'As'],
      ]),
    })
    expect(chooseCard(v, ['9s', '8s'])).toBe('8s')
  })
})

describe('compter les cartes passées', () => {
  const tombe = (cartes: Card[]) => [
    {
      leader: 'romain' as PlayerId,
      plays: pose(PLAYER_IDS.map((p, i) => [p, cartes[i]])),
      winner: 'romain' as PlayerId,
      points: 0,
    },
  ]

  it("en simple, seul l'as est considéré comme maître", () => {
    const v = vue({ me: 'viv', hand: ['10s'], completed: tombe(['As', '7d', '8d', '9d']) })
    expect(isMaster('10s', v, 'simple')).toBe(false)
  })

  it("en compteur, le dix devient maître une fois l'as tombé", () => {
    const v = vue({ me: 'viv', hand: ['10s'], completed: tombe(['As', '7d', '8d', '9d']) })
    expect(isMaster('10s', v, 'compteur')).toBe(true)
  })

  it("mais pas tant que l'as est dehors", () => {
    const v = vue({ me: 'viv', hand: ['10s'], completed: tombe(['7s', '7d', '8d', '9d']) })
    expect(isMaster('10s', v, 'compteur')).toBe(false)
  })
})

describe('enchère', () => {
  it('passe avec une main faible', () => {
    expect(chooseBid(['7s', '8s', '9s', '7d', '8d', '9d', '7c', '8c'], 0, false)).toBeNull()
  })

  it('annonce dans sa meilleure couleur avec une main forte', () => {
    const main: Card[] = ['Jh', '9h', 'Ah', '10h', 'Kh', 'As', 'Ad', 'Ac']
    const bid = chooseBid(main, 0, false)
    expect(bid?.trump).toBe('h')
    expect(bid!.value).toBeGreaterThanOrEqual(110)
  })

  it('laisse parler son partenaire', () => {
    const main: Card[] = ['Jh', '9h', 'Ah', '10h', 'Kh', 'As', 'Ad', 'Ac']
    expect(chooseBid(main, 90, true)).toBeNull()
  })

  it("ne surenchérit pas en dessous de l'enchère en cours", () => {
    const main: Card[] = ['Jh', '9h', '7h', '8h', 'As', '7d', '8d', '7c']
    expect(chooseBid(main, 160, false)).toBeNull()
  })
})

describe('quatre bots jouent une donne entière', () => {
  it('32 coups légaux, huit plis, aucune carte jouée deux fois', () => {
    let graine = 7
    const rnd = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648
    const pile = shuffle([...DECK], rnd)
    const mains = new Map<PlayerId, Card[]>(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)]))

    let state = newPlay('h', 'romain', DEFAULT_SEATING)
    const jouees: Card[] = []

    for (let i = 0; i < 32; i++) {
      const joueur = currentPlayer(state)!
      const main = mains.get(joueur)!
      const jouables = playableFor(state, joueur, main)
      const carte = chooseCard(
        {
          me: joueur,
          seating: DEFAULT_SEATING,
          hand: main,
          trump: 'h',
          taker: 'romain',
          current: state.current,
          completed: state.completed,
        },
        jouables,
        i % 2 === 0 ? 'simple' : 'compteur',
      )
      expect(jouables).toContain(carte)
      main.splice(main.indexOf(carte), 1)
      jouees.push(carte)
      state = applyPlayed(state, joueur, carte)
    }

    expect(isDealOver(state)).toBe(true)
    expect(state.completed).toHaveLength(8)
    expect(new Set(jouees).size).toBe(32)
  })
})
