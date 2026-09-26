import { describe, expect, it } from 'vitest'
import { DECK, type Card } from '../cards'
import { DEFAULT_SEATING, type PlayerId, PLAYER_IDS, type Seating } from '../players'
import { dealHands } from '../deal'
import {
  IllegalPlay,
  TRICKS_PER_DEAL,
  applyPlayed,
  beloteHeld,
  canDeclareBelote,
  currentPlayer,
  handAt,
  isDealOver,
  leader,
  newPlay,
  play,
  playableFor,
  tricksForScoring,
  trickFlags,
} from '../play'
import { scoreDeal, type Contract } from '../scoring'
import { RULES } from '../rules'
import { SHAME_THRESHOLD, currentDeal, dealerOf, declaredBelote, seatingOf, starsInGame } from '../replay'
import type { GameEvent } from '../events'

// Sièges dans le sens du jeu : romain(0) · benel(1) · viv(2) · roux(3)
const hands: Record<PlayerId, Card[]> = {
  romain: ['As', '7s', 'Ah', '7h', 'Ad', '7d', 'Ac', '7c'],
  benel: ['10s', '8s', '10h', '8h', '10d', '8d', '10c', '8c'],
  viv: ['Ks', '9s', 'Kh', '9h', 'Kd', '9d', 'Kc', '9c'],
  roux: ['Qs', 'Js', 'Qh', 'Jh', 'Qd', 'Jd', 'Qc', 'Jc'],
}

describe('ordre du jeu', () => {
  it("l'entameur joue, puis on tourne dans le sens du jeu", () => {
    let s = newPlay('h', 'viv', DEFAULT_SEATING) // atout cœur : le pique n'oblige à rien
    expect(currentPlayer(s)).toBe('viv')
    s = play(s, 'viv', 'Ks', hands.viv)
    expect(currentPlayer(s)).toBe('roux')
    s = play(s, 'roux', 'Qs', hands.roux)
    expect(currentPlayer(s)).toBe('romain')
  })

  it("quand l'atout est demandé, il faut monter si on peut", () => {
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = play(s, 'viv', 'Ks', hands.viv)
    // Roux tient le valet d'atout : la dame lui est interdite.
    expect(playableFor(s, 'roux', hands.roux)).toEqual(['Js'])
    expect(() => play(s, 'roux', 'Qs', hands.roux)).toThrow(IllegalPlay)
  })

  it('refuse de jouer hors de son tour', () => {
    const s = newPlay('s', 'viv', DEFAULT_SEATING)
    expect(() => play(s, 'roux', 'Qs', hands.roux)).toThrow(IllegalPlay)
  })

  it("refuse une carte qu'on n'a pas", () => {
    const s = newPlay('s', 'viv', DEFAULT_SEATING)
    expect(() => play(s, 'viv', 'As', hands.viv)).toThrow(IllegalPlay)
  })

  it('refuse une carte non jouable — ici, ne pas fournir', () => {
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = play(s, 'viv', 'Kh', hands.viv) // entame à cœur
    // Roux a du cœur : il doit fournir, pas jouer carreau.
    expect(playableFor(s, 'roux', hands.roux)).toEqual(['Qh', 'Jh'])
    expect(() => play(s, 'roux', 'Qd', hands.roux)).toThrow(IllegalPlay)
  })
})

describe('résolution du pli', () => {
  it('attribue le pli, ses points, et la main au gagnant', () => {
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = play(s, 'viv', 'Kh', hands.viv)
    s = play(s, 'roux', 'Jh', hands.roux)
    s = play(s, 'romain', 'Ah', hands.romain)
    s = play(s, 'benel', '10h', hands.benel)

    expect(s.completed).toHaveLength(1)
    const trick = s.completed[0]
    expect(trick.winner).toBe('romain') // l'as de cœur domine
    expect(trick.points).toBe(11 + 10 + 4 + 2) // A + 10 + R + V hors atout
    expect(leader(s)).toBe('romain') // il entame le pli suivant
    expect(currentPlayer(s)).toBe('romain')
  })

  it('repère une coupe et une surcoupe', () => {
    const sansCoeur = {
      romain: ['7s', 'Ad', '7d', 'Ac'] as Card[],
      benel: ['10s', '8s', '10d', '8d'] as Card[],
    }
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = play(s, 'viv', 'Kh', hands.viv)
    s = play(s, 'roux', 'Jh', hands.roux)
    s = play(s, 'romain', '7s', sansCoeur.romain) // coupe
    s = play(s, 'benel', '10s', sansCoeur.benel) // surcoupe, obligatoire (JEU-4)
    expect(trickFlags(s.completed[0], 's')).toEqual({ cut: true, overcut: true })
    expect(s.completed[0].winner).toBe('benel')
  })
})

