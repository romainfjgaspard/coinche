import { describe, expect, it } from 'vitest'
import { type Card, DECK } from '../cards'
import { dealHands } from '../deal'
import type { GameEvent } from '../events'
import { newPlay, play, playableFor } from '../play'
import { DEFAULT_SEATING, type PlayerId, teamOfPlayer } from '../players'
import { trickPoints2, reviewDeal } from '../review'
import { analyzeDeal } from '../analysis'

function random(seed: number): () => number {
  let g = seed
  return () => {
    g = (g * 16807) % 2147483647
    return g / 2147483647
  }
}

/** Une donne jouée au hasard (mais selon les règles) par le moteur : 80 à pique pour Viv. */
function randomDeal(seed: number, value = 80) {
  const r = random(seed)
  const deck = [...DECK]
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }
  const hands = dealHands(deck, 'benel', DEFAULT_SEATING) as Record<PlayerId, Card[]>
  let seq = 1
  const ev = (e: Record<string, unknown>) => ({ ...e, seq: seq++, at: 0 }) as GameEvent
  const events: GameEvent[] = [
    ev({ type: 'deal_started', dealNumber: 1, dealer: 'benel', cut: 3 }),
    ev({
      type: 'contract_set',
      taker: 'viv',
      value: value,
      trump: 's',
      declaration: 's',
      multiplier: 1,
      capot: false,
      generale: false,
    }),
  ]
  const handsLeft: Record<PlayerId, Card[]> = Object.fromEntries(
    Object.entries(hands).map(([p, m]) => [p, [...m]]),
  )
  let st = newPlay('s', 'viv', DEFAULT_SEATING)
  while (st.completed.length < 8) {
    const who =
      st.current.length === 0
        ? (st.completed.at(-1)?.winner ?? 'viv')
        : DEFAULT_SEATING[(DEFAULT_SEATING.indexOf(st.current.at(-1)!.player) + 1) % 4]
    const legal = playableFor(st, who, handsLeft[who])
    const card = legal[Math.floor(r() * legal.length)]
    const before = st.completed.length
    events.push(
      ev({
        type: 'card_played',
        player: who,
        card: card,
        trickNumber: before + 1,
        position: st.current.length,
      }),
    )
    st = play(st, who, card, handsLeft[who])
    handsLeft[who] = handsLeft[who].filter((c) => c !== card)
    if (st.completed.length > before) {
      const trick = st.completed.at(-1)!
      events.push(
        ev({
          type: 'trick_done',
          trickNumber: before + 1,
          winner: trick.winner,
          cards: trick.plays.map((p) => p.card),
          points: trick.points,
          cut: false,
          overcut: false,
        }),
      )
    }
  }
  return reviewDeal(events, 1, DEFAULT_SEATING)!
}

describe('aurait-on pu gagner ?', () => {
  it('une donne chutée mais faisable a un tournant, et la carte proposée gardait le contrat', () => {
    let seenSet = 0
    for (let seed = 1; seed < 400 && seenSet < 3; seed++) {
      const d = randomDeal(seed, 100)
      const playedTricks = trickPoints2(d)[teamOfPlayer('viv', DEFAULT_SEATING)]
      const a = analyzeDeal(d, DEFAULT_SEATING)
      expect(a.impossible).toBeUndefined()
      // On ne garde que les donnes chutées alors qu'elles étaient faisables.
      if (!a.feasible || playedTricks >= a.required!) continue
      seenSet++
      expect(a.turningPoint, `graine ${seed}`).toBeDefined()
      const t = a.turningPoint!
      expect(teamOfPlayer(t.player, DEFAULT_SEATING)).toBe(teamOfPlayer('viv', DEFAULT_SEATING))
      expect(t.guaranteedBefore).toBeGreaterThanOrEqual(a.required!)
      expect(t.guaranteedAfter).toBeLessThan(a.required!)
      expect(t.better).not.toBe(t.card)
    }
    expect(seenSet).toBeGreaterThan(0)
  }, 120_000)

  it("refuse poliment ce qu'il ne sait pas analyser", () => {
    const d = randomDeal(5)
    expect(analyzeDeal({ ...d, blitz: true }, DEFAULT_SEATING).impossible).toMatch(/blitz/)
    expect(analyzeDeal({ ...d, hands: null }, DEFAULT_SEATING).impossible).toMatch(/au bout/)
    expect(
      analyzeDeal({ ...d, contract: { ...d.contract!, generale: true } }, DEFAULT_SEATING).impossible,
    ).toMatch(/générale/)
  })
})
