import { describe, expect, it } from 'vitest'
import { type Card, DECK, sortHand } from '../cards'
import { dealHands } from '../deal'
import type { GameEvent } from '../events'
import { newPlay, play, playableFor } from '../play'
import { DEFAULT_SEATING, type PlayerId } from '../players'
import { evenementsDeLaDonne, pointsDesPlis, revoirDonne } from '../revue'

/** Une donne jouée d'un bout à l'autre avec le vrai moteur, telle que le journal la garde. */
function donneJouee(numero: number, seq0: number): { events: GameEvent[]; mains: Record<PlayerId, Card[]> } {
  const mains = dealHands([...DECK], 'benel', DEFAULT_SEATING) as Record<PlayerId, Card[]>
  let seq = seq0
  const ev = (e: Record<string, unknown>) => ({ ...e, seq: seq++, at: 0 }) as GameEvent
  const events: GameEvent[] = [
    ev({ type: 'donne_commencee', dealNumber: numero, dealer: 'benel', cut: 3 }),
    ev({
      type: 'contrat_fixe',
      taker: 'viv',
      value: 80,
      trump: 's',
      declaration: 's',
      multiplier: 1,
      capot: false,
      generale: false,
    }),
  ]
  const restes: Record<PlayerId, Card[]> = Object.fromEntries(
    Object.entries(mains).map(([p, m]) => [p, [...m]]),
  )
  let etat = newPlay('s', 'viv', DEFAULT_SEATING)
  while (etat.completed.length < 8) {
    const qui =
      etat.current.length === 0
        ? (etat.completed.at(-1)?.winner ?? 'viv')
        : DEFAULT_SEATING[(DEFAULT_SEATING.indexOf(etat.current.at(-1)!.player) + 1) % 4]
    const carte = playableFor(etat, qui, restes[qui])[0]
    const avant = etat.completed.length
    events.push(
      ev({
        type: 'carte_jouee',
        player: qui,
        card: carte,
        trickNumber: avant + 1,
        position: etat.current.length,
      }),
    )
    etat = play(etat, qui, carte, restes[qui])
    restes[qui] = restes[qui].filter((c) => c !== carte)
    if (etat.completed.length > avant) {
      const pli = etat.completed.at(-1)!
      events.push(
        ev({
          type: 'pli_termine',
          trickNumber: avant + 1,
          winner: pli.winner,
          cards: pli.plays.map((p) => p.card),
          points: pli.points,
          cut: false,
          overcut: false,
        }),
      )
    }
  }
  return { events, mains }
}

describe('revoir une donne', () => {
  const premiere = donneJouee(1, 1)
  const seconde = donneJouee(2, 100)
  const journal = [...premiere.events, ...seconde.events]

  it("isole les événements d'une donne", () => {
    expect(evenementsDeLaDonne(journal, 1)).toEqual(premiere.events)
    expect(evenementsDeLaDonne(journal, 2)).toEqual(seconde.events)
    expect(evenementsDeLaDonne(journal, 3)).toEqual([])
  })

  it('reconstitue les mains de départ à partir des cartes jouées', () => {
    const d = revoirDonne(journal, 1, DEFAULT_SEATING)!
    for (const p of DEFAULT_SEATING) expect(d.mains![p]).toEqual(sortHand(premiere.mains[p], 's'))
  })

  it("rend les huit plis dans l'ordre, chacun avec ses quatre cartes", () => {
    const d = revoirDonne(journal, 2, DEFAULT_SEATING)!
    expect(d.plis.map((p) => p.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    for (const pli of d.plis) expect(pli.cartes).toHaveLength(4)
    expect(d.contrat).toMatchObject({ taker: 'viv', value: 80, declaration: 's' })
  })

  it('les points des plis et le dix de der font 162', () => {
    const d = revoirDonne(journal, 1, DEFAULT_SEATING)!
    const [a, b] = pointsDesPlis(d)
    expect(a + b).toBe(162)
    expect(d.der).toBe(d.plis[7].equipe)
  })

  it("une donne inachevée n'a pas encore de mains à montrer", () => {
    const coupe = premiere.events.slice(0, 10)
    const d = revoirDonne(coupe, 1, DEFAULT_SEATING)!
    expect(d.mains).toBeNull()
    expect(d.der).toBeNull()
  })
})