describe('donne complète', () => {
  /** Joue une donne entière en posant toujours la première carte jouable. */
  function playOut(trump: 's' | 'h' | 'd' | 'c', firstLeader: PlayerId) {
    const remaining: Record<string, Card[]> = Object.fromEntries(PLAYER_IDS.map((p) => [p, [...hands[p]]]))
    let s = newPlay(trump, firstLeader, DEFAULT_SEATING)
    while (!isDealOver(s)) {
      const p = currentPlayer(s)!
      const card = playableFor(s, p, remaining[p])[0]
      s = play(s, p, card, remaining[p])
      remaining[p] = remaining[p].filter((c) => c !== card)
    }
    return s
  }

  it('se termine après 8 plis, toutes les cartes jouées', () => {
    const s = playOut('s', 'viv')
    expect(s.completed).toHaveLength(TRICKS_PER_DEAL)
    expect(s.completed.flatMap((t) => t.plays)).toHaveLength(32)
    expect(currentPlayer(s)).toBeNull()
  })

  it('et totalise toujours 162 points', () => {
    const s = playOut('s', 'viv')
    const contract: Contract = {
      takerSeat: 2,
      value: 100,
      trump: 's',
      multiplier: 1,
      capot: false,
      generale: false,
    }
    const res = scoreDeal(tricksForScoring(s), contract, RULES)
    expect(res.cardPoints[0] + res.cardPoints[1]).toBe(162)
  })
})

describe('BEL-1 / BEL-2 — belote', () => {
  it("ne l'attribue à personne quand le Roi et la Dame sont séparés", () => {
    // Viv a le Roi de pique, Roux la Dame, et rien de plus haut pour monter.
    const split = { viv: ['Ks', '9h'] as Card[], roux: ['Qs', 'Jh'] as Card[] }
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = play(s, 'viv', 'Ks', split.viv)
    s = play(s, 'roux', 'Qs', split.roux)
    s = play(s, 'romain', 'As', hands.romain)
    s = play(s, 'benel', '10s', hands.benel)
    expect(beloteHeld(s, 's')).toBeNull()
  })

  it('attribue la belote à celui qui a joué les deux cartes', () => {
    // Viv tient Roi et Dame d'atout ; personne d'autre n'a de pique.
    const belote = {
      viv: ['Ks', 'Qs'] as Card[],
      roux: ['Qh', 'Jh'] as Card[],
      romain: ['Ah', '7h'] as Card[],
      benel: ['10h', '8h'] as Card[],
    }
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = play(s, 'viv', 'Ks', belote.viv)
    s = play(s, 'roux', 'Qh', belote.roux)
    s = play(s, 'romain', 'Ah', belote.romain)
    s = play(s, 'benel', '10h', belote.benel)
    expect(s.completed[0].winner).toBe('viv') // son atout emporte le pli

    s = play(s, 'viv', 'Qs', ['Qs'])
    s = play(s, 'roux', 'Jh', ['Jh'])
    s = play(s, 'romain', '7h', ['7h'])
    s = play(s, 'benel', '8h', ['8h'])
    expect(beloteHeld(s, 's')).toBe('viv')
  })
})

describe('la distribution alimente le jeu', () => {
  it("chaque joueur peut jouer les cartes qu'il a reçues", () => {
    const dealt = dealHands([...DECK], 'benel', DEFAULT_SEATING)
    const s = newPlay('h', 'viv', DEFAULT_SEATING)
    expect(playableFor(s, 'viv', dealt.viv)).toEqual(dealt.viv) // l'entameur est libre
  })
})

