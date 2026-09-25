import { describe, expect, it } from 'vitest'
import { type Card, DECK, shuffle } from '../cards'
import { chooseCard } from '../bot'
import { type VueExpert, choisirCarteExpert } from '../botExpert'
import { applyPlayed, currentPlayer, newPlay, playableFor, type PlayState } from '../play'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId } from '../players'

const S = DEFAULT_SEATING

/** Ce que voit un bot : sa main et la table. Les autres mains n'y entrent pas. */
const vueDe = (jeu: PlayState, moi: PlayerId, main: Card[]): VueExpert => ({
  me: moi,
  seating: S,
  hand: main,
  trump: 'h',
  taker: 'romain',
  current: jeu.current,
  completed: jeu.completed,
  contrat: { value: 90, capot: false, generale: false },
  beloteAnnoncee: null,
})

/** Joue les `n` premières cartes avec le bot de base. */
function avance(mains: Record<PlayerId, Card[]>, n: number) {
  let jeu = newPlay('h', 'romain', S)
  for (let i = 0; i < n; i++) {
    const p = currentPlayer(jeu)!
    const carte = chooseCard(vueDe(jeu, p, mains[p]), playableFor(jeu, p, mains[p]))
    mains[p] = mains[p].filter((c) => c !== carte)
    jeu = applyPlayed(jeu, p, carte)
  }
  return jeu
}

describe('le bot ★ ne voit pas le jeu des autres', () => {
  it('joue la même carte quelles que soient les vraies mains des autres', () => {
    let g = 11
    const rnd = () => (g = (g * 1103515245 + 12345) % 2147483648) / 2147483648
    const pile = shuffle([...DECK], rnd)
    const mains = Object.fromEntries(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)])) as Record<
      PlayerId,
      Card[]
    >
    const jeu = avance(mains, 5)
    const moi = currentPlayer(jeu)!

    // Une autre distribution : même main pour moi, mêmes cartes posées, mais les cartes
    // cachées des trois autres sont rebattues entre eux.
    const autres = PLAYER_IDS.filter((p) => p !== moi)
    const cachees = shuffle(
      autres.flatMap((p) => mains[p]),
      rnd,
    )
    const ailleurs = { ...mains }
    let k = 0
    for (const p of autres) {
      ailleurs[p] = cachees.slice(k, k + mains[p].length)
      k += mains[p].length
    }
    expect(autres.some((p) => ailleurs[p].join() !== mains[p].join())).toBe(true)

    const options = { echantillons: 12, budgetMs: Infinity, graine: 5 }
    const permis = playableFor(jeu, moi, mains[moi])
    const ici = choisirCarteExpert(vueDe(jeu, moi, mains[moi]), permis, options)
    const la = choisirCarteExpert(vueDe(jeu, moi, ailleurs[moi]), permis, options)
    expect(la).toBe(ici)
    expect(permis).toContain(ici)
  })

  it("sa vue n'a aucun champ pour les mains des autres", () => {
    const vue = vueDe(newPlay('h', 'romain', S), 'romain', ['Jh'])
    expect(Object.keys(vue).sort()).toEqual(
      ['beloteAnnoncee', 'completed', 'contrat', 'current', 'hand', 'me', 'seating', 'taker', 'trump'].sort(),
    )
  })
})

describe('le bot ★ joue une donne entière', () => {
  it('toujours une carte permise, huit plis', () => {
    let g = 3
    const rnd = () => (g = (g * 1103515245 + 12345) % 2147483648) / 2147483648
    const pile = shuffle([...DECK], rnd)
    const mains = Object.fromEntries(PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)])) as Record<
      PlayerId,
      Card[]
    >
    let jeu = newPlay('h', 'romain', S)
    for (let i = 0; i < 32; i++) {
      const p = currentPlayer(jeu)!
      const permis = playableFor(jeu, p, mains[p])
      const carte = choisirCarteExpert(vueDe(jeu, p, mains[p]), permis, {
        echantillons: 4,
        budgetMs: Infinity,
      })
      expect(permis).toContain(carte)
      mains[p] = mains[p].filter((c) => c !== carte)
      jeu = applyPlayed(jeu, p, carte)
    }
    expect(jeu.completed).toHaveLength(8)
  }, 60000)
})
