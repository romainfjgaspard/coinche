import { describe, expect, it } from 'vitest'
import type { GameEvent, NewEvent } from '../events'
import { DEFAULT_SEATING, type PlayerId } from '../players'
import { biddingFromEvents, playFromEvents } from '../replay'
import { currentBidder, outcome } from '../bidding'
import { lastRefusal, pendingUndo, undoAccepted, undoableBid, undoableCard, withoutUndone } from '../undo'
import type { Card } from '../cards'
import { currentPlayer } from '../play'

// Donneur Benel → Viv parle en premier, puis Roux, Romain, Benel.
function journal(...events: NewEvent[]): GameEvent[] {
  return [{ type: 'deal_started', dealNumber: 1, dealer: 'benel', cut: 0 } as NewEvent, ...events].map(
    (e, i) => ({ ...e, seq: i + 1, at: i }) as GameEvent,
  )
}
const bid = (player: PlayerId, value: number, suit: 's' | 'h' | 'd' | 'c'): NewEvent => ({
  type: 'bid',
  player,
  round: 1,
  entry: { kind: 'contract', player, value, suit },
})
const pass = (player: PlayerId): NewEvent => ({
  type: 'bid',
  player,
  round: 1,
  entry: { kind: 'pass', player },
})
const answer = (player: PlayerId, accept: boolean): NewEvent => ({ type: 'undo_answered', player, accept })

