import { describe, expect, it } from 'vitest'
import { DEFAULT_SEATING } from '../players'
import {
  type BiddingEntry, IllegalBid, apply, canBidCapot, canBidGenerale, canCoinche, canSurcoinche, currentBidder,
  firstLeader, legalValues, multiplier, newBidding, outcome, taker,
} from '../bidding'

// Sièges dans le sens du jeu : romain(0) · benel(1) · viv(2) · roux(3).
// Donneur Benel → Viv parle en premier, puis Roux, Romain, Benel.
const start = () => newBidding('benel', DEFAULT_SEATING)
const run = (...entries: BiddingEntry[]) => entries.reduce((s, e) => apply(s, e), start())

const passe = (player: 'benel' | 'roux' | 'viv' | 'romain'): BiddingEntry => ({ kind: 'passe', player })

describe('ENC-1 — ordre de parole', () => {
  it('le joueur à gauche du donneur parle en premier', () => {
    expect(currentBidder(start())).toBe('viv')
  })

  it('puis on tourne dans le sens du jeu', () => {
    expect(currentBidder(run(passe('viv')))).toBe('roux')
    expect(currentBidder(run(passe('viv'), passe('roux')))).toBe('romain')
    expect(currentBidder(run(passe('viv'), passe('roux'), passe('romain')))).toBe('benel')
  })

  it('refuse une prise de parole hors tour', () => {
    expect(() => apply(start(), passe('roux'))).toThrow(IllegalBid)
  })
})

describe('ENC-3 / ENC-4 — paliers et surenchère', () => {
  it('ouvre à 80 et monte de 10 en 10 jusqu\'à 160', () => {
    expect(legalValues(start())).toEqual([80, 90, 100, 110, 120, 130, 140, 150, 160])
  })

  it('n\'autorise plus que le dessus d\'une enchère existante', () => {
    const s = run({ kind: 'contrat', player: 'viv', value: 90, suit: 'h' })
    expect(legalValues(s)).toEqual([100, 110, 120, 130, 140, 150, 160])
  })

  it('refuse une enchère égale ou inférieure', () => {
    const s = run({ kind: 'contrat', player: 'viv', value: 90, suit: 'h' })
    expect(() => apply(s, { kind: 'contrat', player: 'roux', value: 90, suit: 's' })).toThrow(IllegalBid)
    expect(() => apply(s, { kind: 'contrat', player: 'roux', value: 80, suit: 's' })).toThrow(IllegalBid)
  })
})

describe('ENC-5 — reparler après avoir passé', () => {
  it('un joueur qui a passé peut annoncer au tour suivant', () => {
    const s = run(
      passe('viv'),
      { kind: 'contrat', player: 'roux', value: 80, suit: 'h' },
      passe('romain'),
      passe('benel'),
    )
    expect(currentBidder(s)).toBe('viv')
    const after = apply(s, { kind: 'contrat', player: 'viv', value: 90, suit: 's' })
    expect(taker(after)).toBe('viv')
  })
})

describe('ENC-6 / ENC-7 — fin des enchères', () => {
  it('trois passes après une enchère closent les enchères', () => {
    const s = run(
      { kind: 'contrat', player: 'viv', value: 100, suit: 'h' },
      passe('roux'), passe('romain'),
    )
    expect(outcome(s).status).toBe('en_cours')
    const closed = apply(s, passe('benel'))
    expect(outcome(closed)).toMatchObject({ status: 'contrat', taker: 'viv', value: 100, trump: 'h' })
    expect(currentBidder(closed)).toBeNull()
  })

  it('quatre passes d\'emblée donnent une donne blanche', () => {
    const s = run(passe('viv'), passe('roux'), passe('romain'), passe('benel'))
    expect(outcome(s).status).toBe('donne_blanche')
  })
})

