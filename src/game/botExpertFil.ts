/**
 * Le bot ★ réfléchit dans un fil à part : le solveur prend une à deux secondes, qui
 * figeraient sinon l'écran du joueur qui héberge les bots. Hors navigateur (tests,
 * scripts), il réfléchit sur place. En cas de souci, le bot de base prend le relais.
 */
import type { Card } from './cards'
import { chooseCard } from './bot'
import { type OptionsExpert, type VueExpert, choisirCarteExpert } from './botExpert'

/** Au-delà, on n'attend plus le fil : le bot de base joue. */
const DELAI_MAX_MS = 8000

let fil: Worker | null = null
let prochain = 0
const attentes = new Map<number, (carte: Card | null) => void>()

function ouvrir(): Worker {
  const f = new Worker(new URL('./botExpert.worker.ts', import.meta.url), { type: 'module' })
  f.onmessage = (e: MessageEvent<{ id: number; carte: Card }>) => {
    attentes.get(e.data.id)?.(e.data.carte)
    attentes.delete(e.data.id)
  }
  f.onerror = () => {
    // Le fil a planté : chacun retombe sur le bot de base, et on en rouvrira un.
    for (const fin of attentes.values()) fin(null)
    attentes.clear()
    f.terminate()
    fil = null
  }
  return f
}

export function carteExpert(vue: VueExpert, permis: Card[], options: OptionsExpert = {}): Promise<Card> {
  if (typeof Worker === 'undefined') return Promise.resolve(choisirCarteExpert(vue, permis, options))
  return new Promise((resolve) => {
    const id = prochain++
    const minuterie = setTimeout(() => {
      attentes.delete(id)
      resolve(chooseCard(vue, permis))
    }, DELAI_MAX_MS)
    attentes.set(id, (carte) => {
      clearTimeout(minuterie)
      // La carte doit être permise : sinon, le bot de base.
      resolve(carte && permis.includes(carte) ? carte : chooseCard(vue, permis))
    })
    try {
      fil ??= ouvrir()
      // Copie simple : les objets réactifs de Vue ne passent pas d'un fil à l'autre.
      fil.postMessage(JSON.parse(JSON.stringify({ id, vue, permis, options })))
    } catch {
      attentes.get(id)?.(null)
      attentes.delete(id)
    }
  })
}
