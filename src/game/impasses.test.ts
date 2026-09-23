import { describe, expect, it } from 'vitest'
import { type Card, rankOf } from './cards'
import type { CompletedTrick, Play } from './play'
import { impassesOfGame, impassesOfTricks, impasseTallies } from './impasses'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId } from './players'
import { applyPlayed, currentPlayer, newPlay, playableFor } from './play'
import type { GameEvent } from './events'

/** Construit un pli terminé à la main : on teste la lecture, pas le moteur. */
function pli(cartes: Array<[PlayerId, Card]>, winner: PlayerId): CompletedTrick {
  const plays: Play[] = cartes.map(([player, card]) => ({ player, card }))
  return { leader: plays[0].player, plays, winner, points: 0 }
}

describe('détection de l\'impasse', () => {
  it('garder l\'as de la couleur entamée alors que personne n\'a coupé', () => {
    const tricks = [
      // Benel entame pique, Viv garde son as et fournit le 9
      pli([['benel', 'Ks'], ['viv', '9s'], ['roux', '8s'], ['romain', '7s']], 'benel'),
      // l'as sort plus tard et ramasse le 10 de Romain : impasse réussie
      pli([['benel', 'Qs'], ['viv', 'As'], ['roux', 'Js'], ['romain', '10s']], 'viv'),
    ]
    const [imp] = impassesOfTricks(tricks, 'h', 3)
    expect(imp).toMatchObject({
      player: 'viv', suit: 's', gardeeAu: 1, sortieAu: 2, issue: 'reussie', dealNumber: 3,
    })
  })

  it('l\'as coupé derrière, c\'est raté', () => {
    const tricks = [
      pli([['benel', 'Ks'], ['viv', '9s'], ['roux', '8s'], ['romain', '7s']], 'benel'),
      pli([['benel', 'Qs'], ['viv', 'As'], ['roux', '7h'], ['romain', '10s']], 'roux'),
    ]
    expect(impassesOfTricks(tricks, 'h')[0].issue).toBe('ratee')
  })

  it('l\'as ramasse mais sans dix : sans suite', () => {
    const tricks = [
      pli([['benel', 'Ks'], ['viv', '9s'], ['roux', '8s'], ['romain', '7s']], 'benel'),
      pli([['benel', 'Qs'], ['viv', 'As'], ['roux', 'Js'], ['romain', '9h']], 'viv'),
    ]
    expect(impassesOfTricks(tricks, 'h')[0].issue).toBe('sans_suite')
  })

  it('pas d\'impasse si quelqu\'un a déjà coupé avant lui', () => {
    const tricks = [
      pli([['benel', 'Ks'], ['roux', '7h'], ['viv', '9s'], ['romain', '7s']], 'roux'),
      pli([['roux', 'Qs'], ['viv', 'As'], ['romain', '10s'], ['benel', 'Js']], 'viv'),
    ]
    expect(impassesOfTricks(tricks, 'h')).toEqual([])
  })

  it('pas d\'impasse quand l\'atout est la couleur entamée', () => {
    const tricks = [
      pli([['benel', 'Kh'], ['viv', '9h'], ['roux', '8h'], ['romain', '7h']], 'viv'),
      pli([['viv', 'Ah'], ['roux', 'Qh'], ['romain', '10h'], ['benel', 'Jh']], 'roux'),
    ]
    expect(impassesOfTricks(tricks, 'h')).toEqual([])
  })

  it('l\'entameur ne fait pas d\'impasse : il choisit sa couleur', () => {
    const tricks = [
      pli([['viv', '9s'], ['roux', '8s'], ['romain', '7s'], ['benel', 'Ks']], 'benel'),
      pli([['benel', 'Qs'], ['viv', 'As'], ['roux', 'Js'], ['romain', '10s']], 'viv'),
    ]
    expect(impassesOfTricks(tricks, 'h')).toEqual([])
  })

  it('un as gardé deux fois ne compte qu\'une impasse', () => {
    const tricks = [
      pli([['benel', 'Ks'], ['viv', '9s'], ['roux', '8s'], ['romain', '7s']], 'benel'),
      pli([['benel', 'Qs'], ['viv', '10s'], ['roux', 'Js'], ['romain', '7h']], 'romain'),
      pli([['benel', '8h'], ['viv', 'As'], ['roux', '9h'], ['romain', '10h']], 'romain'),
    ]
    const list = impassesOfTricks(tricks, 'h')
    expect(list).toHaveLength(1)
    expect(list[0].gardeeAu).toBe(1)
  })

  it('tant que l\'as n\'est pas tombé, rien n\'est visible', () => {
    const debut = pli([['benel', 'Ks'], ['viv', '9s'], ['roux', '8s'], ['romain', '7s']], 'benel')
    expect(impassesOfTricks([debut], 'h')).toEqual([])

    const suite = pli([['benel', 'Qs'], ['viv', 'As'], ['roux', 'Js'], ['romain', '10s']], 'viv')
    expect(impassesOfTricks([debut, suite], 'h')).toHaveLength(1)
  })

  it('le décompte par joueur', () => {
    const t = impasseTallies([
      { player: 'viv', suit: 's', gardeeAu: 1, sortieAu: 2, issue: 'reussie', dealNumber: 1 },
      { player: 'viv', suit: 'd', gardeeAu: 3, sortieAu: 5, issue: 'ratee', dealNumber: 1 },
      { player: 'viv', suit: 'c', gardeeAu: 2, sortieAu: 4, issue: 'sans_suite', dealNumber: 2 },
    ])
    expect(t.get('viv')).toEqual({ tentees: 3, reussies: 1, ratees: 1 })
    expect(t.get('roux')).toEqual({ tentees: 0, reussies: 0, ratees: 0 })
  })
})

