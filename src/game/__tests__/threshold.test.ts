import { describe, expect, it } from 'vitest'
import { DECK, shuffle, type Card } from '../cards'
import { chooseBid } from '../bot'
import { apply, newBidding } from '../bidding'
import { DEFAULT_SEATING } from '../players'

/**
 * Garde-fou : un bot trop prudent rend les parties interminables.
 *
 * À 26 % de mains qui annoncent, près d'une donne sur trois partait à la poubelle
 * et une partie durait quarante donnes. La règle du dernier à parler ramène ça
 * dans des eaux jouables.
 */
describe('prudence du bot', () => {
  it("laisse moins d'une donne sur six partir à la poubelle", () => {
    let seed = 99
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
    const hands: Card[][] = []
    for (let i = 0; i < 4000; i++) hands.push(shuffle([...DECK], rnd).slice(0, 8))

    // On mesure la part de mains qui déclenchent une annonce, et à quel palier.
    // Le donneur est roux : romain parle en premier, roux en dernier.
    const start = newBidding('roux', DEFAULT_SEATING)
    const threePasses = (['romain', 'benel', 'viv'] as const).reduce(
      (e, player) => apply(e, { kind: 'pass', player }),
      start,
    )
    const taken = hands.map((m) => chooseBid(m, start, 'romain')).filter((b) => b !== null)
    const takenLast = hands.map((m) => chooseBid(m, threePasses, 'roux')).filter((b) => b !== null)
    const tiers = new Map<number, number>()
    for (const b of taken) tiers.set(b!.value, (tiers.get(b!.value) ?? 0) + 1)
    console.log(`seuil actuel : ${((taken.length / hands.length) * 100).toFixed(1)} % des mains annoncent`)
    console.log(
      '  répartition :',
      [...tiers.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([v, n]) => `${v}:${((n / hands.length) * 100).toFixed(1)}%`)
        .join(' '),
    )
    // Probabilité qu'au moins un joueur sur quatre annonce
    const p = taken.length / hands.length
    const pd = takenLast.length / hands.length
    console.log(`  dernier à parler : ${(pd * 100).toFixed(1)} % annoncent`)
    const passedOut = (1 - p) ** 3 * (1 - pd)
    console.log(`  donne blanche attendue : ${(passedOut * 100).toFixed(1)} %`)
    expect(passedOut).toBeLessThan(0.16)
  })
})
