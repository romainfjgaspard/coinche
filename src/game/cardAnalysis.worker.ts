/**
 * Un fil de l'analyse carte par carte : il juge les cartes qu'on lui confie et dit où il
 * en est. Plusieurs fils se partagent une donne (voir `useCardAnalysis`).
 */
import { analyzeCards } from './cardAnalysis'
import type { ReviewedDeal } from './review'
import type { Seating } from './players'

interface Request {
  deal: ReviewedDeal
  seating: Seating
  samples: number
  seed: number
  only: number[]
}

const worker = self as unknown as {
  onmessage: ((e: MessageEvent<Request>) => void) | null
  postMessage: (message: unknown) => void
}

worker.onmessage = (e) => {
  const { deal, seating, samples, seed, only } = e.data
  const judged = analyzeCards(deal, seating, {
    samples,
    seed,
    only,
    onProgress: (done) => worker.postMessage({ type: 'progress', done }),
  })
  worker.postMessage({ type: 'done', judged })
}
