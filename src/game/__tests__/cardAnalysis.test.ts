import { describe, expect, it } from 'vitest'
import { type Card, DECK } from '../cards'
import { dealHands } from '../deal'
import type { GameEvent } from '../events'
import { newPlay, play, playableFor } from '../play'
import { DEFAULT_SEATING, type PlayerId, seatOf } from '../players'
import { reviewDeal } from '../review'
import { analyzeCards, impossibleCards, random, drawDistribution } from '../cardAnalysis'

/** Une donne jouée au hasard selon les règles, par le moteur. */
function randomDeal(seed: number, trump: 's' | 'h' = 's') {
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
      value: 80,
      trump,
      declaration: trump,
      multiplier: 1,
      capot: false,
      generale: false,
    }),
  ]
  const handsLeft: Record<PlayerId, Card[]> = Object.fromEntries(
    Object.entries(hands).map(([p, m]) => [p, [...m]]),
  )
  let st = newPlay(trump, 'viv', DEFAULT_SEATING)
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

describe('ce que chacun sait des autres', () => {
  it('les cartes jugées impossibles ne sont jamais dans la vraie main, sur 300 donnes', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const d = randomDeal(seed, seed % 2 ? 's' : 'h')
      const tricks = d.tricks.map((p) =>
        p.cards.map((c) => ({ seat: seatOf(c.player, DEFAULT_SEATING), card: c.card })),
      )
      // Après chaque pli : ce qui reste en main ne contredit jamais les déductions.
      for (let k = 1; k <= 8; k++) {
        const forbidden = impossibleCards(tricks.slice(0, k), d.contract!.declaration as 's' | 'h')
        const fallenCards = new Set(
          tricks
            .slice(0, k)
            .flat()
            .map((x) => x.card),
        )
        for (const p of DEFAULT_SEATING) {
          const s = seatOf(p, DEFAULT_SEATING)
          const remainingSlots = d.hands![p].filter((c) => !fallenCards.has(c))
          for (const c of remainingSlots)
            expect(forbidden[s].has(c), `graine ${seed}, pli ${k}, ${p} a ${c}`).toBe(false)
        }
      }
    }
  })

  it('un tirage respecte le nombre de cartes de chacun et les cartes impossibles', () => {
    const r = random(3)
    const unknownCards = DECK.slice(0, 12)
    const forbidden = [new Set<Card>(), new Set<Card>(DECK.slice(0, 8)), new Set<Card>(), new Set<Card>()]
    for (let i = 0; i < 50; i++) {
      const t = drawDistribution(unknownCards, [0, 4, 4, 4], forbidden, [1, 2, 3], r)!
      expect(t[1]).toHaveLength(4)
      expect(t[2]).toHaveLength(4)
      expect(t[3]).toHaveLength(4)
      for (const c of t[1]) expect(forbidden[1].has(c)).toBe(false)
    }
  })
})

describe('chaque carte jugée', () => {
  it("juge toutes les cartes d'une donne, et mesure le temps", () => {
    const d = randomDeal(11)
    for (const n of [8, 20]) {
      const start = Date.now()
      const judged = analyzeCards(d, DEFAULT_SEATING, { samples: n, seed: 5 })
      console.log(
        `${n} tirages par carte : ${Date.now() - start} ms ; ` +
          judged
            .map((j) => `${j.card}:${j.quality}${j.oddsLoss ? `(-${j.oddsLoss.toFixed(0)}%)` : ''}`)
            .join(' '),
      )
      expect(judged).toHaveLength(32)
      for (const j of judged) {
        expect(j.oddsLoss).toBeGreaterThanOrEqual(0)
        expect(j.pointsLoss).toBeGreaterThanOrEqual(0)
        if (j.quality === 'forced') expect(j.options).toEqual([])
        else {
          expect(j.oddsAfter).toBeGreaterThanOrEqual(0)
          expect(j.oddsAfter).toBeLessThanOrEqual(100)
          expect(j.options.map((o) => o.card)).toContain(j.card)
        }
      }
    }
  }, 600_000)

  it('découpé en morceaux (un par fil de calcul), le résultat est identique', () => {
    const d = randomDeal(23)
    const whole = analyzeCards(d, DEFAULT_SEATING, { samples: 4, seed: 9 })
    const pairs = analyzeCards(d, DEFAULT_SEATING, {
      samples: 4,
      seed: 9,
      only: [...Array(32).keys()].filter((i) => i % 2 === 0),
    })
    const odds = analyzeCards(d, DEFAULT_SEATING, {
      samples: 4,
      seed: 9,
      only: [...Array(32).keys()].filter((i) => i % 2 === 1),
    })
    const rejoined = [...pairs, ...odds].sort(
      (a, b) =>
        a.trick - b.trick ||
        whole.indexOf(whole.find((x) => x.card === a.card)!) -
          whole.indexOf(whole.find((x) => x.card === b.card)!),
    )
    expect(rejoined).toEqual(whole)
  }, 300_000)
})