describe('BEL-2 — annonce de la belote', () => {
  it("s'annonce en posant le Roi ou la Dame d'atout, quand on tient les deux", () => {
    const s = newPlay('s', 'viv', DEFAULT_SEATING)
    const hand: Card[] = ['Ks', 'Qs', '9h']
    expect(canDeclareBelote(s, 'viv', 'Ks', hand, 's', false)).toBe(true)
    expect(canDeclareBelote(s, 'viv', 'Qs', hand, 's', false)).toBe(true)
    // Une autre carte n'annonce rien.
    expect(canDeclareBelote(s, 'viv', '9h', hand, 's', false)).toBe(false)
  })

  it("ne s'annonce pas si on ne tient qu'une des deux cartes", () => {
    const s = newPlay('s', 'viv', DEFAULT_SEATING)
    expect(canDeclareBelote(s, 'viv', 'Ks', ['Ks', '9h'], 's', false)).toBe(false)
  })

  const apresLeRoi = () => {
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = play(s, 'viv', 'Ks', ['Ks', 'Qs'])
    s = play(s, 'roux', 'Qh', ['Qh'])
    s = play(s, 'romain', 'Ah', ['Ah'])
    return play(s, 'benel', '10h', ['10h'])
  }

  it("la rebelote s'annonce sur la seconde carte, si la belote l'a été sur la première", () => {
    const s = apresLeRoi()
    expect(canDeclareBelote(s, 'viv', 'Qs', ['Qs'], 's', true)).toBe(true)
    // Mais pas pour quelqu'un d'autre.
    expect(canDeclareBelote(s, 'roux', 'Qs', ['Qs'], 's', true)).toBe(false)
  })

  it('pas de rebelote si la belote a été oubliée sur la première carte : elle est perdue', () => {
    expect(canDeclareBelote(apresLeRoi(), 'viv', 'Qs', ['Qs'], 's', false)).toBe(false)
  })
})

describe('BEL-6 — il faut annoncer aux deux cartes', () => {
  const declaration = (player: PlayerId): GameEvent =>
    ({ type: 'belote_annoncee', player, half: 'belote', seq: 0, at: 0 }) as GameEvent
  // Le rejeu se limite à la donne en cours : il lui faut sa distribution en tête.
  const donne = { type: 'donne_commencee', dealNumber: 1, seq: 0, at: 0 } as GameEvent

  it('deux annonces valident la belote', () => {
    expect(declaredBelote([donne, declaration('viv'), declaration('viv')])).toBe('viv')
  })

  it('une seule annonce ne suffit pas : la belote est perdue', () => {
    expect(declaredBelote([donne, declaration('viv')])).toBeNull()
  })

  it('deux joueurs ayant annoncé une fois chacun ne valident rien', () => {
    expect(declaredBelote([donne, declaration('viv'), declaration('roux')])).toBeNull()
  })

  it('aucune annonce, aucune belote', () => {
    expect(declaredBelote([donne])).toBeNull()
  })
})

describe('DEC-8 / DEC-9 — étoiles et honte complète', () => {
  const dealWithStar = (player: PlayerId | null): GameEvent =>
    ({
      type: 'donne_terminee',
      dealNumber: 1,
      status: 'reussi',
      cardPoints: [162, 0],
      compared: [162, 0],
      scores: [100, 0],
      beloteDeclaredBy: null,
      beloteForgottenBy: null,
      etoile: player,
      seq: 0,
      at: 0,
    }) as GameEvent

  it('compte les étoiles par joueur', () => {
    const stars = starsInGame([dealWithStar('roux'), dealWithStar('viv'), dealWithStar('roux')])
    expect(stars.get('roux')).toBe(2)
    expect(stars.get('viv')).toBe(1)
    expect(stars.get('benel')).toBeUndefined()
  })

  it("les donnes sans étoile n'en donnent à personne", () => {
    expect(starsInGame([dealWithStar(null), dealWithStar(null)]).size).toBe(0)
  })

  it("trois étoiles dans la partie, c'est la honte complète", () => {
    const three = [dealWithStar('roux'), dealWithStar('roux'), dealWithStar('roux')]
    expect(starsInGame(three).get('roux')).toBe(SHAME_THRESHOLD)
  })
})