describe('annuler sa dernière enchère', () => {
  it('se demande tant que seules des passes ont suivi, et seulement pour soi', () => {
    const j = journal(pass('viv'), bid('roux', 120, 'h'))
    expect(undoableBid(j, 'roux')).toBe(3)
    expect(undoableBid(j, 'viv')).toBeNull()
    // Romain et Benel ont passé après : encore possible.
    expect(
      undoableBid(journal(pass('viv'), bid('roux', 120, 'h'), pass('romain'), pass('benel')), 'roux'),
    ).toBe(3)
    // Romain a surenchéri : trop tard.
    expect(
      undoableBid(journal(pass('viv'), bid('roux', 120, 'h'), bid('romain', 130, 's')), 'roux'),
    ).toBeNull()
  })

  it("accordée, l'annulation retire l'enchère et les passes qui la suivent", () => {
    const j = journal(
      pass('viv'),
      bid('roux', 120, 'h'),
      pass('romain'),
      pass('benel'),
      { type: 'undo_requested', player: 'roux', bidSeq: 3 },
      answer('romain', true),
      answer('benel', true),
      answer('viv', true),
      { type: 'bid_undone', of: 'roux', by: 'viv', bidSeq: 3 },
    )
    const state = biddingFromEvents(j, 'benel', DEFAULT_SEATING)
    expect(state.entries).toEqual([{ kind: 'pass', player: 'viv' }])
    expect(currentBidder(state)).toBe('roux')
  })

  it("plus possible après la coinche d'un autre, ni deux fois pour la même enchère", () => {
    expect(undoableBid(journal(bid('viv', 100, 's'), { type: 'coinche', player: 'roux' }), 'viv')).toBeNull()
    expect(
      undoableBid(journal(bid('viv', 100, 's'), { type: 'undo_requested', player: 'viv', bidSeq: 2 }), 'viv'),
    ).toBeNull()
  })

  it('une coinche par erreur se reprend, tant que le preneur n’a pas répondu', () => {
    // La donne 14 de DXZV : Benel 120 ♦, Viv coinche par erreur.
    const j = journal(bid('viv', 110, 's'), bid('roux', 120, 'd'), { type: 'coinche', player: 'viv' })
    expect(undoableBid(j, 'viv')).toBe(4)
    expect(undoableBid(j, 'roux')).toBeNull()
    // Une seule demande par coinche.
    expect(
      undoableBid(
        [
          ...j,
          ...journal({ type: 'undo_requested', player: 'viv', bidSeq: 4 })
            .slice(1)
            .map((e) => ({ ...e, seq: 5 })),
        ],
        'viv',
      ),
    ).toBeNull()

    const undone = journal(
      bid('viv', 110, 's'),
      bid('roux', 120, 'd'),
      { type: 'coinche', player: 'viv' },
      { type: 'undo_requested', player: 'viv', bidSeq: 4 },
      answer('roux', true),
      answer('romain', true),
      answer('benel', true),
      { type: 'bid_undone', of: 'viv', by: 'benel', bidSeq: 4 },
    )
    const state = biddingFromEvents(undone, 'benel', DEFAULT_SEATING)
    // La coinche a disparu, l'enchère de Roux tient ; la parole va au suivant, Romain.
    expect(state.entries.map((e) => e.kind)).toEqual(['contract', 'contract'])
    expect(currentBidder(state)).toBe('romain')
    expect(withoutUndone(undone).some((e) => e.type === 'coinche')).toBe(false)
  })

  it('les trois autres acceptent : la demande est complète', () => {
    const j = journal(
      bid('viv', 120, 'h'),
      { type: 'undo_requested', player: 'viv', bidSeq: 2 },
      answer('roux', true),
      answer('romain', true),
    )
    const p = pendingUndo(j)!
    expect(p).toMatchObject({ player: 'viv', bidSeq: 2 })
    expect(undoAccepted(p)).toBe(false)
    const all = pendingUndo([...j, { type: 'undo_answered', player: 'benel', accept: true, seq: 6, at: 6 }])!
    expect(undoAccepted(all)).toBe(true)
  })

  it('un seul refus fait tomber la demande, et on sait qui a refusé', () => {
    const j = journal(
      bid('viv', 120, 'h'),
      { type: 'undo_requested', player: 'viv', bidSeq: 2 },
      answer('roux', true),
      answer('romain', false),
    )
    expect(pendingUndo(j)).toBeNull()
    expect(lastRefusal(j)).toEqual({ player: 'viv', by: 'romain' })
  })

  it('le demandeur peut retirer sa demande', () => {
    const j = journal(
      bid('viv', 120, 'h'),
      { type: 'undo_requested', player: 'viv', bidSeq: 2 },
      answer('viv', false),
    )
    expect(pendingUndo(j)).toBeNull()
    expect(lastRefusal(j)).toBeNull()
  })

  it("l'enchère annulée disparaît du rejeu : la parole revient au demandeur", () => {
    const j = journal(
      pass('viv'),
      bid('roux', 120, 'h'),
      { type: 'undo_requested', player: 'roux', bidSeq: 3 },
      answer('romain', true),
      answer('benel', true),
      answer('viv', true),
      { type: 'bid_undone', of: 'roux', by: 'viv', bidSeq: 3 },
    )
    const state = biddingFromEvents(j, 'benel', DEFAULT_SEATING)
    expect(state.entries).toEqual([{ kind: 'pass', player: 'viv' }])
    expect(currentBidder(state)).toBe('roux')
    expect(pendingUndo(j)).toBeNull()
    // Retirer deux fois ne retire rien de plus : le store et le moteur le font chacun.
    expect(withoutUndone(withoutUndone(j))).toEqual(withoutUndone(j))
    // Et la donne continue normalement : Roux annonce enfin à carreau.
    const next = biddingFromEvents(
      [...j, ...journal(bid('roux', 120, 'd'), pass('romain'), pass('benel'), pass('viv')).slice(1)].map(
        (e, i) => ({ ...e, seq: i + 1 }),
      ),
      'benel',
      DEFAULT_SEATING,
    )
    expect(outcome(next)).toMatchObject({ status: 'contract', taker: 'roux', trump: 'd', value: 120 })
  })
})