describe('ENC-8 / ENC-9 / ENC-10 — capot, générale, sans-atout', () => {
  it('le capot passe au-dessus de tout contrat chiffré et vaut 250', () => {
    const s = run(
      { kind: 'contrat', player: 'viv', value: 160, suit: 'h' },
      { kind: 'capot', player: 'roux', declaration: 's' },
      passe('romain'), passe('benel'), passe('viv'),
    )
    expect(outcome(s)).toMatchObject({ status: 'contrat', taker: 'roux', value: 250, capot: true })
  })

  it('plus aucun contrat chiffré au-dessus d\'un capot', () => {
    const s = run({ kind: 'capot', player: 'viv', declaration: 'h' })
    expect(legalValues(s)).toEqual([])
  })

  it('la générale domine le capot, mais pas l\'inverse', () => {
    const s = run({ kind: 'capot', player: 'viv', declaration: 'h' })
    const g = apply(s, { kind: 'generale', player: 'roux', declaration: 's' })
    expect(taker(g)).toBe('roux')
    expect(() => apply(g, { kind: 'capot', player: 'romain', declaration: 'd' })).toThrow(IllegalBid)
  })

  it('sans-atout et tout-atout se jouent en capot, sans couleur d\'atout', () => {
    const s = run(
      { kind: 'capot', player: 'viv', declaration: 'sa' },
      passe('roux'), passe('romain'), passe('benel'),
    )
    expect(outcome(s)).toMatchObject({ status: 'contrat', declaration: 'sa', trump: null, capot: true })
  })
})

describe('CO-1 à CO-3 — coinche', () => {
  const taken = () => run({ kind: 'contrat', player: 'viv', value: 100, suit: 'h' })

  it('seul un adversaire du preneur peut coincher', () => {
    expect(canCoinche(taken(), 'roux')).toBe(true)   // adversaire
    expect(canCoinche(taken(), 'benel')).toBe(true)  // adversaire
    expect(canCoinche(taken(), 'romain')).toBe(false) // partenaire de Viv
    expect(canCoinche(taken(), 'viv')).toBe(false)    // preneur
  })

  it('CO-3 — la coinche se prend à la volée, hors de son tour', () => {
    // C'est à Roux de parler ; Benel coinche quand même.
    expect(currentBidder(taken())).toBe('roux')
    const s = apply(taken(), { kind: 'coinche', player: 'benel' })
    expect(multiplier(s)).toBe(2)
  })

  it('seul le camp du preneur peut surcoincher, et l\'enjeu est quadruplé', () => {
    const s = apply(taken(), { kind: 'coinche', player: 'roux' })
    expect(canSurcoinche(s, 'romain')).toBe(true) // partenaire du preneur
    expect(canSurcoinche(s, 'benel')).toBe(false)
    const sur = apply(s, { kind: 'surcoinche', player: 'romain' })
    expect(multiplier(sur)).toBe(4)
    expect(outcome(sur)).toMatchObject({ status: 'contrat', multiplier: 4, taker: 'viv' })
  })

  it('après une coinche, plus personne ne surenchérit', () => {
    const s = apply(taken(), { kind: 'coinche', player: 'roux' })
    expect(() => apply(s, { kind: 'contrat', player: 'benel', value: 110, suit: 's' })).toThrow(IllegalBid)
  })

  it('CO-5 — même le preneur, à qui revient la parole, ne peut que passer ou surcoincher', () => {
    const s = apply(taken(), { kind: 'coinche', player: 'roux' })
    expect(currentBidder(s)).toBe('viv')
    expect(legalValues(s)).toEqual([])
    expect(canBidCapot(s)).toBe(false)
    expect(canBidGenerale(s)).toBe(false)
    expect(() => apply(s, { kind: 'contrat', player: 'viv', value: 110, suit: 'h' })).toThrow(IllegalBid)
    expect(() => apply(s, { kind: 'capot', player: 'viv', declaration: 'h' })).toThrow(IllegalBid)
    expect(() => apply(s, { kind: 'generale', player: 'viv', declaration: 'ta' })).toThrow(IllegalBid)
  })

  it('le preneur peut laisser passer la coinche : l\'enjeu reste doublé', () => {
    const s = apply(taken(), { kind: 'coinche', player: 'roux' })
    expect(currentBidder(s)).toBe('viv')
    const closed = apply(s, passe('viv'))
    expect(outcome(closed)).toMatchObject({ status: 'contrat', multiplier: 2 })
  })
})

describe('JEU-1 / ENC-9 — qui entame', () => {
  it('normalement le joueur à gauche du donneur', () => {
    const s = run(
      passe('viv'),
      { kind: 'contrat', player: 'roux', value: 90, suit: 'h' },
      passe('romain'), passe('benel'), passe('viv'),
    )
    expect(firstLeader(s)).toBe('viv')
  })

  it('mais sur une générale, le preneur prend la main', () => {
    const s = run(
      passe('viv'),
      { kind: 'generale', player: 'roux', declaration: 'h' },
      passe('romain'), passe('benel'), passe('viv'),
    )
    expect(firstLeader(s)).toBe('roux')
  })
})
