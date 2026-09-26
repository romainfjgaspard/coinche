/**
 * Le bot ★ réfléchit dans un fil à part : le solveur prend une à deux secondes, qui
 * figeraient sinon l'écran du joueur qui héberge les bots. Hors navigateur (tests,
 * scripts), il réfléchit sur place. En cas de souci, le bot de base prend le relais.
 */
import type { Card } from './cards'
import { chooseCard } from './bot'
import { type ExpertOptions, type ExpertView, chooseExpertCard } from './botExpert'

/** Au-delà, on n'attend plus le fil : le bot de base joue. */
const MAX_DELAY_MS = 8000

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, (card: Card | null) => void>()

function open(): Worker {
  const f = new Worker(new URL('./botExpert.worker.ts', import.meta.url), { type: 'module' })
  f.onmessage = (e: MessageEvent<{ id: number; card: Card }>) => {
    pending.get(e.data.id)?.(e.data.card)
    pending.delete(e.data.id)
  }
  f.onerror = () => {
    // Le fil a planté : chacun retombe sur le bot de base, et on en rouvrira un.
    for (const end of pending.values()) end(null)
    pending.clear()
    f.terminate()
    worker = null
  }
  return f
}

export function expertCard(view: ExpertView, legal: Card[], options: ExpertOptions = {}): Promise<Card> {
  if (typeof Worker === 'undefined') return Promise.resolve(chooseExpertCard(view, legal, options))
  return new Promise((resolve) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(chooseCard(view, legal))
    }, MAX_DELAY_MS)
    pending.set(id, (card) => {
      clearTimeout(timer)
      // La carte doit être permise : sinon, le bot de base.
      resolve(card && legal.includes(card) ? card : chooseCard(view, legal))
    })
    try {
      worker ??= open()
      // Copie simple : les objets réactifs de Vue ne passent pas d'un fil à l'autre.
      worker.postMessage(JSON.parse(JSON.stringify({ id, view, legal, options })))
    } catch {
      pending.get(id)?.(null)
      pending.delete(id)
    }
  })
}
