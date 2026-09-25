import { describe, expect, it } from 'vitest'
import { type Card, DECK } from '../cards'
import { dealHands } from '../deal'
import type { GameEvent } from '../events'
import { newPlay, play, playableFor } from '../play'
import { DEFAULT_SEATING, type PlayerId, seatOf } from '../players'
import { revoirDonne } from '../revue'
import { analyserCartes, cartesImpossibles, hasard, tirerRepartition } from '../analyseJoueur'

/** Une donne jouée au hasard selon les règles, par le moteur. */
function donneAuHasard(graine: number, trump: 's' | 'h' = 's') {
  const r = hasard(graine)
  const paquet = [...DECK]
  for (let i = paquet.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [paquet[i], paquet[j]] = [paquet[j], paquet[i]] }
  const mains = dealHands(paquet, 'benel', DEFAULT_SEATING) as Record<PlayerId, Card[]>
  let seq = 1
  const ev = (e: Record<string, unknown>) => ({ ...e, seq: seq++, at: 0 }) as GameEvent
  const events: GameEvent[] = [
    ev({ type: 'donne_commencee', dealNumber: 1, dealer: 'benel', cut: 3 }),
    ev({ type: 'contrat_fixe', taker: 'viv', value: 80, trump, declaration: trump, multiplier: 1, capot: false, generale: false }),
  ]
  const restes: Record<PlayerId, Card[]> = Object.fromEntries(Object.entries(mains).map(([p, m]) => [p, [...m]]))
  let st = newPlay(trump, 'viv', DEFAULT_SEATING)
  while (st.completed.length < 8) {
    const qui = st.current.length === 0
      ? (st.completed.at(-1)?.winner ?? 'viv')
      : DEFAULT_SEATING[(DEFAULT_SEATING.indexOf(st.current.at(-1)!.player) + 1) % 4]
    const permis = playableFor(st, qui, restes[qui])
    const carte = permis[Math.floor(r() * permis.length)]
    const avant = st.completed.length
    events.push(ev({ type: 'carte_jouee', player: qui, card: carte, trickNumber: avant + 1, position: st.current.length }))
    st = play(st, qui, carte, restes[qui])
    restes[qui] = restes[qui].filter((c) => c !== carte)
    if (st.completed.length > avant) {
      const pli = st.completed.at(-1)!
      events.push(ev({ type: 'pli_termine', trickNumber: avant + 1, winner: pli.winner, cards: pli.plays.map((p) => p.card), points: pli.points, cut: false, overcut: false }))
    }
  }
  return revoirDonne(events, 1, DEFAULT_SEATING)!
}

describe('ce que chacun sait des autres', () => {
  it('les cartes jugées impossibles ne sont jamais dans la vraie main, sur 300 donnes', () => {
    for (let graine = 1; graine <= 300; graine++) {
      const d = donneAuHasard(graine, graine % 2 ? 's' : 'h')
      const plis = d.plis.map((p) => p.cartes.map((c) => ({ siege: seatOf(c.player, DEFAULT_SEATING), carte: c.card })))
      // Après chaque pli : ce qui reste en main ne contredit jamais les déductions.
      for (let k = 1; k <= 8; k++) {
        const interdit = cartesImpossibles(plis.slice(0, k), d.contrat!.declaration as 's' | 'h')
        const tombees = new Set(plis.slice(0, k).flat().map((x) => x.carte))
        for (const p of DEFAULT_SEATING) {
          const s = seatOf(p, DEFAULT_SEATING)
          const reste = d.mains![p].filter((c) => !tombees.has(c))
          for (const c of reste) expect(interdit[s].has(c), `graine ${graine}, pli ${k}, ${p} a ${c}`).toBe(false)
        }
      }
    }
  })

  it('un tirage respecte le nombre de cartes de chacun et les cartes impossibles', () => {
    const r = hasard(3)
    const inconnues = DECK.slice(0, 12)
    const interdit = [new Set<Card>(), new Set<Card>(DECK.slice(0, 8)), new Set<Card>(), new Set<Card>()]
    for (let i = 0; i < 50; i++) {
      const t = tirerRepartition(inconnues, [0, 4, 4, 4], interdit, [1, 2, 3], r)!
      expect(t[1]).toHaveLength(4)
      expect(t[2]).toHaveLength(4)
      expect(t[3]).toHaveLength(4)
      for (const c of t[1]) expect(interdit[1].has(c)).toBe(false)
    }
  })
})

describe('chaque carte jugée', () => {
  it("juge toutes les cartes d'une donne, et mesure le temps", () => {
    const d = donneAuHasard(11)
    for (const n of [8, 20]) {
      const debut = Date.now()
      const jugees = analyserCartes(d, DEFAULT_SEATING, { echantillons: n, graine: 5 })
      console.log(`${n} tirages par carte : ${Date.now() - debut} ms ; ` +
        jugees.map((j) => `${j.carte}:${j.qualite}${j.perteChances ? `(-${j.perteChances.toFixed(0)}%)` : ''}`).join(' '))
      expect(jugees).toHaveLength(32)
      for (const j of jugees) {
        expect(j.perteChances).toBeGreaterThanOrEqual(0)
        expect(j.pertePoints).toBeGreaterThanOrEqual(0)
        if (j.qualite === 'forcee') expect(j.options).toEqual([])
        else {
          expect(j.chancesApres).toBeGreaterThanOrEqual(0)
          expect(j.chancesApres).toBeLessThanOrEqual(100)
          expect(j.options.map((o) => o.carte)).toContain(j.carte)
        }
      }
    }
  }, 600_000)

  it('découpé en morceaux (un par fil de calcul), le résultat est identique', () => {
    const d = donneAuHasard(23)
    const entier = analyserCartes(d, DEFAULT_SEATING, { echantillons: 4, graine: 9 })
    const pairs = analyserCartes(d, DEFAULT_SEATING, { echantillons: 4, graine: 9, seulement: [...Array(32).keys()].filter((i) => i % 2 === 0) })
    const impairs = analyserCartes(d, DEFAULT_SEATING, { echantillons: 4, graine: 9, seulement: [...Array(32).keys()].filter((i) => i % 2 === 1) })
    const recolle = [...pairs, ...impairs].sort((a, b) => a.pli - b.pli || entier.indexOf(entier.find((x) => x.carte === a.carte)!) - entier.indexOf(entier.find((x) => x.carte === b.carte)!))
    expect(recolle).toEqual(entier)
  }, 300_000)
})
