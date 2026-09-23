import { describe, expect, it } from 'vitest'
import { type Card, DECK, shuffle, value } from './cards'
import { DEFAULT_SEATING, PLAYER_IDS, type PlayerId, teamOfPlayer } from './players'
import { applyPlayed, currentPlayer, newPlay, playableFor } from './play'
import { chooseCard, type BotLevel } from './bot'
import { forceMain } from './force'
import { SUITS, type Suit } from './cards'

type Strategie = (etat: ReturnType<typeof newPlay>, joueur: PlayerId, main: Card[],
                  jouables: Card[], atout: Suit, preneur: PlayerId) => Card

const singe: Strategie = (_e, _j, _m, jouables) => jouables[0]
const bot = (level: BotLevel): Strategie => (etat, joueur, main, jouables, atout, preneur) =>
  chooseCard({
    me: joueur, seating: DEFAULT_SEATING, hand: main, trump: atout,
    taker: preneur, current: etat.current, completed: etat.completed,
  }, jouables, level)

/** Joue une donne, équipe 0 avec `a`, équipe 1 avec `b`. Rend les points de pli. */
function donne(pile: Card[], atout: Suit, preneur: PlayerId, a: Strategie, b: Strategie) {
  const mains = new Map<PlayerId, Card[]>(
    PLAYER_IDS.map((p, i) => [p, pile.slice(i * 8, i * 8 + 8)]),
  )
  let etat = newPlay(atout, 'romain', DEFAULT_SEATING)
  const points: [number, number] = [0, 0]

  for (let i = 0; i < 32; i++) {
    const joueur = currentPlayer(etat)!
    const main = mains.get(joueur)!
    const jouables = playableFor(etat, joueur, main)
    const strat = teamOfPlayer(joueur, DEFAULT_SEATING) === 0 ? a : b
    const carte = strat(etat, joueur, main, jouables, atout, preneur)
    main.splice(main.indexOf(carte), 1)
    const avant = etat.completed.length
    etat = applyPlayed(etat, joueur, carte)
    if (etat.completed.length > avant) {
      const pli = etat.completed[etat.completed.length - 1]
      points[teamOfPlayer(pli.winner, DEFAULT_SEATING)] +=
        pli.plays.reduce((s, p) => s + value(p.card, atout), 0)
    }
  }
  return points
}

/**
 * Garde-fou : le bot doit rester meilleur que « la première carte légale ».
 *
 * Chaque donne est jouée deux fois, les rôles inversés, donc la chance de la
 * distribution s'annule exactement : l'écart mesuré ne vient que du jeu.
 */
describe('le bot joue mieux qu\'au hasard', () => {
  it('prend plus de la moitié des points de pli, aux deux niveaux', () => {
    let graine = 2024
    const rnd = () => ((graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648)

    for (const level of ['simple', 'compteur'] as const) {
      let pourBot = 0
      let pourSinge = 0
      const N = 200
      for (let n = 0; n < N; n++) {
        const pile = shuffle([...DECK], rnd)
        const mainDe0 = pile.slice(0, 8)
        const atout = SUITS.map((s) => ({ s, f: forceMain(mainDe0, s) }))
          .sort((x, y) => y.f - x.f)[0].s

        // équipe 0 = bot, équipe 1 = singe
        const p1 = donne([...pile], atout, 'romain', bot(level), singe)
        pourBot += p1[0]; pourSinge += p1[1]
        // on inverse les rôles sur exactement la même donne
        const p2 = donne([...pile], atout, 'romain', singe, bot(level))
        pourSinge += p2[0]; pourBot += p2[1]
      }
      const total = pourBot + pourSinge
      const part = pourBot / total
      console.log(
        `${level.padEnd(9)} · bot ${(part * 100).toFixed(1)} % des points de pli ` +
        `(${pourBot} contre ${pourSinge} sur ${N} donnes jouées deux fois)`,
      )
      expect(part).toBeGreaterThan(0.52)
    }
  })
})
