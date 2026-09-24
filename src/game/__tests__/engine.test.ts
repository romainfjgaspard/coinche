import { describe, expect, it } from 'vitest'
import { DEFAULT_SEATING } from '../players'
import { DECK, type Card, gatherAndCut, sortHand, strength, value } from '../cards'
import { type PlayedCard, playableCards, trickWinner } from '../trick'
import { RULES, isGameOver } from '../rules'
import { dealHands, dealingOrder } from '../deal'
import {
  TOTAL_CARD_POINTS, hasBelote, isContractMade, scoreDeal, unannouncedCapot, type Contract,
} from '../scoring'

const play = (seat: number, card: Card): PlayedCard => ({ seat, card })

describe('cartes', () => {
  it('le paquet complet vaut 152 points quel que soit l\'atout', () => {
    for (const trump of ['s', 'h', 'd', 'c'] as const) {
      expect(DECK.reduce((s, c) => s + value(c, trump), 0)).toBe(TOTAL_CARD_POINTS)
    }
  })

  it('ORD-1 — à l\'atout, le valet domine le 9 qui domine l\'as', () => {
    expect(strength('Js', 's')).toBeGreaterThan(strength('9s', 's'))
    expect(strength('9s', 's')).toBeGreaterThan(strength('As', 's'))
    expect(value('Js', 's')).toBe(20)
    expect(value('9s', 's')).toBe(14)
  })

  it('ORD-2 — hors atout, l\'as domine et le valet ne vaut que 2', () => {
    expect(strength('Ah', 's')).toBeGreaterThan(strength('10h', 's'))
    expect(value('Jh', 's')).toBe(2)
  })

  it('trie la main atout en tête', () => {
    expect(sortHand(['7h', 'As', '9s', 'Ah'], 's')[0]).toBe('9s')
  })

  it('alterne rouge et noir pour que deux couleurs voisines ne se confondent pas', () => {
    const couleurs = (main: Card[]) => main.map((c) => c.slice(-1))
    // Sans atout : pique, cœur, trèfle, carreau — jamais deux noires côte à côte.
    expect(couleurs(sortHand(['7c', '8d', '9s', '10h'], null))).toEqual(['s', 'h', 'c', 'd'])
    // Atout cœur en tête, puis on repart sur une noire.
    expect(couleurs(sortHand(['7c', '8d', '9s', '10h'], 'h'))).toEqual(['h', 's', 'd', 'c'])
    // Sans rouge disponible, on garde les noires groupées par couleur.
    expect(couleurs(sortHand(['Ac', '7s', 'Kc'], null))).toEqual(['s', 'c', 'c'])
  })

  it('DIS-2 — on ramasse les plis et on coupe, sans rebattre', () => {
    const tricks: Card[][] = [['Ks', 'As', '7s', '9s'], ['Jh', '9h', '8h', 'Ah']]
    expect(gatherAndCut(tricks, 0)).toEqual(['Ks', 'As', '7s', '9s', 'Jh', '9h', '8h', 'Ah'])
    // La coupe déplace le sommet du paquet, sans jamais casser les plis.
    expect(gatherAndCut(tricks, 4)).toEqual(['Jh', '9h', '8h', 'Ah', 'Ks', 'As', '7s', '9s'])
  })
})

describe('pli', () => {
  it('l\'atout bat la couleur demandée', () => {
    expect(trickWinner([play(0, 'Ah'), play(1, '7s')], 's')).toBe(1)
  })

  it('une carte d\'une autre couleur ne remporte rien', () => {
    expect(trickWinner([play(0, '7h'), play(1, 'Ad')], 's')).toBe(0)
  })

  it('le plus gros atout remporte le pli', () => {
    expect(trickWinner([play(0, '7h'), play(1, 'As'), play(2, 'Js'), play(3, '9s')], 's')).toBe(2)
  })
})

describe('cartes jouables', () => {
  it('JEU-2 — obligation de fournir la couleur demandée', () => {
    expect(playableCards(['Ah', '7h', 'As', 'Kd'], [play(0, '8h')], 's', 1)).toEqual(['Ah', '7h'])
  })

  it('JEU-3 — obligation de couper si l\'adversaire est maître', () => {
    expect(playableCards(['Ad', '7s', 'Kd'], [play(0, '8h')], 's', 1)).toEqual(['7s'])
  })

  it('JEU-4 — obligation de monter à l\'atout sur une coupe adverse', () => {
    const trick = [play(0, '8h'), play(1, '9s')]
    expect(playableCards(['7s', 'Js', 'Kd'], trick, 's', 2)).toEqual(['Js'])
  })

  it('JEU-8 — sous-coupe obligatoire quand on ne peut pas monter', () => {
    const trick = [play(0, '8h'), play(1, 'Js')] // le valet d'atout : imbattable
    expect(playableCards(['7s', '9s', 'Kd'], trick, 's', 2)).toEqual(['7s', '9s'])
  })

  it('JEU-5 — on se défausse librement quand le partenaire est maître', () => {
    const hand: Card[] = ['Ad', '7s', 'Kd']
    const trick = [play(0, 'Ah'), play(1, '7h')] // siège 0, partenaire du siège 2
    expect(playableCards(hand, trick, 's', 2)).toEqual(hand)
  })

  it('celui qui entame joue ce qu\'il veut', () => {
    expect(playableCards(['Ad', '7s'], [], 's', 0)).toEqual(['Ad', '7s'])
  })
})