describe('découpage par donne', () => {
  const ev = (type: string, extra: Record<string, unknown> = {}): GameEvent =>
    ({ type, seq: 0, at: 0, ...extra }) as GameEvent

  it('ne garde que ce qui suit la dernière distribution', () => {
    const journal = [
      ev('partie_creee'),
      ev('donne_commencee', { dealNumber: 1 }),
      ev('enchere'),
      ev('carte_jouee'),
      ev('donne_terminee'),
      ev('donne_commencee', { dealNumber: 2 }),
      ev('enchere'),
    ]
    const donne = currentDeal(journal)
    expect(donne).toHaveLength(2)
    expect(donne[0]).toMatchObject({ type: 'donne_commencee', dealNumber: 2 })
  })

  it('une belote annoncée à la donne précédente ne compte plus', () => {
    const journal = [
      ev('donne_commencee', { dealNumber: 1 }),
      ev('belote_annoncee', { player: 'viv' }),
      ev('belote_annoncee', { player: 'viv' }),
      ev('donne_commencee', { dealNumber: 2 }),
    ]
    expect(declaredBelote(journal)).toBeNull()
  })

  it("avant la première distribution, il n'y a rien à rejouer", () => {
    expect(currentDeal([ev('partie_creee')])).toEqual([])
  })
})

describe('le donneur vient de la distribution', () => {
  const ev = (type: string, extra: Record<string, unknown> = {}): GameEvent =>
    ({ type, seq: 0, at: 0, ...extra }) as GameEvent

  it('ignore le donneur du document de partie, qui a déjà tourné', () => {
    const journal = [ev('donne_commencee', { dealNumber: 1, dealer: 'benel' })]
    // Le document dit « viv » parce que la donne est finie et que le tour a avancé.
    expect(dealerOf(journal, 'viv')).toBe('benel')
  })

  it("retombe sur le donneur fourni quand aucune donne n'a commencé", () => {
    expect(dealerOf([ev('partie_creee')], 'roux')).toBe('roux')
  })
})

describe('le placement suit le salon', () => {
  const ev = (type: string, extra: Record<string, unknown> = {}): GameEvent =>
    ({ type, seq: 0, at: 0, ...extra }) as GameEvent
  const avant: Seating = ['romain', 'benel', 'viv', 'roux']
  const apres: Seating = ['romain', 'viv', 'benel', 'roux']

  it("après « Rejouer », les équipes changées au salon l'emportent sur celles de la création", () => {
    const journal = [
      ev('partie_creee', { seating: avant }),
      ev('placement', { seating: apres, dealer: 'viv' }),
    ]
    expect(seatingOf(journal, avant)).toEqual(apres)
  })

  it('sans rien au journal, le placement du document de partie', () => {
    expect(seatingOf([ev('partie_creee', { seating: null })], apres)).toEqual(apres)
  })
})

describe('la main ne circule plus', () => {
  it('se reconstitue depuis la donne distribuée et les cartes posées', () => {
    const distribuee: Card[] = ['Ks', 'Qs', '9h', '8h', 'Ad', '7d', 'Ac', '7c']
    let s = newPlay('s', 'viv', DEFAULT_SEATING)
    s = applyPlayed(s, 'viv', 'Ks')
    s = applyPlayed(s, 'roux', 'Qh')
    s = applyPlayed(s, 'romain', 'Ah')
    s = applyPlayed(s, 'benel', '10h')
    s = applyPlayed(s, 'viv', '9h')

    expect(handAt(distribuee, s, 'viv')).toEqual(['Qs', '8h', 'Ad', '7d', 'Ac', '7c'])
    // Et celle d'un autre joueur ne se déduit pas de ses propres cartes
    expect(handAt(distribuee, s, 'roux')).toEqual(distribuee)
  })

  it("le rejeu n'a besoin d'aucune main", () => {
    let s = newPlay('h', 'benel', DEFAULT_SEATING)
    // applyPlayed ne valide rien : le journal fait foi
    s = applyPlayed(s, 'benel', '7s')
    s = applyPlayed(s, 'viv', 'As')
    expect(s.current).toHaveLength(2)
    expect(currentPlayer(s)).toBe('roux')
  })
})
