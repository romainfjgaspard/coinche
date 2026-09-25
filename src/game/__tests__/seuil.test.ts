import { describe, expect, it } from 'vitest'
import { DECK, shuffle, type Card } from '../cards'
import { chooseBid } from '../bot'

/**
 * Garde-fou : un bot trop prudent rend les parties interminables.
 *
 * À 26 % de mains qui annoncent, près d'une donne sur trois partait à la poubelle
 * et une partie durait quarante donnes. La règle du dernier à parler ramène ça
 * dans des eaux jouables.
 */
describe('prudence du bot', () => {
  it("laisse moins d'une donne sur six partir à la poubelle", () => {
    let graine = 99
    const rnd = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648
    const mains: Card[][] = []
    for (let i = 0; i < 4000; i++) mains.push(shuffle([...DECK], rnd).slice(0, 8))

    // On mesure la part de mains qui déclenchent une annonce, et à quel palier.
    const pris = mains.map((m) => chooseBid(m, 0, false)).filter((b) => b !== null)
    const prisDernier = mains.map((m) => chooseBid(m, 0, false, true)).filter((b) => b !== null)
    const paliers = new Map<number, number>()
    for (const b of pris) paliers.set(b!.value, (paliers.get(b!.value) ?? 0) + 1)
    console.log(`seuil actuel : ${((pris.length / mains.length) * 100).toFixed(1)} % des mains annoncent`)
    console.log(
      '  répartition :',
      [...paliers.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([v, n]) => `${v}:${((n / mains.length) * 100).toFixed(1)}%`)
        .join(' '),
    )
    // Probabilité qu'au moins un joueur sur quatre annonce
    const p = pris.length / mains.length
    const pd = prisDernier.length / mains.length
    console.log(`  dernier à parler : ${(pd * 100).toFixed(1)} % annoncent`)
    const blanche = (1 - p) ** 3 * (1 - pd)
    console.log(`  donne blanche attendue : ${(blanche * 100).toFixed(1)} %`)
    expect(blanche).toBeLessThan(0.16)
  })
})
