import { describe, expect, it } from 'vitest'
import type { GameEvent, NewEvent } from '../events'
import { DEFAULT_SEATING, type PlayerId } from '../players'
import { biddingFromEvents } from '../replay'
import { currentBidder, outcome } from '../bidding'
import { lastRefusal, pendingUndo, undoAccepted, undoableBid, withoutUndoneBids } from '../undo'

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
  it("se demande tant que le suivant n'a pas parlé, et seulement pour soi", () => {
    const j = journal(pass('viv'), bid('roux', 120, 'h'))
    expect(undoableBid(j, 'roux')).toBe(3)
    expect(undoableBid(j, 'viv')).toBeNull()
    const later = journal(pass('viv'), bid('roux', 120, 'h'), pass('romain'))
    expect(undoableBid(later, 'roux')).toBeNull()
  })

  it('plus possible après une coinche, ni deux fois pour la même enchère', () => {
    expect(undoableBid(journal(bid('viv', 100, 's'), { type: 'coinche', player: 'roux' }), 'viv')).toBeNull()
    expect(
      undoableBid(journal(bid('viv', 100, 's'), { type: 'undo_requested', player: 'viv', bidSeq: 2 }), 'viv'),
    ).toBeNull()
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
    expect(withoutUndoneBids(withoutUndoneBids(j))).toEqual(withoutUndoneBids(j))
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
