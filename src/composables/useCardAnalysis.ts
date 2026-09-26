/**
 * L'analyse carte par carte d'une donne, répartie entre plusieurs fils : un par cœur du
 * processeur (un de laissé libre pour la page), dans la limite de six. Les cartes sont
 * distribuées une sur N, pour que chaque fil ait sa part des premières, les plus longues.
 */
import { onBeforeUnmount, ref } from 'vue'
import type { JudgedCard } from '../game/cardAnalysis'
import type { ReviewedDeal } from '../game/review'
import type { Seating } from '../game/players'

/** Tirages par carte : assez pour que le jugement ne soit pas du bruit. */
export const SAMPLES = 40

export function useCardAnalysis() {
  const judged = ref<JudgedCard[] | null>(null)
  const pendingAction = ref(false)
  const done = ref(0)
  const total = ref(0)
  const error = ref<string | null>(null)
  let workers: Worker[] = []

  function halt(): void {
    for (const f of workers) f.terminate()
    workers = []
  }
  onBeforeUnmount(halt)

  function launch(deal: ReviewedDeal, seating: Seating): Promise<JudgedCard[] | null> {
    if (pendingAction.value) return Promise.resolve(null)
    return new Promise((finished) => {
      halt()
      pendingAction.value = true
      error.value = null
      judged.value = null
      const cardCount = deal.tricks.reduce((n, p) => n + p.cards.length, 0)
      total.value = cardCount
      done.value = 0
      const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1))
      const outcomes: JudgedCard[][] = []
      const advancement = new Array<number>(n).fill(0)
      // Des objets simples : un fil ne reçoit pas les proxys réactifs de Vue.
      const raw = JSON.parse(JSON.stringify({ deal, seating })) as { deal: ReviewedDeal; seating: Seating }
      for (let i = 0; i < n; i++) {
        const only = [...Array(cardCount).keys()].filter((k) => k % n === i)
        const f = new Worker(new URL('../game/cardAnalysis.worker.ts', import.meta.url), { type: 'module' })
        workers.push(f)
        f.onmessage = (
          e: MessageEvent<{ type: 'progress'; done: number } | { type: 'done'; judged: JudgedCard[] }>,
        ) => {
          if (e.data.type === 'progress') {
            advancement[i] = e.data.done
            done.value = advancement.reduce((a, b) => a + b, 0)
            return
          }
          outcomes.push(e.data.judged)
          f.terminate()
          if (outcomes.length === n) {
            // Remises dans l'ordre de la donne : pli, puis ordre de pose.
            const order = deal.tricks.flatMap((p) => p.cards.map((c) => c.card))
            judged.value = outcomes.flat().sort((a, b) => order.indexOf(a.card) - order.indexOf(b.card))
            pendingAction.value = false
            workers = []
            finished(judged.value)
          }
        }
        f.onerror = () => {
          error.value = 'L’analyse a échoué.'
          pendingAction.value = false
          halt()
          finished(null)
        }
        f.postMessage({ ...raw, samples: SAMPLES, seed: 1, only })
      }
    })
  }

  return { judged, pendingAction, done, total, error, launch }
}