describe('annuler sa dernière carte', () => {
  // Viv prend à 80 ♠ ; Viv entame, puis Roux, Romain, Benel.
  const contract = (): NewEvent[] => [
    bid('viv', 80, 's'),
    pass('roux'),
    pass('romain'),
    pass('benel'),
    {
      type: 'contract_set',
      taker: 'viv',
      value: 80,
      trump: 's',
      multiplier: 1,
      capot: false,
      generale: false,
    },
  ]
  const card = (player: PlayerId, c: Card, trickNumber = 1, position = 0): NewEvent => ({
    type: 'card_played',
    player,
    card: c,
    trickNumber,
    position,
  })
  // Seq : 1 distribution, 2-5 enchères, 6 contrat — la première carte porte le numéro 7.
  const play = (j: GameEvent[]) => playFromEvents(j, 'benel', DEFAULT_SEATING)!

  it('se demande pour sa propre carte, tant que le suivant n’a pas joué', () => {
    const j = journal(...contract(), card('viv', '7h'))
    expect(undoableCard(j, 'viv')).toBe(7)
    expect(undoableCard(j, 'roux')).toBeNull()
    expect(undoableCard(journal(...contract(), card('viv', '7h'), card('roux', '8h')), 'viv')).toBeNull()
    // Avant toute carte, rien à reprendre.
    expect(undoableCard(journal(...contract()), 'viv')).toBeNull()
  })

  it('accordée, la carte quitte le tapis et c’est de nouveau à son joueur', () => {
    const j = journal(
      ...contract(),
      card('viv', '7h'),
      card('roux', '8h', 1, 1),
      { type: 'undo_requested', player: 'roux', bidSeq: 8 },
      answer('romain', true),
      answer('benel', true),
      answer('viv', true),
      { type: 'card_undone', of: 'roux', by: 'viv', cardSeq: 8, card: '8h' },
    )
    expect(pendingUndo(j)).toBeNull()
    const state = play(j)
    expect(state.current.map((p) => p.card)).toEqual(['7h'])
    expect(currentPlayer(state)).toBe('roux')
    // Pas de seconde chance derrière : ni Roux sur la même carte, ni Viv sur la sienne.
    expect(undoableCard(j, 'viv')).toBeNull()
  })

  it('la quatrième carte d’un pli se reprend : le pli se rouvre', () => {
    const j = journal(
      ...contract(),
      card('viv', '7h'),
      card('roux', '8h', 1, 1),
      card('romain', '9h', 1, 2),
      card('benel', 'Ah', 1, 3),
      {
        type: 'trick_done',
        trickNumber: 1,
        winner: 'benel',
        cards: ['7h', '8h', '9h', 'Ah'],
        points: 11,
        cut: false,
        overcut: false,
      },
    )
    expect(undoableCard(j, 'benel')).toBe(10)
    const undone = [
      ...j,
      ...journal({ type: 'card_undone', of: 'benel', by: 'viv', cardSeq: 10, card: 'Ah' })
        .slice(1)
        .map((e) => ({ ...e, seq: 12 })),
    ]
    const state = play(undone)
    expect(state.completed).toHaveLength(0)
    expect(state.current).toHaveLength(3)
    expect(currentPlayer(state)).toBe('benel')
    expect(withoutUndone(undone).some((e) => e.type === 'trick_done')).toBe(false)
  })

  it('la belote annoncée avec la carte tombe avec elle', () => {
    const j = journal(
      ...contract(),
      card('viv', 'Ks'),
      { type: 'belote_declared', player: 'viv', half: 'belote' },
      { type: 'card_undone', of: 'viv', by: 'roux', cardSeq: 7, card: 'Ks' },
    )
    expect(withoutUndone(j).some((e) => e.type === 'belote_declared')).toBe(false)
  })

  it('pas la dernière carte de la donne : le décompte est fait', () => {
    const tricks = Array.from({ length: 8 }, (_, i): NewEvent => ({
      type: 'trick_done',
      trickNumber: i + 1,
      winner: 'viv',
      cards: [],
      points: 0,
      cut: false,
      overcut: false,
    }))
    expect(undoableCard(journal(...contract(), ...tricks, card('benel', 'Ah')), 'benel')).toBeNull()
  })

  it('un refus devient caduc dès que la partie reprend', () => {
    const j = journal(
      ...contract(),
      card('viv', '7h'),
      { type: 'undo_requested', player: 'viv', bidSeq: 7 },
      answer('roux', false),
    )
    expect(lastRefusal(j)).toEqual({ player: 'viv', by: 'roux' })
    expect(lastRefusal([...j, { ...card('roux', '8h', 1, 1), seq: 10, at: 10 } as GameEvent])).toBeNull()
  })
})
