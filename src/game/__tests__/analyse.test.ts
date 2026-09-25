import { describe, expect, it } from 'vitest'
import { type Card, DECK } from '../cards'
import { dealHands } from '../deal'
import type { GameEvent } from '../events'
import { newPlay, play, playableFor } from '../play'
import { DEFAULT_SEATING, type PlayerId, teamOfPlayer } from '../players'
import { pointsDesPlis, revoirDonne } from '../revue'
import { analyserDonne } from '../analyse'

function hasard(graine: number): () => number {
  let g = graine
  return () => {
    g = (g * 16807) % 2147483647
    return g / 2147483647
  }
}

/** Une donne jouée au hasard (mais selon les règles) par le moteur : 80 à pique pour Viv. */
function donneAuHasard(graine: number, valeur = 80) {
  const r = hasard(graine)
  const paquet = [...DECK]
  for (let i = paquet.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[paquet[i], paquet[j]] = [paquet[j], paquet[i]]
  }
  const mains = dealHands(paquet, 'benel', DEFAULT_SEATING) as Record<PlayerId, Card[]>
  let seq = 1
  const ev = (e: Record<string, unknown>) => ({ ...e, seq: seq++, at: 0 }) as GameEvent
  const events: GameEvent[] = [
    ev({ type: 'donne_commencee', dealNumber: 1, dealer: 'benel', cut: 3 }),
    ev({
      type: 'contrat_fixe',
      taker: 'viv',
      value: valeur,
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
  let st = newPlay('s', 'viv', DEFAULT_SEATING)
  while (st.completed.length < 8) {
    const qui =
      st.current.length === 0
        ? (st.completed.at(-1)?.winner ?? 'viv')
        : DEFAULT_SEATING[(DEFAULT_SEATING.indexOf(st.current.at(-1)!.player) + 1) % 4]
    const permis = playableFor(st, qui, restes[qui])
    const carte = permis[Math.floor(r() * permis.length)]
    const avant = st.completed.length
    events.push(
      ev({
        type: 'carte_jouee',
        player: qui,
        card: carte,
        trickNumber: avant + 1,
        position: st.current.length,
      }),
    )
    st = play(st, qui, carte, restes[qui])
    restes[qui] = restes[qui].filter((c) => c !== carte)
    if (st.completed.length > avant) {
      const pli = st.completed.at(-1)!
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
  return revoirDonne(events, 1, DEFAULT_SEATING)!
}

describe('aurait-on pu gagner ?', () => {
  it('une donne chutée mais faisable a un tournant, et la carte proposée gardait le contrat', () => {
    let vus = 0
    for (let graine = 1; graine < 400 && vus < 3; graine++) {
      const d = donneAuHasard(graine, 100)
      const faits = pointsDesPlis(d)[teamOfPlayer('viv', DEFAULT_SEATING)]
      const a = analyserDonne(d, DEFAULT_SEATING)
      expect(a.impossible).toBeUndefined()
      // On ne garde que les donnes chutées alors qu'elles étaient faisables.
      if (!a.faisable || faits >= a.requis!) continue
      vus++
      expect(a.tournant, `graine ${graine}`).toBeDefined()
      const t = a.tournant!
      expect(teamOfPlayer(t.joueur, DEFAULT_SEATING)).toBe(teamOfPlayer('viv', DEFAULT_SEATING))
      expect(t.garantiAvant).toBeGreaterThanOrEqual(a.requis!)
      expect(t.garantiApres).toBeLessThan(a.requis!)
      expect(t.mieux).not.toBe(t.carte)
    }
    expect(vus).toBeGreaterThan(0)
  }, 120_000)

  it("refuse poliment ce qu'il ne sait pas analyser", () => {
    const d = donneAuHasard(5)
    expect(analyserDonne({ ...d, blitz: true }, DEFAULT_SEATING).impossible).toMatch(/blitz/)
    expect(analyserDonne({ ...d, mains: null }, DEFAULT_SEATING).impossible).toMatch(/au bout/)
    expect(
      analyserDonne({ ...d, contrat: { ...d.contrat!, generale: true } }, DEFAULT_SEATING).impossible,
    ).toMatch(/générale/)
  })
})