describe('impasses lues depuis le journal', () => {
  it('une donne entière donne le même résultat que la lecture des plis', () => {
    const mains: Record<PlayerId, Card[]> = {
      // romain a trois piques dont l'as : de quoi le garder au deuxième pli
      romain: ['10s', 'As', '7s', '7h', '8h', 'Ad', '7d', '7c'],
      benel: ['Ks', '9s', '8s', '9h', '10h', 'Kd', '8d', '8c'],
      viv: ['Qs', 'Ah', 'Kh', 'Qd', '9d', 'Ac', 'Kc', '9c'],
      roux: ['Js', 'Qh', 'Jh', 'Jd', '10d', 'Qc', 'Jc', '10c'],
    }
    // benel donne, donc romain entame ; atout cœur
    let state = newPlay('h', 'romain', DEFAULT_SEATING)
    const restantes = new Map(PLAYER_IDS.map((p) => [p, [...mains[p]]]))
    const events: GameEvent[] = [
      { type: 'donne_commencee', dealNumber: 1, dealer: 'benel' } as GameEvent,
      {
        type: 'contrat_fixe', taker: 'romain', value: 100, trump: 'h',
        multiplier: 1, capot: false, generale: false,
      } as GameEvent,
    ]

    for (let i = 0; i < 32; i++) {
      const joueur = currentPlayer(state)!
      const main = restantes.get(joueur)!
      // on garde les as tant qu'on peut : c'est exactement ce qui crée les impasses
      const jouables = playableFor(state, joueur, main)
      const carte = jouables.find((c) => rankOf(c) !== 'A') ?? jouables[0]
      main.splice(main.indexOf(carte), 1)
      events.push({
        type: 'carte_jouee', player: joueur, card: carte,
        trickNumber: state.completed.length + 1,
      } as GameEvent)
      state = applyPlayed(state, joueur, carte)
    }

    const direct = impassesOfTricks(state.completed, 'h', 1)
    expect(impassesOfGame(events, 'benel', DEFAULT_SEATING)).toEqual(direct)
    expect(direct.length).toBeGreaterThan(0)
  })
})