describe('DEC-3 / DEC-7 — réussite du contrat', () => {
  it('atteindre le contrat ne suffit pas : il faut devancer la défense', () => {
    expect(isContractMade(90, 72, 90)).toBe(true)
    expect(isContractMade(85, 90, 90)).toBe(false) // devant personne, et sous le contrat
  })

  it('DEC-7 — l\'égalité 81-81 chute', () => {
    expect(isContractMade(81, 81, 80)).toBe(false)
    expect(isContractMade(82, 80, 80)).toBe(true)
  })

  it('contrat à 90 avec la belote : 72 cartes suffisent, 70 ne suffisent pas', () => {
    // 72 cartes + 20 de belote = 92, contre 162 - 72 = 90 pour la défense
    expect(isContractMade(72 + 20, 162 - 72, 90)).toBe(true)
    // 70 cartes + 20 = 90, mais la défense est à 92
    expect(isContractMade(70 + 20, 162 - 70, 90)).toBe(false)
  })
})

describe('décompte', () => {
  const allTricksTo = (seat: number): PlayedCard[][] =>
    Array.from({ length: 8 }, () => [play(seat, 'Js'), play((seat + 1) % 4, '7h'), play((seat + 2) % 4, '8h'), play((seat + 3) % 4, '9h')])

  const contract = (over: Partial<Contract> = {}): Contract => ({
    takerSeat: 0, value: 100, trump: 's', multiplier: 1, capot: false, generale: false, ...over,
  })

  it('BEL-1 — détecte la belote', () => {
    expect(hasBelote(['Ks', 'Qs', '7h'], 's')).toBe(true)
    expect(hasBelote(['Ks', 'Qh', '7h'], 's')).toBe(false)
  })

  it('DEC-1 — contrat réussi : le preneur marque son enchère, la défense rien', () => {
    const res = scoreDeal(allTricksTo(0), contract(), RULES)
    expect(res.status).toBe('reussi')
    expect(res.scores).toEqual([100, 0])
  })

  it('DEC-2 — contrat chuté : la défense marque l\'enchère, le preneur rien', () => {
    const res = scoreDeal(allTricksTo(1), contract(), RULES)
    expect(res.status).toBe('chute')
    expect(res.scores).toEqual([0, 100])
  })

  it('DEC-4 — la coinche double l\'enjeu, la surcoinche le quadruple', () => {
    expect(scoreDeal(allTricksTo(0), contract({ multiplier: 2 }), RULES).scores).toEqual([200, 0])
    expect(scoreDeal(allTricksTo(1), contract({ multiplier: 4 }), RULES).scores).toEqual([0, 400])
  })

  it('DEC-5 — le capot annoncé et réussi vaut 250', () => {
    const res = scoreDeal(allTricksTo(0), contract({ capot: true, value: RULES.capotValue }), RULES)
    expect(res.status).toBe('capot')
    expect(res.scores).toEqual([250, 0])
  })

  it('BEL-5 — la belote n\'est jamais marquée, seulement comparée', () => {
    const res = scoreDeal(allTricksTo(0), contract(), RULES, 0)
    expect(res.compared[0]).toBe(res.cardPoints[0] + 20)
    expect(res.scores).toEqual([100, 0]) // et non 120
  })

  it('une donne complète vaut toujours 162 points', () => {
    const tricks: PlayedCard[][] = []
    for (let i = 0; i < 8; i++) tricks.push(DECK.slice(i * 4, i * 4 + 4).map((c, j) => play(j, c)))
    const res = scoreDeal(tricks, contract({ value: 80 }), RULES)
    expect(res.cardPoints[0] + res.cardPoints[1]).toBe(162)
  })
})

describe('FIN-1 — fin de partie', () => {
  it('il faut dépasser 1000 : 1000 ne suffit pas', () => {
    expect(isGameOver([1000, 420])).toBe(false)
    expect(isGameOver([1010, 420])).toBe(true)
  })
})

describe('DIS-1 — distribution 3-2-3', () => {
  it('donne 8 cartes à chacun, sans doublon ni carte perdue', () => {
    const hands = dealHands([...DECK], 'benel', DEFAULT_SEATING)
    const all = Object.values(hands).flat()
    expect(all).toHaveLength(32)
    expect(new Set(all).size).toBe(32)
    for (const cards of Object.values(hands)) expect(cards).toHaveLength(8)
  })

  it('sert le joueur à gauche du donneur en premier', () => {
    // Sièges dans le sens du jeu : romain(0) · benel(1) · viv(2) · roux(3)
    expect(dealingOrder('benel', DEFAULT_SEATING)).toEqual(['viv', 'roux', 'romain', 'benel'])
    expect(dealingOrder('romain', DEFAULT_SEATING)).toEqual(['benel', 'viv', 'roux', 'romain'])
  })

  it('distribue bien par paquets de 3, 2 puis 3', () => {
    const hands = dealHands([...DECK], 'benel', DEFAULT_SEATING)
    // Viv est servie en premier : cartes 0-2, puis 12-13, puis 20-22 du paquet
    expect(hands.viv).toEqual([...DECK.slice(0, 3), ...DECK.slice(12, 14), ...DECK.slice(20, 23)])
  })
})

describe('DEC-8 — capot non annoncé', () => {
  const allTricksTo = (seat: number): PlayedCard[][] =>
    Array.from({ length: 8 }, () => [
      play(seat, 'Js'), play((seat + 1) % 4, '7h'), play((seat + 2) % 4, '8h'), play((seat + 3) % 4, '9h'),
    ])
  const contract = (over: Partial<Contract> = {}): Contract => ({
    takerSeat: 0, value: 100, trump: 's', multiplier: 1, capot: false, generale: false, ...over,
  })

  it('vaut une étoile quand le preneur rafle tout sans l\'avoir annoncé', () => {
    const c = contract()
    const res = scoreDeal(allTricksTo(0), c, RULES)
    expect(unannouncedCapot(res, c)).toBe(true)
    expect(res.scores).toEqual([100, 0]) // le score, lui, ne bouge pas
  })

  it('pas d\'étoile si le capot avait été annoncé', () => {
    const c = contract({ capot: true, value: RULES.capotValue })
    expect(unannouncedCapot(scoreDeal(allTricksTo(0), c, RULES), c)).toBe(false)
  })

  it('pas d\'étoile quand c\'est la défense qui rafle les huit plis', () => {
    // Déroute du preneur, pas une sous-enchère : personne ne récolte d'étoile.
    const c = contract()
    const res = scoreDeal(allTricksTo(1), c, RULES)
    expect(res.tricksWon).toEqual([0, 8])
    expect(unannouncedCapot(res, c)).toBe(false)
  })

  it('pas d\'étoile si un pli a échappé au preneur', () => {
    const c = contract()
    const tricks = allTricksTo(0)
    tricks[7] = [play(1, 'Js'), play(2, '7h'), play(3, '8h'), play(0, '9h')]
    expect(unannouncedCapot(scoreDeal(tricks, c, RULES), c)).toBe(false)
  })
})

describe('tout-atout', () => {
  const pli = (...cards: Card[]): PlayedCard[] => cards.map((card, seat) => ({ seat, card }))

  it("chaque couleur suit l'ordre de l'atout : le valet bat l'as", () => {
    expect(trickWinner(pli('As', 'Js', '9s', '10s'), 'ta')).toBe(1)
    // En sans-atout, c'est l'as.
    expect(trickWinner(pli('As', 'Js', '9s', '10s'), null)).toBe(0)
  })

  it("aucune couleur n'en coupe une autre : la couleur demandée l'emporte", () => {
    expect(trickWinner(pli('7s', 'Jh', '8s', 'Jd'), 'ta')).toBe(2)
  })

  it('on doit monter dans la couleur demandée quand on le peut', () => {
    const main: Card[] = ['9s', '7s', 'Ah']
    // L'adversaire (siège 0) mène avec l'as : le 9 le bat, le 7 non.
    expect(playableCards(main, pli('As'), 'ta', 1)).toEqual(['9s'])
  })

  it('les points : 38 par couleur, 152 en tout', () => {
    expect(DECK.reduce((s, c) => s + value(c, 'ta'), 0)).toBe(152)
    expect(strength('Jh', 'ta')).toBeGreaterThan(strength('Ah', 'ta'))
  })

  it('la main se trie dans le même ordre', () => {
    expect(sortHand(['Ah', 'Jh', '9h', '10h'], 'ta')).toEqual(['Jh', '9h', 'Ah', '10h'])
  })
})

describe('les exemples de la page des règles', () => {
  // Le preneur fait X points de cartes sur 162 ; la défense fait le reste. Sa belote
  // compte pour lui dans les deux conditions.
  const reussit = (x: number, contrat: number, belote: boolean) =>
    isContractMade(x + (belote ? 20 : 0), 162 - x, contrat)
  const seuil = (contrat: number, belote: boolean) => {
    for (let x = 0; x <= 162; x++) if (reussit(x, contrat, belote)) return x
    return null
  }

  it('sans belote : 82 à 80, 90 à 90, 100 à 100', () => {
    expect([80, 90, 100].map((c) => seuil(c, false))).toEqual([82, 90, 100])
  })

  it('avec la belote : 72 à 80, 72 à 90, 80 à 100', () => {
    expect([80, 90, 100].map((c) => seuil(c, true))).toEqual([72, 72, 80])
  })
})
